import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Download, Link2, Info, Mail } from "lucide-react";
import { format } from "date-fns";
import { ru } from "date-fns/locale";
import { loadAllReportPages } from "@/lib/mailing/reportPagination";
import {
  campaignAttachmentSummary,
  extractCampaignTemplateVariables,
  sanitizeCampaignHtmlForReport,
} from "@/lib/mailing/campaignContentPreview";

interface Recipient {
  id: string;
  email: string;
  recipient_name: string | null;
  status: string;
  error: string | null;
  sent_at: string | null;
  opened_at: string | null;
}

interface Stats {
  total: number;
  accepted: number;
  failed: number;
  bounced: number;
  opened: number;
  clicked: number;
  unsubscribed: number;
}

interface CampaignContent {
  name: string;
  status: string;
  subject: string;
  subject_b: string | null;
  html_body: string;
  from_name: string | null;
  reply_to: string | null;
  recipient_filter: unknown;
  sent_count: number;
}

const rate = (part: number, total: number) => (total > 0 ? `${Math.round((part / total) * 1000) / 10}%` : "—");

async function loadAllRecipients(campaignId: string): Promise<Recipient[]> {
  return loadAllReportPages(async (from, to) => {
    const { data, error } = await supabase
      .from("email_campaign_recipients")
      .select("id, email, recipient_name, status, error, sent_at, opened_at")
      .eq("campaign_id", campaignId)
      .order("sent_at", { ascending: false, nullsFirst: false })
      .order("id", { ascending: true })
      .range(from, to);

    if (error) throw error;
    return (data || []) as Recipient[];
  });
}

async function loadAllClickedRecipientIds(campaignId: string): Promise<string[]> {
  const pages = await loadAllReportPages(async (from, to) => {
    const { data, error } = await supabase
      .from("email_campaign_clicks")
      .select("id, recipient_id")
      .eq("campaign_id", campaignId)
      .order("id", { ascending: true })
      .range(from, to);

    if (error) throw error;
    return data || [];
  });

  return pages.flatMap((row) => (row.recipient_id ? [row.recipient_id] : []));
}

async function loadCampaignContent(campaignId: string): Promise<CampaignContent> {
  const { data, error } = await supabase
    .from("email_campaigns")
    .select("name, status, subject, subject_b, html_body, from_name, reply_to, recipient_filter, sent_count")
    .eq("id", campaignId)
    .single();

  if (error) throw error;
  return data as CampaignContent;
}

export function CampaignReport({ campaignId, open, onClose }: { campaignId: string | null; open: boolean; onClose: () => void }) {
  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [loading, setLoading] = useState(false);
  const [clicked, setClicked] = useState(0);
  const [sharing, setSharing] = useState(false);
  const [campaign, setCampaign] = useState<CampaignContent | null>(null);

  useEffect(() => {
    if (!open || !campaignId) return;
    let active = true;
    setLoading(true);
    (async () => {
      try {
        const [allRecipients, clickedRecipientIds, campaignContent] = await Promise.all([
          loadAllRecipients(campaignId),
          loadAllClickedRecipientIds(campaignId),
          loadCampaignContent(campaignId),
        ]);
        if (!active) return;
        setRecipients(allRecipients);
        setClicked(new Set(clickedRecipientIds).size);
        setCampaign(campaignContent);
      } catch (error: any) {
        if (!active) return;
        setRecipients([]);
        setClicked(0);
        setCampaign(null);
        toast.error(error?.message || "Не удалось загрузить полный отчёт кампании");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [campaignId, open]);

  const campaignPreviewHtml = useMemo(
    () => sanitizeCampaignHtmlForReport(campaign?.html_body || ""),
    [campaign?.html_body],
  );
  const campaignVariables = useMemo(
    () => extractCampaignTemplateVariables(campaign?.subject, campaign?.subject_b, campaign?.html_body),
    [campaign?.subject, campaign?.subject_b, campaign?.html_body],
  );

  const stats: Stats = useMemo(() => {
    const total = recipients.length;
    const by = (fn: (r: Recipient) => boolean) => recipients.filter(fn).length;
    return {
      total,
      accepted: by((r) => ["sent", "opened", "clicked"].includes(r.status)),
      failed: by((r) => r.status === "failed"),
      bounced: by((r) => r.status === "bounced"),
      opened: by((r) => !!r.opened_at),
      clicked,
      unsubscribed: by((r) => r.status === "unsubscribed"),
    };
  }, [recipients, clicked]);

  const statusVariant = (s: string): any => {
    if (s === "sent" || s === "opened") return "default";
    if (s === "failed" || s === "bounced") return "destructive";
    return "secondary";
  };

  const exportCsv = () => {
    const header = ["email", "name", "status", "error", "sent_at", "opened_at"];
    const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const lines = [header.join(",")].concat(
      recipients.map((r) =>
        [r.email, r.recipient_name, r.status, r.error, r.sent_at, r.opened_at].map(esc).join(","),
      ),
    );
    const blob = new Blob(["\uFEFF" + lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `campaign_report_${campaignId}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const shareLink = async () => {
    if (!campaignId) return;
    setSharing(true);
    try {
      const { data, error } = await supabase.rpc("create_mailing_report_link", {
        p_campaign_id: campaignId,
        p_days: 30,
      });
      if (error) throw error;
      const payload = data as any;
      const token = payload?.token;
      if (!token) throw new Error(payload?.reason || "Не удалось создать ссылку");
      const url = `${window.location.origin}/mailing/report/${token}`;
      await navigator.clipboard?.writeText(url).catch(() => {});
      toast.success("Ссылка для клиента скопирована (действует 30 дней)");
    } catch (e: any) {
      toast.error(e?.message || "Нет прав на создание ссылки");
    } finally {
      setSharing(false);
    }
  };

  const metrics = [
    { label: "Получателей", value: stats.total, hint: "" },
    { label: "Принято SMTP", value: stats.accepted, hint: rate(stats.accepted, stats.total) },
    { label: "Ошибки", value: stats.failed, hint: rate(stats.failed, stats.total) },
    { label: "Отказы (bounce)", value: stats.bounced, hint: rate(stats.bounced, stats.total) },
    { label: "Открытия", value: stats.opened, hint: rate(stats.opened, stats.accepted) },
    { label: "Клики", value: stats.clicked, hint: rate(stats.clicked, stats.accepted) },
    { label: "Отписки", value: stats.unsubscribed, hint: rate(stats.unsubscribed, stats.accepted) },
  ];

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Отчёт по кампании</DialogTitle>
        </DialogHeader>
        {loading ? (
          <p className="text-sm text-muted-foreground">Загрузка...</p>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" data-testid="campaign-report-metrics">
              {metrics.map((m) => (
                <div key={m.label} className="rounded-lg border bg-muted/30 p-3">
                  <p className="text-xs text-muted-foreground">{m.label}</p>
                  <p className="text-lg font-semibold">{m.value}</p>
                  {m.hint && <p className="text-xs text-muted-foreground">{m.hint}</p>}
                </div>
              ))}
            </div>

            <p className="flex items-start gap-2 rounded-lg border bg-muted/30 p-3 text-xs text-muted-foreground">
              <Info className="mt-0.5 h-4 w-4 shrink-0" />
              «Принято SMTP» не гарантирует попадание письма в «Входящие»: письмо может уйти в спам или быть
              отложено. Открытия считаются по пикселю (занижены при отключённых картинках), клики — по
              переходам по ссылкам.
            </p>

            {campaign && (
              <section
                className="space-y-3 rounded-lg border border-border bg-card p-4"
                data-testid="campaign-report-content"
              >
                <div className="flex items-start gap-3">
                  <Mail className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">
                      {campaign.sent_count > 0 ? "Что было отправлено" : "Письмо кампании"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {campaign.sent_count > 0
                        ? "Сохранённый шаблон кампании. Персональные значения подставлялись отдельно для каждого получателя."
                        : "Шаблон, подготовленный к отправке."}
                    </p>
                  </div>
                  <Badge variant="outline">{campaign.status}</Badge>
                </div>

                <dl className="grid gap-2 text-sm sm:grid-cols-2">
                  <div className="rounded-md bg-muted/30 p-3 sm:col-span-2">
                    <dt className="text-xs text-muted-foreground">Тема</dt>
                    <dd className="mt-1 font-medium break-words" data-testid="campaign-report-subject">
                      {campaign.subject}
                    </dd>
                  </div>
                  {campaign.subject_b && (
                    <div className="rounded-md bg-muted/30 p-3 sm:col-span-2">
                      <dt className="text-xs text-muted-foreground">Тема B</dt>
                      <dd className="mt-1 font-medium break-words">{campaign.subject_b}</dd>
                    </div>
                  )}
                  <div className="rounded-md bg-muted/30 p-3">
                    <dt className="text-xs text-muted-foreground">Отправитель</dt>
                    <dd className="mt-1 break-words">{campaign.from_name || "Адрес подключённого ящика"}</dd>
                  </div>
                  <div className="rounded-md bg-muted/30 p-3">
                    <dt className="text-xs text-muted-foreground">Ответы</dt>
                    <dd className="mt-1 break-words">{campaign.reply_to || "На ящик отправителя"}</dd>
                  </div>
                  <div className="rounded-md bg-muted/30 p-3 sm:col-span-2">
                    <dt className="text-xs text-muted-foreground">Вложения</dt>
                    <dd className="mt-1">{campaignAttachmentSummary(campaign.recipient_filter)}</dd>
                  </div>
                </dl>

                <div>
                  <p className="mb-2 text-xs text-muted-foreground">Текст письма</p>
                  <div
                    className="prose prose-sm max-w-none rounded-md border bg-background p-4 dark:prose-invert [&_a]:text-primary [&_a]:underline"
                    data-testid="campaign-report-body"
                    dangerouslySetInnerHTML={{ __html: campaignPreviewHtml }}
                  />
                </div>

                {campaignVariables.length > 0 && (
                  <div className="flex flex-wrap items-center gap-1.5" data-testid="campaign-report-variables">
                    <span className="mr-1 text-xs text-muted-foreground">Персонализация:</span>
                    {campaignVariables.map((variable) => (
                      <Badge key={variable} variant="secondary" className="font-mono text-[11px]">
                        {`{{${variable}}}`}
                      </Badge>
                    ))}
                  </div>
                )}

                <p className="flex items-start gap-2 text-xs text-muted-foreground">
                  <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  В предпросмотре отключены внешние изображения, формы и переходы по ссылкам: просмотр отчёта не
                  запускает трекинг письма.
                </p>
              </section>
            )}

            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={exportCsv} data-testid="campaign-report-csv">
                <Download className="mr-2 h-4 w-4" /> Экспорт CSV
              </Button>
              <Button size="sm" variant="outline" onClick={shareLink} disabled={sharing} data-testid="campaign-report-share">
                <Link2 className="mr-2 h-4 w-4" /> Ссылка клиенту
              </Button>
            </div>

            <div className="space-y-2">
              {recipients.length === 0 && <p className="text-sm text-muted-foreground">Получателей нет</p>}
              {recipients.map((r) => (
                <div key={r.id} className="flex items-center gap-3 p-3 rounded-lg border border-border bg-muted/30">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{r.email}</p>
                    {r.error && <p className="text-xs text-destructive truncate">{r.error}</p>}
                    {r.sent_at && (
                      <p className="text-xs text-muted-foreground">
                        Отправлено: {format(new Date(r.sent_at), "d MMM HH:mm", { locale: ru })}
                        {r.opened_at && ` · Открыто: ${format(new Date(r.opened_at), "d MMM HH:mm", { locale: ru })}`}
                      </p>
                    )}
                  </div>
                  <Badge variant={statusVariant(r.status)}>{r.status}</Badge>
                </div>
              ))}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
