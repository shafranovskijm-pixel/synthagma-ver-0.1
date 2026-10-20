import { toast } from "sonner";

export type LimitCheckResult = {
  allowed: boolean;
  message: string;
  reason?: "checking" | "verification_error" | "quota" | "plan_feature";
};

/** An unknown entitlement is not evidence that buying another plan helps. */
export const showLimitToast = (result: LimitCheckResult | string, onRetry?: () => void) => {
  if (typeof result !== "string" && result.allowed) return;
  const message = typeof result === "string" ? result : result.message;
  const reason = typeof result === "string" ? undefined : result.reason;
  const action = reason === "quota" || reason === "plan_feature" ? {
      label: "Перейти на тариф",
      onClick: () => window.dispatchEvent(new CustomEvent('navigate-to-subscription')),
    } : reason === "verification_error" && onRetry ? {
      label: "Повторить проверку",
      onClick: onRetry,
    } : undefined;
  toast.error(message, {
    duration: 6000,
    ...(action ? { action } : {}),
  });
};
