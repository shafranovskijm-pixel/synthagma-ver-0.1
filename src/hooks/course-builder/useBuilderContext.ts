import { useCallback, useLayoutEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";

export interface BuilderContext {
  generation: number;
  requestedCourseId: string | undefined;
  ready: boolean;
  active: boolean;
  actorKey: string;
  requestKey: string;
  adoptionId: string | null;
  isCurrent: () => boolean;
  prepareAdoption: (createdId: string) => void;
}

/** Requested route identity is independent of the organization resolved later. */
export function useBuilderContext(actorId: string | undefined, role: string | null, authLoading: boolean, requestedCourseId: string | undefined) {
  const actorKey = JSON.stringify([actorId, role, authLoading]);
  const requestKey = JSON.stringify([actorKey, requestedCourseId ?? null]);
  const current = useRef<BuilderContext | null>(null);
  if (current.current && current.current.requestKey !== requestKey
    && current.current.actorKey === actorKey && requestedCourseId
    && current.current.adoptionId === requestedCourseId && current.current.isCurrent()) {
    // Only a completed same-origin creation may promote /new to its saved URL.
    current.current.requestedCourseId = requestedCourseId;
    current.current.requestKey = requestKey;
    current.current.adoptionId = null;
  }
  if (!current.current || current.current.requestKey !== requestKey) {
    const previous = current.current;
    if (previous) previous.active = false;
    const next: BuilderContext = {
      generation: (previous?.generation ?? -1) + 1, requestedCourseId,
      ready: Boolean(actorId && role && !authLoading), active: false,
      actorKey, requestKey, adoptionId: null,
      isCurrent: () => current.current === next && next.ready && next.active,
      prepareAdoption: createdId => {
        if (next.isCurrent() && !next.requestedCourseId) next.adoptionId = createdId;
      },
    };
    current.current = next;
  }
  const context = current.current;
  useLayoutEffect(() => {
    context.active = true;
    return () => { context.active = false; };
  }, [context]);
  return context;
}

/** Mask old state before effects and reject setters retained by an old actor/route. */
export function useBuilderState<T>(context: BuilderContext, initial: T | (() => T)): [T, Dispatch<SetStateAction<T>>] {
  const create = () => ({ context, value: typeof initial === "function" ? (initial as () => T)() : initial });
  const current = useRef<ReturnType<typeof create> | null>(null);
  if (!current.current || current.current.context !== context) current.current = create();
  const [state, setState] = useState(current.current);
  const set = useCallback<Dispatch<SetStateAction<T>>>(update => {
    if (!context.isCurrent() || current.current?.context !== context) return;
    const value = typeof update === "function" ? (update as (previous: T) => T)(current.current.value) : update;
    const next = { context, value };
    current.current = next;
    setState(next);
  }, [context]);
  return [state.context === context ? state.value : current.current.value, set];
}
