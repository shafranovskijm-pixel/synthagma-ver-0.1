import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useIsMobile } from "@/hooks/use-mobile";
import { useSwipeGesture } from "@/hooks/useSwipeGesture";
import { useVideoProgress } from "@/hooks/useVideoProgress";
import { supabase } from "@/integrations/supabase/client";
import { SigmaLogo } from "@/components/ui/SigmaLogo";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { toast } from "sonner";
import DOMPurify from "dompurify";
import { 
  ArrowLeft, 
  CheckCircle2, 
  Circle, 
  FileText, 
  Video, 
  ClipboardList,
  ChevronLeft,
  ChevronRight,
  Trophy,
  Sparkles,
  BookOpen,
  Clock,
  Loader2,
  Volume2,
  VolumeX,
  Square,
  Headphones,
  MessageCircle,
  X,
  Send,
  Menu,
  List,
  Play,
  Presentation,
  Lock,
  RotateCcw,
  Settings2
} from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { ContentBlock, jsonToBlocks, BlockRenderer } from "@/components/course-builder/BlockEditor";
import { cn } from "@/lib/utils";
import { generateAttestationProtocol } from "@/utils/generateAttestationProtocol";
import { useElevenLabsTTS } from "@/hooks/useElevenLabsTTS";
import { TTSSettingsDialog, TTSSettings, getStoredTTSSettings } from "@/components/student/TTSSettingsDialog";

// Helper to get text from option (handles both string and {text: string} formats)
const getOptionText = (option: unknown): string => {
  if (typeof option === 'object' && option !== null && 'text' in option) {
    return (option as { text: string }).text;
  }
  return String(option);
};

// Helper to check if content is an iframe embed
const isIframeEmbed = (content: string): boolean => {
  return content.trim().startsWith('<iframe');
};

// Helper function to check if URL can be embedded in iframe
const canEmbedInIframe = (url: string): boolean => {
  // These services don't allow iframe embedding
  const noEmbedPatterns = [
    /ktalk\.ru/i,
    /zoom\.us/i,
    /teams\.microsoft/i,
    /meet\.google/i
  ];
  return !noEmbedPatterns.some(pattern => pattern.test(url));
};

// Direct video files can (and should) be rendered with a native <video> tag so we can enforce restrictions.
const isDirectVideoFileUrl = (url: string): boolean => {
  try {
    const u = new URL(url);
    const path = u.pathname.toLowerCase();
    // Common video file extensions
    if (/(\.mp4|\.webm|\.ogg|\.ogv|\.mov|\.m4v)(\?|$)/.test(path)) return true;
    // Some storage providers use extension-less object paths; still treat known video mime-style names as direct.
    // (best-effort; if it's not a direct video file the <video> tag will fail and the user will see it)
    return false;
  } catch {
    return false;
  }
};

// Helper function to get embed URL from video content
const getVideoEmbedUrl = (content: string): { url: string; canEmbed: boolean } | null => {
  if (!content) return null;
  
  // Check if it's an iframe embed code
  const iframeSrcMatch = content.match(/<iframe[^>]*src=["']([^"']+)["']/i);
  if (iframeSrcMatch) {
    return { url: iframeSrcMatch[1], canEmbed: true };
  }
  
  // YouTube
  const youtubeMatch = content.match(/(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([a-zA-Z0-9_-]+)/);
  if (youtubeMatch) {
    return { url: `https://www.youtube.com/embed/${youtubeMatch[1]}`, canEmbed: true };
  }
  
  // Vimeo
  const vimeoMatch = content.match(/vimeo\.com\/(?:video\/)?(\d+)/);
  if (vimeoMatch) {
    return { url: `https://player.vimeo.com/video/${vimeoMatch[1]}`, canEmbed: true };
  }
  
  // Rutube
  const rutubeMatch = content.match(/rutube\.ru\/video\/([a-zA-Z0-9]+)/);
  if (rutubeMatch) {
    return { url: `https://rutube.ru/play/embed/${rutubeMatch[1]}`, canEmbed: true };
  }
  
  // VK Video (vk.com and vkvideo.ru)
  const vkMatch = content.match(/(?:vk\.com|vkvideo\.ru)\/video(-?\d+)_(\d+)/);
  if (vkMatch) {
    return { url: `https://vk.com/video_ext.php?oid=${vkMatch[1]}&id=${vkMatch[2]}&hd=2`, canEmbed: true };
  }
  
  // KTalk recordings (ktalk.ru) - can't embed, return original URL
  const ktalkMatch = content.match(/([a-zA-Z0-9]+)\.ktalk\.ru\/recordings\/([a-zA-Z0-9_-]+)/);
  if (ktalkMatch) {
    return { url: content, canEmbed: false };
  }
  
  // Одноклассники
  const okMatch = content.match(/ok\.ru\/video\/(\d+)/);
  if (okMatch) {
    return { url: `https://ok.ru/videoembed/${okMatch[1]}`, canEmbed: true };
  }
  
  // Mail.ru
  const mailMatch = content.match(/my\.mail\.ru\/video\/embed\/(\d+)/);
  if (mailMatch) {
    return { url: `https://my.mail.ru/video/embed/${mailMatch[1]}`, canEmbed: true };
  }
  
  // Дзен
  const dzenMatch = content.match(/dzen\.ru\/video\/watch\/([a-zA-Z0-9]+)/);
  if (dzenMatch) {
    return { url: `https://dzen.ru/embed/${dzenMatch[1]}`, canEmbed: true };
  }
  
  // Яндекс Видео
  const yandexMatch = content.match(/yandex\.ru\/video\/preview\/(\d+)/);
  if (yandexMatch) {
    return { url: `https://yandex.ru/video/preview/${yandexMatch[1]}`, canEmbed: true };
  }
  
  // Generic video URLs - check if can embed
  if (content.match(/^https?:\/\/.+/i)) {
    return { url: content, canEmbed: canEmbedInIframe(content) };
  }
  
  return null;
};

// Video preview component for learning with optional seek control
interface VideoPlayerInlineProps {
  content: string;
  allowSeek?: boolean;
  onVideoComplete?: () => void;
  onProgressChange?: (progress: number) => void;
  userId?: string;
  lessonId?: string;
  savedPosition?: number;
  onSavePosition?: (position: number, duration: number) => void;
}

const VideoPlayerInline = ({ 
  content, 
  allowSeek = true, 
  onVideoComplete, 
  onProgressChange,
  userId,
  lessonId,
  savedPosition = 0,
  onSavePosition
}: VideoPlayerInlineProps) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [watchedProgress, setWatchedProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const maxWatchedRef = useRef(savedPosition);
  const completedRef = useRef(false);
  const seekGuardRef = useRef(false);
  const hasRestoredPositionRef = useRef(false);
  
  if (!content) return null;
  
  // If it's a full iframe embed code, render it directly ONLY when seeking is allowed.
  // When seeking is forbidden, we cannot enforce it inside iframe – show an "open video" card instead.
  if (isIframeEmbed(content)) {
    const iframeSrcMatch = content.match(/<iframe[^>]*src=["']([^"']+)["']/i);
    const iframeSrc = iframeSrcMatch?.[1];

    if (!allowSeek) {
      return (
        <div className="aspect-video w-full rounded-2xl overflow-hidden bg-gradient-to-br from-primary/10 to-primary/5 border border-primary/20 flex flex-col items-center justify-center gap-4">
          <Video className="w-16 h-16 text-primary/60" />
          <div className="text-center px-4">
            <p className="text-sm font-medium text-foreground mb-1">Видео</p>
            <p className="text-xs text-muted-foreground mb-3">
              Перемотка запрещена, а встроенный плеер не позволяет это контролировать.
            </p>
            {iframeSrc ? (
              <a
                href={iframeSrc}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"
              >
                <Play className="w-4 h-4" />
                Открыть видео
              </a>
            ) : (
              <p className="text-xs text-muted-foreground">Ссылка на видео не найдена в коде вставки.</p>
            )}
          </div>
        </div>
      );
    }

    const sanitized = DOMPurify.sanitize(content, {
      ADD_TAGS: ['iframe'],
      ADD_ATTR: ['allow', 'allowfullscreen', 'frameborder', 'src', 'width', 'height', 'title', 'referrerpolicy']
    });
    return (
      <div 
        className="aspect-video w-full rounded-2xl overflow-hidden bg-black"
        dangerouslySetInnerHTML={{ __html: sanitized }}
      />
    );
  }
  
  // Try to get embed URL from link
  const embedResult = getVideoEmbedUrl(content);

  // If the parsed URL points to a direct video file, always render it via native <video>
  // so we can reliably remove controls / disable seeking.
  const directVideoSrc = embedResult?.url && isDirectVideoFileUrl(embedResult.url) ? embedResult.url : null;
  const resolvedContent = directVideoSrc ?? content;
  
  if (embedResult && !directVideoSrc) {
    // When seeking is forbidden, we cannot reliably enforce it inside embedded players.
    // So we avoid embedding and provide an external link instead.
    if (!allowSeek) {
      return (
        <div className="aspect-video w-full rounded-2xl overflow-hidden bg-gradient-to-br from-primary/10 to-primary/5 border border-primary/20 flex flex-col items-center justify-center gap-4">
          <Video className="w-16 h-16 text-primary/60" />
          <div className="text-center px-4">
            <p className="text-sm font-medium text-foreground mb-1">Видеозапись</p>
            <p className="text-xs text-muted-foreground mb-3">
              Перемотка запрещена. Чтобы ограничение работало, откройте видео по кнопке ниже.
            </p>
            <a
              href={embedResult.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"
            >
              <Play className="w-4 h-4" />
              Открыть видео
            </a>
          </div>
        </div>
      );
    }

    // If can't embed, show a card with link to open video
    if (!embedResult.canEmbed) {
      return (
        <div className="aspect-video w-full rounded-2xl overflow-hidden bg-gradient-to-br from-primary/10 to-primary/5 border border-primary/20 flex flex-col items-center justify-center gap-4">
          <Video className="w-16 h-16 text-primary/60" />
          <div className="text-center px-4">
            <p className="text-sm font-medium text-foreground mb-1">Видеозапись</p>
            <p className="text-xs text-muted-foreground mb-3">Этот сервис не поддерживает встраивание</p>
            <a
              href={embedResult.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"
            >
              <Play className="w-4 h-4" />
              Открыть видео
            </a>
          </div>
        </div>
      );
    }
    
    // External embeds (YouTube, etc.) - can't control seeking
    return (
      <div className="aspect-video w-full rounded-2xl overflow-hidden bg-black">
        <iframe
          src={embedResult.url}
          className="w-full h-full"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
        />
      </div>
    );
  }
  
  // Native video player with seek control
  const handleTimeUpdate = () => {
    if (!videoRef.current) return;
    const currentTime = videoRef.current.currentTime;
    setCurrentTime(currentTime);
    
    if (!allowSeek) {
      // Block ANY forward seek beyond the furthest watched point.
      // No tolerance: prevents inching forward.
      if (seekGuardRef.current) return;

      if (currentTime > maxWatchedRef.current) {
        // Natural playback increases currentTime gradually; that's allowed.
        // But if user attempted a jump forward, onSeeking handler will revert.
        maxWatchedRef.current = currentTime;
      }
    }
    
    if (duration > 0) {
      const progress = (currentTime / duration) * 100;
      setWatchedProgress(progress);
      onProgressChange?.(progress);
      
      // Save position periodically
      onSavePosition?.(currentTime, duration);
      
      // Mark as complete when 90% watched (only once)
      if (progress >= 90 && onVideoComplete && !completedRef.current) {
        completedRef.current = true;
        onVideoComplete();
      }
    }
  };
  
  const handleLoadedMetadata = () => {
    if (videoRef.current) {
      const videoDuration = videoRef.current.duration;
      setDuration(videoDuration);
      
      // Restore saved position after metadata loads (only once)
      if (!hasRestoredPositionRef.current && savedPosition > 0 && savedPosition < videoDuration - 1) {
        console.log('[VideoPlayer] Restoring position to:', savedPosition);
        hasRestoredPositionRef.current = true;
        videoRef.current.currentTime = savedPosition;
        maxWatchedRef.current = savedPosition;
        setCurrentTime(savedPosition);
        
        if (videoDuration > 0) {
          const progress = (savedPosition / videoDuration) * 100;
          setWatchedProgress(progress);
          onProgressChange?.(progress);
        }
      }
    }
  };

  const handlePlay = () => setIsPlaying(true);
  const handlePause = () => setIsPlaying(false);

  const togglePlay = () => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) v.play();
    else v.pause();
  };

  const toggleMute = () => {
    const v = videoRef.current;
    if (!v) return;
    v.muted = !v.muted;
    setIsMuted(v.muted);
  };

  const requestFullscreen = async () => {
    const v = videoRef.current;
    if (!v) return;
    try {
      // @ts-expect-error - older Safari uses webkitEnterFullscreen
      if (typeof v.webkitEnterFullscreen === 'function') {
        // @ts-expect-error
        v.webkitEnterFullscreen();
        return;
      }
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else {
        await v.requestFullscreen();
      }
    } catch {
      // ignore
    }
  };

  const formatTime = (seconds: number) => {
    if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${String(s).padStart(2, '0')}`;
  };
  
  const handleSeeking = () => {
    if (allowSeek || !videoRef.current) return;
    const v = videoRef.current;

    // Allow seeking backwards, forbid seeking forward at all.
    if (v.currentTime > maxWatchedRef.current) {
      seekGuardRef.current = true;
      v.currentTime = maxWatchedRef.current;
      // Let the browser settle the seek, then release guard.
      window.setTimeout(() => {
        seekGuardRef.current = false;
      }, 0);
      toast.info('Перемотка заблокирована. Посмотрите видео полностью.');
    }
  };

  const handleRateChange = () => {
    if (allowSeek || !videoRef.current) return;
    // Prevent speeding up playback as a form of skipping.
    if (videoRef.current.playbackRate !== 1) {
      videoRef.current.playbackRate = 1;
    }
  };
  
  return (
    <div className="relative">
      <video 
        key={allowSeek ? "video-seek-enabled" : "video-seek-disabled"}
        ref={videoRef}
        // IMPORTANT: when seeking is disabled we must remove native controls entirely.
        controls={allowSeek}
        className="w-full h-full rounded-2xl"
        src={resolvedContent}
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={handleLoadedMetadata}
        onSeeking={handleSeeking}
        onRateChange={handleRateChange}
        onPlay={handlePlay}
        onPause={handlePause}
        onContextMenu={(e) => {
          // Prevent the browser's right-click menu (e.g., "Скачать") when restrictions are enabled.
          if (!allowSeek) e.preventDefault();
        }}
        controlsList={`nodownload${!allowSeek ? " noplaybackrate noremoteplayback" : ""}`}
        disablePictureInPicture={!allowSeek}
        disableRemotePlayback={!allowSeek}
        playsInline
      />
      {!allowSeek && (
        <div className="absolute inset-x-0 bottom-0 p-3">
          <div className="rounded-xl border border-border bg-background/80 backdrop-blur-md px-3 py-2 flex items-center gap-3">
            <button
              type="button"
              onClick={togglePlay}
              className="inline-flex items-center justify-center h-9 w-9 rounded-lg bg-primary text-primary-foreground"
              aria-label={isPlaying ? "Пауза" : "Воспроизвести"}
            >
              {isPlaying ? <Square className="w-4 h-4" /> : <Play className="w-4 h-4" />}
            </button>

            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>{formatTime(currentTime)}</span>
                <span>{formatTime(duration)}</span>
              </div>
              <div className="mt-1 h-1.5 w-full rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full bg-primary"
                  style={{ width: `${Math.min(100, Math.max(0, watchedProgress))}%` }}
                />
              </div>
            </div>

            <button
              type="button"
              onClick={toggleMute}
              className="inline-flex items-center justify-center h-9 w-9 rounded-lg bg-muted text-foreground"
              aria-label={isMuted ? "Включить звук" : "Выключить звук"}
            >
              {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
            </button>
            <button
              type="button"
              onClick={requestFullscreen}
              className="inline-flex items-center justify-center h-9 w-9 rounded-lg bg-muted text-foreground"
              aria-label="Во весь экран"
            >
              <Presentation className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
      {!allowSeek && (
        <div className="absolute top-2 right-2 bg-background/80 backdrop-blur-sm text-xs px-2 py-1 rounded-lg flex items-center gap-1">
          <Video className="w-3 h-3" />
          Просмотрено: {Math.round(watchedProgress)}%
        </div>
      )}
    </div>
  );
};

// Slider Lesson Viewer Component
interface SliderSlide {
  id: string;
  content: string;
  title?: string;
  imageUrl?: string;
}

interface SliderContent {
  slides: SliderSlide[];
  pptxFileUrl?: string;
}

// Parse slider content - supports both old array format and new object format
const parseSliderContent = (content: string | null): SliderContent => {
  try {
    if (!content) return { slides: [] };
    const parsed = JSON.parse(content);
    // Support old format (array of slides)
    if (Array.isArray(parsed)) {
      return { slides: parsed };
    }
    // New format with pptxFileUrl
    if (typeof parsed === 'object' && parsed !== null) {
      return {
        slides: Array.isArray(parsed.slides) ? parsed.slides : [],
        pptxFileUrl: parsed.pptxFileUrl
      };
    }
    return { slides: [] };
  } catch {
    return { slides: [] };
  }
};

interface SliderLessonViewerProps {
  content: string | null;
  title: string;
  lessonIndex: number;
  isMobile: boolean;
}

const SliderLessonViewer = ({ content, title, lessonIndex, isMobile }: SliderLessonViewerProps) => {
  const [isLoading, setIsLoading] = useState(true);
  const [viewerError, setViewerError] = useState(false);
  
  // Parse slides from content using new helper
  const sliderContent = parseSliderContent(content);
  const slides = sliderContent.slides;
  const pptxFileUrl = sliderContent.pptxFileUrl;

  // Generate Google Docs Viewer URL for PPTX
  const getViewerUrl = (fileUrl: string): string => {
    const encodedUrl = encodeURIComponent(fileUrl);
    return `https://docs.google.com/gview?url=${encodedUrl}&embedded=true`;
  };

  // Handle iframe load
  const handleIframeLoad = () => {
    setIsLoading(false);
  };

  const handleIframeError = () => {
    setIsLoading(false);
    setViewerError(true);
  };

  // If we have a PPTX file URL, show it in an online viewer
  if (pptxFileUrl) {
    const viewerUrl = getViewerUrl(pptxFileUrl);
    
    return (
      <div className="space-y-4 md:space-y-6 animate-fade-in">
        {/* Header */}
        <div className="flex items-center gap-3 pb-3 md:pb-4 border-b border-border">
          <div className={cn(
            "rounded-xl bg-amber-500/10 flex items-center justify-center shrink-0",
            isMobile ? "w-8 h-8" : "w-10 h-10"
          )}>
            <Presentation className={cn(isMobile ? "w-4 h-4" : "w-5 h-5", "text-amber-500")} />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className={cn(
              "font-display font-bold line-clamp-2",
              isMobile ? "text-lg" : "text-2xl"
            )}>{title}</h1>
            <p className="text-xs md:text-sm text-muted-foreground">
              Презентация • {slides.length} слайдов
            </p>
          </div>
          <a
            href={pptxFileUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium bg-amber-500/10 text-amber-600 rounded-lg hover:bg-amber-500/20 transition-colors"
          >
            <FileText className="w-3.5 h-3.5" />
            {!isMobile && "Скачать"}
          </a>
        </div>

        {/* PPTX Viewer */}
        <div className="rounded-2xl border border-amber-500/30 bg-card overflow-hidden shadow-lg">
          <div className="relative w-full" style={{ minHeight: isMobile ? '400px' : '600px' }}>
            {isLoading && (
              <div className="absolute inset-0 flex items-center justify-center bg-secondary/50 z-10">
                <div className="flex flex-col items-center gap-3">
                  <Loader2 className="w-8 h-8 animate-spin text-amber-500" />
                  <p className="text-sm text-muted-foreground">Загрузка презентации...</p>
                </div>
              </div>
            )}
            {viewerError ? (
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="text-center p-6">
                  <Presentation className="w-16 h-16 mx-auto mb-4 text-amber-500/50" />
                  <p className="text-muted-foreground mb-4">Не удалось загрузить просмотрщик</p>
                  <a
                    href={pptxFileUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 px-4 py-2 bg-amber-500 text-white rounded-lg hover:bg-amber-600 transition-colors"
                  >
                    <FileText className="w-4 h-4" />
                    Скачать презентацию
                  </a>
                </div>
              </div>
            ) : (
              <iframe
                src={viewerUrl}
                className="w-full h-full border-0"
                style={{ minHeight: isMobile ? '400px' : '600px' }}
                onLoad={handleIframeLoad}
                onError={handleIframeError}
                title={title}
                allowFullScreen
              />
            )}
          </div>
        </div>
      </div>
    );
  }

  // Fallback to old slide-by-slide view if no PPTX URL
  const [currentIndex, setCurrentIndex] = useState(0);

  const goToSlide = (index: number) => {
    if (index >= 0 && index < slides.length) {
      setCurrentIndex(index);
    }
  };

  if (slides.length === 0) {
    return (
      <div className="space-y-4 md:space-y-6 animate-fade-in">
        <div className="flex items-center gap-3 pb-3 md:pb-4 border-b border-border">
          <div className={cn(
            "rounded-xl bg-amber-500/10 flex items-center justify-center shrink-0",
            isMobile ? "w-8 h-8" : "w-10 h-10"
          )}>
            <Presentation className={cn(isMobile ? "w-4 h-4" : "w-5 h-5", "text-amber-500")} />
          </div>
          <div className="min-w-0">
            <h1 className={cn(
              "font-display font-bold line-clamp-2",
              isMobile ? "text-lg" : "text-2xl"
            )}>{title}</h1>
            <p className="text-xs md:text-sm text-muted-foreground">Презентация {lessonIndex + 1}</p>
          </div>
        </div>
        <div className="flex items-center justify-center py-12 text-muted-foreground">
          <div className="text-center">
            <Presentation className="w-16 h-16 mx-auto mb-4 opacity-50" />
            <p>Презентация не загружена</p>
          </div>
        </div>
      </div>
    );
  }

  const currentSlide = slides[currentIndex];

  return (
    <div className="space-y-4 md:space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center gap-3 pb-3 md:pb-4 border-b border-border">
        <div className={cn(
          "rounded-xl bg-amber-500/10 flex items-center justify-center shrink-0",
          isMobile ? "w-8 h-8" : "w-10 h-10"
        )}>
          <Presentation className={cn(isMobile ? "w-4 h-4" : "w-5 h-5", "text-amber-500")} />
        </div>
        <div className="min-w-0 flex-1">
          <h1 className={cn(
            "font-display font-bold line-clamp-2",
            isMobile ? "text-lg" : "text-2xl"
          )}>{title}</h1>
          <p className="text-xs md:text-sm text-muted-foreground">
            Презентация • Слайд {currentIndex + 1} из {slides.length}
          </p>
        </div>
      </div>

      {/* Slider Content */}
      <div className="rounded-2xl border border-amber-500/30 bg-card overflow-hidden shadow-lg">
        <div className={cn(
          isMobile ? "p-4" : "p-6"
        )}>
          {currentSlide && (
            <div className="space-y-4">
              {currentSlide.imageUrl && (
                <div className="rounded-xl overflow-hidden border border-border bg-white flex items-center justify-center">
                  <img 
                    src={currentSlide.imageUrl} 
                    alt={currentSlide.title || 'Слайд'} 
                    className="w-full h-auto object-contain"
                    style={{ maxHeight: 'calc(100vh - 350px)', minHeight: '300px' }}
                  />
                </div>
              )}
              {currentSlide.title && (
                <h3 className={cn(
                  "font-semibold",
                  isMobile ? "text-lg" : "text-xl"
                )}>{currentSlide.title}</h3>
              )}
              {currentSlide.content && (
                <div className="text-sm md:text-base text-muted-foreground whitespace-pre-wrap">
                  {currentSlide.content}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Navigation */}
        <div className="flex items-center justify-between p-3 md:p-4 border-t border-amber-500/20 bg-amber-500/5">
          <Button
            variant="ghost"
            size={isMobile ? "sm" : "default"}
            onClick={() => goToSlide(currentIndex - 1)}
            disabled={currentIndex === 0}
            className="gap-1"
          >
            <ChevronLeft className="w-4 h-4" />
            {!isMobile && "Назад"}
          </Button>
          
          <div className="flex gap-1.5 overflow-x-auto max-w-[200px] md:max-w-none">
            {slides.map((_, i) => (
              <button
                key={i}
                onClick={() => goToSlide(i)}
                className={cn(
                  "w-2 h-2 rounded-full transition-all shrink-0",
                  i === currentIndex 
                    ? "bg-amber-500 scale-125" 
                    : "bg-amber-500/30 hover:bg-amber-500/50"
                )}
              />
            ))}
          </div>
          
          <Button
            variant="ghost"
            size={isMobile ? "sm" : "default"}
            onClick={() => goToSlide(currentIndex + 1)}
            disabled={currentIndex === slides.length - 1}
            className="gap-1"
          >
            {!isMobile && "Далее"}
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </div>
  );
};

interface Lesson {
  id: string;
  title: string;
  type: string;
  content: string | null;
  order_index: number;
}

interface Course {
  id: string;
  title: string;
  description: string | null;
  duration: string | null;
  sequential_lessons?: boolean;
  allow_video_seek?: boolean;
}

interface LessonProgress {
  lesson_id: string;
  completed: boolean;
}

interface TestQuestion {
  id: string;
  question: string;
  options: unknown;
  correct_answer: number;
  order_index: number;
  explanation?: string;
  is_bank_question?: boolean;
}

const CourseLearning = () => {
  const { courseId } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const contentRef = useRef<HTMLDivElement>(null);
  
  const [course, setCourse] = useState<Course | null>(null);
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [currentLessonIndex, setCurrentLessonIndex] = useState(0);
  const [lessonProgress, setLessonProgress] = useState<LessonProgress[]>([]);
  const [loading, setLoading] = useState(true);
  const [enrollmentId, setEnrollmentId] = useState<string | null>(null);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  
  // Tooltip state for mobile progress bar
  const [tooltipLesson, setTooltipLesson] = useState<{ index: number; title: string } | null>(null);
  const longPressTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const progressBarRef = useRef<HTMLDivElement>(null);
  const lessonButtonRefs = useRef<(HTMLButtonElement | null)[]>([]);
  
  // Test state
  const [testQuestions, setTestQuestions] = useState<TestQuestion[]>([]);
  const [allBankQuestions, setAllBankQuestions] = useState<TestQuestion[]>([]);
  const [usedQuestionIds, setUsedQuestionIds] = useState<string[]>([]);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [testSubmitted, setTestSubmitted] = useState(false);
  const [testScore, setTestScore] = useState<{ score: number; max: number } | null>(null);
  const [testQuestionsCount, setTestQuestionsCount] = useState<number | null>(null);
  const [testPassingScore, setTestPassingScore] = useState<number>(60); // Default 60%

  // Text-to-speech state
  const [ttsSettingsOpen, setTtsSettingsOpen] = useState(false);
  const [ttsSettings, setTtsSettings] = useState<TTSSettings>(() => getStoredTTSSettings());
  const speechSynthesisRef = useRef<SpeechSynthesisUtterance | null>(null);
  const [isBrowserSpeaking, setIsBrowserSpeaking] = useState(false);
  
  // ElevenLabs TTS hook
  const elevenLabsTTS = useElevenLabsTTS({
    voiceId: ttsSettings.voiceId,
  });

  // Video watch progress state (for controlling "Complete lesson" button visibility)
  const [videoWatchProgress, setVideoWatchProgress] = useState(0);

  // AI Chat state
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [chatMessages, setChatMessages] = useState<Array<{ role: 'user' | 'assistant'; content: string }>>([]);
  const [chatInput, setChatInput] = useState('');
  const [isChatLoading, setIsChatLoading] = useState(false);
  const chatScrollRef = useRef<HTMLDivElement>(null);

  const currentLesson = lessons[currentLessonIndex];
  const completedCount = lessonProgress.filter(p => p.completed).length;
  const progressPercent = lessons.length > 0 ? (completedCount / lessons.length) * 100 : 0;
  
  // Video position persistence (must be after currentLesson is defined)
  const videoLessonId = currentLesson?.type === 'video' ? currentLesson.id : undefined;
  const { 
    savedPosition, 
    isLoading: isVideoProgressLoading,
    savePosition: saveVideoPosition,
  } = useVideoProgress(user?.id, videoLessonId);

  // Parse content blocks
  const contentBlocks: ContentBlock[] = currentLesson?.content 
    ? parseContentToBlocks(currentLesson.content) 
    : [];

  // Text-to-speech functions
  const extractTextFromBlocks = (blocks: ContentBlock[]): string => {
    return blocks.map(block => {
      switch (block.type) {
        case 'paragraph':
        case 'heading1':
        case 'heading2':
        case 'quote':
        case 'callout-info':
        case 'callout-warning':
        case 'callout-tip':
          return block.content?.replace(/<[^>]*>/g, '') || '';
        case 'bulletList':
        case 'numberedList':
          return (block.content || '').split('\n').filter(Boolean).join('. ');
        case 'accordion':
          return `${block.accordionTitle || ''}. ${block.content || ''}`;
        case 'quiz':
          return `Вопрос: ${block.quizQuestion || ''}`;
        default:
          return '';
      }
    }).filter(Boolean).join('. ');
  };

  // Computed isSpeaking for UI
  const isSpeaking = ttsSettings.useElevenLabs ? elevenLabsTTS.isActive : isBrowserSpeaking;

  const getTextToSpeak = (): string => {
    if (!currentLesson) return '';

    let textToSpeak = '';
    
    if (currentLesson.type === 'text') {
      if (contentBlocks.length > 0) {
        textToSpeak = extractTextFromBlocks(contentBlocks);
      } else {
        textToSpeak = currentLesson.content?.replace(/<[^>]*>/g, '').replace(/\n/g, '. ') || '';
      }
    } else if (currentLesson.type === 'test') {
      textToSpeak = testQuestions.map((q, i) => {
        const options = Array.isArray(q.options) ? q.options : [];
        const optionsText = options.map((opt, j) => `${j + 1}. ${getOptionText(opt)}`).join('. ');
        return `Вопрос ${i + 1}: ${q.question}. Варианты ответа: ${optionsText}`;
      }).join('. ');
    }

    return textToSpeak;
  };

  const speakText = () => {
    if (!currentLesson) return;

    const textToSpeak = getTextToSpeak();
    if (!textToSpeak) {
      toast.error('Нет текста для озвучивания');
      return;
    }

    if (ttsSettings.useElevenLabs) {
      // Use ElevenLabs TTS
      elevenLabsTTS.speak(textToSpeak);
    } else {
      // Use browser speech synthesis
      if (isBrowserSpeaking) {
        window.speechSynthesis.cancel();
        setIsBrowserSpeaking(false);
        return;
      }

      if (!('speechSynthesis' in window)) {
        toast.error('Озвучивание не поддерживается в вашем браузере');
        return;
      }

      const utterance = new SpeechSynthesisUtterance(textToSpeak);
      utterance.lang = 'ru-RU';
      utterance.rate = 1.0;
      utterance.pitch = 1.0;

      const voices = window.speechSynthesis.getVoices();
      const russianVoice = voices.find(v => v.lang.startsWith('ru'));
      if (russianVoice) {
        utterance.voice = russianVoice;
      }

      utterance.onend = () => {
        setIsBrowserSpeaking(false);
      };

      utterance.onerror = () => {
        setIsBrowserSpeaking(false);
        toast.error('Ошибка озвучивания');
      };

      speechSynthesisRef.current = utterance;
      window.speechSynthesis.speak(utterance);
      setIsBrowserSpeaking(true);
    }
  };

  // Stop speaking when lesson changes
  useEffect(() => {
    window.speechSynthesis.cancel();
    setIsBrowserSpeaking(false);
    elevenLabsTTS.stop();
  }, [currentLessonIndex]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      window.speechSynthesis.cancel();
      elevenLabsTTS.stop();
    };
  }, []);

  // Scroll chat to bottom
  useEffect(() => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [chatMessages]);

  // AI Chat function
  const sendChatMessage = async () => {
    if (!chatInput.trim() || isChatLoading) return;

    const userMessage = chatInput.trim();
    setChatInput('');
    setChatMessages(prev => [...prev, { role: 'user', content: userMessage }]);
    setIsChatLoading(true);

    // Extract lesson content for context
    let lessonContent = '';
    if (currentLesson) {
      if (currentLesson.type === 'text' && contentBlocks.length > 0) {
        lessonContent = extractTextFromBlocks(contentBlocks);
      } else if (currentLesson.content) {
        lessonContent = currentLesson.content.replace(/<[^>]*>/g, '').substring(0, 3000);
      }
    }

    try {
      const { data, error } = await supabase.functions.invoke('student-chat', {
        body: {
          messages: [
            ...chatMessages,
            { role: 'user', content: userMessage }
          ],
          context: {
            courseTitle: course?.title || '',
            lessonTitle: currentLesson?.title || '',
            lessonType: currentLesson?.type || '',
            lessonContent: lessonContent,
          }
        }
      });

      if (error) throw error;

      if (data.content) {
        setChatMessages(prev => [...prev, { role: 'assistant', content: data.content }]);
      }
    } catch (error: any) {
      console.error('Chat error:', error);
      toast.error('Ошибка отправки сообщения');
      setChatMessages(prev => [...prev, { 
        role: 'assistant', 
        content: 'Извините, произошла ошибка. Попробуйте позже.' 
      }]);
    } finally {
      setIsChatLoading(false);
    }
  };

  useEffect(() => {
    if (courseId && user) {
      fetchCourseData();
    }
  }, [courseId, user]);

  useEffect(() => {
    // Reset test state when lesson changes
    setTestSubmitted(false);
    setTestScore(null);
    setTestQuestions([]);
    setAnswers({});
    
    if (currentLesson?.type === 'test') {
      fetchTestQuestions(currentLesson.id);
    }
  }, [currentLesson?.id]);

  // Scroll to top on lesson change
  useEffect(() => {
    if (contentRef.current) {
      contentRef.current.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, [currentLessonIndex]);

  // Auto-scroll progress bar to current lesson
  useEffect(() => {
    if (isMobile && lessonButtonRefs.current[currentLessonIndex]) {
      lessonButtonRefs.current[currentLessonIndex]?.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
        inline: 'center'
      });
    }
  }, [currentLessonIndex, isMobile]);

  const fetchCourseData = async () => {
    try {
      const { data: courseData, error: courseError } = await supabase
        .from('courses')
        .select('*')
        .eq('id', courseId)
        .single();

      if (courseError) throw courseError;
      setCourse(courseData);

      const { data: lessonsData, error: lessonsError } = await supabase
        .from('lessons')
        .select('*')
        .eq('course_id', courseId)
        .order('order_index');

      if (lessonsError) throw lessonsError;
      setLessons(lessonsData || []);

      let { data: enrollment, error: enrollmentError } = await supabase
        .from('enrollments')
        .select('*')
        .eq('course_id', courseId)
        .eq('user_id', user!.id)
        .single();

      if (enrollmentError && enrollmentError.code === 'PGRST116') {
        const { data: newEnrollment, error: createError } = await supabase
          .from('enrollments')
          .insert({
            course_id: courseId,
            user_id: user!.id
          })
          .select()
          .single();
        
        if (createError) throw createError;
        enrollment = newEnrollment;
      }

      if (enrollment) {
        setEnrollmentId(enrollment.id);
      }

      // Filter lesson_progress by current course lessons only
      const courseLessonIds = (lessonsData || []).map((l: any) => l.id);
      const { data: progressData } = await supabase
        .from('lesson_progress')
        .select('lesson_id, completed')
        .eq('user_id', user!.id)
        .in('lesson_id', courseLessonIds);

      setLessonProgress(progressData || []);
    } catch (error) {
      console.error('Error fetching course:', error);
      toast.error('Ошибка загрузки курса');
    } finally {
      setLoading(false);
    }
  };

  const fetchTestQuestions = async (lessonId: string) => {
    // Get lesson settings for questions count and passing score
    const { data: lessonData } = await supabase
      .from('lessons')
      .select('test_questions_to_show, test_passing_score')
      .eq('id', lessonId)
      .single();
    
    // test_questions_to_show: null = show all, number = random N questions
    const questionsToShow = (lessonData as any)?.test_questions_to_show ?? null;
    const passingScore = (lessonData as any)?.test_passing_score ?? 60;
    
    console.log('[Test Settings]', { lessonId, questionsToShow, passingScore, lessonData });
    
    setTestQuestionsCount(questionsToShow);
    setTestPassingScore(passingScore);

    // Get all questions for the bank using secure view that hides correct_answer from students
    const { data, error } = await supabase
      .from('test_questions_for_students')
      .select('*')
      .eq('lesson_id', lessonId)
      .order('order_index');

    if (error) {
      console.error('Error fetching questions:', error);
      return;
    }

    const allQuestions = (data || []) as TestQuestion[];
    setAllBankQuestions(allQuestions);

    // Check for previous attempts using server-side edge function
    try {
      const { data: resultsData, error: resultsError } = await supabase.functions.invoke('get-test-results', {
        body: { lesson_id: lessonId }
      });

      if (resultsError) {
        console.error('Error fetching test results:', resultsError);
        // Fall back to first attempt mode
        console.log('[First Attempt] Selecting', questionsToShow, 'random questions from', allQuestions.length, 'total');
        selectRandomQuestions(allQuestions, questionsToShow, []);
        setUsedQuestionIds([]);
        setAnswers({});
        return;
      }

      if (resultsData?.hasAttempt) {
        const { attempt, correctAnswers, usedQuestionIds: allUsedIds } = resultsData;
        setTestSubmitted(true);
        setTestScore({ score: attempt.score, max: attempt.max_score });
        const savedAnswers = attempt.answers as Record<string, number>;
        setAnswers(savedAnswers || {});
        setUsedQuestionIds(allUsedIds || []);

        // Show the questions from the last attempt with correct answers from server
        const shownIds = attempt.shown_question_ids as string[] || [];
        if (shownIds.length > 0) {
          const shownQuestions = allQuestions
            .filter(q => shownIds.includes(q.id))
            .map(q => ({
              ...q,
              correct_answer: correctAnswers[q.id] ?? q.correct_answer
            }));
          setTestQuestions(shownQuestions);
        } else {
          setTestQuestions(allQuestions);
        }
      } else {
        // First attempt - select random questions from bank
        console.log('[First Attempt] Selecting', questionsToShow, 'random questions from', allQuestions.length, 'total');
        selectRandomQuestions(allQuestions, questionsToShow, []);
        setUsedQuestionIds([]);
        setAnswers({});
      }
    } catch (err) {
      console.error('Error loading test results:', err);
      // First attempt - select random questions from bank
      console.log('[First Attempt] Selecting', questionsToShow, 'random questions from', allQuestions.length, 'total');
      selectRandomQuestions(allQuestions, questionsToShow, []);
      setUsedQuestionIds([]);
      setAnswers({});
    }
  };

  const selectRandomQuestions = (allQuestions: TestQuestion[], count: number | null, excludeIds: string[]) => {
    console.log('[selectRandomQuestions] count:', count, 'allQuestions:', allQuestions.length);
    
    // If count is null, show all questions
    if (count === null || count <= 0 || count >= allQuestions.length) {
      console.log('[selectRandomQuestions] Showing all questions (shuffled)');
      const shuffled = [...allQuestions].sort(() => Math.random() - 0.5);
      setTestQuestions(shuffled);
      return;
    }

    // Filter out already used questions if possible
    let availableQuestions = allQuestions.filter(q => !excludeIds.includes(q.id));
    
    // If not enough unused questions, use all questions
    if (availableQuestions.length < count) {
      availableQuestions = allQuestions;
    }
    
    // Shuffle and select
    const shuffled = [...availableQuestions].sort(() => Math.random() - 0.5);
    const selected = shuffled.slice(0, Math.min(count, shuffled.length));
    
    console.log('[selectRandomQuestions] Selected', selected.length, 'questions');
    setTestQuestions(selected);
  };

  // Handle course completion - generate attestation protocol
  const handleCourseCompletion = async (testScoreData?: { score: number; max: number }) => {
    if (!course || !user || !courseId) return;

    try {
      // Get student profile
      const { data: profile } = await supabase
        .from('profiles')
        .select('full_name, organization_id')
        .eq('user_id', user.id)
        .single();

      if (!profile?.organization_id) return;

      // Get organization data
      const { data: org } = await supabase
        .from('organizations')
        .select('id, name, director_name, director_position')
        .eq('id', profile.organization_id)
        .single();

      if (!org) return;

      // Update enrollment as completed
      await supabase
        .from('enrollments')
        .update({ 
          status: 'completed',
          completed_at: new Date().toISOString()
        })
        .eq('id', enrollmentId);

      // Generate attestation protocol
      const protocolName = await generateAttestationProtocol({
        organizationId: org.id,
        organizationName: org.name,
        directorName: org.director_name,
        directorPosition: org.director_position,
        studentName: profile.full_name || 'Слушатель',
        courseName: course.title,
        courseDuration: course.duration,
        completedAt: new Date(),
        testScore: testScoreData?.score,
        testMaxScore: testScoreData?.max,
      });

      if (protocolName) {
        toast.success('Курс завершён! Протокол аттестационной комиссии создан.');
      }
    } catch (error) {
      console.error('Error handling course completion:', error);
    }
  };

  const markLessonComplete = async () => {
    if (!currentLesson || !user) return;

    const isCompleted = lessonProgress.some(
      p => p.lesson_id === currentLesson.id && p.completed
    );

    if (isCompleted) {
      goToNextLesson();
      return;
    }

    const { error } = await supabase
      .from('lesson_progress')
      .upsert({
        lesson_id: currentLesson.id,
        user_id: user.id,
        completed: true,
        completed_at: new Date().toISOString()
      }, { onConflict: 'lesson_id,user_id' });

    if (error) {
      const { error: insertError } = await supabase
        .from('lesson_progress')
        .insert({
          lesson_id: currentLesson.id,
          user_id: user.id,
          completed: true,
          completed_at: new Date().toISOString()
        });

      if (insertError) {
        console.error('Error marking complete:', insertError);
        toast.error('Ошибка сохранения прогресса');
        return;
      }
    }

    setLessonProgress(prev => [
      ...prev.filter(p => p.lesson_id !== currentLesson.id),
      { lesson_id: currentLesson.id, completed: true }
    ]);

    const newProgress = Math.min(Math.round(((completedCount + 1) / lessons.length) * 100), 100);
    await supabase
      .from('enrollments')
      .update({ progress: newProgress })
      .eq('id', enrollmentId);

    // Check if course is now complete
    if (newProgress >= 100) {
      await handleCourseCompletion();
    } else {
      toast.success('Урок завершён!');
    }
    
    goToNextLesson();
  };

  const goToNextLesson = () => {
    const nextIndex = currentLessonIndex + 1;
    if (nextIndex < lessons.length) {
      if (!isLessonAccessible(nextIndex)) {
        toast.error('Сначала завершите текущий урок');
        return;
      }
      setIsTransitioning(true);
      setVideoWatchProgress(0); // Reset video progress when changing lesson
      setTimeout(() => {
        setCurrentLessonIndex(nextIndex);
        setIsTransitioning(false);
      }, 300);
    }
  };

  const goToPrevLesson = () => {
    if (currentLessonIndex > 0) {
      setIsTransitioning(true);
      setVideoWatchProgress(0); // Reset video progress when changing lesson
      setTimeout(() => {
        setCurrentLessonIndex(prev => prev - 1);
        setIsTransitioning(false);
      }, 300);
    }
  };

  // Reset course progress function
  const resetCourseProgress = async () => {
    if (!user || !courseId) return;

    try {
      // Get all lesson IDs for this course
      const lessonIds = lessons.map(l => l.id);
      
      // Delete lesson progress
      if (lessonIds.length > 0) {
        await supabase
          .from('lesson_progress')
          .delete()
          .eq('user_id', user.id)
          .in('lesson_id', lessonIds);
      }

      // Delete test attempts
      await supabase
        .from('test_attempts')
        .delete()
        .eq('user_id', user.id)
        .in('lesson_id', lessonIds);

      // Reset enrollment progress
      await supabase
        .from('enrollments')
        .update({ 
          progress: 0, 
          status: 'active',
          completed_at: null 
        })
        .eq('user_id', user.id)
        .eq('course_id', courseId);

      // Reset local state
      setLessonProgress([]);
      setCurrentLessonIndex(0);
      setTestSubmitted(false);
      setTestScore(null);
      setAnswers({});
      setVideoWatchProgress(0);

      toast.success('Прогресс курса сброшен. Начните прохождение заново!');
    } catch (error) {
      console.error('Error resetting progress:', error);
      toast.error('Ошибка сброса прогресса');
    }
  };

  const goToLesson = (index: number) => {
    if (index !== currentLessonIndex) {
      if (!isLessonAccessible(index)) {
        toast.error('Этот урок пока недоступен. Пройдите предыдущие уроки.');
        return;
      }
      setIsTransitioning(true);
      setVideoWatchProgress(0); // Reset video progress when changing lesson
      setTimeout(() => {
        setCurrentLessonIndex(index);
        setIsTransitioning(false);
      }, 300);
    }
  };

  const submitTest = async () => {
    if (!currentLesson || !user) return;
    
    // Don't submit if no questions loaded
    if (testQuestions.length === 0) {
      toast.error('Нет вопросов для теста. Попробуйте обновить страницу.');
      return;
    }

    const shownIds = testQuestions.map(q => q.id);
    
    // Grade test using server-side edge function (secure - doesn't expose correct answers to client)
    try {
      const { data: gradeResult, error: gradeError } = await supabase.functions.invoke('grade-test', {
        body: {
          lesson_id: currentLesson.id,
          answers,
          shown_question_ids: shownIds
        }
      });

      if (gradeError || !gradeResult) {
        console.error('Error grading test:', gradeError);
        toast.error('Ошибка проверки теста');
        return;
      }

      const { score, maxScore, scorePercent, passed, correctAnswers } = gradeResult;

      // Update testQuestions with correct answers from server for display
      const updatedQuestions = testQuestions.map(q => ({
        ...q,
        correct_answer: correctAnswers[q.id] ?? q.correct_answer
      }));
      setTestQuestions(updatedQuestions);

      setTestSubmitted(true);
      setTestScore({ score, max: maxScore });

      if (passed) {
        // Update local lesson progress (server already updated the database)
        setLessonProgress(prev => [
          ...prev.filter(p => p.lesson_id !== currentLesson.id),
          { lesson_id: currentLesson.id, completed: true }
        ]);

        // Update enrollment progress
        const newProgress = Math.min(Math.round(((completedCount + 1) / lessons.length) * 100), 100);
        await supabase
          .from('enrollments')
          .update({ progress: newProgress })
          .eq('id', enrollmentId);

        // Check if course is now complete
        if (newProgress >= 100) {
          await handleCourseCompletion({ score, max: maxScore });
        } else {
          toast.success(`Тест пройден! ${score}/${maxScore} (${scorePercent}%)`);
        }
      } else {
        toast.error(`Тест не пройден. ${score}/${maxScore} (${scorePercent}%). Нужно: ${testPassingScore}%. Попробуйте снова.`);
      }
    } catch (err) {
      console.error('Error submitting test:', err);
      toast.error('Ошибка отправки теста');
    }
  };

  const retryTest = () => {
    // Select new questions from bank, excluding previously used ones
    const newUsedIds = [...usedQuestionIds, ...testQuestions.map(q => q.id)];
    setUsedQuestionIds(newUsedIds);
    selectRandomQuestions(allBankQuestions, testQuestionsCount, newUsedIds);
    
    setAnswers({});
    setTestSubmitted(false);
    setTestScore(null);
  };

  const getLessonIcon = (type: string) => {
    switch (type) {
      case 'video': return Video;
      case 'test': return ClipboardList;
      case 'audio': return Headphones;
      case 'slider': return Presentation;
      default: return FileText;
    }
  };

  const isLessonCompleted = (lessonId: string) => {
    return lessonProgress.some(p => p.lesson_id === lessonId && p.completed);
  };

  // Check if lesson is accessible based on sequential lessons setting
  const isLessonAccessible = (index: number): boolean => {
    if (!course?.sequential_lessons) return true;
    if (index === 0) return true;
    
    // All previous lessons must be completed
    for (let i = 0; i < index; i++) {
      if (!isLessonCompleted(lessons[i].id)) {
        return false;
      }
    }
    return true;
  };

  // Swipe gesture handlers with haptic feedback
  const triggerHapticFeedback = useCallback(() => {
    if (navigator.vibrate) {
      navigator.vibrate(10);
    }
  }, []);

  const handleSwipeLeft = useCallback(() => {
    if (currentLessonIndex < lessons.length - 1) {
      triggerHapticFeedback();
      goToNextLesson();
    }
  }, [currentLessonIndex, lessons.length, triggerHapticFeedback]);

  const handleSwipeRight = useCallback(() => {
    if (currentLessonIndex > 0) {
      triggerHapticFeedback();
      goToPrevLesson();
    }
  }, [currentLessonIndex, triggerHapticFeedback]);

  const swipeRef = useSwipeGesture<HTMLDivElement>({
    onSwipeLeft: isMobile ? handleSwipeLeft : undefined,
    onSwipeRight: isMobile ? handleSwipeRight : undefined,
    threshold: 60,
    minSwipeDistance: 40,
  });

  // Separate swipe ref for progress bar with lower threshold for quicker response
  const progressBarSwipeRef = useSwipeGesture<HTMLDivElement>({
    onSwipeLeft: isMobile ? handleSwipeLeft : undefined,
    onSwipeRight: isMobile ? handleSwipeRight : undefined,
    threshold: 30,
    minSwipeDistance: 20,
  });

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-12 h-12 animate-spin text-primary mx-auto mb-4" />
          <p className="text-muted-foreground">Загрузка курса...</p>
        </div>
      </div>
    );
  }

  if (!course) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <BookOpen className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
          <h1 className="text-2xl font-bold mb-4">Курс не найден</h1>
          <Button onClick={() => navigate('/student')}>
            Вернуться в кабинет
          </Button>
        </div>
      </div>
    );
  }

  // Sidebar content component for reuse
  const SidebarContent = ({ onNavigate }: { onNavigate?: () => void }) => (
    <>
      <div className="p-4 border-b border-border">
        <Button 
          variant="ghost" 
          size="sm" 
          onClick={() => navigate('/student')}
          className="mb-4 hover:bg-secondary"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Назад
        </Button>
        <h2 className="font-display font-bold text-lg line-clamp-2">{course.title}</h2>
        <div className="mt-4">
          <div className="flex justify-between text-sm text-muted-foreground mb-2">
            <span>Прогресс</span>
            <span className="font-medium">{completedCount}/{lessons.length}</span>
          </div>
          <Progress value={progressPercent} className="h-2" />
        </div>
      </div>
      
      <ScrollArea className="flex-1">
        <div className="p-2 space-y-1">
          {lessons.map((lesson, index) => {
            const Icon = getLessonIcon(lesson.type);
            const completed = isLessonCompleted(lesson.id);
            const isCurrent = index === currentLessonIndex;
            const isAccessible = isLessonAccessible(index);
            
            return (
              <button
                key={lesson.id}
                onClick={() => { goToLesson(index); onNavigate?.(); }}
                disabled={!isAccessible}
                className={cn(
                  "w-full flex items-center gap-3 p-3 rounded-xl text-left transition-all duration-200",
                  isCurrent 
                    ? "bg-primary/10 text-primary shadow-sm" 
                    : isAccessible 
                      ? "hover:bg-muted" 
                      : "opacity-50 cursor-not-allowed"
                )}
              >
                {completed ? (
                  <div className="w-8 h-8 rounded-full bg-sigma-green/10 flex items-center justify-center shrink-0">
                    <CheckCircle2 className="w-5 h-5 text-sigma-green" />
                  </div>
                ) : !isAccessible ? (
                  <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center shrink-0">
                    <Lock className="w-4 h-4 text-muted-foreground" />
                  </div>
                ) : (
                  <div className={cn(
                    "w-8 h-8 rounded-full flex items-center justify-center shrink-0",
                    isCurrent ? "bg-primary/10" : "bg-muted"
                  )}>
                    <Circle className={cn("w-5 h-5", isCurrent ? "text-primary" : "text-muted-foreground")} />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium line-clamp-2">{lesson.title}</div>
                  <div className="flex items-center gap-1 text-xs text-muted-foreground mt-1">
                    <Icon className="w-3 h-3" />
                    {lesson.type === 'text' && 'Текст'}
                    {lesson.type === 'video' && 'Видео'}
                    {lesson.type === 'test' && 'Тест'}
                    {lesson.type === 'audio' && 'Аудио'}
                    {!isAccessible && <span className="ml-1">• Заблокировано</span>}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </ScrollArea>

      {/* Sidebar footer with stats and reset button */}
      <div className="p-4 border-t border-border space-y-3">
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <div className="flex items-center gap-1">
            <Clock className="w-4 h-4" />
            <span>{lessons.length} уроков</span>
          </div>
          <div className="flex items-center gap-1">
            <Trophy className="w-4 h-4 text-sigma-green" />
            <span>{completedCount} пройдено</span>
          </div>
        </div>
        
        {/* Reset progress button */}
        {completedCount > 0 && (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline" size="sm" className="w-full text-muted-foreground">
                <RotateCcw className="w-4 h-4 mr-2" />
                Сбросить прогресс
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Сбросить прогресс курса?</AlertDialogTitle>
                <AlertDialogDescription>
                  Все результаты тестов и отметки о прохождении уроков будут удалены. 
                  Вам придётся пройти курс заново с самого начала.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Отмена</AlertDialogCancel>
                <AlertDialogAction onClick={resetCourseProgress}>
                  Сбросить
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
      </div>
    </>
  );

  return (
    <div className="h-screen bg-background flex overflow-hidden">
      {/* Desktop Sidebar */}
      {!isMobile && (
        <aside className="w-80 bg-card border-r border-border flex flex-col h-screen sticky top-0 shrink-0">
          <SidebarContent />
        </aside>
      )}

      {/* Mobile Sidebar Sheet */}
      {isMobile && (
        <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
          <SheetContent side="left" className="w-[85%] max-w-sm p-0 flex flex-col">
            <SidebarContent onNavigate={() => setSidebarOpen(false)} />
          </SheetContent>
        </Sheet>
      )}

      {/* Main content */}
      <main className="flex-1 flex flex-col h-screen overflow-hidden">
        {/* Header */}
        <header className={cn(
          "border-b border-border bg-card flex items-center justify-between shrink-0 sticky top-0 z-10",
          isMobile ? "px-3 py-3" : "px-6 py-4"
        )}>
          <div className="flex items-center gap-2 md:gap-4 flex-1 min-w-0">
            {/* Mobile menu button */}
            {isMobile && (
              <Button 
                variant="ghost" 
                size="icon"
                onClick={() => setSidebarOpen(true)}
                className="shrink-0"
              >
                <List className="w-5 h-5" />
              </Button>
            )}
            {!isMobile && (
              <>
                <SigmaLogo size="sm" />
                <span className="text-muted-foreground">|</span>
              </>
            )}
            <span className={cn(
              "font-medium truncate",
              isMobile ? "text-sm max-w-[140px]" : "max-w-md"
            )}>{currentLesson?.title}</span>
          </div>
          <div className="flex items-center gap-1 md:gap-2 shrink-0">
            {/* Text-to-speech button */}
            {(currentLesson?.type === 'text' || currentLesson?.type === 'test') && (
              <>
                <Button 
                  variant={isSpeaking ? "default" : "outline"}
                  size="sm"
                  onClick={speakText}
                  disabled={elevenLabsTTS.isLoading}
                  className={cn(
                    "rounded-lg",
                    isSpeaking && "bg-primary text-primary-foreground",
                    isMobile && "h-8 w-8 p-0"
                  )}
                  title={isSpeaking ? "Остановить озвучивание" : "Озвучить текст"}
                >
                  {elevenLabsTTS.isLoading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : isSpeaking ? (
                    <Square className="w-4 h-4" />
                  ) : (
                    <Volume2 className="w-4 h-4" />
                  )}
                  {!isMobile && (
                    <span className="ml-1">{elevenLabsTTS.isLoading ? 'Загрузка...' : isSpeaking ? 'Стоп' : 'Озвучить'}</span>
                  )}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setTtsSettingsOpen(true)}
                  className={cn("rounded-lg", isMobile && "h-8 w-8 p-0")}
                  title="Настройки озвучивания"
                >
                  <Settings2 className="w-4 h-4" />
                </Button>
              </>
            )}
            <Button 
              variant="outline" 
              size="sm"
              disabled={currentLessonIndex === 0}
              onClick={goToPrevLesson}
              className={cn("rounded-lg", isMobile && "h-8 w-8 p-0")}
            >
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <div className={cn(
              "bg-secondary rounded-lg text-sm",
              isMobile ? "px-2 py-1" : "px-3 py-1"
            )}>
              <span className="font-medium">{currentLessonIndex + 1}</span>
              <span className="text-muted-foreground">/{lessons.length}</span>
            </div>
            <Button 
              variant="outline" 
              size="sm"
              disabled={currentLessonIndex === lessons.length - 1}
              onClick={goToNextLesson}
              className={cn("rounded-lg", isMobile && "h-8 w-8 p-0")}
            >
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </header>

        {/* Lesson content with animation and swipe gestures */}
        <ScrollArea className="flex-1" ref={contentRef}>
          <div 
            ref={swipeRef}
            className={cn(
              "max-w-4xl mx-auto transition-all duration-300 min-h-full",
              isMobile ? "p-4" : "p-8",
              isTransitioning ? "opacity-0 translate-y-4" : "opacity-100 translate-y-0"
            )}
          >
            {currentLesson?.type === 'text' && (
              <div className="space-y-4 md:space-y-6 animate-fade-in">
                {/* Lesson header */}
                <div className="flex items-center gap-3 pb-3 md:pb-4 border-b border-border">
                  <div className={cn(
                    "rounded-xl bg-primary/10 flex items-center justify-center shrink-0",
                    isMobile ? "w-8 h-8" : "w-10 h-10"
                  )}>
                    <FileText className={cn(isMobile ? "w-4 h-4" : "w-5 h-5", "text-primary")} />
                  </div>
                  <div className="min-w-0">
                    <h1 className={cn(
                      "font-display font-bold line-clamp-2",
                      isMobile ? "text-lg" : "text-2xl"
                    )}>{currentLesson.title}</h1>
                    <p className="text-xs md:text-sm text-muted-foreground">Урок {currentLessonIndex + 1}</p>
                  </div>
                </div>

                {/* Block content or raw content */}
                {contentBlocks.length > 0 ? (
                  <BlockRenderer blocks={contentBlocks} />
                ) : (
                  <div className="prose prose-lg max-w-none dark:prose-invert">
                    <div 
                      className="whitespace-pre-wrap"
                      dangerouslySetInnerHTML={{ 
                        __html: currentLesson.content?.replace(/\n/g, '<br/>') || '' 
                      }}
                    />
                  </div>
                )}
              </div>
            )}

            {currentLesson?.type === 'video' && (
              <div className="space-y-4 md:space-y-6 animate-fade-in">
                {/* Video header */}
                <div className="flex items-center gap-3 pb-3 md:pb-4 border-b border-border">
                  <div className={cn(
                    "rounded-xl bg-red-500/10 flex items-center justify-center shrink-0",
                    isMobile ? "w-8 h-8" : "w-10 h-10"
                  )}>
                    <Video className={cn(isMobile ? "w-4 h-4" : "w-5 h-5", "text-red-500")} />
                  </div>
                  <div className="min-w-0">
                    <h1 className={cn(
                      "font-display font-bold line-clamp-2",
                      isMobile ? "text-lg" : "text-2xl"
                    )}>{currentLesson.title}</h1>
                    <p className="text-xs md:text-sm text-muted-foreground">Видеоурок {currentLessonIndex + 1}</p>
                  </div>
                </div>

                <div className="aspect-video bg-muted rounded-2xl flex items-center justify-center overflow-hidden shadow-lg">
                  {isVideoProgressLoading ? (
                    <div className="flex items-center justify-center">
                      <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
                    </div>
                  ) : currentLesson.content ? (
                    <VideoPlayerInline 
                      key={`${currentLesson.id}-${course?.allow_video_seek !== false ? "seek" : "no-seek"}`}
                      content={currentLesson.content} 
                      allowSeek={course?.allow_video_seek !== false}
                      userId={user?.id}
                      lessonId={currentLesson.id}
                      savedPosition={savedPosition}
                      onSavePosition={saveVideoPosition}
                      onProgressChange={(progress) => setVideoWatchProgress(progress)}
                      onVideoComplete={async () => {
                        // Auto-complete video lesson when 90% watched
                        if (!isLessonCompleted(currentLesson.id) && user) {
                          await supabase
                            .from('lesson_progress')
                            .upsert({
                              lesson_id: currentLesson.id,
                              user_id: user.id,
                              completed: true,
                              completed_at: new Date().toISOString()
                            }, { onConflict: 'lesson_id,user_id' });
                          
                          setLessonProgress(prev => [
                            ...prev.filter(p => p.lesson_id !== currentLesson.id),
                            { lesson_id: currentLesson.id, completed: true }
                          ]);
                          
                          const newProgress = Math.min(Math.round(((completedCount + 1) / lessons.length) * 100), 100);
                          await supabase
                            .from('enrollments')
                            .update({ progress: newProgress })
                            .eq('id', enrollmentId);
                          
                          toast.success('Видео просмотрено!');
                        }
                      }}
                    />
                  ) : (
                    <div className="text-center text-muted-foreground">
                      <Video className="w-16 h-16 mx-auto mb-4" />
                      <p>Видео не загружено</p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {currentLesson?.type === 'audio' && (
              <div className="space-y-4 md:space-y-6 animate-fade-in">
                {/* Audio header */}
                <div className="flex items-center gap-3 pb-3 md:pb-4 border-b border-border">
                  <div className={cn(
                    "rounded-xl bg-green-500/10 flex items-center justify-center shrink-0",
                    isMobile ? "w-8 h-8" : "w-10 h-10"
                  )}>
                    <Headphones className={cn(isMobile ? "w-4 h-4" : "w-5 h-5", "text-green-500")} />
                  </div>
                  <div className="min-w-0">
                    <h1 className={cn(
                      "font-display font-bold line-clamp-2",
                      isMobile ? "text-lg" : "text-2xl"
                    )}>{currentLesson.title}</h1>
                    <p className="text-xs md:text-sm text-muted-foreground">Аудиолекция {currentLessonIndex + 1}</p>
                  </div>
                </div>

                <div className={cn(
                  "bg-card rounded-2xl border border-border",
                  isMobile ? "p-4" : "p-6"
                )}>
                  {currentLesson.content && currentLesson.content.startsWith('http') ? (
                    <audio controls className="w-full">
                      <source src={currentLesson.content} type="audio/mpeg" />
                      <source src={currentLesson.content} type="audio/wav" />
                      <source src={currentLesson.content} type="audio/ogg" />
                      Ваш браузер не поддерживает аудио.
                    </audio>
                  ) : (
                    <div className="text-center text-muted-foreground py-8">
                      <Headphones className={cn(isMobile ? "w-12 h-12" : "w-16 h-16", "mx-auto mb-4 opacity-50")} />
                      <p>Аудио не загружено</p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {currentLesson?.type === 'test' && (
              <div className="space-y-4 md:space-y-6 animate-fade-in">
                {/* Test header */}
                <div className="flex items-center gap-3 pb-3 md:pb-4 border-b border-border">
                  <div className={cn(
                    "rounded-xl bg-sigma-purple/10 flex items-center justify-center shrink-0",
                    isMobile ? "w-8 h-8" : "w-10 h-10"
                  )}>
                    <ClipboardList className={cn(isMobile ? "w-4 h-4" : "w-5 h-5", "text-sigma-purple")} />
                  </div>
                  <div className="min-w-0">
                    <h1 className={cn(
                      "font-display font-bold line-clamp-2",
                      isMobile ? "text-lg" : "text-2xl"
                    )}>{currentLesson.title}</h1>
                    <p className="text-xs md:text-sm text-muted-foreground">
                      Тестирование • {testQuestions.length}{allBankQuestions.length > testQuestions.length ? ` из ${allBankQuestions.length}` : ''} вопросов • Проходной балл: {testPassingScore}%
                    </p>
                  </div>
                </div>

                {testScore && (() => {
                  const isPassed = testScore.max > 0 && ((testScore.score / testScore.max) * 100 >= testPassingScore);
                  const percentage = testScore.max > 0 ? Math.round(testScore.score / testScore.max * 100) : 0;
                  
                  return (
                    <div className={cn(
                      "p-6 rounded-2xl border transition-all",
                      isPassed 
                        ? "bg-sigma-green/10 border-sigma-green/20" 
                        : "bg-destructive/10 border-destructive/20"
                    )}>
                      <div className="flex items-center gap-4">
                        <div className={cn(
                          "w-16 h-16 rounded-full flex items-center justify-center",
                          isPassed 
                            ? "bg-sigma-green/20" 
                            : "bg-destructive/20"
                        )}>
                          <Trophy className={cn(
                            "w-8 h-8",
                            isPassed 
                              ? "text-sigma-green" 
                              : "text-destructive"
                          )} />
                        </div>
                        <div>
                          <h3 className="text-xl font-bold">
                            {isPassed ? 'Тест пройден!' : 'Тест не пройден'}
                          </h3>
                          <p className="text-muted-foreground">
                            Результат: {testScore.score} из {testScore.max} ({percentage}%)
                            {!isPassed && <span className="ml-1">• Нужно: {testPassingScore}%</span>}
                          </p>
                        </div>
                      </div>
                      {!isPassed && (
                        <div className="mt-4 flex items-center gap-3">
                          <Button onClick={retryTest}>
                            <Sparkles className="w-4 h-4 mr-2" />
                            Попробовать снова
                          </Button>
                          {allBankQuestions.length > testQuestions.length && (
                            <p className="text-xs text-muted-foreground">
                              Будут выбраны новые случайные вопросы
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })()}

                {!testSubmitted && testQuestions.map((question, qIndex) => (
                  <div 
                    key={question.id} 
                    className="bg-card rounded-2xl p-6 border border-border shadow-sm hover:shadow-md transition-shadow"
                    style={{ animationDelay: `${qIndex * 100}ms` }}
                  >
                    <h3 className="font-semibold mb-4 flex items-center gap-2">
                      <span className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-sm font-bold text-primary">
                        {qIndex + 1}
                      </span>
                      {question.question}
                    </h3>
                    {(question as any).image_url && (
                      <img src={(question as any).image_url} alt="К вопросу" className="max-h-64 rounded-lg border border-border object-contain mb-4" />
                    )}
                    <div className="space-y-2">
                      {(Array.isArray(question.options) ? question.options : []).map((option: unknown, oIndex: number) => (
                        <div 
                          key={oIndex}
                          onClick={() => setAnswers(prev => ({ ...prev, [question.id]: oIndex }))}
                          className={cn(
                            "flex items-center gap-3 p-4 rounded-xl border cursor-pointer transition-all",
                            answers[question.id] === oIndex 
                              ? "border-primary bg-primary/5 shadow-sm" 
                              : "border-border hover:bg-muted hover:border-primary/30"
                          )}
                        >
                          <div className={cn(
                            "w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors",
                            answers[question.id] === oIndex 
                              ? "border-primary bg-primary" 
                              : "border-muted-foreground"
                          )}>
                            {answers[question.id] === oIndex && (
                              <div className="w-2 h-2 rounded-full bg-white" />
                            )}
                          </div>
                          <span>{getOptionText(option)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}

                {testSubmitted && testQuestions.map((question, qIndex) => {
                  const userAnswer = answers[question.id];
                  const isAnswerCorrect = userAnswer === question.correct_answer;
                  
                  return (
                    <div key={question.id} className="bg-card rounded-2xl p-6 border border-border">
                      <h3 className="font-semibold mb-4 flex items-center gap-2">
                        <span className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-sm font-bold text-primary">
                          {qIndex + 1}
                        </span>
                        {question.question}
                      </h3>
                      {(question as any).image_url && (
                        <img src={(question as any).image_url} alt="К вопросу" className="max-h-64 rounded-lg border border-border object-contain mb-4" />
                      )}
                      <div className="space-y-2">
                        {(Array.isArray(question.options) ? question.options : []).map((option: unknown, oIndex: number) => {
                          const isSelected = answers[question.id] === oIndex;
                          const isCorrect = question.correct_answer === oIndex;
                          
                          return (
                            <div 
                              key={oIndex}
                              className={cn(
                                "flex items-center gap-3 p-4 rounded-xl border",
                                isCorrect 
                                  ? "border-sigma-green bg-sigma-green/10" 
                                  : isSelected 
                                    ? "border-destructive bg-destructive/10" 
                                    : "border-border"
                              )}
                            >
                              <span className={isCorrect ? "text-sigma-green" : isSelected ? "text-destructive" : ""}>
                                {getOptionText(option)}
                              </span>
                              {isCorrect && <CheckCircle2 className="w-5 h-5 text-sigma-green ml-auto" />}
                            </div>
                          );
                        })}
                      </div>
                      
                      {/* Show explanation for wrong answers */}
                      {!isAnswerCorrect && question.explanation && (
                        <div className="mt-4 p-4 rounded-xl bg-amber-500/10 border border-amber-500/30">
                          <div className="flex items-start gap-3">
                            <div className="w-6 h-6 rounded-full bg-amber-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                              <span className="text-amber-600 text-sm">💡</span>
                            </div>
                            <div>
                              <p className="font-medium text-amber-700 dark:text-amber-400 mb-1">Пояснение:</p>
                              <p className="text-sm text-foreground">{question.explanation}</p>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {currentLesson?.type === 'slider' && (
              <SliderLessonViewer content={currentLesson.content} title={currentLesson.title} lessonIndex={currentLessonIndex} isMobile={isMobile} />
            )}
          </div>
        </ScrollArea>

        {/* Mobile Lesson Progress Bar */}
        {isMobile && (
          <div 
            ref={progressBarSwipeRef}
            className="border-t border-border bg-muted/30 px-3 py-2 shrink-0 relative touch-pan-y"
          >
            {/* Tooltip */}
            {tooltipLesson && (
              <div 
                className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-popover text-popover-foreground text-xs rounded-lg shadow-lg border border-border animate-fade-in z-50 max-w-[200px] text-center"
                style={{
                  animation: 'fade-in 0.2s ease-out'
                }}
              >
                <div className="font-medium">Урок {tooltipLesson.index + 1}</div>
                <div className="text-muted-foreground line-clamp-2">{tooltipLesson.title}</div>
                <div className="absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-full">
                  <div className="w-0 h-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-t-[6px] border-t-border" />
                </div>
              </div>
            )}
            
            <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-hide">
              {lessons.map((lesson, index) => {
                const isCompleted = isLessonCompleted(lesson.id);
                const isCurrent = index === currentLessonIndex;
                
                const handleTouchStart = () => {
                  longPressTimeoutRef.current = setTimeout(() => {
                    triggerHapticFeedback();
                    setTooltipLesson({ index, title: lesson.title });
                  }, 400);
                };
                
                const handleTouchEnd = () => {
                  if (longPressTimeoutRef.current) {
                    clearTimeout(longPressTimeoutRef.current);
                    longPressTimeoutRef.current = null;
                  }
                  // Hide tooltip after a delay
                  setTimeout(() => setTooltipLesson(null), 1500);
                };
                
                const handleClick = () => {
                  if (!tooltipLesson) {
                    triggerHapticFeedback();
                    goToLesson(index);
                  }
                  setTooltipLesson(null);
                };
                
                return (
                  <button
                    key={lesson.id}
                    ref={(el) => { lessonButtonRefs.current[index] = el; }}
                    onClick={handleClick}
                    onTouchStart={handleTouchStart}
                    onTouchEnd={handleTouchEnd}
                    onTouchCancel={handleTouchEnd}
                    className={cn(
                      "flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-xs font-medium",
                      "transition-all duration-300 ease-out",
                      "active:scale-90 active:opacity-70",
                      isCurrent && "ring-2 ring-primary ring-offset-2 ring-offset-background scale-110",
                      isCompleted 
                        ? "bg-sigma-green text-white" 
                        : isCurrent 
                          ? "bg-primary text-primary-foreground" 
                          : "bg-muted text-muted-foreground hover:bg-muted-foreground/20"
                    )}
                    style={{
                      transform: isCurrent ? 'scale(1.1)' : 'scale(1)',
                      transition: 'all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)'
                    }}
                  >
                    {isCompleted ? (
                      <CheckCircle2 className={cn(
                        "w-4 h-4 transition-transform duration-300",
                        isCurrent && "animate-pulse"
                      )} />
                    ) : (
                      <span className={cn(
                        "transition-transform duration-300",
                        isCurrent && "font-bold"
                      )}>
                        {index + 1}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
            <div className="flex items-center justify-between mt-2 text-xs text-muted-foreground">
              <span className="transition-all duration-300">Урок {currentLessonIndex + 1} из {lessons.length}</span>
              <span className="transition-all duration-300">{Math.round(progressPercent)}% пройдено</span>
            </div>
          </div>
        )}

        {/* Footer */}
        <footer className={cn(
          "border-t border-border bg-card flex justify-between items-center shrink-0",
          isMobile ? "px-3 py-3" : "px-6 py-4"
        )}>
          <div className="text-sm text-muted-foreground">
            {isLessonCompleted(currentLesson?.id || '') && (
              <span className={cn(
                "flex items-center gap-2 text-sigma-green font-medium",
                isMobile && "text-xs"
              )}>
                <CheckCircle2 className="w-4 h-4" />
                {!isMobile && "Урок завершён"}
              </span>
            )}
          </div>
          <div className="flex gap-2 md:gap-3">
            {currentLesson?.type === 'test' && !testSubmitted && (
              <Button 
                onClick={submitTest}
                disabled={Object.keys(answers).length !== testQuestions.length}
                className={cn("btn-gradient rounded-xl", isMobile && "text-sm px-3")}
              >
                {isMobile ? "Отправить" : "Отправить ответы"}
              </Button>
            )}
            {currentLesson?.type !== 'test' && currentLesson?.type !== 'video' && !isLessonCompleted(currentLesson?.id || '') && (
              <Button onClick={markLessonComplete} className={cn("btn-gradient rounded-xl", isMobile && "text-sm px-3")}>
                {isMobile ? "Завершить" : "Завершить урок"}
                <ChevronRight className="w-4 h-4 ml-1 md:ml-2" />
              </Button>
            )}
            {currentLesson?.type === 'video' && !isLessonCompleted(currentLesson?.id || '') && videoWatchProgress >= 90 && (
              <Button onClick={markLessonComplete} className={cn("btn-gradient rounded-xl", isMobile && "text-sm px-3")}>
                {isMobile ? "Завершить" : "Завершить урок"}
                <ChevronRight className="w-4 h-4 ml-1 md:ml-2" />
              </Button>
            )}
            {currentLesson?.type === 'video' && !isLessonCompleted(currentLesson?.id || '') && videoWatchProgress < 90 && (
              <div className="text-xs text-muted-foreground flex items-center gap-2">
                <Video className="w-4 h-4" />
                Просмотрите видео полностью ({Math.round(videoWatchProgress)}%)
              </div>
            )}
            {isLessonCompleted(currentLesson?.id || '') && currentLessonIndex < lessons.length - 1 && (
              <Button onClick={goToNextLesson} className={cn("btn-gradient rounded-xl", isMobile && "text-sm px-3")}>
                {isMobile ? "Далее" : "Следующий урок"}
                <ChevronRight className="w-4 h-4 ml-1 md:ml-2" />
              </Button>
            )}
            {isLessonCompleted(currentLesson?.id || '') && currentLessonIndex === lessons.length - 1 && (
              <Button onClick={() => navigate('/student')} className={cn("btn-gradient rounded-xl", isMobile && "text-sm px-3")}>
                <Trophy className="w-4 h-4 mr-1 md:mr-2" />
                {isMobile ? "Готово!" : "Курс завершён!"}
              </Button>
            )}
          </div>
        </footer>
      </main>

      {/* AI Assistant Button */}
      <Button
        onClick={() => setIsChatOpen(true)}
        className={cn(
          "fixed shadow-lg z-40",
          "bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70",
          "transition-transform hover:scale-105 rounded-full",
          isMobile 
            ? "bottom-20 right-4 w-12 h-12" 
            : "bottom-24 right-6 w-14 h-14",
          isChatOpen && "hidden"
        )}
      >
        <MessageCircle className={cn(isMobile ? "w-5 h-5" : "w-6 h-6")} />
      </Button>

      {/* AI Chat Panel */}
      {isChatOpen && (
        <div className={cn(
          "fixed bg-card border border-border shadow-2xl z-50 flex flex-col overflow-hidden animate-fade-in",
          isMobile 
            ? "inset-0 rounded-none" 
            : "bottom-24 right-6 w-96 h-[500px] rounded-2xl"
        )}>
          {/* Chat Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/30">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-gradient-to-r from-primary to-primary/60 flex items-center justify-center">
                <Sparkles className="w-4 h-4 text-white" />
              </div>
              <div>
                <h3 className="font-semibold text-sm">ИИ-помощник</h3>
                <p className="text-xs text-muted-foreground">Задайте вопрос по курсу</p>
              </div>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => setIsChatOpen(false)}
            >
              <X className="w-4 h-4" />
            </Button>
          </div>

          {/* Chat Messages */}
          <div 
            ref={chatScrollRef}
            className="flex-1 overflow-y-auto p-4 space-y-4"
          >
            {chatMessages.length === 0 && (
              <div className="text-center py-8">
                <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
                  <MessageCircle className="w-8 h-8 text-primary" />
                </div>
                <p className="text-sm text-muted-foreground">
                  Привет! Я помогу разобраться с материалом курса. Задайте любой вопрос.
                </p>
              </div>
            )}
            
            {chatMessages.map((msg, idx) => (
              <div
                key={idx}
                className={cn(
                  "flex",
                  msg.role === 'user' ? "justify-end" : "justify-start"
                )}
              >
                <div
                  className={cn(
                    "max-w-[80%] rounded-2xl px-4 py-2 text-sm",
                    msg.role === 'user'
                      ? "bg-primary text-primary-foreground rounded-br-md"
                      : "bg-muted rounded-bl-md"
                  )}
                >
                  <p className="whitespace-pre-wrap">{msg.content}</p>
                </div>
              </div>
            ))}

            {isChatLoading && (
              <div className="flex justify-start">
                <div className="bg-muted rounded-2xl rounded-bl-md px-4 py-3">
                  <div className="flex items-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span className="text-sm text-muted-foreground">Печатает...</span>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Chat Input */}
          <div className={cn(
            "border-t border-border bg-background",
            isMobile ? "p-3 pb-safe" : "p-3"
          )}>
            <div className="flex gap-2">
              <input
                type="text"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && sendChatMessage()}
                placeholder="Напишите сообщение..."
                className="flex-1 px-4 py-2 text-sm border border-border rounded-xl bg-background focus:outline-none focus:ring-2 focus:ring-primary/20"
                disabled={isChatLoading}
              />
              <Button
                onClick={sendChatMessage}
                disabled={!chatInput.trim() || isChatLoading}
                size="icon"
                className="rounded-xl"
              >
                <Send className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* TTS Settings Dialog */}
      <TTSSettingsDialog
        open={ttsSettingsOpen}
        onOpenChange={setTtsSettingsOpen}
        settings={ttsSettings}
        onSettingsChange={setTtsSettings}
      />
    </div>
  );
};


function parseContentToBlocks(content: string): ContentBlock[] {
  // Try to parse as JSON blocks first
  try {
    const parsed = JSON.parse(content);
    if (Array.isArray(parsed) && parsed.every(item => item.type && item.id)) {
      return parsed;
    }
  } catch {
    // Not JSON, return empty to use raw content
  }
  return [];
}

export default CourseLearning;
