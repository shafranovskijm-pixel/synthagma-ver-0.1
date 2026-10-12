import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export const CRM_TIMELINE_SOURCES = { crm: "CRM", learning: "Обучение", documents: "Документы", activity: "Активность ученика" } as const;
export type CrmTimelineSource = keyof typeof CRM_TIMELINE_SOURCES;
export interface CrmTimelineEvent {
  id: string;
  occurred_at: string;
  source: CrmTimelineSource;
  kind: string;
  title: string;
  description: string | null;
}

interface Props {
  timeline: {
    events: CrmTimelineEvent[];
    total: number;
    truncated: boolean;
    restricted_sources: string[];
    unavailable_sources: string[];
  };
  sourceLinks?: Partial<Record<CrmTimelineSource, string>>;
  onRetry?: () => void;
}

const sourceLabel = (source: string) => CRM_TIMELINE_SOURCES[source as CrmTimelineSource] || "Другой источник";

/** Renders persisted server events only; it does not infer sending, payment or completion. */
export function OrgCrmTimeline({ timeline, sourceLinks = {}, onRetry }: Props) {
  const [source, setSource] = useState<CrmTimelineSource | "all">("all");
  const events = useMemo(() => timeline.events.slice().sort((a, b) =>
    new Date(b.occurred_at).getTime() - new Date(a.occurred_at).getTime() || a.id.localeCompare(b.id)), [timeline.events]);
  const visible = source === "all" ? events : events.filter(event => event.source === source);
  const sourceCounts = (value: CrmTimelineSource) => events.filter(event => event.source === value).length;

  return <section className="space-y-4" aria-label="Хронология клиента">
    <div><h3 className="text-lg font-semibold">Хронология</h3><p className="mt-1 text-sm text-muted-foreground">Сохранённые события из доступных разделов. Записи разных источников отмечены отдельно.</p></div>
    {timeline.restricted_sources.length > 0 && <p className="rounded-lg bg-muted p-3 text-sm text-muted-foreground">Источники без доступа: {timeline.restricted_sources.map(sourceLabel).join(", ")}. Их события не включены.</p>}
    {timeline.unavailable_sources.length > 0 && <div role="alert" className="space-y-2 rounded-lg border border-destructive/30 p-3 text-sm"><p>Не удалось загрузить источники: {timeline.unavailable_sources.map(sourceLabel).join(", ")}. Хронология неполна.</p>{onRetry && <Button size="sm" variant="outline" onClick={onRetry}>Повторить загрузку истории</Button>}</div>}
    {timeline.truncated && <p role="status" className="rounded-lg border border-amber-400/40 p-3 text-sm">Показано {events.length} из {timeline.total} доступных событий. Загружена последняя часть истории; фильтры ниже применяются к ней.</p>}
    <div className="flex flex-wrap gap-2" aria-label="Источники событий">
      <Button size="sm" variant={source === "all" ? "default" : "outline"} aria-pressed={source === "all"} onClick={() => setSource("all")}>Все ({events.length})</Button>
      {(Object.entries(CRM_TIMELINE_SOURCES) as [CrmTimelineSource, string][]).map(([value, label]) => <Button key={value} size="sm" variant={source === value ? "default" : "outline"} aria-pressed={source === value} onClick={() => setSource(value)}>{label} ({sourceCounts(value)})</Button>)}
    </div>
    {visible.length ? <ol className="space-y-3">{visible.map(event => <li key={event.id} className="space-y-2 rounded-xl border bg-card p-4" data-source={event.source}>
      <div className="flex flex-wrap items-center justify-between gap-2"><Badge variant="outline">{sourceLabel(event.source)}</Badge><time dateTime={event.occurred_at} className="text-xs text-muted-foreground">{new Date(event.occurred_at).toLocaleString("ru-RU", { dateStyle: "short", timeStyle: "short" })}</time></div>
      <p className="font-medium break-words">{event.title}</p>
      {event.description && <p className="whitespace-pre-wrap break-words text-sm">{event.description}</p>}
      {sourceLinks[event.source] && <Link className="inline-block text-sm text-primary hover:underline" to={sourceLinks[event.source]!}>Открыть раздел «{sourceLabel(event.source)}»</Link>}
    </li>)}</ol> : <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">{events.length ? "В загруженной истории нет событий выбранного источника." : "Доступных сохранённых событий пока нет."}</p>}
  </section>;
}
