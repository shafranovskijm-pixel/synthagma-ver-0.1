import { useCallback, useState, useEffect } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

const MAX_FREE_ATTEMPTS = 3;
const SESSION_ORG_KEY = "ai_limit_org_id";
const SESSION_PLAN_KEY = "ai_limit_plan";

// Cache to avoid repeated DB calls within same session
let cachedCount: number | null = null;
let cachedOrgId: string | null = null;

/** Store org context so standalone checks can work (e.g. in BlockEditor) */
export function setAiLimitContext(organizationId: string | null, plan: string) {
  if (organizationId) sessionStorage.setItem(SESSION_ORG_KEY, organizationId);
  sessionStorage.setItem(SESSION_PLAN_KEY, plan);
}

/** Standalone check using stored context — for use outside React hooks */
export async function checkAiLimitGlobal(): Promise<boolean> {
  const plan = sessionStorage.getItem(SESSION_PLAN_KEY) || "free";
  const orgId = sessionStorage.getItem(SESSION_ORG_KEY);
  return checkAiGenerationLimit(orgId, plan);
}

export async function incrementAiLimitGlobal() {
  const plan = sessionStorage.getItem(SESSION_PLAN_KEY) || "free";
  const orgId = sessionStorage.getItem(SESSION_ORG_KEY);
  await incrementAiUsage(orgId, plan);
}

/** Check AI generation limit from DB */
export async function checkAiGenerationLimit(organizationId: string | null, plan: string): Promise<boolean> {
  if (plan !== "free") return true;
  if (!organizationId) return true;

  try {
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);

    const { data } = await supabase
      .from("organization_usage")
      .select("ai_generations_count")
      .eq("organization_id", organizationId)
      .gte("month_start", monthStart.toISOString())
      .order("month_start", { ascending: false })
      .limit(1)
      .maybeSingle();

    const count = (data as any)?.ai_generations_count || 0;
    cachedCount = count;
    cachedOrgId = organizationId;

    if (count >= MAX_FREE_ATTEMPTS) {
      toast.error("Вы использовали 3 бесплатные попытки ИИ-генерации. Перейдите на тариф Старт или выше для безлимитного доступа.");
      return false;
    }
    return true;
  } catch (error) {
    console.error("Error checking AI limit:", error);
    return true; // Allow on error to not block users
  }
}

export async function incrementAiUsage(organizationId: string | null, plan: string, functionName?: string) {
  // Log per-user usage for all plans
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (user && organizationId) {
      await supabase.from("ai_usage_log").insert({
        user_id: user.id,
        organization_id: organizationId,
        function_name: functionName || "ai_generation",
        tokens_used: 0,
      });
    }
  } catch (err) {
    console.error("Error logging AI usage:", err);
  }

  if (plan !== "free" || !organizationId) return;

  try {
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);
    const monthStartStr = monthStart.toISOString();

    // Try to get existing record for this month
    const { data: existing } = await supabase
      .from("organization_usage")
      .select("id, ai_generations_count")
      .eq("organization_id", organizationId)
      .gte("month_start", monthStartStr)
      .order("month_start", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existing) {
      await supabase
        .from("organization_usage")
        .update({ ai_generations_count: ((existing as any).ai_generations_count || 0) + 1, updated_at: new Date().toISOString() })
        .eq("id", existing.id);
    } else {
      await supabase
        .from("organization_usage")
        .insert({ organization_id: organizationId, month_start: monthStartStr, ai_generations_count: 1 });
    }
    
    cachedCount = (cachedCount ?? 0) + 1;
  } catch (error) {
    console.error("Error incrementing AI usage:", error);
  }
}

export function useAiGenerationLimit(organizationId: string | null, plan: string) {
  const isFree = plan === "free";
  const [canGenerate, setCanGenerate] = useState(true);

  useEffect(() => {
    if (!isFree || !organizationId) {
      setCanGenerate(true);
      return;
    }
    checkAiGenerationLimit(organizationId, plan).then(setCanGenerate);
  }, [isFree, organizationId, plan]);

  const checkAndNotify = useCallback(async (): Promise<boolean> => {
    return checkAiGenerationLimit(organizationId, plan);
  }, [organizationId, plan]);

  const increment = useCallback(async () => {
    await incrementAiUsage(organizationId, plan);
    // Re-check after increment
    if (isFree && organizationId) {
      const canStill = await checkAiGenerationLimit(organizationId, plan);
      setCanGenerate(canStill);
    }
  }, [organizationId, plan, isFree]);

  return { canGenerate, checkAndNotify, increment, maxFreeAttempts: MAX_FREE_ATTEMPTS };
}
