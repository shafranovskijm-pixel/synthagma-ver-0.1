import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { BarChart3, Loader2 } from "lucide-react";

interface PublicReport {
  valid: boolean;
  reason?: string;
  campaign_name?: string;
  subject?: string;
  status?: string;
  started_at?: string | null;
  completed_at?: string | null;
  total_recipients?: number;
  accepted?: number;
  failed?: number;
  bounced?: number;
  opened?: number;
  clicked?: number;
  unsubscribed?: number;
  expires_at?: string | null;
}

const REASONS: Record<string, string> = {
  invalid: "Ссылка недействительна.",
  expired: "Срок действия ссылки истёк.",
  disabled: "Ссылка отключена автором отчёта.",
};

function rate(part = 0, total = 0) {
  if (!total) return "—";
  return `${((part / total) * 100).toFixed(1)}%`;
}

export default function MailingReportPublic() {
  const { token } = useParams<{ token: string }>();
  const [report, setReport] = useState<PublicReport | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data, error } = await supabase.rpc("get_mailing_report_by_token", {
        p_token: token ?? "",
      });
      setReport(error ? { valid: false, reason: "invalid" } : (data as unknown as PublicReport));
      setLoading(false);
    })();
  }, [token]);

  const metrics = report?.valid
    ? [
        { label: "Всего получателей", value: report.total_recipients ?? 0, hint: "Размер выборки" },
        { label: "SMTP принял", value: report.accepted ?? 0, hint: rate(report.accepted, report.total_recipients) },
        { label: "Ошибки отправки", value: report.failed ?? 0, hint: rate(report.failed, report.total_recipients) },
        { label: "Bounce", value: report.bounced ?? 0, hint: rate(report.bounced, report.total_recipients) },
        { label: "Прочитано", value: report.opened ?? 0, hint: rate(report.opened, report.accepted) },
        { label: "Переходы", value: report.clicked ?? 0, hint: rate(report.clicked, report.accepted) },
        { label: "Отписки", value: report.unsubscribed ?? 0, hint: rate(report.unsubscribed, report.accepted) },
      ]
    : [];

  return (
    <div className="min-h-screen bg-muted/20 py-10">
      <Helmet>
        <title>Отчёт по рассылке — СИНТАГМА</title>
        <meta name="robots" content="noindex, nofollow" />
      </Helmet>

      <div className="container mx-auto max-w-3xl px-4">
        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-primary" />
              Отчёт по email-рассылке
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            {loading && (
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Загружаем отчёт…
              </p>
            )}

            {!loading && !report?.valid && (
              <p className="text-sm text-muted-foreground">
                {REASONS[report?.reason ?? "invalid"] ?? REASONS.invalid}
              </p>
            )}

            {!loading && report?.valid && (
              <>
                <div>
                  <p className="text-lg font-semibold">{report.campaign_name}</p>
                  <p className="text-sm text-muted-foreground">Тема: {report.subject}</p>
                  <Badge variant="outline" className="mt-2">
                    Статус: {report.status}
                  </Badge>
                </div>

                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {metrics.map((m) => (
                    <div key={m.label} className="rounded-xl border bg-card p-4">
                      <p className="text-xs text-muted-foreground">{m.label}</p>
                      <p className="mt-1 text-2xl font-semibold">{m.value}</p>
                      <p className="text-xs text-muted-foreground">{m.hint}</p>
                    </div>
                  ))}
                </div>

                <p className="text-xs text-muted-foreground">
                  «SMTP принял» означает, что почтовый сервер принял письмо к доставке. Это не
                  гарантия попадания во входящие: часть писем может уйти в спам или быть отклонена
                  получающей стороной. Отчёт содержит только сводные показатели — персональные
                  данные получателей в него не входят.
                </p>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
