import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { BarChart3, CheckCircle2, AlertTriangle, Mail, Plus } from "lucide-react";
import { useEmailCampaigns } from "@/hooks/useEmailCampaigns";
import { useOrgSmtp } from "@/hooks/useOrgSmtp";
import { supabase } from "@/integrations/supabase/client";

interface Props {
  organizationId: string | null;
  onNewCampaign: () => void;
  onGoToSenders: () => void;
}

export function MailingOverviewTab({ organizationId, onNewCampaign, onGoToSenders }: Props) {
  const { campaigns, loading } = useEmailCampaigns("org", organizationId);
  const { settings, loading: smtpLoading } = useOrgSmtp(organizationId);

  // Подключённые отправители («Отправители») — основной путь готовности.
  const [verifiedSender, setVerifiedSender] = useState<{ label: string; from_email: string } | null>(null);
  const [sendersLoading, setSendersLoading] = useState(true);
  useEffect(() => {
    if (!organizationId) { setVerifiedSender(null); setSendersLoading(false); return; }
    let cancelled = false;
    setSendersLoading(true);
    (async () => {
      const { data } = await supabase
        .from("mailing_senders")
        .select("label, from_email")
        .eq("organization_id", organizationId)
        .eq("is_active", true)
        .eq("smtp_status", "ok")
        .order("created_at", { ascending: false })
        .limit(1);
      if (cancelled) return;
      setVerifiedSender(((data || [])[0] as { label: string; from_email: string }) || null);
      setSendersLoading(false);
    })();
    return () => { cancelled = true; };
  }, [organizationId]);


  const totals = campaigns.reduce(
    (acc, c) => ({
      sent: acc.sent + (c.sent_count || 0),
      failed: acc.failed + (c.failed_count || 0),
      opened: acc.opened + (c.open_count || 0),
      clicked: acc.clicked + (c.click_count || 0),
    }),
    { sent: 0, failed: 0, opened: 0, clicked: 0 },
  );

  const kpis = [
    { label: "Кампаний", value: campaigns.length },
    { label: "SMTP принял", value: totals.sent },
    { label: "Прочитано", value: totals.opened },
    { label: "Переходы", value: totals.clicked },
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {kpis.map((k) => (
          <Card key={k.label}>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">{k.label}</p>
              <p className="mt-1 text-2xl font-semibold">{loading ? "—" : k.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <Mail className="h-4 w-4 text-primary" />
            Готовность отправителя
          </CardTitle>
          <Button variant="outline" size="sm" onClick={onGoToSenders}>
            Настроить
          </Button>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          {smtpLoading ? (
            <p className="text-muted-foreground">Проверяем…</p>
          ) : !settings ? (
            <p className="flex items-center gap-2 text-orange-600">
              <AlertTriangle className="h-4 w-4" />
              SMTP не подключён — рассылку запустить нельзя.
            </p>
          ) : settings.is_verified ? (
            <p className="flex items-center gap-2 text-emerald-600">
              <CheckCircle2 className="h-4 w-4" />
              {settings.from_email} — соединение проверено.
            </p>
          ) : (
            <p className="flex items-center gap-2 text-orange-600">
              <AlertTriangle className="h-4 w-4" />
              {settings.from_email} — тест соединения ещё не пройден.
            </p>
          )}
          <p className="text-xs text-muted-foreground">
            «SMTP принял» означает, что сервер принял письмо к доставке. Это не гарантия попадания
            во «Входящие».
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <BarChart3 className="h-4 w-4 text-primary" />
            Последние кампании
          </CardTitle>
          <Button size="sm" className="gap-1" onClick={onNewCampaign}>
            <Plus className="h-4 w-4" />
            Новая рассылка
          </Button>
        </CardHeader>
        <CardContent className="space-y-2">
          {loading ? (
            <p className="text-sm text-muted-foreground">Загрузка…</p>
          ) : campaigns.length === 0 ? (
            <p className="text-sm text-muted-foreground">Кампаний пока нет.</p>
          ) : (
            campaigns.slice(0, 5).map((c) => (
              <div key={c.id} className="flex items-center gap-3 rounded-lg border p-3">
                <span className="flex-1 truncate text-sm font-medium">{c.name}</span>
                <span className="text-xs text-muted-foreground">
                  {c.sent_count || 0}/{c.total_recipients || 0}
                </span>
                <Badge variant="outline">{c.status}</Badge>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
