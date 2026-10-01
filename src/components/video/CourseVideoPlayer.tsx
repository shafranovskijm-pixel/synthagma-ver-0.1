import { useEffect, useId, useRef, useState } from 'react';
import { CheckCircle2, ChevronRight, RotateCcw, Video } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SigmaSpinner } from '@/components/ui/SigmaSpinner';
import { cn } from '@/lib/utils';
import { isMpegTsOrHlsUrl } from '@/utils/courseBuilderHelpers';
import { loadKinescopeApi, type KinescopeEvent, type KinescopePlayer } from './kinescopeApi';
import { VideoControls } from './VideoControls';

export interface VideoPlaybackFailure {
  backend: 'native' | 'hls' | 'kinescope';
  stage: string;
  code?: string | number;
  message: string;
}

export interface CourseVideoPlayerProps {
  src: string;
  kinescope?: boolean;
  className?: string;
  controls?: boolean;
  preload?: 'none' | 'metadata' | 'auto';
  allowSeek?: boolean;
  savedPosition?: number;
  onVideoComplete?: () => void;
  onProgressChange?: (progress: number) => void;
  onSavePosition?: (position: number, duration: number) => void;
  onFinishLesson?: () => void;
  onError?: (reason?: VideoPlaybackFailure) => void;
}

// Both backends feed this same surface. State changes never change the media URL.
export function CourseVideoPlayer({ src, kinescope = false, className, controls = true, preload = 'metadata', allowSeek = true,
  savedPosition = 0, onVideoComplete, onProgressChange, onSavePosition, onFinishLesson, onError }: CourseVideoPlayerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const iframeHostRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<KinescopePlayer>();
  const iframeGenerationRef = useRef(0);
  const playerId = `course-video-${useId().replace(/:/g, '')}`;
  const callbacks = useRef({ onVideoComplete, onProgressChange, onSavePosition, onError, allowSeek });
  callbacks.current = { onVideoComplete, onProgressChange, onSavePosition, onError, allowSeek };
  const positionRef = useRef(savedPosition);
  const durationRef = useRef(0);
  const maxWatchedRef = useRef(savedPosition);
  const restoredRef = useRef(false);
  const completedRef = useRef(false);
  const lastUpdateRef = useRef(Date.now());
  // Progress can arrive from the database before metadata does. Once playback
  // starts, parent save callbacks must not move the active player backwards.
  if (!restoredRef.current && positionRef.current === 0 && savedPosition > 0) {
    positionRef.current = savedPosition;
    maxWatchedRef.current = Math.max(maxWatchedRef.current, savedPosition);
  }
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [volume, setVolume] = useState(1);
  const [rate, setRate] = useState(1);
  const [ended, setEnded] = useState(false);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(preload !== 'none');
  const [timedOut, setTimedOut] = useState(false);
  const [ready, setReady] = useState(!kinescope);
  const [reloadKey, setReloadKey] = useState(0);
  const [fullscreen, setFullscreen] = useState(false);
  const [pseudoFullscreen, setPseudoFullscreen] = useState(false);
  const [controlsVisible, setControlsVisible] = useState(true);
  const hideTimer = useRef<ReturnType<typeof setTimeout>>();

  const showControls = () => {
    setControlsVisible(true);
    clearTimeout(hideTimer.current);
    if (playing) hideTimer.current = setTimeout(() => setControlsVisible(false), 3000);
  };
  useEffect(() => () => clearTimeout(hideTimer.current), []);
  useEffect(() => {
    if (!playing) { clearTimeout(hideTimer.current); setControlsVisible(true); }
    else { hideTimer.current = setTimeout(() => setControlsVisible(false), 3000); }
    return () => clearTimeout(hideTimer.current);
  }, [playing]);
  useEffect(() => {
    setTimedOut(false);
    if (!loading) return;
    const timeout = setTimeout(() => setTimedOut(true), 15000);
    return () => clearTimeout(timeout);
  }, [loading, reloadKey]);
  useEffect(() => {
    const changed = () => setFullscreen(!!document.fullscreenElement &&
      (document.fullscreenElement === containerRef.current || !!containerRef.current?.contains(document.fullscreenElement)));
    document.addEventListener('fullscreenchange', changed);
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') setPseudoFullscreen(false); };
    document.addEventListener('keydown', escape);
    return () => { document.removeEventListener('fullscreenchange', changed); document.removeEventListener('keydown', escape); };
  }, []);

  const fail = (reason?: unknown, stage = 'api-call', backend: VideoPlaybackFailure['backend'] = kinescope ? 'kinescope' : 'native') => {
    let message = reason instanceof Error ? reason.message : typeof reason === 'string' ? reason :
      reason && typeof reason === 'object' && 'message' in reason && typeof reason.message === 'string' ? reason.message : 'Playback failed without a provider error message';
    // QA receives diagnostics, never video authorization tokens or full URLs.
    message = message.replace(/https?:\/\/[^\s)'"<>]+/g, value => { try { const url = new URL(value); return `${url.origin}${url.pathname}`; } catch { return '[URL]'; } }).slice(0, 240);
    const code = reason && typeof reason === 'object' && 'code' in reason ? String(reason.code).slice(0, 80) : undefined;
    setError(true); setLoading(false); callbacks.current.onError?.({ backend, stage, code, message });
  };
  const nativeError = () => {
    const error = videoRef.current?.error;
    fail(error ? Object.assign(new Error(error.message || `HTML5 MediaError ${error.code}`), { code: error.code }) : 'HTML5 media error with no MediaError code', 'media');
  };
  const updateDuration = (value: number) => {
    if (!Number.isFinite(value) || value <= 0) return;
    durationRef.current = value;
    setDuration(value);
  };
  const updateTime = (value: number) => {
    if (!Number.isFinite(value) || value < 0) return;
    const elapsed = Math.max(0, (Date.now() - lastUpdateRef.current) / 1000);
    lastUpdateRef.current = Date.now();
    if (!callbacks.current.allowSeek && value > maxWatchedRef.current + elapsed + 2) {
      if (kinescope) playerRef.current?.seekTo(maxWatchedRef.current).catch(fail);
      else if (videoRef.current) videoRef.current.currentTime = maxWatchedRef.current;
      return;
    }
    maxWatchedRef.current = Math.max(maxWatchedRef.current, value);
    positionRef.current = value;
    setTime(value);
    const length = durationRef.current;
    if (length <= 0) return;
    const progress = Math.min(100, value / length * 100);
    callbacks.current.onProgressChange?.(progress);
    callbacks.current.onSavePosition?.(value, length);
    if (progress >= 90 && !completedRef.current) {
      completedRef.current = true;
      callbacks.current.onVideoComplete?.();
    }
    if (progress >= 99 || length - value <= 0.75) setEnded(true);
  };

  // Effects depend only on the actual resource/retry. Changing progress callbacks,
  // fullscreen, speed or volume must not recreate HLS or the iframe player.
  useEffect(() => {
    if (kinescope) return;
    const video = videoRef.current;
    if (!video) return;
    let cancelled = false;
    let hls: import('hls.js').default | undefined;
    let objectUrl: string | undefined;
    setError(false);
    setReady(true);
    const manifest = /\.m3u8(?:[?#]|$)/i.test(src);
    const mime = manifest ? 'application/vnd.apple.mpegurl' : 'video/mp2t';
    if (!isMpegTsOrHlsUrl(src) || video.canPlayType(mime)) {
      video.src = src;
      if (reloadKey) video.load();
    } else {
      void import('hls.js').then(({ default: Hls }) => {
        if (cancelled) return;
        if (!Hls.isSupported()) { fail('HLS MediaSource is not supported', 'init', 'hls'); return; }
        hls = new Hls({ enableWorker: true, lowLatencyMode: false });
        let source = src;
        if (!manifest) {
          objectUrl = URL.createObjectURL(new Blob([
            `#EXTM3U\n#EXT-X-VERSION:3\n#EXT-X-TARGETDURATION:60\n#EXT-X-MEDIA-SEQUENCE:0\n#EXT-X-PLAYLIST-TYPE:VOD\n#EXTINF:60.0,\n${src}\n#EXT-X-ENDLIST\n`,
          ], { type: 'application/vnd.apple.mpegurl' }));
          source = objectUrl;
        }
        hls.loadSource(source);
        hls.attachMedia(video);
        hls.on(Hls.Events.ERROR, (_event, data) => { if (data.fatal && !cancelled) fail(`${data.type}: ${data.details}${data.response?.code ? ` (HTTP ${data.response.code})` : ''}`, 'media', 'hls'); });
      }).catch(error => { if (!cancelled) fail(error, 'init', 'hls'); });
    }
    return () => { cancelled = true; hls?.destroy(); if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [src, kinescope, reloadKey]);

  useEffect(() => {
    if (!kinescope || !iframeHostRef.current) return;
    let cancelled = false;
    let instance: KinescopePlayer | undefined;
    let initStage = 'api-load';
    const listeners: Array<[string, (event: KinescopeEvent) => void]> = [];
    const host = iframeHostRef.current;
    // API destroy removes its iframe. Keep that node outside React ownership.
    const frame = document.createElement('iframe');
    // destroy() is asynchronous. A retry must never reuse the ID of an
    // instance still being destroyed (create() would return that old player).
    const frameId = `${playerId}-${++iframeGenerationRef.current}`;
    frame.id = frameId;
    const frameUrl = new URL(src);
    frameUrl.searchParams.set('controls', '0');
    frameUrl.searchParams.set('keyboard', '0');
    frame.src = frameUrl.toString();
    frame.title = 'Видео урока';
    frame.className = 'h-full w-full border-0';
    frame.allow = 'autoplay; fullscreen; picture-in-picture; encrypted-media; gyroscope; accelerometer; clipboard-write';
    frame.allowFullscreen = true;
    frame.tabIndex = -1;
    host.appendChild(frame);
    setReady(false);
    setLoading(true);
    setError(false);
    const subscribe = (name: string, listener: (event: KinescopeEvent) => void) => {
      const event = instance!.Events[name];
      if (!event) return;
      instance!.on(event, listener);
      listeners.push([event, listener]);
    };
    void loadKinescopeApi().then(factory => {
      if (cancelled) return;
      initStage = 'api-create';
      return factory.create(frameId, {
        url: src, size: { width: '100%', height: '100%' },
        ui: { controls: false, mainPlayButton: false, language: 'ru' },
        behavior: { preload, localStorage: false, keyboard: false, playsInline: true, muted, playbackRate: callbacks.current.allowSeek ? rate : 1 },
      });
    }).then(async player => {
      if (!player) return;
      if (cancelled) { await player.destroy().catch(() => {}); return; }
      instance = player;
      playerRef.current = player;
      void player.setVolume(volume).catch(fail);
      setReady(true);
      setLoading(false);
      subscribe('Loaded', event => {
        updateDuration(event.data?.duration ?? 0);
        setLoading(false);
        if (!restoredRef.current && positionRef.current > 0 && positionRef.current < durationRef.current - 1) {
          restoredRef.current = true;
          maxWatchedRef.current = Math.max(maxWatchedRef.current, positionRef.current);
          player.seekTo(positionRef.current).catch(fail);
          setTime(positionRef.current);
          callbacks.current.onProgressChange?.(positionRef.current / durationRef.current * 100);
        }
      });
      subscribe('DurationChange', event => updateDuration(event.data?.duration ?? 0));
      subscribe('TimeUpdate', event => updateTime(event.data?.currentTime ?? 0));
      subscribe('Play', () => { setEnded(false); lastUpdateRef.current = Date.now(); });
      subscribe('Playing', () => { setPlaying(true); setLoading(false); });
      subscribe('Pause', () => setPlaying(false));
      subscribe('Ended', () => { setPlaying(false); setEnded(true); updateTime(durationRef.current); });
      subscribe('Waiting', () => setLoading(true));
      subscribe('Error', event => fail(event.data?.error, 'provider-media'));
      subscribe('VolumeChange', event => { setVolume(event.data?.volume ?? 1); setMuted(!!event.data?.muted); });
      subscribe('PlaybackRateChange', event => {
        const next = event.data?.playbackRate ?? 1;
        if (!callbacks.current.allowSeek && next !== 1) { player.setPlaybackRate(1).catch(fail); setRate(1); }
        else setRate(next);
      });
      // Metadata may already have arrived before create() resolves.
      const length = await player.getDuration().catch(() => 0);
      if (cancelled) return;
      updateDuration(length);
      if (length > 0 && !restoredRef.current && positionRef.current > 0 && positionRef.current < length - 1) {
        restoredRef.current = true;
        await player.seekTo(positionRef.current);
        setTime(positionRef.current);
        callbacks.current.onProgressChange?.(positionRef.current / length * 100);
      }
    }).catch(error => { if (!cancelled) fail(error, initStage); });
    return () => {
      cancelled = true;
      if (playerRef.current === instance) playerRef.current = undefined;
      listeners.forEach(([event, listener]) => instance?.off(event, listener));
      void instance?.destroy().catch(() => {});
      frame.remove();
    };
  }, [src, kinescope, playerId, reloadKey]);

  useEffect(() => {
    if (allowSeek) return;
    setRate(1);
    if (videoRef.current) videoRef.current.playbackRate = 1;
    void playerRef.current?.setPlaybackRate(1).catch(fail);
  }, [allowSeek]);

  const action = (operation: () => Promise<void> | undefined) => { void operation()?.catch(fail); };
  const togglePlay = () => {
    if (kinescope) action(() => playing ? playerRef.current?.pause() : playerRef.current?.play());
    else if (videoRef.current) {
      if (videoRef.current.paused) action(() => videoRef.current?.play()); else videoRef.current.pause();
    }
  };
  const seek = (position: number) => {
    const target = Math.min(durationRef.current, Math.max(0, position));
    if (!allowSeek && target > maxWatchedRef.current) return;
    setEnded(false);
    if (kinescope) action(() => playerRef.current?.seekTo(target));
    else if (videoRef.current) videoRef.current.currentTime = target;
  };
  const toggleMute = () => {
    const next = !muted;
    if (kinescope) action(() => next ? playerRef.current?.mute() : playerRef.current?.unmute());
    else if (videoRef.current) videoRef.current.muted = next;
    setMuted(next);
  };
  const changeVolume = (next: number) => {
    if (kinescope) { action(() => playerRef.current?.setVolume(next)); if (muted && next > 0) action(() => playerRef.current?.unmute()); }
    else if (videoRef.current) { videoRef.current.volume = next; if (next > 0) videoRef.current.muted = false; }
    setVolume(next);
    if (next > 0) setMuted(false);
  };
  const changeRate = (next: number) => {
    if (!allowSeek) return;
    if (kinescope) action(() => playerRef.current?.setPlaybackRate(next));
    else if (videoRef.current) videoRef.current.playbackRate = next;
    setRate(next);
  };
  const toggleFullscreen = async () => {
    if (pseudoFullscreen) { setPseudoFullscreen(false); return; }
    if (fullscreen) { await document.exitFullscreen().catch(() => {}); return; }
    try {
      if (!containerRef.current?.requestFullscreen) { setPseudoFullscreen(true); return; }
      await containerRef.current.requestFullscreen();
    } catch { setPseudoFullscreen(true); }
  };
  const retry = () => { setError(false); setLoading(true); setPlaying(false); setTimedOut(false); restoredRef.current = false; setReloadKey(value => value + 1); };

  return (
    <div ref={containerRef} className={cn('relative aspect-video w-full overflow-hidden rounded-xl bg-black', className,
      pseudoFullscreen && 'fixed inset-0 z-[100] h-[100dvh] max-h-none w-screen rounded-none', !controlsVisible && playing && 'cursor-none')}
      onMouseMove={showControls} onTouchStart={showControls} onFocusCapture={() => setControlsVisible(true)}
      onContextMenu={event => { if (!allowSeek) event.preventDefault(); }}>
      {kinescope ? <>
        <div ref={iframeHostRef} className="h-full w-full pointer-events-none" />
        <button type="button" tabIndex={-1} aria-label="Область видео" className="absolute inset-0" onClick={togglePlay} disabled={!ready} />
      </> : <video ref={videoRef} controls={false} playsInline preload={preload} className="h-full w-full object-contain video-no-controls"
        controlsList={`nodownload${!allowSeek ? ' noplaybackrate noremoteplayback' : ''}`} disablePictureInPicture={!allowSeek} disableRemotePlayback={!allowSeek}
        onClick={togglePlay} onLoadedMetadata={() => {
          const video = videoRef.current!;
          updateDuration(video.duration);
          if (!restoredRef.current && positionRef.current > 0 && positionRef.current < video.duration - 1) {
            restoredRef.current = true; video.currentTime = positionRef.current; maxWatchedRef.current = Math.max(maxWatchedRef.current, positionRef.current); setTime(positionRef.current);
            callbacks.current.onProgressChange?.(positionRef.current / video.duration * 100);
          }
        }} onTimeUpdate={() => updateTime(videoRef.current!.currentTime)} onDurationChange={() => updateDuration(videoRef.current!.duration)}
        onSeeking={() => { const video = videoRef.current!; if (!allowSeek && video.currentTime > maxWatchedRef.current) video.currentTime = maxWatchedRef.current; }}
        onPlay={() => { setPlaying(true); setEnded(false); lastUpdateRef.current = Date.now(); }} onPause={() => setPlaying(false)}
        onPlaying={() => { setPlaying(true); setLoading(false); }} onEnded={() => { setPlaying(false); setEnded(true); updateTime(videoRef.current!.currentTime); }}
        onCanPlay={() => setLoading(false)} onWaiting={() => setLoading(true)} onStalled={() => setLoading(true)} onError={nativeError}
        onVolumeChange={() => { setMuted(videoRef.current!.muted); setVolume(videoRef.current!.volume); }}
        onRateChange={() => { const video = videoRef.current!; if (!allowSeek && video.playbackRate !== 1) video.playbackRate = 1; setRate(video.playbackRate); }} />}
      {loading && !error && <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center bg-black/30">
        <SigmaSpinner size="xl" className="text-white" />
        <p className="mt-2 text-sm text-white">{timedOut ? 'Видео загружается слишком долго' : 'Загрузка видео…'}</p>
        {timedOut && <Button variant="outline" onClick={retry} className="pointer-events-auto mt-3 gap-2"><RotateCcw className="h-4 w-4" />Попробовать снова</Button>}
      </div>}
      {error && <div className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-3 bg-black/90 p-4 text-center text-white">
        <Video className="h-10 w-10" /><p className="text-sm">Не удалось воспроизвести видео</p>
        <Button variant="outline" onClick={retry} className="gap-2"><RotateCcw className="h-4 w-4" />Попробовать снова</Button>
        {allowSeek && <a href={src} target="_blank" rel="noopener noreferrer" className="text-xs underline">Открыть видео отдельно</a>}
      </div>}
      {controls && !error && <div className={cn('transition-opacity', controlsVisible ? 'opacity-100' : 'opacity-0 focus-within:opacity-100')}>
        <VideoControls playing={playing} muted={muted} volume={volume} time={time} duration={duration} rate={rate} allowSeek={allowSeek}
          ready={ready} fullscreen={fullscreen || pseudoFullscreen} onTogglePlay={togglePlay} onReplay={() => { seek(0); if (!playing) togglePlay(); }}
          onToggleMute={toggleMute} onVolume={changeVolume} onSeek={seek} onRate={changeRate} onFullscreen={() => void toggleFullscreen()} />
      </div>}
      {!allowSeek && !ended && <div className="absolute right-2 top-2 rounded bg-black/60 px-2 py-1 text-xs text-white">Просмотрено: {duration > 0 ? Math.round(time / duration * 100) : 0}%</div>}
      {ended && onFinishLesson && <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-black/70 text-white">
        <CheckCircle2 className="mb-3 h-12 w-12 text-green-400" /><p className="mb-4 text-lg">Видео просмотрено</p>
        <Button onClick={onFinishLesson} className="gap-2">Завершить урок<ChevronRight className="h-5 w-5" /></Button>
      </div>}
    </div>
  );
}
