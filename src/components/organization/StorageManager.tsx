import { useState, useEffect, useCallback, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue } from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle } from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { safeInvoke } from "@/utils/safeInvoke";
import {
  Search, Trash2, Upload, Video, FileText,
  Image as ImageIcon, Music, HardDrive, FolderOpen, RefreshCw, File,
  ChevronDown, ChevronRight, Presentation, Stamp, Receipt, Building2, BookOpen,
  UserCheck, ExternalLink, Download, Eye, Shield
} from "lucide-react";
import { toast } from "sonner";
import { SigmaSpinner } from "@/components/ui/SigmaSpinner";

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
  isPrivate?: boolean;
}

const VIDEO_EXT = ["mp4", "webm", "ogg", "mov", "avi", "mkv"];
const IMAGE_EXT = ["jpg", "jpeg", "png", "gif", "webp", "svg", "bmp"];
const AUDIO_EXT = ["mp3", "wav", "ogg", "m4a", "aac", "flac"];
const DOC_EXT = ["pdf", "doc", "docx", "xls", "xlsx", "rtf", "txt", "csv"];
const PRES_EXT = ["ppt", "pptx", "odp", "key"];
const HIDDEN_EXT = ["wmf", "emf"];

const PRIVATE_BUCKETS = ["student-documents"];

const PREVIEWABLE_IMAGE_EXT = ["jpg", "jpeg", "png", "gif", "webp", "svg"];
const PREVIEWABLE_VIDEO_EXT = ["mp4", "webm"];
const PREVIEWABLE_AUDIO_EXT = ["mp3", "wav"];
const PREVIEWABLE_PDF_EXT = ["pdf"];

function getFileExt(name: string): string {
  return name.split(".").pop()?.toLowerCase() || "";
}

function getFileType(name: string): StorageFile["type"] {
  const ext = getFileExt(name);
  if (VIDEO_EXT.includes(ext)) return "video";
  if (IMAGE_EXT.includes(ext)) return "image";
  if (AUDIO_EXT.includes(ext)) return "audio";
  if (PRES_EXT.includes(ext)) return "presentation";
  if (DOC_EXT.includes(ext)) return "document";
  return "other";
}

function isHiddenArtifact(name: string): boolean {
  const ext = getFileExt(name);
  return HIDDEN_EXT.includes(ext);
}

function canPreview(name: string): boolean {
  const ext = getFileExt(name);
  return (
    PREVIEWABLE_IMAGE_EXT.includes(ext) ||
    PREVIEWABLE_VIDEO_EXT.includes(ext) ||
    PREVIEWABLE_AUDIO_EXT.includes(ext) ||
    PREVIEWABLE_PDF_EXT.includes(ext)
  );
}

function getPreviewType(name: string): "image" | "video" | "audio" | "pdf" | "none" {
  const ext = getFileExt(name);
  if (PREVIEWABLE_IMAGE_EXT.includes(ext)) return "image";
  if (PREVIEWABLE_VIDEO_EXT.includes(ext)) return "video";
  if (PREVIEWABLE_AUDIO_EXT.includes(ext)) return "audio";
  if (PREVIEWABLE_PDF_EXT.includes(ext)) return "pdf";
  return "none";
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
      hour: "2-digit", minute: "2-digit" });
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
  "student-documents": "Документы слушателей" };

const BUCKET_ICONS: Record<string, React.ReactNode> = {
  "presentations": <Presentation className="w-4 h-4" />,
  "course-files": <BookOpen className="w-4 h-4" />,
  "course-videos": <Video className="w-4 h-4" />,
  "org-documents": <FileText className="w-4 h-4" />,
  "company-documents": <Building2 className="w-4 h-4" />,
  "org-branding": <Stamp className="w-4 h-4" />,
  "library-files": <HardDrive className="w-4 h-4" />,
  "billing-documents": <Receipt className="w-4 h-4" />,
  "student-documents": <UserCheck className="w-4 h-4" /> };

const TYPE_LABELS: Record<string, string> = {
  all: "Все типы",
  video: "Видео",
  image: "Изображения",
  audio: "Аудио",
  presentation: "Презентации",
  document: "Документы",
  other: "Прочее" };

export function StorageManager({ organizationId }: StorageManagerProps) {
  const [files, setFiles] = useState<StorageFile[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [bucketFilter, setBucketFilter] = useState("all");
  // All buckets collapsed by default — expanded ones are marked true
  const [expandedBuckets, setExpandedBuckets] = useState<Record<string, boolean>>({});
  const [deleteFile, setDeleteFile] = useState<StorageFile | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [previewFile, setPreviewFile] = useState<StorageFile | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  const getSignedUrl = useCallback(async (bucket: string, path: string): Promise<string | null> => {
    const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, 3600);
    if (error) {
      console.error("Error creating signed URL:", error);
      return null;
    }
    return data.signedUrl;
  }, []);

  const getFileUrl = useCallback(async (file: StorageFile): Promise<string> => {
    if (file.isPrivate) {
      const path = `${file.folder}/${file.name}`;
      const signed = await getSignedUrl(file.bucket, path);
      return signed || file.url;
    }
    return file.url;
  }, [getSignedUrl]);

  const loadFiles = useCallback(async () => {
    setLoading(true);
    try {
      const allFiles: StorageFile[] = [];
      const baseUrl = import.meta.env.VITE_SUPABASE_URL;

      const scanPath = async (
        client: any,
        bucket: string,
        prefix: string,
        urlBase: string,
        depth = 0,
        isPrivateBucket = false
      ) => {
        try {
          const { data: items } = await client.storage
            .from(bucket)
            .list(prefix, { limit: 500 });
          if (!items) return;
          for (const f of items) {
            if (f.id === null && depth < 2) {
              await scanPath(client, bucket, `${prefix}/${f.name}`, urlBase, depth + 1, isPrivateBucket);
            } else if (f.id !== null) {
              if (isHiddenArtifact(f.name)) continue;
              const fileSize = (f.metadata as any)?.size || 0;
              if (fileSize === 0) continue;
              if (!f.name.includes('.')) continue;
              allFiles.push({
                name: f.name,
                url: isPrivateBucket
                  ? "" // Will use signed URLs on demand
                  : `${urlBase}/storage/v1/object/public/${bucket}/${prefix}/${f.name}`,
                bucket,
                folder: prefix,
                size: fileSize,
                created_at: (f as any).created_at || "",
                type: getFileType(f.name),
                isPrivate: isPrivateBucket });
            }
          }
        } catch { /* path doesn't exist */ }
      };

      const { data: courses } = await supabase
        .from("courses")
        .select("id")
        .eq("organization_id", organizationId);
      const courseIds = courses?.map(c => c.id) || [];

      const courseScans = courseIds.flatMap(courseId => [
        scanPath(supabase, "course-files", courseId, baseUrl),
        scanPath(supabase, "presentations", courseId, baseUrl),
      ]);

      const orgScans = [
        scanPath(supabase, "org-documents", organizationId, baseUrl),
        scanPath(supabase, "company-documents", organizationId, baseUrl),
        scanPath(supabase, "org-branding", organizationId, baseUrl),
        scanPath(supabase, "library-files", `library/${organizationId}`, baseUrl),
        scanPath(supabase, "billing-documents", organizationId, baseUrl),
        scanPath(supabase, "student-documents", organizationId, baseUrl, 0, true),
      ];

      await Promise.all([...courseScans, ...orgScans]);

      // External storage (course-videos)
      try {
        const { data: config } = await safeInvoke<any>("get-external-storage-config");
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
        const { data: config } = await safeInvoke<any>("get-external-storage-config");
        if (config?.configured && config?.url && config?.key) {
          const { createClient } = await import("@supabase/supabase-js");
          const extClient = createClient(config.url, config.key);
          await extClient.storage.from("course-videos").remove([path]);
        }
      } else {
        await supabase.storage.from(deleteFile.bucket).remove([path]);
      }
      setFiles(prev => prev.filter(f => !(f.bucket === deleteFile.bucket && f.folder === deleteFile.folder && f.name === deleteFile.name)));
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
        type: getFileType(file.name) };
      setFiles(prev => [newFile, ...prev]);
      toast.success("Файл загружен");
    } catch (err) {
      console.error("Upload error:", err);
      toast.error("Ошибка загрузки файла");
    }
    setUploading(false);
    e.target.value = "";
  };

  const openPreview = async (file: StorageFile) => {
    setPreviewFile(file);
    setPreviewLoading(true);
    const url = await getFileUrl(file);
    setPreviewUrl(url);
    setPreviewLoading(false);
  };

  const openInNewTab = async (file: StorageFile) => {
    const url = await getFileUrl(file);
    window.open(url, "_blank");
  };

  const downloadFile = async (file: StorageFile) => {
    const url = await getFileUrl(file);
    const a = document.createElement("a");
    a.href = url;
    a.download = file.name;
    a.target = "_blank";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const filtered = useMemo(() =>
    files
      .filter(f => bucketFilter === "all" || f.bucket === bucketFilter)
      .filter(f => typeFilter === "all" || f.type === typeFilter)
      .filter(f => !search || f.name.toLowerCase().includes(search.toLowerCase())),
    [files, bucketFilter, typeFilter, search]
  );

  const groupedByBucket = useMemo(() => {
    const groups: Record<string, StorageFile[]> = {};
    for (const f of filtered) {
      if (!groups[f.bucket]) groups[f.bucket] = [];
      groups[f.bucket].push(f);
    }
    const order = Object.keys(BUCKET_LABELS).filter(k => k !== "all");
    const sorted: [string, StorageFile[]][] = [];
    for (const b of order) {
      if (groups[b]) sorted.push([b, groups[b]]);
    }
    for (const [b, fs] of Object.entries(groups)) {
      if (!sorted.find(([k]) => k === b)) sorted.push([b, fs]);
    }
    return sorted;
  }, [filtered]);

  const toggleBucket = (bucket: string) => {
    setExpandedBuckets(prev => ({ ...prev, [bucket]: !prev[bucket] }));
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

  const previewType = previewFile ? getPreviewType(previewFile.name) : "none";

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
              {uploading ? <SigmaSpinner size="sm" /> : <Upload className="w-4 h-4" />}
              Загрузить файл
            </label>
          </Button>
        </div>
      </div>

      {/* File list grouped by bucket */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <SigmaSpinner />
          <span className="ml-2 text-muted-foreground">Загрузка файлов...</span>
        </div>
      ) : filtered.length === 0 ? (
        files.length === 0 ? (
          <Card className="overflow-hidden border-0 shadow-lg">
            <div className="bg-gradient-to-br from-primary/10 via-primary/5 to-transparent p-8">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-12 h-12 rounded-xl bg-primary/15 flex items-center justify-center">
                  <HardDrive className="w-6 h-6 text-primary" />
                </div>
                <div>
                  <h2 className="text-2xl font-bold">Ваше облачное хранилище готово к работе</h2>
                  <p className="text-muted-foreground">Все файлы организации — в одном месте</p>
                </div>
              </div>
            </div>
            <CardContent className="p-8 pt-6">
              <div className="grid sm:grid-cols-2 gap-4 mb-8">
                {[
                  { icon: FolderOpen, title: "Все файлы из курсов", desc: "Автоматический сбор видео, изображений и документов из всех курсов в единый каталог" },
                  { icon: Eye, title: "Инлайн-предпросмотр", desc: "Смотрите видео, PDF, изображения и аудио прямо в браузере без скачивания" },
                  { icon: Search, title: "Умная группировка", desc: "Файлы сгруппированы по разделам с поиском и фильтрацией по типу" },
                  { icon: Shield, title: "Безопасный доступ", desc: "Приватные документы студентов доступны через подписанные URL с ограниченным сроком" },
                  { icon: Upload, title: "Загрузка в один клик", desc: "Загружайте файлы через интерфейс хранилища или напрямую из конструктора курсов" },
                  { icon: HardDrive, title: "Внешнее хранилище", desc: "Подключите внешнее S3-совместимое хранилище для масштабирования объёмов" },
                ].map((feature, i) => (
                  <div key={i} className="flex gap-3 p-3 rounded-lg hover:bg-muted/50 transition-colors">
                    <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                      <feature.icon className="w-4 h-4 text-primary" />
                    </div>
                    <div>
                      <p className="font-medium text-sm">{feature.title}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{feature.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
              <Button size="lg" className="w-full sm:w-auto" asChild>
                <label>
                  <input type="file" className="hidden" onChange={handleUpload} />
                  <Upload className="w-4 h-4 mr-2" />
                  Загрузить первый файл
                </label>
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="text-center py-16 text-muted-foreground">
            <Search className="w-12 h-12 mx-auto mb-3 opacity-40" />
            <p className="font-medium">Нет файлов по фильтру</p>
            <p className="text-sm mt-1">Попробуйте изменить параметры поиска</p>
          </div>
        )
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
                  {expandedBuckets[bucket]
                    ? <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />
                    : <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                  }
                  <span className="shrink-0">{BUCKET_ICONS[bucket] || <FolderOpen className="w-4 h-4" />}</span>
                  <span className="font-medium text-sm">{BUCKET_LABELS[bucket] || bucket}</span>
                  <Badge variant="secondary" className="ml-auto text-xs">{bucketFiles.length}</Badge>
                </button>

                {/* Bucket files — only shown when expanded */}
                {expandedBuckets[bucket] && (
                  <div className="divide-y divide-border">
                    {bucketFiles.map((file, i) => (
                      <div
                        key={`${file.bucket}-${file.folder}-${file.name}-${i}`}
                        className="flex items-center gap-3 px-4 py-3 hover:bg-muted/30 transition-colors group"
                      >
                        {/* Thumbnail / Icon */}
                        <div className="shrink-0 w-10 h-10 rounded-lg bg-muted flex items-center justify-center overflow-hidden">
                          {file.type === "image" && !file.isPrivate ? (
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
                            title="Предпросмотр"
                            onClick={() => openPreview(file)}
                          >
                            <Eye className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            title="Открыть в новой вкладке"
                            onClick={() => openInNewTab(file)}
                          >
                            <ExternalLink className="w-4 h-4" />
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

      {/* File Preview Dialog */}
      <Dialog open={!!previewFile} onOpenChange={(open) => { if (!open) { setPreviewFile(null); setPreviewUrl(null); } }}>
        <DialogContent className={`${previewType === "pdf" || previewType === "image" ? "max-w-4xl" : "max-w-lg"}`}>
          <DialogHeader>
            <DialogTitle className="truncate pr-8">{previewFile?.name}</DialogTitle>
            <DialogDescription>
              {previewFile && `${formatSize(previewFile.size)} • ${BUCKET_LABELS[previewFile.bucket] || previewFile.bucket}`}
            </DialogDescription>
          </DialogHeader>

          <div className="min-h-[200px] flex items-center justify-center">
            {previewLoading ? (
              <SigmaSpinner size="lg" />
            ) : previewUrl && previewType === "image" ? (
              <img
                src={previewUrl}
                alt={previewFile?.name}
                className="max-w-full max-h-[60vh] rounded-lg object-contain"
              />
            ) : previewUrl && previewType === "pdf" ? (
              <iframe
                src={previewUrl}
                className="w-full h-[60vh] rounded-lg border border-border"
                title={previewFile?.name}
              />
            ) : previewUrl && previewType === "video" ? (
              <video
                src={previewUrl}
                controls
                className="max-w-full max-h-[60vh] rounded-lg"
              />
            ) : previewUrl && previewType === "audio" ? (
              <div className="w-full flex flex-col items-center gap-4 py-8">
                <Music className="w-16 h-16 text-muted-foreground" />
                <audio src={previewUrl} controls className="w-full max-w-md" />
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <File className="w-16 h-16 mx-auto mb-3 opacity-40" />
                <p className="font-medium">Предпросмотр недоступен</p>
                <p className="text-sm mt-1">Скачайте файл для просмотра</p>
              </div>
            )}
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" className="gap-2 rounded-xl" onClick={() => previewFile && openInNewTab(previewFile)}>
              <ExternalLink className="w-4 h-4" />
              Открыть в новой вкладке
            </Button>
            <Button className="gap-2 rounded-xl" onClick={() => previewFile && downloadFile(previewFile)}>
              <Download className="w-4 h-4" />
              Скачать
            </Button>
          </div>
        </DialogContent>
      </Dialog>

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
              {deleting ? <SigmaSpinner size="sm" className="mr-2" /> : null}
              Удалить
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
