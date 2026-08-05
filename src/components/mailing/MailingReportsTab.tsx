import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { BarChart3, FlaskConical, RefreshCw, Download } from "lucide-react";
import { useEmailCampaigns } from "@/hooks/useEmailCampaigns";
import { CampaignReport } from "@/components/admin/broadcast/CampaignReport";
import { supabase } from "@/integrations/supabase/client";
import {
  buildSeedLedgerQuery,
  mapSeedLedgerRow,
  seedReportToCsv,
  SEED_STATUS_LABEL,
  type SeedReportRow,
} from "@/lib/mailing/seedReports";

interface Props {
  organizationId: string | null;
}

const statusVariant = (s: SeedReportRow["status"]) =>
  s === "ok" ? "default" : s === "failed" ? "destructive" : "secondary";

export function MailingReportsTab({ organizationId }: Props) {
  const { campaigns, loading } = useEmailCampaigns("org", organizationId);
  const [reportFor, setReportFor] = useState<string | null>(null);

  const [seedRows, setSeedRows] = useState<SeedReportRow[]>([]);
  const [seedLoading, setSeedLoading] = useState(true);
  const [seedError, setSeedError] = useState(false);

  const loadSeeds = useCallback(async () => {
    if (!organizationId) {
      setSeedRows([]);
      setSeedLoading(false);
      return;
    }
    setSeedLoading(true);
    setSeedError(false);
    const { data, error } = await buildSeedLedgerQuery(supabase, organizationId);
    if (error) {
      setSeedError(true);
      setSeedRows([]);
    } else {
      setSeedRows((data || []).map(mapSeedLedgerRow));
    }
    setSeedLoading(false);
  }, [organizationId]);

  useEffect(() => {
    loadSeeds();
  }, [loadSeeds]);

  const exportCsv = () => {
    const blob = new Blob(["\ufeff" + seedReportToCsv(seedRows)], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "seed-sends.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <>
      <div className="space-y-6">
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
                  <Button
                    variant="outline"
                    size="sm"
                    aria-label={`Отчёт по кампании ${c.name}`}
                    onClick={() => setReportFor(c.id)}
                  >
                    Отчёт
                  </Button>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <FlaskConical className="h-4 w-4 text-primary" />
              Тестовые отправки
            </CardTitle>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                aria-label="Обновить отчёт по тестовым отправкам"
                onClick={loadSeeds}
                disabled={seedLoading}
              >
                <RefreshCw className="mr-1 h-4 w-4" />
                Обновить
              </Button>
              <Button
                variant="outline"
                size="sm"
                aria-label="Скачать CSV по тестовым отправкам"
                onClick={exportCsv}
                disabled={seedRows.length === 0}
              >
                <Download className="mr-1 h-4 w-4" />
                CSV
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Принято SMTP не гарантирует Входящие. Адреса seed-получателей, тема и текст письма в
              отчёте не хранятся и не показываются.
            </p>

            {seedLoading ? (
              <p className="text-sm text-muted-foreground">Загрузка…</p>
            ) : seedError ? (
              <p className="text-sm text-muted-foreground">
                Не удалось загрузить журнал тестовых отправок.
              </p>
            ) : seedRows.length === 0 ? (
              <p className="text-sm text-muted-foreground">Тестовых отправок пока нет.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-muted-foreground">
                      <th className="py-2 pr-3 font-medium">Время</th>
                      <th className="py-2 pr-3 font-medium">Кампания</th>
                      <th className="py-2 pr-3 font-medium">Отправитель</th>
                      <th className="py-2 pr-3 font-medium">Запрошено / принято SMTP / ошибок</th>
                      <th className="py-2 font-medium">Статус</th>
                    </tr>
                  </thead>
                  <tbody>
                    {seedRows.map((r) => (
                      <tr key={r.id} className="border-t">
                        <td className="py-2 pr-3 whitespace-nowrap text-xs text-muted-foreground">
                          {new Date(r.created_at).toLocaleString("ru-RU")}
                        </td>
                        <td className="max-w-[220px] truncate py-2 pr-3">{r.campaign}</td>
                        <td className="max-w-[200px] truncate py-2 pr-3 text-muted-foreground">
                          {r.sender}
                        </td>
                        <td className="py-2 pr-3 whitespace-nowrap tabular-nums">
                          {r.requested} / {r.accepted} / {r.failed}
                        </td>
                        <td className="py-2">
                          <Badge variant={statusVariant(r.status)}>
                            {SEED_STATUS_LABEL[r.status]}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <CampaignReport campaignId={reportFor} open={!!reportFor} onClose={() => setReportFor(null)} />
    </>
  );
}
