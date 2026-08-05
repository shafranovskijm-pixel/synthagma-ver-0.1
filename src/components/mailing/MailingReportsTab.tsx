import { useCallback, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Download, Link2, LinkIcon, BarChart3, EyeOff } from "lucide-react";
import { toast } from "sonner";
import { useEmailCampaigns, type EmailCampaign } from "@/hooks/useEmailCampaigns";
import { useMailingReportLinks } from "@/hooks/useMailingReportLinks";

interface Props {
  organizationId: string | null;
}

function pct(part: number, total: number) {
  if (!total) return "—";
  return `${((part / total) * 100).toFixed(1)}%`;
}

export function MailingReportsTab({ organizationId }: Props) {
  const { campaigns, loading } = useEmailCampaigns("org", organizationId);
  const { links, createLink, setActive } = useMailingReportLinks(organizationId);
  const [busy, setBusy] = useState<string | null>(null);

  const exportCsv = useCallback(async (c: EmailCampaign) => {
    setBusy(c.id);
    const { data, error } = await supabase
      .from("email_campaign_recipients")
      .select("email, status, error, sent_at, opened_at")
      .eq("campaign_id", c.id)
      .limit(5000);
    setBusy(null);
    if (error) {
      toast.error("Не удалось выгрузить: " + error.message);
      return;
    }
    const header = "email;status;error;sent_at;opened_at";
    const rows = (data || []).map((r) =>
      [r.email, r.status, (r.error || "").replace(/[;\n\r]/g, " "), r.sent_at || "", r.opened_at || ""].join(";"),
    );
    const csv = "\uFEFF" + [header, ...rows].join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `campaign-${c.id}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, []);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-primary" />
            Отчёты по кампаниям
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-muted-foreground">
            «SMTP принял» — сервер принял письмо к доставке. Это не то же самое, что «попало во
            входящие»: часть писем может уйти в спам. 100% доставку не гарантирует ни один сервис.
          </p>

          {loading ? (
            <p className="text-sm text-muted-foreground">Загрузка…</p>
          ) : campaigns.length === 0 ? (
            <p className="text-sm text-muted-foreground">Кампаний пока нет.</p>
          ) : (
            campaigns.map((c) => {
              const link = links.find((l) => l.campaign_id === c.id);
              const accepted = c.sent_count ?? 0;
              return (
                <div key={c.id} className="space-y-3 rounded-xl border p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="flex-1 truncate text-sm font-semibold">{c.name}</p>
                    <Badge variant="outline">{c.status}</Badge>
                  </div>

                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    {[
                      { l: "SMTP принял", v: accepted, h: pct(accepted, c.total_recipients) },
                      { l: "Ошибки / bounce", v: c.failed_count ?? 0, h: pct(c.failed_count ?? 0, c.total_recipients) },
                      { l: "Прочитано", v: c.open_count ?? 0, h: pct(c.open_count ?? 0, accepted) },
                      { l: "Переходы", v: c.click_count ?? 0, h: pct(c.click_count ?? 0, accepted) },
                      { l: "Отписки", v: c.unsubscribe_count ?? 0, h: pct(c.unsubscribe_count ?? 0, accepted) },
                      { l: "Всего получателей", v: c.total_recipients ?? 0, h: "выборка" },
                    ].map((m) => (
                      <div key={m.l} className="rounded-lg border bg-muted/20 p-3">
                        <p className="text-xs text-muted-foreground">{m.l}</p>
                        <p className="text-xl font-semibold">{m.v}</p>
                        <p className="text-xs text-muted-foreground">{m.h}</p>
                      </div>
                    ))}
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1"
                      disabled={busy === c.id}
                      onClick={() => exportCsv(c)}
                    >
                      <Download className="h-4 w-4" />
                      CSV
                    </Button>
                    {link ? (
                      <>
                        <Button
                          variant="outline"
                          size="sm"
                          className="gap-1"
                          onClick={() => {
                            navigator.clipboard
                              .writeText(`${window.location.origin}/mailing/report/${link.token}`)
                              .then(() => toast.success("Ссылка скопирована"))
                              .catch(() => toast.error("Не удалось скопировать"));
                          }}
                        >
                          <LinkIcon className="h-4 w-4" />
                          Копировать ссылку
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="gap-1"
                          onClick={() => setActive(link.id, !link.is_active)}
                        >
                          <EyeOff className="h-4 w-4" />
                          {link.is_active ? "Отключить ссылку" : "Включить ссылку"}
                        </Button>
                        <span className="self-center text-xs text-muted-foreground">
                          {link.expires_at
                            ? `действует до ${new Date(link.expires_at).toLocaleDateString("ru-RU")}`
                            : "без срока"}
                        </span>
                      </>
                    ) : (
                      <Button variant="outline" size="sm" className="gap-1" onClick={() => createLink(c.id)}>
                        <Link2 className="h-4 w-4" />
                        Ссылка клиенту
                      </Button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </CardContent>
      </Card>
    </div>
  );
}
