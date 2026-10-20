import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const feedback = vi.hoisted(() => ({ error: vi.fn() }));
vi.mock("sonner", () => ({ toast: { error: feedback.error } }));
import { showLimitToast } from "../limitToast";

beforeEach(() => vi.clearAllMocks());
afterEach(() => vi.restoreAllMocks());

describe("limit feedback actions require a verified denial reason", () => {
  it("does not offer an upgrade while checking, regardless of localized message", () => {
    showLimitToast({ allowed: false, reason: "checking", message: "Лимит тарифа: проверяем доступ" });
    expect(feedback.error).toHaveBeenCalledWith("Лимит тарифа: проверяем доступ", { duration: 6000 });
  });
  it("offers a retry for a verification failure without an upgrade", () => {
    const retry = vi.fn();
    showLimitToast({ allowed: false, reason: "verification_error", message: "Не удалось проверить доступ" }, retry);
    const options = feedback.error.mock.calls[0][1];
    expect(options.action.label).toBe("Повторить проверку");
    options.action.onClick();
    expect(retry).toHaveBeenCalledExactlyOnceWith();
  });
  it("does not add any action to a verification failure without a retry callback", () => {
    showLimitToast({ allowed: false, reason: "verification_error", message: "Проверка недоступна" });
    expect(feedback.error.mock.calls[0][1]).not.toHaveProperty("action");
  });
  it("keeps the existing tariff navigation only for confirmed quota exhaustion", () => {
    const navigate = vi.fn();
    window.addEventListener("navigate-to-subscription", navigate);
    try {
      showLimitToast({ allowed: false, reason: "quota", message: "Проверенный лимит исчерпан" });
      const action = feedback.error.mock.calls[0][1].action;
      expect(action.label).toBe("Перейти на тариф");
      action.onClick();
      expect(navigate).toHaveBeenCalledTimes(1);
    } finally {
      window.removeEventListener("navigate-to-subscription", navigate);
    }
  });
  it("keeps tariff navigation for a confirmed unavailable plan feature", () => {
    showLimitToast({ allowed: false, reason: "plan_feature", message: "Функция недоступна по подтверждённым условиям" });
    expect(feedback.error.mock.calls[0][1].action.label).toBe("Перейти на тариф");
  });
  it("does not guess entitlement from a legacy string", () => {
    showLimitToast("Перейдите на следующий тариф");
    expect(feedback.error.mock.calls[0][1]).not.toHaveProperty("action");
  });
  it("keeps unclassified legacy denials safe without inventing a purchase recommendation", () => {
    showLimitToast({ allowed: false, message: "Недоступно" });
    expect(feedback.error.mock.calls[0][1]).not.toHaveProperty("action");
  });
  it("does not show denial feedback for allowed access", () => {
    showLimitToast({ allowed: true, message: "" });
    expect(feedback.error).not.toHaveBeenCalled();
  });
});
