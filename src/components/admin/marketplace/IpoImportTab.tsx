import { useState, useEffect, useMemo, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { supabase } from "@/integrations/supabase/client";
import { MARKETPLACE_ORG_ID } from "@/constants/marketplace";
import { toast } from "sonner";
import { getErrorMessage } from "@/utils/handleSupabaseError";
import {
  Search, RefreshCcw, Download, Loader2, ChevronDown, ChevronRight,
  CheckCircle2, AlertCircle, Clock, ExternalLink,
} from "lucide-react";
import { getPpCategoryMeta } from "./marketplaceConstants";

interface ImportItem {
  id: string;
  title: string;
  parent_category: string;
  sub_category: string | null;
  hours: number | null;
  source_url: string;
  status: "pending" | "imported" | "skipped" | "failed";
  course_id: string | null;
  error_message: string | null;
  imported_at: string | null;
}

const PP_CATEGORY_NAME = "Профессиональная переподготовка";

export function IpoImportTab() {
  const [items, setItems] = useState<ImportItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [importing, setImporting] = useState(false);
  const [search, setSearch] = useState("");
  const [filterParent, setFilterParent] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [openGroups, setOpenGroups] = useState<Set<string>>(new Set());

  const fetchItems = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("marketplace_import_catalog")
      .select("*")
      .order("parent_category", { ascending: true })
      .order("title", { ascending: true })
      .limit(2000);
    if (error) {
      toast.error("Не удалось загрузить очередь импорта", { description: getErrorMessage(error) });
    } else {
      setItems((data || []) as ImportItem[]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  const handleScan = async () => {
    setScanning(true);
    toast.info("Сканирую ipo.msk.ru…", { description: "Это займёт 1–3 минуты" });
    try {
      const { data, error } = await supabase.functions.invoke("import-ipo-catalog", {
        body: { limit: 1500 },
      });
      if (error) throw error;
      const stats = data?.stats || {};
      toast.success("Сканирование завершено", {
        description: `Найдено направлений: ${stats.categoriesFound ?? 0}, курсов: ${stats.coursesFound ?? 0}, добавлено: ${stats.inserted ?? 0}`,
      });
      await fetchItems();
    } catch (e: any) {
      toast.error("Ошибка сканирования", { description: getErrorMessage(e) });
    } finally {
      setScanning(false);
    }
  };

  const filtered = useMemo(() => {
    return items.filter((it) => {
      if (filterStatus !== "all" && it.status !== filterStatus) return false;
      if (filterParent !== "all" && it.parent_category !== filterParent) return false;
      if (search && !it.title.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [items, filterParent, filterStatus, search]);

  const grouped = useMemo(() => {
    const map = new Map<string, ImportItem[]>();
    for (const it of filtered) {
      if (!map.has(it.parent_category)) map.set(it.parent_category, []);
      map.get(it.parent_category)!.push(it);
    }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0], "ru"));
  }, [filtered]);

  const allParents = useMemo(() => {
    return Array.from(new Set(items.map((i) => i.parent_category))).sort((a, b) => a.localeCompare(b, "ru"));
  }, [items]);

  const counts = useMemo(() => {
    return {
      total: items.length,
      pending: items.filter((i) => i.status === "pending").length,
      imported: items.filter((i) => i.status === "imported").length,
      failed: items.filter((i) => i.status === "failed").length,
    };
  }, [items]);

  const toggleAll = () => {
    const pendingIds = filtered.filter((i) => i.status === "pending").map((i) => i.id);
    if (pendingIds.every((id) => selected.has(id))) {
      const next = new Set(selected);
      pendingIds.forEach((id) => next.delete(id));
      setSelected(next);
    } else {
      setSelected(new Set([...selected, ...pendingIds]));
    }
  };

  const toggleOne = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  };

  const toggleGroup = (parent: string) => {
    const next = new Set(openGroups);
    if (next.has(parent)) next.delete(parent);
    else next.add(parent);
    setOpenGroups(next);
  };

  const selectGroup = (parent: string) => {
    const groupItems = items.filter((i) => i.parent_category === parent && i.status === "pending");
    const allSelected = groupItems.every((i) => selected.has(i.id));
    const next = new Set(selected);
    if (allSelected) groupItems.forEach((i) => next.delete(i.id));
    else groupItems.forEach((i) => next.add(i.id));
    setSelected(next);
  };

  // Создаёт ПП-категорию, если её ещё нет
  const ensureCategory = async (parent: string, sub: string | null): Promise<string> => {
    const targetName = sub || parent;
    const { data: existing } = await supabase
      .from("course_categories")
      .select("id")
      .eq("organization_id", MARKETPLACE_ORG_ID)
      .eq("parent_type", PP_CATEGORY_NAME)
      .eq("name", targetName)
      .maybeSingle();
    if (existing) return existing.id;
    const meta = getPpCategoryMeta(parent);
    const { data: created, error } = await supabase
      .from("course_categories")
      .insert({
        organization_id: MARKETPLACE_ORG_ID,
        parent_type: PP_CATEGORY_NAME,
        name: targetName,
        icon: (meta.icon as any).displayName || "GraduationCap",
        hidden_from_catalog: false,
      })
      .select("id")
      .single();
    if (error) throw error;
    return created.id;
  };

  const handleImportSelected = async () => {
    if (selected.size === 0) {
      toast.error("Не выбрано ни одной программы");
      return;
    }
    setImporting(true);
    let okCount = 0;
    let failCount = 0;
    const toImport = items.filter((i) => selected.has(i.id) && i.status === "pending");

    for (const it of toImport) {
      try {
        const categoryId = await ensureCategory(it.parent_category, it.sub_category);
        // Создаём курс
        const slug = `pp-${it.title.toLowerCase().replace(/[^a-zа-я0-9]+/gi, "-").slice(0, 80)}-${Date.now().toString(36).slice(-4)}`;
        const { data: course, error: courseErr } = await supabase
          .from("courses")
          .insert({
            organization_id: MARKETPLACE_ORG_ID,
            category_id: categoryId,
            title: it.title,
            description: `Программа профессиональной переподготовки. Источник: ${it.parent_category}${it.sub_category ? " → " + it.sub_category : ""}`,
            duration: it.hours ? `${it.hours} ч.` : null,
            price: 0,
            is_published: false,
            slug,
            frdo_program_type: "Профессиональная переподготовка",
            frdo_duration_hours: it.hours || 250,
          })
          .select("id")
          .single();
        if (courseErr) throw courseErr;

        // Запись в marketplace_courses
        const { error: mpErr } = await supabase.from("marketplace_courses").insert({
          course_id: course.id,
          price_student: 0,
          is_active: false,
          is_validated: false,
        });
        if (mpErr) throw mpErr;

        // Обновляем статус
        await supabase
          .from("marketplace_import_catalog")
          .update({ status: "imported", course_id: course.id, imported_at: new Date().toISOString(), error_message: null })
          .eq("id", it.id);
        okCount++;
      } catch (e: any) {
        await supabase
          .from("marketplace_import_catalog")
          .update({ status: "failed", error_message: e.message?.slice(0, 500) })
          .eq("id", it.id);
        failCount++;
      }
    }

    toast.success(`Импорт завершён: ${okCount} ✅ / ${failCount} ❌`);
    setSelected(new Set());
    await fetchItems();
    setImporting(false);
  };

  const StatusBadge = ({ status }: { status: ImportItem["status"] }) => {
    const map = {
      pending: { icon: Clock, label: "Ожидает", cls: "bg-amber-500/10 text-amber-700 border-amber-500/20" },
      imported: { icon: CheckCircle2, label: "Импорт.", cls: "bg-emerald-500/10 text-emerald-700 border-emerald-500/20" },
      skipped: { icon: Clock, label: "Пропуск", cls: "bg-slate-500/10 text-slate-700 border-slate-500/20" },
      failed: { icon: AlertCircle, label: "Ошибка", cls: "bg-red-500/10 text-red-700 border-red-500/20" },
    } as const;
    const m = map[status];
    const Icon = m.icon;
    return (
      <Badge variant="outline" className={`${m.cls} gap-1`}>
        <Icon className="w-3 h-3" />
        {m.label}
      </Badge>
    );
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Download className="w-5 h-5 text-primary" />
                Импорт каталога ipo.msk.ru
              </CardTitle>
              <p className="text-sm text-muted-foreground mt-1">
                Профессиональная переподготовка — 50+ направлений, 400+ программ
              </p>
            </div>
            <div className="flex gap-2">
              <Button onClick={handleScan} disabled={scanning} variant="outline">
                {scanning ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RefreshCcw className="w-4 h-4 mr-2" />}
                Сканировать ИПО
              </Button>
              <Button onClick={handleImportSelected} disabled={importing || selected.size === 0}>
                {importing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Download className="w-4 h-4 mr-2" />}
                Создать выбранные ({selected.size})
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="rounded-lg border p-3 bg-card">
              <div className="text-xs text-muted-foreground">Всего</div>
              <div className="text-2xl font-bold">{counts.total}</div>
            </div>
            <div className="rounded-lg border p-3 bg-amber-500/5 border-amber-500/20">
              <div className="text-xs text-amber-700">Ожидают</div>
              <div className="text-2xl font-bold text-amber-700">{counts.pending}</div>
            </div>
            <div className="rounded-lg border p-3 bg-emerald-500/5 border-emerald-500/20">
              <div className="text-xs text-emerald-700">Импортировано</div>
              <div className="text-2xl font-bold text-emerald-700">{counts.imported}</div>
            </div>
            <div className="rounded-lg border p-3 bg-red-500/5 border-red-500/20">
              <div className="text-xs text-red-700">Ошибки</div>
              <div className="text-2xl font-bold text-red-700">{counts.failed}</div>
            </div>
          </div>

          {/* Filters */}
          <div className="flex flex-wrap gap-2">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Поиск по названию…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={filterParent} onValueChange={setFilterParent}>
              <SelectTrigger className="w-[220px]">
                <SelectValue placeholder="Все направления" />
              </SelectTrigger>
              <SelectContent className="max-h-[300px]">
                <SelectItem value="all">Все направления</SelectItem>
                {allParents.map((p) => (
                  <SelectItem key={p} value={p}>{p}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="w-[160px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Все статусы</SelectItem>
                <SelectItem value="pending">Ожидают</SelectItem>
                <SelectItem value="imported">Импортированы</SelectItem>
                <SelectItem value="failed">Ошибки</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" onClick={toggleAll}>
              Выбрать все ожидающие
            </Button>
          </div>

          {/* List */}
          <ScrollArea className="h-[600px] rounded-lg border">
            {loading ? (
              <div className="flex items-center justify-center py-20">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            ) : grouped.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground">
                <p>Очередь импорта пуста.</p>
                <p className="text-sm mt-1">Нажмите «Сканировать ИПО» чтобы загрузить каталог.</p>
              </div>
            ) : (
              <div className="divide-y">
                {grouped.map(([parent, list]) => {
                  const meta = getPpCategoryMeta(parent);
                  const Icon = meta.icon;
                  const isOpen = openGroups.has(parent);
                  const groupSelectedCount = list.filter((i) => selected.has(i.id)).length;
                  return (
                    <Collapsible key={parent} open={isOpen} onOpenChange={() => toggleGroup(parent)}>
                      <div className="flex items-center justify-between px-3 py-2 hover:bg-muted/40 transition-colors">
                        <CollapsibleTrigger asChild>
                          <button className="flex items-center gap-2 flex-1 text-left">
                            {isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                            <div className={`w-7 h-7 rounded-md ${meta.bgColor} flex items-center justify-center`}>
                              <Icon className={`w-4 h-4 ${meta.color}`} />
                            </div>
                            <span className="font-medium">{parent}</span>
                            <Badge variant="secondary" className="ml-2">{list.length}</Badge>
                            {groupSelectedCount > 0 && (
                              <Badge className="bg-primary/10 text-primary border-primary/20">
                                выбрано {groupSelectedCount}
                              </Badge>
                            )}
                          </button>
                        </CollapsibleTrigger>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={(e) => { e.stopPropagation(); selectGroup(parent); }}
                        >
                          Выделить группу
                        </Button>
                      </div>
                      <CollapsibleContent>
                        <div className="bg-muted/20">
                          {list.map((it) => (
                            <div
                              key={it.id}
                              className="flex items-start gap-3 px-4 py-2 pl-12 hover:bg-muted/40 border-t"
                            >
                              <Checkbox
                                checked={selected.has(it.id)}
                                onCheckedChange={() => toggleOne(it.id)}
                                disabled={it.status !== "pending"}
                                className="mt-1"
                              />
                              <div className="flex-1 min-w-0">
                                <div className="text-sm font-medium leading-snug">{it.title}</div>
                                <div className="flex flex-wrap gap-2 mt-1 text-xs text-muted-foreground items-center">
                                  {it.sub_category && <span>📂 {it.sub_category}</span>}
                                  {it.hours && <span>⏱ {it.hours} ч.</span>}
                                  <a
                                    href={it.source_url}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="inline-flex items-center gap-1 hover:text-primary"
                                  >
                                    <ExternalLink className="w-3 h-3" /> источник
                                  </a>
                                  {it.error_message && (
                                    <span className="text-red-600" title={it.error_message}>
                                      ⚠️ {it.error_message.slice(0, 80)}
                                    </span>
                                  )}
                                </div>
                              </div>
                              <StatusBadge status={it.status} />
                            </div>
                          ))}
                        </div>
                      </CollapsibleContent>
                    </Collapsible>
                  );
                })}
              </div>
            )}
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
}
