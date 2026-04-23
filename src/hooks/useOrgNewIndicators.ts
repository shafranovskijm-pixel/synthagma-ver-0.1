import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface OrgNewIndicators {
  homework: number;
  sales: number;
  whatsNew: number;
}

/**
 * Лёгкие счётчики "нового" для индикаторов в сайдбаре.
 * - homework: домашние работы со статусом ожидающих проверки.
 * - sales: лиды без касания > 24ч.
 * - whatsNew: непросмотренные обновления платформы (по localStorage timestamp).
 */
export function useOrgNewIndicators(organizationId: string | null | undefined) {
  const [data, setData] = useState<OrgNewIndicators>({ homework: 0, sales: 0, whatsNew: 0 });

  useEffect(() => {
    if (!organizationId) return;
    let cancelled = false;

    const load = async () => {
      const next: OrgNewIndicators = { homework: 0, sales: 0, whatsNew: 0 };

      // Homework pending review
      try {
        const { count } = await supabase
          .from("homework_submissions" as any)
          .select("*", { count: "exact", head: true })
          .eq("organization_id", organizationId)
          .eq("status", "pending");
        if (typeof count === "number") next.homework = count;
      } catch {}

      // Sales: лиды без активности > 24ч
      try {
        const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
        const { count } = await supabase
          .from("sales_leads" as any)
          .select("*", { count: "exact", head: true })
          .eq("organization_id", organizationId)
          .neq("status", "won")
          .neq("status", "not_interested")
          .lt("updated_at", dayAgo);
        if (typeof count === "number") next.sales = count;
      } catch {}

      // What's new (по последнему просмотру в localStorage)
      try {
        const lastSeen = localStorage.getItem("whats-new-last-seen");
        const lastSeenIso = lastSeen ? new Date(parseInt(lastSeen, 10)).toISOString() : "1970-01-01";
        const { count } = await supabase
          .from("platform_updates" as any)
          .select("*", { count: "exact", head: true })
          .gt("created_at", lastSeenIso);
        if (typeof count === "number") next.whatsNew = count;
      } catch {}

      if (!cancelled) setData(next);
    };

    load();
    // visibility-aware: пропускаем тики когда вкладка скрыта
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') load();
    }, 90_000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [organizationId]);

  return data;
}
