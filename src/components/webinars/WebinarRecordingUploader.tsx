import { useState, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Upload, Video, X } from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  webinarId: string;
  webinarTitle: string;
  currentRecordingUrl?: string | null;
  onUploaded?: () => void;
}

/**
 * Диалог ручной загрузки записи вебинара (MP4/WEBM).
 * Файл уходит в `course-files/webinar-recordings/<webinarId>.<ext>`,
 * затем `recording_url` и `recording_size_bytes` обновляются в `webinars`.
 */
export function WebinarRecordingUploader({
  open,
  onOpenChange,
  webinarId,
  webinarTitle,
  currentRecordingUrl,
  onUploaded,
}: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const handleFile = (f: File | null) => {
    if (!f) return;
    if (!f.type.startsWith("video/")) {
      toast.error("Выберите видеофайл (MP4, WEBM, MOV)");
      return;
    }
    const maxBytes = 2 * 1024 * 1024 * 1024; // 2 GB
    if (f.size > maxBytes) {
      toast.error("Файл слишком большой (максимум 2 ГБ)");
      return;
    }
    setFile(f);
  };

  const handleUpload = async () => {
    if (!file) return;
    setUploading(true);
    setProgress(0);
    try {
      const ext = (file.name.split(".").pop() || "mp4").toLowerCase();
      const path = `webinar-recordings/${webinarId}.${ext}`;

      const { error: upErr } = await supabase.storage
        .from("course-files")
        .upload(path, file, { upsert: true, contentType: file.type });

      if (upErr) throw upErr;
      setProgress(80);

      const { data: pub } = supabase.storage.from("course-files").getPublicUrl(path);
      const publicUrl = pub.publicUrl;

      const { error: updErr } = await supabase
        .from("webinars")
        .update({
          recording_url: publicUrl,
          recording_size_bytes: file.size,
        } as never)
        .eq("id", webinarId);

      if (updErr) throw updErr;
      setProgress(100);

      toast.success("Запись успешно прикреплена");
      onUploaded?.();
      onOpenChange(false);
      setFile(null);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Ошибка загрузки";
      toast.error(msg);
    } finally {
      setUploading(false);
      setProgress(0);
    }
  };

  const handleRemove = async () => {
    if (!confirm("Удалить прикреплённую запись?")) return;
    try {
      const { error } = await supabase
        .from("webinars")
        .update({ recording_url: null, recording_size_bytes: null } as never)
        .eq("id", webinarId);
      if (error) throw error;
      toast.success("Запись откреплена");
      onUploaded?.();
      onOpenChange(false);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Ошибка";
      toast.error(msg);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Video className="w-4 h-4" />
            Запись вебинара
          </DialogTitle>
          <DialogDescription className="truncate">{webinarTitle}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {currentRecordingUrl && !file && (
            <div className="rounded-md border border-border bg-muted/40 p-3 space-y-2">
              <p className="text-xs text-muted-foreground">Текущая запись:</p>
              <video controls src={currentRecordingUrl} className="w-full rounded" />
              <Button variant="ghost" size="sm" onClick={handleRemove} className="text-destructive">
                <X className="w-3.5 h-3.5 mr-1" /> Удалить запись
              </Button>
            </div>
          )}

          <div
            className="border-2 border-dashed border-border rounded-lg p-6 text-center cursor-pointer hover:bg-muted/30 transition"
            onClick={() => inputRef.current?.click()}
            onDrop={(e) => {
              e.preventDefault();
              handleFile(e.dataTransfer.files?.[0] ?? null);
            }}
            onDragOver={(e) => e.preventDefault()}
          >
            <Upload className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
            {file ? (
              <div className="space-y-1">
                <p className="font-medium text-sm truncate">{file.name}</p>
                <p className="text-xs text-muted-foreground">
                  {(file.size / 1024 / 1024).toFixed(1)} МБ
                </p>
              </div>
            ) : (
              <>
                <p className="text-sm font-medium">Перетащите MP4 сюда или нажмите</p>
                <p className="text-xs text-muted-foreground mt-1">
                  MP4 / WEBM / MOV, до 2 ГБ
                </p>
              </>
            )}
            <input
              ref={inputRef}
              type="file"
              accept="video/*"
              className="hidden"
              onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
            />
          </div>

          {uploading && (
            <div className="space-y-1">
              <Progress value={progress} />
              <p className="text-xs text-muted-foreground text-center">
                Загрузка… {progress}%
              </p>
            </div>
          )}

          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={uploading}>
              Отмена
            </Button>
            <Button onClick={handleUpload} disabled={!file || uploading}>
              {uploading ? "Загружаем…" : "Прикрепить запись"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
