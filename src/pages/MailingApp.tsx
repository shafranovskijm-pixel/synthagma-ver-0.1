import { useEffect, useState } from "react";
import { Helmet } from "react-helmet-async";
import { Link, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  Send,
  Users,
  FileText,
  AtSign,
  BarChart3,
  Gauge,
  ArrowLeft,
} from "lucide-react";
import { CampaignsManager } from "@/components/admin/broadcast/CampaignsManager";
import { EmailTemplatesManager } from "@/components/shared/sales/EmailTemplatesManager";
import { OrgSmtpSettings } from "@/components/organization/sales/OrgSmtpSettings";
import { MailingOverviewTab } from "@/components/mailing/MailingOverviewTab";
import { MailingContactsTab } from "@/components/mailing/MailingContactsTab";
import { MailingReportsTab } from "@/components/mailing/MailingReportsTab";
import { MailingDeliverabilityTab } from "@/components/mailing/MailingDeliverabilityTab";

const MENU = [
  { key: "overview", label: "Обзор", icon: LayoutDashboard },
  { key: "campaigns", label: "Рассылки", icon: Send },
  { key: "contacts", label: "База", icon: Users },
  { key: "templates", label: "Шаблоны", icon: FileText },
  { key: "senders", label: "Отправители", icon: AtSign },
  { key: "reports", label: "Отчёты", icon: BarChart3 },
  { key: "deliverability", label: "Доставляемость", icon: Gauge },
] as const;

type TabKey = (typeof MENU)[number]["key"];

export default function MailingApp() {
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const [organizationId, setOrganizationId] = useState<string | null>(null);
  const [loadingOrg, setLoadingOrg] = useState(true);

  const rawTab = params.get("tab") as TabKey | null;
  const tab: TabKey = MENU.some((m) => m.key === rawTab) ? (rawTab as TabKey) : "overview";

  const setTab = (key: TabKey) => {
    const next = new URLSearchParams(params);
    next.set("tab", key);
    setParams(next, { replace: false });
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!user?.id) {
        setLoadingOrg(false);
        return;
      }
      const { data } = await supabase
        .from("organizations")
        .select("id")
        .eq("user_id", user.id)
        .maybeSingle();
      if (cancelled) return;
      setOrganizationId(data?.id ?? null);
      setLoadingOrg(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  return (
    <div className="min-h-screen bg-background">
      <Helmet>
        <title>Кабинет рассылок — СИНТАГМА</title>
        <meta name="description" content="Кабинет email-рассылок СИНТАГМЫ: кампании, база контактов, шаблоны, отправители, отчёты и доставляемость." />
        <meta name="robots" content="noindex" />
      </Helmet>

      <header className="border-b bg-card/60">
        <div className="container mx-auto flex flex-wrap items-center gap-3 px-4 py-3">
          <h1 className="flex-1 font-display text-lg font-semibold">Рассылки СИНТАГМА</h1>
          <Button asChild variant="ghost" size="sm" className="gap-1">
            <Link to="/organization">
              <ArrowLeft className="h-4 w-4" />
              В кабинет организации
            </Link>
          </Button>
        </div>
      </header>

      <div className="container mx-auto flex flex-col gap-6 px-4 py-6 lg:flex-row">
        <nav aria-label="Разделы рассылок" className="lg:w-56 lg:shrink-0">
          <ul className="flex gap-2 overflow-x-auto lg:flex-col lg:overflow-visible">
            {MENU.map((m) => (
              <li key={m.key}>
                <button
                  type="button"
                  onClick={() => setTab(m.key)}
                  aria-current={tab === m.key ? "page" : undefined}
                  className={cn(
                    "flex w-full items-center gap-2 whitespace-nowrap rounded-xl px-3 py-2 text-sm transition-colors",
                    tab === m.key
                      ? "bg-primary/10 font-medium text-primary shadow-sm"
                      : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                  )}
                >
                  <m.icon className="h-4 w-4" />
                  {m.label}
                </button>
              </li>
            ))}
          </ul>
        </nav>

        <main className="min-w-0 flex-1">
          {loadingOrg ? (
            <p className="text-sm text-muted-foreground">Загрузка кабинета…</p>
          ) : !organizationId ? (
            <p className="text-sm text-muted-foreground">
              Организация не найдена для текущей учётной записи.
            </p>
          ) : (
            <>
              {tab === "overview" && (
                <MailingOverviewTab
                  organizationId={organizationId}
                  onNewCampaign={() => setTab("campaigns")}
                  onGoToSenders={() => setTab("senders")}
                />
              )}
              {tab === "campaigns" && <CampaignsManager scope="org" organizationId={organizationId} />}
              {tab === "contacts" && <MailingContactsTab organizationId={organizationId} />}
              {tab === "templates" && <EmailTemplatesManager scope="org" organizationId={organizationId} />}
              {tab === "senders" && <OrgSmtpSettings organizationId={organizationId} />}
              {tab === "reports" && <MailingReportsTab organizationId={organizationId} />}
              {tab === "deliverability" && <MailingDeliverabilityTab organizationId={organizationId} />}
            </>
          )}
        </main>
      </div>
    </div>
  );
}
