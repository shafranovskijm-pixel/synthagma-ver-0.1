import { useEffect, useRef, useState } from 'react';
import { History } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { captureOfflineActor, isOfflineActorCurrent } from '@/utils/courseCache';
import { isLearningProgressEpoch, isLearningProgressReset } from '@/lib/learningProgress';
import { chronologicalLearningHistory, mergeCourseLearningHistory, parseCourseLearningHistory, type CourseLearningHistory, type LearningHistoryCursor } from '@/lib/courseLearningHistory';

interface Props {
  userId: string; courseId: string; enrollmentId: string; learningEpoch: string;
  isCurrent?: () => boolean;
  onProgressReset?: (error: unknown) => Promise<boolean>;
}
const dateLabel = (value: string) => new Date(value).toLocaleString('ru-RU');

/** An explicitly opened, read-only timeline. It never navigates to or credits a lesson. */
export function TestAttemptHistory({ userId, courseId, enrollmentId, learningEpoch, isCurrent, onProgressReset }: Props) {
  const [open, setOpen] = useState(false), [retry, setRetry] = useState(0);
  const actorRevision = captureOfflineActor(userId);
  const key = JSON.stringify([userId, courseId, enrollmentId, learningEpoch, actorRevision, open]);
  const authority = useRef({ key, revision: 0 });
  if (authority.current.key !== key) authority.current = { key, revision: authority.current.revision + 1 };
  const captured = authority.current;
  const callbacks = useRef({ isCurrent, onProgressReset }); callbacks.current = { isCurrent, onProgressReset };
  const permitted = !!userId && !!courseId && !!enrollmentId && isLearningProgressEpoch(learningEpoch)
    && actorRevision !== null && isOfflineActorCurrent(userId, actorRevision) && (isCurrent?.() ?? true);
  const [state, setState] = useState<{ authority: typeof captured | null; loading: boolean; value: CourseLearningHistory | null; error: string | null }>(
    { authority: null, loading: false, value: null, error: null });
  const requests = useRef(0);
  const loadPage = async (cursor: LearningHistoryCursor | null, previous: CourseLearningHistory | null) => {
    if (!open || !permitted) return;
    const request = ++requests.current;
    const current = () => request === requests.current && authority.current === captured && isOfflineActorCurrent(userId, actorRevision)
      && (callbacks.current.isCurrent?.() ?? true);
    setState({ authority: captured, loading: true, value: previous, error: null });
      try {
        const { data, error } = await supabase.rpc('get_own_course_learning_history', { p_course_id: courseId, p_expected_epoch: learningEpoch,
          ...(cursor ? { p_cursor_ts: cursor.ts, p_cursor_kind: cursor.kind, p_cursor_id: cursor.id } : {}) });
        if (!current()) return;
        if (error) throw error;
        const page = parseCourseLearningHistory(data, courseId, enrollmentId, learningEpoch);
        const value = previous ? mergeCourseLearningHistory(previous, page) : page;
        if (current()) setState({ authority: captured, loading: false, value, error: null });
      } catch (cause) {
        if (!current()) return;
        if (isLearningProgressReset(cause)) {
          try { await callbacks.current.onProgressReset?.(cause); } catch { /* Keep the history closed until a confirmed read succeeds. */ }
        }
        if (current()) setState({ authority: captured, loading: false, value: null, error: isLearningProgressReset(cause)
          ? 'Организация сбросила прогресс. Закройте историю и откройте её заново после обновления курса.'
          : 'Не удалось подтвердить историю прохождений. Повторите загрузку.' });
      }
  };
  useEffect(() => {
    void loadPage(null, null);
    return () => { ++requests.current; };
  }, [key, retry, permitted]);
  const visible = permitted && state.authority === captured ? state : null;
  const events = visible?.value ? chronologicalLearningHistory(visible.value) : [];
  if (!permitted) return null;
  return <>
    <Button variant="outline" size="sm" className="rounded-xl gap-2" onClick={() => setOpen(true)}><History className="h-4 w-4" />История прохождений</Button>
    <Dialog open={open} onOpenChange={setOpen}><DialogContent className="rounded-2xl max-w-2xl max-h-[85vh] overflow-y-auto">
      <DialogHeader><DialogTitle>История прохождений</DialogTitle><DialogDescription>Попытки, зачёты и сбросы прогресса по этому курсу. Просмотр истории не засчитывает старые результаты в текущее прохождение.</DialogDescription></DialogHeader>
      {(!visible || visible.loading) && <p role="status" className="text-sm text-muted-foreground">Проверяем сохранённую историю…</p>}
      {visible?.error && <div role="alert" className="space-y-3"><p>{visible.error}</p><Button variant="outline" onClick={() => setRetry(value => value + 1)}>Повторить загрузку</Button></div>}
      {visible?.value && <div className="space-y-3">
        {visible.value.has_more && <p role="status" className="text-sm text-muted-foreground">Показана часть сохранённой истории. Более ранние записи можно загрузить ниже.</p>}
        {!events.length && <p className="text-sm text-muted-foreground">Сохранённых попыток, зачётов и сбросов пока нет.</p>}
        <ol className="space-y-3">{events.map(event => <li key={event.key} className="rounded-xl border p-4 space-y-1 text-sm">
          <time dateTime={event.at} className="text-xs text-muted-foreground">{dateLabel(event.at)}</time>
          {event.kind === 'attempt' ? <>
            <p className="font-medium">{event.item.lesson_title}</p>
            <p>{event.item.passed === true ? 'Тест сдан' : event.item.passed === false ? 'Тест не сдан' : 'Итог не подтверждён'}{event.item.score !== null && event.item.max_score !== null ? ` · ${event.item.score} из ${event.item.max_score}` : ''}</p>
            <p className="text-xs text-muted-foreground">{!event.item.historical_boundary_known
              && visible.value!.lessons.some(lesson => lesson.lesson_id === event.item.lesson_id && lesson.current_completed)
              ? 'Сохранённый результат. Связь с текущим прохождением не подтверждена.'
              : event.item.is_counted_in_current_run
              ? 'Урок засчитан в текущем прохождении. Результат попытки сохранён.'
              : event.item.historical_boundary_known && !event.item.is_current_run
                ? 'Предыдущее прохождение. Не засчитывается в текущий прогресс.'
                : 'Сохранённый результат. Не учитывается в текущем прогрессе.'}</p>
          </> : event.kind === 'reset' ? <>
            <p className="font-medium">Прогресс сброшен организацией</p>
            <p>Предыдущий прогресс: {event.item.previous_progress}%. Начато новое прохождение; прежние результаты сохранены.</p>
          </> : <>
            <p className="font-medium">{event.kind === 'credit' ? 'Курс зачтён организацией' : 'Зачёт организации отозван'}</p>
            <p className="text-xs text-muted-foreground">Сохранённая запись зачёта. Просмотр не восстанавливает текущий прогресс.</p>
          </>}
        </li>)}</ol>
        {visible.value.next_cursor && <Button variant="outline" disabled={visible.loading} onClick={() => void loadPage(visible.value!.next_cursor, visible.value)}>Показать более ранние</Button>}
      </div>}
    </DialogContent></Dialog>
  </>;
}
