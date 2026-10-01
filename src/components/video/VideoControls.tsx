import { useState } from 'react';
import { Check, Maximize, Minimize, Pause, Play, RotateCcw, Volume2, VolumeX } from 'lucide-react';

export const VIDEO_SPEEDS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];

export const formatVideoTime = (seconds: number) => {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
};

interface VideoControlsProps {
  playing: boolean;
  muted: boolean;
  volume: number;
  time: number;
  duration: number;
  rate: number;
  fullscreen: boolean;
  allowSeek: boolean;
  ready: boolean;
  onTogglePlay: () => void;
  onReplay: () => void;
  onToggleMute: () => void;
  onVolume: (value: number) => void;
  onSeek: (value: number) => void;
  onRate: (value: number) => void;
  onFullscreen: () => void;
}

export function VideoControls(props: VideoControlsProps) {
  const [speedOpen, setSpeedOpen] = useState(false);
  const buttonClass = 'inline-flex h-9 min-w-9 items-center justify-center rounded-md text-white hover:bg-white/15 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white disabled:opacity-40';
  const progress = props.duration > 0 ? Math.min(100, Math.max(0, props.time / props.duration * 100)) : 0;
  return (
    <div className="absolute inset-x-0 bottom-0 z-20 bg-gradient-to-t from-black/90 to-transparent px-3 pb-2 pt-8 text-white" data-video-controls onClick={event => event.stopPropagation()}>
      {props.allowSeek ? (
        <input type="range" aria-label="Позиция видео" min={0} max={props.duration || 1} step={0.1} value={Math.min(props.time, props.duration || 1)}
          disabled={!props.ready || props.duration <= 0} onChange={event => props.onSeek(Number(event.target.value))}
          className="mb-1 h-1 w-full cursor-pointer accent-violet-400" />
      ) : (
        <div role="progressbar" aria-label="Просмотрено видео" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress)} className="mb-1 h-1 rounded bg-white/30">
          <div className="h-full rounded bg-violet-400" style={{ width: `${progress}%` }} />
        </div>
      )}
      <div className="flex items-center gap-1 sm:gap-2">
        <button type="button" className={buttonClass} aria-label={props.playing ? 'Пауза' : 'Воспроизвести'} disabled={!props.ready} onClick={props.onTogglePlay}>
          {props.playing ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5" />}
        </button>
        <button type="button" className={buttonClass} aria-label="Смотреть сначала" disabled={!props.ready} onClick={props.onReplay}><RotateCcw className="h-5 w-5" /></button>
        <button type="button" className={buttonClass} aria-label={props.muted || props.volume === 0 ? 'Включить звук' : 'Выключить звук'} disabled={!props.ready} onClick={props.onToggleMute}>
          {props.muted || props.volume === 0 ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
        </button>
        <input type="range" aria-label="Громкость" min={0} max={1} step={0.05} value={props.muted ? 0 : props.volume} disabled={!props.ready}
          onChange={event => props.onVolume(Number(event.target.value))} className="hidden h-1 w-16 cursor-pointer accent-white sm:block" />
        <span className="flex-1 whitespace-nowrap px-1 text-xs tabular-nums">{formatVideoTime(props.time)} / {formatVideoTime(props.duration)}</span>
        {props.allowSeek && <div className="relative" onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setSpeedOpen(false); }}>
          <button type="button" className={`${buttonClass} px-2 text-xs font-medium`} aria-label="Скорость воспроизведения" aria-expanded={speedOpen}
            disabled={!props.ready} onClick={() => setSpeedOpen(!speedOpen)}>{props.rate}x</button>
          {speedOpen && <div className="absolute bottom-full right-0 mb-2 min-w-28 rounded-lg bg-neutral-900 p-1 shadow-lg">
            {VIDEO_SPEEDS.map(rate => <button type="button" key={rate} className="flex w-full items-center justify-between rounded px-3 py-1.5 text-sm hover:bg-white/15"
              onClick={() => { props.onRate(rate); setSpeedOpen(false); }} aria-label={`Скорость ${rate}x`}>
              <span>{rate === 1 ? 'Обычная' : `${rate}x`}</span>{props.rate === rate && <Check className="h-4 w-4" />}
            </button>)}
          </div>}
        </div>}
        <button type="button" className={buttonClass} aria-label={props.fullscreen ? 'Выйти из полноэкранного режима' : 'Полноэкранный режим'} onClick={props.onFullscreen}>
          {props.fullscreen ? <Minimize className="h-5 w-5" /> : <Maximize className="h-5 w-5" />}
        </button>
      </div>
    </div>
  );
}
