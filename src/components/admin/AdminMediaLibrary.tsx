import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { SigmaSpinner } from "@/components/ui/SigmaSpinner";
import { toast } from "sonner";
import {
  RefreshCw, Trash2, Search, FileVideo, FileImage, FileText, File as FileIcon,
  Database, AlertTriangle, Sparkles,
} from "lucide-react";

interface MediaFile {
  bucket: string;
  path: string;
  name: string;
  size: number;
  createdAt: string;
  organizationId: string | null;
  organizationName: string | null;
  publicUrl: string;
  isUsed: boolean;
  usedIn: Array<{ entityType: string; entityId: string; entityTitle: string }>;
  storageType: "internal" | "external";
}

const formatSize = (bytes: number) => {
  if (!bytes) return "0 Б";
  const units = ["Б", "КБ", "МБ", "ГБ", "ТБ"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
};

const detectType = (name: string): "video" | "image" | "document" | "other" => {
  const ext = name.split(".").pop()?.toLowerCase() || "";
  if (["mp4", "webm", "mov", "avi", "mkv"].includes(ext)) return "video";
  if (["jpg", "jpeg", "png", "gif", "webp", "svg"].includes(ext)) return "image";
  if (["pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx", "txt"].includes(ext)) return "document";
  return "other";
};

const TypeIcon = ({ name }: { name: string }) => {
  const t = detectType(name);
  if (t === "video") return <FileVideo className="w-4 h-4 text-violet-500" />;
  if (t === "image") return <FileImage className="w-4 h-4 text-emerald-500" />;
  if (t === "document") return <FileText className="w-4 h-4 text-blue-500" />;
  return <FileIcon className="w-4 h-4 text-muted-foreground" />;
};

export function AdminMediaLibrary() {
  const [files, setFiles] = useState<MediaFile[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [search, setSearch] = useState("");
  const [orgFilter, setOrgFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [unusedOnly, setUnusedOnly] = useState(false);
  const [sortBy, setSortBy] = useState<"size" | "date" | "org">("size");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const load = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("admin-media-audit");
      if (error) throw error;
      setFiles(data.files || []);
      toast.success(`Загружено ${data.files?.length || 0} файлов`);
    } catch (e: any) {
      console.error(e);
      toast.error("Не удалось загрузить медиатеку", { description: e.message });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const orgOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const f of files) {
      if (f.organizationId && f.organizationName) map.set(f.organizationId, f.organizationName);
    }
    return Array.from(map.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [files]);

  const filtered = useMemo(() => {
    let res = files;
    if (search.trim()) {
      const q = search.toLowerCase();
      res = res.filter(f => f.name.toLowerCase().includes(q) || f.path.toLowerCase().includes(q));
    }
    if (orgFilter !== "all") {
      res = res.filter(f => f.organizationId === orgFilter || (orgFilter === "none" && !f.organizationId));
    }
    if (typeFilter !== "all") {
      res = res.filter(f => detectType(f.name) === typeFilter);
    }
    if (unusedOnly) {
      res = res.filter(f => !f.isUsed);
    }
    res = [...res].sort((a, b) => {
      if (sortBy === "size") return b.size - a.size;
      if (sortBy === "date") return (b.createdAt || "").localeCompare(a.createdAt || "");
      return (a.organizationName || "ZZZ").localeCompare(b.organizationName || "ZZZ");
    });
    return res;
  }, [files, search, orgFilter, typeFilter, unusedOnly, sortBy]);

  const stats = useMemo(() => {
    const totalSize = files.reduce((s, f) => s + f.size, 0);
    const unused = files.filter(f => !f.isUsed);
    const unusedSize = unused.reduce((s, f) => s + f.size, 0);
    return {
      total: files.length,
      totalSize,
      unused: unused.length,
      unusedSize,
    };
  }, [files]);

  const toggleSelect = (key: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const fileKey = (f: MediaFile) => `${f.bucket}::${f.path}`;

  const allFilteredSelected = filtered.length > 0 && filtered.every(f => selected.has(fileKey(f)));
  const toggleAllFiltered = () => {
    setSelected(prev => {
      const next = new Set(prev);
      if (allFilteredSelected) {
        for (const f of filtered) next.delete(fileKey(f));
      } else {
        for (const f of filtered) next.add(fileKey(f));
      }
      return next;
    });
  };

  const selectedFiles = useMemo(() => files.filter(f => selected.has(fileKey(f))), [files, selected]);
  const selectedSize = selectedFiles.reduce((s, f) => s + f.size, 0);
  const selectedUsedCount = selectedFiles.filter(f => f.isUsed).length;

  const performDelete = async (toDelete: MediaFile[]) => {
    if (!toDelete.length) return;
    setIsDeleting(true);
    try {
      const { data, error } = await supabase.functions.invoke("admin-media-delete", {
        body: {
          items: toDelete.map(f => ({ bucket: f.bucket, path: f.path, storageType: f.storageType })),
        },
      });
      if (error) throw error;
      const okPaths = new Set((data?.results || []).filter((r: any) => r.ok).map((r: any) => `${r.bucket}::${r.path}`));
      const failed = (data?.results || []).filter((r: any) => !r.ok);
      setFiles(prev => prev.filter(f => !okPaths.has(fileKey(f))));
      setSelected(new Set());
      toast.success(`Удалено ${okPaths.size} файлов`);
      if (failed.length) toast.error(`Не удалось удалить ${failed.length}`, { description: failed[0].error });
    } catch (e: any) {
      toast.error("Ошибка удаления", { description: e.message });
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="border border-border/60 rounded-xl p-3 bg-card">
          <div className="text-xs text-muted-foreground">Всего файлов</div>
          <div className="text-2xl font-bold">{stats.total}</div>
        </div>
        <div className="border border-border/60 rounded-xl p-3 bg-card">
          <div className="text-xs text-muted-foreground">Общий размер</div>
          <div className="text-2xl font-bold">{formatSize(stats.totalSize)}</div>
        </div>
        <div className="border border-amber-500/20 rounded-xl p-3 bg-amber-500/5">
          <div className="text-xs text-amber-700 dark:text-amber-400">Не используется</div>
          <div className="text-2xl font-bold text-amber-700 dark:text-amber-400">{stats.unused}</div>
        </div>
        <div className="border border-emerald-500/20 rounded-xl p-3 bg-emerald-500/5">
          <div className="text-xs text-emerald-700 dark:text-emerald-400">Можно освободить</div>
          <div className="text-2xl font-bold text-emerald-700 dark:text-emerald-400">{formatSize(stats.unusedSize)}</div>
        </div>
      </div>

      {/* Tip banner */}
      <div className="bg-primary/5 border border-primary/20 rounded-xl p-3 flex items-start gap-3">
        <Sparkles className="w-4 h-4 text-primary mt-0.5 shrink-0" />
        <div className="text-sm text-foreground/80">
          Аудит проверяет ссылки во всех уроках, курсах, документах и брендинге организаций.
          Файлы, отмеченные «Не используется», точно не задействованы — их можно удалить безопасно.
        </div>
      </div>

      {/* Controls */}
      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Поиск по имени файла..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 rounded-xl"
          />
        </div>
        <Select value={orgFilter} onValueChange={setOrgFilter}>
          <SelectTrigger className="w-[200px] rounded-xl"><SelectValue placeholder="Организация" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Все организации</SelectItem>
            <SelectItem value="none">Без организации</SelectItem>
            {orgOptions.map(([id, name]) => (
              <SelectItem key={id} value={id}>{name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-[140px] rounded-xl"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Все типы</SelectItem>
            <SelectItem value="video">Видео</SelectItem>
            <SelectItem value="image">Изображения</SelectItem>
            <SelectItem value="document">Документы</SelectItem>
            <SelectItem value="other">Прочее</SelectItem>
          </SelectContent>
        </Select>
        <Select value={sortBy} onValueChange={(v: any) => setSortBy(v)}>
          <SelectTrigger className="w-[160px] rounded-xl"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="size">По размеру ↓</SelectItem>
            <SelectItem value="date">По дате ↓</SelectItem>
            <SelectItem value="org">По организации</SelectItem>
          </SelectContent>
        </Select>
        <Button
          variant={unusedOnly ? "default" : "outline"}
          className="rounded-xl gap-2"
          onClick={() => setUnusedOnly(v => !v)}
        >
          {unusedOnly ? "✓ " : ""}Только неиспользуемые
        </Button>
        <Button variant="outline" className="rounded-xl gap-2" onClick={load} disabled={isLoading}>
          {isLoading ? <SigmaSpinner size="sm" /> : <RefreshCw className="w-4 h-4" />}
          Обновить
        </Button>
      </div>

      {/* Bulk delete */}
      {selected.size > 0 && (
        <div className="flex items-center justify-between bg-primary/5 border border-primary/20 rounded-xl p-3">
          <div className="text-sm">
            Выбрано: <strong>{selected.size}</strong> файлов · {formatSize(selectedSize)}
            {selectedUsedCount > 0 && (
              <span className="ml-2 text-destructive">⚠ {selectedUsedCount} используется</span>
            )}
          </div>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" className="rounded-xl gap-2" disabled={isDeleting}>
                <Trash2 className="w-4 h-4" /> Удалить выбранные
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Удалить {selected.size} файлов?</AlertDialogTitle>
                <AlertDialogDescription>
                  {selectedUsedCount > 0 ? (
                    <span className="block text-destructive font-medium">
                      ⚠ Внимание: {selectedUsedCount} из выбранных файлов используются в уроках или документах.
                      Их удаление приведёт к битым ссылкам.
                    </span>
                  ) : (
                    "Файлы будут безвозвратно удалены из хранилища."
                  )}
                  <span className="block mt-2">Освободится: {formatSize(selectedSize)}</span>
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Отмена</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => performDelete(selectedFiles)}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  Удалить
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      )}

      {/* List */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12"><SigmaSpinner /></div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <Database className="w-8 h-8 mx-auto mb-2 opacity-50" />
          Файлы не найдены
        </div>
      ) : (
        <div className="border border-border/60 rounded-xl overflow-hidden">
          <div className="bg-muted/30 px-3 py-2 flex items-center gap-3 text-xs font-medium text-muted-foreground border-b border-border/60">
            <Checkbox checked={allFilteredSelected} onCheckedChange={toggleAllFiltered} />
            <div className="flex-1">Файл</div>
            <div className="w-[140px] hidden md:block">Организация</div>
            <div className="w-[80px]">Размер</div>
            <div className="w-[100px]">Статус</div>
            <div className="w-[40px]"></div>
          </div>
          <div className="max-h-[600px] overflow-y-auto divide-y divide-border/40">
            {filtered.map(f => {
              const key = fileKey(f);
              const isSelected = selected.has(key);
              return (
                <div
                  key={key}
                  className={`px-3 py-2 flex items-center gap-3 hover:bg-muted/30 transition-colors ${isSelected ? "bg-primary/5" : ""}`}
                >
                  <Checkbox checked={isSelected} onCheckedChange={() => toggleSelect(key)} />
                  <TypeIcon name={f.name} />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate" title={f.name}>{f.name}</div>
                    <div className="text-xs text-muted-foreground truncate" title={f.path}>
                      {f.bucket}/{f.path}
                    </div>
                  </div>
                  <div className="w-[140px] hidden md:block text-xs text-muted-foreground truncate" title={f.organizationName || ""}>
                    {f.organizationName || <span className="italic">—</span>}
                  </div>
                  <div className="w-[80px] text-xs text-muted-foreground">{formatSize(f.size)}</div>
                  <div className="w-[100px]">
                    {f.isUsed ? (
                      <Badge variant="outline" className="text-emerald-600 border-emerald-500/30 bg-emerald-500/5 text-[10px]">
                        Используется
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-amber-600 border-amber-500/30 bg-amber-500/5 text-[10px]">
                        Не исп.
                      </Badge>
                    )}
                  </div>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:bg-destructive/10">
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Удалить файл?</AlertDialogTitle>
                        <AlertDialogDescription asChild>
                          <div>
                            <div className="font-mono text-xs bg-muted/50 p-2 rounded mt-2">{f.path}</div>
                            {f.isUsed && (
                              <div className="mt-3 p-3 rounded bg-destructive/10 border border-destructive/20 text-destructive text-sm">
                                <div className="flex items-start gap-2">
                                  <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                                  <div>
                                    <div className="font-medium">Файл используется!</div>
                                    {f.usedIn.slice(0, 5).map((u, i) => (
                                      <div key={i} className="text-xs mt-1 opacity-90">
                                        {u.entityType}: {u.entityTitle}
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Отмена</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={() => performDelete([f])}
                          className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                          Удалить
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              );
            })}
          </div>
          <div className="bg-muted/30 px-3 py-2 text-xs text-muted-foreground border-t border-border/60">
            Показано: {filtered.length} из {files.length}
          </div>
        </div>
      )}
    </div>
  );
}
