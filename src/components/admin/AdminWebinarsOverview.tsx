import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Radio, Search, Trash2, ExternalLink, Calendar, Building2 } from "lucide-react";
import { format } from "date-fns";
import { ru } from "date-fns/locale";
import { toast } from "sonner";
import { SigmaSpinner } from "@/components/ui/SigmaSpinner";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface AdminWebinar {
  id: string;
  title: string;
  scheduled_at: string | null;
  duration_minutes: number | null;
  status: string;
  source_type: string;
  external_url: string | null;
  organization_id: string;
  created_at: string;
  organizations: { name: string } | null;
}

const STATUS_LABELS: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  planned: { label: "Запланирован", variant: "outline" },
  live: { label: "В эфире", variant: "destructive" },
  ended: { label: "Завершён", variant: "secondary" },
};

const SOURCE_LABELS: Record<string, string> = {
  livekit: "LiveKit (браузер)",
  external: "Внешняя трансляция",
  kinescope: "Kinescope RTMP",
};

export function AdminWebinarsOverview() {
  const [webinars, setWebinars] = useState<AdminWebinar[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [deleteTarget, setDeleteTarget] = useState<AdminWebinar | null>(null);

  const fetchWebinars = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("webinars")
      .select("id, title, scheduled_at, duration_minutes, status, source_type, external_url, organization_id, created_at, organizations(name)")
      .order("scheduled_at", { ascending: false, nullsFirst: false })
      .limit(500);
    if (error) {
      toast.error("Ошибка загрузки вебинаров");
      console.error(error);
    } else {
      setWebinars((data as any[]) || []);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchWebinars();
  }, []);

  const filtered = useMemo(() => {
    let result = webinars;
    if (statusFilter !== "all") result = result.filter((w) => w.status === statusFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (w) =>
          w.title.toLowerCase().includes(q) ||
          (w.organizations?.name || "").toLowerCase().includes(q),
      );
    }
    return result;
  }, [webinars, statusFilter, search]);

  const stats = useMemo(() => {
    return {
      total: webinars.length,
      live: webinars.filter((w) => w.status === "live").length,
      planned: webinars.filter((w) => w.status === "planned").length,
      ended: webinars.filter((w) => w.status === "ended").length,
    };
  }, [webinars]);

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

  const openLive = (w: AdminWebinar) => {
    if (w.source_type === "livekit") {
      window.open(`/webinar/${w.id}/live`, "_blank");
    } else if (w.source_type === "external" && w.external_url) {
      window.open(w.external_url, "_blank");
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center">
          <Radio className="h-6 w-6 text-primary" />
        </div>
        <div>
          <h2 className="text-2xl font-semibold">Вебинары платформы</h2>
          <p className="text-sm text-muted-foreground">
            Все вебинары всех организаций — просмотр и модерация
          </p>
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
            <TabsTrigger value="planned">Запланирован</TabsTrigger>
            <TabsTrigger value="live">В эфире</TabsTrigger>
            <TabsTrigger value="ended">Завершён</TabsTrigger>
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
            Вебинаров не найдено
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Название</TableHead>
                <TableHead>Организация</TableHead>
                <TableHead>Дата</TableHead>
                <TableHead>Длительность</TableHead>
                <TableHead>Источник</TableHead>
                <TableHead>Статус</TableHead>
                <TableHead className="text-right">Действия</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((w) => {
                const status = STATUS_LABELS[w.status] || { label: w.status, variant: "outline" as const };
                return (
                  <TableRow key={w.id}>
                    <TableCell className="font-medium max-w-[280px] truncate">{w.title}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                        <Building2 className="h-3.5 w-3.5" />
                        <span className="truncate max-w-[180px]">{w.organizations?.name || "—"}</span>
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
                        {(w.source_type === "livekit" || (w.source_type === "external" && w.external_url)) && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => openLive(w)}
                            title="Открыть"
                          >
                            <ExternalLink className="h-4 w-4" />
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
