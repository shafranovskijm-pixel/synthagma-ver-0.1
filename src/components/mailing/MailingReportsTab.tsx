import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { BarChart3 } from "lucide-react";
import { useEmailCampaigns } from "@/hooks/useEmailCampaigns";
import { CampaignReport } from "@/components/admin/broadcast/CampaignReport";

interface Props {
  organizationId: string | null;
}

export function MailingReportsTab({ organizationId }: Props) {
  const { campaigns, loading } = useEmailCampaigns("org", organizationId);
  const [reportFor, setReportFor] = useState<string | null>(null);

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <BarChart3 className="h-4 w-4 text-primary" />
            Отчёты по кампаниям
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-muted-foreground">
            «SMTP принял» — сервер принял письмо к доставке, это не то же самое, что «попало во
            входящие». 100% доставку не гарантирует ни один сервис.
          </p>

          {loading ? (
            <p className="text-sm text-muted-foreground">Загрузка…</p>
          ) : campaigns.length === 0 ? (
            <p className="text-sm text-muted-foreground">Кампаний пока нет.</p>
          ) : (
            campaigns.map((c) => (
              <div key={c.id} className="flex flex-wrap items-center gap-3 rounded-lg border p-3">
                <span className="flex-1 truncate text-sm font-medium">{c.name}</span>
                <span className="text-xs text-muted-foreground">
                  принято {c.sent_count || 0} · ошибок {c.failed_count || 0} · открытий{" "}
                  {c.open_count || 0}
                </span>
                <Badge variant="outline">{c.status}</Badge>
                <Button variant="outline" size="sm" onClick={() => setReportFor(c.id)}>
                  Отчёт
                </Button>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <CampaignReport campaignId={reportFor} open={!!reportFor} onClose={() => setReportFor(null)} />
    </>
  );
}
