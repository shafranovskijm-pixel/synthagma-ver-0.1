import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Mail, Plus, Play, Trash2, BarChart2, RefreshCw, Clock } from "lucide-react";
import { useEmailCampaigns } from "@/hooks/useEmailCampaigns";
import { CampaignEditor } from "./CampaignEditor";
import { CampaignReport } from "./CampaignReport";
import { WarmupBadge } from "./WarmupBadge";
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
  const [reportFor, setReportFor] = useState<string | null>(null);

  const scopeKey = scope === "platform" ? "platform" : (organizationId || "");

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
      {scopeKey && <WarmupBadge scopeKey={scopeKey} />}

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Mail className="w-5 h-5" />
            Email-кампании
          </CardTitle>
          <Button onClick={() => setEditorOpen(true)} className="gap-2">
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
                    {(c.status === "draft" || c.status === "paused" || stuck) && (
                      <Button size="sm" variant="ghost" onClick={() => launch(c.id)} className="gap-1">
                        <Play className="w-3 h-3" />
                        {c.status === "paused" || stuck ? "Продолжить" : "Запустить"}
                      </Button>
                    )}
                    <Button size="sm" variant="ghost" onClick={() => setReportFor(c.id)}>
                      <BarChart2 className="w-3 h-3" />
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => remove(c.id)} className="text-destructive">
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
        open={editorOpen}
        onClose={() => setEditorOpen(false)}
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
