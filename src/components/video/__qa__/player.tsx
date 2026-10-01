// Local Vite-only manual QA entry. It never writes to the platform or uses
// customer media. Public samples originate from the providers' official demos.
import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { CourseVideoPlayer, type VideoPlaybackFailure } from '../CourseVideoPlayer';
import '@/index.css';

const samples = [
  { id: 'direct', title: 'Direct MP4 — MDN CC0 sample', src: 'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4' },
  { id: 'hls', title: 'HLS — hls.js public test stream', src: 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8' },
  { id: 'kinescope', title: 'Kinescope — official developer demo', src: 'https://kinescope.io/embed/56Jg27MqvvttAwHcrCzEA4', kinescope: true },
];

function Sample({ sample, allowSeek }: { sample: typeof samples[number]; allowSeek: boolean }) {
  const [state, setState] = useState({ position: 0, duration: 0, progress: 0, completed: 0, errors: 0, failure: null as VideoPlaybackFailure | null });
  return <section className="rounded-xl border bg-background p-4" aria-label={sample.id}>
    <h2 className="mb-3 text-lg font-semibold">{sample.title}</h2>
    <CourseVideoPlayer src={sample.src} kinescope={sample.kinescope} allowSeek={allowSeek}
      onSavePosition={(position, duration) => setState(previous => ({ ...previous, position, duration }))}
      onProgressChange={progress => setState(previous => ({ ...previous, progress }))}
      onVideoComplete={() => setState(previous => ({ ...previous, completed: previous.completed + 1 }))}
      onError={failure => setState(previous => ({ ...previous, errors: previous.errors + 1, failure: failure || null }))} />
    <output className="mt-3 block whitespace-pre-wrap font-mono text-xs" data-video-qa-state={sample.id}>{JSON.stringify(state)}</output>
  </section>;
}

function ManualVideoQA() {
  const [allowSeek, setAllowSeek] = useState(true);
  const [localClip, setLocalClip] = useState('');
  const [recording, setRecording] = useState(false);
  const [fixtureError, setFixtureError] = useState('');
  const clipUrlRef = useRef('');
  useEffect(() => () => { if (clipUrlRef.current) URL.revokeObjectURL(clipUrlRef.current); }, []);
  const createLocalClip = async () => {
    setRecording(true); setFixtureError('');
    let stream: MediaStream | undefined;
    let ticker: ReturnType<typeof setInterval> | undefined;
    try {
      const canvas = document.createElement('canvas');
      canvas.width = 640; canvas.height = 360;
      const context = canvas.getContext('2d')!;
      let frame = 0;
      const draw = () => {
        context.fillStyle = '#172554'; context.fillRect(0, 0, 640, 360);
        context.fillStyle = '#a78bfa'; context.fillRect((frame * 16) % 560, 145, 80, 80);
        context.fillStyle = 'white'; context.font = '26px sans-serif';
        context.fillText('LOCAL ENCODED VIDEO FIXTURE', 65, 70);
        context.fillText(`Frame ${frame++}`, 245, 290);
      };
      draw(); stream = canvas.captureStream(10);
      const mimeType = ['video/webm;codecs=vp8', 'video/webm'].find(value => MediaRecorder.isTypeSupported(value));
      if (!mimeType) throw new Error('WebM MediaRecorder is unavailable');
      const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 350000 });
      const chunks: Blob[] = [];
      recorder.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
      const encoded = new Promise<Blob>((resolve, reject) => {
        recorder.onstop = () => resolve(new Blob(chunks, { type: mimeType }));
        recorder.onerror = () => reject(new Error('MediaRecorder encoding failed'));
      });
      ticker = setInterval(draw, 100); recorder.start();
      await new Promise(resolve => setTimeout(resolve, 5000)); recorder.stop();
      const clip = await encoded;
      if (!clip.size) throw new Error('MediaRecorder produced an empty clip');
      if (clipUrlRef.current) URL.revokeObjectURL(clipUrlRef.current);
      const url = URL.createObjectURL(clip); clipUrlRef.current = url; setLocalClip(url);
    } catch (error) { setFixtureError(error instanceof Error ? error.message : 'Local encoding failed'); }
    finally { clearInterval(ticker); stream?.getTracks().forEach(track => track.stop()); setRecording(false); }
  };
  return <main className="mx-auto max-w-4xl space-y-5 p-5">
    <h1 className="text-2xl font-bold">Локальная проверка общего видеоплеера</h1>
    <p>Play/pause, громкость, скорость, перемотка, fullscreen и возвращение в окно. Переключение разрешения перемотки не должно заменять элемент или сбрасывать воспроизведение.</p>
    <label className="flex items-center gap-2"><input type="checkbox" checked={allowSeek} onChange={event => setAllowSeek(event.target.checked)} />Разрешить перемотку и смену скорости</label>
    <section className="space-y-3 rounded-xl border p-4">
      <h2 className="text-lg font-semibold">Проверка native playback без внешней сети</h2>
      <p className="text-sm">Настоящий WebM создаётся из canvas, без камеры/микрофона. Это тестовый ролик, проверка кодирования/декодирования, управления и fullscreen. Он не подтверждает доступность SGT/CDN/DRM; MediaRecorder может не записывать конечную duration в metadata.</p>
      <button type="button" className="rounded bg-primary px-4 py-2 text-primary-foreground disabled:opacity-50" onClick={() => void createLocalClip()} disabled={recording}>{recording ? 'Кодирование 5 секунд…' : 'Создать локальный тестовый ролик'}</button>
      {fixtureError && <output data-video-fixture-error>{fixtureError}</output>}
      {localClip && <Sample key={localClip} sample={{ id: 'local', title: 'Local encoded WebM fixture', src: localClip }} allowSeek={allowSeek} />}
    </section>
    {samples.map(sample => <Sample key={sample.id} sample={sample} allowSeek={allowSeek} />)}
  </main>;
}

createRoot(document.getElementById('root')!).render(<ManualVideoQA />);
