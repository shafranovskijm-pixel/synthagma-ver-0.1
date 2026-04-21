import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Mail, Settings, Users, FileText, Briefcase, FileCode, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { OrgEmailCampaigns } from "./OrgEmailCampaigns";
import { OrgSmtpSettings } from "./OrgSmtpSettings";
import { useOrgDashboard } from "@/contexts/OrgDashboardContext";

type Section = "campaigns" | "templates" | "proposals" | "contracts" | "leads" | "smtp";

const sections: { id: Section; label: string; icon: any; soon?: boolean }[] = [
  { id: "campaigns", label: "Рассылки", icon: Mail },
  { id: "templates", label: "Шаблоны писем", icon: FileCode, soon: true },
  { id: "proposals", label: "КП", icon: FileText, soon: true },
  { id: "contracts", label: "Договоры", icon: Briefcase, soon: true },
  { id: "leads", label: "Лиды", icon: Users, soon: true },
  { id: "smtp", label: "SMTP", icon: Settings },
];

export function OrgSalesLayout() {
  const d = useOrgDashboard();
  const organizationId = d.organizationId;
  const [section, setSection] = useState<Section>("campaigns");

  if (!organizationId) return null;

  return (
    <div className="space-y-4">
      {/* Beta-баннер */}
      <Card className="border-primary/30 bg-primary/5">
        <CardContent className="p-3 flex items-center gap-2 text-sm">
          <Sparkles className="w-4 h-4 text-primary shrink-0" />
          <span>
            <strong>Раздел «Продажи» — Beta.</strong> Чтобы оставить его навсегда — напишите в поддержку.
          </span>
        </CardContent>
      </Card>

      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        {sections.map(s => {
          const isActive = section === s.id;
          return (
            <button
              key={s.id}
              onClick={() => !s.soon && setSection(s.id)}
              disabled={s.soon}
              className={cn(
                "flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all whitespace-nowrap",
                isActive ? "bg-primary text-primary-foreground shadow-md" : "bg-muted text-muted-foreground hover:bg-muted/80",
                s.soon && "opacity-50 cursor-not-allowed"
              )}
            >
              <s.icon className="w-4 h-4" />
              {s.label}
              {s.soon && <span className="text-[10px] uppercase tracking-wide ml-1">soon</span>}
            </button>
          );
        })}
      </div>

      {section === "campaigns" && (
        <OrgEmailCampaigns organizationId={organizationId} onGoToSmtp={() => setSection("smtp")} />
      )}
      {section === "smtp" && <OrgSmtpSettings organizationId={organizationId} />}
      {(section === "templates" || section === "proposals" || section === "contracts" || section === "leads") && (
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground space-y-2">
            <p className="font-medium">Раздел в разработке</p>
            <p className="text-sm">Шаблоны писем, КП и договоры через документооборот появятся в следующем релизе. База данных уже готова.</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
