import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { SubscriptionPlan } from "@/constants/subscriptionPlans";
import type { PlatformContractPeriodMonths } from "@/lib/platform-contract";
import {
  createPlatformCommercialSet,
  fetchPlatformCommercialSet,
  missingRequisites,
  type PlatformCommercialSet,
  type PlatformCustomerRequisites,
} from "@/lib/platform-commerce";

const ORG_REQUISITE_COLUMNS =
  "name, inn, kpp, ogrn, legal_address, actual_address, director_name, director_position, email, phone";

/**
 * Единый источник данных коммерческого комплекта организации
 * (проект договора → счёт → акт). Используется и клиентом, и админом.
 */
export function usePlatformCommercialSet(organizationId: string | null | undefined) {
  const [loading, setLoading] = useState(true);
  const [set, setSet] = useState<PlatformCommercialSet>({
    contract: null,
    invoice: null,
    paidInvoice: null,
    act: null,
  });
  const [org, setOrg] = useState<PlatformCustomerRequisites | null>(null);
  const [generating, setGenerating] = useState(false);
  const inFlight = useRef(false);

  const reload = useCallback(async () => {
    if (!organizationId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [orgRes, setRes] = await Promise.all([
        supabase.from("organizations").select(ORG_REQUISITE_COLUMNS).eq("id", organizationId).maybeSingle(),
        fetchPlatformCommercialSet(supabase, organizationId),
      ]);
      setOrg((orgRes.data as PlatformCustomerRequisites) || null);
      setSet(setRes);
    } catch (e: any) {
      toast.error(e?.message || "Не удалось загрузить документы по тарифу");
    } finally {
      setLoading(false);
    }
  }, [organizationId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const missing = missingRequisites(org);

  const generate = useCallback(
    async (plan: SubscriptionPlan, periodMonths: PlatformContractPeriodMonths) => {
      if (!organizationId || inFlight.current) return null;
      if (missing.length > 0) {
        toast.error("Заполните реквизиты организации перед формированием документов");
        return null;
      }
      inFlight.current = true;
      setGenerating(true);
      try {
        const result = await createPlatformCommercialSet(supabase, {
          organizationId,
          plan,
          periodMonths,
          customer: org || {},
        });
        await reload();
        return result;
      } catch (e: any) {
        toast.error(e?.message || "Не удалось сформировать документы");
        return null;
      } finally {
        inFlight.current = false;
        setGenerating(false);
      }
    },
    [organizationId, org, missing.length, reload],
  );

  return { loading, set, org, missing, generating, generate, reload };
}
