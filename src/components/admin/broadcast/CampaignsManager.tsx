import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Mail, Plus, Play, Trash2, BarChart2 } from "lucide-react";
import { useEmailCampaigns } from "@/hooks/useEmailCampaigns";
import { CampaignEditor } from "./CampaignEditor";
import { CampaignReport } from "./CampaignReport";
import { WarmupBadge } from "./WarmupBadge";
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
    return "bg-muted text-muted-foreground";
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
              {campaigns.map(c => (
                <div key={c.id} className="flex items-center gap-3 p-3 rounded-lg border border-border bg-muted/20">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-sm truncate">{c.name}</p>
                      <Badge className={statusColor(c.status)} variant="outline">{c.status}</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground truncate">{c.subject}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {format(new Date(c.created_at), "d MMM yyyy HH:mm", { locale: ru })}
                      {" · "}
                      Получателей: {c.total_recipients} · Отправлено: {c.sent_count} · Ошибок: {c.failed_count} · Открытий: {c.open_count}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {(c.status === "draft" || c.status === "paused") && (
                      <Button size="sm" variant="ghost" onClick={() => launch(c.id)} className="gap-1">
                        <Play className="w-3 h-3" />
                        {c.status === "paused" ? "Продолжить" : "Запустить"}
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
              ))}
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
