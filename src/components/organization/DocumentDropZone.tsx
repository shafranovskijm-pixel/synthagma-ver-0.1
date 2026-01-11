import { useState, useCallback } from "react";
import { Upload, Loader2, FileText, Receipt, FileCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface DocumentDropZoneProps {
  type: 'contract' | 'invoice' | 'act';
  isUploading: boolean;
  onUpload: (file: File) => void;
  accept?: string;
}

const typeConfig = {
  contract: {
    icon: FileText,
    color: "text-orange-500",
    bgColor: "bg-orange-500/10",
    borderColor: "border-orange-500",
    label: "Договоры",
  },
  invoice: {
    icon: Receipt,
    color: "text-blue-500",
    bgColor: "bg-blue-500/10",
    borderColor: "border-blue-500",
    label: "Счета",
  },
  act: {
    icon: FileCheck,
    color: "text-sigma-green",
    bgColor: "bg-sigma-green/10",
    borderColor: "border-sigma-green",
    label: "Акты",
  },
};

export function DocumentDropZone({ type, isUploading, onUpload, accept = ".pdf,.doc,.docx" }: DocumentDropZoneProps) {
  const [isDragging, setIsDragging] = useState(false);
  const config = typeConfig[type];
  const Icon = config.icon;

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const files = e.dataTransfer.files;
    if (files.length > 0) {
      const file = files[0];
      const extension = file.name.split('.').pop()?.toLowerCase();
      const acceptedExtensions = accept.split(',').map(ext => ext.replace('.', '').toLowerCase());
      
      if (acceptedExtensions.includes(extension || '')) {
        onUpload(file);
      }
    }
  }, [accept, onUpload]);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onUpload(file);
    }
    e.target.value = '';
  }, [onUpload]);

  return (
    <div
      className={cn(
        "relative border-2 border-dashed rounded-xl p-4 transition-all duration-200",
        isDragging ? `${config.borderColor} ${config.bgColor}` : "border-border hover:border-muted-foreground/50",
        isUploading && "opacity-50 pointer-events-none"
      )}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      <label className="cursor-pointer flex flex-col items-center justify-center gap-2 py-4">
        <input
          type="file"
          className="hidden"
          accept={accept}
          onChange={handleFileSelect}
          disabled={isUploading}
        />
        <div className={cn(
          "w-12 h-12 rounded-xl flex items-center justify-center transition-colors",
          isDragging ? config.bgColor : "bg-muted"
        )}>
          {isUploading ? (
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          ) : (
            <Upload className={cn("w-6 h-6", isDragging ? config.color : "text-muted-foreground")} />
          )}
        </div>
        <div className="text-center">
          <p className={cn(
            "text-sm font-medium",
            isDragging ? config.color : "text-foreground"
          )}>
            {isUploading ? "Загрузка..." : isDragging ? "Отпустите файл" : "Перетащите файл сюда"}
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            или нажмите для выбора
          </p>
        </div>
      </label>
    </div>
  );
}
