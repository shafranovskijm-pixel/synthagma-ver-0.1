import { useEffect, useRef, useState } from "react";
import { Play, Download } from "lucide-react";

interface HlsVideoPlayerProps {
  src: string;
  className?: string;
  controls?: boolean;
  preload?: "none" | "metadata" | "auto";
  controlsList?: string;
  onError?: () => void;
}

const isMpegTsUrl = (url: string): boolean => {
  try {
    const u = new URL(url);
    const path = u.pathname.toLowerCase();
    return /(\.ts|\.m2ts|\.mts|\.mpg|\.mpeg|\.m3u8)(\?|$)/.test(path);
  } catch {
    return /(\.ts|\.m2ts|\.mts|\.mpg|\.mpeg|\.m3u8)(\?|$)/i.test(url);
  }
};

const isHlsManifest = (url: string): boolean => /\.m3u8(\?|$)/i.test(url);

/**
 * Universal HTML5 video player that adds MPEG-TS / HLS support via hls.js
 * for browsers that can't decode `.ts` natively (Chrome / Firefox / Edge).
 *
 * - Safari: native playback (`<video src=…>`).
 * - Chromium / Firefox + .ts/.mts/.m2ts/.m3u8: hls.js.
 * - Other formats (mp4, webm…): native playback.
 */
export function HlsVideoPlayer({
  src,
  className = "w-full h-full bg-black",
  controls = true,
  preload = "metadata",
  controlsList = "nodownload",
  onError,
}: HlsVideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [fatal, setFatal] = useState(false);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !src) return;

    setFatal(false);

    const needsHls = isMpegTsUrl(src);
    if (!needsHls) {
      // Plain mp4/webm — native playback
      video.src = src;
      return;
    }

    // Safari can play HLS / MPEG-TS natively
    const canPlayNative =
      video.canPlayType("application/vnd.apple.mpegurl") !== "" ||
      video.canPlayType("video/mp2t") !== "";

    if (canPlayNative && !isHlsManifest(src)) {
      video.src = src;
      return;
    }

    let hls: any = null;
    let cancelled = false;

    (async () => {
      try {
        const Hls = (await import("hls.js")).default;
        if (cancelled) return;
        if (!Hls.isSupported()) {
          // No MSE → can't play .ts in this browser
          setFatal(true);
          onError?.();
          return;
        }
        hls = new Hls({
          enableWorker: true,
          lowLatencyMode: false,
        });

        // hls.js expects an HLS manifest. For a bare .ts/.mts we synthesize a
        // tiny in-memory m3u8 that points to the file as a single segment.
        let manifestUrl = src;
        if (!isHlsManifest(src)) {
          const playlist =
            "#EXTM3U\n" +
            "#EXT-X-VERSION:3\n" +
            "#EXT-X-TARGETDURATION:60\n" +
            "#EXT-X-MEDIA-SEQUENCE:0\n" +
            "#EXT-X-PLAYLIST-TYPE:VOD\n" +
            "#EXTINF:60.0,\n" +
            `${src}\n` +
            "#EXT-X-ENDLIST\n";
          const blob = new Blob([playlist], { type: "application/vnd.apple.mpegurl" });
          manifestUrl = URL.createObjectURL(blob);
        }

        hls.loadSource(manifestUrl);
        hls.attachMedia(video);

        hls.on(Hls.Events.ERROR, (_evt: any, data: any) => {
          if (data?.fatal) {
            console.error("[HlsVideoPlayer] fatal error", data);
            setFatal(true);
            onError?.();
          }
        });
      } catch (err) {
        console.error("[HlsVideoPlayer] init failed", err);
        setFatal(true);
        onError?.();
      }
    })();

    return () => {
      cancelled = true;
      try { hls?.destroy(); } catch {}
    };
  }, [src, onError]);

  if (fatal) {
    return (
      <div className="aspect-video w-full rounded-xl bg-muted flex flex-col items-center justify-center gap-3 p-4">
        <p className="text-sm text-foreground font-medium text-center">
          Браузер не может воспроизвести этот формат видео
        </p>
        <p className="text-xs text-muted-foreground text-center max-w-md">
          Файл .TS / MPEG-TS не поддерживается напрямую. Скачайте файл или загрузите его через «Видеосервис+» — он автоматически перекодирует.
        </p>
        <a
          href={src}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"
        >
          <Download className="w-4 h-4" /> Скачать видео
        </a>
      </div>
    );
  }

  return (
    <video
      ref={videoRef}
      controls={controls}
      preload={preload}
      controlsList={controlsList}
      className={className}
      playsInline
      onError={() => { setFatal(true); onError?.(); }}
    />
  );
}

export { isMpegTsUrl };
