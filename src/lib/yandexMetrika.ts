export const YANDEX_METRIKA_COUNTER_ID = 105216554;

type YandexMetrikaFunction = (
  counterId: number,
  method: "reachGoal",
  goal: string,
) => void;

type WindowWithMetrika = Window & {
  ym?: YandexMetrikaFunction;
};

/**
 * Reports a confirmed business event without making the underlying action
 * depend on the analytics script being available.
 */
export function reachYandexGoal(goal: string): boolean {
  if (typeof window === "undefined") return false;

  const ym = (window as WindowWithMetrika).ym;
  if (typeof ym !== "function") return false;

  try {
    ym(YANDEX_METRIKA_COUNTER_ID, "reachGoal", goal);
    return true;
  } catch {
    return false;
  }
}
