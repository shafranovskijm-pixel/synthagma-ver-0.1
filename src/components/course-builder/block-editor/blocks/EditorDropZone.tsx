import { useState, useCallback, type ReactNode } from "react";
import { Upload } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { createBlock, type ContentBlock } from "../types";

interface EditorDropZoneProps {
  children: ReactNode;
  onAddBlock: (block: ContentBlock) => void;
  courseId?: string;
  organizationId?: string;
  disabled?: boolean;
}

const MAX_SIZE_MB = 50;

function detectBlockType(file: File): ContentBlock["type"] | null {
  const t = file.type;
  if (t.startsWith("image/")) return "image";
  if (t.startsWith("video/")) return "video";
  if (t.startsWith("audio/")) return "audio";
  if (
    t === "application/pdf" ||
    t.includes("officedocument") ||
    t.includes("msword") ||
    /\.(pdf|docx?|xlsx?|pptx?|txt)$/i.test(file.name)
  ) return "document";
  return null;
}

async function uploadToStorage(file: File, courseId?: string): Promise<string | null> {
  const path = `${courseId || "drops"}/${Date.now()}-${file.name.replace(/\s+/g, "_")}`;
  const { error } = await supabase.storage.from("course-files").upload(path, file, { upsert: false, contentType: file.type });
  if (error) {
    toast.error(`Не удалось загрузить файл: ${error.message}`);
    return null;
  }
  const { data } = supabase.storage.from("course-files").getPublicUrl(path);
  return data.publicUrl;
}

export function EditorDropZone({ children, onAddBlock, courseId, disabled }: EditorDropZoneProps) {
  const [dragActive, setDragActive] = useState(false);
  const [uploading, setUploading] = useState(false);

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    if (disabled) return;
    if (e.dataTransfer?.types?.includes("Files")) {
      e.preventDefault();
      setDragActive(true);
    }
  }, [disabled]);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    if (e.currentTarget === e.target) setDragActive(false);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    if (disabled) return;
    if (e.dataTransfer?.types?.includes("Files")) {
      e.preventDefault();
      e.dataTransfer.dropEffect = "copy";
    }
  }, [disabled]);

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
    if (disabled) return;

    const files = Array.from(e.dataTransfer?.files || []);
    if (files.length === 0) return;

    setUploading(true);
    try {
      for (const file of files) {
        if (file.size > MAX_SIZE_MB * 1024 * 1024) {
          toast.error(`${file.name} больше ${MAX_SIZE_MB} МБ — пропущен`);
          continue;
        }
        const blockType = detectBlockType(file);
        if (!blockType) {
          toast.error(`Неподдерживаемый формат: ${file.name}`);
          continue;
        }
        toast.info(`Загрузка ${file.name}...`);
        const url = await uploadToStorage(file, courseId);
        if (!url) continue;

        const block = createBlock(blockType);
        if (blockType === "image") { block.imageSrc = url; block.imageAlt = file.name.replace(/\.[^.]+$/, ""); }
        else if (blockType === "video") block.videoUrl = url;
        else if (blockType === "audio") block.audioUrl = url;
        else if (blockType === "document") { block.documentUrl = url; block.documentName = file.name; }

        onAddBlock(block);
        toast.success(`Файл "${file.name}" добавлен`);
      }
    } finally {
      setUploading(false);
    }
  }, [disabled, courseId, onAddBlock]);

  return (
    <div
      className="relative"
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {children}
      {(dragActive || uploading) && (
        <div className={cn(
          "absolute inset-0 z-50 rounded-xl border-2 border-dashed flex items-center justify-center pointer-events-none transition-all",
          uploading
            ? "bg-background/80 border-primary backdrop-blur-sm"
            : "bg-primary/10 border-primary"
        )}>
          <div className="flex flex-col items-center gap-2 text-primary">
            <Upload className="w-8 h-8 animate-bounce" />
            <p className="text-sm font-medium">
              {uploading ? "Загрузка файлов..." : "Отпустите, чтобы добавить файл в урок"}
            </p>
            <p className="text-xs text-muted-foreground">
              Картинки · Видео · Аудио · Документы (до {MAX_SIZE_MB} МБ)
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
