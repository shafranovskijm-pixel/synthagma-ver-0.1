import { useEffect, useRef, useState } from 'react';
import { ImagePlus, MessageSquare, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { VideoPlaybackFailure } from '@/components/video/CourseVideoPlayer';
import { getConfirmedVideoReportId, submitVideoProblemReport, validVideoReportContext, type VideoReportContext } from '@/lib/support/videoProblemReport';
import { maxSupportScreenshotBytes, SupportScreenshotError } from '@/lib/support/videoReportScreenshotUpload';

export function VideoProblemReportButton({ context, failure }: { context: VideoReportContext; failure: VideoPlaybackFailure }) {
  const busy = useRef(false);
  const mounted = useRef(false);
  const [sending, setSending] = useState(false);
  const [requestId, setRequestId] = useState<string | null>(()=>getConfirmedVideoReportId(context));
  const [failed, setFailed] = useState(false);
  const [screenshot, setScreenshot] = useState<File | null>(null);
  const [attachmentError, setAttachmentError] = useState(false);
  const [screenshotNotAdded, setScreenshotNotAdded] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  if (!validVideoReportContext(context)) return null;
  const send = async () => {
    if (busy.current || requestId) return;
    busy.current = true; setSending(true); setFailed(false);
    try {
      const result = screenshot
        ? await submitVideoProblemReport(context, failure, () => mounted.current, screenshot)
        : await submitVideoProblemReport(context, failure, () => mounted.current);
      if (mounted.current) {setRequestId(result.id);setScreenshotNotAdded(!!result.selectedScreenshotNotAdded);}
    } catch (error) { if (mounted.current) {setFailed(true); if (error instanceof SupportScreenshotError) setAttachmentError(true);} }
    finally { busy.current = false; if (mounted.current) setSending(false); }
  };
  return <div className="pointer-events-auto max-w-sm space-y-2 text-center">
    {requestId ? <><p role="status" className="text-sm text-white">Обращение №{requestId.slice(0, 8)} сохранено в техподдержке</p>
      {screenshotNotAdded && <p className="text-xs text-white/80">Использовано ранее сохранённое обращение. Новое изображение не добавлялось.</p>}</> : <>
      <input ref={input} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" aria-label="Скриншот ошибки видео"
        onChange={event=>{
          const file=event.target.files?.[0]; if (!file) return;
          if (!['image/png','image/jpeg','image/webp'].includes(file.type) || !file.size || file.size>maxSupportScreenshotBytes) {
            setScreenshot(null); setAttachmentError(true); event.target.value=''; return;
          }
          setScreenshot(file); setAttachmentError(false);
        }} />
      <div className="flex items-center justify-center gap-1">
        <Button size="sm" variant="outline" disabled={sending} className="gap-2" onClick={()=>input.current?.click()}>
          <ImagePlus className="h-4 w-4" />{screenshot ? 'Скриншот выбран' : 'Скриншот (необязательно)'}
        </Button>
        {screenshot && <Button size="sm" variant="ghost" disabled={sending} aria-label="Убрать выбранный скриншот" onClick={()=>{
          setScreenshot(null); setAttachmentError(false); if(input.current) input.current.value='';
        }}><X className="h-4 w-4" /></Button>}
      </div>
      <Button variant="outline" className="gap-2" disabled={sending} onClick={() => void send()}>
        <MessageSquare className="h-4 w-4" />{sending ? 'Отправляем…' : 'Сообщить об ошибке видео'}
      </Button>
      <p className="text-xs text-white/80">Передадим курс, урок, тип ошибки и браузер.</p>
      {attachmentError && <p role="alert" className="text-xs text-white">Выберите PNG, JPEG или WebP до 5 МБ; при ошибке можно убрать скриншот.</p>}
      {failed && <p role="alert" className="text-sm text-white">Не удалось отправить. Попробуйте ещё раз.</p>}
    </>}
  </div>;
}
