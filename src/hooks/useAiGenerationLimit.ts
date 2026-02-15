import { useCallback, useMemo } from "react";
import { toast } from "sonner";

const MAX_FREE_ATTEMPTS = 3;
const STORAGE_KEY_PREFIX = "ai_gen_count_";
const SESSION_ORG_KEY = "ai_limit_org_id";
const SESSION_PLAN_KEY = "ai_limit_plan";

/** Store org context so standalone checks can work (e.g. in BlockEditor) */
export function setAiLimitContext(organizationId: string | null, plan: string) {
  if (organizationId) sessionStorage.setItem(SESSION_ORG_KEY, organizationId);
  sessionStorage.setItem(SESSION_PLAN_KEY, plan);
}

/** Standalone check using stored context — for use outside React hooks */
export function checkAiLimitGlobal(): boolean {
  const plan = sessionStorage.getItem(SESSION_PLAN_KEY) || "free";
  const orgId = sessionStorage.getItem(SESSION_ORG_KEY);
  return checkAiGenerationLimit(orgId, plan);
}

export function incrementAiLimitGlobal() {
  const plan = sessionStorage.getItem(SESSION_PLAN_KEY) || "free";
  const orgId = sessionStorage.getItem(SESSION_ORG_KEY);
  incrementAiUsage(orgId, plan);
}

/** Standalone check — can be called outside React components */
export function checkAiGenerationLimit(organizationId: string | null, plan: string): boolean {
  if (plan !== "free") return true;
  if (!organizationId) return true;
  const current = parseInt(localStorage.getItem(`${STORAGE_KEY_PREFIX}${organizationId}`) || "0", 10);
  if (current >= MAX_FREE_ATTEMPTS) {
    toast.error("Вы использовали 3 бесплатные попытки ИИ-генерации. Перейдите на тариф Старт или выше для безлимитного доступа.");
    return false;
  }
  return true;
}

export function incrementAiUsage(organizationId: string | null, plan: string) {
  if (plan !== "free" || !organizationId) return;
  const current = parseInt(localStorage.getItem(`${STORAGE_KEY_PREFIX}${organizationId}`) || "0", 10);
  localStorage.setItem(`${STORAGE_KEY_PREFIX}${organizationId}`, String(current + 1));
}

export function useAiGenerationLimit(organizationId: string | null, plan: string) {
  const isFree = plan === "free";

  const canGenerate = useMemo(() => {
    if (!isFree || !organizationId) return true;
    const val = localStorage.getItem(`${STORAGE_KEY_PREFIX}${organizationId}`);
    return (val ? parseInt(val, 10) : 0) < MAX_FREE_ATTEMPTS;
  }, [isFree, organizationId]);

  const checkAndNotify = useCallback((): boolean => {
    return checkAiGenerationLimit(organizationId, plan);
  }, [organizationId, plan]);

  const increment = useCallback(() => {
    incrementAiUsage(organizationId, plan);
  }, [organizationId, plan]);

  return { canGenerate, checkAndNotify, increment, maxFreeAttempts: MAX_FREE_ATTEMPTS };
}
