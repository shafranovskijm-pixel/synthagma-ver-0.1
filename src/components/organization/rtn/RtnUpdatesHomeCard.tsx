import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getRtnUpdateSummary } from "@/api/rtn-updates";
import { RtnApiError } from "@/api/rostechnadzor";
import { Button } from "@/components/ui/button";
import { rtnWorkspaceHref } from "@/lib/rtnWorkspaceNavigation";
import type { RtnUpdateSummary } from "@/types/rtn-updates";
import { RtnNewsHealthStatus, rtnUpdateBox } from "./RtnUpdatePresentation";

type Props = { organizationId: string | null; actorId: string | null; canReadCourses: boolean };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function Summary({ organizationId }: { organizationId: string }) {
  const [attempt, retry] = useState(0);
  const [state, setState] = useState<{ data?: RtnUpdateSummary; error?: unknown }>({});
  useEffect(() => {
    let active = true;
    setState({});
    getRtnUpdateSummary(organizationId).then(data => { if (active) setState({ data }); }, error => { if (active) setState({ error }); });
    return () => { active = false; };
  }, [organizationId, attempt]);
  if (!state.data && !state.error) return null;
  if (state.error instanceof RtnApiError && state.error.code === "forbidden") return null;
  return <section className={`${rtnUpdateBox} space-y-3`} aria-label="Ростехнадзор на рабочем столе">
    <div className="flex min-w-0 flex-wrap items-center justify-between gap-2"><h2 className="font-display text-base font-semibold">Ростехнадзор</h2>{state.data && <p className="text-xs text-muted-foreground">Сохранённых изменений: {state.data.event_count}{state.data.count_is_lower_bound ? "+" : ""}</p>}</div>
    {state.error ? <div role="status" className="space-y-2"><p className="text-sm text-muted-foreground">Не удалось подтвердить изменения Ростехнадзора.</p><Button variant="outline" className="min-h-10" onClick={() => retry(value => value + 1)}>Повторить проверку изменений</Button></div> : state.data && <>
      {state.data.latest_event ? <div className="min-w-0 space-y-2"><p className="line-clamp-2 break-words text-sm font-medium">{state.data.latest_event.title}</p>{state.data.latest_event.own_summary && <p className="line-clamp-2 break-words text-sm text-muted-foreground">{state.data.latest_event.own_summary}</p>}<Link className="inline-flex min-h-10 items-center text-sm font-semibold text-primary underline underline-offset-4" to={rtnWorkspaceHref({ view: "changes", eventId: state.data.latest_event.id })}>Посмотреть изменение</Link></div> : <p className="text-sm text-muted-foreground">Сохранённых изменений пока нет. Состояние проверки источника показано ниже.</p>}
      <RtnNewsHealthStatus health={state.data.source_health} />
      <p className="text-xs text-muted-foreground">Это известные системе записи, а не количество непрочитанных уведомлений.</p>
    </>}
  </section>;
}

export function RtnUpdatesHomeCard({ organizationId, actorId, canReadCourses }: Props) {
  if (!canReadCourses || !actorId || !organizationId || !UUID.test(organizationId)) return null;
  return <Summary key={`${actorId}:${organizationId}`} organizationId={organizationId} />;
}
