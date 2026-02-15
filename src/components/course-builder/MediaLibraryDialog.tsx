import { useState, useEffect } from "react";
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
import { Loader2, Video, FileText, Image as ImageIcon, Search, FolderOpen } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

interface MediaLibraryDialogProps {
  open: boolean;
  onClose: () => void;
  onSelect: (url: string) => void;
  filter?: "video" | "image" | "audio" | "all";
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

function getFileIcon(type: StorageFile["type"]) {
  switch (type) {
    case "video": return <Video className="w-5 h-5 text-red-500" />;
    case "image": return <ImageIcon className="w-5 h-5 text-green-500" />;
    case "audio": return <Video className="w-5 h-5 text-teal-500" />;
    default: return <FileText className="w-5 h-5 text-muted-foreground" />;
  }
}

export function MediaLibraryDialog({ open, onClose, onSelect, filter = "all" }: MediaLibraryDialogProps) {
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

  const loadFiles = async () => {
    setLoading(true);
    const allFiles: StorageFile[] = [];

    try {
      // Load from course-files bucket
      const internalFiles = await loadBucketFiles("course-files", import.meta.env.VITE_SUPABASE_URL);
      allFiles.push(...internalFiles);

      // Try loading from external storage (course-videos bucket)
      try {
        const { data: config } = await supabase.functions.invoke("get-external-storage-config");
        if (config?.configured && config?.url && config?.key) {
          const { createClient } = await import("@supabase/supabase-js");
          const extClient = createClient(config.url, config.key);
          const externalFiles = await loadBucketFilesWithClient(extClient, "course-videos", config.url);
          allFiles.push(...externalFiles);
        }
      } catch {
        // External storage not configured, skip
      }
    } catch (err) {
      console.error("Error loading media library:", err);
    }

    setFiles(allFiles);
    setLoading(false);
  };

  const loadBucketFiles = async (bucket: string, baseUrl: string): Promise<StorageFile[]> => {
    const result: StorageFile[] = [];
    try {
      const { data: folders } = await supabase.storage.from(bucket).list("", { limit: 100 });
      if (!folders) return result;

      for (const folder of folders) {
        if (folder.id === null) {
          // It's a folder, list its contents
          const { data: innerFiles } = await supabase.storage.from(bucket).list(folder.name, { limit: 200 });
          if (innerFiles) {
            for (const f of innerFiles) {
              if (f.id === null) continue; // skip sub-folders
              const fileType = getFileType(f.name);
              result.push({
                name: f.name,
                url: `${baseUrl}/storage/v1/object/public/${bucket}/${folder.name}/${f.name}`,
                bucket,
                folder: folder.name,
                size: (f.metadata as any)?.size || 0,
                created_at: (f as any).created_at || "",
                type: fileType,
              });
            }
          }
        } else {
          // It's a file at root level
          const fileType = getFileType(folder.name);
          result.push({
            name: folder.name,
            url: `${baseUrl}/storage/v1/object/public/${bucket}/${folder.name}`,
            bucket,
            folder: "",
            size: (folder.metadata as any)?.size || 0,
            created_at: (folder as any).created_at || "",
            type: fileType,
          });
        }
      }
    } catch (err) {
      console.error(`Error listing ${bucket}:`, err);
    }
    return result;
  };

  const loadBucketFilesWithClient = async (client: any, bucket: string, baseUrl: string): Promise<StorageFile[]> => {
    const result: StorageFile[] = [];
    try {
      const { data: folders } = await client.storage.from(bucket).list("", { limit: 100 });
      if (!folders) return result;

      for (const folder of folders) {
        if (folder.id === null) {
          const { data: innerFiles } = await client.storage.from(bucket).list(folder.name, { limit: 200 });
          if (innerFiles) {
            for (const f of innerFiles) {
              if (f.id === null) continue;
              const fileType = getFileType(f.name);
              result.push({
                name: f.name,
                url: `${baseUrl}/storage/v1/object/public/${bucket}/${folder.name}/${f.name}`,
                bucket,
                folder: folder.name,
                size: (f.metadata as any)?.size || 0,
                created_at: (f as any).created_at || "",
                type: fileType,
              });
            }
          }
        } else {
          const fileType = getFileType(folder.name);
          result.push({
            name: folder.name,
            url: `${baseUrl}/storage/v1/object/public/${bucket}/${folder.name}`,
            bucket,
            folder: "",
            size: (folder.metadata as any)?.size || 0,
            created_at: (folder as any).created_at || "",
            type: fileType,
          });
        }
      }
    } catch (err) {
      console.error(`Error listing external ${bucket}:`, err);
    }
    return result;
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
                  <div className="shrink-0">{getFileIcon(file.type)}</div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{file.name}</p>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      {file.folder && <span className="truncate max-w-[120px]">{file.folder}</span>}
                      {file.size > 0 && <span>{formatSize(file.size)}</span>}
                      <Badge variant="outline" className="text-[10px] px-1 py-0">{file.bucket}</Badge>
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
