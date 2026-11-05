import { useEffect, useRef, useState } from 'react';
import { MessageSquare } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { VideoPlaybackFailure } from '@/components/video/CourseVideoPlayer';
import { submitVideoProblemReport, validVideoReportContext, type VideoReportContext } from '@/lib/support/videoProblemReport';

export function VideoProblemReportButton({ context, failure }: { context: VideoReportContext; failure: VideoPlaybackFailure }) {
  const busy = useRef(false);
  const mounted = useRef(false);
  const [sending, setSending] = useState(false);
  const [requestId, setRequestId] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  if (!validVideoReportContext(context)) return null;
  const send = async () => {
    if (busy.current || requestId) return;
    busy.current = true; setSending(true); setFailed(false);
    try {
      const result = await submitVideoProblemReport(context, failure, () => mounted.current);
      if (mounted.current) setRequestId(result.id);
    } catch { if (mounted.current) setFailed(true); }
    finally { busy.current = false; if (mounted.current) setSending(false); }
  };
  return <div className="pointer-events-auto max-w-sm space-y-2 text-center">
    {requestId ? <p role="status" className="text-sm text-white">Обращение №{requestId.slice(0, 8)} сохранено в техподдержке</p> : <>
      <Button variant="outline" className="gap-2" disabled={sending} onClick={() => void send()}>
        <MessageSquare className="h-4 w-4" />{sending ? 'Отправляем…' : 'Сообщить об ошибке видео'}
      </Button>
      <p className="text-xs text-white/80">Передадим курс, урок, тип ошибки и браузер.</p>
      {failed && <p role="alert" className="text-sm text-white">Не удалось отправить. Попробуйте ещё раз.</p>}
    </>}
  </div>;
}
