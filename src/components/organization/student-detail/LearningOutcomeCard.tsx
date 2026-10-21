import { useState } from 'react';
import { ChevronDown, ChevronUp, ClipboardCheck, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { useLearningOutcome, type LearningOutcomeController } from '@/hooks/useLearningOutcome';
import { learningOutcomeErrorMessages } from '@/lib/learningOutcomes/client';
import type { OutcomeErrorCode } from '@/lib/learningOutcomes/contract';
import {
  attestationDecisionLabels, machineEligibilityLabels, outcomeComponentKindLabels, outcomeComponentLabels,
  outcomeRelationLabels, outcomeTimeLabel, originalGradeLabel,
} from '@/lib/learningOutcomes/presentation';

interface Props {
  organizationId: string;
  studentUserId: string;
  courseId: string;
  enrollmentId: string;
  observedAccessKey?: string;
}

/** A course does not fetch private outcome data until its panel is opened. */
export function LearningOutcomeCard(props: Props) {
  const [expanded, setExpanded] = useState(false);
  return <section className="rounded-xl border border-border/60 bg-muted/20" aria-label="Итог обучения и аттестация">
    <Button variant="ghost" className="w-full justify-between whitespace-normal h-auto p-3 text-left" aria-expanded={expanded}
      onClick={() => setExpanded(value => !value)}>
      <span className="flex items-center gap-2"><ClipboardCheck className="h-4 w-4 text-primary" />Итог обучения и аттестация</span>
      {expanded ? <ChevronUp className="h-4 w-4 shrink-0" /> : <ChevronDown className="h-4 w-4 shrink-0" />}
    </Button>
    {expanded && <LearningOutcomeContents {...props} />}
  </section>;
}

function ErrorBox({ code, onRetry }: { code: OutcomeErrorCode; onRetry?: () => void }) {
  return <div role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm space-y-2">
    <p>{learningOutcomeErrorMessages[code]}</p>
    {onRetry && <Button size="sm" variant="outline" onClick={onRetry}>Повторить проверку</Button>}
  </div>;
}
function LearningOutcomeContents({ organizationId, studentUserId, courseId, enrollmentId, observedAccessKey = '' }: Props) {
  const controller = useLearningOutcome(organizationId, studentUserId, courseId, enrollmentId, true, observedAccessKey);
  const disabled = controller.busy || controller.pending || controller.loading;
  return <div className="p-3 pt-0 space-y-3">
    <p className="text-xs text-muted-foreground">Расчёт по критериям программы и решение организации учитываются отдельно от прогресса курса и очного зачёта.</p>
    {controller.associations && controller.associations.associations.length > 1 && <label className="block space-y-1 text-sm">
      <span>Зачисление и версия программы</span>
      <select aria-label="Зачисление и версия программы" className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm"
        value={controller.selected?.program_enrollment_snapshot_id || ''} disabled={disabled}
        onChange={event => controller.selectAssociation(controller.associations!.associations.find(item => item.scope.program_enrollment_snapshot_id === event.target.value)?.scope || null)}>
        <option value="">Выберите точную учебную связь</option>
        {controller.associations.associations.map((item, index) => <option key={item.scope.program_enrollment_snapshot_id} value={item.scope.program_enrollment_snapshot_id}>
          Учебная связь {index + 1} · версия программы {item.scope.program_version_id.slice(0, 8)}
        </option>)}
      </select>
    </label>}
    {controller.associations?.next_after_snapshot_id && <Button size="sm" variant="outline" disabled={disabled}
      onClick={() => void controller.refreshAssociations(true)}>Ещё учебные связи</Button>}
    {controller.loading && <p role="status" className="text-sm text-muted-foreground">Проверяем критерии и итог обучения…</p>}
    {controller.error && <ErrorBox code={controller.error} onRetry={() => void controller.refresh()} />}
    {controller.operationError && <ErrorBox code={controller.operationError} />}
    {controller.pending && <div className="rounded-xl border p-3 text-sm space-y-2"><p>Сохранение итога пока не подтверждено. Повтор использует тот же запрос, исходные сведения и критерии.</p>
      <Button size="sm" variant="outline" disabled={controller.busy} onClick={() => void controller.retryPending()}>Повторить сохранение итога</Button></div>}
    {controller.associations && !controller.loading && !controller.error && controller.associations.associations.length === 0
      && <p className="text-sm text-muted-foreground">Подтверждённая связь с версией программы пока не настроена. Ответственному центра нужно проверить группу и программу этого зачисления.</p>}
    {controller.data && <OutcomePanel key={controller.viewKey} controller={controller} />}
    {!controller.loading && <Button size="sm" variant="outline" className="gap-2" disabled={controller.busy}
      onClick={() => void controller.refresh()}><RefreshCw className="h-3.5 w-3.5" />Обновить итог</Button>}
  </div>;
}

function OutcomePanel({ controller }: { controller: LearningOutcomeController }) {
  const data = controller.data!;
  const [reason, setReason] = useState('');
  const relation = outcomeRelationLabels[data.decision_relation];
  return <div className="space-y-3">
    {data.prerequisites.length > 0 && <div className="rounded-lg bg-muted/40 p-3 text-sm space-y-1">
      <p className="font-medium">Что нужно подготовить</p>
      <ul className="list-disc pl-4 space-y-1">{data.prerequisites.map((item, index) => <li key={`${index}:${item}`}>{item}</li>)}</ul>
    </div>}
    <div className="grid gap-3 md:grid-cols-2">
      <div className="rounded-xl border bg-card p-3 text-sm space-y-2">
        <h5 className="font-medium">Расчёт по критериям</h5>
        {data.criteria_ref ? <p className="text-xs text-muted-foreground">Критерии: версия {data.criteria_ref.revision} · утверждены {outcomeTimeLabel(data.criteria_ref.approved_at)}</p>
          : <p className="text-muted-foreground">Утверждённые критерии для этого зачисления пока не закреплены.</p>}
        {data.machine ? <>
          <Badge variant="secondary">{machineEligibilityLabels[data.machine.eligibility]}</Badge>
          <p className="text-xs text-muted-foreground">Расчёт от {outcomeTimeLabel(data.machine.evaluated_at)}</p>
          {!data.machine.source_fresh && <p className="text-muted-foreground">После расчёта исходные сведения изменились. Нужна повторная проверка.</p>}
        </> : <p className="text-muted-foreground">Подтверждённого расчёта ещё нет.</p>}
        <p className="text-xs text-muted-foreground">Расчёт сам по себе не является решением об аттестации.</p>
      </div>
      <div className="rounded-xl border bg-card p-3 text-sm space-y-2">
        <h5 className="font-medium">Решение организации</h5>
        {data.last_decision ? <>
          <Badge variant="outline">{attestationDecisionLabels[data.last_decision.outcome]}</Badge>
          <p className="whitespace-pre-wrap break-words">{data.last_decision.learner_summary}</p>
          <p className="text-xs text-muted-foreground">Записано {outcomeTimeLabel(data.last_decision.recorded_at)}</p>
          {data.last_decision.supersedes_id && <p className="text-xs text-muted-foreground">Это уточнённое решение. Предыдущее сохранено.</p>}
        </> : <p className="text-muted-foreground">Решение об аттестации ещё не записано.</p>}
        {relation && <p className="text-muted-foreground">{relation}</p>}
      </div>
    </div>
    {data.machine && data.machine.components.length > 0 && <ul className="space-y-2 text-sm" aria-label="Состав расчёта">
      {data.machine.components.map(component => <li className="rounded-lg border p-3 space-y-1" key={component.component_id}>
        <div className="flex flex-wrap justify-between gap-2"><span>{outcomeComponentKindLabels[component.kind]}</span><span>{outcomeComponentLabels[component.status]}</span></div>
        {originalGradeLabel(component) && <p className="text-xs text-muted-foreground">Исходная попытка: {originalGradeLabel(component)}</p>}
        {component.provenance === 'current_condition_observed' && <p className="text-xs text-muted-foreground">Текущее состояние. Применимость к этому зачислению должен подтвердить ответственный.</p>}
        {component.provenance === 'unavailable' && <p className="text-xs text-muted-foreground">Исходное подтверждение пока недоступно.</p>}
      </li>)}
    </ul>}
    {data.capabilities.can_capture && data.criteria_ref && <div className="rounded-xl border p-3 space-y-2">
      <Textarea aria-label="Основание расчёта" placeholder="Почему требуется сохранить расчёт по текущим подтверждённым сведениям" value={reason}
        onChange={event => setReason(event.target.value)} maxLength={2000} disabled={controller.busy || controller.pending} />
      <Button size="sm" variant="outline" disabled={controller.busy || controller.pending || !reason.trim()}
        onClick={() => void controller.capture(reason)}>Сохранить расчёт</Button>
    </div>}
    {data.audience === 'staff' && data.capabilities.can_decide && data.machine && data.criteria_ref
      && <HumanDecisionForm key={`${data.revision}:${data.machine.id}:${data.last_decision?.id || ''}`} controller={controller} />}
  </div>;
}

function HumanDecisionForm({ controller: h }: { controller: LearningOutcomeController }) {
  const data = h.data!, machine = data.machine!;
  const [basis, setBasis] = useState<'' | 'machine' | 'recognition'>('');
  const [outcome, setOutcome] = useState<'' | 'passed' | 'not_passed' | 'deferred'>('');
  const [reason, setReason] = useState(''), [summary, setSummary] = useState('');
  const [reviewed, setReviewed] = useState<string[]>([]), [recognized, setRecognized] = useState<string[]>([]), [file, setFile] = useState('');
  const disabled = h.busy || h.pending || h.loading;
  const currentConditions = machine.components.filter(component => component.provenance === 'current_condition_observed' && !recognized.includes(component.component_id));
  const validRecognition = basis === 'recognition' && !!h.decisionOptions && recognized.length > 0
    && recognized.every(id => h.decisionOptions!.allowed_component_ids.includes(id)) && h.decisionOptions.files.some(item => item.version_id === file);
  const recognitionCoversRemaining = machine.components.every(component => component.status === 'satisfied' || recognized.includes(component.component_id));
  const canPass = machine.source_fresh && (basis === 'machine' ? machine.eligibility === 'eligible' : validRecognition && recognitionCoversRemaining);
  const allowedOutcome = outcome === 'deferred' || outcome === 'passed' && canPass
    || outcome === 'not_passed' && basis === 'machine' && machine.eligibility === 'not_eligible' && machine.source_fresh;
  const confirmedConditions = outcome !== 'passed' || currentConditions.every(component => reviewed.includes(component.component_id));
  const toggle = (values: string[], id: string, checked: boolean) => checked ? [...values, id] : values.filter(value => value !== id);
  const submit = async () => {
    if (disabled || !basis || !outcome || !allowedOutcome || !confirmedConditions || !reason.trim() || !summary.trim()
      || basis === 'recognition' && !validRecognition) return;
    await h.decide({ outcome, basis, staff_reason: reason.trim(), learner_summary: summary.trim(),
      reviewed_current_component_ids: currentConditions.filter(component => reviewed.includes(component.component_id)).map(component => component.component_id),
      recognized_component_ids: basis === 'recognition' ? recognized : [], recognition_file_version_id: basis === 'recognition' ? file : null });
  };
  return <div className="rounded-xl border p-3 space-y-3 text-sm">
    <h5 className="font-medium">{data.last_decision ? 'Уточнить решение об аттестации' : 'Записать решение об аттестации'}</h5>
    <p className="text-xs text-muted-foreground">Решение записывает уполномоченный сотрудник. Исходные оценки, прогресс курса и прежнее решение сохраняются.</p>
    <label className="block space-y-1"><span>Основание решения</span><select aria-label="Основание решения" className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm"
      value={basis} disabled={disabled} onChange={event => { setBasis(event.target.value as typeof basis); setOutcome(''); setRecognized([]); setFile(''); setReviewed([]); }}>
      <option value="">Выберите подтверждённое основание</option><option value="machine">Расчёт по утверждённым критериям</option><option value="recognition">Признание результатов по согласованному основанию</option></select></label>
    {basis === 'recognition' && <div className="rounded-lg bg-muted/40 p-3 space-y-2">
      <Button size="sm" variant="outline" disabled={disabled} onClick={() => void h.loadDecisionOptions()}>Проверить основания признания</Button>
      {h.decisionOptions && <>
        {!h.decisionOptions.allowed_component_ids.length && <p>Для этой версии критериев признание компонентов не предусмотрено.</p>}
        {machine.components.filter(component => h.decisionOptions!.allowed_component_ids.includes(component.component_id)).map((component, index) => <label className="flex gap-2 items-start" key={component.component_id}>
          <input type="checkbox" disabled={disabled} checked={recognized.includes(component.component_id)} onChange={event => setRecognized(previous => toggle(previous, component.component_id, event.target.checked))} />
          {outcomeComponentKindLabels[component.kind]} {index + 1}: признать по выбранному основанию</label>)}
        <select aria-label="Согласованное основание признания" className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm" disabled={disabled} value={file} onChange={event => setFile(event.target.value)}>
          <option value="">Выберите согласованную версию документа</option>{h.decisionOptions.files.map(item => <option key={item.version_id} value={item.version_id}>{item.document_name}</option>)}</select>
      </>}
    </div>}
    {basis && <label className="block space-y-1"><span>Решение</span><select aria-label="Решение об аттестации" className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm"
      disabled={disabled} value={outcome} onChange={event => setOutcome(event.target.value as typeof outcome)}>
      <option value="">Выберите решение</option>
      <option value="passed" disabled={!canPass}>Аттестация пройдена</option>
      <option value="not_passed" disabled={basis !== 'machine' || machine.eligibility !== 'not_eligible' || !machine.source_fresh}>Аттестация не пройдена</option>
      <option value="deferred">Решение отложено</option></select></label>}
    {outcome === 'passed' && currentConditions.length > 0 && <fieldset className="space-y-2"><legend className="font-medium">Проверка текущих сведений</legend>
      <p className="text-xs text-muted-foreground">Подтвердите применимость текущего состояния к этому зачислению. Это не создаёт историческую проверку или посещаемость.</p>
      {currentConditions.map((component, index) => <label key={component.component_id} className="flex gap-2 items-start"><input type="checkbox" disabled={disabled} checked={reviewed.includes(component.component_id)}
        onChange={event => setReviewed(previous => toggle(previous, component.component_id, event.target.checked))} />{outcomeComponentKindLabels[component.kind]} {index + 1}: проверена применимость к этому зачислению</label>)}
    </fieldset>}
    <Textarea aria-label="Служебное основание решения" placeholder="Что проверено и почему принято именно это решение" value={reason} maxLength={2000} disabled={disabled} onChange={event => setReason(event.target.value)} />
    <Textarea aria-label="Пояснение решения ученику" placeholder="Понятное ученику пояснение результата и следующих действий" value={summary} maxLength={1000} disabled={disabled} onChange={event => setSummary(event.target.value)} />
    <Button size="sm" variant="outline" disabled={disabled || !basis || !outcome || !allowedOutcome || !confirmedConditions || !reason.trim() || !summary.trim() || basis === 'recognition' && !validRecognition}
      onClick={() => void submit()}>{data.last_decision ? 'Сохранить уточнённое решение' : 'Сохранить решение организации'}</Button>
  </div>;
}
