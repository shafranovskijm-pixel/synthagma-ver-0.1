import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { supabase } from "@/integrations/supabase/client";
import { Video, FileText, Image as ImageIcon, Search, FolderOpen, Music, BookOpen, User, CheckCircle2, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { SigmaSpinner } from "@/components/ui/SigmaSpinner";

interface MediaLibraryDialogProps {
  open: boolean;
  onClose: () => void;
  onSelect: (url: string) => void;
  filter?: "video" | "image" | "audio" | "all";
  organizationId?: string;
}

interface StorageFile {
  name: string;
  url: string;
  bucket: string;
  folder: string;
  size: number;
  created_at: string;
  type: "video" | "image" | "audio" | "file";
  courseName?: string;
  lessonTitle?: string;
  ownerName?: string;
  isUsed?: boolean;
}

const VIDEO_EXTENSIONS = ["mp4", "webm", "ogg", "mov", "avi"];
const IMAGE_EXTENSIONS = ["jpg", "jpeg", "png", "gif", "webp", "svg"];
const AUDIO_EXTENSIONS = ["mp3", "wav", "ogg", "m4a", "aac"];

function getFileType(name: string): StorageFile["type"] {
  const ext = name.split(".").pop()?.toLowerCase() || "";
  if (VIDEO_EXTENSIONS.includes(ext)) return "video";
  if (IMAGE_EXTENSIONS.includes(ext)) return "image";
  if (AUDIO_EXTENSIONS.includes(ext)) return "audio";
  return "file";
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} Б`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} КБ`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} МБ`;
}

function formatDate(dateStr: string): string {
  if (!dateStr) return "";
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
  } catch { return ""; }
}

function getFileIcon(type: StorageFile["type"]) {
  switch (type) {
    case "video": return <Video className="w-5 h-5 text-destructive" />;
    case "image": return <ImageIcon className="w-5 h-5 text-primary" />;
    case "audio": return <Music className="w-5 h-5 text-accent-foreground" />;
    default: return <FileText className="w-5 h-5 text-muted-foreground" />;
  }
}

function VideoThumbnail({ url, className }: { url: string; className?: string }) {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return <Video className="w-8 h-8 text-destructive" />;
  }

  return (
    <video
      src={url}
      muted
      preload="metadata"
      className={cn("object-cover rounded", className)}
      onError={() => setFailed(true)}
    />
  );
}

function FilePreview({ file, large }: { file: StorageFile; large?: boolean }) {
  const sizeClass = large ? "w-full max-h-[280px]" : "w-full h-full";

  if (file.type === "image") {
    return <img src={file.url} alt={file.name} className={cn(sizeClass, "object-cover rounded")} loading="lazy" />;
  }
  if (file.type === "video") {
    return <VideoThumbnail url={file.url} className={sizeClass} />;
  }
  return <div className="flex items-center justify-center w-full h-full">{getFileIcon(file.type)}</div>;
}

function FileDetailPanel({ file }: { file: StorageFile | null }) {
  if (!file) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-2 p-4">
        <FolderOpen className="w-12 h-12 opacity-30" />
        <p className="text-sm text-center">Выберите файл для просмотра деталей</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 p-3 h-full">
      {/* Large preview */}
      <div className="w-full aspect-video bg-muted rounded-lg flex items-center justify-center overflow-hidden">
        <FilePreview file={file} large />
      </div>

      <Separator />

      {/* Metadata */}
      <div className="space-y-2 text-sm">
        <div>
          <span className="text-muted-foreground">Имя:</span>
          <p className="font-medium truncate" title={file.name}>{file.name}</p>
        </div>

        <div className="flex gap-4 flex-wrap">
          {file.size > 0 && (
            <div>
              <span className="text-muted-foreground text-xs">Размер</span>
              <p className="font-medium">{formatSize(file.size)}</p>
            </div>
          )}
          {file.created_at && (
            <div>
              <span className="text-muted-foreground text-xs">Дата</span>
              <p className="font-medium">{formatDate(file.created_at)}</p>
            </div>
          )}
        </div>

        <div>
          <span className="text-muted-foreground text-xs">Хранилище</span>
          <div className="flex items-center gap-1.5 mt-0.5">
            <Badge variant="outline" className="text-xs">{file.bucket}</Badge>
            {file.folder && <span className="text-xs text-muted-foreground truncate max-w-[140px]" title={file.folder}>{file.folder}</span>}
          </div>
        </div>

        <Separator />

        {/* Course info */}
        <div className="flex items-start gap-2">
          <BookOpen className="w-4 h-4 text-primary mt-0.5 shrink-0" />
          <div>
            <span className="text-muted-foreground text-xs">Курс</span>
            <p className="font-medium">{file.courseName || "Не привязан"}</p>
          </div>
        </div>

        {/* Usage info */}
        <div className="flex items-start gap-2">
          {file.isUsed ? (
            <CheckCircle2 className="w-4 h-4 text-primary mt-0.5 shrink-0" />
          ) : (
            <XCircle className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
          )}
          <div>
            <span className="text-muted-foreground text-xs">Использование</span>
            <p className="font-medium">
              {file.isUsed ? (file.lessonTitle || "Используется") : "Не используется в уроках"}
            </p>
          </div>
        </div>

        {/* Owner */}
        <div className="flex items-start gap-2">
          <User className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
          <div>
            <span className="text-muted-foreground text-xs">Владелец</span>
            <p className="font-medium">{file.ownerName || "Неизвестен"}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

export function MediaLibraryDialog({ open, onClose, onSelect, filter = "all", organizationId }: MediaLibraryDialogProps) {
  const [files, setFiles] = useState<StorageFile[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [selectedFile, setSelectedFile] = useState<StorageFile | null>(null);

  useEffect(() => {
    if (open) {
      loadFiles();
      setSelectedFile(null);
      setSearch("");
    }
  }, [open]);

  const resolveOrgContext = async (): Promise<{ orgId: string | null; courseIds: string[]; courseTitles: Map<string, string> }> => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { orgId: null, courseIds: [], courseTitles: new Map() };

    let orgId = organizationId || null;
    if (!orgId) {
      const { data: profile } = await supabase
        .from("profiles").select("organization_id").eq("user_id", user.id).maybeSingle();
      orgId = profile?.organization_id || null;
    }

    if (!orgId) return { orgId: null, courseIds: [], courseTitles: new Map() };

    const { data: courses } = await supabase
      .from("courses").select("id, title").eq("organization_id", orgId);

    const titles = new Map<string, string>();
    const ids: string[] = [];
    for (const c of courses || []) { titles.set(c.id, c.title); ids.push(c.id); }
    return { orgId, courseIds: ids, courseTitles: titles };
  };

  const loadFiles = async () => {
    setLoading(true);
    const allFiles: StorageFile[] = [];
    const baseUrl = import.meta.env.VITE_SUPABASE_URL;

    try {
      const { orgId, courseIds, courseTitles } = await resolveOrgContext();
      if (!orgId) { setFiles([]); setLoading(false); return; }

      // Scan a single bucket prefix (one folder level deep)
      const scanPrefix = async (
        client: any, bucket: string, prefix: string, urlBase: string
      ): Promise<StorageFile[]> => {
        const out: StorageFile[] = [];
        try {
          const { data: items } = await client.storage.from(bucket).list(prefix, { limit: 500 });
          if (!items) return out;
          for (const f of items) {
            if (f.id === null) continue; // subfolder
            const size = (f.metadata as any)?.size || 0;
            if (size === 0 || !f.name.includes(".")) continue;
            out.push({
              name: f.name,
              url: `${urlBase}/storage/v1/object/public/${bucket}/${prefix}/${f.name}`,
              bucket,
              folder: prefix,
              size,
              created_at: (f as any).created_at || "",
              type: getFileType(f.name),
              courseName: courseTitles.get(prefix),
            });
          }
        } catch { /* missing folder */ }
        return out;
      };

      // 1. Internal storage: only this org's courses + org-level buckets
      const internalScans: Promise<StorageFile[]>[] = [];
      for (const cid of courseIds) {
        internalScans.push(scanPrefix(supabase, "course-files", cid, baseUrl));
        internalScans.push(scanPrefix(supabase, "presentations", cid, baseUrl));
      }
      internalScans.push(scanPrefix(supabase, "org-branding", orgId, baseUrl));
      internalScans.push(scanPrefix(supabase, "library-files", `library/${orgId}`, baseUrl));

      const internalResults = await Promise.all(internalScans);
      for (const arr of internalResults) allFiles.push(...arr);

      // 2. External storage (course-videos): only this org's course folders
      try {
        const { data: config } = await supabase.functions.invoke("get-external-storage-config");
        if (config?.configured && config?.url && config?.key) {
          const { createClient } = await import("@supabase/supabase-js");
          const extClient = createClient(config.url, config.key);
          const extScans = courseIds.map(cid => scanPrefix(extClient, "course-videos", cid, config.url));
          const extResults = await Promise.all(extScans);
          for (const arr of extResults) allFiles.push(...arr);
        }
      } catch { /* external not configured */ }

      // 3. Lightweight enrichment: mark files used in lessons (org-scoped)
      if (allFiles.length > 0 && courseIds.length > 0) {
        const { data: lessons } = await supabase
          .from("lessons").select("title, content, course_id")
          .in("course_id", courseIds);
        const lessonsArr = lessons || [];
        for (const file of allFiles) {
          const match = lessonsArr.find(l => l.content && file.url && (l.content as string).includes(file.name));
          if (match) {
            file.isUsed = true;
            file.lessonTitle = match.title;
          } else {
            file.isUsed = false;
          }
        }
      }
    } catch (err) {
      console.error("Error loading media library:", err);
    }

    setFiles(allFiles);
    setLoading(false);
  };

  const filteredFiles = files
    .filter((f) => {
      if (filter === "video") return f.type === "video";
      if (filter === "image") return f.type === "image";
      if (filter === "audio") return f.type === "audio";
      return true;
    })
    .filter((f) => !search || f.name.toLowerCase().includes(search.toLowerCase()) || f.folder.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => (b.created_at || "").localeCompare(a.created_at || ""));

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-4xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FolderOpen className="w-5 h-5" />
            Медиатека
            {!loading && files.length > 0 && (
              <Badge variant="secondary" className="ml-2 text-xs">
                {filteredFiles.length} файл(ов)
              </Badge>
            )}
          </DialogTitle>
        </DialogHeader>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Поиск по имени файла..."
            className="pl-9"
          />
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <SigmaSpinner />
            <span className="ml-2 text-sm text-muted-foreground">Загрузка файлов...</span>
          </div>
        ) : filteredFiles.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            <FolderOpen className="w-10 h-10 mx-auto mb-2 opacity-50" />
            <p className="text-sm">
              {files.length === 0 ? "В хранилище пока нет файлов" : "Нет файлов, соответствующих фильтру"}
            </p>
          </div>
        ) : (
          <div className="flex gap-4 min-h-0 flex-1">
            {/* Left: File list */}
            <ScrollArea className="h-[420px] flex-[3] min-w-0">
              <div className="space-y-1 pr-2">
                {filteredFiles.map((file, i) => (
                  <button
                    key={`${file.bucket}-${file.folder}-${file.name}-${i}`}
                    onClick={() => setSelectedFile(file)}
                    className={cn(
                      "w-full flex items-center gap-3 p-2 rounded-lg text-left transition-colors",
                      selectedFile?.url === file.url
                        ? "bg-primary/10 border border-primary/30"
                        : "hover:bg-muted/70"
                    )}
                  >
                    <div className="shrink-0 w-[72px] h-[72px] rounded-lg bg-muted flex items-center justify-center overflow-hidden">
                      <FilePreview file={file} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{file.name}</p>
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-0.5 flex-wrap">
                        {file.size > 0 && <span>{formatSize(file.size)}</span>}
                        {file.courseName && (
                          <>
                            <span>·</span>
                            <span className="truncate max-w-[140px]" title={file.courseName}>{file.courseName}</span>
                          </>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 mt-1">
                        {file.isUsed ? (
                          <Badge variant="default" className="text-[10px] px-1.5 py-0 h-4">Используется</Badge>
                        ) : (
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 text-muted-foreground">Не используется</Badge>
                        )}
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4">{file.bucket}</Badge>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </ScrollArea>

            {/* Right: Detail panel */}
            <div className="flex-[2] min-w-[240px] border rounded-lg bg-muted/30 overflow-auto max-h-[420px]">
              <FileDetailPanel file={selectedFile} />
            </div>
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2 border-t">
          <Button variant="outline" onClick={onClose}>
            Отмена
          </Button>
          <Button
            disabled={!selectedFile}
            onClick={() => {
              if (selectedFile) {
                onSelect(selectedFile.url);
                onClose();
              }
            }}
          >
            Выбрать
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
