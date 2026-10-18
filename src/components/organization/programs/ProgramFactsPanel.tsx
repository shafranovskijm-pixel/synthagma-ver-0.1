import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { OrgDocumentVersionsDialog } from "@/components/organization/OrgDocumentVersionsDialog";
import { useCourseProgramBinding, useProgramFacts } from "@/hooks/useProgramFacts";
import { emptyProgramFacts, programFactsReady, programFactsSchema, programFactStateLabels, programTypeLabels, trainingFormLabels,
  type ProgramEnvelope, type ProgramFacts, type ProgramVersion } from "@/lib/programFacts";

interface Props { organizationId: string; canConfigure?: boolean; courses?: Array<{ id: string; title: string }> }
type Draft = { programId: string; baseRevision: number; name: string; description: string; fileVersionId: string; reviewerId: string; facts: ProgramFacts };
const textFields = [
  ["full_title", "Полное наименование по программе"], ["duration_calendar", "Продолжительность по календарю"],
  ["attestation_form", "Форма аттестации"], ["attestation_criteria", "Критерии аттестации"],
  ["qualification", "Квалификация, если предусмотрена"], ["profession", "Профессия, если предусмотрена"],
] as const;
const actionClass = "max-w-full h-auto min-h-9 whitespace-normal";
const display = (value: string | number | boolean | null | undefined) => value === null || value === undefined || value === "" ? "Не указано" : value === true ? "Да" : value === false ? "Нет" : String(value);

export function ProgramFactsSummary({ version }: { version: ProgramVersion }) {
  const facts = version.facts;
  return <div className="space-y-2 text-sm">
    <div className="flex flex-wrap gap-2"><Badge variant="outline">Версия {version.version_number}</Badge><Badge variant="secondary">{programFactStateLabels[version.state]}</Badge></div>
    <dl className="grid gap-2 sm:grid-cols-2">
      {[["Полное наименование", facts.full_title], ["Вид программы", facts.program_type ? programTypeLabels[facts.program_type] : null],
        ["Академические часы", facts.academic_hours], ["Форма обучения", facts.training_form ? trainingFormLabels[facts.training_form] : null],
        ["Электронное обучение", facts.uses_elearning], ["Дистанционные технологии", facts.uses_distance_learning],
        ...textFields.slice(1).map(([key, label]) => [label, facts[key]])].map(([label, value]) => <div key={String(label)} className="min-w-0"><dt className="text-xs text-muted-foreground">{String(label)}</dt><dd className="break-words whitespace-pre-wrap">{display(value)}</dd></div>)}
    </dl>
    <p className="text-xs text-muted-foreground">Файл согласован внутри центра: № {version.file_approval.number} от {version.file_approval.date}. Проверяющий сведений программы: {version.reviewer_name}.</p>
    {version.approved_at && <p className="text-xs text-muted-foreground">Утверждение сведений записано: {version.approved_at}.</p>}
    {version.note && <p className="text-sm whitespace-pre-wrap">Комментарий: {version.note}</p>}
  </div>;
}

export function ProgramFactsPanel({ organizationId, canConfigure = false, courses = [] }: Props) {
  const h = useProgramFacts(organizationId, canConfigure);
  const [programId, setProgramId] = useState("");
  const [versionId, setVersionId] = useState("");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [note, setNote] = useState("");
  const [fileHistory, setFileHistory] = useState<{ id: string; name: string } | null>(null);
  useEffect(() => { setProgramId(""); setVersionId(""); setDraft(null); setNote(""); setFileHistory(null); }, [organizationId]);
  const program = h.programs?.find(p => p.program.id === programId) ?? null;
  const version = program?.versions.find(v => v.id === versionId) ?? program?.current_version ?? null;
  const current = !!version && version.id === program?.current_version?.id;
  const disabled = h.loading || h.saving || h.conflict || h.denied;
  const draftChanged = !!draft && !!h.programs && (h.programs.find(p => p.program.id === draft.programId)?.program.revision ?? 0) !== draft.baseRevision;
  const approved = (h.programs ?? []).flatMap(p => p.versions.filter(v => v.state === "approved").map(v => ({ version: v, name: p.program.name })));
  const startDraft = (source?: ProgramEnvelope | null, sourceVersion?: ProgramVersion | null) => {
    setDraft({ programId: source?.program.id ?? crypto.randomUUID(), baseRevision: source?.program.revision ?? 0, name: source?.program.name ?? "", description: source?.program.description ?? "",
      fileVersionId: "", reviewerId: "", facts: sourceVersion ? { ...sourceVersion.facts } : emptyProgramFacts() });
  };
  const setFact = (field: keyof ProgramFacts, value: unknown) => setDraft(previous => previous ? { ...previous, facts: { ...previous.facts, [field]: value } } : previous);
  const saveDraft = async () => {
    if (!draft || draftChanged) return;
    const stableId = draft.programId;
    const { baseRevision: _baseRevision, ...input } = draft;
    if (await h.createVersion({ ...input, description: draft.description.trim() })) {
      setProgramId(stableId); setVersionId(""); setDraft(null);
    }
  };
  return <Card><CardContent className="py-4 space-y-4">
    <div className="flex items-start justify-between gap-3 flex-wrap"><div><h2 className="font-semibold">Программы и версии</h2><p className="text-sm text-muted-foreground">Согласование файла и проверка сведений программы — отдельные действия. Связь с курсом применяется к будущим группам; сведения уже зафиксированных групп сохраняются.</p></div>
      {canConfigure && <Button variant="outline" size="sm" className={actionClass} disabled={disabled || !!draft} onClick={() => startDraft()}>Добавить программу</Button>}
    </div>
    {h.error && <div role="alert" className="rounded-lg border p-3 space-y-2 text-sm"><p>{h.error}</p><Button variant="outline" size="sm" disabled={h.saving || h.loading} onClick={() => void h.reload()}>Повторить загрузку программ</Button></div>}
    {h.candidatesError && <p role="alert" className="text-sm text-muted-foreground">{h.candidatesError}</p>}
    {h.loading && <p role="status" className="flex items-center gap-2 text-sm"><Loader2 className="w-4 h-4 animate-spin" />Загрузка программ…</p>}
    {!h.loading && h.programs?.length === 0 && <p className="text-sm text-muted-foreground">Версии программы со сведениями пока не созданы. Прежние файлы и доступ к обучению сохраняются.</p>}
    {!!h.programs?.length && <div className="space-y-2"><Label htmlFor="program-facts-program">Программа</Label><Select value={programId} onValueChange={value => { setProgramId(value); setVersionId(""); setNote(""); }} disabled={h.saving}><SelectTrigger id="program-facts-program"><SelectValue placeholder="Выберите программу" /></SelectTrigger><SelectContent>{h.programs.map(p => <SelectItem key={p.program.id} value={p.program.id}>{p.program.name}</SelectItem>)}</SelectContent></Select></div>}
    {program && <div className="rounded-lg border p-3 space-y-3">
      {program.versions.length > 0 ? <><Label htmlFor="program-facts-version">Версия программы</Label><Select value={version?.id ?? ""} onValueChange={setVersionId} disabled={h.saving}><SelectTrigger id="program-facts-version"><SelectValue /></SelectTrigger><SelectContent>{program.versions.map(v => <SelectItem key={v.id} value={v.id}>Версия {v.version_number} · {programFactStateLabels[v.state]}</SelectItem>)}</SelectContent></Select></> : <p className="text-sm text-muted-foreground">У прежней записи пока нет подтверждённых сведений программы.</p>}
      {version && <><ProgramFactsSummary version={version} /><p className="text-xs text-muted-foreground">Это внутренняя запись центра, а не электронная подпись или оценка юридической готовности.</p>
        <Button size="sm" variant="outline" onClick={() => setFileHistory({ id: version.file_document_id, name: "Файл программы" })}>История файла программы</Button>
        {!current && <p className="text-sm text-muted-foreground">История версии. Новая редакция не изменяет прежнее утверждение и сведения групп.</p>}
        {current && canConfigure && <div className="space-y-3 border-t pt-3">
          {(program.capabilities.can_approve || program.capabilities.can_reject || program.capabilities.can_cancel) && <div className="space-y-2"><Label htmlFor="program-facts-note">Комментарий к решению</Label><Textarea id="program-facts-note" value={note} onChange={e => setNote(e.target.value)} maxLength={4000} disabled={disabled} /></div>}
          <div className="flex flex-wrap gap-2">
            {program.capabilities.can_submit && <Button className={actionClass} disabled={disabled || !programFactsReady(version.facts)} onClick={() => void h.transition(program.program.id, version.id, "submit", note)}>Передать сведения на проверку</Button>}
            {program.capabilities.can_approve && <Button className={actionClass} disabled={disabled || !programFactsReady(version.facts)} onClick={() => void h.transition(program.program.id, version.id, "approve", note)}>Утвердить сведения этой версии</Button>}
            {program.capabilities.can_reject && <Button variant="outline" className={actionClass} disabled={disabled || !note.trim()} onClick={() => void h.transition(program.program.id, version.id, "reject", note)}>Вернуть с замечанием</Button>}
            {program.capabilities.can_cancel && <Button variant="ghost" className={actionClass} disabled={disabled} onClick={() => void h.transition(program.program.id, version.id, "cancel", note)}>Отменить редакцию</Button>}
          </div>
          {!programFactsReady(version.facts) && <p className="text-sm text-muted-foreground">Для проверки нужны наименование, вид программы, академические часы, форма и продолжительность обучения, форма и критерии аттестации. Добавьте их в новую версию.</p>}
        </div>}
      </>}
      {canConfigure && program.capabilities.can_create_version && <Button variant="outline" className={actionClass} disabled={disabled || !!draft} onClick={() => startDraft(program, version)}>Создать новую версию сведений</Button>}
    </div>}
    {draft && <div className="rounded-lg border p-3 space-y-3">
      <h3 className="font-medium">Новая версия сведений программы</h3><p className="text-xs text-muted-foreground">Значения внесите по программе. Неизвестные сведения можно оставить незаполненными; сохранение черновика не означает их утверждения. Сохранённая версия не редактируется — изменения создают следующую.</p>
      <div className="space-y-2"><Label htmlFor="program-name">Название записи программы</Label><Input id="program-name" value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })} maxLength={500} disabled={disabled} /></div>
      <div className="space-y-2"><Label htmlFor="program-description">Описание записи</Label><Textarea id="program-description" value={draft.description} onChange={e => setDraft({ ...draft, description: e.target.value })} maxLength={4000} disabled={disabled} /></div>
      <div className="space-y-2"><Label htmlFor="program-file">Согласованная версия файла</Label><Select value={draft.fileVersionId} onValueChange={value => setDraft({ ...draft, fileVersionId: value })} disabled={disabled || !h.candidates}><SelectTrigger id="program-file"><SelectValue placeholder="Выберите файл после внутреннего согласования" /></SelectTrigger><SelectContent>{h.candidates?.files.map(f => <SelectItem key={f.version_id} value={f.version_id}>{f.document_name} · v{f.version_number} · № {f.approval.number} от {f.approval.date}</SelectItem>)}</SelectContent></Select>
        {h.candidates?.files.length === 0 && <p className="text-xs text-muted-foreground">Сначала загрузите файл в «Документы организации» и завершите внутреннее согласование его версии.</p>}
      </div>
      <div className="space-y-2"><Label htmlFor="program-reviewer">Проверяющий сведения программы</Label><Select value={draft.reviewerId} onValueChange={value => setDraft({ ...draft, reviewerId: value })} disabled={disabled || !h.candidates}><SelectTrigger id="program-reviewer"><SelectValue placeholder="Выберите сотрудника центра" /></SelectTrigger><SelectContent>{h.candidates?.reviewers.map(r => <SelectItem key={r.user_id} value={r.user_id}>{r.display_name}</SelectItem>)}</SelectContent></Select></div>
      {textFields.map(([field, label]) => <div className="space-y-2" key={field}><Label htmlFor={`program-${field}`}>{label}</Label><Textarea id={`program-${field}`} value={draft.facts[field] ?? ""} onChange={e => setFact(field, e.target.value || null)} maxLength={4000} rows={field === "attestation_criteria" ? 3 : 2} disabled={disabled} /></div>)}
      <div className="space-y-2"><Label htmlFor="program-type">Вид программы</Label><Select value={draft.facts.program_type ?? "unknown"} onValueChange={value => setFact("program_type", value === "unknown" ? null : value)} disabled={disabled}><SelectTrigger id="program-type"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="unknown">Не указано</SelectItem>{Object.entries(programTypeLabels).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></div>
      <div className="space-y-2"><Label htmlFor="program-hours">Академические часы</Label><Input id="program-hours" type="number" min={1} max={999999} step={1} value={draft.facts.academic_hours ?? ""} onChange={e => setFact("academic_hours", e.target.value === "" ? null : Number(e.target.value))} disabled={disabled} /></div>
      <div className="space-y-2"><Label htmlFor="program-form">Форма обучения</Label><Select value={draft.facts.training_form ?? "unknown"} onValueChange={value => setFact("training_form", value === "unknown" ? null : value)} disabled={disabled}><SelectTrigger id="program-form"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="unknown">Не указано</SelectItem>{Object.entries(trainingFormLabels).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></div>
      {([ ["uses_elearning", "Электронное обучение"], ["uses_distance_learning", "Дистанционные технологии"] ] as const).map(([field, label]) => <div className="space-y-2" key={field}><Label htmlFor={`program-${field}`}>{label}</Label><Select value={draft.facts[field] === null ? "unknown" : String(draft.facts[field])} onValueChange={value => setFact(field, value === "unknown" ? null : value === "true")} disabled={disabled}><SelectTrigger id={`program-${field}`}><SelectValue /></SelectTrigger><SelectContent><SelectItem value="unknown">Не указано</SelectItem><SelectItem value="true">Да</SelectItem><SelectItem value="false">Нет</SelectItem></SelectContent></Select></div>)}
      {!programFactsSchema.safeParse(draft.facts).success && <p role="alert" className="text-sm">Проверьте сведения: часы должны быть положительным целым числом.</p>}
      {draftChanged && <p role="alert" className="text-sm">После открытия формы появилась другая запись программы. Предыдущее сохранение могло завершиться. Закройте форму и проверьте историю перед созданием следующей версии.</p>}
      <div className="flex flex-wrap gap-2"><Button className={actionClass} disabled={disabled || draftChanged || !h.programs || !draft.name.trim() || !draft.fileVersionId || !draft.reviewerId || !h.candidates || !programFactsSchema.safeParse(draft.facts).success} onClick={() => void saveDraft()}>Сохранить новую версию сведений</Button><Button variant="ghost" disabled={h.saving} onClick={() => setDraft(null)}>Закрыть без сохранения</Button></div>
    </div>}
    <CourseProgramBindingPanel organizationId={organizationId} courses={courses} approved={approved} canConfigure={canConfigure && !!h.candidates && !h.denied} />
    <OrgDocumentVersionsDialog open={!!fileHistory} onOpenChange={open => { if (!open) setFileHistory(null); }} organizationId={organizationId} documentId={fileHistory?.id ?? null} documentName={fileHistory?.name ?? "Файл программы"} canWrite={canConfigure} />
  </CardContent></Card>;
}

function CourseProgramBindingPanel({ organizationId, courses, approved, canConfigure }: { organizationId: string; courses: Array<{ id: string; title: string }>; approved: Array<{ version: ProgramVersion; name: string }>; canConfigure: boolean }) {
  const [courseId, setCourseId] = useState(""); const [versionId, setVersionId] = useState("");
  const h = useCourseProgramBinding(organizationId, courseId || null, canConfigure);
  useEffect(() => { setCourseId(""); setVersionId(""); }, [organizationId]);
  useEffect(() => { setVersionId(""); }, [courseId]);
  const bound = approved.find(v => v.version.id === h.data?.binding?.version_id);
  return <details className="border-t pt-3"><summary className="cursor-pointer text-sm font-medium">Программа курса для будущих групп</summary><div className="pt-3 space-y-3">
    <p className="text-xs text-muted-foreground">Смена этой связи не обновляет ранее зафиксированные сведения группы или ученика.</p>
    <Label htmlFor="program-course">Курс</Label><Select value={courseId} onValueChange={setCourseId} disabled={h.saving}><SelectTrigger id="program-course"><SelectValue placeholder="Выберите курс" /></SelectTrigger><SelectContent>{courses.map(c => <SelectItem key={c.id} value={c.id}>{c.title}</SelectItem>)}</SelectContent></Select>
    {h.loading && <p role="status" className="text-sm">Загрузка связи курса…</p>}
    {h.error && <div role="alert" className="text-sm space-y-2"><p>{h.error}</p><Button variant="outline" size="sm" disabled={h.saving} onClick={() => void h.reload()}>Обновить связь курса</Button></div>}
    {courseId && h.data && !h.loading && <p className="text-sm">{h.data.binding ? bound ? `Связано: ${bound.name}, версия ${bound.version.version_number}.` : "У курса есть сохранённая связь с версией программы. Сведения этой версии сейчас недоступны." : "У курса пока нет подтверждённой связи с версией программы."}</p>}
    {canConfigure && courseId && <><Label htmlFor="course-program-version">Утверждённая версия для курса</Label><Select value={versionId} onValueChange={setVersionId} disabled={h.saving}><SelectTrigger id="course-program-version"><SelectValue placeholder="Выберите утверждённые сведения" /></SelectTrigger><SelectContent>{approved.map(v => <SelectItem key={v.version.id} value={v.version.id}>{v.name} · версия {v.version.version_number}</SelectItem>)}</SelectContent></Select><Button className={actionClass} disabled={h.loading || h.saving || !!h.error || !h.data || !versionId || versionId === h.data.binding?.version_id} onClick={() => void h.bind(versionId)}>Связать с курсом для будущих групп</Button></>}
  </div></details>;
}
