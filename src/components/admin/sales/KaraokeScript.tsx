import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Pause, Play, RotateCcw } from 'lucide-react';

interface Props {
  text: string;
  active: boolean;
  /** Слов в минуту для караоке. По умолчанию 130 — комфортная разговорная скорость. */
  wpm?: number;
}

/**
 * Показывает текст с "караоке"-подсветкой:
 * произнесённые слова затемняются, текущее подсвечивается акцентом.
 * Автостарт при active=true. Пауза / рестарт кнопками.
 */
export function KaraokeScript({ text, active, wpm = 130 }: Props) {
  const words = text.split(/(\s+)/); // сохраняем пробелы для восстановления
  const wordIdxs = words
    .map((w, i) => (/\S/.test(w) ? i : -1))
    .filter((i) => i >= 0);

  const [currentWord, setCurrentWord] = useState(0);
  const [playing, setPlaying] = useState(false);
  const rafRef = useRef<number | null>(null);
  const startRef = useRef<number>(0);
  const pausedElapsedRef = useRef<number>(0);

  const msPerWord = 60000 / wpm;

  useEffect(() => {
    if (active) {
      // При новом звонке — сброс и автостарт
      setCurrentWord(0);
      pausedElapsedRef.current = 0;
      setPlaying(true);
    } else {
      setPlaying(false);
    }
  }, [active, text]);

  useEffect(() => {
    if (!playing) {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      return;
    }
    startRef.current = performance.now() - pausedElapsedRef.current;
    const tick = () => {
      const elapsed = performance.now() - startRef.current;
      const idx = Math.min(Math.floor(elapsed / msPerWord), wordIdxs.length - 1);
      setCurrentWord(idx);
      if (idx >= wordIdxs.length - 1) {
        setPlaying(false);
        pausedElapsedRef.current = 0;
        return;
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      pausedElapsedRef.current = performance.now() - startRef.current;
    };
  }, [playing, msPerWord, wordIdxs.length]);

  const restart = () => {
    setCurrentWord(0);
    pausedElapsedRef.current = 0;
    setPlaying(true);
  };
  const toggle = () => setPlaying((p) => !p);

  const currentWordAbsIdx = wordIdxs[currentWord] ?? -1;

  return (
    <div className="border rounded-xl bg-card p-3 space-y-2">
      <div className="flex items-center justify-between">
        <div className="text-xs uppercase tracking-wide text-muted-foreground font-medium">
          {active ? '🎤 Читайте вслух' : 'Скрипт вступления'}
        </div>
        <div className="flex gap-1">
          <Button size="sm" variant="ghost" className="h-7 px-2" onClick={toggle}>
            {playing ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
          </Button>
          <Button size="sm" variant="ghost" className="h-7 px-2" onClick={restart}>
            <RotateCcw className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>
      <p className="text-sm leading-relaxed">
        {words.map((w, i) => {
          if (!/\S/.test(w)) return <span key={i}>{w}</span>;
          const wordOrder = wordIdxs.indexOf(i);
          const isCurrent = i === currentWordAbsIdx && playing;
          const isPast = wordOrder < currentWord;
          return (
            <span
              key={i}
              className={
                isCurrent
                  ? 'bg-primary/25 text-foreground rounded px-0.5 transition-colors'
                  : isPast
                  ? 'text-muted-foreground/70 transition-colors'
                  : 'text-foreground transition-colors'
              }
            >
              {w}
            </span>
          );
        })}
      </p>
    </div>
  );
}
