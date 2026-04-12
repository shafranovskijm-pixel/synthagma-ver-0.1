import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Plus, Radio, Video, Calendar, Users, Copy, ExternalLink, Square, Loader2, Trash2, RefreshCw } from "lucide-react";
import { CreateWebinarDialog } from "./CreateWebinarDialog";
import { WebinarParticipantsDialog } from "./WebinarParticipantsDialog";
import { format } from "date-fns";
import { ru } from "date-fns/locale";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";

interface Webinar {
  id: string;
  title: string;
  description: string | null;
  scheduled_at: string | null;
  duration_minutes: number | null;
  status: string;
  source_type: string;
  kinescope_live_id: string | null;
  kinescope_video_id: string | null;
  external_url: string | null;
  embed_url: string | null;
  rtmp_url: string | null;
  rtmp_key: string | null;
  cover_url: string | null;
  created_at: string;
}

interface Props {
  organizationId: string;
}

export function WebinarsManager({ organizationId }: Props) {
  const { user } = useAuth();
  const [webinars, setWebinars] = useState<Webinar[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [participantsWebinar, setParticipantsWebinar] = useState<Webinar | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Webinar | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const fetchWebinars = useCallback(async () => {
    const { data } = await supabase
      .from("webinars")
      .select("*")
      .eq("organization_id", organizationId)
      .order("scheduled_at", { ascending: false, nullsFirst: false });
    setWebinars((data as any[]) || []);
    setLoading(false);
  }, [organizationId]);

  useEffect(() => { fetchWebinars(); }, [fetchWebinars]);

  const handleStopLive = async (w: Webinar) => {
    if (!w.kinescope_live_id) return;
    setActionLoading(w.id);
    try {
      const { data } = await supabase.functions.invoke("kinescope-proxy", {
        body: { action: "stop_live", live_id: w.kinescope_live_id },
      });
      await supabase.from("webinars").update({ status: "ended" } as any).eq("id", w.id);
      
      // Try to get recording
      const { data: liveData } = await supabase.functions.invoke("kinescope-proxy", {
        body: { action: "get_live", live_id: w.kinescope_live_id },
      });
      if (liveData?.data?.video_id) {
        await supabase.from("webinars").update({ kinescope_video_id: liveData.data.video_id } as any).eq("id", w.id);
      }
      toast.success("Трансляция остановлена");
      fetchWebinars();
    } catch (e: any) {
      toast.error(e.message || "Ошибка остановки трансляции");
    } finally {
      setActionLoading(null);
    }
  };

  const handleGoLive = async (w: Webinar) => {
    setActionLoading(w.id);
    await supabase.from("webinars").update({ status: "live" } as any).eq("id", w.id);
    toast.success("Статус обновлён — В эфире");
    fetchWebinars();
    setActionLoading(null);
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    await supabase.from("webinars").delete().eq("id", deleteTarget.id);
    toast.success("Вебинар удалён");
    setDeleteTarget(null);
    fetchWebinars();
  };

  const handleRefreshRecording = async (w: Webinar) => {
    if (!w.kinescope_live_id) return;
    setActionLoading(w.id);
    try {
      const { data } = await supabase.functions.invoke("kinescope-proxy", {
        body: { action: "get_live", live_id: w.kinescope_live_id },
      });
      if (data?.data?.video_id) {
        await supabase.from("webinars").update({
          kinescope_video_id: data.data.video_id,
          embed_url: `https://kinescope.io/embed/${data.data.video_id}`,
        } as any).eq("id", w.id);
        toast.success("Запись найдена!");
        fetchWebinars();
      } else {
        toast.info("Запись ещё не готова");
      }
    } catch {
      toast.error("Ошибка получения записи");
    } finally {
      setActionLoading(null);
    }
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast.success(`${label} скопирован`);
  };

  const statusBadge = (status: string) => {
    switch (status) {
      case "live": return <Badge className="bg-destructive text-destructive-foreground animate-pulse"><Radio className="w-3 h-3 mr-1" />В эфире</Badge>;
      case "ended": return <Badge variant="secondary">Завершён</Badge>;
      default: return <Badge variant="outline"><Calendar className="w-3 h-3 mr-1" />Запланирован</Badge>;
    }
  };

  if (loading) {
    return <div className="flex justify-center py-12"><Loader2 className="animate-spin w-8 h-8 text-muted-foreground" /></div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Вебинары</h3>
        <Button onClick={() => setShowCreate(true)} size="sm">
          <Plus className="w-4 h-4 mr-2" />Создать вебинар
        </Button>
      </div>

      {webinars.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <Video className="w-12 h-12 mx-auto mb-4 opacity-40" />
          <p className="text-lg font-medium">Нет вебинаров</p>
          <p className="text-sm mb-4">Создайте первый вебинар через Kinescope или добавьте внешнюю ссылку</p>
          <Button onClick={() => setShowCreate(true)} variant="outline">
            <Plus className="w-4 h-4 mr-2" />Создать вебинар
          </Button>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {webinars.map((w) => (
            <Card key={w.id} className="p-4 space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <h4 className="font-medium truncate">{w.title}</h4>
                  {w.description && <p className="text-sm text-muted-foreground line-clamp-2">{w.description}</p>}
                </div>
                {statusBadge(w.status)}
              </div>

              <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                {w.scheduled_at && (
                  <span className="flex items-center gap-1">
                    <Calendar className="w-3 h-3" />
                    {format(new Date(w.scheduled_at), "d MMM yyyy, HH:mm", { locale: ru })}
                  </span>
                )}
                {w.duration_minutes && <span>{w.duration_minutes} мин</span>}
                <Badge variant="outline" className="text-xs">
                  {w.source_type === "kinescope" ? "Kinescope" : "Внешняя ссылка"}
                </Badge>
              </div>

              {/* Kinescope RTMP info */}
              {w.source_type === "kinescope" && w.rtmp_url && w.status === "planned" && (
                <div className="bg-muted/50 rounded-lg p-3 space-y-2 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">RTMP URL:</span>
                    <Button variant="ghost" size="sm" className="h-6 px-2" onClick={() => copyToClipboard(w.rtmp_url!, "RTMP URL")}>
                      <Copy className="w-3 h-3" />
                    </Button>
                  </div>
                  <code className="block truncate text-[10px]">{w.rtmp_url}</code>
                  {w.rtmp_key && (
                    <>
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">Stream Key:</span>
                        <Button variant="ghost" size="sm" className="h-6 px-2" onClick={() => copyToClipboard(w.rtmp_key!, "Stream Key")}>
                          <Copy className="w-3 h-3" />
                        </Button>
                      </div>
                      <code className="block truncate text-[10px]">{w.rtmp_key}</code>
                    </>
                  )}
                </div>
              )}

              {/* Recording link */}
              {w.kinescope_video_id && (
                <div className="flex items-center gap-2 text-xs">
                  <Video className="w-3 h-3 text-primary" />
                  <span className="text-primary font-medium">Запись доступна</span>
                </div>
              )}

              {/* Actions */}
              <div className="flex flex-wrap gap-2 pt-1">
                {w.status === "planned" && w.source_type === "kinescope" && (
                  <Button size="sm" variant="default" onClick={() => handleGoLive(w)} disabled={actionLoading === w.id}>
                    {actionLoading === w.id ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Radio className="w-3 h-3 mr-1" />}
                    В эфир
                  </Button>
                )}
                {w.status === "live" && w.source_type === "kinescope" && (
                  <Button size="sm" variant="destructive" onClick={() => handleStopLive(w)} disabled={actionLoading === w.id}>
                    {actionLoading === w.id ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Square className="w-3 h-3 mr-1" />}
                    Остановить
                  </Button>
                )}
                {w.status === "ended" && w.source_type === "kinescope" && !w.kinescope_video_id && (
                  <Button size="sm" variant="outline" onClick={() => handleRefreshRecording(w)} disabled={actionLoading === w.id}>
                    <RefreshCw className="w-3 h-3 mr-1" />Проверить запись
                  </Button>
                )}
                {w.embed_url && (
                  <Button size="sm" variant="outline" asChild>
                    <a href={w.embed_url} target="_blank" rel="noreferrer">
                      <ExternalLink className="w-3 h-3 mr-1" />Смотреть
                    </a>
                  </Button>
                )}
                {w.external_url && (
                  <Button size="sm" variant="outline" asChild>
                    <a href={w.external_url} target="_blank" rel="noreferrer">
                      <ExternalLink className="w-3 h-3 mr-1" />Открыть
                    </a>
                  </Button>
                )}
                <Button size="sm" variant="outline" onClick={() => setParticipantsWebinar(w)}>
                  <Users className="w-3 h-3 mr-1" />Участники
                </Button>
                <Button size="sm" variant="ghost" className="text-destructive" onClick={() => setDeleteTarget(w)}>
                  <Trash2 className="w-3 h-3" />
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      <CreateWebinarDialog
        open={showCreate}
        onOpenChange={setShowCreate}
        organizationId={organizationId}
        userId={user?.id}
        onCreated={fetchWebinars}
      />

      {participantsWebinar && (
        <WebinarParticipantsDialog
          open={!!participantsWebinar}
          onOpenChange={(o) => !o && setParticipantsWebinar(null)}
          webinar={participantsWebinar}
          organizationId={organizationId}
        />
      )}

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Удалить вебинар?</AlertDialogTitle>
            <AlertDialogDescription>
              Вебинар «{deleteTarget?.title}» будет удалён. Это действие нельзя отменить.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Отмена</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground">Удалить</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
