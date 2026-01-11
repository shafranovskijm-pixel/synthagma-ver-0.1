import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Upload, Image, FileText, Video, X, Loader2, CheckCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

interface FileUploadDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onUpload: (url: string, type: "image" | "video" | "file") => void;
  courseId: string;
}

interface UploadedFile {
  name: string;
  url: string;
  type: "image" | "video" | "file";
  status: "uploading" | "success" | "error";
}

const ACCEPTED_TYPES = {
  image: ["image/jpeg", "image/png", "image/gif", "image/webp"],
  video: ["video/mp4", "video/webm", "video/ogg"],
  file: ["application/pdf", "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
};

export const FileUploadDialog = ({
  isOpen,
  onClose,
  onUpload,
  courseId,
}: FileUploadDialogProps) => {
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const getFileType = (mimeType: string): "image" | "video" | "file" => {
    if (ACCEPTED_TYPES.image.includes(mimeType)) return "image";
    if (ACCEPTED_TYPES.video.includes(mimeType)) return "video";
    return "file";
  };

  const uploadFile = async (file: File) => {
    const fileType = getFileType(file.type);
    const fileName = `${courseId}/${Date.now()}-${file.name}`;

    // Add to list with uploading status
    const uploadingFile: UploadedFile = {
      name: file.name,
      url: "",
      type: fileType,
      status: "uploading",
    };
    setFiles((prev) => [...prev, uploadingFile]);

    try {
      const { data, error } = await supabase.storage
        .from("course-files")
        .upload(fileName, file, {
          cacheControl: "3600",
          upsert: false,
        });

      if (error) throw error;

      const { data: { publicUrl } } = supabase.storage
        .from("course-files")
        .getPublicUrl(fileName);

      // Update status to success
      setFiles((prev) =>
        prev.map((f) =>
          f.name === file.name
            ? { ...f, url: publicUrl, status: "success" as const }
            : f
        )
      );
    } catch (error: any) {
      // Update status to error
      setFiles((prev) =>
        prev.map((f) =>
          f.name === file.name ? { ...f, status: "error" as const } : f
        )
      );
      toast({
        title: "Ошибка загрузки",
        description: error.message || "Не удалось загрузить файл",
        variant: "destructive",
      });
    }
  };

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = event.target.files;
    if (!selectedFiles) return;

    Array.from(selectedFiles).forEach(uploadFile);
  };

  const handleDrop = (event: React.DragEvent) => {
    event.preventDefault();
    setIsDragging(false);

    const droppedFiles = event.dataTransfer.files;
    Array.from(droppedFiles).forEach(uploadFile);
  };

  const handleDragOver = (event: React.DragEvent) => {
    event.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleInsert = (file: UploadedFile) => {
    onUpload(file.url, file.type);
  };

  const handleRemoveFile = (fileName: string) => {
    setFiles((prev) => prev.filter((f) => f.name !== fileName));
  };

  const getFileIcon = (type: "image" | "video" | "file") => {
    switch (type) {
      case "image":
        return <Image className="w-5 h-5" />;
      case "video":
        return <Video className="w-5 h-5" />;
      default:
        return <FileText className="w-5 h-5" />;
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-display">
            <Upload className="w-5 h-5" />
            Загрузка файлов
          </DialogTitle>
          <DialogDescription>
            Загрузите изображения, видео или документы для урока
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Drop zone */}
          <div
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onClick={() => fileInputRef.current?.click()}
            className={cn(
              "border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors",
              isDragging
                ? "border-primary bg-primary/5"
                : "border-border hover:border-primary/50 hover:bg-muted/50"
            )}
          >
            <Upload className="w-10 h-10 mx-auto mb-4 text-muted-foreground" />
            <p className="font-medium">
              Перетащите файлы или нажмите для выбора
            </p>
            <p className="text-sm text-muted-foreground mt-1">
              PNG, JPG, GIF, MP4, PDF до 50MB
            </p>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept={[
                ...ACCEPTED_TYPES.image,
                ...ACCEPTED_TYPES.video,
                ...ACCEPTED_TYPES.file,
              ].join(",")}
              onChange={handleFileSelect}
              className="hidden"
            />
          </div>

          {/* Uploaded files list */}
          {files.length > 0 && (
            <div className="space-y-2">
              <Label>Загруженные файлы</Label>
              <div className="max-h-[200px] overflow-y-auto space-y-2">
                {files.map((file, index) => (
                  <div
                    key={index}
                    className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg"
                  >
                    <div className="text-muted-foreground">
                      {getFileIcon(file.type)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{file.name}</p>
                      <p className="text-xs text-muted-foreground capitalize">
                        {file.type === "image"
                          ? "Изображение"
                          : file.type === "video"
                          ? "Видео"
                          : "Документ"}
                      </p>
                    </div>
                    {file.status === "uploading" && (
                      <Loader2 className="w-4 h-4 animate-spin text-primary" />
                    )}
                    {file.status === "success" && (
                      <>
                        <CheckCircle className="w-4 h-4 text-green-500" />
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => handleInsert(file)}
                        >
                          Вставить
                        </Button>
                      </>
                    )}
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8"
                      onClick={() => handleRemoveFile(file.name)}
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex gap-3 pt-4">
            <Button variant="outline" onClick={onClose} className="flex-1">
              Закрыть
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
