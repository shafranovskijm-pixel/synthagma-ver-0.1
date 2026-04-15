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

  const getOrgCourseIds = async (): Promise<string[]> => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return [];

    if (organizationId) {
      const { data } = await supabase.from("courses").select("id").eq("organization_id", organizationId);
      if (data && data.length > 0) return data.map(c => c.id);
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("organization_id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (profile?.organization_id) {
      const { data } = await supabase.from("courses").select("id").eq("organization_id", profile.organization_id);
      if (data && data.length > 0) return data.map(c => c.id);
    }

    const { data: role } = await supabase.from("user_roles").select("role").eq("user_id", user.id).maybeSingle();
    if (role?.role === "admin") {
      const { data } = await supabase.from("courses").select("id").limit(200);
      return data?.map(c => c.id) || [];
    }

    return [];
  };

  const loadFiles = async () => {
    setLoading(true);
    const allFiles: StorageFile[] = [];
    const baseUrl = import.meta.env.VITE_SUPABASE_URL;

    try {
      // 1. Load files from internal storage
      const [courseFilesRes, courseVideosRes] = await Promise.all([
        supabase.rpc("get_user_storage_files", { bucket_name: "course-files" }),
        supabase.rpc("get_user_storage_files", { bucket_name: "course-videos" }),
      ]);

      for (const { data, error, bucket } of [
        { ...courseFilesRes, bucket: "course-files" },
        { ...courseVideosRes, bucket: "course-videos" },
      ]) {
        if (!error && data) {
          for (const f of data as any[]) {
            const filePath = f.file_path || f.file_name;
            const fileName = filePath.split("/").pop() || filePath;
            const folder = filePath.includes("/") ? filePath.substring(0, filePath.lastIndexOf("/")) : "";

            allFiles.push({
              name: fileName,
              url: `${baseUrl}/storage/v1/object/public/${bucket}/${filePath}`,
              bucket,
              folder,
              size: f.file_size || 0,
              created_at: f.created_at || "",
              type: getFileType(fileName) });
          }
        }
      }

      // 2. Load from external storage
      try {
        const { data: config } = await supabase.functions.invoke("get-external-storage-config");
        if (config?.configured && config?.url && config?.key) {
          const { createClient } = await import("@supabase/supabase-js");
          const extClient = createClient(config.url, config.key);
          const courseIds = await getOrgCourseIds();

          for (const courseId of courseIds) {
            try {
              const { data: items } = await extClient.storage
                .from("course-videos")
                .list(courseId, { limit: 500 });
              if (items) {
                for (const f of items) {
                  if (f.id === null) continue;
                  allFiles.push({
                    name: f.name,
                    url: `${config.url}/storage/v1/object/public/course-videos/${courseId}/${f.name}`,
                    bucket: "course-videos",
                    folder: courseId,
                    size: (f.metadata as any)?.size || 0,
                    created_at: (f as any).created_at || "",
                    type: getFileType(f.name) });
                }
              }
            } catch { /* folder doesn't exist */ }
          }
        }
      } catch {
        // External storage not configured
      }

      // 3. Enrich files with course/lesson/owner info
      await enrichFilesWithMetadata(allFiles);
    } catch (err) {
      console.error("Error loading media library:", err);
    }

    setFiles(allFiles);
    setLoading(false);
  };

  const enrichFilesWithMetadata = async (allFiles: StorageFile[]) => {
    try {
      // Get courses and lessons in parallel
      const [coursesRes, lessonsRes, profileRes] = await Promise.all([
        supabase.from("courses").select("id, title").limit(500),
        supabase.from("lessons").select("id, title, content, course_id").limit(1000),
        supabase.auth.getUser().then(async ({ data: { user } }) => {
          if (!user) return null;
          const { data: profile } = await supabase
            .from("profiles")
            .select("full_name, user_id")
            .limit(200);
          return profile;
        }),
      ]);

      const coursesMap = new Map<string, string>();
      if (coursesRes.data) {
        for (const c of coursesRes.data) {
          coursesMap.set(c.id, c.title);
        }
      }

      const lessons = lessonsRes.data || [];
      const profiles = profileRes || [];

      for (const file of allFiles) {
        // Map folder (courseId) to course name
        if (file.folder && coursesMap.has(file.folder)) {
          file.courseName = coursesMap.get(file.folder);
        }

        // Check if file URL is used in any lesson content
        const matchingLesson = lessons.find(l =>
          l.content && file.url && l.content.includes(file.name)
        );
        if (matchingLesson) {
          file.isUsed = true;
          file.lessonTitle = matchingLesson.title;
          // Also set course name from lesson if not already set
          if (!file.courseName && matchingLesson.course_id && coursesMap.has(matchingLesson.course_id)) {
            file.courseName = coursesMap.get(matchingLesson.course_id);
          }
        } else {
          file.isUsed = false;
        }

        // Owner: for now use the first profile (current user context)
        if (profiles.length > 0) {
          file.ownerName = profiles[0].full_name || "Пользователь";
        }
      }
    } catch (err) {
      console.error("Error enriching files:", err);
    }
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
