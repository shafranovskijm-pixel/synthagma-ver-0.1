import { useEffect, useState, useMemo, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Radio, Search, Trash2, ExternalLink, Calendar, Building2, Plus, Play, ChevronDown, Zap, Download, Loader2, CircleDot } from "lucide-react";
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
import { WebinarLiveInline } from "@/components/webinars/WebinarLiveInline";
import { WebinarRecordingUploader } from "@/components/webinars/WebinarRecordingUploader";
import { RecordingPreviewDialog } from "@/components/webinars/RecordingPreviewDialog";
import { Paperclip, Eye } from "lucide-react";

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
  "id, title, scheduled_at, duration_minutes, status, source_type, external_url, embed_url, kinescope_live_id, kinescope_video_id, organization_id, created_at, player_settings, public_token, allow_guests, guest_password, recording_status, recording_url, recording_size_bytes";

export function AdminWebinarsOverview() {
  const { user } = useAuth();
  const [webinars, setWebinars] = useState<AdminWebinar[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sourceFilter, setSourceFilter] = useState("all");
  const [orgFilter, setOrgFilter] = useState("all");
  const [deleteTarget, setDeleteTarget] = useState<AdminWebinar | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [playerWebinar, setPlayerWebinar] = useState<AdminWebinar | null>(null);
  const [recordingTarget, setRecordingTarget] = useState<AdminWebinar | null>(null);
  const [previewWebinar, setPreviewWebinar] = useState<AdminWebinar | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [showBulkConfirm, setShowBulkConfirm] = useState(false);

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
    if (orgFilter !== "all") result = result.filter((w) => w.organization_id === orgFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (w) =>
          w.title.toLowerCase().includes(q) ||
          (w.organization_name || "").toLowerCase().includes(q),
      );
    }
    return result;
  }, [webinars, statusFilter, sourceFilter, orgFilter, search]);

  // Топ организаций (по числу вебинаров) для селекта-фильтра
  const orgOptions = useMemo(() => {
    const counts = new Map<string, { id: string; name: string; count: number }>();
    for (const w of webinars) {
      if (!w.organization_id) continue;
      const cur = counts.get(w.organization_id) ?? {
        id: w.organization_id,
        name: w.organization_name || "Без имени",
        count: 0,
      };
      cur.count += 1;
      counts.set(w.organization_id, cur);
    }
    return Array.from(counts.values()).sort((a, b) => b.count - a.count);
  }, [webinars]);

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

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;
    setBulkDeleting(true);
    try {
      const ids = Array.from(selectedIds);
      const { error } = await supabase.from("webinars").delete().in("id", ids);
      if (error) throw error;
      toast.success(`Удалено: ${ids.length}`);
      setWebinars((prev) => prev.filter((w) => !selectedIds.has(w.id)));
      setSelectedIds(new Set());
      setShowBulkConfirm(false);
    } catch (e: any) {
      toast.error("Не удалось удалить: " + (e?.message || "ошибка"));
    } finally {
      setBulkDeleting(false);
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === filtered.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filtered.map((w) => w.id)));
    }
  };

  // По закрытию Sheet — корректно завершаем LiveKit-вебинар (стоп записи + удаление комнаты).
  const closePlayer = async () => {
    if (playerWebinar && playerWebinar.status === "live") {
      const { endLiveKitWebinar } = await import("@/utils/endLiveKitWebinar");
      await endLiveKitWebinar(playerWebinar.id);
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

  // Inline-режим эфира — встаёт ВНУТРИ контента админки, как редактор курсов (сайдбар остаётся видимым)
  if (playerWebinar) {
    return (
      <WebinarLiveInline
        webinar={{
          id: playerWebinar.id,
          title: playerWebinar.title,
          source_type: playerWebinar.source_type,
          kinescope_live_id: playerWebinar.kinescope_live_id,
          kinescope_video_id: playerWebinar.kinescope_video_id,
          embed_url: playerWebinar.embed_url,
          external_url: playerWebinar.external_url,
          public_token: playerWebinar.public_token,
          allow_guests: playerWebinar.allow_guests,
          guest_password: playerWebinar.guest_password,
          status: playerWebinar.status,
          recording_url: (playerWebinar as any).recording_url ?? null,
          organization_name: playerWebinar.organization_name,
        }}
        onBack={() => setPlayerWebinar(null)}
        expandHref={`/webinar/${playerWebinar.id}/live`}
        onEnd={closePlayer}
        onShareUpdated={fetchWebinars}
      />
    );
  }

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
          <Button onClick={() => setShowCreate(true)} className="shrink-0">
            <Zap className="h-4 w-4 mr-2" />
            Запустить вебинар сейчас
          </Button>
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
        <Select value={orgFilter} onValueChange={setOrgFilter}>
          <SelectTrigger className="w-[220px]">
            <SelectValue placeholder="Все организации" />
          </SelectTrigger>
          <SelectContent className="max-h-72">
            <SelectItem value="all">Все организации</SelectItem>
            {orgOptions.slice(0, 50).map((o) => (
              <SelectItem key={o.id} value={o.id}>
                {o.name} <span className="text-muted-foreground">({o.count})</span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {selectedIds.size > 0 && (
        <div className="flex items-center gap-3 p-3 rounded-lg border bg-muted/30">
          <span className="text-sm font-medium">Выбрано: {selectedIds.size}</span>
          <Button
            size="sm"
            variant="destructive"
            onClick={() => setShowBulkConfirm(true)}
          >
            <Trash2 className="h-4 w-4 mr-1.5" /> Удалить выбранные
          </Button>
          <Button size="sm" variant="outline" onClick={() => setSelectedIds(new Set())}>
            Снять выделение
          </Button>
        </div>
      )}

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
                <TableHead className="w-10">
                  <Checkbox
                    checked={filtered.length > 0 && selectedIds.size === filtered.length}
                    onCheckedChange={toggleSelectAll}
                    aria-label="Выделить всё"
                  />
                </TableHead>
                <TableHead>Название</TableHead>
                <TableHead>Организация</TableHead>
                <TableHead>Дата</TableHead>
                <TableHead>Длит.</TableHead>
                <TableHead>Источник</TableHead>
                <TableHead>Статус</TableHead>
                <TableHead>Запись</TableHead>
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
                const recStatus = (w as any).recording_status as string | null;
                const recUrl = (w as any).recording_url as string | null;
                const recSize = (w as any).recording_size_bytes as number | null;
                const recSizeMb = recSize ? (recSize / (1024 * 1024)).toFixed(0) : null;
                return (
                  <TableRow key={w.id} data-state={selectedIds.has(w.id) ? "selected" : undefined}>
                    <TableCell>
                      <Checkbox
                        checked={selectedIds.has(w.id)}
                        onCheckedChange={() => toggleSelect(w.id)}
                        aria-label={`Выбрать ${w.title}`}
                      />
                    </TableCell>
                    <TableCell className="font-medium max-w-[280px] truncate">{w.title}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                        <Building2 className="h-3.5 w-3.5 shrink-0" />
                        <span className="truncate max-w-[160px]">{w.organization_name || "—"}</span>
                        {w.organization_id && (
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-6 w-6 shrink-0"
                            title="Открыть кабинет организации"
                            onClick={() => {
                              localStorage.setItem("adminViewAsOrg", w.organization_id);
                              window.location.href = "/organization?tab=webinars";
                            }}
                          >
                            <ExternalLink className="h-3.5 w-3.5" />
                          </Button>
                        )}
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
                    <TableCell className="text-xs">
                      {recStatus === "active" || recStatus === "starting" ? (
                        <span className="inline-flex items-center gap-1 text-destructive font-medium">
                          <CircleDot className="h-3 w-3 animate-pulse" /> Идёт
                        </span>
                      ) : recStatus === "processing" || recStatus === "stopped" ? (
                        <span className="inline-flex items-center gap-1 text-warning">
                          <Loader2 className="h-3 w-3 animate-spin" /> Обработка
                        </span>
                      ) : recUrl ? (
                        <a
                          href={recUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-primary hover:underline"
                          title="Открыть/скачать запись"
                        >
                          <Download className="h-3 w-3" />
                          MP4{recSizeMb ? ` ${recSizeMb} МБ` : ""}
                        </a>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
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
                        {recUrl && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setPreviewWebinar(w)}
                            title="Просмотр записи"
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                        )}
                        {w.source_type === "external" && w.external_url && (
                          <Button size="sm" variant="ghost" asChild title="Открыть в новой вкладке">
                            <a href={w.external_url} target="_blank" rel="noopener noreferrer">
                              <ExternalLink className="h-4 w-4" />
                            </a>
                          </Button>
                        )}
                        {w.source_type === "livekit" && w.status === "ended" && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setRecordingTarget(w)}
                            title="Прикрепить запись вебинара"
                          >
                            <Paperclip className="h-4 w-4" />
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

      {/* Live webinar теперь рендерится inline сверху (ранний return), отдельный overlay не нужен */}

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

      {recordingTarget && (
        <WebinarRecordingUploader
          open={!!recordingTarget}
          onOpenChange={(o) => !o && setRecordingTarget(null)}
          webinarId={recordingTarget.id}
          webinarTitle={recordingTarget.title}
          currentRecordingUrl={(recordingTarget as any).recording_url ?? null}
          onUploaded={fetchWebinars}
        />
      )}

      <RecordingPreviewDialog
        open={!!previewWebinar}
        onOpenChange={(o) => !o && setPreviewWebinar(null)}
        title={previewWebinar?.title || ""}
        recordingUrl={(previewWebinar as any)?.recording_url ?? null}
      />

      <AlertDialog open={showBulkConfirm} onOpenChange={setShowBulkConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Удалить {selectedIds.size} вебинар(ов)?</AlertDialogTitle>
            <AlertDialogDescription>
              Все выбранные вебинары будут удалены безвозвратно вместе с их записями (если они хранятся в Cloud).
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={bulkDeleting}>Отмена</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleBulkDelete}
              disabled={bulkDeleting}
              className="bg-destructive hover:bg-destructive/90"
            >
              {bulkDeleting ? "Удаление…" : "Удалить"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
