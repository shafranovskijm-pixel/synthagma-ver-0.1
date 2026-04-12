import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import DOMPurify from "dompurify";
import {
  Video, CheckCircle2, Play, Square, Volume2, VolumeX,
  Loader2, Maximize, Minimize, RotateCcw, Gauge,
  ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";

// Helper to check if content is an iframe embed
const isIframeEmbed = (content: string): boolean => content.trim().startsWith('<iframe');

const canEmbedInIframe = (url: string): boolean => {
  const noEmbedPatterns = [/ktalk\.ru/i, /zoom\.us/i, /teams\.microsoft/i, /meet\.google/i];
  return !noEmbedPatterns.some(p => p.test(url));
};

const isDirectVideoFileUrl = (url: string): boolean => {
  try {
    const path = new URL(url).pathname.toLowerCase();
    return /(\.mp4|\.webm|\.ogg|\.ogv|\.mov|\.m4v)(\?|$)/.test(path);
  } catch { return false; }
};

const getVideoEmbedUrl = (content: string): { url: string; canEmbed: boolean } | null => {
  if (!content) return null;
  const iframeSrcMatch = content.match(/<iframe[^>]*src=["']([^"']+)["']/i);
  if (iframeSrcMatch) return { url: iframeSrcMatch[1], canEmbed: true };
  const youtubeMatch = content.match(/(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([a-zA-Z0-9_-]+)/);
  if (youtubeMatch) return { url: `https://www.youtube.com/embed/${youtubeMatch[1]}`, canEmbed: true };
  const vimeoMatch = content.match(/vimeo\.com\/(?:video\/)?(\d+)/);
  if (vimeoMatch) return { url: `https://player.vimeo.com/video/${vimeoMatch[1]}`, canEmbed: true };
  const rutubeMatch = content.match(/rutube\.ru\/video\/([a-zA-Z0-9]+)/);
  if (rutubeMatch) return { url: `https://rutube.ru/play/embed/${rutubeMatch[1]}`, canEmbed: true };
  const vkMatch = content.match(/(?:vk\.com|vkvideo\.ru)\/video(-?\d+)_(\d+)/);
  if (vkMatch) return { url: `https://vk.com/video_ext.php?oid=${vkMatch[1]}&id=${vkMatch[2]}&hd=2`, canEmbed: true };
  const ktalkMatch = content.match(/([a-zA-Z0-9]+)\.ktalk\.ru\/recordings\/([a-zA-Z0-9_-]+)/);
  if (ktalkMatch) return { url: content, canEmbed: false };
  const okMatch = content.match(/ok\.ru\/video\/(\d+)/);
  if (okMatch) return { url: `https://ok.ru/videoembed/${okMatch[1]}`, canEmbed: true };
  const mailMatch = content.match(/my\.mail\.ru\/video\/embed\/(\d+)/);
  if (mailMatch) return { url: `https://my.mail.ru/video/embed/${mailMatch[1]}`, canEmbed: true };
  const dzenMatch = content.match(/dzen\.ru\/video\/watch\/([a-zA-Z0-9]+)/);
  if (dzenMatch) return { url: `https://dzen.ru/embed/${dzenMatch[1]}`, canEmbed: true };
  const yandexMatch = content.match(/yandex\.ru\/video\/preview\/(\d+)/);
  if (yandexMatch) return { url: `https://yandex.ru/video/preview/${yandexMatch[1]}`, canEmbed: true };
  if (content.match(/^https?:\/\/.+/i)) return { url: content, canEmbed: canEmbedInIframe(content) };
  return null;
};

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
}

export const VideoPlayerInline = ({
  content, allowSeek = true, onVideoComplete, onProgressChange,
  onFinishLesson, userId, lessonId, courseId, savedPosition = 0, onSavePosition
}: VideoPlayerInlineProps) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [watchedProgress, setWatchedProgress] = useState(0);
  const [videoError, setVideoError] = useState(false);
  const [videoLoading, setVideoLoading] = useState(true);
  const [videoSlow, setVideoSlow] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [videoEnded, setVideoEnded] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [showSpeedMenu, setShowSpeedMenu] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const speedMenuRef = useRef<HTMLDivElement>(null);
  const maxWatchedRef = useRef(savedPosition);
  const completedRef = useRef(false);
  const seekGuardRef = useRef(false);
  const hasRestoredPositionRef = useRef(false);
  const stalledTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [controlsVisible, setControlsVisible] = useState(true);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [loadingTimedOut, setLoadingTimedOut] = useState(false);
  const loadingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showControls = () => {
    setControlsVisible(true);
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    if (videoRef.current && !videoRef.current.paused) {
      hideTimerRef.current = setTimeout(() => setControlsVisible(false), 3000);
    }
  };

  useEffect(() => {
    return () => {
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
      if (loadingTimeoutRef.current) clearTimeout(loadingTimeoutRef.current);
    };
  }, []);

  // Loading timeout: show fallback after 15 seconds
  useEffect(() => {
    if (videoLoading && !loadingTimedOut) {
      loadingTimeoutRef.current = setTimeout(() => setLoadingTimedOut(true), 15000);
    } else if (!videoLoading) {
      setLoadingTimedOut(false);
      if (loadingTimeoutRef.current) { clearTimeout(loadingTimeoutRef.current); loadingTimeoutRef.current = null; }
    }
    return () => { if (loadingTimeoutRef.current) { clearTimeout(loadingTimeoutRef.current); loadingTimeoutRef.current = null; } };
  }, [videoLoading, loadingTimedOut]);

  useEffect(() => {
    const handleFullscreenChange = async () => {
      setIsFullscreen(!!document.fullscreenElement);
      try {
        if (document.fullscreenElement && screen.orientation && 'lock' in screen.orientation) {
          await (screen.orientation as any).lock('landscape').catch(() => {});
        } else if (!document.fullscreenElement && screen.orientation && 'unlock' in screen.orientation) {
          screen.orientation.unlock();
        }
      } catch {}
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  useEffect(() => {
    if (!showSpeedMenu) return;
    const handleClick = (e: MouseEvent) => {
      if (speedMenuRef.current && !speedMenuRef.current.contains(e.target as Node)) setShowSpeedMenu(false);
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [showSpeedMenu]);

  // Enforce playbackRate=1 via interval when seek is disabled
  useEffect(() => {
    if (allowSeek) return;
    const interval = setInterval(() => {
      if (videoRef.current && videoRef.current.playbackRate !== 1) {
        videoRef.current.playbackRate = 1;
        setPlaybackRate(1);
      }
    }, 500);
    return () => clearInterval(interval);
  }, [allowSeek]);

  if (!content) return null;

  // Kinescope video with DRM auth
  const kinescopeMatch = content.match(/^kinescope:(.+)/) || content.match(/kinescope\.io\/embed\/([a-zA-Z0-9-]+)/);
  if (kinescopeMatch) {
    const videoId = kinescopeMatch[1];
    let embedSrc = `https://kinescope.io/embed/${videoId}`;
    // Add DRM auth token if user and course context available
    if (userId && courseId) {
      const payload = { userId, courseId, exp: Date.now() + 4 * 60 * 60 * 1000 };
      const token = btoa(JSON.stringify(payload));
      embedSrc += `?drmauthtoken=${encodeURIComponent(token)}`;
    }
    return (
      <div className="aspect-video w-full rounded-2xl overflow-hidden bg-black">
        <iframe
          src={embedSrc}
          className="w-full h-full"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
          allowFullScreen
        />
      </div>
    );
  }

  // If it's a full iframe embed code
  if (isIframeEmbed(content)) {
    const iframeSrc = content.match(/<iframe[^>]*src=["']([^"']+)["']/i)?.[1];
    if (!allowSeek) {
      return (
        <div className="aspect-video w-full rounded-2xl overflow-hidden bg-gradient-to-br from-primary/10 to-primary/5 border border-primary/20 flex flex-col items-center justify-center gap-4">
          <Video className="w-16 h-16 text-primary/60" />
          <div className="text-center px-4">
            <p className="text-sm font-medium text-foreground mb-1">Видео</p>
            <p className="text-xs text-muted-foreground mb-3">Перемотка запрещена.</p>
            {iframeSrc ? (
              <a href={iframeSrc} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors">
                <Play className="w-4 h-4" />Открыть видео
              </a>
            ) : <p className="text-xs text-muted-foreground">Ссылка не найдена.</p>}
          </div>
        </div>
      );
    }
    const sanitized = DOMPurify.sanitize(content, { ADD_TAGS: ['iframe'], ADD_ATTR: ['allow', 'allowfullscreen', 'frameborder', 'src', 'width', 'height', 'title', 'referrerpolicy'] });
    return <div className="aspect-video w-full rounded-2xl overflow-hidden bg-black" dangerouslySetInnerHTML={{ __html: sanitized }} />;
  }

  const embedResult = getVideoEmbedUrl(content);
  const directVideoSrc = embedResult?.url && isDirectVideoFileUrl(embedResult.url) ? embedResult.url : null;
  const resolvedContent = directVideoSrc ?? content;

  if (embedResult && !directVideoSrc) {
    if (!allowSeek) {
      return (
        <div className="aspect-video w-full rounded-2xl overflow-hidden bg-gradient-to-br from-primary/10 to-primary/5 border border-primary/20 flex flex-col items-center justify-center gap-4">
          <Video className="w-16 h-16 text-primary/60" />
          <div className="text-center px-4">
            <p className="text-sm font-medium text-foreground mb-1">Видеозапись</p>
            <p className="text-xs text-muted-foreground mb-3">Перемотка запрещена.</p>
            <a href={embedResult.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors">
              <Play className="w-4 h-4" />Открыть видео
            </a>
          </div>
        </div>
      );
    }
    if (!embedResult.canEmbed) {
      return (
        <div className="aspect-video w-full rounded-2xl overflow-hidden bg-gradient-to-br from-primary/10 to-primary/5 border border-primary/20 flex flex-col items-center justify-center gap-4">
          <Video className="w-16 h-16 text-primary/60" />
          <div className="text-center px-4">
            <p className="text-sm font-medium text-foreground mb-1">Видеозапись</p>
            <p className="text-xs text-muted-foreground mb-3">Этот сервис не поддерживает встраивание</p>
            <a href={embedResult.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors">
              <Play className="w-4 h-4" />Открыть видео
            </a>
          </div>
        </div>
      );
    }
    return (
      <div className="aspect-video w-full rounded-2xl overflow-hidden bg-black">
        <iframe src={embedResult.url} className="w-full h-full" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen />
      </div>
    );
  }

  const handleTimeUpdate = () => {
    if (!videoRef.current) return;
    const ct = videoRef.current.currentTime;
    setCurrentTime(ct);
    if (!allowSeek) {
      if (seekGuardRef.current) return;
      if (ct > maxWatchedRef.current) maxWatchedRef.current = ct;
    }
    if (duration > 0) {
      const progress = (ct / duration) * 100;
      setWatchedProgress(progress);
      onProgressChange?.(progress);
      onSavePosition?.(ct, duration);
      if (progress >= 90 && onVideoComplete && !completedRef.current) { completedRef.current = true; onVideoComplete(); }
    }
  };

  const handleLoadedMetadata = () => {
    if (videoRef.current) {
      const vd = videoRef.current.duration;
      setDuration(vd);
      if (!hasRestoredPositionRef.current && savedPosition > 0 && savedPosition < vd - 1) {
        hasRestoredPositionRef.current = true;
        videoRef.current.currentTime = savedPosition;
        maxWatchedRef.current = savedPosition;
        setCurrentTime(savedPosition);
        if (vd > 0) { const p = (savedPosition / vd) * 100; setWatchedProgress(p); onProgressChange?.(p); }
      }
    }
  };

  const togglePlay = () => { const v = videoRef.current; if (!v) return; if (v.paused) v.play(); else v.pause(); };
  const toggleMute = () => { const v = videoRef.current; if (!v) return; v.muted = !v.muted; setIsMuted(v.muted); };
  const SPEED_OPTIONS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];
  const changeSpeed = (rate: number) => { const v = videoRef.current; if (!v) return; v.playbackRate = rate; setPlaybackRate(rate); setShowSpeedMenu(false); };
  const requestFullscreen = async () => { try { if (document.fullscreenElement) await document.exitFullscreen(); else if (containerRef.current) await containerRef.current.requestFullscreen(); } catch {} };
  const formatTime = (seconds: number) => { if (!Number.isFinite(seconds) || seconds < 0) return "0:00"; const m = Math.floor(seconds / 60); const s = Math.floor(seconds % 60); return `${m}:${String(s).padStart(2, '0')}`; };

  const handleSeeking = () => {
    if (allowSeek || !videoRef.current) return;
    if (videoRef.current.currentTime > maxWatchedRef.current) {
      seekGuardRef.current = true;
      videoRef.current.currentTime = maxWatchedRef.current;
      window.setTimeout(() => { seekGuardRef.current = false; }, 0);
    }
  };

  const handleRateChange = () => { if (allowSeek || !videoRef.current) return; if (videoRef.current.playbackRate !== 1) { videoRef.current.playbackRate = 1; setPlaybackRate(1); } };
  const handleRetryVideo = () => { setVideoError(false); setVideoLoading(true); setVideoSlow(false); setLoadingTimedOut(false); if (videoRef.current) videoRef.current.load(); };
  const handleCanPlay = () => { setVideoLoading(false); setVideoSlow(false); if (stalledTimerRef.current) { clearTimeout(stalledTimerRef.current); stalledTimerRef.current = null; } };
  const handleWaiting = () => setVideoLoading(true);
  const handlePlaying = () => { setVideoLoading(false); setVideoSlow(false); if (stalledTimerRef.current) { clearTimeout(stalledTimerRef.current); stalledTimerRef.current = null; } };
  const handleStalled = () => { if (stalledTimerRef.current) clearTimeout(stalledTimerRef.current); stalledTimerRef.current = setTimeout(() => setVideoSlow(true), 15000); };

  if (videoError) {
    return (
      <div className="aspect-video w-full rounded-2xl overflow-hidden bg-gradient-to-br from-primary/10 to-primary/5 border border-primary/20 flex flex-col items-center justify-center gap-4">
        <Video className="w-16 h-16 text-primary/60" />
        <div className="text-center px-4">
          <p className="text-sm font-medium text-foreground mb-1">Не удалось воспроизвести видео</p>
          <p className="text-xs text-muted-foreground mb-3">Формат не поддерживается или файл недоступен</p>
          <div className="flex flex-col sm:flex-row gap-2 justify-center">
            <Button variant="outline" onClick={handleRetryVideo} className="inline-flex items-center gap-2"><RotateCcw className="w-4 h-4" />Попробовать снова</Button>
            <a href={resolvedContent} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"><Play className="w-4 h-4" />Открыть в новом окне</a>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div ref={containerRef} className={cn("relative bg-black rounded-2xl", !controlsVisible && isPlaying && "cursor-none")} onMouseMove={showControls} onMouseLeave={() => { if (isPlaying) { setControlsVisible(false); if (hideTimerRef.current) { clearTimeout(hideTimerRef.current); hideTimerRef.current = null; } } }} onTouchStart={showControls}>
      <video
        key={allowSeek ? "seek-on" : "seek-off"}
        ref={videoRef} controls={false} className="w-full h-full rounded-2xl video-no-controls"
        src={resolvedContent} preload="metadata" onClick={togglePlay}
        onTimeUpdate={handleTimeUpdate} onLoadedMetadata={handleLoadedMetadata}
        onSeeking={handleSeeking} onRateChange={handleRateChange}
        onPlay={() => { setIsPlaying(true); setVideoEnded(false); showControls(); }}
        onPause={() => { setIsPlaying(false); setControlsVisible(true); if (hideTimerRef.current) { clearTimeout(hideTimerRef.current); hideTimerRef.current = null; } }}
        onEnded={() => { setIsPlaying(false); setVideoEnded(true); }}
        onCanPlay={handleCanPlay} onWaiting={handleWaiting} onPlaying={handlePlaying}
        onStalled={handleStalled} onError={() => setVideoError(true)}
        onContextMenu={(e) => { if (!allowSeek) e.preventDefault(); }}
        controlsList={`nodownload${!allowSeek ? " noplaybackrate noremoteplayback" : ""}`}
        disablePictureInPicture={!allowSeek} disableRemotePlayback={!allowSeek} playsInline
      />
      {videoLoading && (
        <div className={cn("absolute inset-0 flex flex-col items-center justify-center bg-black/60 rounded-2xl", loadingTimedOut ? "" : "pointer-events-none")}>
          <Loader2 className="w-10 h-10 animate-spin text-white mb-2" />
          {loadingTimedOut ? (
            <div className="text-center px-4">
              <p className="text-white text-sm mb-1">Видео загружается слишком долго</p>
              <p className="text-white/60 text-xs mb-3">Файл может быть недоступен или соединение медленное</p>
              <div className="flex flex-col sm:flex-row gap-2 justify-center">
                <Button variant="outline" onClick={handleRetryVideo} className="inline-flex items-center gap-2 bg-white/10 border-white/20 text-white hover:bg-white/20">
                  <RotateCcw className="w-4 h-4" />Попробовать снова
                </Button>
                <a href={resolvedContent} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors">
                  <Play className="w-4 h-4" />Открыть в новом окне
                </a>
              </div>
            </div>
          ) : (
            <p className="text-white text-sm">Загрузка видео...</p>
          )}
        </div>
      )}
      {videoSlow && !videoLoading && (
        <div className="absolute top-2 left-2 bg-background/90 backdrop-blur-sm text-xs px-3 py-2 rounded-lg flex items-center gap-2 border border-border">
          <span className="text-muted-foreground">Видео загружается медленно</span>
          <a href={resolvedContent} target="_blank" rel="noopener noreferrer" className="text-primary underline">Открыть отдельно</a>
        </div>
      )}
      {/* Controls */}
      <div className={cn("absolute inset-x-0 bottom-0 p-3 transition-opacity duration-300", controlsVisible ? "opacity-100" : "opacity-0 pointer-events-none")}>
        {allowSeek && (
          <div className="h-1.5 w-full rounded-full bg-white/30 overflow-hidden mb-2 cursor-pointer"
            onClick={(e) => { const rect = e.currentTarget.getBoundingClientRect(); const pct = (e.clientX - rect.left) / rect.width; if (videoRef.current && duration > 0) videoRef.current.currentTime = pct * duration; }}>
            <div className="h-full bg-primary" style={{ width: `${duration > 0 ? (currentTime / duration) * 100 : 0}%` }} />
          </div>
        )}
        <div className="rounded-xl border border-border bg-background/80 backdrop-blur-md px-3 py-2 flex items-center gap-3">
          <button type="button" onClick={togglePlay} className="inline-flex items-center justify-center h-9 w-9 rounded-lg bg-primary text-primary-foreground" aria-label={isPlaying ? "Пауза" : "Воспроизвести"}>
            {isPlaying ? <Square className="w-4 h-4" /> : <Play className="w-4 h-4" />}
          </button>
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between text-xs text-muted-foreground"><span>{formatTime(currentTime)}</span><span>{formatTime(duration)}</span></div>
            {!allowSeek && <div className="mt-1 h-1.5 w-full rounded-full bg-muted overflow-hidden"><div className="h-full bg-primary" style={{ width: `${Math.min(100, Math.max(0, watchedProgress))}%` }} /></div>}
          </div>
          <button type="button" onClick={toggleMute} className="inline-flex items-center justify-center h-9 w-9 rounded-lg bg-muted text-foreground">
            {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
          </button>
          {allowSeek && (
            <div className="relative" ref={speedMenuRef}>
              <button type="button" onClick={() => setShowSpeedMenu(!showSpeedMenu)} className="inline-flex items-center justify-center h-9 min-w-9 px-1.5 rounded-lg bg-muted text-foreground text-xs font-medium">
                {playbackRate === 1 ? <Gauge className="w-4 h-4" /> : `${playbackRate}x`}
              </button>
              {showSpeedMenu && (
                <div className="absolute bottom-full mb-2 right-0 bg-background/95 backdrop-blur-md border border-border rounded-xl py-1 shadow-lg min-w-[100px] z-50">
                  {SPEED_OPTIONS.map(rate => (
                    <button key={rate} type="button" onClick={() => changeSpeed(rate)} className={cn("w-full text-left px-4 py-2 text-sm hover:bg-muted transition-colors flex items-center justify-between", rate === playbackRate && "text-primary font-medium")}>
                      <span>{rate === 1 ? 'Обычная' : rate}</span>{rate === playbackRate && <CheckCircle2 className="w-3.5 h-3.5" />}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
          <button type="button" onClick={requestFullscreen} className="inline-flex items-center justify-center h-9 w-9 rounded-lg bg-muted text-foreground">
            {isFullscreen ? <Minimize className="w-4 h-4" /> : <Maximize className="w-4 h-4" />}
          </button>
        </div>
      </div>
      {!allowSeek && !videoEnded && (
        <div className="absolute top-2 right-2 bg-background/80 backdrop-blur-sm text-xs px-2 py-1 rounded-lg flex items-center gap-1">
          <Video className="w-3 h-3" />Просмотрено: {Math.round(watchedProgress)}%
        </div>
      )}
      {videoEnded && onFinishLesson && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/70 rounded-2xl">
          <CheckCircle2 className="w-12 h-12 text-green-400 mb-3" />
          <p className="text-white text-lg font-medium mb-4">Видео просмотрено</p>
          <Button onClick={onFinishLesson} className="btn-gradient rounded-xl text-base px-6 py-3">Завершить урок<ChevronRight className="w-5 h-5 ml-2" /></Button>
        </div>
      )}
    </div>
  );
};
