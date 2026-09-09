import { useEffect, useId, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { BlockRenderer } from './block-editor/BlockRenderer';
import type { Lesson } from './LessonTypeConfig';
import {
  canReplaceTextLesson, MAX_TEXT_LESSON_FILE_BYTES, prepareTextLessonReplacement,
  textLessonContextKey, textLessonFingerprint, type TextLessonContext, type TextLessonPatch,
} from '@/lib/textLessonReplacement';

interface Props extends Omit<TextLessonContext, 'lessonId'> {
  lesson: Lesson;
  onUpdate: (patch: TextLessonPatch) => void;
  disabled?: boolean;
}
interface Preview { name: string; base: string; patch: TextLessonPatch }

export function ReplaceTextLessonContent(props: Props) {
  const context = { organizationId: props.organizationId, courseId: props.courseId, lessonId: props.lesson.id };
  return <ScopedReplacement key={`${textLessonContextKey(context)}:${props.lesson.type}:${props.lesson.__contentLoaded}`} {...props} />;
}

function ScopedReplacement({ lesson, courseId, organizationId, onUpdate, disabled = false }: Props) {
  const context = { organizationId, courseId, lessonId: lesson.id };
  const allowed = canReplaceTextLesson(context, lesson) && !disabled;
  const [open, setOpen] = useState(false);
  const [reading, setReading] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [message, setMessage] = useState('');
  const alive = useRef(false);
  const sequence = useRef(0);
  const consumed = useRef(false);
  const current = useRef({ allowed, fingerprint: textLessonFingerprint(lesson) });
  current.current = { allowed, fingerprint: textLessonFingerprint(lesson) };
  const inputId = useId();
  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; };
  }, []);

  const cancel = () => {
    sequence.current++; setOpen(false); setReading(false); setPreview(null); setMessage('');
  };
  const read = async (file: File) => {
    if (!allowed) return;
    const request = ++sequence.current;
    const base = current.current.fingerprint;
    setReading(true); setPreview(null); setMessage(''); consumed.current = false;
    try {
      if (file.size > MAX_TEXT_LESSON_FILE_BYTES) throw new Error('Файл превышает лимит 2 МиБ.');
      const source = await file.text();
      if (!alive.current || request !== sequence.current) return;
      if (!current.current.allowed || current.current.fingerprint !== base) throw new Error('Содержание урока изменилось. Выберите файл заново.');
      const patch = prepareTextLessonReplacement(file.name, source);
      setPreview({ name: file.name, base, patch });
    } catch (error) {
      if (alive.current && request === sequence.current) setMessage(error instanceof Error ? error.message : 'Не удалось прочитать файл.');
    } finally {
      if (alive.current && request === sequence.current) setReading(false);
    }
  };
  const confirm = () => {
    if (!alive.current || !preview || consumed.current) return;
    if (!current.current.allowed || current.current.fingerprint !== preview.base) {
      setPreview(null); setMessage('Содержание или доступность урока изменились. Выберите файл заново.'); return;
    }
    consumed.current = true;
    setPreview(null);
    try {
      onUpdate({ blocks: preview.patch.blocks, content: preview.patch.content });
      setMessage('Содержание заменено в редакторе. Состояние автосохранения смотрите в CourseBuilder; серверный результат требует отдельной проверки.');
    } catch {
      setMessage('Редактор не подтвердил замену. Проверьте текущее содержание перед повтором.');
    }
  };

  if (lesson.type !== 'text' && lesson.type !== 'lesson') return null;
  return <section className="space-y-3 rounded-xl border p-3" aria-label="Замена содержания одной лекции">
    {!open ? <Button type="button" variant="outline" disabled={!allowed} onClick={() => setOpen(true)}>Заменить содержание из MD/HTML</Button> : <>
      <p>Выбран урок «{lesson.title}». Будут заменены только его текстовые блоки и содержание. Название, тип, порядок, вопросы, вложения и метаданные не изменяются.</p>
      <p className="text-sm text-muted-foreground">Файл читается локально, без AI и загрузки в сеть. Изображения, стили, скрипты и встроенные приложения не переносятся. Проверьте таблицы, ссылки, списки и предупреждения в предпросмотре.</p>
      <label htmlFor={inputId}>Файл одной лекции (MD/HTML, до 2 МиБ)</label>
      <input id={inputId} type="file" accept=".md,.markdown,.html,.htm" disabled={!allowed || reading} onChange={event => {
        const file = event.currentTarget.files?.[0]; event.currentTarget.value = '';
        if (file) void read(file);
      }} />
      {reading && <p role="status">Чтение локального файла…</p>}
      {preview && <>
        <p>Предпросмотр: {preview.name} · блоков: {preview.patch.blocks?.length}. Исходный файл не изменяется.</p>
        <div className="max-h-[60vh] overflow-auto rounded-lg border p-4" aria-label="Предпросмотр нового содержания" onClickCapture={event => {
          if ((event.target as Element).closest('a')) event.preventDefault();
        }}>
          <BlockRenderer blocks={preview.patch.blocks || []} />
        </div>
        <p role="note">Подтверждение вызовет одно изменение выбранного урока. Затем действует штатное автосохранение CourseBuilder, которое сохраняет курс пакетно. До подтверждения этот импорт ничего не меняет.</p>
        <Button type="button" disabled={!allowed || reading} onClick={confirm}>Подтвердить замену содержания этого урока</Button>
      </>}
      <Button type="button" variant="outline" onClick={cancel}>Отменить импорт</Button>
    </>}
    {!allowed && <p className="text-sm">Импорт доступен после загрузки существующей текстовой лекции в подтверждённом контексте курса и организации.</p>}
    {message && <p role="status">{message}</p>}
  </section>;
}
