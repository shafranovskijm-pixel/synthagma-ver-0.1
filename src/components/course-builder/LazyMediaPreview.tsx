import { useState } from "react";
import { Video, Headphones, BookOpen, Presentation, Image, Play, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";

type MediaType = "video" | "audio" | "document" | "slider" | "image" | "iframe";

const config: Record<MediaType, { icon: typeof Video; label: string; color: string }> = {
  video: { icon: Video, label: "Показать видео", color: "text-primary" },
  audio: { icon: Headphones, label: "Воспроизвести аудио", color: "text-teal-500" },
  document: { icon: BookOpen, label: "Открыть документ", color: "text-indigo-500" },
  slider: { icon: Presentation, label: "Открыть презентацию", color: "text-amber-500" },
  image: { icon: Image, label: "Показать изображение", color: "text-primary" },
  iframe: { icon: Video, label: "Загрузить видео", color: "text-primary" },
};

interface LazyMediaPreviewProps {
  type: MediaType;
  children: React.ReactNode;
  className?: string;
  defaultActivated?: boolean;
}

export function LazyMediaPreview({ type, children, className, defaultActivated = false }: LazyMediaPreviewProps) {
  const [activated, setActivated] = useState(defaultActivated);
  const { icon: Icon, label, color } = config[type];

  if (activated) return <>{children}</>;

  return (
    <div className={`aspect-video w-full rounded-xl overflow-hidden bg-muted/50 border border-border/50 flex flex-col items-center justify-center gap-3 ${className || ""}`}>
      <Icon className={`w-10 h-10 ${color} opacity-60`} />
      <Button variant="outline" size="sm" onClick={() => setActivated(true)} className="gap-2">
        <Eye className="w-4 h-4" />
        {label}
      </Button>
    </div>
  );
}
