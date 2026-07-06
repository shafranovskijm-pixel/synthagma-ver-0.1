import { useState } from "react";
import { cn } from "@/lib/utils";
import { Mail, Send, Inbox, Users, BarChart3, Settings, Megaphone, Flame, ShieldCheck } from "lucide-react";
import { SenderInboxesTable } from "./SenderInboxesTable";
import { CampaignsManager } from "./CampaignsManager";
import { DripCampaignsManager } from "./DripCampaignsManager";
import { EmailTemplatesManager } from "@/components/shared/sales/EmailTemplatesManager";
import { SuppressionListManager } from "./SuppressionListManager";
import { DomainReputationCheck } from "./DomainReputationCheck";

type Section = "inboxes" | "campaigns" | "drip" | "templates" | "suppressed" | "domain";

const NAV: { id: Section; label: string; icon: any }[] = [
  { id: "inboxes", label: "Ящики", icon: Mail },
  { id: "campaigns", label: "Кампании", icon: Send },
  { id: "drip", label: "Drip-цепочки", icon: Flame },
  { id: "templates", label: "Шаблоны", icon: Inbox },
  { id: "suppressed", label: "Отписавшиеся", icon: Users },
  { id: "domain", label: "Репутация домена", icon: ShieldCheck },
];

export function ColdyMailingLayout() {
  const [section, setSection] = useState<Section>("inboxes");

  return (
    <div className="flex gap-4 min-h-[70vh]">
      {/* Left icon sidebar */}
      <aside className="w-16 shrink-0 rounded-2xl border bg-card shadow-sm py-3 flex flex-col items-center gap-1">
        {NAV.map(n => {
          const Icon = n.icon;
          const active = section === n.id;
          return (
            <button
              key={n.id}
              onClick={() => setSection(n.id)}
              title={n.label}
              className={cn(
                "w-11 h-11 rounded-xl grid place-items-center transition-all relative group",
                active ? "bg-primary text-primary-foreground shadow-md" : "text-muted-foreground hover:bg-muted"
              )}
            >
              <Icon className="w-5 h-5" />
              <span className="absolute left-full ml-2 px-2 py-1 rounded-md bg-popover border shadow text-xs whitespace-nowrap opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity z-50">
                {n.label}
              </span>
            </button>
          );
        })}
      </aside>

      {/* Main content */}
      <div className="flex-1 min-w-0">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold">
              {NAV.find(n => n.id === section)?.label}
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              {section === "inboxes" && "Пул отправителей: прогрев, репутация, лимиты"}
              {section === "campaigns" && "Все email-кампании: черновики, запущенные, завершённые"}
              {section === "drip" && "Автоматические цепочки писем по расписанию"}
              {section === "templates" && "Шаблоны для быстрого запуска рассылок"}
              {section === "suppressed" && "Отписавшиеся, жалобы, bounce-адреса"}
              {section === "domain" && "SPF / DKIM / DMARC — проверка репутации домена"}
            </p>
          </div>
        </div>
        <div>
          {section === "inboxes" && <SenderInboxesTable />}
          {section === "campaigns" && <CampaignsManager scope="platform" organizationId={null} />}
          {section === "drip" && <DripCampaignsManager />}
          {section === "templates" && <EmailTemplatesManager scope="platform" organizationId={null} />}
          {section === "suppressed" && <SuppressionListManager scope="platform" organizationId={null} />}
          {section === "domain" && <DomainReputationCheck />}
        </div>
      </div>
    </div>
  );
}
