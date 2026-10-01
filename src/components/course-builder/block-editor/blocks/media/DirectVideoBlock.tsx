import { LazyMediaPreview } from "@/components/course-builder/LazyMediaPreview";
import { HlsVideoPlayer } from "@/components/video/HlsVideoPlayer";
import { proxiedAssetUrl } from "@/utils/proxyFetch";

function DirectVideoBlockInner({ url }: { url: string }) {
  return (
    <div className="aspect-video not-prose">
      <HlsVideoPlayer src={proxiedAssetUrl(url)} className="w-full h-full rounded-lg bg-black" controls preload="none" controlsList="nodownload" />
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
