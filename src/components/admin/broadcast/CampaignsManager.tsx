import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Mail, Plus, Play, Trash2, BarChart2, RefreshCw, Clock, Pencil } from "lucide-react";
import { useEmailCampaigns } from "@/hooks/useEmailCampaigns";
import { CampaignEditor } from "./CampaignEditor";
import { buildEditorInitial, isCampaignEditable } from "@/lib/mailing/campaignEditMode";
import { CampaignReport } from "./CampaignReport";
import { WarmupBadge } from "./WarmupBadge";
import { supabase } from "@/integrations/supabase/client";
import {
  campaignLaunchAction,
  launchActionLabel,
  pickVerifiedSender,
  type VerifiedSenderLike,
} from "@/lib/mailing/launchActions";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { format } from "date-fns";
import { ru } from "date-fns/locale";

interface Props {
  scope: "platform" | "org";
  organizationId: string | null;
}

export function CampaignsManager({ scope, organizationId }: Props) {
  const { campaigns, loading, refresh, remove, launch } = useEmailCampaigns(scope, organizationId);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<ReturnType<typeof buildEditorInitial> | null>(null);
  const [reportFor, setReportFor] = useState<string | null>(null);

  const scopeKey = scope === "platform" ? "platform" : (organizationId || "");
  const [verifiedSender, setVerifiedSender] = useState<VerifiedSenderLike | null>(null);

  // Проверенный отправитель организации: активный + smtp_status='ok'.
  // Читается tenant-scoped (RLS ограничивает строки организацией).
  useEffect(() => {
    let cancelled = false;
    if (scope !== "org" || !organizationId) {
      setVerifiedSender(null);
      return;
    }
    (async () => {
      const { data } = await supabase
        .from("mailing_senders")
        .select("id, label, from_email, is_active, smtp_status")
        .eq("organization_id", organizationId)
        .eq("is_active", true)
        .eq("smtp_status", "ok")
        .order("created_at", { ascending: false })
        .limit(5);
      if (!cancelled) setVerifiedSender(pickVerifiedSender(data as VerifiedSenderLike[] | null));
    })();
    return () => { cancelled = true; };
  }, [scope, organizationId]);

  const statusColor = (s: string) => {
    if (s === "sending") return "bg-blue-500/10 text-blue-600";
    if (s === "completed") return "bg-green-500/10 text-green-600";
    if (s === "failed") return "bg-destructive/10 text-destructive";
    if (s === "paused") return "bg-orange-500/10 text-orange-600";
    if (s === "scheduled") return "bg-purple-500/10 text-purple-600";
    return "bg-muted text-muted-foreground";
  };

  const statusLabel = (s: string) => {
    const map: Record<string, string> = {
      draft: "черновик", sending: "отправляется", completed: "завершено",
      failed: "ошибка", paused: "пауза", scheduled: "запланировано",
    };
    return map[s] || s;
  };

  return (
    <div className="space-y-4">
      {verifiedSender ? (
        <div
          className="rounded-lg border border-border bg-muted/20 p-3 text-sm"
          data-testid="campaigns-sender-connected"
        >
          Отправитель подключён:{" "}
          <span className="font-medium">{verifiedSender.label || "без названия"}</span>
          {" — "}
          <span className="text-muted-foreground">{verifiedSender.from_email}</span>
        </div>
      ) : (
        scopeKey && <WarmupBadge scopeKey={scopeKey} />
      )}

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Mail className="w-5 h-5" />
            Email-кампании
          </CardTitle>
          <Button onClick={() => { setEditing(null); setEditorOpen(true); }} className="gap-2">
            <Plus className="w-4 h-4" />
            Новая кампания
          </Button>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-muted-foreground">Загрузка...</p>
          ) : campaigns.length === 0 ? (
            <p className="text-sm text-muted-foreground">Кампаний пока нет. Создайте первую.</p>
          ) : (
            <div className="space-y-2">
              {campaigns.map(c => {
                const startedAt = (c as any).started_at ? new Date((c as any).started_at) : null;
                const stuck = c.status === 'sending' && startedAt && (Date.now() - startedAt.getTime() > 10 * 60 * 1000);
                return (
                <div key={c.id} className="flex items-center gap-3 p-3 rounded-lg border border-border bg-muted/20">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-medium text-sm truncate">{c.name}</p>
                      <Badge className={statusColor(c.status)} variant="outline">{statusLabel(c.status)}</Badge>
                      {c.status === "scheduled" && c.scheduled_at && (
                        <Badge variant="outline" className="gap-1 bg-purple-500/10 text-purple-600 border-purple-500/30">
                          <Clock className="w-3 h-3" />
                          {format(new Date(c.scheduled_at), "d MMM, HH:mm", { locale: ru })}
                        </Badge>
                      )}
                      {c.status === "paused" && (
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Badge variant="outline" className="gap-1 bg-primary/10 text-primary border-primary/30">
                                <RefreshCw className="w-3 h-3 animate-spin" style={{ animationDuration: '3s' }} />
                                Продолжается автоматически
                              </Badge>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p className="text-xs max-w-xs">Кампания будет дослана в течение 5 минут.<br/>Платформа автоматически отправит оставшимся получателям.</p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      )}
                      {stuck && (
                        <Badge variant="outline" className="gap-1 bg-orange-500/10 text-orange-600 border-orange-500/30">
                          Зависла — нажмите «Продолжить»
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground truncate">{c.subject}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {format(new Date(c.created_at), "d MMM yyyy HH:mm", { locale: ru })}
                      {" · "}
                      Получателей: {c.total_recipients} · Отправлено: {c.sent_count} · Ошибок: {c.failed_count} · Открытий: {c.open_count}
                      {(c.click_count > 0 || c.unsubscribe_count > 0) && (
                        <> · Кликов: {c.click_count} · Отписок: {c.unsubscribe_count}</>
                      )}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {(() => {
                      const action = campaignLaunchAction(c.status, !!stuck);
                      if (action === "none") return null;
                      const label = launchActionLabel(action);
                      return (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="gap-1"
                          aria-label={`${label} — кампания «${c.name}»`}
                          data-testid={`campaign-${action}-${c.id}`}
                          onClick={() => {
                            if (action === "resume") {
                              launch(c.id);
                              return;
                            }
                            // Черновик/ошибка: только через редактор, где действуют
                            // обязательные проверки отправителя, получателей,
                            // согласия, переменных и квоты.
                            setEditing(buildEditorInitial(c as any));
                            setEditorOpen(true);
                          }}
                        >
                          <Play className="w-3 h-3" />
                          {label}
                        </Button>
                      );
                    })()}
                    {isCampaignEditable(c.status) && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="gap-1"
                        aria-label={`Редактировать кампанию «${c.name}»`}
                        data-testid={`campaign-edit-${c.id}`}
                        onClick={() => { setEditing(buildEditorInitial(c as any)); setEditorOpen(true); }}
                      >
                        <Pencil className="w-3 h-3" />
                        Редактировать
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      aria-label={`Отчёт по кампании «${c.name}»`}
                      onClick={() => setReportFor(c.id)}
                    >
                      <BarChart2 className="w-3 h-3" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      aria-label={`Удалить кампанию «${c.name}»`}
                      onClick={() => remove(c.id)}
                      className="text-destructive"
                    >
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  </div>
                </div>
              );})}
            </div>
          )}
        </CardContent>
      </Card>

      <CampaignEditor
        key={editing?.id || "new"}
        open={editorOpen}
        onClose={() => { setEditorOpen(false); setEditing(null); }}
        initial={editing || undefined}
        scope={scope}
        organizationId={organizationId}
        onCreated={refresh}
      />
      <CampaignReport
        campaignId={reportFor}
        open={!!reportFor}
        onClose={() => setReportFor(null)}
      />
    </div>
  );
}
