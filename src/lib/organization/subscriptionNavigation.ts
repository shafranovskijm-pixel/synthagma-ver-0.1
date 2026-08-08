import { useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { SUBSCRIPTION_PLANS, type SubscriptionPlan } from "@/constants/subscriptionPlans";

/** Тарифы, для которых доступно оформление (бесплатный оформлять нечего). */
export const CHECKOUT_PLANS: SubscriptionPlan[] = ["start", "standard", "professional", "maximum"];

export const CHECKOUT_PARAM = "checkout";
export const CHECKOUT_PLAN_PARAM = "plan";

export function isCheckoutPlan(value: unknown): value is SubscriptionPlan {
  return typeof value === "string" && (CHECKOUT_PLANS as string[]).includes(value);
}

/**
 * Единственный надёжный путь к вкладке тарифа — тот же, что у рабочего верхнего бейджа.
 * Никаких setTimeout/CustomEvent: только URL, поэтому клик не может открыть чужой диалог.
 */
export function subscriptionTabPath(opts?: { checkout?: boolean; plan?: SubscriptionPlan }): string {
  const params = new URLSearchParams();
  params.set("tab", "subscription");
  if (opts?.checkout) params.set(CHECKOUT_PARAM, "1");
  if (opts?.plan && isCheckoutPlan(opts.plan)) params.set(CHECKOUT_PLAN_PARAM, opts.plan);
  return `/organization?${params.toString()}`;
}

/** Чистый резолвер состояния мастера из URL. */
export function resolveCheckoutState(
  search: URLSearchParams | string,
  currentPlan?: string | null,
): { open: boolean; plan: SubscriptionPlan } {
  const params = new URLSearchParams(typeof search === "string" ? search : search.toString());
  const raw = params.get(CHECKOUT_PLAN_PARAM);
  const fallback: SubscriptionPlan = isCheckoutPlan(currentPlan) ? currentPlan : "start";
  return {
    open: params.get(CHECKOUT_PARAM) === "1",
    plan: isCheckoutPlan(raw) && SUBSCRIPTION_PLANS[raw] ? raw : fallback,
  };
}

/** Чистый резолвер параметров при открытии/закрытии мастера. */
export function checkoutParams(
  prev: URLSearchParams | string,
  next: { open: boolean; plan?: SubscriptionPlan },
): URLSearchParams {
  const params = new URLSearchParams(typeof prev === "string" ? prev : prev.toString());
  params.set("tab", "subscription");
  if (next.open) {
    params.set(CHECKOUT_PARAM, "1");
    if (next.plan && isCheckoutPlan(next.plan)) params.set(CHECKOUT_PLAN_PARAM, next.plan);
  } else {
    params.delete(CHECKOUT_PARAM);
    params.delete(CHECKOUT_PLAN_PARAM);
  }
  return params;
}

/**
 * Состояние мастера «Оформление тарифа»:
 *  — основной источник истины — URL (checkout=1&plan=…), поэтому выбранный тариф
 *    не теряется при F5/hot reload, а закрытие возвращает ровно на вкладку тарифа;
 *  — дублируется локальным состоянием: если внешний рендер перезапишет search-параметры,
 *    диалог всё равно откроется (живой тест показал, что URL-переход может быть потерян);
 *  — повторный клик идемпотентен: второй диалог не появляется.
 */
export function useTariffCheckout(currentPlan?: string | null) {
  const [searchParams, setSearchParams] = useSearchParams();
  const urlState = resolveCheckoutState(searchParams, currentPlan);
  const [local, setLocal] = useState<{ open: boolean; plan?: SubscriptionPlan }>({ open: false });

  const open = urlState.open || local.open;
  const plan = local.open && local.plan ? local.plan : urlState.plan;

  const openCheckout = useCallback(
    (nextPlan?: SubscriptionPlan) => {
      setLocal((prev) => ({ open: true, plan: nextPlan ?? prev.plan }));
      setSearchParams(
        (prev) => checkoutParams(prev, { open: true, plan: nextPlan ?? resolveCheckoutState(prev, currentPlan).plan }),
        { replace: false },
      );
    },
    [setSearchParams, currentPlan],
  );

  const setPlan = useCallback(
    (nextPlan: SubscriptionPlan) => {
      setLocal((prev) => (prev.open ? { open: true, plan: nextPlan } : prev));
      setSearchParams((prev) => checkoutParams(prev, { open: true, plan: nextPlan }), { replace: true });
    },
    [setSearchParams],
  );

  const closeCheckout = useCallback(() => {
    setLocal({ open: false });
    setSearchParams((prev) => checkoutParams(prev, { open: false }), { replace: true });
  }, [setSearchParams]);

  return { open, plan, openCheckout, setPlan, closeCheckout };
}

