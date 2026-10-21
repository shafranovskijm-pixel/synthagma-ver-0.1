import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { SUBSCRIPTION_PLANS, type SubscriptionPlan } from "@/constants/subscriptionPlans";
import { ORG_FEATURE_CATALOG } from "@/constants/orgFeatureCatalog";
import { isMailingEnabled } from "@/lib/mailing/mailingAccess";
import { usePostpaidAccessProfile } from "@/hooks/usePostpaidAccessProfile";
import { hasAllPlatformFeatureGrant } from "@/lib/postpaidAccess";

interface CrmAccessState {
  organizationId: string | null;
  loading: boolean;
  error: string | null;
  enabled: boolean;
  mailingEnabled: boolean;
}

/** Core projection is readable by active staff without settings.read. */
export function useOrgCrmAccess(organizationId: string | null) {
  const postpaid = usePostpaidAccessProfile(organizationId);
  const activeOrganization = useRef(organizationId);
  activeOrganization.current = organizationId;
  const sequence = useRef(0);
  const [state, setState] = useState<CrmAccessState>({ organizationId, loading: !!organizationId, error: null, enabled: false, mailingEnabled: false });

  const refresh = useCallback(async () => {
    if (activeOrganization.current !== organizationId) return;
    const request = ++sequence.current;
    const isCurrent = () => activeOrganization.current === organizationId && sequence.current === request;
    setState({ organizationId, loading: !!organizationId, error: null, enabled: false, mailingEnabled: false });
    if (!organizationId) return;
    try {
      const { data, error } = await supabase.rpc("get_organization_core", { p_org_id: organizationId });
      if (error) throw error;
      const core = data as { id?: unknown; subscription_plan?: unknown; custom_enabled_categories?: unknown } | null;
      if (!core || core.id !== organizationId || typeof core.subscription_plan !== "string"
        || !Object.prototype.hasOwnProperty.call(SUBSCRIPTION_PLANS, core.subscription_plan)) throw new Error("organization_plan_unconfirmed");
      const plan = core.subscription_plan as SubscriptionPlan;
      const limits = { ...SUBSCRIPTION_PLANS[plan].limits };
      const categories = core.custom_enabled_categories ?? [];
      if (!Array.isArray(categories) || categories.some(category => typeof category !== "string")) throw new Error("organization_features_unconfirmed");
      for (const category of categories) {
        const flag = ORG_FEATURE_CATALOG.find(feature => feature.key === category)?.planFlag;
        if (flag) (limits as unknown as Record<string, unknown>)[flag] = true;
      }
      if (isCurrent()) setState({ organizationId, loading: false, error: null,
        enabled: limits.salesCrmEnabled === true, mailingEnabled: isMailingEnabled(plan, limits.emailCampaignsEnabled) });
    } catch {
      if (isCurrent()) setState({ organizationId, loading: false, enabled: false, mailingEnabled: false,
        error: "Не удалось проверить доступность CRM по тарифу. Повторите проверку." });
    }
  }, [organizationId]);

  useEffect(() => {
    void refresh();
    return () => { sequence.current++; };
  }, [refresh]);

  const current = state.organizationId === organizationId;
  const profileReady = !!organizationId && !postpaid.isLoading && !postpaid.error && !!postpaid.data;
  const profileError = postpaid.error ? "Не удалось проверить условия постоплаты. Повторите проверку." : null;
  return {
    loading: !!organizationId && (postpaid.isLoading || (current ? state.loading : true)),
    error: profileError || (current ? state.error : null),
    enabled: current && !state.loading && !state.error && profileReady && (postpaid.data!.active ? (hasAllPlatformFeatureGrant(postpaid.data) || postpaid.data!.features.crm) : state.enabled),
    mailingEnabled: current && !state.loading && !state.error && profileReady && (postpaid.data!.active ? true : state.mailingEnabled),
    refresh: async () => { await Promise.all([refresh(), postpaid.refetch()]); },
  };
}
