import { useCallback, useEffect, useId, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, BookOpen, CheckCircle2, ClipboardCheck, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { getRtnAssignment, getRtnAttempt, getRtnStudentWorkspace, hydrateRtnAttempt, recordRtnMaterialOpen, startRtnAttempt, submitRtnAttempt } from "@/api/rostechnadzor";
import type { RtnAnswers, RtnAttempt, RtnMaterial, RtnStudentAssignment, RtnSubmission } from "@/types/rostechnadzor";
import { useRtnDraftSync } from "./useRtnDraftSync";
import { useRtnNavigationGuard } from "./useRtnNavigationGuard";

type OpenTraining = { assignment: RtnStudentAssignment; mode: "start" | "resume" | "result" };
type EntryProps = { opened: OpenTraining; onUpdated: () => void; onCloseReadiness: (ready: boolean) => void; accessConfirmed: boolean; accessChecking: boolean; onRecheckAccess: () => void };

function requestError(error: unknown) {
  return error instanceof Error ? error.message : "Не удалось связаться с сервером. Повторите попытку.";
}

export function StudentRtnCourses(props: { userId: string; organizationId: string }) {
  return <StudentRtnWorkspace key={`${props.userId}:${props.organizationId}`} {...props} />;
}

function StudentRtnWorkspace({ userId, organizationId }: { userId: string; organizationId: string }) {
  const client = useQueryClient();
  const queryKey = ["rtn-student-workspace", userId, organizationId];
  const query = useQuery({ queryKey, queryFn: getRtnStudentWorkspace, retry: false });
  const [opened, setOpened] = useState<OpenTraining | null>(null);
  const closeReady = useRef(true);
  const [closeBlocked, setCloseBlocked] = useState(false);
  const onCloseReadiness = useCallback((ready: boolean) => {
    closeReady.current = ready;
    if (ready) setCloseBlocked(false);
  }, []);
  useRtnNavigationGuard({ open: !!opened, isCloseReadyRef: closeReady, onBlocked: () => setCloseBlocked(true) });
  const assignments = query.data?.assignments.filter(item => item.organization_id === organizationId) || [];

  if (query.isPending) return <div role="status" className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Проверяем назначенные программы Ростехнадзора…</div>;
  if (query.isError && (!query.data || !opened)) return <div role="alert" className="space-y-3 rounded-xl border border-border bg-card p-4"><p className="flex items-start gap-2 text-sm"><AlertCircle className="h-4 w-4 shrink-0" />Не удалось загрузить назначенные программы Ростехнадзора. {requestError(query.error)}</p><Button size="sm" variant="outline" disabled={query.isFetching} onClick={() => void query.refetch()} className="gap-2"><RefreshCw className="h-4 w-4" />Повторить</Button></div>;
  if (!query.data?.access.allowed && !opened) return <div className="rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground">Сервер не подтвердил доступ к назначенным программам Ростехнадзора. Обратитесь в учебный центр.</div>;
  if (!assignments.length && !opened) return null;
  const accessConfirmed = !query.isError && query.data?.access.allowed === true
    && (!opened || assignments.some(item => item.id === opened.assignment.id && item.access_allowed));
  const accessChecking = query.isFetching;
  const onRecheckAccess = () => { void query.refetch(); };

  return <section className="min-w-0 space-y-3" aria-label="Назначенные программы Ростехнадзора">
    <div><h2 className="text-lg font-semibold">Назначено: Ростехнадзор</h2><p className="text-sm text-muted-foreground">Учебные модули по официальным вопросам с проверенными учебными ответами</p></div>
    {accessConfirmed && <div className="grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">{assignments.map(assignment => <article key={assignment.id} className="flex min-w-0 flex-col gap-4 rounded-2xl border border-border bg-card p-4 sm:p-5">
      <div className="flex items-start gap-3"><div className="rounded-xl bg-primary/10 p-3 text-primary"><BookOpen className="h-5 w-5" /></div><h3 className="min-w-0 break-words font-semibold">{assignment.code} {assignment.title}</h3></div>
      {assignment.normative_status === "review_required" && <p className="text-sm text-muted-foreground">Редакция проходит повторную нормативную проверку. Новые попытки временно не открываются; начатые попытки и результаты сохранены.</p>}
      {typeof assignment.last_score === "number" && <p className="text-sm text-muted-foreground">Последняя попытка: {assignment.last_score}%{typeof assignment.last_passed === "boolean" ? assignment.last_passed ? " · Зачтено" : " · Не зачтено" : ""}</p>}
      {!assignment.access_allowed ? <p className="text-sm text-muted-foreground">Доступ к обучению сейчас не подтверждён. Обратитесь в учебный центр.</p> : <div className="mt-auto flex flex-wrap gap-2">
        {assignment.last_attempt_id && assignment.status === "completed" ? <><Button size="sm" variant="outline" onClick={() => setOpened({ assignment, mode: "result" })}>Результат</Button><Button size="sm" disabled={assignment.can_start !== true} onClick={() => setOpened({ assignment, mode: "start" })}>Пройти ещё раз</Button></> : <Button size="sm" disabled={!assignment.last_attempt_id && assignment.can_start !== true} onClick={() => setOpened({ assignment, mode: assignment.last_attempt_id ? "resume" : "start" })}>{assignment.last_attempt_id ? "Продолжить" : "Открыть обучение"}</Button>}
      </div>}
    </article>)}</div>}
    {!accessConfirmed && <p role="alert" className="text-sm text-muted-foreground">Не удалось подтвердить доступ. Открытая попытка сохранена в этом окне; действия приостановлены до повторной проверки. <button className="text-primary underline" disabled={query.isFetching} onClick={() => void query.refetch()}>Проверить доступ</button></p>}
    <Dialog open={!!opened} onOpenChange={open => { if (!open) { if (closeReady.current) setOpened(null); else setCloseBlocked(true); } }}><DialogContent className="max-h-[90dvh] w-[calc(100%-1.5rem)] max-w-3xl overflow-y-auto p-4 sm:p-6"><DialogHeader><DialogTitle className="break-words pr-5">{opened?.assignment.code} {opened?.assignment.title}</DialogTitle><DialogDescription>Учебный тренажёр. Не заменяет официальную аттестацию Ростехнадзора.</DialogDescription></DialogHeader>{closeBlocked && <p role="alert" className="text-sm text-destructive">Сохранение ответов или отправка результата ещё не подтверждены. Дождитесь подтверждения или повторите действие перед закрытием.</p>}{opened && <TrainingEntry accessConfirmed={accessConfirmed} accessChecking={accessChecking} onRecheckAccess={onRecheckAccess} onCloseReadiness={onCloseReadiness} key={`${opened.assignment.id}:${opened.mode}`} opened={opened} onUpdated={() => void client.invalidateQueries({ queryKey })} />}</DialogContent></Dialog>
  </section>;
}

function httpsLink(value: string): string | null {
  try {
    const url = new URL(value);
    if (url.username || url.password || url.port) return null;
    return url.protocol === "https:" || (url.protocol === "http:" && ["pravo.gov.ru", "publication.pravo.gov.ru"].includes(url.hostname)) ? url.href : null;
  }
  catch { return null; }
}

function CourseMaterials({ materials }: { materials: RtnMaterial[] }) {
  return <section className="min-w-0 space-y-4" aria-label="Учебные материалы"><h4 className="font-semibold">Учебные материалы</h4>{materials.map(material => <article key={material.id} className="min-w-0 space-y-3 rounded-xl border border-border p-3 sm:p-4"><h5 className="break-words font-medium">{material.title}</h5><p className="whitespace-pre-wrap break-words text-sm leading-relaxed">{material.body}</p>{material.source_refs.length > 0 && <ul className="space-y-2 text-xs text-muted-foreground">{material.source_refs.map((reference, index) => <li key={`${reference.url}:${index}`} className="break-words">{httpsLink(reference.url) ? <a href={httpsLink(reference.url)!} target="_blank" rel="noopener noreferrer" className="text-primary underline underline-offset-4">{reference.citation}</a> : reference.citation}</li>)}</ul>}</article>)}</section>;
}

function AccessRetry({ checking, onRetry }: { checking: boolean; onRetry: () => void }) {
  return <div role="alert" className="space-y-3 text-sm text-muted-foreground"><p>Доступ к обучению перепроверяется. Выбранные ответы и состояние отправки остаются в этом окне.</p><Button variant="outline" disabled={checking} onClick={onRetry}>Проверить доступ</Button></div>;
}

function TrainingEntry({ opened, onUpdated, onCloseReadiness, accessConfirmed, accessChecking, onRecheckAccess }: EntryProps) {
  if (opened.mode !== "start") return <RtnTrainer opened={opened} onUpdated={onUpdated} onCloseReadiness={onCloseReadiness} accessConfirmed={accessConfirmed} accessChecking={accessChecking} onRecheckAccess={onRecheckAccess} />;
  return <TrainingIntroduction opened={opened} onUpdated={onUpdated} onCloseReadiness={onCloseReadiness} accessConfirmed={accessConfirmed} accessChecking={accessChecking} onRecheckAccess={onRecheckAccess} />;
}

// Mounted only after a learner explicitly opens and receives real materials.
// Catalog reads, admin previews and background prefetches do not log activity.
function MaterialActivity({ assignmentId, releaseId }: { assignmentId: string; releaseId: string }) {
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    setError(false);
    void recordRtnMaterialOpen(assignmentId, releaseId).catch(() => { if (active) setError(true); });
    return () => { active = false; };
  }, [assignmentId, releaseId, retry]);
  return error ? <p role="status" className="text-xs text-muted-foreground">Не удалось синхронизировать открытие материалов. <button className="text-primary underline" onClick={() => setRetry(value => value + 1)}>Повторить синхронизацию</button></p> : null;
}

function TrainingIntroduction({ opened, onUpdated, onCloseReadiness, accessConfirmed, accessChecking, onRecheckAccess }: EntryProps) {
  const query = useQuery({ queryKey: ["rtn-assignment-materials", opened.assignment.organization_id, opened.assignment.id], queryFn: () => getRtnAssignment(opened.assignment.id), retry: false, staleTime: 0 });
  const start = useMutation({ mutationFn: async () => hydrateRtnAttempt(await startRtnAttempt(opened.assignment.id)), onSuccess: onUpdated });
  if (start.isSuccess) return <RtnTrainer key={start.data.attempt_id} opened={opened} initialAttempt={start.data} onUpdated={onUpdated} onCloseReadiness={onCloseReadiness} accessConfirmed={accessConfirmed} accessChecking={accessChecking} onRecheckAccess={onRecheckAccess} />;
  if (query.isPending) return <p role="status" className="flex items-center gap-2 py-8 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Загружаем учебные материалы…</p>;
  if (query.isError || !query.data) return <div role="alert" className="space-y-3"><p className="text-sm">{requestError(query.error)}</p><Button variant="outline" disabled={query.isFetching} onClick={() => void query.refetch()}>Повторить загрузку</Button></div>;
  const detail = query.data;
  if (!accessConfirmed) return <AccessRetry checking={accessChecking} onRetry={onRecheckAccess} />;
  return <div className="min-w-0 space-y-5"><p className="text-sm text-muted-foreground">Сначала изучите материалы модуля, затем пройдите учебные вопросы. В этой редакции: {detail.release.question_count} вопросов.</p><p className="break-all text-xs text-muted-foreground">Редакция: {detail.release.id}</p>{httpsLink(detail.source.page_url) && <a href={httpsLink(detail.source.page_url)!} target="_blank" rel="noopener noreferrer" className="inline-block text-sm text-primary underline underline-offset-4">Официальный источник вопросов Ростехнадзора</a>}{detail.materials.length ? <><CourseMaterials materials={detail.materials} /><MaterialActivity assignmentId={opened.assignment.id} releaseId={detail.release.id} /></> : <p role="alert" className="text-sm text-muted-foreground">Учебные материалы этой редакции пока не доступны. Обратитесь к преподавателю.</p>}{detail.assignment.normative_status === "review_required" && <p role="status" className="text-sm text-muted-foreground">Нужна повторная нормативная проверка этой редакции. Новая попытка откроется после выпуска проверенного обновления.</p>}{start.isError && <p role="alert" className="text-sm text-destructive">{requestError(start.error)}</p>}<Button disabled={detail.assignment.can_start !== true || !detail.materials.length || start.isPending || query.isFetching} className="h-auto min-h-10 gap-2 whitespace-normal" onClick={() => start.mutate()}>{start.isPending ? <Loader2 className="h-4 w-4 shrink-0 animate-spin" /> : <ClipboardCheck className="h-4 w-4 shrink-0" />}{start.isError ? "Повторить открытие учебных вопросов" : "Перейти к учебным вопросам"}</Button><p className="text-xs text-muted-foreground">Начатая попытка закрепляется за редакцией. Обновления банка не меняют её вопросы и результат.</p></div>;
}

function initialAnswers(attempt: RtnAttempt): RtnAnswers {
  const answers: RtnAnswers = {};
  for (const question of attempt.questions) {
    const stored = attempt.answers?.[question.id];
    const knownOptions = new Set(question.options.map(option => option.id));
    answers[question.id] = Array.isArray(stored) ? stored.filter(id => knownOptions.has(id)) : [];
  }
  return answers;
}

function RtnTrainer({ opened, onUpdated, initialAttempt, onCloseReadiness, accessConfirmed, accessChecking, onRecheckAccess }: EntryProps & { initialAttempt?: RtnAttempt }) {
  const { assignment, mode } = opened;
  const openInstance = useId();
  const query = useQuery({
    queryKey: ["rtn-training-open", assignment.organization_id, assignment.id, mode, openInstance],
    queryFn: async () => hydrateRtnAttempt(mode !== "start" && assignment.last_attempt_id
      ? await getRtnAttempt(assignment.last_attempt_id) : await startRtnAttempt(assignment.id)),
    enabled: !initialAttempt, retry: false, staleTime: Infinity, gcTime: 0, refetchOnWindowFocus: false,
  });
  const current = initialAttempt || query.data;
  if (query.isPending && !initialAttempt) return <p role="status" className="flex items-center gap-2 py-8 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Открываем учебную попытку…</p>;
  if ((query.isError && !initialAttempt) || !current) return <div role="alert" className="space-y-3"><p className="text-sm">{requestError(query.error)}</p><Button variant="outline" onClick={() => void query.refetch()} disabled={query.isFetching}>Повторить загрузку</Button></div>;
  return <RtnAttemptSession key={current.attempt_id} opened={opened} initialAttempt={current} onUpdated={onUpdated} onCloseReadiness={onCloseReadiness} accessConfirmed={accessConfirmed} accessChecking={accessChecking} onRecheckAccess={onRecheckAccess} />;
}

function RtnAttemptSession({ opened, onUpdated, initialAttempt, onCloseReadiness, accessConfirmed, accessChecking, onRecheckAccess }: EntryProps & { initialAttempt: RtnAttempt }) {
  const { assignment } = opened;
  const [attempt, setAttempt] = useState<RtnAttempt>(initialAttempt);
  const [answers, setAnswers] = useState<RtnAnswers>(() => initialAnswers(initialAttempt));
  const [frozenAnswers, setFrozenAnswers] = useState<RtnAnswers | null>(null);
  const [result, setResult] = useState<RtnSubmission | null>(null);
  const [showQuestions, setShowQuestions] = useState(false);
  const current = attempt;
  const finalResult = result || (current.status === "submitted" ? current as RtnSubmission : null);
  const currentAnswers = answers;
  const submit = useMutation({
    mutationFn: async (payload: { attemptId: string; answers: RtnAnswers }) => {
      try { return await submitRtnAttempt(payload.attemptId, payload.answers); }
      catch (error) {
        // A lost response can follow a successful commit. Read the same attempt before retrying.
        try {
          const confirmed = await getRtnAttempt(payload.attemptId);
          if (confirmed.status === "submitted") {
            setAttempt(confirmed);
            setAnswers(initialAnswers(confirmed));
            return confirmed as RtnSubmission;
          }
        } catch { /* Keep the original error; the exact frozen answers remain retryable. */ }
        throw error;
      }
    },
    onSuccess: confirmed => { setResult(confirmed); onUpdated(); },
  });
  const verify = useMutation({
    mutationFn: () => getRtnAttempt(current!.attempt_id),
    onSuccess: confirmed => {
      if (confirmed.status === "submitted") { setResult(confirmed as RtnSubmission); onUpdated(); }
      else { setAttempt(confirmed); setFrozenAnswers(null); submit.reset(); }
    },
  });
  const feedback = useQuery({
    queryKey: ["rtn-attempt-feedback", assignment.organization_id, finalResult?.attempt_id],
    queryFn: () => getRtnAttempt(finalResult!.attempt_id),
    enabled: accessConfirmed && !!finalResult && !current?.feedback, retry: false,
  });
  const reviewedAttempt = current?.status === "submitted" ? current : feedback.data?.status === "submitted" ? feedback.data : null;
  const reviewedAnswers = reviewedAttempt ? initialAnswers(reviewedAttempt) : {};

  const draft = useRtnDraftSync({
    initial: initialAttempt, answers: currentAnswers, enabled: accessConfirmed && !finalResult && !frozenAnswers, finalized: !!finalResult,
    onReplace: loaded => { setAttempt(loaded); setAnswers(initialAnswers(loaded)); },
    onSubmitted: loaded => { setAttempt(loaded); setAnswers(initialAnswers(loaded)); setResult(loaded as RtnSubmission); onUpdated(); },
  });
  const awaitingSubmission = !!frozenAnswers && !finalResult;
  useEffect(() => {
    if (!awaitingSubmission) return;
    const protect = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", protect);
    return () => window.removeEventListener("beforeunload", protect);
  }, [awaitingSubmission]);
  useEffect(() => {
    onCloseReadiness(!!finalResult || (!awaitingSubmission && !submit.isPending && !verify.isPending && !draft.dirty && draft.state === "saved"));
  }, [draft.dirty, draft.state, !!finalResult, awaitingSubmission, submit.isPending, verify.isPending, onCloseReadiness]);
  useEffect(() => () => onCloseReadiness(true), [onCloseReadiness]);
  if (!accessConfirmed) return <AccessRetry checking={accessChecking} onRetry={onRecheckAccess} />;
  const answered = current.questions.filter(question => question.expected_correct_count ? currentAnswers[question.id]?.length === question.expected_correct_count : currentAnswers[question.id]?.length > 0).length;
  const busy = submit.isPending || verify.isPending;
  const locked = busy || draft.state === "conflict" || !!frozenAnswers || !!finalResult;

  return <div className="min-w-0 space-y-5">
    <h4 className="break-words font-semibold">{current.title || assignment.title}</h4>
    <p className="text-sm text-muted-foreground">В модуле {current.questions.length} вопросов. Это полный состав этой учебной редакции; отдельный модуль может охватывать часть официального перечня. У вопроса может быть несколько правильных вариантов.</p>
    <p className="break-all text-xs text-muted-foreground">Редакция: {current.release_id}</p>
    {!!current.materials?.length && <><CourseMaterials materials={current.materials} />{!finalResult && <MaterialActivity assignmentId={assignment.id} releaseId={current.release_id} />}</>}
    {finalResult ? <section aria-label="Результат учебной попытки" className="space-y-3 rounded-xl border border-border bg-muted/30 p-4"><h4 className="flex items-center gap-2 font-semibold"><CheckCircle2 className="h-5 w-5 shrink-0 text-primary" />{finalResult.passed ? "Зачтено" : "Не зачтено"}</h4><p className="text-xl font-semibold">{finalResult.score}% · {finalResult.correct} из {finalResult.total}</p><p className="text-sm text-muted-foreground">Результат сохранён на сервере и доступен преподавателю. Предыдущие попытки сохранены.</p><Button variant="outline" size="sm" disabled={!reviewedAttempt?.answers} onClick={() => setShowQuestions(value => !value)}>{showQuestions ? "Скрыть свои ответы" : "Посмотреть свои ответы"}</Button></section> : <p role="status" className="text-sm text-muted-foreground">Ответов: {answered} из {current.questions.length}. Для отправки ответьте на все вопросы.</p>}
    {(!finalResult || showQuestions) && <div className="space-y-4">{current.questions.map((question, index) => <fieldset key={question.id} disabled={locked} className="min-w-0 space-y-3 rounded-xl border border-border p-3 sm:p-4"><legend className="max-w-full break-words px-1 text-sm font-medium">{question.number || index + 1}. {question.text}</legend><p className="text-xs text-muted-foreground">{question.expected_correct_count === 1 ? "Выберите один вариант." : question.expected_correct_count ? `Выберите вариантов: ${question.expected_correct_count}.` : "Можно выбрать несколько вариантов."}{question.options_origin === "authorial_training" ? " Варианты ответов разработаны СИНТАГМОЙ для подготовки." : ""}</p>{question.options.map(option => <label key={option.id} className="flex min-w-0 cursor-pointer items-start gap-3 rounded-lg border border-border px-3 py-3 text-sm has-[:checked]:bg-primary/5"><Checkbox checked={((finalResult ? reviewedAnswers : currentAnswers)[question.id] || []).includes(option.id)} disabled={locked} onCheckedChange={checked => {
      if (locked) return;
      setAttempt(current);
      setAnswers(previous => {
        const base = previous;
        return { ...base, [question.id]: checked === true ? question.expected_correct_count === 1 ? [option.id] : [...(base[question.id] || []), option.id] : (base[question.id] || []).filter(id => id !== option.id) };
      });
    }} /><span className="min-w-0 break-words">{option.text}</span></label>)}</fieldset>)}</div>}
    {!finalResult && <div className="space-y-2 text-xs text-muted-foreground" aria-label="Сохранение ответов">
      {draft.state === "saving" ? <p role="status">Сохраняем ответы на сервере…</p> : draft.state === "saved" ? <p role="status">{draft.dirty ? "Есть несохранённые ответы. Дождитесь синхронизации перед закрытием." : "Ответы сохранены на сервере. Можно продолжить на другом устройстве."}</p> : <div role="alert" className="space-y-2"><p>{requestError(draft.error)}</p>{draft.state === "conflict" ? <><p>Загрузка заменит выбор в этом окне сохранёнными ответами. Другую попытку и старые результаты она не меняет.</p><Button variant="outline" size="sm" onClick={() => void draft.reload()}>Загрузить ответы с сервера</Button></> : <><p>Пока ответы доступны в этом окне. Не закрывайте его до успешного сохранения.</p><Button variant="outline" size="sm" onClick={draft.retry}>Повторить сохранение ответов</Button></>}</div>}
    </div>}
    {submit.isError && <div role="alert" className="space-y-2 text-sm"><p>{requestError(submit.error)}</p><p className="text-muted-foreground">Выбранные ответы сохранены в этом окне. Повторная отправка использует ту же попытку и те же ответы.</p><Button size="sm" variant="outline" disabled={busy} onClick={() => verify.mutate()}>Проверить отправку</Button></div>}
    {verify.isError && <p role="alert" className="text-sm text-destructive">{requestError(verify.error)}</p>}
    {finalResult && (current.feedback || feedback.data?.feedback)?.length > 0 && <section className="space-y-3" aria-label="Разбор учебной попытки"><h4 className="font-semibold">Разбор и нормативные основания</h4>{(current.feedback || feedback.data?.feedback || []).map(item => <article key={item.id} className="space-y-2 rounded-xl border border-border p-3"><p className="text-xs text-muted-foreground">Вопрос {current.questions.find(question => question.id === item.id)?.number || ""}</p>{item.explanation && <p className="whitespace-pre-wrap break-words text-sm">{item.explanation}</p>}{item.evidence.map((reference, index) => <p key={`${reference.url}:${index}`} className="break-words text-xs">{httpsLink(reference.url) ? <a href={httpsLink(reference.url)!} target="_blank" rel="noopener noreferrer" className="text-primary underline underline-offset-4">{reference.citation}</a> : reference.citation}</p>)}</article>)}</section>}
    {finalResult && feedback.isError && <p className="text-xs text-muted-foreground">Результат сохранён; подробный разбор пока не загрузился. <button className="text-primary underline" onClick={() => void feedback.refetch()}>Загрузить разбор</button></p>}
    {!finalResult && <Button className="h-auto min-h-10 gap-2 whitespace-normal" disabled={busy || draft.state === "conflict" || answered !== current.questions.length} onClick={() => {
      const payload = frozenAnswers || Object.fromEntries(current.questions.map(question => [question.id, [...(currentAnswers[question.id] || [])]]));
      setFrozenAnswers(payload);
      submit.mutate({ attemptId: current.attempt_id, answers: payload });
    }}>{submit.isPending ? <Loader2 className="h-4 w-4 shrink-0 animate-spin" /> : <ClipboardCheck className="h-4 w-4 shrink-0" />}{submit.isError ? "Повторить отправку" : "Завершить и отправить результат"}</Button>}
  </div>;
}
