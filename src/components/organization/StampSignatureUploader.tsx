import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Upload, X, Image as ImageIcon, Stamp, PenTool } from "lucide-react";
import { SigmaSpinner } from "@/components/ui/SigmaSpinner";

interface StampSignatureUploaderProps {
  type: "stamp" | "signature";
  currentUrl: string | null;
  onUpload: (url: string) => void;
  onRemove: () => void;
  organizationId: string;
  companyId?: string; // Optional - if provided, uploads to company folder
}

export function StampSignatureUploader({
  type,
  currentUrl,
  onUpload,
  onRemove,
  organizationId,
  companyId }: StampSignatureUploaderProps) {
  const [isUploading, setIsUploading] = useState(false);
  const [isRemoving, setIsRemoving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const typeLabel = type === "stamp" ? "Печать" : "Подпись";
  const TypeIcon = type === "stamp" ? Stamp : PenTool;

  const handleUpload = async (file: File) => {
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith("image/")) {
      toast.error("Пожалуйста, загрузите изображение");
      return;
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Файл слишком большой. Максимум 5 МБ");
      return;
    }

    setIsUploading(true);
    try {
      const fileExt = file.name.split(".").pop();
      const fileName = `${type}_${Date.now()}.${fileExt}`;
      const folderPath = companyId
        ? `companies/${companyId}`
        : `organizations/${organizationId}`;
      const filePath = `${folderPath}/${fileName}`;

      // Upload to storage
      const { error: uploadError } = await supabase.storage
        .from("org-documents")
        .upload(filePath, file, { upsert: true });

      if (uploadError) throw uploadError;

      // Get public URL
      const { data: urlData } = supabase.storage
        .from("org-documents")
        .getPublicUrl(filePath);

      onUpload(urlData.publicUrl);
      toast.success(`${typeLabel} загружена`);
    } catch (error) {
      console.error("Upload error:", error);
      toast.error(`Ошибка загрузки: ${error instanceof Error ? error.message : "Неизвестная ошибка"}`);
    } finally {
      setIsUploading(false);
    }
  };

  const handleRemove = async () => {
    setIsRemoving(true);
    try {
      // Extract file path from URL if needed
      if (currentUrl) {
        const urlParts = currentUrl.split("/org-documents/");
        if (urlParts.length > 1) {
          const filePath = decodeURIComponent(urlParts[1]);
          await supabase.storage.from("org-documents").remove([filePath]);
        }
      }
      onRemove();
      toast.success(`${typeLabel} удалена`);
    } catch (error) {
      console.error("Remove error:", error);
      toast.error("Ошибка удаления");
    } finally {
      setIsRemoving(false);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleUpload(file);
    }
    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <TypeIcon className="w-4 h-4 text-muted-foreground" />
        <span className="text-sm font-medium">{typeLabel}</span>
      </div>

      {currentUrl ? (
        <div className="relative group">
          <div className="border border-border rounded-xl p-4 bg-secondary/30">
            <img
              src={currentUrl}
              alt={typeLabel}
              className="max-h-24 max-w-full object-contain mx-auto"
            />
          </div>
          <Button
            variant="destructive"
            size="icon"
            className="absolute -top-2 -right-2 h-6 w-6 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
            onClick={handleRemove}
            disabled={isRemoving}
          >
            {isRemoving ? (
              <SigmaSpinner size="xs" />
            ) : (
              <X className="w-3 h-3" />
            )}
          </Button>
        </div>
      ) : (
        <div
          className="border-2 border-dashed border-border rounded-xl p-6 text-center cursor-pointer hover:border-primary/50 hover:bg-secondary/30 transition-colors"
          onClick={() => fileInputRef.current?.click()}
        >
          {isUploading ? (
            <div className="flex flex-col items-center gap-2">
              <SigmaSpinner size="lg" />
              <span className="text-sm text-muted-foreground">Загрузка...</span>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2">
              <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
                <ImageIcon className="w-6 h-6 text-primary" />
              </div>
              <div>
                <p className="text-sm font-medium">Загрузить {typeLabel.toLowerCase()}</p>
                <p className="text-xs text-muted-foreground">PNG, JPG до 5 МБ</p>
              </div>
            </div>
          )}
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFileSelect}
      />
    </div>
  );
}
