import { Badge } from "@/components/ui/badge";
import { Circle, Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  status?: string | null;
  sizeBytes?: number | null;
  compact?: boolean;
  className?: string;
}

const fmtSize = (bytes: number) => {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} КБ`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(0)} МБ`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} ГБ`;
};

/**
 * Унифицированный бейдж статуса записи вебинара.
 * Используется в карточке организации, таблице админа и шапке плеера.
 */
export const RecordingStatusBadge = ({ status, sizeBytes, compact, className }: Props) => {
  if (!status || status === "none") return null;

  if (status === "starting" || status === "active") {
    return (
      <Badge
        variant="destructive"
        className={cn("gap-1 animate-pulse", compact && "h-5 text-[10px] px-1.5", className)}
      >
        <Circle className="w-2.5 h-2.5 fill-current" />
        REC
      </Badge>
    );
  }

  if (status === "stopped" || status === "processing") {
    return (
      <Badge
        variant="outline"
        className={cn(
          "gap-1 border-amber-500/40 text-amber-700 dark:text-amber-400 bg-amber-500/5",
          compact && "h-5 text-[10px] px-1.5",
          className,
        )}
      >
        <Loader2 className="w-2.5 h-2.5 animate-spin" />
        Готовится
      </Badge>
    );
  }

  if (status === "uploaded") {
    return (
      <Badge
        variant="outline"
        className={cn(
          "gap-1 border-emerald-500/40 text-emerald-700 dark:text-emerald-400 bg-emerald-500/5",
          compact && "h-5 text-[10px] px-1.5",
          className,
        )}
      >
        <CheckCircle2 className="w-2.5 h-2.5" />
        MP4{sizeBytes ? ` · ${fmtSize(sizeBytes)}` : ""}
      </Badge>
    );
  }

  if (status === "failed") {
    return (
      <Badge variant="destructive" className={cn("gap-1", compact && "h-5 text-[10px] px-1.5", className)}>
        <AlertCircle className="w-2.5 h-2.5" />
        Ошибка
      </Badge>
    );
  }

  return null;
};
