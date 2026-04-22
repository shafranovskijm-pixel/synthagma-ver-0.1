import { useEffect, useState, useMemo, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Radio, Search, Trash2, ExternalLink, Calendar, Building2, Plus, Play, ChevronDown, Zap } from "lucide-react";
import { format } from "date-fns";
import { ru } from "date-fns/locale";
import { toast } from "sonner";
import { SigmaSpinner } from "@/components/ui/SigmaSpinner";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useAuth } from "@/hooks/useAuth";
import { AdminCreateWebinarDialog } from "./AdminCreateWebinarDialog";
import { EmbeddedWebinarPlayer } from "@/components/webinars/EmbeddedWebinarPlayer";

interface AdminWebinar {
  id: string;
  title: string;
  scheduled_at: string | null;
  duration_minutes: number | null;
  status: string;
  source_type: string;
  external_url: string | null;
  embed_url: string | null;
  kinescope_live_id: string | null;
  kinescope_video_id: string | null;
  organization_id: string;
  created_at: string;
  player_settings: any;
  public_token: string | null;
  allow_guests: boolean;
  guest_password: string | null;
  organization_name?: string | null;
}

const STATUS_LABELS: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  planned: { label: "Запланирован", variant: "outline" },
  scheduled: { label: "Запланирован", variant: "outline" },
  live: { label: "В эфире", variant: "destructive" },
  ended: { label: "Завершён", variant: "secondary" },
};

const SOURCE_LABELS: Record<string, string> = {
  livekit: "LiveKit (браузер)",
  external: "Внешняя трансляция",
  kinescope: "Kinescope RTMP",
};

// БЕЗ джойнов — джойн organizations(name) у админа иногда падает по RLS
const SELECT_FIELDS =
  "id, title, scheduled_at, duration_minutes, status, source_type, external_url, embed_url, kinescope_live_id, kinescope_video_id, organization_id, created_at, player_settings, public_token, allow_guests, guest_password";

export function AdminWebinarsOverview() {
  const { user } = useAuth();
  const [webinars, setWebinars] = useState<AdminWebinar[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sourceFilter, setSourceFilter] = useState("all");
  const [deleteTarget, setDeleteTarget] = useState<AdminWebinar | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [playerWebinar, setPlayerWebinar] = useState<AdminWebinar | null>(null);
  const [launching, setLaunching] = useState(false);

  const fetchWebinars = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("webinars")
        .select(SELECT_FIELDS)
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;

      const list = (data as any[]) || [];
      // Подтягиваем имена организаций отдельно — чтобы не падать на RLS-джойне
      const orgIds = Array.from(new Set(list.map((w) => w.organization_id).filter(Boolean)));
      let orgsMap: Record<string, string> = {};
      if (orgIds.length > 0) {
        const { data: orgs } = await supabase
          .from("organizations")
          .select("id, name")
          .in("id", orgIds);
        orgsMap = Object.fromEntries((orgs || []).map((o: any) => [o.id, o.name]));
      }
      setWebinars(list.map((w) => ({ ...w, organization_name: orgsMap[w.organization_id] ?? null })));
    } catch (e: any) {
      console.error("[AdminWebinarsOverview] fetch error", e);
      toast.error("Не удалось загрузить вебинары: " + (e?.message || "ошибка"));
      setWebinars([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchWebinars();
  }, [fetchWebinars]);

  const filtered = useMemo(() => {
    let result = webinars;
    if (statusFilter !== "all") {
      result = result.filter((w) => {
        if (statusFilter === "planned") return w.status === "planned" || w.status === "scheduled";
        return w.status === statusFilter;
      });
    }
    if (sourceFilter !== "all") result = result.filter((w) => w.source_type === sourceFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (w) =>
          w.title.toLowerCase().includes(q) ||
          (w.organization_name || "").toLowerCase().includes(q),
      );
    }
    return result;
  }, [webinars, statusFilter, sourceFilter, search]);

  const stats = useMemo(() => ({
    total: webinars.length,
    live: webinars.filter((w) => w.status === "live").length,
    planned: webinars.filter((w) => w.status === "planned" || w.status === "scheduled").length,
    ended: webinars.filter((w) => w.status === "ended").length,
  }), [webinars]);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    const { error } = await supabase.from("webinars").delete().eq("id", deleteTarget.id);
    if (error) {
      toast.error("Не удалось удалить вебинар");
    } else {
      toast.success("Вебинар удалён");
      setWebinars((prev) => prev.filter((w) => w.id !== deleteTarget.id));
    }
    setDeleteTarget(null);
  };

  /**
   * One-click: создаёт LiveKit-вебинар и сразу открывает плеер.
   * 1) Берём первую доступную организацию (organization_id NOT NULL в схеме).
   * 2) INSERT webinars.
   * 3) Вызов livekit-create-room → roomName/wsUrl.
   * 4) UPDATE player_settings.
   * 5) Открываем Sheet с плеером.
   */
  const launchInstantWebinar = async () => {
    if (!user?.id) {
      toast.error("Нужно авторизоваться");
      return;
    }
    setLaunching(true);
    try {
      // Берём любую существующую организацию (organization_id NOT NULL)
      const { data: anyOrg, error: orgErr } = await supabase
        .from("organizations")
        .select("id")
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      if (orgErr) throw orgErr;
      if (!anyOrg?.id) throw new Error("Нет ни одной организации в системе");

      const now = new Date();
      const title = `Тестовый вебинар ${format(now, "dd.MM HH:mm", { locale: ru })}`;

      // INSERT webinar
      const { data: created, error: insErr } = await supabase
        .from("webinars")
        .insert({
          title,
          source_type: "livekit",
          status: "live",
          scheduled_at: now.toISOString(),
          duration_minutes: 60,
          organization_id: anyOrg.id,
          host_user_id: user.id,
          created_by: user.id,
          access_type: "org_all",
          player_settings: {},
        })
        .select(SELECT_FIELDS)
        .single();
      if (insErr) throw insErr;

      // Создаём LiveKit комнату
      const { data: roomData, error: roomErr } = await supabase.functions.invoke(
        "livekit-create-room",
        { body: { webinarId: created.id, title } },
      );
      if (roomErr) throw new Error(roomErr.message);
      if (!roomData?.ok) throw new Error(roomData?.error || "LiveKit room creation failed");

      // UPDATE player_settings
      const playerSettings = {
        livekit: { roomName: roomData.roomName, wsUrl: roomData.wsUrl },
      };
      const { data: updated, error: updErr } = await supabase
        .from("webinars")
        .update({ player_settings: playerSettings })
        .eq("id", created.id)
        .select(SELECT_FIELDS)
        .single();
      if (updErr) throw updErr;

      // Обновляем список и открываем плеер
      await fetchWebinars();
      setPlayerWebinar({ ...(updated as any), organization_name: null });
      toast.success("Вебинар запущен — вы в эфире");
    } catch (e: any) {
      console.error("[launchInstantWebinar]", e);
      toast.error("Не удалось запустить: " + (e?.message || "ошибка"));
    } finally {
      setLaunching(false);
    }
  };

  // По закрытию Sheet помечаем вебинар как завершённый
  const closePlayer = async () => {
    if (playerWebinar && playerWebinar.status === "live") {
      await supabase.from("webinars").update({ status: "ended" }).eq("id", playerWebinar.id);
      fetchWebinars();
    }
    setPlayerWebinar(null);
  };

  const handleCreated = async (webinarId: string) => {
    await fetchWebinars();
    const { data } = await supabase
      .from("webinars")
      .select(SELECT_FIELDS)
      .eq("id", webinarId)
      .maybeSingle();
    if (data) setPlayerWebinar({ ...(data as any), organization_name: null });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center">
            <Radio className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h2 className="text-2xl font-semibold">Вебинары платформы</h2>
            <p className="text-sm text-muted-foreground">
              Все вебинары всех организаций — просмотр, тестирование плеера и модерация
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={launchInstantWebinar} disabled={launching} className="shrink-0">
            <Zap className="h-4 w-4 mr-2" />
            {launching ? "Запускаю…" : "Запустить вебинар сейчас"}
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="icon" title="Расширенное создание">
                <ChevronDown className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setShowCreate(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Расширенное создание (Kinescope / внешний)
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="p-4">
          <div className="text-sm text-muted-foreground">Всего</div>
          <div className="text-2xl font-semibold">{stats.total}</div>
        </Card>
        <Card className="p-4">
          <div className="text-sm text-muted-foreground">В эфире сейчас</div>
          <div className="text-2xl font-semibold text-destructive">{stats.live}</div>
        </Card>
        <Card className="p-4">
          <div className="text-sm text-muted-foreground">Запланировано</div>
          <div className="text-2xl font-semibold">{stats.planned}</div>
        </Card>
        <Card className="p-4">
          <div className="text-sm text-muted-foreground">Завершено</div>
          <div className="text-2xl font-semibold text-muted-foreground">{stats.ended}</div>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-col lg:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Поиск по названию или организации"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Tabs value={statusFilter} onValueChange={setStatusFilter}>
          <TabsList>
            <TabsTrigger value="all">Все</TabsTrigger>
            <TabsTrigger value="planned">План</TabsTrigger>
            <TabsTrigger value="live">Эфир</TabsTrigger>
            <TabsTrigger value="ended">Завершён</TabsTrigger>
          </TabsList>
        </Tabs>
        <Tabs value={sourceFilter} onValueChange={setSourceFilter}>
          <TabsList>
            <TabsTrigger value="all">Все источники</TabsTrigger>
            <TabsTrigger value="livekit">LiveKit</TabsTrigger>
            <TabsTrigger value="kinescope">Kinescope</TabsTrigger>
            <TabsTrigger value="external">Внешний</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {/* Table */}
      <Card className="overflow-hidden">
        {loading ? (
          <div className="p-12 flex justify-center">
            <SigmaSpinner />
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center text-muted-foreground">
            <Radio className="w-12 h-12 mx-auto mb-3 opacity-30" />
            Вебинаров не найдено — нажмите «Запустить вебинар сейчас» вверху страницы
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Название</TableHead>
                <TableHead>Организация</TableHead>
                <TableHead>Дата</TableHead>
                <TableHead>Длит.</TableHead>
                <TableHead>Источник</TableHead>
                <TableHead>Статус</TableHead>
                <TableHead className="text-right">Действия</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((w) => {
                const status = STATUS_LABELS[w.status] || { label: w.status, variant: "outline" as const };
                const canPlay =
                  w.source_type === "livekit" ||
                  (w.source_type === "kinescope" && (w.kinescope_live_id || w.kinescope_video_id)) ||
                  (w.source_type === "external" && (w.embed_url || w.external_url));
                return (
                  <TableRow key={w.id}>
                    <TableCell className="font-medium max-w-[280px] truncate">{w.title}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                        <Building2 className="h-3.5 w-3.5" />
                        <span className="truncate max-w-[180px]">{w.organization_name || "—"}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm">
                      {w.scheduled_at ? (
                        <div className="flex items-center gap-1.5">
                          <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                          {format(new Date(w.scheduled_at), "dd MMM yyyy, HH:mm", { locale: ru })}
                        </div>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-sm">
                      {w.duration_minutes ? `${w.duration_minutes} мин` : "—"}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs font-normal">
                        {SOURCE_LABELS[w.source_type] || w.source_type}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={status.variant}>{status.label}</Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        {canPlay && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setPlayerWebinar(w)}
                            title="Открыть встроенный плеер"
                          >
                            <Play className="h-4 w-4" />
                          </Button>
                        )}
                        {w.source_type === "external" && w.external_url && (
                          <Button size="sm" variant="ghost" asChild title="Открыть в новой вкладке">
                            <a href={w.external_url} target="_blank" rel="noopener noreferrer">
                              <ExternalLink className="h-4 w-4" />
                            </a>
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setDeleteTarget(w)}
                          className="text-destructive hover:text-destructive"
                          title="Удалить"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </Card>

      {/* Embedded player Sheet — wide overlay over admin dashboard */}
      <Sheet open={!!playerWebinar} onOpenChange={(o) => !o && closePlayer()}>
        <SheetContent
          side="right"
          className="w-full sm:max-w-[min(1100px,95vw)] overflow-y-auto"
          onInteractOutside={(e) => e.preventDefault()}
        >
          <SheetHeader className="pr-10">
            <SheetTitle className="flex items-center gap-2">
              <Radio className="h-4 w-4 text-destructive" />
              {playerWebinar?.title}
            </SheetTitle>
            <SheetDescription>
              {playerWebinar?.organization_name && (
                <span className="flex items-center gap-1.5">
                  <Building2 className="h-3.5 w-3.5" />
                  {playerWebinar.organization_name}
                </span>
              )}
            </SheetDescription>
          </SheetHeader>
          <div className="mt-6 space-y-4">
            {playerWebinar && (
              <>
                <EmbeddedWebinarPlayer
                  webinarId={playerWebinar.id}
                  sourceType={playerWebinar.source_type}
                  kinescopeLiveId={playerWebinar.kinescope_live_id}
                  kinescopeVideoId={playerWebinar.kinescope_video_id}
                  embedUrl={playerWebinar.embed_url}
                  externalUrl={playerWebinar.external_url}
                  webinarTitle={playerWebinar.title}
                  publicToken={playerWebinar.public_token}
                  allowGuests={playerWebinar.allow_guests ?? true}
                  guestPassword={playerWebinar.guest_password}
                  onEnd={closePlayer}
                  onShareUpdated={fetchWebinars}
                />
                <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                  <Badge variant="outline">{SOURCE_LABELS[playerWebinar.source_type] || playerWebinar.source_type}</Badge>
                  <Badge variant={STATUS_LABELS[playerWebinar.status]?.variant || "outline"}>
                    {STATUS_LABELS[playerWebinar.status]?.label || playerWebinar.status}
                  </Badge>
                  {playerWebinar.scheduled_at && (
                    <span className="flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      {format(new Date(playerWebinar.scheduled_at), "d MMM yyyy, HH:mm", { locale: ru })}
                    </span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  Окно открыто поверх админки — закройте, чтобы вернуться к таблице. Эфир продолжится для остальных участников.
                </p>
              </>
            )}
          </div>
        </SheetContent>
      </Sheet>

      <AdminCreateWebinarDialog
        open={showCreate}
        onOpenChange={setShowCreate}
        onCreated={handleCreated}
        userId={user?.id}
      />

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Удалить вебинар?</AlertDialogTitle>
            <AlertDialogDescription>
              «{deleteTarget?.title}» будет удалён безвозвратно. Это действие нельзя отменить.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Отмена</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive hover:bg-destructive/90">
              Удалить
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
