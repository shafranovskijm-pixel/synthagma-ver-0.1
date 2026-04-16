import { useState, useEffect } from "react";
import { Video, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SigmaSpinner } from "@/components/ui/SigmaSpinner";

export function formatEta(seconds: number): string {
  if (seconds < 60) return `~${Math.ceil(seconds)} сек`;
  const m = Math.floor(seconds / 60);
  const s = Math.ceil(seconds % 60);
  return s > 0 ? `~${m} мин ${s} сек` : `~${m} мин`;
}

interface UploadProgressBlockProps {
  label: string;
  progress: number;
  uploadStartTime: number | null;
  uploadedBytes: number;
  uploadFileSize: number;
  onCancel: () => void;
}

export function UploadProgressBlock({ label, progress, uploadStartTime, uploadedBytes, uploadFileSize, onCancel }: UploadProgressBlockProps) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const elapsed = uploadStartTime ? (now - uploadStartTime) / 1000 : 0;
  const speed = elapsed > 1 ? uploadedBytes / elapsed : 0;
  const remaining = speed > 0 && uploadFileSize > uploadedBytes ? (uploadFileSize - uploadedBytes) / speed : 0;
  const speedMB = speed / (1024 * 1024);

  return (
    <div className="space-y-4">
      <Video className="w-10 h-10 mx-auto text-sigma-purple animate-pulse" />
      <div className="space-y-2">
        <div className="flex items-center justify-center gap-2">
          <SigmaSpinner size="sm" className="text-sigma-purple" />
          <span className="text-sm font-medium">{label}</span>
        </div>
        <div className="w-full max-w-xs mx-auto">
          <div className="h-2 bg-secondary rounded-full overflow-hidden">
            <div className="h-full bg-sigma-purple transition-all duration-300 ease-out" style={{ width: `${progress}%` }} />
          </div>
          <p className="text-sm text-muted-foreground mt-1">{progress}%</p>
          {speed > 0 && (
            <p className="text-xs text-muted-foreground mt-0.5">
              {speedMB.toFixed(1)} МБ/с{remaining > 0 && progress < 100 ? ` · ${formatEta(remaining)}` : ''}
            </p>
          )}
        </div>
        <Button variant="outline" size="sm" className="mt-2 gap-1 text-destructive hover:text-destructive border-destructive/50 hover:bg-destructive/10" onClick={onCancel}>
          <Trash2 className="w-3 h-3" />Отменить
        </Button>
      </div>
    </div>
  );
}
