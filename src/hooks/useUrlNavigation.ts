import { useCallback, useMemo, type SetStateAction } from "react";
import { useLocation, useNavigate } from "react-router-dom";

type ParamsUpdate = URLSearchParams | ((current: URLSearchParams) => URLSearchParams);

/** Keep screen navigation in the router, including its history index and key. */
export function useUrlNavigation() {
  const location = useLocation();
  const navigate = useNavigate();
  const params = useMemo(() => new URLSearchParams(location.search), [location.search]);
  const updateParams = useCallback((update: ParamsUpdate, options: { replace?: boolean; state?: unknown } = {}) => {
    const current = new URLSearchParams(location.search);
    const previousSearch = current.toString();
    const next = typeof update === "function" ? update(current) : update;
    const search = next.toString();
    if (search === previousSearch && !Object.prototype.hasOwnProperty.call(options, "state")) return;
    navigate({ pathname: location.pathname, search: search ? `?${search}` : "", hash: location.hash }, {
      replace: options.replace ?? false,
      state: Object.prototype.hasOwnProperty.call(options, "state") ? options.state : location.state,
    });
  }, [location.pathname, location.search, location.hash, location.state, navigate]);
  return { params, updateParams };
}

/** Navigable section or filter. Defaults are omitted; invalid deep links use the default. */
export function useUrlQueryState<T extends string>(
  key: string,
  defaultValue: T,
  allowedValues?: readonly T[],
  options: { replace?: boolean; clear?: readonly string[] } = {},
) {
  const { params, updateParams } = useUrlNavigation();
  const raw = params.get(key);
  const value = raw !== null && (!allowedValues || allowedValues.includes(raw as T)) ? raw as T : defaultValue;
  const setValue = useCallback((action: SetStateAction<T>) => {
    const nextValue = typeof action === "function" ? action(value) : action;
    if (allowedValues && !allowedValues.includes(nextValue)) return;
    if (nextValue === value && !options.clear?.some(name => params.has(name))) return;
    updateParams((current) => {
      const next = new URLSearchParams(current);
      if (nextValue === defaultValue) next.delete(key); else next.set(key, nextValue);
      options.clear?.forEach((name) => next.delete(name));
      return next;
    }, { replace: options.replace });
  }, [value, key, defaultValue, allowedValues, options.clear, options.replace, params, updateParams]);
  return [value, setValue] as const;
}
