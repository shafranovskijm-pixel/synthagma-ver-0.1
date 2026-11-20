import { useEffect, useRef, useState } from "react";
import { ExternalLink, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getRtnUpdate, getRtnUpdates } from "@/api/rtn-updates";
import { rtnWorkspaceHref } from "@/lib/rtnWorkspaceNavigation";
import type { RtnNewsSourceHealth, RtnUpdateEvent, RtnUpdateFilter, RtnUpdatePage } from "@/types/rtn-updates";
import { RtnNewsHealthStatus, RtnUpdateDescription, rtnUpdateBox } from "./RtnUpdatePresentation";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PAGE_SIZE = 20;
type Filter = "all" | "questions" | "news";
type Props = { organizationId: string; actorId: string; eventId?: string | null; onSelectEvent: (id: string | null) => void; onOpenBank: (id: string) => void };
const message = (error: unknown) => error instanceof Error ? error.message : "Не удалось загрузить изменения. Повторите попытку.";

function Failure({ error, retry }: { error: unknown; retry: () => void }) {
  return <div role="alert" className="space-y-3"><p className="break-words text-sm text-muted-foreground">{message(error)}</p><Button variant="outline" className="min-h-10" onClick={retry}>Повторить загрузку изменений</Button></div>;
}

function SourceLink({ event }: { event: RtnUpdateEvent }) {
  return <a href={event.canonical_url} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-10 items-center gap-2 text-sm text-primary underline underline-offset-4">Официальный источник<ExternalLink aria-hidden="true" className="h-4 w-4 shrink-0" /></a>;
}

function EventDetail({ organizationId, eventId, onSelectEvent, onOpenBank }: Omit<Props, "actorId"> & { eventId: string }) {
  const [attempt, retry] = useState(0);
  const [state, setState] = useState<{ data?: { event: RtnUpdateEvent; source_health: RtnNewsSourceHealth }; error?: unknown }>({});
  useEffect(() => {
    let active = true;
    setState({});
    getRtnUpdate(organizationId, eventId).then(data => { if (active) setState({ data }); }, error => { if (active) setState({ error }); });
    return () => { active = false; };
  }, [organizationId, eventId, attempt]);
  return <div className="min-w-0 space-y-4">
    <Button variant="outline" className="min-h-10" onClick={() => onSelectEvent(null)}>Все изменения</Button>
    {state.error ? <Failure error={state.error} retry={() => retry(value => value + 1)} /> : !state.data ? <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />Загружаем изменение…</p> : <>
      <article aria-label="Карточка изменения" className="min-w-0 space-y-3 rounded-xl border border-border p-4">
        <RtnUpdateDescription event={state.data.event} />
        <div className="flex flex-wrap gap-2"><SourceLink event={state.data.event} />{state.data.event.bank_id && <Button variant="outline" className="h-auto min-h-10 whitespace-normal" onClick={() => onOpenBank(state.data!.event.bank_id!)}>Посмотреть программу</Button>}</div>
      </article>
      <RtnNewsHealthStatus health={state.data.source_health} />
    </>}
  </div>;
}

function EventList({ organizationId, filter, onSelectEvent }: { organizationId: string; filter: Filter; onSelectEvent: Props["onSelectEvent"] }) {
  const [state, setState] = useState<{ page?: RtnUpdatePage; error?: unknown; loading: boolean }>({ loading: true });
  const [attempt, retry] = useState(0);
  const generation = useRef(0);
  const busy = useRef(false);
  const request = async (beforeSequence?: number) => {
    if (busy.current) return;
    busy.current = true;
    const current = generation.current;
    setState(previous => ({ ...previous, loading: true, error: undefined }));
    try {
      const page = await getRtnUpdates(organizationId, { kind: filter === "all" ? undefined : filter as RtnUpdateFilter, limit: PAGE_SIZE, beforeSequence });
      if (current === generation.current) setState(previous => ({ loading: false, page: { ...page, events: beforeSequence ? [...(previous.page?.events ?? []), ...page.events] : page.events } }));
    } catch (error) {
      // A failed page must not keep rendering previously authorized rows.
      if (current === generation.current) setState({ loading: false, error });
    } finally { if (current === generation.current) busy.current = false; }
  };
  useEffect(() => {
    busy.current = false;
    void request();
    return () => { generation.current++; busy.current = false; };
  // A keyed parent resets the filter and actor/organization scope.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt]);
  if (state.error) return <Failure error={state.error} retry={() => retry(value => value + 1)} />;
  return <div className="min-w-0 space-y-4">
    {state.page && <RtnNewsHealthStatus health={state.page.source_health} />}
    {state.loading && !state.page && <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />Загружаем изменения…</p>}
    {state.page && !state.page.events.length && <p className="text-sm text-muted-foreground">В этом списке пока нет сохранённых изменений. Это не подтверждает отсутствие публикаций на официальном сайте.</p>}
    {state.page?.events.map(event => <article key={event.id} className="min-w-0 space-y-3 border-t border-border pt-4">
      <RtnUpdateDescription event={event} />
      <div className="flex flex-wrap gap-x-4 gap-y-2"><a href={rtnWorkspaceHref({ view: "changes", eventId: event.id })} onClick={click => { if (!click.ctrlKey && !click.metaKey && !click.shiftKey && !click.altKey && click.button === 0) { click.preventDefault(); onSelectEvent(event.id); } }} className="inline-flex min-h-10 items-center text-sm font-medium text-primary underline underline-offset-4">Подробнее об изменении</a><SourceLink event={event} /></div>
    </article>)}
    {state.page?.has_more && <Button variant="outline" className="min-h-10" disabled={state.loading} onClick={() => { if (state.page?.next_before_sequence != null) void request(state.page.next_before_sequence); }}>{state.loading ? "Загружаем…" : "Показать ещё"}</Button>}
  </div>;
}

function FeedContent(props: Props) {
  const [filter, setFilter] = useState<Filter>("all");
  return <section className={`${rtnUpdateBox} space-y-4`} aria-label="Общие изменения Ростехнадзора">
    <div><h3 className="font-semibold">Изменения Ростехнадзора</h3><p className="mt-1 text-sm text-muted-foreground">Публикации официального сайта и выпуски учебных редакций. Состояние программ показано отдельно.</p></div>
    <div role="group" className="flex flex-wrap gap-2" aria-label="Фильтр изменений">{([['all', 'Все'], ['questions', 'Вопросы'], ['news', 'Новости']] as const).map(([value, label]) => <Button key={value} variant={!props.eventId && filter === value ? "default" : "outline"} aria-pressed={!props.eventId && filter === value} className="min-h-10" onClick={() => { setFilter(value); if (props.eventId) props.onSelectEvent(null); }}>{label}</Button>)}</div>
    {props.eventId ? <EventDetail key={props.eventId} {...props} eventId={props.eventId} /> : <EventList key={filter} organizationId={props.organizationId} filter={filter} onSelectEvent={props.onSelectEvent} />}
  </section>;
}

export function RtnUpdatesFeed(props: Props) {
  if (!props.actorId || !UUID.test(props.organizationId)) return null;
  if (props.eventId && !UUID.test(props.eventId)) return <p role="status" className={`${rtnUpdateBox} text-sm text-muted-foreground`}>Ссылка на изменение некорректна. Откройте список изменений заново.</p>;
  return <FeedContent key={`${props.actorId}:${props.organizationId}`} {...props} />;
}
