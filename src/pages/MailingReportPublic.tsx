import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Helmet } from "react-helmet-async";
import { format } from "date-fns";
import { ru } from "date-fns/locale";

interface ReportData {
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

const fmt = (d?: string | null) => (d ? format(new Date(d), "d MMMM yyyy, HH:mm", { locale: ru }) : "—");
const rate = (part = 0, total = 0) => (total > 0 ? `${Math.round((part / total) * 1000) / 10}%` : "—");

/**
 * Публичная read-only страница отчёта по токену.
 * Данные приходят только из SECURITY DEFINER RPC get_mailing_report_by_token
 * и содержат исключительно агрегаты — без email, ФИО и текстов ошибок.
 */
export default function MailingReportPublic() {
  const { token } = useParams<{ token: string }>();
  const [data, setData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    supabase
      .rpc("get_mailing_report_by_token", { p_token: token })
      .then(({ data: res, error }) => {
        setData(error ? { valid: false, reason: "error" } : ((res as unknown) as ReportData));
        setLoading(false);
      });
  }, [token]);

  const metrics = data?.valid
    ? [
        { label: "Получателей", value: data.total_recipients ?? 0, hint: "" },
        { label: "Принято SMTP", value: data.accepted ?? 0, hint: rate(data.accepted, data.total_recipients) },
        { label: "Ошибки", value: data.failed ?? 0, hint: rate(data.failed, data.total_recipients) },
        { label: "Отказы (bounce)", value: data.bounced ?? 0, hint: rate(data.bounced, data.total_recipients) },
        { label: "Открытия", value: data.opened ?? 0, hint: rate(data.opened, data.accepted) },
        { label: "Клики", value: data.clicked ?? 0, hint: rate(data.clicked, data.accepted) },
        { label: "Отписки", value: data.unsubscribed ?? 0, hint: rate(data.unsubscribed, data.accepted) },
      ]
    : [];

  return (
    <div className="min-h-screen bg-background px-4 py-10">
      <Helmet>
        <title>Отчёт по рассылке | СИНТАГМА</title>
        <meta name="description" content="Публичный отчёт по email-рассылке: доставка, открытия, клики и отписки." />
        <meta name="robots" content="noindex,nofollow" />
      </Helmet>

      <div className="mx-auto max-w-2xl space-y-4">
        <h1 className="text-2xl font-semibold">Отчёт по рассылке</h1>

        {loading ? (
          <p className="text-sm text-muted-foreground">Загрузка…</p>
        ) : !data?.valid ? (
          <Card>
            <CardContent className="p-6 text-sm text-muted-foreground" data-testid="report-invalid">
              Ссылка недействительна, отозвана или срок её действия истёк.
            </CardContent>
          </Card>
        ) : (
          <>
            <Card>
              <CardHeader>
                <CardTitle className="text-base">{data.campaign_name}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <p className="text-muted-foreground">Тема: {data.subject}</p>
                <div className="flex flex-wrap gap-2">
                  <Badge variant="outline">Статус: {data.status}</Badge>
                  <Badge variant="outline">Старт: {fmt(data.started_at)}</Badge>
                  <Badge variant="outline">Завершено: {fmt(data.completed_at)}</Badge>
                </div>
              </CardContent>
            </Card>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3" data-testid="report-metrics">
              {metrics.map((m) => (
                <Card key={m.label}>
                  <CardContent className="p-4">
                    <p className="text-xs text-muted-foreground">{m.label}</p>
                    <p className="text-xl font-semibold">{m.value}</p>
                    {m.hint && <p className="text-xs text-muted-foreground">{m.hint}</p>}
                  </CardContent>
                </Card>
              ))}
            </div>

            <p className="rounded-lg border bg-muted/30 p-3 text-xs text-muted-foreground">
              «Принято SMTP» означает, что сервер получателя принял письмо к обработке. Это не гарантирует
              попадание в папку «Входящие»: письмо может быть отфильтровано в спам или отложено. Открытия
              считаются по загрузке пикселя и занижены при отключённых изображениях; клики — по переходам
              по ссылкам письма.
            </p>
            <p className="text-xs text-muted-foreground">Ссылка действует до {fmt(data.expires_at)}.</p>
          </>
        )}
      </div>
    </div>
  );
}
