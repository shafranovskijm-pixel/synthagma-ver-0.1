import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { CreditCard } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useStaffPermissions } from "@/hooks/useStaffPermissions";
import { readOrganizationPaymentNotice, type OrganizationPaymentNotice } from "@/lib/notifications/organizationPaymentNotice";

/** Persistent until the existing reminder is no longer backed by a pending prepaid invoice. */
export function OrganizationPaymentNoticeBanner({ organizationId }: { organizationId: string | null | undefined }) {
  const permissions = useStaffPermissions();
  const allowed = !!organizationId && !permissions.loading && !permissions.error && permissions.can("billing.read")
    && (permissions.organizationId === organizationId || (permissions.isOrgOwner && permissions.organizationId === null));
  const [notice, setNotice] = useState<OrganizationPaymentNotice | null>(null);
  useEffect(() => {
    if (!allowed || !organizationId) return;
    let current = true;
    let generation = 0;
    let running = false;
    const refresh = async () => {
      if (running) return;
      running = true;
      const request = ++generation;
      // A failed refresh must not leave an obsolete request to pay visible.
      setNotice(null);
      try {
        const next = await readOrganizationPaymentNotice(organizationId);
        if (current && request === generation) setNotice(next);
      } catch {
        if (current && request === generation) {
          setNotice(null);
          console.warn("[OrganizationPaymentNotice]", { stage: "read", code: "unavailable" });
        }
      } finally {
        running = false;
      }
    };
    void refresh();
    const visible = () => { if (document.visibilityState === "visible") void refresh(); };
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", visible);
    return () => {
      current = false;
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [allowed, organizationId]);
  if (!allowed || !notice || notice.organizationId !== organizationId) return null;
  return <section role="status" aria-label="Напоминание об оплате" className="mb-4 flex min-w-0 flex-col gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 sm:flex-row sm:items-start">
    <CreditCard aria-hidden="true" className="h-5 w-5 shrink-0 text-amber-700 dark:text-amber-400" />
    <div className="min-w-0 flex-1 space-y-1 break-words">
      <p className="font-medium">{notice.title}</p>
      <p className="whitespace-pre-wrap text-sm text-muted-foreground">{notice.message}</p>
    </div>
    <Button asChild variant="outline" size="sm" className="h-auto max-w-full shrink-0 whitespace-normal text-center">
      <Link to={notice.path}>Открыть счёт</Link>
    </Button>
  </section>;
}
