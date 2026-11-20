import type { RtnNewsSourceHealth, RtnUpdateEvent } from "@/types/rtn-updates";

export const rtnUpdateBox = "min-w-0 rounded-2xl border border-border bg-card p-4 sm:p-5";

export function updateDate(value: string | null): string {
  if (!value || !Number.isFinite(Date.parse(value))) return "Не подтверждено";
  return new Intl.DateTimeFormat("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Europe/Moscow" }).format(new Date(value));
}

export function RtnNewsHealthStatus({ health }: { health: RtnNewsSourceHealth }) {
  const labels: Record<RtnNewsSourceHealth["status"], string> = {
    never_checked: "Проверка новостей ещё не подтверждена.",
    success: "Последняя успешная проверка новостей",
    partial: "Новости проверены частично; полнота сведений не подтверждена.",
    error: "Не удалось проверить новости. Отсутствие новых записей не подтверждено.",
    blocked: "Проверка новостей недоступна. Отсутствие новых записей не подтверждено.",
  };
  return <div className="min-w-0 space-y-1 rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground" role="status">
    <p>{labels[health.status]}{health.status === "success" ? `: ${updateDate(health.last_success_at)}.` : ""}</p>
    {health.status !== "success" && health.last_success_at && <p>Последняя успешная проверка: {updateDate(health.last_success_at)}.</p>}
    <p>{health.coverage_kind === "verified_archive_interval" ? `Подтверждённый период: ${updateDate(health.coverage_from)} — ${updateDate(health.coverage_until)}.` : health.coverage_kind === "finite_rss_window" ? "Проверена доступная RSS-лента; полный архив не подтверждён." : "Охват публикаций пока не подтверждён."}</p>
  </div>;
}

export function RtnUpdateDescription({ event }: { event: RtnUpdateEvent }) {
  return <div className="min-w-0 space-y-2">
    <p className="text-xs font-medium text-primary">{event.kind === "news" ? "Новость официального сайта" : event.kind === "source_change" ? "Изменение источника вопросов" : "Выпуск учебной редакции"}{event.historical ? " · Ранее опубликовано" : ""}</p>
    <h4 className="break-words font-semibold">{event.title}</h4>
    {event.own_summary && <p className="break-words text-sm text-muted-foreground">{event.own_summary}</p>}
    <dl className="grid min-w-0 gap-2 text-xs text-muted-foreground sm:grid-cols-2">
      {event.published_at && <div><dt>{event.kind === "news" ? "Опубликовано на сайте" : "Редакция выпущена"}</dt><dd>{updateDate(event.published_at)}</dd></div>}
      <div><dt>Обнаружено СИНТАГМОЙ</dt><dd>{updateDate(event.observed_at)}</dd></div>
      {event.kind === "bank_release" && <div><dt>Применяется для новых попыток с</dt><dd>{updateDate(event.effective_from)}</dd></div>}
    </dl>
    <p className="text-xs text-muted-foreground">{event.kind === "news" ? "Новость не определяет дату вступления требований в силу. Проверяйте применимый нормативный акт." : event.kind === "source_change" ? "Изменение источника не означает готовность учебных ответов. Состояние редакции показано в программе." : "Старые попытки сохраняют свою редакцию и результаты."}</p>
  </div>;
}
