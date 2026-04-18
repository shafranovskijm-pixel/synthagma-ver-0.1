import { useState } from "react";
import { useBackgroundUploads, UploadTask } from "@/contexts/BackgroundUploadsContext";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  X,
  ChevronDown,
  ChevronUp,
  Volume2,
  VolumeX,
  Upload,
  CheckCircle2,
  AlertCircle,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  isUploadSoundMuted,
  setUploadSoundMuted as persistMute,
} from "@/utils/uploadSound";

const formatMB = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(0)} МБ`;

function StatusIcon({ task }: { task: UploadTask }) {
  if (task.status === "done")
    return <CheckCircle2 className="w-4 h-4 text-sigma-green" />;
  if (task.status === "error" || task.status === "cancelled")
    return <AlertCircle className="w-4 h-4 text-destructive" />;
  return <Loader2 className="w-4 h-4 text-primary animate-spin" />;
}

function statusLabel(task: UploadTask) {
  switch (task.status) {
    case "compressing":
      return "Сжатие...";
    case "finalizing":
      return "Завершение...";
    case "done":
      return "Готово";
    case "error":
      return task.error || "Ошибка";
    case "cancelled":
      return "Отменено";
    default:
      return `${task.progress}%`;
  }
}

export function BackgroundUploadsTray() {
  const { uploads, cancelUpload, removeUpload } = useBackgroundUploads();
  const [collapsed, setCollapsed] = useState(false);
  const [muted, setMuted] = useState(isUploadSoundMuted());

  if (uploads.length === 0) return null;

  const toggleMute = () => {
    const next = !muted;
    setMuted(next);
    persistMute(next);
  };

  return (
    <div className="fixed bottom-4 left-4 z-50 w-80 max-w-[calc(100vw-2rem)] rounded-xl border border-border bg-card shadow-2xl overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 border-b border-border bg-muted/40">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Upload className="w-4 h-4 text-primary" />
          <span>Загрузки ({uploads.length})</span>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={toggleMute}
            title={muted ? "Включить звук" : "Выключить звук"}
          >
            {muted ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => setCollapsed((c) => !c)}
            title={collapsed ? "Развернуть" : "Свернуть"}
          >
            {collapsed ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </Button>
        </div>
      </div>
      {!collapsed && (
        <div className="max-h-80 overflow-y-auto divide-y divide-border">
          {uploads.map((task) => (
            <div key={task.id} className="px-3 py-2.5 space-y-1.5">
              <div className="flex items-start gap-2">
                <StatusIcon task={task} />
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-medium truncate" title={task.lessonTitle}>
                    {task.lessonTitle}
                  </div>
                  <div className="text-[11px] text-muted-foreground truncate" title={task.courseTitle}>
                    {task.courseTitle}
                  </div>
                </div>
                {(task.status === "uploading" ||
                  task.status === "compressing" ||
                  task.status === "finalizing") ? (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 shrink-0"
                    onClick={() => cancelUpload(task.id)}
                    title="Отменить"
                  >
                    <X className="w-3.5 h-3.5" />
                  </Button>
                ) : (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 shrink-0"
                    onClick={() => removeUpload(task.id)}
                    title="Скрыть"
                  >
                    <X className="w-3.5 h-3.5" />
                  </Button>
                )}
              </div>
              {(task.status === "uploading" ||
                task.status === "compressing" ||
                task.status === "finalizing") && (
                <Progress value={task.progress} className="h-1" />
              )}
              <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                <span className={cn(task.status === "error" && "text-destructive")}>
                  {statusLabel(task)}
                </span>
                <span>
                  {task.fileName.length > 18
                    ? task.fileName.slice(0, 16) + "…"
                    : task.fileName}
                  {" · "}
                  {formatMB(task.fileSize)}
                  {task.kind === "kinescope" && " · Kinescope"}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
