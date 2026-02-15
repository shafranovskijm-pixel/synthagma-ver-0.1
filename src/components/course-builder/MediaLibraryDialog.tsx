import { useState, useEffect, useRef } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Video, FileText, Image as ImageIcon, Search, FolderOpen, Music } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

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

function VideoThumbnail({ url }: { url: string }) {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return <Video className="w-5 h-5 text-destructive" />;
  }

  return (
    <video
      src={url}
      muted
      preload="metadata"
      className="w-full h-full object-cover rounded"
      onError={() => setFailed(true)}
    />
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

    // 1. Try explicit organizationId prop
    if (organizationId) {
      const { data } = await supabase.from("courses").select("id").eq("organization_id", organizationId);
      if (data && data.length > 0) return data.map(c => c.id);
    }

    // 2. Fallback: organization_id from profile
    const { data: profile } = await supabase
      .from("profiles")
      .select("organization_id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (profile?.organization_id) {
      const { data } = await supabase.from("courses").select("id").eq("organization_id", profile.organization_id);
      if (data && data.length > 0) return data.map(c => c.id);
    }

    // 3. Fallback for admin: get all courses
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
      // 1. Load user's own files from internal storage via RPC (both buckets)
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
              type: getFileType(fileName),
            });
          }
        }
      }

      // 2. Load from external storage (course-videos) - list by org course folders
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
                    type: getFileType(f.name),
                  });
                }
              }
            } catch { /* folder doesn't exist */ }
          }
        }
      } catch {
        // External storage not configured
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
      <DialogContent className="sm:max-w-lg max-h-[80vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FolderOpen className="w-5 h-5" />
            Медиатека
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
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            <span className="ml-2 text-sm text-muted-foreground">Загрузка файлов...</span>
          </div>
        ) : filteredFiles.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <FolderOpen className="w-10 h-10 mx-auto mb-2 opacity-50" />
            <p className="text-sm">
              {files.length === 0 ? "В хранилище пока нет файлов" : "Нет файлов, соответствующих фильтру"}
            </p>
          </div>
        ) : (
          <ScrollArea className="h-[350px]">
            <div className="space-y-1 pr-2">
              {filteredFiles.map((file, i) => (
                <button
                  key={`${file.bucket}-${file.folder}-${file.name}-${i}`}
                  onClick={() => setSelectedFile(file)}
                  className={cn(
                    "w-full flex items-center gap-3 p-2.5 rounded-lg text-left transition-colors",
                    selectedFile?.url === file.url
                      ? "bg-primary/10 border border-primary/30"
                      : "hover:bg-muted/70"
                  )}
                >
                  <div className="shrink-0 w-10 h-10 rounded bg-muted flex items-center justify-center overflow-hidden">
                    {file.type === "image" ? (
                      <img src={file.url} alt={file.name} className="w-full h-full object-cover" loading="lazy" />
                    ) : file.type === "video" ? (
                      <VideoThumbnail url={file.url} />
                    ) : (
                      getFileIcon(file.type)
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{file.name}</p>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
                      {file.folder && <span className="truncate max-w-[120px]">{file.folder}</span>}
                      {file.size > 0 && <span>{formatSize(file.size)}</span>}
                      <Badge variant="outline" className="text-[10px] px-1 py-0">{file.bucket}</Badge>
                      {file.created_at && <span className="text-muted-foreground/70">{formatDate(file.created_at)}</span>}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </ScrollArea>
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
