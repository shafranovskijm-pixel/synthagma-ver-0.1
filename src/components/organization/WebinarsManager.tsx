import { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Plus, Radio, Video, Calendar, Users, Copy, ExternalLink, Square, Trash2, RefreshCw, Pencil, CopyPlus, Link, Search, Clock, Zap, Share2, QrCode, Maximize2 } from "lucide-react";
import { CreateWebinarDialog } from "./CreateWebinarDialog";
import { WebinarParticipantsDialog } from "./WebinarParticipantsDialog";
import { ShareWebinarDialog } from "./ShareWebinarDialog";
import { EmbeddedWebinarPlayer } from "@/components/webinars/EmbeddedWebinarPlayer";
import { format } from "date-fns";
import { ru } from "date-fns/locale";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { InlinePlayerSettings, buildKinescopeEmbedUrl } from "./WebinarPlayerSettings";
import { SigmaSpinner } from "@/components/ui/SigmaSpinner";
import { getBaseUrl } from "@/utils/getBaseUrl";

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
  course_id: string | null;
  created_at: string;
  public_token: string | null;
  allow_guests: boolean;
  guest_password: string | null;
}

interface Props {
  organizationId: string;
}

export function WebinarsManager({ organizationId }: Props) {
  const { user } = useAuth();
  const [webinars, setWebinars] = useState<Webinar[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [editWebinar, setEditWebinar] = useState<Webinar | null>(null);
  const [participantsWebinar, setParticipantsWebinar] = useState<Webinar | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Webinar | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [embedWebinar, setEmbedWebinar] = useState<Webinar | null>(null);
  const [statusFilter, setStatusFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [shareWebinar, setShareWebinar] = useState<Webinar | null>(null);
  const [liveSheetWebinar, setLiveSheetWebinar] = useState<Webinar | null>(null);

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

  const filteredWebinars = useMemo(() => {
    let result = webinars;
    if (statusFilter !== "all") {
      result = result.filter((w) => w.status === statusFilter);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter((w) => w.title.toLowerCase().includes(q));
    }
    return result;
  }, [webinars, statusFilter, search]);

  const isSoon = (w: Webinar) => {
    if (!w.scheduled_at || w.status !== "planned") return false;
    const diff = new Date(w.scheduled_at).getTime() - Date.now();
    return diff > 0 && diff < 24 * 60 * 60 * 1000;
  };

  const handleStopLive = async (w: Webinar) => {
    setActionLoading(w.id);
    try {
      await supabase.from("webinars").update({ status: "ended" } as any).eq("id", w.id);
      toast.success("Эфир завершён. Если есть запись — введите Kinescope Video ID вручную.");
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

  const handleStartNow = async () => {
    setActionLoading("__start_now__");
    try {
      const now = new Date();
      const title = `Вебинар — ${format(now, "d MMM yyyy, HH:mm", { locale: ru })}`;
      const { data, error } = await supabase.functions.invoke("livekit-create-room", {
        body: { title },
      });
      if (error) throw error;
      if (!data?.ok || !data?.roomName) throw new Error(data?.error || "Не удалось создать комнату LiveKit");

      const insertData: Record<string, unknown> = {
        organization_id: organizationId,
        title,
        description: null,
        scheduled_at: now.toISOString(),
        duration_minutes: null,
        source_type: "livekit",
        status: "live",
        external_url: null,
        embed_url: null,
        course_id: null,
        created_by: user?.id,
        player_settings: {
          livekit: { roomName: data.roomName, wsUrl: data.wsUrl },
        },
      };
      const { data: inserted, error: insertErr } = await supabase
        .from("webinars")
        .insert(insertData as any)
        .select("*")
        .single();
      if (insertErr) throw insertErr;

      toast.success("Вебинар начат — открываю эфир в окне");
      await fetchWebinars();
      if (inserted) {
        // Открываем эфир в Sheet поверх дашборда (а не редиректом)
        setLiveSheetWebinar(inserted as any);
      }
    } catch (e: any) {
      toast.error(e.message || "Не удалось начать вебинар");
    } finally {
      setActionLoading(null);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    await supabase.from("webinars").delete().eq("id", deleteTarget.id);
    toast.success("Вебинар удалён");
    setDeleteTarget(null);
    fetchWebinars();
  };

  const handleRefreshRecording = async (w: Webinar) => {
    // Kinescope не отдаёт video_id Live через публичный API.
    // Менеджер вручную копирует Video ID из дашборда Kinescope и вставляет его через настройки плеера ниже.
    toast.info("Скопируйте Video ID записи из дашборда Kinescope и вставьте его в настройках плеера.");
    void w;
  };

  const handleDuplicate = async (w: Webinar) => {
    setActionLoading(w.id);
    try {
      const newData: Record<string, unknown> = {
        organization_id: organizationId,
        title: `${w.title} (копия)`,
        description: w.description,
        duration_minutes: w.duration_minutes,
        source_type: w.source_type,
        status: "planned",
        created_by: user?.id,
        cover_url: w.cover_url,
        course_id: w.course_id,
        external_url: w.external_url,
        embed_url: w.source_type === "external" ? w.external_url : null };
      const { error } = await supabase.from("webinars").insert(newData as any);
      if (error) throw error;
      toast.success("Вебинар дублирован");
      fetchWebinars();
    } catch (e: any) {
      toast.error(e.message || "Ошибка дублирования");
    } finally {
      setActionLoading(null);
    }
  };

  const copyWebinarLink = (w: Webinar) => {
    if (w.source_type === "livekit" && w.public_token) {
      const link = `${getBaseUrl()}/w/${w.public_token}`;
      navigator.clipboard.writeText(link);
      toast.success("Публичная ссылка скопирована — отправьте участникам");
      return;
    }
    const link = w.embed_url || w.external_url;
    if (link) {
      navigator.clipboard.writeText(link);
      toast.success("Ссылка скопирована");
    } else {
      toast.info("Ссылка не задана");
    }
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast.success(`${label} скопирован`);
  };

  const statusBadge = (w: Webinar) => {
    if (isSoon(w)) {
      return <Badge className="bg-amber-500 text-white"><Clock className="w-3 h-3 mr-1" />Скоро</Badge>;
    }
    switch (w.status) {
      case "live": return <Badge className="bg-destructive text-destructive-foreground animate-pulse"><Radio className="w-3 h-3 mr-1" />В эфире</Badge>;
      case "ended": return <Badge variant="secondary">Завершён</Badge>;
      default: return <Badge variant="outline"><Calendar className="w-3 h-3 mr-1" />Запланирован</Badge>;
    }
  };

  const getEmbedUrl = (w: Webinar & { player_settings?: any }) => {
    const ps = w.player_settings || {};
    if (w.kinescope_video_id) return buildKinescopeEmbedUrl(w.kinescope_video_id, ps);
    if (w.embed_url) return w.embed_url;
    return null;
  };

  if (loading) {
    return <div className="flex justify-center py-12"><SigmaSpinner size="lg" /></div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Вебинары</h3>
        <div className="flex items-center gap-2">
          <Button
            onClick={handleStartNow}
            size="sm"
            variant="default"
            disabled={actionLoading === "__start_now__"}
          >
            {actionLoading === "__start_now__" ? (
              <SigmaSpinner size="xs" className="mr-2" />
            ) : (
              <Zap className="w-4 h-4 mr-2" />
            )}
            Начать сейчас
          </Button>
          <Button onClick={() => { setEditWebinar(null); setShowCreate(true); }} size="sm" variant="outline">
            <Plus className="w-4 h-4 mr-2" />Создать вебинар
          </Button>
      </div>

      {/* Live now banner */}
      {webinars.filter(w => w.status === "live" && w.source_type === "livekit").map(w => (
        <Card key={`live-${w.id}`} className="p-4 border-destructive/40 bg-destructive/5">
          <div className="flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
            <div className="flex items-center gap-3 min-w-0">
              <span className="relative flex h-3 w-3 shrink-0">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-destructive opacity-75" />
                <span className="relative inline-flex rounded-full h-3 w-3 bg-destructive" />
              </span>
              <div className="min-w-0">
                <div className="text-xs font-semibold text-destructive uppercase tracking-wide">Сейчас в эфире</div>
                <div className="font-medium truncate">{w.title}</div>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="default" onClick={() => setLiveSheetWebinar(w)}>
                <Video className="w-4 h-4 mr-1" /> Войти как ведущий
              </Button>
              <Button size="sm" variant="outline" onClick={() => copyWebinarLink(w)}>
                <Copy className="w-4 h-4 mr-1" /> Скопировать ссылку
              </Button>
              <Button size="sm" variant="outline" onClick={() => setShareWebinar(w)}>
                <QrCode className="w-4 h-4 mr-1" /> QR-код
              </Button>
              <Button size="sm" variant="destructive" onClick={() => handleStopLive(w)} disabled={actionLoading === w.id}>
                <Square className="w-4 h-4 mr-1" /> Завершить
              </Button>
            </div>
          </div>
        </Card>
      ))}
      </div>

      {webinars.length > 0 && (
        <div className="flex flex-col sm:flex-row gap-3">
          <Tabs value={statusFilter} onValueChange={setStatusFilter}>
            <TabsList>
              <TabsTrigger value="all">Все ({webinars.length})</TabsTrigger>
              <TabsTrigger value="planned">Запланированные</TabsTrigger>
              <TabsTrigger value="live">В эфире</TabsTrigger>
              <TabsTrigger value="ended">Завершённые</TabsTrigger>
            </TabsList>
          </Tabs>
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-muted-foreground" />
            <Input placeholder="Поиск по названию..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
          </div>
        </div>
      )}

      {filteredWebinars.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <Video className="w-12 h-12 mx-auto mb-4 opacity-40" />
          <p className="text-lg font-medium">{webinars.length === 0 ? "Нет вебинаров" : "Ничего не найдено"}</p>
          {webinars.length === 0 && (
            <>
              <p className="text-sm mb-4">Создайте первый вебинар — проводите онлайн-занятия и сохраняйте записи для студентов</p>
              <Button onClick={() => setShowCreate(true)} variant="outline">
                <Plus className="w-4 h-4 mr-2" />Создать вебинар
              </Button>
            </>
          )}
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filteredWebinars.map((w) => (
            <Card key={w.id} className={`p-4 space-y-3 ${isSoon(w) ? "ring-2 ring-amber-400/50" : ""}`}>
              {w.cover_url && (
                <img src={w.cover_url} alt={w.title} className="w-full h-32 object-cover rounded-md" />
              )}
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <h4 className="font-medium truncate">{w.title}</h4>
                  {w.description && <p className="text-sm text-muted-foreground line-clamp-2">{w.description}</p>}
                </div>
                {statusBadge(w)}
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
                  {w.source_type === "kinescope"
                    ? "Kinescope"
                    : w.source_type === "livekit"
                      ? "LiveKit (встроенный)"
                      : "Внешняя ссылка"}
                </Badge>
              </div>

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

              {w.kinescope_video_id && (
                <div className="flex items-center gap-2 text-xs">
                  <Video className="w-3 h-3 text-primary" />
                  <span className="text-primary font-medium">Запись доступна</span>
                </div>
              )}

              <div className="flex flex-wrap gap-1.5 pt-1">
                {w.status === "planned" && w.source_type === "kinescope" && (
                  <Button size="sm" variant="default" onClick={() => handleGoLive(w)} disabled={actionLoading === w.id}>
                    {actionLoading === w.id ? <SigmaSpinner size="xs" className="mr-1" /> : <Radio className="w-3 h-3 mr-1" />}
                    В эфир
                  </Button>
                )}
                {w.status === "live" && w.source_type === "kinescope" && (
                  <Button size="sm" variant="destructive" onClick={() => handleStopLive(w)} disabled={actionLoading === w.id}>
                    {actionLoading === w.id ? <SigmaSpinner size="xs" className="mr-1" /> : <Square className="w-3 h-3 mr-1" />}
                    Стоп
                  </Button>
                )}
                {w.status === "ended" && w.source_type === "kinescope" && !w.kinescope_video_id && (
                  <Button size="sm" variant="outline" onClick={() => handleRefreshRecording(w)} disabled={actionLoading === w.id}>
                    <RefreshCw className="w-3 h-3 mr-1" />Запись
                  </Button>
                )}
                {w.source_type === "livekit" && (
                  <Button size="sm" variant="default" onClick={() => setLiveSheetWebinar(w)}>
                    <Video className="w-3 h-3 mr-1" />Войти в эфир
                  </Button>
                )}
                {getEmbedUrl(w) && w.source_type !== "livekit" && (
                  <Button size="sm" variant="outline" onClick={() => setEmbedWebinar(w)}>
                    <Video className="w-3 h-3 mr-1" />
                    Смотреть
                  </Button>
                )}
                <Button size="sm" variant="outline" onClick={() => setParticipantsWebinar(w)}>
                  <Users className="w-3 h-3 mr-1" />Уч-ки
                </Button>
                <Button size="sm" variant="ghost" onClick={() => { setEditWebinar(w); setShowCreate(true); }} title="Редактировать">
                  <Pencil className="w-3 h-3" />
                </Button>
                <Button size="sm" variant="ghost" onClick={() => handleDuplicate(w)} disabled={actionLoading === w.id} title="Дублировать">
                  <CopyPlus className="w-3 h-3" />
                </Button>
                <Button size="sm" variant="ghost" onClick={() => copyWebinarLink(w)} title="Скопировать ссылку">
                  <Link className="w-3 h-3" />
                </Button>
                {w.source_type === "livekit" && (
                  <Button size="sm" variant="ghost" onClick={() => setShareWebinar(w)} title="Поделиться (QR-код, настройки гостей)">
                    <Share2 className="w-3 h-3" />
                  </Button>
                )}
                <Button size="sm" variant="ghost" className="text-destructive" onClick={() => setDeleteTarget(w)}>
                  <Trash2 className="w-3 h-3" />
                </Button>
              </div>

              {/* Inline player settings - always visible */}
              {w.source_type === "kinescope" && (
                <InlinePlayerSettings
                  webinarId={w.id}
                  initialSettings={(w as any).player_settings || {}}
                  onSaved={fetchWebinars}
                />
              )}
            </Card>
          ))}
        </div>
      )}

      <CreateWebinarDialog
        open={showCreate}
        onOpenChange={(o) => { setShowCreate(o); if (!o) setEditWebinar(null); }}
        organizationId={organizationId}
        userId={user?.id}
        onCreated={fetchWebinars}
        editWebinar={editWebinar}
      />

      {participantsWebinar && (
        <WebinarParticipantsDialog
          open={!!participantsWebinar}
          onOpenChange={(o) => !o && setParticipantsWebinar(null)}
          webinar={participantsWebinar}
          organizationId={organizationId}
        />
      )}

      {/* Embed player dialog */}
      <Dialog open={!!embedWebinar} onOpenChange={(o) => !o && setEmbedWebinar(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>{embedWebinar?.title}</DialogTitle>
          </DialogHeader>
          {embedWebinar && getEmbedUrl(embedWebinar) && (
            <div className="aspect-video w-full">
              <iframe
                src={getEmbedUrl(embedWebinar)!}
                className="w-full h-full rounded-md"
                allow="autoplay; fullscreen; picture-in-picture; encrypted-media"
                allowFullScreen
              />
            </div>
          )}
        </DialogContent>
      </Dialog>


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

      <ShareWebinarDialog
        open={!!shareWebinar}
        onOpenChange={(o) => !o && setShareWebinar(null)}
        webinar={shareWebinar}
        onUpdated={fetchWebinars}
      />
    </div>
  );
}
