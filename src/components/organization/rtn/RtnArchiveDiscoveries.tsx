import { useEffect, useId, useRef, useState } from 'react';
import { ChevronDown, ChevronUp, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { listRtnArchiveCandidates, type RtnArchiveCandidatePage } from '@/api/rtn-archive';
import { RtnApiError } from '@/api/rostechnadzor';
import { rtnUpdateBox } from './RtnUpdatePresentation';

type Props = { organizationId: string; actorId: string | null; canReadCourses: boolean };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ACTOR_UUID = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
const printedDay = (date: string) => date.split('-').reverse().join('.');

function Discoveries({ organizationId }: { organizationId: string }) {
  const region = useId(), active = useRef<AbortController | null>(null);
  const [open, setOpen] = useState(false), [data, setData] = useState<RtnArchiveCandidatePage | null>(null);
  const [loading, setLoading] = useState(false), [error, setError] = useState<string | null>(null);
  useEffect(() => () => { active.current?.abort(); }, []);
  async function load(cursor: string | null) {
    if (active.current) return;
    const controller = new AbortController(); active.current = controller;
    setLoading(true); setError(null);
    try {
      const result = await listRtnArchiveCandidates(organizationId, cursor, controller.signal);
      if (controller.signal.aborted || active.current !== controller) return;
      if (cursor !== null && (result.next_cursor === cursor || result.items.some(item => data?.items.some(old => old.canonical_url === item.canonical_url)))) {
        throw new RtnApiError('invalid_response', 'Продолжение списка не подтверждено. Обновите список.');
      }
      setData(previous => ({ ...result, items: cursor === null ? result.items : [...(previous?.items ?? []), ...result.items] }));
    } catch (failure) {
      if (!controller.signal.aborted && active.current === controller) {
        setError(failure instanceof RtnApiError ? failure.message : 'Публикации не удалось загрузить. Попробуйте ещё раз.');
      }
    } finally {
      if (active.current === controller) { active.current = null; if (!controller.signal.aborted) setLoading(false); }
    }
  }
  function toggle() {
    if (open) { active.current?.abort(); active.current = null; setLoading(false); }
    else if (!data) void load(null);
    setOpen(!open);
  }
  return <section className={`${rtnUpdateBox} min-w-0 space-y-3`} aria-label="Архив публикаций">
    <Button variant="ghost" className="h-auto min-h-11 w-full justify-between gap-3 whitespace-normal px-0 text-left" aria-expanded={open} aria-controls={region} onClick={toggle}>
      <span className="min-w-0 break-words font-semibold">Найденные публикации</span>{open ? <ChevronUp className="h-4 w-4 shrink-0" /> : <ChevronDown className="h-4 w-4 shrink-0" />}
    </Button>
    <p className="text-sm text-muted-foreground">Сохранённые заголовки и ссылки с официального сайта. Здесь могут быть прошлые публикации; это не список новых уведомлений.</p>
    <div id={region} hidden={!open} className="min-w-0 space-y-3">
      <p className="text-xs text-muted-foreground">Дата указана как на сайте, без точного времени. Полнота архива не подтверждена.</p>
      {loading && <p role="status" className="text-sm text-muted-foreground">Загружаем сохранённые публикации…</p>}
      {error && <div role="alert" className="space-y-2 text-sm"><p className="break-words text-destructive">{error}</p><Button variant="outline" className="h-auto min-h-11 whitespace-normal" disabled={loading} onClick={() => void load(data?.next_cursor ?? null)}>{data ? 'Повторить загрузку' : 'Попробовать ещё раз'}</Button></div>}
      {data?.items.length === 0 && <p className="text-sm text-muted-foreground">Сохранённых публикаций пока нет. Это не означает, что на официальном сайте нет обновлений.</p>}
      {data && <ul className="min-w-0 divide-y divide-border">{data.items.map(item => <li key={item.canonical_url} className="min-w-0 space-y-2 py-3">
        <p className="text-xs text-muted-foreground">{printedDay(item.source_date)}{item.known_rss ? ' · Есть в истории RSS' : ''}</p>
        <a href={item.canonical_url} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 max-w-full items-center gap-2 text-sm text-primary underline underline-offset-4"><span className="min-w-0 break-words">{item.title}</span><ExternalLink aria-hidden="true" className="h-4 w-4 shrink-0" /></a>
        {item.has_conflict && <p className="text-xs text-muted-foreground">Сведения расходятся — требуется проверка.</p>}
      </li>)}</ul>}
      {data?.has_more && !error && <Button variant="outline" className="h-auto min-h-11 whitespace-normal" disabled={loading} onClick={() => void load(data.next_cursor)}>Показать ещё</Button>}
    </div>
  </section>;
}

export function RtnArchiveDiscoveries({ organizationId, actorId, canReadCourses }: Props) {
  if (!canReadCourses || !UUID.test(organizationId) || !actorId || !ACTOR_UUID.test(actorId)) return null;
  return <Discoveries key={`${organizationId}:${actorId}`} organizationId={organizationId} />;
}
