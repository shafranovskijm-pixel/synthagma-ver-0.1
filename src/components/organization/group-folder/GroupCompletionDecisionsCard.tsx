import { useEffect, useId, useRef, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  completionEnrollment, fetchGroupCompletionDecisions, isCurrentCompletionDecision, saveGroupCompletionDecision,
  type CompletionScope, type GroupCompletionContext,
} from "@/lib/groups/groupCompletionDecisions";

interface Props { organizationId: string; groupId: string }

export function GroupCompletionDecisionsCard(props: Props) {
  const { user, loading } = useAuth();
  return <Card className="space-y-3 rounded-xl p-4">
    <div className="flex flex-wrap items-center gap-2"><h3 className="font-semibold">Итоговые решения</h3><Badge variant="outline">Beta</Badge></div>
    <p className="text-sm text-muted-foreground">Укажите итоговую оценку и решение о выдаче документа каждому участнику. Процент теста не заменяет решение ответственного сотрудника.</p>
    {loading ? <p role="status">Проверяем доступ…</p> : !user ? <p role="alert">Войдите в кабинет организации для просмотра итоговых решений.</p>
      : <CompletionPanel key={`${user.id}:${props.organizationId}:${props.groupId}`} scope={props} actorId={user.id} />}
  </Card>;
}

function CompletionPanel({ scope, actorId }: { scope: CompletionScope; actorId: string }) {
  const id = useId();
  const [open, setOpen] = useState(false), [busy, setBusy] = useState(false);
  const [context, setContext] = useState<GroupCompletionContext | null>(null);
  const [selected, setSelected] = useState("");
  const [grade, setGrade] = useState(""), [issuance, setIssuance] = useState<"" | "with_document" | "without_document">("");
  const [protocol, setProtocol] = useState(""), [protocolDate, setProtocolDate] = useState(""), [note, setNote] = useState("");
  const [confirmed, setConfirmed] = useState(false), [requiresReload, setRequiresReload] = useState(false);
  const [error, setError] = useState<string | null>(null), [message, setMessage] = useState<string | null>(null);
  const running = useRef(false), alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const resetForm = () => { setGrade(""); setIssuance(""); setProtocol(""); setProtocolDate(""); setNote(""); setConfirmed(false); setMessage(null); };
  async function load() {
    if (running.current) return;
    running.current = true; setOpen(true); setBusy(true); setError(null); setContext(null); setSelected(""); resetForm();
    try {
      const result = await fetchGroupCompletionDecisions(scope);
      if (alive.current) { setContext(result); setRequiresReload(false); }
    } catch (failure) { if (alive.current) setError(failure instanceof Error ? failure.message : "Не удалось прочитать итоговые решения. Обновите данные."); }
    finally { running.current = false; if (alive.current) setBusy(false); }
  }
  const student = context?.students.find(item => item.user_id === selected);
  const enrollment = student && context ? completionEnrollment(student, context) : null;
  const saved = student?.decision;
  const current = Boolean(saved && context && student && isCurrentCompletionDecision(saved, context, student));
  const canEdit = Boolean(context?.can_manage && enrollment && !requiresReload);
  const valid = Boolean(grade.trim() && [...grade.trim()].length <= 100 && issuance && confirmed);
  const change = (update: () => void) => { if (running.current) return; update(); setConfirmed(false); setMessage(null); };
  async function save() {
    if (running.current || !context || !student || !canEdit || !valid || !issuance) return;
    running.current = true; setBusy(true); setError(null); setMessage(null);
    try {
      const result = await saveGroupCompletionDecision({ ...scope, actorId, context, userId: student.user_id,
        gradeText: grade, issuanceDecision: issuance, protocolNumber: protocol || null, protocolDate: protocolDate || null, decisionNote: note || null });
      if (!alive.current) return;
      setContext(result); resetForm(); setMessage("Решение сохранено и подтверждено повторным чтением из базы. Для обновления документов сформируйте пакет заново.");
    } catch (failure) {
      if (alive.current) {
        setError(failure instanceof Error ? failure.message : "Сохранение не подтверждено. Обновите данные перед повтором.");
        // Even an unexpected failure must not allow a blind duplicate mutation.
        setRequiresReload(true); setConfirmed(false);
      }
    } finally { running.current = false; if (alive.current) setBusy(false); }
  }

  if (!open) return <Button type="button" variant="outline" onClick={load}>Заполнить итоговые решения</Button>;
  return <div className="space-y-4">
    <div className="flex flex-wrap gap-2">
      <Button type="button" variant="outline" disabled={busy} onClick={load}>Обновить решения</Button>
      <Button type="button" variant="ghost" disabled={busy} onClick={() => { setOpen(false); setContext(null); setSelected(""); resetForm(); }}>Свернуть</Button>
    </div>
    {busy && <p role="status">Проверяем данные…</p>}
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    {requiresReload && <p className="text-sm text-amber-800 dark:text-amber-300">Повторное сохранение отключено. Нажмите «Обновить решения», чтобы проверить результат и актуальные данные.</p>}
    {message && <p role="status" className="text-sm">{message}</p>}
    {context && <>
      {!context.can_manage && <p role="status" className="text-sm">Доступен только просмотр. Для изменения итоговых решений нужны права ответственного сотрудника организации.</p>}
      {!context.group.course_id && <p role="status" className="text-sm">Сначала назначьте группе курс. Итоговое решение привязывается к конкретному зачислению на этот курс.</p>}
      {context.students.length === 0 ? <p>В группе пока нет учеников. Добавьте участников и зачислите их на курс группы.</p> : <>
        <div className="max-w-xl space-y-1">
          <Label htmlFor={`${id}-student`}>Участник группы</Label>
          <select id={`${id}-student`} className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={selected} disabled={busy}
            onChange={event => change(() => { setSelected(event.target.value); resetForm(); })}>
            <option value="">Выберите ученика</option>
            {context.students.map(item => <option key={item.user_id} value={item.user_id}>{item.full_name || "ФИО не заполнено"}</option>)}
          </select>
        </div>
        {student && <section aria-label="Решение выбранного ученика" className="space-y-3 rounded-lg border p-3">
          <h4 className="font-medium">{student.full_name || "ФИО не заполнено"}</h4>
          {saved && <div className="space-y-1 rounded-md bg-muted/50 p-3 text-sm">
            <p className="font-medium">{current ? "Сохранённое актуальное решение" : "Предыдущее решение — требует повторной проверки"}</p>
            <p>Оценка: {saved.grade_text}. {saved.issuance_decision === "with_document" ? "С выдачей документа" : "Без выдачи документа"}.</p>
            {saved.protocol_number && <p>Протокол: {saved.protocol_number}{saved.protocol_date ? ` от ${saved.protocol_date}` : ""}.</p>}
            {!saved.protocol_number && saved.protocol_date && <p>Дата протокола: {saved.protocol_date}.</p>}
            {saved.decision_note && <p className="whitespace-pre-wrap">Основание / примечание: {saved.decision_note}</p>}
            <p className="text-muted-foreground">Подтверждено: {new Date(saved.confirmed_at).toLocaleString("ru-RU")} · версия {saved.revision}.</p>
          </div>}
          {saved && !current && <p role="alert" className="text-sm text-amber-800 dark:text-amber-300">Изменились данные курса, группы или зачисления. Предыдущее решение не используется в новых документах и не подставляется в форму. Проверьте сведения и подтвердите новое решение.</p>}
          {!enrollment && context.group.course_id && <p role="alert" className="text-sm">{student.enrollments.length > 1 ? "Найдено несколько зачислений на курс группы. Сначала уточните правильное зачисление; автоматически выбирать его нельзя." : "Нет однозначно подтверждённого активного или завершённого зачисления на курс группы. Сначала проверьте зачисление ученика."}</p>}
          {enrollment && <p className="text-sm text-muted-foreground">Зачисление: {enrollment.status === "completed" ? "курс завершён" : "активное"}. Завершение курса само по себе не означает выдачу документа.</p>}
          {context.can_manage && <fieldset disabled={busy || !canEdit} className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1"><Label htmlFor={`${id}-grade`}>Итоговая оценка</Label><Input id={`${id}-grade`} value={grade} maxLength={200} aria-describedby={`${id}-grade-help`} onChange={event => change(() => setGrade(event.target.value))} /><p id={`${id}-grade-help`} className="text-xs text-muted-foreground">Введите утверждённую оценку словами или числом, до 100 символов. Шкала не назначается системой.</p></div>
              <div className="space-y-1"><Label htmlFor={`${id}-issuance`}>Решение о выдаче документа</Label><select id={`${id}-issuance`} className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={issuance}
                onChange={event => change(() => setIssuance(event.target.value as typeof issuance))}><option value="">Выберите решение</option><option value="with_document">С выдачей документа</option><option value="without_document">Без выдачи документа</option></select></div>
              <div className="space-y-1"><Label htmlFor={`${id}-protocol`}>Номер протокола (необязательно)</Label><Input id={`${id}-protocol`} value={protocol} maxLength={200} onChange={event => change(() => setProtocol(event.target.value))} /></div>
              <div className="space-y-1"><Label htmlFor={`${id}-protocol-date`}>Дата протокола (необязательно)</Label><Input id={`${id}-protocol-date`} type="date" value={protocolDate} onChange={event => change(() => setProtocolDate(event.target.value))} /></div>
            </div>
            <div className="space-y-1"><Label htmlFor={`${id}-note`}>Основание / примечание (необязательно)</Label><Textarea id={`${id}-note`} value={note} maxLength={1000} onChange={event => change(() => setNote(event.target.value))} /></div>
            <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={confirmed} onChange={event => { if (!running.current) setConfirmed(event.target.checked); }} /><span>Проверил итоговую оценку и решение о выдаче для этого ученика и текущего зачисления.</span></label>
            <Button type="button" disabled={busy || !canEdit || !valid} onClick={save}>Подтвердить и сохранить решение</Button>
          </fieldset>}
        </section>}
      </>}
    </>}
  </div>;
}
