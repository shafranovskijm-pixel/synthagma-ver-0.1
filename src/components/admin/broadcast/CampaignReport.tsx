import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Download, Link2, Info } from "lucide-react";
import { format } from "date-fns";
import { ru } from "date-fns/locale";
import { loadAllReportPages } from "@/lib/mailing/reportPagination";

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

export function CampaignReport({ campaignId, open, onClose }: { campaignId: string | null; open: boolean; onClose: () => void }) {
  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [loading, setLoading] = useState(false);
  const [clicked, setClicked] = useState(0);
  const [sharing, setSharing] = useState(false);

  useEffect(() => {
    if (!open || !campaignId) return;
    let active = true;
    setLoading(true);
    (async () => {
      try {
        const [allRecipients, clickedRecipientIds] = await Promise.all([
          loadAllRecipients(campaignId),
          loadAllClickedRecipientIds(campaignId),
        ]);
        if (!active) return;
        setRecipients(allRecipients);
        setClicked(new Set(clickedRecipientIds).size);
      } catch (error: any) {
        if (!active) return;
        setRecipients([]);
        setClicked(0);
        toast.error(error?.message || "Не удалось загрузить полный отчёт кампании");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [campaignId, open]);

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
