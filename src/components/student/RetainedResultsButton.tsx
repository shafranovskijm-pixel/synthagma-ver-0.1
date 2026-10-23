import { useEffect, useRef, useState } from "react";
import { History } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { customJournalScopeCurrent } from "@/lib/customJournals/client";
import { captureOwnRetainedScope, readOwnAssignmentIds, readOwnRetainedLearningSummary, type OwnRetainedScope } from "@/lib/educationIssuance/retainedResults";
import type { RetainedLearningSummary } from "@/lib/educationIssuance/contract";
import { learningOutcomeErrorMessages, normalizeLearningOutcomeError } from "@/lib/learningOutcomes/client";

interface Props { organizationId: string; userId: string; courseLabels?: Record<string, string>; }
type Assignment = { id: string; course_id: string };
export function RetainedResultsButton({ organizationId, userId, courseLabels = {} }: Props) {
  const [open, setOpen] = useState(false), [scope, setScope] = useState<OwnRetainedScope | null>(null);
  const [assignments, setAssignments] = useState<Assignment[]>([]), [next, setNext] = useState<string | null>(null);
  const [selected, setSelected] = useState(""), [result, setResult] = useState<RetainedLearningSummary | null>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null);
  const epoch = useRef(0), flight = useRef(false), identity = useRef({key:JSON.stringify([organizationId,userId,open]),revision:0});
  const identityKey=JSON.stringify([organizationId,userId,open]);
  if(identity.current.key!==identityKey)identity.current={key:identityKey,revision:identity.current.revision+1};
  const identityRevision=identity.current.revision;
  const current = !!scope && scope.organizationId === organizationId && scope.actorId === userId && customJournalScopeCurrent(scope);
  useEffect(() => {
    const run = ++epoch.current; flight.current = false; setBusy(false); setAssignments([]); setNext(null); setResult(null); setSelected(""); setError(null); setScope(null);
    if (!open) return;
    let captured: OwnRetainedScope;
    try { captured = captureOwnRetainedScope(organizationId, userId, () => run === epoch.current && identity.current.revision === identityRevision); }
    catch (cause) { setError(learningOutcomeErrorMessages[normalizeLearningOutcomeError(cause).code]); return; }
    setScope(captured); flight.current = true; setBusy(true);
    void readOwnAssignmentIds(captured).then(page => {
      if (run === epoch.current && customJournalScopeCurrent(captured)) { setAssignments(page.items); setNext(page.next); }
    }).catch(cause => { if (run === epoch.current && customJournalScopeCurrent(captured)) setError(learningOutcomeErrorMessages[normalizeLearningOutcomeError(cause).code]); })
      .finally(() => { if (run === epoch.current) { flight.current = false; setBusy(false); } });
    return () => { ++epoch.current; };
  }, [open, organizationId, userId,identityRevision]);
  const loadAssignments = async () => {
    if (!scope || !current || !next || flight.current) return;
    const run = epoch.current; flight.current = true; setBusy(true); setError(null);
    try { const page = await readOwnAssignmentIds(scope, next); if (run === epoch.current && customJournalScopeCurrent(scope)) { setAssignments(rows => [...rows, ...page.items]); setNext(page.next); } }
    catch (cause) { if (run === epoch.current && customJournalScopeCurrent(scope)) setError(learningOutcomeErrorMessages[normalizeLearningOutcomeError(cause).code]); }
    finally { if (run === epoch.current) { flight.current = false; setBusy(false); } }
  };
  const loadResult = async (more = false) => {
    const assignment = assignments.find(row => row.id === selected);
    if (!scope || !current || !assignment || flight.current) return;
    const run = epoch.current; flight.current = true; setBusy(true); setError(null);
    if (!more) setResult(null);
    try {
      const value = await readOwnRetainedLearningSummary(scope, assignment.id, assignment.course_id, more ? result?.next_after_decision_id ?? null : null);
      if (run === epoch.current && customJournalScopeCurrent(scope)) setResult(previous => more && previous ? { ...value, decisions: [...previous.decisions, ...value.decisions] } : value);
    } catch (cause) { if (run === epoch.current && customJournalScopeCurrent(scope)) setError(learningOutcomeErrorMessages[normalizeLearningOutcomeError(cause).code]); }
    finally { if (run === epoch.current) { flight.current = false; setBusy(false); } }
  };
  return <>
    <Button variant="outline" className="rounded-xl gap-2" onClick={() => setOpen(true)}><History className="h-4 w-4" />Сохранённые результаты</Button>
    <Dialog open={open} onOpenChange={setOpen}><DialogContent className="rounded-2xl max-w-2xl max-h-[90vh] overflow-y-auto">
      <DialogHeader><DialogTitle>Сохранённые результаты</DialogTitle><DialogDescription>Здесь можно прочитать свой прежний итог после прекращения обучения. В списке — все ваши назначения, в том числе из других организаций; выбирайте нужное. Продолжение курса, уроки и новые попытки остаются закрыты.</DialogDescription></DialogHeader>
      {current && <div className="space-y-3">
        <label className="block text-sm space-y-1"><span>Точное назначение курса</span><select className="w-full rounded-xl border bg-background p-2" value={selected} disabled={busy} onChange={event => { setSelected(event.target.value); setResult(null); setError(null); }}>
          <option value="">Выберите назначение</option>{assignments.map(row => <option key={row.id} value={row.id}>{courseLabels[row.course_id] ?? "Учебный курс"} · {row.id.slice(0, 8)}</option>)}
        </select></label>
        <p className="text-xs text-muted-foreground">Итог откроется только для прекращённого обучения в текущей организации. Активное назначение или назначение другой организации вернёт сообщение о недоступности, а не пустой подтверждённый результат.</p>
        {!busy && !assignments.length && <p className="text-sm text-muted-foreground">Доступных назначений не найдено.</p>}
        <div className="flex flex-wrap gap-2"><Button disabled={busy || !selected} onClick={() => void loadResult()}>Открыть результат</Button>{next && <Button variant="outline" disabled={busy} onClick={() => void loadAssignments()}>Ещё назначения</Button>}</div>
        {result && <div className="rounded-xl border p-4 space-y-3">
          <Badge variant="secondary">Обучение прекращено {result.withdrawal.effective_date}</Badge>
          <p className="text-sm">Сохранённый учебный прогресс: {result.technical.progress}% · {result.technical.status}. Он сам по себе не подтверждает квалификацию или выдачу документа.</p>
          {result.decisions.map(decision => <div key={decision.id} className="border-t pt-3 text-sm space-y-1">
            <p className="font-medium">{({ passed: "Итог подтверждён", not_passed: "Итог не подтверждён", deferred: "Решение отложено" } as const)[decision.outcome]}</p>
            <p>{decision.learner_summary}</p><p className="text-xs text-muted-foreground">{new Date(decision.recorded_at).toLocaleString("ru-RU")}{decision.supersedes_id ? " · последующее решение" : ""}</p>
          </div>)}
          {!result.decisions.length && <p className="text-sm text-muted-foreground">Решение об образовательном результате ещё не было записано. Сохранён только технический прогресс.</p>}
          {result.next_after_decision_id && <Button variant="outline" disabled={busy} onClick={() => void loadResult(true)}>Ещё решения</Button>}
        </div>}
      </div>}
      {busy && <p role="status" className="text-sm text-muted-foreground">Проверяем сохранённые сведения…</p>}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {scope && !current && <p role="alert" className="text-sm text-destructive">Доступ изменился. Закройте окно и откройте его заново.</p>}
    </DialogContent></Dialog>
  </>;
}
