import { useEffect, useRef, useState } from "react";
import { ClipboardList, FileText, History, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { useStaffPermissions } from "@/hooks/useStaffPermissions";
import { isCurrentOrganizationAccess, useDocumentActionPermissions } from "@/hooks/useDocumentActionPermissions";
import { useEducationComplianceProfile } from "@/hooks/useEducationComplianceProfile";
import { useDocumentApplicabilityDecisions, type DocumentApplicabilitySnapshot } from "@/hooks/useDocumentApplicabilityDecisions";
import { COMPLIANCE_STAGES, type ApplicabilityDecision, type EvaluatedRequirement } from "@/lib/uc-compliance/model";
import { COMPLIANCE_CATALOG_VERSION, STAGE_GUIDANCE } from "@/lib/uc-compliance/catalog";
import { evaluateRequirements } from "@/lib/uc-compliance/evaluate";
import { PublicationCalendarPanel } from "./PublicationCalendarPanel";
import { EducationProfileDialog } from "./EducationProfileDialog";
import { NormativeGovernancePanel } from "./NormativeGovernancePanel";
import { AssignedGroupDocumentsNotice } from "../AssignedGroupDocumentsNotice";
import { PreparationDetailsDialog } from "./PreparationDetailsDialog";
import { preparationPlan } from "@/lib/uc-compliance/preparationCatalog";
import type { OrgDocument } from "@/hooks/useOrgDocumentsManager";
import { compliancePreparation, groupDocumentSelectionPath, isGroupDocumentTask } from "@/lib/organization/complianceTaskNavigation";

const DECISION_LABELS = { applicable: "Применяется", not_applicable: "Не применяется" };
const dateLabel = (value: string) => Number.isFinite(Date.parse(value)) ? new Date(value).toLocaleString("ru-RU") : "Дата не подтверждена";
const taskHref = (destination: string) => `/organization?tab=documents&documentView=${encodeURIComponent(destination)}`;

function DecisionDialog({ task, current, decisions, canWrite, profileRevision, onClose, onReload }: {
  task: EvaluatedRequirement; current: DocumentApplicabilitySnapshot | undefined; decisions: ReturnType<typeof useDocumentApplicabilityDecisions>;
  canWrite: boolean; profileRevision: number; onClose: () => void; onReload: () => void;
}) {
  const [choice, setChoice] = useState<string>("");
  const [reason, setReason] = useState("");
  const [history, setHistory] = useState<DocumentApplicabilitySnapshot[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true), [historyError, setHistoryError] = useState(false), [more, setMore] = useState(false);
  const alive = useRef(true), historyRead = useRef(decisions.loadHistory); historyRead.current = decisions.loadHistory;
  const loadHistory = async (before: number | null = null) => {
    setHistoryLoading(true); setHistoryError(false);
    const rows = await historyRead.current(task.requirement.id, before);
    if (!alive.current) return;
    setHistoryLoading(false);
    if (!rows) { setHistoryError(true); return; }
    setHistory(previous => before === null ? rows : [...previous, ...rows]); setMore(rows.length === 25);
  };
  useEffect(() => { alive.current = true; void loadHistory(); return () => { alive.current = false; }; }, []);
  return <Dialog open onOpenChange={open => { if (!open && !decisions.saving) onClose(); }}><DialogContent className="max-w-xl max-h-[90dvh] overflow-y-auto rounded-2xl">
    <DialogHeader><DialogTitle>Решение центра</DialogTitle><DialogDescription>{task.requirement.label}</DialogDescription></DialogHeader>
    <p className="text-sm text-muted-foreground">Обоснование сохраняется с версией профиля и каталога. Это решение центра, а не подтверждение регулятора. Файлы и прежняя история сохраняются.</p>
    {current && <div className="rounded-lg border p-3 text-sm space-y-1"><p className="font-medium">Последнее решение: {current.decision ? DECISION_LABELS[current.decision] : "Отозвано"}</p>
      <p className="whitespace-pre-wrap break-words">{current.reason}</p><p className="text-xs text-muted-foreground">Версия профиля {current.profile_revision} · {dateLabel(current.decided_at)}</p>
      {(current.profile_revision !== profileRevision || current.catalog_version !== COMPLIANCE_CATALOG_VERSION) && <p className="text-amber-700">Профиль или каталог изменился. Это решение требует пересмотра и не подменяет текущую оценку.</p>}
    </div>}
    {!profileRevision && <p className="text-sm text-muted-foreground">Сначала сохраните профиль центра.</p>}
    {canWrite && <fieldset disabled={decisions.saving || decisions.conflict || decisions.uncertain || !profileRevision} className="space-y-3">
      <div className="space-y-1.5"><Label>Новое решение</Label><Select value={choice} onValueChange={setChoice}><SelectTrigger aria-label="Новое решение"><SelectValue placeholder="Выберите решение" /></SelectTrigger><SelectContent>
        <SelectItem value="applicable">Применяется</SelectItem><SelectItem value="not_applicable">Не применяется</SelectItem>
        {current?.decision && <SelectItem value="withdraw">Отозвать прежнее решение</SelectItem>}
      </SelectContent></Select></div>
      <div className="space-y-1.5"><Label htmlFor="document-applicability-reason">Обоснование</Label><Textarea id="document-applicability-reason" value={reason} onChange={event => setReason(event.target.value)} maxLength={4000} placeholder="Укажите обстоятельства и основание решения" /></div>
    </fieldset>}
    {decisions.error && <p role="alert" className="text-sm text-destructive">{decisions.error}</p>}
    <div className="flex flex-wrap justify-end gap-2">
      {(decisions.conflict || decisions.uncertain) && <Button variant="outline" disabled={decisions.saving} onClick={onReload}>Загрузить сохранённые данные</Button>}
      <Button variant="outline" disabled={decisions.saving} onClick={onClose}>Закрыть</Button>
      {canWrite && <Button disabled={!choice || !reason.trim() || !profileRevision || decisions.saving || decisions.conflict} onClick={async () => {
        const decision = choice === "withdraw" ? null : choice as "applicable" | "not_applicable";
        if (await decisions.save(task.requirement.id, decision, reason)) onClose();
      }}>{decisions.saving ? "Сохранение…" : decisions.uncertain ? "Повторить сохранение" : "Сохранить решение"}</Button>}
    </div>
    <details className="border-t pt-3"><summary className="cursor-pointer text-sm font-medium">История решений</summary><div className="mt-3 space-y-3">
      {historyLoading && <p className="text-sm text-muted-foreground">Загрузка истории…</p>}
      {historyError && <div role="alert"><p className="text-sm text-destructive">Не удалось загрузить историю решений.</p><Button variant="outline" size="sm" onClick={() => void loadHistory()}>Повторить</Button></div>}
      {!historyLoading && !historyError && history.length === 0 && <p className="text-sm text-muted-foreground">Решений пока нет.</p>}
      {history.map(row => <div key={row.revision} className="rounded-lg border p-3 text-sm space-y-1"><p>{row.decision ? DECISION_LABELS[row.decision] : "Решение отозвано"} · запись {row.revision}</p>
        <p className="whitespace-pre-wrap break-words">{row.reason}</p><p className="text-xs text-muted-foreground">{dateLabel(row.decided_at)} · профиль {row.profile_revision} · {row.catalog_version}</p></div>)}
      {more && !historyLoading && <Button variant="outline" size="sm" onClick={() => void loadHistory(history.at(-1)?.revision ?? null)}>Более ранние решения</Button>}
    </div></details>
  </DialogContent></Dialog>;
}

interface Props {
  organizationId: string; organization: Record<string, unknown> | null; documents: OrgDocument[];
  onUpload: (type: string) => void; onHistory: (document: OrgDocument) => void; onArchive: () => void;
  onSelfExamination?: () => void; canWrite?: boolean;
}
export function EducationCenterAssistant(props: Props) {
  const permissions = useStaffPermissions();
  const action = useDocumentActionPermissions(props.organizationId);
  const ready = isCurrentOrganizationAccess(permissions, props.organizationId);
  const scopedTeacher = permissions.orgRole === "teacher" && !permissions.isOrgOwner;
  const canRead = ready && !scopedTeacher && permissions.can("documents.read");
  const canWrite = canRead && action.canWrite && props.canWrite !== false;
  const profile = useEducationComplianceProfile(props.organizationId, canRead, canWrite);
  const decisions = useDocumentApplicabilityDecisions(props.organizationId, profile.data?.revision ?? null, COMPLIANCE_CATALOG_VERSION, canRead && !!profile.data, canWrite);
  const [profileOpen, setProfileOpen] = useState(false), [selectedTask, setSelectedTask] = useState<string | null>(null);
  const [preparationTask, setPreparationTask] = useState<{ organizationId: string; profileRevision: number; id: string } | null>(null);
  useEffect(() => { setProfileOpen(false); setSelectedTask(null); }, [props.organizationId]);
  useEffect(() => { setPreparationTask(null); }, [props.organizationId, profile.data?.revision]);
  if (scopedTeacher) return <AssignedGroupDocumentsNotice />;
  if (profile.denied || decisions.denied) return <div className="bg-card rounded-2xl border border-border p-6 space-y-3"><p className="text-sm text-muted-foreground">Профиль и решения центра доступны сотрудникам с правом работы с документами всей организации. Обновите данные после изменения доступа.</p><Button variant="outline" onClick={() => { void profile.reload(); void decisions.reload(); }}>Обновить доступ</Button></div>;
  if (!ready || !canRead) return null;
  const mapped: ApplicabilityDecision[] = (decisions.data ?? []).map(row => ({
    requirementId: row.requirement_id, catalogVersion: row.catalog_version, profileRevision: row.profile_revision,
    decision: row.decision, reason: row.reason, decidedAt: row.decided_at, decidedBy: row.decided_by,
  }));
  const evaluation = profile.data && decisions.data ? evaluateRequirements(profile.data.profile, {
    profileRevision: profile.data.revision, documents: props.documents, decisions: mapped,
  }) : null;
  const selected = evaluation?.requirements.find(task => task.requirement.id === selectedTask);
  const canConfigure = permissions.canSeeOrgTab("settings") && permissions.can("settings.write");
  const canOpenGroups = permissions.canSeeOrgTab("students") && permissions.can("students.read");
  const destinationAllowed = (destination: string) => destination === "journals" ? permissions.can("journals.read") : destination === "counterparties" ? permissions.can("companies.read") : true;
  const reload = () => { setSelectedTask(null); setPreparationTask(null); void profile.reload(); void decisions.reload(); };
  const prepared = preparationTask?.organizationId === props.organizationId && preparationTask.profileRevision === profile.data?.revision
    ? evaluation?.requirements.find(task => task.requirement.id === preparationTask.id) : null;
  const preparedDocument = prepared ? props.documents.find(row => row.id === prepared.documentId && !row.deleted_at)
    ?? props.documents.find(row => !row.deleted_at && [prepared.requirement.typeId, ...prepared.requirement.existingDocTypes].includes(row.type)) : undefined;
  const preparedTool = prepared ? compliancePreparation(prepared.requirement.id) : null;
  const preparedWorkflow = prepared && isGroupDocumentTask(prepared.requirement.id)
    ? canOpenGroups ? { href: groupDocumentSelectionPath(), label: "Выбрать группу и документы" } : null
    : preparedTool ? canConfigure ? { href: preparedTool.href, label: preparedTool.label } : null
    : prepared && prepared.requirement.existingDestination !== "org" && destinationAllowed(prepared.requirement.existingDestination)
      ? { href: taskHref(prepared.requirement.existingDestination), label: "Открыть рабочий раздел" } : null;
  return <section className="space-y-4" aria-label="Что нужно моему центру">
    <div className="bg-card rounded-2xl border border-border p-6 space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3"><div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center shrink-0"><ClipboardList className="w-6 h-6 text-primary" /></div>
          <div><h3 className="text-lg font-semibold">Что нужно моему центру</h3><p className="text-sm text-muted-foreground">Профиль центра, задачи и основания по этапам работы.</p></div></div>
        <Button variant="outline" disabled={!profile.data || profile.loading} onClick={() => setProfileOpen(true)}>{canWrite ? "Уточнить профиль" : "Посмотреть профиль"}</Button>
      </div>
      <p className="text-sm text-muted-foreground flex gap-2"><Info className="w-4 h-4 shrink-0 mt-0.5" />Наличие файла не подтверждает его утверждение, содержание или правовую готовность центра. Неизвестные сведения требуют уточнения.</p>
      {(profile.loading || decisions.loading) && <p className="text-sm text-muted-foreground" role="status">Загрузка профиля и решений…</p>}
      {(profile.error || decisions.error) && !selected && <div className="space-y-2"><p role="alert" className="text-sm text-destructive">{profile.error || decisions.error}</p><Button variant="outline" size="sm" onClick={reload}>Повторить загрузку</Button></div>}
      {evaluation && <>
        <div className="flex flex-wrap gap-2 text-sm"><Badge variant="secondary">Применяется: {evaluation.summary.applicable}</Badge><Badge variant="secondary">Нужно уточнить: {evaluation.summary.needsInformation}</Badge><Badge variant="outline">Не применяется: {evaluation.summary.notApplicable}</Badge></div>
        {evaluation.profileWarnings.map((warning, index) => <p key={index} className="text-sm text-amber-700">{warning}</p>)}
        <p className="text-xs text-muted-foreground">{profile.data?.revision ? `Сохранённая версия профиля: ${profile.data.revision}` : "Профиль ещё не сохранён"}. Каталог: {evaluation.snapshot.catalogVersion}. Проверка условий: {evaluation.snapshot.asOf}.</p>
      </>}
    </div>
    {profile.data && <NormativeGovernancePanel key={props.organizationId} organizationId={props.organizationId} canWrite={canWrite} profileRevision={profile.data.revision || null} />}
    {evaluation && <Accordion type="multiple" defaultValue={["before_start"]} className="space-y-3">{COMPLIANCE_STAGES.map(stage => {
      const tasks = evaluation.requirements.filter(task => task.requirement.stage === stage.id);
      return <AccordionItem key={stage.id} value={stage.id} className="bg-card rounded-2xl border border-border overflow-hidden">
        <AccordionTrigger className="px-4 py-3 hover:no-underline"><span className="text-left">{stage.label} <span className="text-muted-foreground font-normal">· {stage.id === "archive" ? "проверка хранения дела" : `${tasks.length} позиций`}</span></span></AccordionTrigger>
        <AccordionContent className="px-4 space-y-3">
          <p className="text-sm text-muted-foreground">{STAGE_GUIDANCE[stage.id]}</p>
          {stage.id === "archive" && <article className="rounded-xl border border-border p-4 space-y-3" aria-label="Подготовить дело к архивному хранению">
            <h4 className="font-medium">Подготовить дело к архивному хранению</h4>
            <p className="text-sm">Сохранить подтверждающие документы вместе с их версиями и определить порядок хранения конкретного дела. Это общая рабочая задача для применимых документов, а не дополнительный обязательный вид документа.</p>
            <dl className="grid gap-2 text-sm sm:grid-cols-2"><div><dt className="text-muted-foreground">Кому</dt><dd>Ответственному за документы и архив центра</dd></div><div><dt className="text-muted-foreground">Когда</dt><dd>При завершении дела, перед передачей в архив и перед рассмотрением уничтожения</dd></div></dl>
            <ol className="list-decimal pl-5 space-y-2 text-sm">
              <li>Определить вид дела и состав: программа, группа или событие; проверить, какие файлы, версии и записи реестров относятся к нему.</li>
              <li>Указать основание и срок хранения для этого вида дела, событие начала отсчёта и подтверждающий источник. Дата загрузки файла не заменяет это событие.</li>
              <li>Проверить ограничения уничтожения, незавершённые проверки или споры, состав согласующих и сохранность оригиналов. До отдельного решения архивирование не разрешает удаление.</li>
            </ol>
            <p className="text-sm text-muted-foreground">Результат проверки фиксируется в документах центра. Помощник не назначает единый срок, не подтверждает выполнение этой задачи и не запускает удаление.</p>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" asChild><a href="#org-document-file-catalog" onClick={props.onArchive}>Показать архивные файлы</a></Button>
              {canOpenGroups && <Button size="sm" variant="outline" asChild><a href={groupDocumentSelectionPath()}>Выбрать группу и документы</a></Button>}
              <Button size="sm" variant="outline" asChild><a href={taskHref("orders")}>Загруженные копии приказов</a></Button>
              <Button size="sm" variant="outline" asChild><a href={taskHref("protocols")}>Загруженные копии протоколов</a></Button>
            </div>
          </article>}
          {tasks.map(task => {
            const definition = task.requirement;
            const document = props.documents.find(row => row.id === task.documentId && !row.deleted_at)
              ?? props.documents.find(row => !row.deleted_at && [definition.typeId, ...definition.existingDocTypes].includes(row.type));
            const current = decisions.data?.find(row => row.requirement_id === definition.id);
            const preparation = compliancePreparation(definition.id);
            const groupTask = isGroupDocumentTask(definition.id);
            return <article key={definition.id} className="rounded-xl border border-border p-4 space-y-3" aria-label={definition.label}>
              <div className="flex flex-wrap gap-2 items-start justify-between"><h4 className="font-medium">{definition.label}</h4><Badge variant="outline">{task.applicability === "needs_information" ? "Нужно уточнить" : DECISION_LABELS[task.applicability]}</Badge></div>
              <p className="text-sm">{task.explanation}</p>
              {task.reviewStatus === "needs_legal_review" && <p className="text-sm text-amber-700">Нужна отдельная проверка применимых норм и обстоятельств центра.</p>}
              <dl className="grid gap-2 text-sm sm:grid-cols-2"><div><dt className="text-muted-foreground">Кому</dt><dd>{definition.ownerRole}</dd></div><div><dt className="text-muted-foreground">Когда</dt><dd>{definition.deadline.description}</dd></div></dl>
              <p className="text-sm text-muted-foreground">{task.nextAction}</p>
              <p className="text-sm">{groupTask ? "Документы и фактические результаты группы открываются в её папке. Загруженная копия организации не заменяет эти записи." : task.evidence === "file_present" ? "Файл есть. Утверждение, содержание и период требуют отдельной проверки." : task.evidence === "inactive" ? "Есть прежний файл: проверьте архив, срок действия или наличие содержимого." : "Подтверждающий файл не найден в документах организации."}</p>
              {current && <p className="text-xs text-muted-foreground">{current.decision === null ? "Прежнее решение отозвано." : current.profile_revision !== profile.data?.revision || current.catalog_version !== COMPLIANCE_CATALOG_VERSION ? "Прежнее решение требует пересмотра после изменения профиля или каталога." : "Учтено мотивированное решение центра."}</p>}
              <div className="flex flex-wrap gap-2">
                {preparationPlan(definition.id) && <Button size="sm" variant="outline" onClick={() => setPreparationTask({ organizationId: props.organizationId, profileRevision: profile.data!.revision, id: definition.id })}>Образец и подготовка</Button>}
                {definition.kind === "regular" && <Button size="sm" variant="outline" disabled={!canWrite || profile.saving || decisions.saving} onClick={() => props.onUpload(definition.typeId)}><FileText className="w-4 h-4 mr-2" />Загрузить файл</Button>}
                {document && <Button size="sm" variant="outline" onClick={() => props.onHistory(document)}><History className="w-4 h-4 mr-2" />Файл и версии</Button>}
                {groupTask && canOpenGroups ? <Button size="sm" variant="outline" asChild><a href={groupDocumentSelectionPath()}>Выбрать группу и документы</a></Button>
                  : destinationAllowed(definition.existingDestination) && definition.existingDestination !== "org" && <Button size="sm" variant="outline" asChild><a href={taskHref(definition.existingDestination)}>{groupTask ? "Загруженные копии" : "Открыть рабочий раздел"}</a></Button>}
                {preparation && canConfigure && <Button size="sm" variant="outline" asChild><a href={preparation.href}>{preparation.label}</a></Button>}
                {definition.id === "self_examination_report" && props.onSelfExamination && <Button size="sm" variant="outline" disabled={!canWrite || profile.saving || decisions.saving} onClick={props.onSelfExamination}>Открыть анкету самообследования</Button>}
                <Button size="sm" variant="ghost" disabled={profile.saving || decisions.saving || decisions.loading} onClick={() => setSelectedTask(definition.id)}>{canWrite ? "Решение центра" : "История решений"}</Button>
              </div>
              {groupTask && <p className="text-sm text-muted-foreground">{canOpenGroups ? "Выберите группу в списке, затем откройте «Документы группы»." : "Для папки группы нужен доступ к ученикам и документам; здесь доступны загруженные копии организации."}</p>}
              <details><summary className="text-sm cursor-pointer text-muted-foreground">Основания и способы подготовки</summary><div className="pt-2 space-y-2 text-sm">
                <p>{definition.creationGuidance}</p><p>Что проверить: {definition.evidence.join("; ")}</p><p>Период: {definition.period.description}</p>
                {definition.legalSources.map(source => <div key={source.id}><a className="text-primary underline" href={source.primaryUrl} target="_blank" rel="noopener noreferrer">{source.title}</a><p className="text-muted-foreground">{source.provision} · проверено {source.checkedOn}</p>{source.limitation && <p className="text-muted-foreground">{source.limitation}</p>}</div>)}
                <p className="text-muted-foreground">Хранение: {definition.retention.description}</p>
              </div></details>
            </article>;
          })}
        </AccordionContent>
      </AccordionItem>;
    })}</Accordion>}
    <PublicationCalendarPanel organizationId={props.organizationId} profileRevision={profile.data?.revision ?? 0} decisions={decisions.data ?? []} documents={props.documents} canRead={canRead} canWrite={canWrite} canSign={action.canSign} />
    {profile.data && <EducationProfileDialog open={profileOpen} onOpenChange={setProfileOpen} snapshot={profile.data} organization={props.organization} documents={props.documents}
      canWrite={canWrite} saving={profile.saving} conflict={profile.conflict} uncertain={profile.uncertain} error={profile.error}
      onSave={profile.save} onReload={() => void profile.reload()} onClose={() => setProfileOpen(false)} loadHistory={profile.loadHistory} />}
    {prepared && <PreparationDetailsDialog key={props.organizationId+":"+profile.data?.revision+":"+prepared.requirement.id} requirement={prepared.requirement} workflow={preparedWorkflow}
      onUploadDraft={prepared.requirement.kind === "regular" && canWrite && !profile.saving && !decisions.saving ? () => props.onUpload(prepared.requirement.typeId) : undefined}
      onOpenVersions={preparedDocument ? () => props.onHistory(preparedDocument) : undefined}
      onSelfExamination={prepared.requirement.id === "self_examination_report" && canWrite && !profile.saving && !decisions.saving ? props.onSelfExamination : undefined}
      onClose={() => setPreparationTask(null)} />}
    {selected && profile.data && <DecisionDialog key={`${props.organizationId}:${selected.requirement.id}:${profile.data.revision}`} task={selected}
      current={decisions.data?.find(row => row.requirement_id === selected.requirement.id)} decisions={decisions} canWrite={canWrite} profileRevision={profile.data.revision} onClose={() => setSelectedTask(null)} onReload={reload} />}
  </section>;
}
