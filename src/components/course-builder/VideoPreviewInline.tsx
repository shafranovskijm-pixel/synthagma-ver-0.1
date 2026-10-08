import DOMPurify from "dompurify";
import { Capacitor } from '@capacitor/core';
import { NativeWebMaterial } from '@/mobile/NativeWebMaterial';
import { nativeInlineVideoAllowed } from '@/mobile/nativeLearnerScope';
import { Video, Play } from "lucide-react";
import { getVideoEmbedUrl, isIframeEmbed, getKinescopeVideoId, getKinescopeEmbedUrl, isDirectVideoFileUrl } from "@/utils/courseBuilderHelpers";
import { LazyMediaPreview } from "@/components/course-builder/LazyMediaPreview";
import { HlsVideoPlayer } from "@/components/video/HlsVideoPlayer";
import { CourseVideoPlayer } from "@/components/video/CourseVideoPlayer";
import { proxiedAssetUrl } from "@/utils/proxyFetch";

interface VideoPreviewInlineProps {
  content: string;
  eager?: boolean;
}

function DirectVideoPreview({ url }: { url: string }) {
  const playableUrl = proxiedAssetUrl(url);
  return (
    <div className="aspect-video w-full rounded-xl overflow-hidden bg-muted">
      <HlsVideoPlayer src={playableUrl} className="w-full h-full bg-black" controls preload="none" controlsList="nodownload" />
    </div>
  );
}

export function VideoPreviewInline({ content, eager = false }: VideoPreviewInlineProps) {
  if (!content) return null;

  // Kinescope video
  const kinescopeId = getKinescopeVideoId(content);
  if (kinescopeId) {
    return (
      <LazyMediaPreview type="video" defaultActivated={eager}>
        <CourseVideoPlayer key={kinescopeId} src={getKinescopeEmbedUrl(kinescopeId)} kinescope preload="none" />
      </LazyMediaPreview>
    );
  }

  // Direct video file → native player with error fallback
  if (isDirectVideoFileUrl(content)) {
    return (
      <LazyMediaPreview type="video" defaultActivated={eager}>
        <DirectVideoPreview url={content} />
      </LazyMediaPreview>
    );
  }

  if (isIframeEmbed(content)) {
    if (Capacitor.isNativePlatform()) return <NativeWebMaterial label="Внешний видеоматериал" />;
    const sanitized = DOMPurify.sanitize(content, {
      ADD_TAGS: ['iframe'],
      ADD_ATTR: ['allow', 'allowfullscreen', 'frameborder', 'src', 'width', 'height', 'title', 'referrerpolicy']
    });
    return (
      <LazyMediaPreview type="iframe" defaultActivated={eager}>
        <div
          className="aspect-video w-full rounded-xl overflow-hidden bg-muted"
          dangerouslySetInnerHTML={{ __html: sanitized }}
        />
      </LazyMediaPreview>
    );
  }

  const embedResult = getVideoEmbedUrl(content);

  if (embedResult) {
    // Check if embed URL is a direct video file
    if (isDirectVideoFileUrl(embedResult.url)) {
      return (
        <LazyMediaPreview type="video" defaultActivated={eager}>
          <DirectVideoPreview url={embedResult.url} />
        </LazyMediaPreview>
      );
    }
    if (Capacitor.isNativePlatform() && !nativeInlineVideoAllowed(embedResult.url)) {
      return <NativeWebMaterial label="Внешний видеоматериал" />;
    }
    if (!embedResult.canEmbed) {
      return (
        <div className="aspect-video w-full rounded-xl overflow-hidden bg-gradient-to-br from-primary/10 to-primary/5 border border-primary/20 flex flex-col items-center justify-center gap-4">
          <Video className="w-16 h-16 text-primary/60" />
          <div className="text-center px-4">
            <p className="text-sm font-medium text-foreground mb-1">Видеозапись</p>
            <p className="text-xs text-muted-foreground mb-3">Этот сервис не поддерживает встраивание</p>
            <a href={embedResult.url} target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors">
              <Play className="w-4 h-4" />
              Открыть видео
            </a>
          </div>
        </div>
      );
    }
    return (
        <LazyMediaPreview type="video" defaultActivated={eager}>
        <div className="aspect-video w-full rounded-xl overflow-hidden bg-muted">
          <iframe src={embedResult.url} className="w-full h-full"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen />
        </div>
      </LazyMediaPreview>
    );
  }

  return (
    <div className="aspect-video w-full rounded-xl overflow-hidden bg-muted flex items-center justify-center">
      <p className="text-sm text-muted-foreground">Неподдерживаемый формат видео</p>
    </div>
  );
}
