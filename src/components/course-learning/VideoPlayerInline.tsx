import { useEffect, useMemo } from 'react';
import DOMPurify from 'dompurify';
import { Play, Video } from 'lucide-react';
import { CourseVideoPlayer } from '@/components/video/CourseVideoPlayer';
import { getVideoEmbedUrl, isDirectVideoFileUrl, isMpegTsOrHlsUrl, isIframeEmbed,
  getKinescopeVideoId, getKinescopeEmbedUrl, generateKinescopeDrmToken } from '@/utils/courseBuilderHelpers';
import { proxiedAssetUrl } from '@/utils/proxyFetch';

export interface VideoPlayerInlineProps {
  content: string;
  allowSeek?: boolean;
  onVideoComplete?: () => void;
  onProgressChange?: (progress: number) => void;
  onFinishLesson?: () => void;
  userId?: string;
  lessonId?: string;
  courseId?: string;
  savedPosition?: number;
  onSavePosition?: (position: number, duration: number) => void;
  /** Preserve the lesson's existing native vs external-embed completion policy. */
  onPlayerTypeDetected?: (type: 'native' | 'embed') => void;
}

export const VideoPlayerInline = ({ content, allowSeek = true, userId, courseId, onPlayerTypeDetected, ...playback }: VideoPlayerInlineProps) => {
  const embedResult = getVideoEmbedUrl(content);
  const kinescopeId = getKinescopeVideoId(content);
  // Keep the time-dependent DRM token stable across progress/fullscreen renders.
  const kinescopeSrc = useMemo(() => {
    if (!kinescopeId) return undefined;
    return getKinescopeEmbedUrl(kinescopeId, userId && courseId ? generateKinescopeDrmToken(userId, courseId) : undefined);
  }, [kinescopeId, userId, courseId]);
  const directSrc = embedResult?.url && isDirectVideoFileUrl(embedResult.url) ? embedResult.url : null;
  const isEmbed = !!kinescopeId || (!directSrc && (isIframeEmbed(content) || !!embedResult));
  useEffect(() => { onPlayerTypeDetected?.(isEmbed ? 'embed' : 'native'); }, [isEmbed, onPlayerTypeDetected]);

  if (!content) return null;
  if (kinescopeSrc) return <CourseVideoPlayer key={kinescopeSrc} src={kinescopeSrc} kinescope allowSeek={allowSeek} {...playback} />;
  if (directSrc || (!isIframeEmbed(content) && !embedResult)) {
    const source = directSrc || content;
    const playable = isDirectVideoFileUrl(source) || isMpegTsOrHlsUrl(source) ? proxiedAssetUrl(source) : source;
    return <CourseVideoPlayer key={playable} src={playable} allowSeek={allowSeek} {...playback} />;
  }
  const iframeSrc = isIframeEmbed(content) ? content.match(/<iframe[^>]*src=["']([^"']+)["']/i)?.[1] : embedResult?.url;
  if (!allowSeek || embedResult?.canEmbed === false) {
    return <div className="aspect-video flex w-full flex-col items-center justify-center gap-4 rounded-xl border border-primary/20 bg-primary/5 px-4 text-center">
      <Video className="h-16 w-16 text-primary/60" />
      <div><p className="mb-1 text-sm font-medium">Видеозапись</p><p className="mb-3 text-xs text-muted-foreground">{!allowSeek ? 'Перемотка запрещена.' : 'Этот сервис не поддерживает встраивание'}</p>
        {iframeSrc && <a href={iframeSrc} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm text-primary-foreground"><Play className="h-4 w-4" />Открыть видео</a>}
      </div>
    </div>;
  }
  if (isIframeEmbed(content)) {
    const sanitized = DOMPurify.sanitize(content, { ADD_TAGS: ['iframe'], ADD_ATTR: ['allow', 'allowfullscreen', 'frameborder', 'src', 'width', 'height', 'title', 'referrerpolicy'] });
    return <div className="aspect-video w-full overflow-hidden rounded-xl bg-black [&_iframe]:h-full [&_iframe]:w-full" dangerouslySetInnerHTML={{ __html: sanitized }} />;
  }
  return <div className="aspect-video w-full overflow-hidden rounded-xl bg-black"><iframe src={iframeSrc} title="Видео урока" className="h-full w-full border-0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen" allowFullScreen /></div>;
};
