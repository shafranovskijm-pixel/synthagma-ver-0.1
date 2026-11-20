import { Button } from "@/components/ui/button";
import { rtnWorkspaceHref } from "@/lib/rtnWorkspaceNavigation";
import type { RtnPersonalNotificationPage } from "@/types/rtn-personal-notifications";
import { updateDate } from "./RtnUpdatePresentation";
export function RtnPersonalBellItems({ data, error, loading, refresh, next, latest, older, openEvent }: {
  data?: RtnPersonalNotificationPage; error?: unknown; loading: boolean; refresh: () => unknown; next: () => void; latest: () => void; older: boolean;
  openEvent: (eventId: string, href: string, unread: boolean) => void;
}) {
  return <section aria-label="Мои уведомления Ростехнадзора" className="min-w-0 space-y-3 border-t border-border px-5 py-4">
    <h4 className="text-sm font-semibold">Ростехнадзор · только мои</h4>
    {error ? <div role="status" className="space-y-2"><p className="text-xs text-muted-foreground">Личные уведомления не подтверждены. Число непрочитанных неизвестно.</p><Button variant="outline" className="min-h-10" onClick={() => void refresh()}>Повторить личные уведомления</Button></div> : !data ? <p role="status" className="text-xs text-muted-foreground">Проверяем личные уведомления…</p> : <>
      <p className="text-xs text-muted-foreground">Непрочитанных полученных: {data.unread_count}.{data.materialization_pending ? " Проверка будущих событий ещё не завершена; итоговое число может увеличиться." : ""}</p>
      {data.materialization_pending && <Button variant="outline" className="h-auto min-h-10 whitespace-normal" disabled={loading} onClick={() => void refresh()}>Продолжить проверку событий</Button>}
      {!data.subscription_enabled && <p className="text-xs text-muted-foreground">Новая доставка отключена. Ранее полученные уведомления остаются в истории; включить новые можно в «Курсы → Ростехнадзор → Источники → Мои уведомления».</p>}
      {!data.items.length && <p className="text-sm text-muted-foreground">На этой странице нет полученных уведомлений. Это не означает отсутствие новостей на официальном сайте.</p>}
      <div className="max-h-64 divide-y divide-border overflow-y-auto">{data.items.map(item => <button key={`rtn:${item.id}`} type="button" onClick={() => openEvent(item.event.id, rtnWorkspaceHref({ view: "changes", eventId: item.event.id, bankId: item.event.bank_id }), item.read_at === null)} className={`block min-h-10 w-full min-w-0 rounded-lg px-2 py-3 text-left hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${item.read_at === null ? "bg-primary/5" : ""}`}>
        <span className="flex min-w-0 items-start gap-2"><span className="min-w-0 break-words text-sm font-semibold">{item.event.title}</span>{item.read_at === null && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary" aria-label="Не прочитано" />}</span>
        {item.event.own_summary && <span className="mt-1 line-clamp-2 break-words text-xs text-muted-foreground">{item.event.own_summary}</span>}<span className="mt-1 block text-xs text-muted-foreground">Получено {updateDate(item.delivered_at)}</span>
      </button>)}</div>
      <div className="flex flex-wrap gap-2">{older && <Button variant="outline" className="min-h-10" disabled={loading} onClick={latest}>К последним</Button>}{data.has_more && <Button variant="outline" className="min-h-10" disabled={loading} onClick={next}>Более ранние</Button>}</div>
    </>}
  </section>;
}
