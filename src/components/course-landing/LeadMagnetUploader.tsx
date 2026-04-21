import { useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Upload, Trash2, FileText } from "lucide-react";
import { toast } from "sonner";
import { SigmaSpinner } from "@/components/ui/SigmaSpinner";

interface Props {
  organizationId: string;
  currentUrl?: string;
  currentLabel?: string;
  onChange: (url: string | undefined, label: string | undefined) => void;
}

/**
 * Загрузчик «лид-магнита» (PDF/файл) для лендинга курса.
 * Файл хранится в публичном бакете `course-files` под папкой `lead-magnets/<orgId>/`.
 * Принимает PDF, DOCX, ZIP до 10 МБ.
 */
export function LeadMagnetUploader({ organizationId, currentUrl, currentLabel, onChange }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const handleUpload = async (file: File) => {
    if (file.size > 10 * 1024 * 1024) {
      toast.error("Файл больше 10 МБ. Используйте сжатие или внешнюю ссылку.");
      return;
    }
    setUploading(true);
    try {
      const ext = file.name.split(".").pop()?.toLowerCase() || "pdf";
      const safeName = file.name.replace(/[^\w.\-]+/g, "_");
      const path = `lead-magnets/${organizationId}/${Date.now()}-${safeName}`;
      const { error } = await supabase.storage.from("course-files").upload(path, file, {
        cacheControl: "3600",
        upsert: false,
        contentType: file.type || `application/${ext}`,
      });
      if (error) throw error;
      const { data } = supabase.storage.from("course-files").getPublicUrl(path);
      onChange(data.publicUrl, file.name);
      toast.success("Файл загружен");
    } catch (e: any) {
      toast.error("Ошибка загрузки: " + (e?.message ?? "unknown"));
    } finally {
      setUploading(false);
    }
  };

  const handleRemove = () => onChange(undefined, undefined);

  if (currentUrl) {
    return (
      <div className="flex items-center gap-2 p-2 border rounded-md bg-background">
        <FileText className="w-4 h-4 text-primary shrink-0" />
        <a href={currentUrl} target="_blank" rel="noopener noreferrer" className="text-xs underline truncate flex-1">
          {currentLabel || "Файл"}
        </a>
        <Button size="icon" variant="ghost" onClick={handleRemove} title="Удалить">
          <Trash2 className="w-3.5 h-3.5 text-destructive" />
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <input
        ref={inputRef}
        type="file"
        accept=".pdf,.doc,.docx,.zip,application/pdf"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleUpload(f);
          e.target.value = "";
        }}
      />
      <Button
        variant="outline"
        size="sm"
        className="w-full"
        onClick={() => inputRef.current?.click()}
        disabled={uploading}
      >
        {uploading ? <SigmaSpinner /> : <><Upload className="w-3.5 h-3.5 mr-2" /> Загрузить файл</>}
      </Button>
      <div className="text-[11px] text-muted-foreground text-center">или укажите ссылку:</div>
      <Input
        placeholder="https://..."
        onBlur={(e) => {
          const url = e.target.value.trim();
          if (url) onChange(url, url.split("/").pop() || "Файл");
        }}
      />
    </div>
  );
}
