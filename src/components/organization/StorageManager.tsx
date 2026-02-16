import { useState, useEffect, useCallback, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import {
  Search, Trash2, Loader2, Upload, Video, FileText,
  Image as ImageIcon, Music, HardDrive, FolderOpen, RefreshCw, File,
  ChevronDown, ChevronRight, Presentation, Stamp, Receipt, Building2, BookOpen
} from "lucide-react";
import { toast } from "sonner";

interface StorageManagerProps {
  organizationId: string;
}

interface StorageFile {
  name: string;
  url: string;
  bucket: string;
  folder: string;
  size: number;
  created_at: string;
  type: "video" | "image" | "audio" | "document" | "presentation" | "other";
}

const VIDEO_EXT = ["mp4", "webm", "ogg", "mov", "avi", "mkv"];
const IMAGE_EXT = ["jpg", "jpeg", "png", "gif", "webp", "svg", "bmp"];
const AUDIO_EXT = ["mp3", "wav", "ogg", "m4a", "aac", "flac"];
const DOC_EXT = ["pdf", "doc", "docx", "xls", "xlsx", "rtf", "txt", "csv"];
const PRES_EXT = ["ppt", "pptx", "odp", "key"];
// Hidden artifact extensions from Word/PowerPoint imports
const HIDDEN_EXT = ["wmf", "emf"];

function getFileType(name: string): StorageFile["type"] {
  const ext = name.split(".").pop()?.toLowerCase() || "";
  if (VIDEO_EXT.includes(ext)) return "video";
  if (IMAGE_EXT.includes(ext)) return "image";
  if (AUDIO_EXT.includes(ext)) return "audio";
  if (PRES_EXT.includes(ext)) return "presentation";
  if (DOC_EXT.includes(ext)) return "document";
  return "other";
}

function isHiddenArtifact(name: string): boolean {
  const ext = name.split(".").pop()?.toLowerCase() || "";
  return HIDDEN_EXT.includes(ext);
}

function formatSize(bytes: number): string {
  if (bytes <= 0) return "—";
  if (bytes < 1024) return `${bytes} Б`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} КБ`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} МБ`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} ГБ`;
}

function formatDate(dateStr: string): string {
  if (!dateStr) return "";
  try {
    return new Date(dateStr).toLocaleDateString("ru-RU", {
      day: "2-digit", month: "2-digit", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    });
  } catch { return ""; }
}

function getTypeIcon(type: StorageFile["type"]) {
  switch (type) {
    case "video": return <Video className="w-5 h-5 text-destructive" />;
    case "image": return <ImageIcon className="w-5 h-5 text-primary" />;
    case "audio": return <Music className="w-5 h-5 text-accent-foreground" />;
    case "presentation": return <Presentation className="w-5 h-5 text-primary" />;
    case "document": return <FileText className="w-5 h-5 text-primary" />;
    default: return <File className="w-5 h-5 text-muted-foreground" />;
  }
}

const BUCKET_LABELS: Record<string, string> = {
  "all": "Все разделы",
  "presentations": "Презентации",
  "course-files": "Файлы курсов",
  "course-videos": "Видео курсов",
  "org-documents": "Документы организации",
  "company-documents": "Документы компаний",
  "org-branding": "Брендинг",
  "library-files": "Библиотека",
  "billing-documents": "Платёжные документы",
};

const BUCKET_ICONS: Record<string, React.ReactNode> = {
  "presentations": <Presentation className="w-4 h-4" />,
  "course-files": <BookOpen className="w-4 h-4" />,
  "course-videos": <Video className="w-4 h-4" />,
  "org-documents": <FileText className="w-4 h-4" />,
  "company-documents": <Building2 className="w-4 h-4" />,
  "org-branding": <Stamp className="w-4 h-4" />,
  "library-files": <HardDrive className="w-4 h-4" />,
  "billing-documents": <Receipt className="w-4 h-4" />,
};

const TYPE_LABELS: Record<string, string> = {
  all: "Все типы",
  video: "Видео",
  image: "Изображения",
  audio: "Аудио",
  presentation: "Презентации",
  document: "Документы",
  other: "Прочее",
};

export function StorageManager({ organizationId }: StorageManagerProps) {
  const [files, setFiles] = useState<StorageFile[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [bucketFilter, setBucketFilter] = useState("all");
  const [collapsedBuckets, setCollapsedBuckets] = useState<Record<string, boolean>>({});
  const [deleteFile, setDeleteFile] = useState<StorageFile | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [uploading, setUploading] = useState(false);

  const loadFiles = useCallback(async () => {
    setLoading(true);
    try {
      const allFiles: StorageFile[] = [];
      const baseUrl = import.meta.env.VITE_SUPABASE_URL;

      // Helper: recursively scan a bucket path (up to 2 levels deep)
      const scanPath = async (
        client: any,
        bucket: string,
        prefix: string,
        urlBase: string,
        depth = 0
      ) => {
        try {
          const { data: items } = await client.storage
            .from(bucket)
            .list(prefix, { limit: 500 });
          if (!items) return;
          for (const f of items) {
            if (f.id === null && depth < 2) {
              await scanPath(client, bucket, `${prefix}/${f.name}`, urlBase, depth + 1);
            } else if (f.id !== null) {
              // Skip hidden artifact files (WMF, EMF) and zero-byte placeholders
              if (isHiddenArtifact(f.name)) continue;
              const fileSize = (f.metadata as any)?.size || 0;
              if (fileSize === 0) continue;
              // Skip files without extensions (import artifacts)
              if (!f.name.includes('.')) continue;
              allFiles.push({
                name: f.name,
                url: `${urlBase}/storage/v1/object/public/${bucket}/${prefix}/${f.name}`,
                bucket,
                folder: prefix,
                size: fileSize,
                created_at: (f as any).created_at || "",
                type: getFileType(f.name),
              });
            }
          }
        } catch { /* path doesn't exist */ }
      };

      // Get course IDs for this organization
      const { data: courses } = await supabase
        .from("courses")
        .select("id")
        .eq("organization_id", organizationId);
      const courseIds = courses?.map(c => c.id) || [];

      // 1. Course-based buckets
      const courseScans = courseIds.flatMap(courseId => [
        scanPath(supabase, "course-files", courseId, baseUrl),
        scanPath(supabase, "presentations", courseId, baseUrl),
      ]);

      // 2. Organization-level buckets
      const orgScans = [
        scanPath(supabase, "org-documents", organizationId, baseUrl),
        scanPath(supabase, "company-documents", organizationId, baseUrl),
        scanPath(supabase, "org-branding", organizationId, baseUrl),
        scanPath(supabase, "library-files", `library/${organizationId}`, baseUrl),
        scanPath(supabase, "billing-documents", organizationId, baseUrl),
      ];

      await Promise.all([...courseScans, ...orgScans]);

      // 3. External storage (course-videos)
      try {
        const { data: config } = await supabase.functions.invoke("get-external-storage-config");
        if (config?.configured && config?.url && config?.key) {
          const { createClient } = await import("@supabase/supabase-js");
          const extClient = createClient(config.url, config.key);
          await Promise.all(
            courseIds.map(courseId => scanPath(extClient, "course-videos", courseId, config.url))
          );
        }
      } catch { /* external not configured */ }

      allFiles.sort((a, b) => (b.created_at || "").localeCompare(a.created_at || ""));
      setFiles(allFiles);
    } catch (err) {
      console.error("Error loading storage files:", err);
      toast.error("Ошибка загрузки файлов");
    }
    setLoading(false);
  }, [organizationId]);

  useEffect(() => {
    loadFiles();
  }, [loadFiles]);

  const handleDelete = async () => {
    if (!deleteFile) return;
    setDeleting(true);
    try {
      const path = `${deleteFile.folder}/${deleteFile.name}`;
      if (deleteFile.bucket === "course-videos") {
        const { data: config } = await supabase.functions.invoke("get-external-storage-config");
        if (config?.configured && config?.url && config?.key) {
          const { createClient } = await import("@supabase/supabase-js");
          const extClient = createClient(config.url, config.key);
          await extClient.storage.from("course-videos").remove([path]);
        }
      } else {
        await supabase.storage.from(deleteFile.bucket).remove([path]);
      }
      setFiles(prev => prev.filter(f => f.url !== deleteFile.url));
      toast.success("Файл удалён");
    } catch (err) {
      console.error("Delete error:", err);
      toast.error("Ошибка удаления файла");
    }
    setDeleting(false);
    setDeleteFile(null);
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    const bucket = "course-files";
    const path = `${organizationId}/${file.name}`;
    const baseUrl = import.meta.env.VITE_SUPABASE_URL;

    try {
      const { error } = await supabase.storage.from(bucket).upload(path, file, { upsert: true });
      if (error) throw error;

      const newFile: StorageFile = {
        name: file.name,
        url: `${baseUrl}/storage/v1/object/public/${bucket}/${path}`,
        bucket,
        folder: organizationId,
        size: file.size,
        created_at: new Date().toISOString(),
        type: getFileType(file.name),
      };
      setFiles(prev => [newFile, ...prev]);
      toast.success("Файл загружен");
    } catch (err) {
      console.error("Upload error:", err);
      toast.error("Ошибка загрузки файла");
    }
    setUploading(false);
    e.target.value = "";
  };

  const filtered = useMemo(() =>
    files
      .filter(f => bucketFilter === "all" || f.bucket === bucketFilter)
      .filter(f => typeFilter === "all" || f.type === typeFilter)
      .filter(f => !search || f.name.toLowerCase().includes(search.toLowerCase())),
    [files, bucketFilter, typeFilter, search]
  );

  // Group files by bucket
  const groupedByBucket = useMemo(() => {
    const groups: Record<string, StorageFile[]> = {};
    for (const f of filtered) {
      if (!groups[f.bucket]) groups[f.bucket] = [];
      groups[f.bucket].push(f);
    }
    // Sort buckets by predefined order
    const order = Object.keys(BUCKET_LABELS).filter(k => k !== "all");
    const sorted: [string, StorageFile[]][] = [];
    for (const b of order) {
      if (groups[b]) sorted.push([b, groups[b]]);
    }
    // Add any remaining
    for (const [b, fs] of Object.entries(groups)) {
      if (!sorted.find(([k]) => k === b)) sorted.push([b, fs]);
    }
    return sorted;
  }, [filtered]);

  const toggleBucket = (bucket: string) => {
    setCollapsedBuckets(prev => ({ ...prev, [bucket]: !prev[bucket] }));
  };

  const totalSize = files.reduce((sum, f) => sum + f.size, 0);
  const bucketCounts = useMemo(() => {
    const acc: Record<string, number> = {};
    for (const f of files) {
      acc[f.bucket] = (acc[f.bucket] || 0) + 1;
    }
    return acc;
  }, [files]);
  const typeCounts = useMemo(() => {
    const acc: Record<string, number> = {};
    for (const f of files) {
      acc[f.type] = (acc[f.type] || 0) + 1;
    }
    return acc;
  }, [files]);

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
        <div className="bg-card rounded-xl border border-border p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <HardDrive className="w-5 h-5 text-primary" />
            </div>
            <div>
              <div className="text-xl font-bold">{formatSize(totalSize)}</div>
              <div className="text-xs text-muted-foreground">Всего</div>
            </div>
          </div>
        </div>
        {(["video", "image", "presentation", "audio", "document"] as const).map(type => (
          <div key={type} className="bg-card rounded-xl border border-border p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center">
                {getTypeIcon(type)}
              </div>
              <div>
                <div className="text-xl font-bold">{typeCounts[type] || 0}</div>
                <div className="text-xs text-muted-foreground">{TYPE_LABELS[type]}</div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Controls */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Поиск файлов..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-10 w-64 rounded-xl"
            />
          </div>
          <Select value={bucketFilter} onValueChange={setBucketFilter}>
            <SelectTrigger className="w-52 rounded-xl">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(BUCKET_LABELS).map(([v, label]) => (
                <SelectItem key={v} value={v}>
                  <span className="flex items-center gap-2">
                    {v !== "all" && BUCKET_ICONS[v]}
                    {label}
                    {v !== "all" && bucketCounts[v] ? ` (${bucketCounts[v]})` : ""}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-44 rounded-xl">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(TYPE_LABELS).map(([v, label]) => (
                <SelectItem key={v} value={v}>{label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" className="rounded-xl gap-2" onClick={loadFiles} disabled={loading}>
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            Обновить
          </Button>
          <Button className="btn-gradient rounded-xl gap-2" disabled={uploading} asChild>
            <label>
              <input type="file" className="hidden" onChange={handleUpload} />
              {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
              Загрузить файл
            </label>
          </Button>
        </div>
      </div>

      {/* File list grouped by bucket */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          <span className="ml-2 text-muted-foreground">Загрузка файлов...</span>
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <FolderOpen className="w-12 h-12 mx-auto mb-3 opacity-40" />
          <p className="font-medium">{files.length === 0 ? "Хранилище пусто" : "Нет файлов по фильтру"}</p>
          <p className="text-sm mt-1">
            {files.length === 0 ? "Загрузите файлы через курсы или кнопку «Загрузить файл»" : "Попробуйте изменить параметры поиска"}
          </p>
        </div>
      ) : (
        <ScrollArea className="h-[calc(100vh-460px)] min-h-[300px]">
          <div className="space-y-2">
            {groupedByBucket.map(([bucket, bucketFiles]) => (
              <div key={bucket} className="border border-border rounded-xl overflow-hidden">
                {/* Bucket header */}
                <button
                  onClick={() => toggleBucket(bucket)}
                  className="w-full flex items-center gap-3 px-4 py-3 bg-muted/30 hover:bg-muted/50 transition-colors text-left"
                >
                  {collapsedBuckets[bucket]
                    ? <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                    : <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />
                  }
                  <span className="shrink-0">{BUCKET_ICONS[bucket] || <FolderOpen className="w-4 h-4" />}</span>
                  <span className="font-medium text-sm">{BUCKET_LABELS[bucket] || bucket}</span>
                  <Badge variant="secondary" className="ml-auto text-xs">{bucketFiles.length}</Badge>
                </button>

                {/* Bucket files */}
                {!collapsedBuckets[bucket] && (
                  <div className="divide-y divide-border">
                    {bucketFiles.map((file, i) => (
                      <div
                        key={`${file.bucket}-${file.folder}-${file.name}-${i}`}
                        className="flex items-center gap-3 px-4 py-3 hover:bg-muted/30 transition-colors group"
                      >
                        {/* Thumbnail / Icon */}
                        <div className="shrink-0 w-10 h-10 rounded-lg bg-muted flex items-center justify-center overflow-hidden">
                          {file.type === "image" ? (
                            <img
                              src={file.url}
                              alt={file.name}
                              className="w-full h-full object-cover"
                              loading="lazy"
                            />
                          ) : (
                            getTypeIcon(file.type)
                          )}
                        </div>

                        {/* Info */}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{file.name}</p>
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <span>{formatSize(file.size)}</span>
                            {file.created_at && <span>{formatDate(file.created_at)}</span>}
                          </div>
                        </div>

                        {/* Actions */}
                        <div className="shrink-0 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => window.open(file.url, "_blank")}
                          >
                            <FolderOpen className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-destructive hover:text-destructive"
                            onClick={() => setDeleteFile(file)}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </ScrollArea>
      )}

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteFile} onOpenChange={() => setDeleteFile(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Удалить файл?</AlertDialogTitle>
            <AlertDialogDescription>
              Файл «{deleteFile?.name}» будет удалён из хранилища. Это действие нельзя отменить.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Отмена</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} disabled={deleting} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {deleting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Удалить
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
