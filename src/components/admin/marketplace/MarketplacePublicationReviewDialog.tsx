import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SigmaSpinner } from "@/components/ui/SigmaSpinner";
import { usePlatformPublicationReview } from "@/hooks/usePlatformPublicationReview";
import { DOSSIER_SECTIONS, PASSPORT_FIELDS, emptyPublicationDossier, canAcceptPublicationReview, canPublishPublication,
  publicationReadinessLabel, type DossierSectionName, type PassportField, type PublicationDossier,
  type PublicationReadiness, type PublicationTarget } from "@/lib/platformCoursePublication";

import { SelectedPlatformProposalFiles } from "./SelectedPlatformProposalFiles";
import { CurrentPlatformFilesCapture } from "./CurrentPlatformFilesCapture";

const passportLabels: Record<PassportField, string> = {
  purpose: "Назначение", audience: "Аудитория", entry_requirements: "Входные требования", outcomes: "Результаты обучения",
  teaching_plan: "Учебный план", workload: "Заявленный объём", assessment_criteria: "Критерии оценки и практики", applicability: "Область применения",
};
const sectionLabels: Record<DossierSectionName, string> = {
  source_review: "Содержание и источники", subject_keys: "Предметная проверка ключей", practices: "Практика и критерии",
  rights: "Авторство и права", document_links: "Документы и связи",
};
function localDate(value: string) {
  const d = new Date(value); if (!Number.isFinite(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function isoDate(value: string) { const time = Date.parse(value); return Number.isFinite(time) ? new Date(time).toISOString() : ""; }
function cloneDossier(value: PublicationDossier): PublicationDossier {
  return { schema_version: 1, passport: { ...value.passport }, ...Object.fromEntries(DOSSIER_SECTIONS.map(name => [name,
    { ...value[name], evidence: value[name].evidence.map(ref => ({ ...ref })) }])) } as PublicationDossier;
}
function blockerLabel(code: string) {
  if (code.startsWith("passport_")) return `Заполните поле «${passportLabels[code.slice(9) as PassportField] ?? "Паспорт"}»`;
  if (code === "file_or_external_material_edition_unconfirmed") return "Не подтверждены неизменные версии файлов или внешних материалов";
  if (code === "source_edition_changed") return "Материалы изменились после сохранения досье";
  if (code === "explicit_template_review_missing") return "Нет явного решения о готовности этой редакции для каталога";
  if (code === "invalid_structural_test_key") return "Структура ключа теста требует проверки в редакторе";
  if (code === "curriculum_empty") return "Учебный план не содержит занятий";
  if (code === "module_course_mismatch") return "Связи модулей и занятий требуют проверки";
  const section = DOSSIER_SECTIONS.find(name => code.startsWith(name));
  return section ? `${sectionLabels[section]}: уточните статус, основание, редакцию и дату источника` : "Досье требует уточнения перед решением";
}
function DossierFields({ value, onChange, readOnly, pending }: {
  value: PublicationDossier; onChange: (value: PublicationDossier) => void; readOnly: boolean; pending: boolean;
}) {
  return <div className="space-y-4">
    <div className="grid gap-3 sm:grid-cols-2">
      {PASSPORT_FIELDS.map(field => <div key={field} className="space-y-1">
        <Label htmlFor={`publication-passport-${field}`}>{passportLabels[field]}</Label>
        <Textarea id={`publication-passport-${field}`} rows={3} value={value.passport[field]} readOnly={readOnly} disabled={pending}
          onChange={event => onChange({ ...value, passport: { ...value.passport, [field]: event.target.value } })} />
      </div>)}
    </div>
    {DOSSIER_SECTIONS.map(name => {
      const section = value[name];
      return <section key={name} className="space-y-2 rounded-lg border p-3">
        <h4 className="text-sm font-semibold">{sectionLabels[name]}</h4>
        <Select value={section.state} disabled={readOnly || pending} onValueChange={state => {
          if (state === "unconfirmed" || state === "confirmed" || state === "not_applicable") onChange({ ...value, [name]: { ...section, state } });
        }}>
          <SelectTrigger aria-label={`${sectionLabels[name]} — статус`}><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="unconfirmed">Не подтверждено</SelectItem>
            <SelectItem value="confirmed">Подтверждено источниками</SelectItem>
            <SelectItem value="not_applicable" disabled={name === "rights"}>Не применяется — с обоснованием</SelectItem>
          </SelectContent>
        </Select>
        <Label htmlFor={`publication-rationale-${name}`}>Основание и ограничения</Label>
        <Textarea id={`publication-rationale-${name}`} value={section.rationale} rows={2} readOnly={readOnly} disabled={pending}
          onChange={event => onChange({ ...value, [name]: { ...section, rationale: event.target.value } })} />
        {section.evidence.map((ref, index) => <div key={index} className="grid gap-2 sm:grid-cols-3">
          <Input aria-label={`${sectionLabels[name]} — источник ${index + 1}`} value={ref.reference} placeholder="Источник / подтверждение" readOnly={readOnly} disabled={pending}
            onChange={event => onChange({ ...value, [name]: { ...section, evidence: section.evidence.map((old, i) => i === index ? { ...old, reference: event.target.value } : old) } })} />
          <Input aria-label={`${sectionLabels[name]} — редакция ${index + 1}`} value={ref.edition} placeholder="Редакция источника" readOnly={readOnly} disabled={pending}
            onChange={event => onChange({ ...value, [name]: { ...section, evidence: section.evidence.map((old, i) => i === index ? { ...old, edition: event.target.value } : old) } })} />
          <Input aria-label={`${sectionLabels[name]} — проверено ${index + 1}`} type="datetime-local" value={localDate(ref.checked_at)} readOnly={readOnly} disabled={pending}
            onChange={event => onChange({ ...value, [name]: { ...section, evidence: section.evidence.map((old, i) => i === index ? { ...old, checked_at: isoDate(event.target.value) } : old) } })} />
        </div>)}
        {!readOnly && <Button type="button" variant="outline" size="sm" disabled={pending}
          onClick={() => onChange({ ...value, [name]: { ...section, evidence: [...section.evidence, { reference: "", edition: "", checked_at: "" }] } })}>Добавить источник</Button>}
      </section>;
    })}
  </div>;
}
interface Props {
  target: (PublicationTarget & { title: string }) | null;
  onOpenChange: (open: boolean) => void;
  onPublicationConfirmed: (readiness: PublicationReadiness) => void;
  checkStructure: (target: PublicationTarget, expectedEdition: string) => Promise<string[]>;
}
export function MarketplacePublicationReviewDialog({ target, onOpenChange, onPublicationConfirmed, checkStructure }: Props) {
  const navigate = useNavigate();
  const review = usePlatformPublicationReview(target, !!target);
  const context = review.context;
  const editorKey = context ? [review.scopeVersion, context.actorId, context.marketplaceId, context.courseId,
    context.currentEditionSha256, context.proposal?.id ?? "none"].join("/") : [review.scopeVersion, "unavailable"].join("/");
  const editorScope = useRef({ key: editorKey });
  if (editorScope.current.key !== editorKey) editorScope.current = { key: editorKey };
  const renderEditorScope = editorScope.current;
  const freshForm = () => ({ scope: renderEditorScope,
    draft: context?.proposal?.supportedDossier ? cloneDossier(context.proposal.supportedDossier) : emptyPublicationDossier(),
    editing: !!context && !context.proposal, notes: "", nextReview: "", confirmed: false });
  const [storedForm, setStoredForm] = useState(freshForm);
  // Unique object identity also protects edition A -> B -> A: returning to the
  // same hash must not revive an old draft, acknowledgement or change handler.
  const form = storedForm.scope === renderEditorScope ? storedForm : freshForm();
  const { draft, editing, notes, nextReview, confirmed } = form;
  const updateForm = (patch: Partial<Omit<typeof form, "scope">>) => {
    if (editorScope.current !== renderEditorScope) return;
    setStoredForm(previous => ({ ...(previous.scope === renderEditorScope ? previous : freshForm()), ...patch }));
  };
  const setDraft = (value: PublicationDossier) => updateForm({ draft: value });
  const setEditing = (value: boolean) => updateForm({ editing: value });
  const setNotes = (value: string) => updateForm({ notes: value });
  const setNextReview = (value: string) => updateForm({ nextReview: value });
  const setConfirmed = (value: boolean) => updateForm({ confirmed: value });
  const actionDisabled = review.pending || !!review.error || !review.available;
  const nextReviewISO = nextReview ? isoDate(nextReview) : "";
  const canAccept = !!context && !editing && canAcceptPublicationReview(context) && confirmed && !!notes.trim()
    && !!nextReviewISO && Date.parse(nextReviewISO) > Date.now();
  return <Dialog open={!!target} onOpenChange={onOpenChange}>
    <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle>Досье и выпуск редакции</DialogTitle>
        <DialogDescription>{target?.title}. Решение относится к шаблону платформы; утверждение учебным центром и выдача квалификации оформляются отдельно.</DialogDescription>
      </DialogHeader>
      {!review.available && <p className="text-sm text-muted-foreground">Доступ к проверке не подтверждён для текущей учётной записи.</p>}
      {review.pending && <p className="flex items-center gap-2 text-sm"><SigmaSpinner size="sm" />Подтверждаю состояние редакции…</p>}
      {review.error && <div role="alert" className="space-y-2 rounded-lg border border-destructive/40 p-3">
        <p className="text-sm">{review.error === "structural" ? "Структурные замечания требуют исправления в редакторе и повторной проверки." : review.error === "stale" ? "Материалы или доступ изменились. Обновите состояние перед следующим действием." : "Состояние не подтверждено. Выпуск и решение недоступны до повторного чтения."}</p>
        {review.structuralIssues.length > 0 && <ul className="list-disc pl-5 text-sm">{review.structuralIssues.map((issue, i) => <li key={i}>{issue}</li>)}</ul>}
        <Button variant="outline" size="sm" disabled={review.pending || !review.available} onClick={() => void review.reload()}>Обновить состояние</Button>
      </div>}
      {context && <div className="space-y-4">
        <div className="space-y-2">
          <Badge variant="outline">{publicationReadinessLabel(context.readiness)}</Badge>
          <p className="text-xs text-muted-foreground break-all">Текущая редакция материалов: {context.currentEditionSha256}</p>
          <Button variant="outline" size="sm" disabled={review.pending} onClick={() => navigate(`/course-builder/${context.courseId}`)}>Открыть текущий курс в редакторе</Button>
          <p className="text-xs text-muted-foreground">Структурные замечания исправляются в редакторе и проверяются отдельно. Здесь материалы и ключи не генерируются.</p>
        </div>
        {context.currentFileState === "unconfirmed" && <p role="status" className="text-sm text-destructive">Не подтверждены неизменные версии файлов или внешних материалов. Приёмка и выпуск недоступны.</p>}
        {context.readiness.blockers.length > 0 && <ul className="list-disc pl-5 text-sm text-muted-foreground">
          {context.readiness.blockers.map((code, index) => <li key={`${code}-${index}`}>{blockerLabel(code)}</li>)}
        </ul>}
        {context.proposal && <div className="space-y-1 rounded-lg border p-3">
          <p className="text-sm font-medium">Сохранённое досье от {new Date(context.proposal.submittedAt).toLocaleString()}</p>
          <p className="text-xs text-muted-foreground break-all">Редакция досье: {context.proposal.id} · Материалы: {context.proposal.editionSha256}</p>
          {!context.proposal.isCurrent && <p className="text-sm text-destructive">Историческая редакция: подтвердить её как текущую нельзя. Историческое содержимое не восстанавливается из текущего банка.</p>}
          <p className="text-xs text-muted-foreground">Зафиксировано модулей: {context.proposal.source.modules.length}, занятий: {context.proposal.source.lessons.length}. Источником служит сохранённый контекст этой редакции.</p>
        </div>}
        <CurrentPlatformFilesCapture context={context} scopeVersion={review.scopeVersion} enabled={!actionDisabled} isCurrentContext={review.isCurrentContext} onRefresh={review.reload} />
        {context.proposal && <SelectedPlatformProposalFiles context={context} scopeVersion={review.scopeVersion} enabled={!actionDisabled} isCurrentContext={review.isCurrentContext} />}
        {!editing && context.proposal && <Button variant="outline" size="sm" disabled={actionDisabled} onClick={() => {
          const value = context.proposal?.supportedDossier ? cloneDossier(context.proposal.supportedDossier) : emptyPublicationDossier();
          if (!context.proposal?.isCurrent) for (const section of DOSSIER_SECTIONS) value[section].state = "unconfirmed";
          setDraft(value); setEditing(true); setConfirmed(false);
        }}>Подготовить новую редакцию досье</Button>}
        {!editing && context.proposal && !context.proposal.supportedDossier ? <p className="text-sm text-muted-foreground">Формат сохранённого досье не поддерживается целиком. Подтверждение заблокировано; подготовьте новое досье или верните его на доработку.</p>
          : <DossierFields value={editing ? draft : context.proposal?.supportedDossier ?? draft} onChange={setDraft} readOnly={!editing} pending={actionDisabled} />}
        {editing && <div className="space-y-2">
          <p className="text-xs text-muted-foreground">Сохранение создаст отдельную неизменяемую редакцию для текущих материалов. Предыдущее досье и решения сохранятся.</p>
          <Button disabled={actionDisabled} onClick={async () => {
            const saved = await review.saveDossier(draft);
            if (saved && review.isCurrentContext(saved)) { setEditing(false); toast.info("Редакция досье подтверждена сервером. Решение о готовности ещё не принято."); }
          }}>Сохранить редакцию досье</Button>
        </div>}
        {!editing && context.proposal?.isCurrent && <section className="space-y-3 rounded-lg border p-3">
          <h4 className="text-sm font-semibold">Явное решение по сохранённому досье</h4>
          <p className="text-xs text-muted-foreground break-all">Решение будет записано от текущей учётной записи: {context.actorId}. Назначение ответственного само по себе не является приёмкой.</p>
          <Label htmlFor="publication-review-notes">Основание решения и замечания</Label>
          <Textarea id="publication-review-notes" value={notes} maxLength={16384} disabled={actionDisabled} onChange={event => setNotes(event.target.value)} />
          <Label htmlFor="publication-next-review">Следующая проверка</Label>
          <Input id="publication-next-review" type="datetime-local" value={nextReview} disabled={actionDisabled} onChange={event => setNextReview(event.target.value)} />
          <label className="flex items-start gap-2 text-sm">
            <Checkbox checked={confirmed} disabled={actionDisabled} onCheckedChange={value => setConfirmed(value === true)} />
            Я изучил сохранённое досье и эту точную редакцию материалов, проверил источники, ключи, практику и права в применимой части.
          </label>
          <div className="flex flex-wrap gap-2">
            <Button disabled={actionDisabled || !canAccept} onClick={async () => {
              const saved = await review.review("accepted_for_template_publication", notes, nextReviewISO);
              if (saved && review.isCurrentContext(saved)) { setConfirmed(false); setNotes(""); setNextReview(""); toast.info("Методическая проверка редакции подтверждена. Выпуск выполняется отдельным действием."); }
            }}>Подтвердить готовность для каталога</Button>
            <Button variant="outline" disabled={actionDisabled || !notes.trim()} onClick={async () => {
              const saved = await review.review("needs_revision", notes, nextReviewISO || null);
              if (saved && review.isCurrentContext(saved)) { setConfirmed(false); setNotes(""); toast.info("Замечания сохранены отдельным решением."); }
            }}>Вернуть на доработку</Button>
          </div>
        </section>}
        <Button disabled={actionDisabled || editing || !canPublishPublication(context)} onClick={async () => {
          const saved = await review.publish(checkStructure);
          if (saved && review.isCurrentContext(saved)) { onPublicationConfirmed(saved.readiness); toast.success("Выпуск точной проверенной редакции подтверждён сервером"); }
        }}>Выпустить проверенную редакцию</Button>
        <section className="space-y-2 border-t pt-3">
          <h4 className="text-sm font-semibold">История досье и решений</h4>
          {!context.history.length && <p className="text-sm text-muted-foreground">Явные решения ещё не сохранялись.</p>}
          {context.history.map(event => <div key={event.id} className="space-y-1 rounded-lg border p-2">
            <Button variant="link" size="sm" className="h-auto p-0 text-left" disabled={review.pending} onClick={() => void review.selectProposal(event.proposalId)}>
              {event.kind === "submitted" ? "Досье сохранено" : event.kind === "publication_recorded" ? "Выпуск редакции подтверждён" : event.decision === "needs_revision" ? "Запрошена доработка" : "Методическая проверка для каталога"}
            </Button>
            <p className="text-xs text-muted-foreground">{new Date(event.recordedAt).toLocaleString()} · Учётная запись: {event.actorId}</p>
            {event.notes && <p className="text-sm whitespace-pre-wrap">{event.notes}</p>}
            {event.nextReviewAt && <p className="text-xs text-muted-foreground">Следующая проверка: {new Date(event.nextReviewAt).toLocaleString()}</p>}
            {event.samePersonReview && <p className="text-xs text-muted-foreground">Досье и проверку оформил один пользователь.</p>}
          </div>)}
          {context.historyHasMore && <Button variant="outline" size="sm" disabled={review.pending} onClick={() => void review.loadMore()}>Более ранние записи</Button>}
        </section>
      </div>}
    </DialogContent>
  </Dialog>;
}
