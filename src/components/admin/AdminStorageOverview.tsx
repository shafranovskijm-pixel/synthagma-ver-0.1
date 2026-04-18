import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { HardDrive, Video, RefreshCw, Database, Banknote, Clock, Film } from "lucide-react";
import { safeInvoke } from "@/utils/safeInvoke";
import { toast } from "sonner";
import { SigmaSpinner } from "@/components/ui/SigmaSpinner";

interface OrgRow {
  organization_id: string | null;
  organization_name?: string | null;
  total_bytes: number;
  total_seconds: number;
  videos_count: number;
}

interface KinescopeStats {
  cached: boolean;
  age_minutes?: number;
  total_bytes: number;
  total_seconds: number;
  videos_count: number;
  by_org: OrgRow[];
  billing: {
    storage_rub: number;
    delivery_rub: number;
    total_rub: number;
    is_estimate: boolean;
    pricing?: {
      storage_rub_per_gb_month: number;
      delivery_rub_per_gb: number;
    };
  } | null;
  fetched_at: string;
}

function formatBytes(bytes: number): string {
  if (!bytes) return "0 Б";
  const k = 1024;
  const sizes = ["Б", "КБ", "МБ", "ГБ", "ТБ"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

function formatHours(sec: number): string {
  const h = sec / 3600;
  if (h < 1) return `${Math.round(sec / 60)} мин`;
  return `${Math.round(h * 10) / 10} ч`;
}

function formatRub(n: number): string {
  return n.toLocaleString("ru-RU", { maximumFractionDigits: 0 }) + " ₽";
}

export function AdminStorageOverview() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [stats, setStats] = useState<KinescopeStats | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (force = false) => {
    if (force) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const { data, error: err } = await safeInvoke<KinescopeStats>(
        "kinescope-storage-stats",
        { body: { force } },
      );
      if (err) throw err;
      if ((data as any)?.error) throw new Error((data as any).error);
      setStats(data);
    } catch (e: any) {
      console.error(e);
      setError(e?.message || "Не удалось загрузить статистику Kinescope");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(false); }, [load]);

  const handleRefresh = async () => {
    await load(true);
    toast.success("Статистика Kinescope обновлена");
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <SigmaSpinner />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <HardDrive className="w-6 h-6 text-primary" />
            Хранилище и Kinescope
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Объёмы видеохостинга по всем организациям и ориентировочные расходы.
            {stats?.cached && (
              <span className="ml-1">
                (Кеш {stats.age_minutes} мин назад. <button
                  onClick={handleRefresh}
                  className="underline text-primary hover:no-underline"
                >Обновить</button>)
              </span>
            )}
          </p>
        </div>
        <Button onClick={handleRefresh} disabled={refreshing} variant="outline">
          <RefreshCw className={`w-4 h-4 mr-2 ${refreshing ? "animate-spin" : ""}`} />
          Обновить сейчас
        </Button>
      </div>

      {error && (
        <Card className="border-destructive/40">
          <CardContent className="p-4 text-sm text-destructive">
            {error}
          </CardContent>
        </Card>
      )}

      {stats && (
        <>
          {/* Сводка по платформе */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                  <Film className="w-4 h-4" /> Всего видео
                </div>
                <p className="text-2xl font-bold">{stats.videos_count}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                  <Database className="w-4 h-4" /> Объём Kinescope
                </div>
                <p className="text-2xl font-bold">{formatBytes(stats.total_bytes)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                  <Clock className="w-4 h-4" /> Длительность
                </div>
                <p className="text-2xl font-bold">{formatHours(stats.total_seconds)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                  <Banknote className="w-4 h-4" /> ~Расход / мес
                  <Badge variant="outline" className="text-[10px] px-1.5 py-0">Оценка</Badge>
                </div>
                <p className="text-2xl font-bold">
                  {stats.billing ? formatRub(stats.billing.total_rub) : "—"}
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Расходы Kinescope (как в их LK) */}
          {stats.billing && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Banknote className="w-5 h-5 text-emerald-500" />
                  Ориентировочные расходы Kinescope
                  <Badge variant="outline">Оценка по публичному прайсу</Badge>
                </CardTitle>
                <CardDescription>
                  Kinescope не предоставляет публичный billing API. Расходы рассчитаны исходя из
                  объёма хранилища × {stats.billing.pricing?.storage_rub_per_gb_month ?? 2.5} ₽/ГБ/мес
                  и доставки × {stats.billing.pricing?.delivery_rub_per_gb ?? 1.5} ₽/ГБ.
                  Точные суммы смотрите в личном кабинете Kinescope.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="p-3 rounded-lg border">
                    <p className="text-xs text-muted-foreground">Хранение</p>
                    <p className="text-lg font-semibold">{formatRub(stats.billing.storage_rub)}</p>
                  </div>
                  <div className="p-3 rounded-lg border">
                    <p className="text-xs text-muted-foreground">Доставка контента</p>
                    <p className="text-lg font-semibold">{formatRub(stats.billing.delivery_rub)}</p>
                  </div>
                  <div className="p-3 rounded-lg border opacity-60">
                    <p className="text-xs text-muted-foreground">Подготовка / Трансляции</p>
                    <p className="text-lg font-semibold">— ₽</p>
                    <p className="text-[10px] text-muted-foreground mt-1">Только в LK Kinescope</p>
                  </div>
                  <div className="p-3 rounded-lg border bg-primary/5">
                    <p className="text-xs text-muted-foreground">Итого</p>
                    <p className="text-lg font-bold text-primary">{formatRub(stats.billing.total_rub)}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Разбивка по организациям */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Video className="w-5 h-5 text-rose-500" />
                Использование Kinescope по организациям
              </CardTitle>
              <CardDescription>
                Сколько видео и объёма приходится на каждую организацию
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Организация</TableHead>
                    <TableHead className="text-right">Видео</TableHead>
                    <TableHead className="text-right">Объём</TableHead>
                    <TableHead className="text-right">Длительность</TableHead>
                    <TableHead className="text-right">~Стоимость / мес</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(stats.by_org ?? []).length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                        Видео не загружены
                      </TableCell>
                    </TableRow>
                  )}
                  {(stats.by_org ?? []).map((row, idx) => {
                    const gb = row.total_bytes / 1024 ** 3;
                    const rub = Math.round(gb * (2.5 + 1.5));
                    return (
                      <TableRow key={row.organization_id ?? `unmapped-${idx}`}>
                        <TableCell>
                          <div className="font-medium">
                            {row.organization_name || "—"}
                          </div>
                          {!row.organization_id && (
                            <Badge variant="secondary" className="text-[10px] mt-1">
                              Без привязки
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{row.videos_count}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatBytes(row.total_bytes)}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatHours(row.total_seconds)}</TableCell>
                        <TableCell className="text-right tabular-nums font-medium">
                          {formatRub(rub)}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
