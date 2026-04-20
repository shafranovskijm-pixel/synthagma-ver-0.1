import { useState } from "react";
import { Video, Play } from "lucide-react";
import { LazyMediaPreview } from "@/components/course-builder/LazyMediaPreview";
import { HlsVideoPlayer } from "@/components/video/HlsVideoPlayer";

function DirectVideoBlockInner({ url }: { url: string }) {
  const [error, setError] = useState(false);
  if (error) {
    return (
      <div className="aspect-video not-prose rounded-lg bg-muted flex flex-col items-center justify-center gap-3">
        <Video className="w-12 h-12 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">Браузер не может воспроизвести это видео</p>
        <a href={url} target="_blank" rel="noopener noreferrer"
          className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors">
          <Play className="w-4 h-4" /> Открыть видео
        </a>
      </div>
    );
  }
  return (
    <div className="aspect-video not-prose">
      <HlsVideoPlayer src={url} className="w-full h-full rounded-lg bg-black" controls preload="none" controlsList="nodownload"
        onError={() => setError(true)} />
    </div>
  );
}

export function DirectVideoBlock({ url, lazy = true }: { url: string; lazy?: boolean }) {
  if (!lazy) return <DirectVideoBlockInner url={url} />;
  return (
    <LazyMediaPreview type="video">
      <DirectVideoBlockInner url={url} />
    </LazyMediaPreview>
  );
}
