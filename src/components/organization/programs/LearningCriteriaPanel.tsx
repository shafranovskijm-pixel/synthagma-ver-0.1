import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { useLearningCriteria, type LearningCriteriaController } from '@/hooks/useLearningCriteria';
import { learningOutcomeErrorMessages } from '@/lib/learningOutcomes/client';
import * as c from '@/lib/learningOutcomes/contract';
import { outcomeTimeLabel } from '@/lib/learningOutcomes/presentation';

interface Props { organizationId: string; courseId: string; programVersionId: string }
const selectClass = 'w-full rounded-xl border border-input bg-background px-3 py-2 text-sm';
type ComponentForm = { id: string; kind: 'test' | 'human_assessment' | 'module_completion'; lesson: string; module: string; label: string;
  retake: '' | 'latest_completed' | 'best_percent'; pass: '' | 'session_pass' | 'percent'; threshold: string; rounding: '' | 'none' | 'nearest_integer_half_up' };
const blankComponent = (kind: ComponentForm['kind']): ComponentForm => ({ id: crypto.randomUUID(), kind, lesson: '', module: '', label: '', retake: '', pass: '', threshold: '', rounding: '' });
function componentFrom(value: NonNullable<c.LearningCriteriaDefinition['main']> | c.LearningCriteriaDefinition['requirements'][number]): ComponentForm {
  const result = { ...blankComponent(value.kind), id: value.component_id };
  if (value.kind === 'test') return { ...result, lesson: value.lesson_id, retake: value.retake_policy, pass: value.pass_rule.kind,
    threshold: value.pass_rule.kind === 'percent' ? String(value.pass_rule.threshold_basis_points / 100) : '',
    rounding: value.pass_rule.kind === 'percent' ? value.pass_rule.rounding : '' };
  return value.kind === 'human_assessment' ? { ...result, label: value.label } : { ...result, module: value.module_id };
}
export function LearningCriteriaPanel(props: Props) {
  const [open, setOpen] = useState(false);
  return <section className="rounded-xl border p-3 space-y-3" aria-label="Критерии итога обучения">
    <div className="flex items-start justify-between gap-3"><div><h4 className="text-sm font-semibold">Критерии итога обучения</h4>
      <p className="text-xs text-muted-foreground">Отдельная версия критериев для новых учебных связей. Прежние попытки и решения сохраняются.</p></div>
      <Button size="sm" variant="outline" aria-expanded={open} onClick={() => setOpen(value => !value)}>{open ? 'Свернуть критерии' : 'Открыть критерии'}</Button></div>
    {open && <CriteriaContents {...props} />}
  </section>;
}
function CriteriaContents(props: Props) {
  const controller = useLearningCriteria(props.organizationId, props.courseId, props.programVersionId);
  return <div className="space-y-3 text-sm">
    {controller.loading && <p role="status">Загружаем версии критериев…</p>}
    {controller.error && <div role="alert"><p>{learningOutcomeErrorMessages[controller.error]}</p><Button size="sm" variant="outline" onClick={() => void controller.reload()}>Повторить загрузку критериев</Button></div>}
    {controller.operationError && <p role="alert">{learningOutcomeErrorMessages[controller.operationError]}</p>}
    {controller.pending && <div className="rounded-lg border p-3 space-y-2"><p>Результат сохранения пока не подтверждён. Повтор использует тот же запрос и исходную версию.</p>
      <Button size="sm" variant="outline" disabled={controller.busy} onClick={() => void controller.retryPending()}>Повторить сохранение критериев</Button></div>}
    {controller.data && <CriteriaVersions key={controller.viewKey} controller={controller} />}
  </div>;
}
function CriteriaVersions({ controller: h }: { controller: LearningCriteriaController }) {
  const [editing, setEditing] = useState<{ source: c.LearningCriteriaVersion | null; clone: boolean } | null>(null);
  const [approvalReasons, setApprovalReasons] = useState<Record<string, string>>({});
  const disabled = h.busy || h.pending || h.loading;
  return <div className="space-y-3">
    {!h.data!.programme_proof && <p>Сначала подтвердите файл и сведения этой версии программы.</p>}
    {h.data!.versions.length === 0 && <p className="text-muted-foreground">Версии критериев ещё не созданы.</p>}
    {h.data!.versions.map(version => <div key={version.id} className="rounded-lg border p-3 space-y-2">
      <div className="flex flex-wrap items-center gap-2"><Badge variant="outline">Версия критериев {version.revision}</Badge><Badge variant="secondary">{version.state === 'approved' ? 'Утверждена внутри центра' : 'Черновик'}</Badge></div>
      <p className="text-xs text-muted-foreground">Создана {outcomeTimeLabel(version.created_at)}{version.approved_at ? ` · утверждена ${outcomeTimeLabel(version.approved_at)}` : ''}</p>
      <p className="whitespace-pre-wrap break-words">{version.definition.review_note}</p>
      <p className="text-xs text-muted-foreground">Основная оценка: {version.definition.main?.kind === 'test' ? 'выбранный тест' : version.definition.main?.kind === 'human_assessment' ? version.definition.main.label : 'ещё не выбрана'} · дополнительных требований: {version.definition.requirements.length}.</p>
      {h.data!.capabilities.can_save && <Button size="sm" variant="outline" disabled={disabled} onClick={() => setEditing({ source: version, clone: version.state === 'approved' || version.created_by !== h.actorId })}>
        {version.state === 'draft' && version.created_by === h.actorId ? 'Редактировать черновик' : 'Создать новый черновик на основе этой версии'}</Button>}
      {version.state === 'draft' && h.data!.capabilities.can_save && version.reviewer_id === h.actorId && <div className="space-y-2">
        {version.definition.independent_review_required && version.created_by === h.actorId && <p className="text-muted-foreground">Этот черновик должен проверить назначенный независимый сотрудник.</p>}
        <Textarea aria-label={`Основание утверждения ${version.id}`} placeholder="Какие критерии, источники и полномочия проверены" maxLength={2000}
          disabled={disabled} value={approvalReasons[version.id] || ''} onChange={event => setApprovalReasons(previous => ({ ...previous, [version.id]: event.target.value }))} />
        <Button size="sm" variant="outline" disabled={disabled || !approvalReasons[version.id]?.trim() || !version.definition.main || !version.definition.eligible_decider_ids.length
          || version.definition.independent_review_required && version.created_by === h.actorId}
          onClick={() => void h.mutate({ action: 'approve_criteria_version', version_id: version.id, expected_revision: version.revision,
            expected_content_hash: version.content_hash, reason: approvalReasons[version.id].trim() })}>Утвердить проверенную версию критериев</Button>
      </div>}
    </div>)}
    {h.data!.capabilities.can_save && h.options && <Button size="sm" variant="outline" disabled={disabled} onClick={() => setEditing({ source: null, clone: false })}>Создать черновик критериев</Button>}
    {editing && h.options && <CriteriaEditor key={`${editing.source?.id || 'new'}:${editing.source?.revision || 0}:${editing.clone}`} controller={h}
      source={editing.source} clone={editing.clone} onClose={() => setEditing(null)} />}
  </div>;
}

function CriteriaEditor({ controller: h, source, clone, onClose }: { controller: LearningCriteriaController; source: c.LearningCriteriaVersion | null; clone: boolean; onClose: () => void }) {
  const options = h.options!;
  const definition = source?.definition;
  const [main, setMain] = useState<ComponentForm | null>(() => definition?.main ? componentFrom(definition.main) : null);
  const [requirements, setRequirements] = useState<ComponentForm[]>(() => definition?.requirements.map(componentFrom) || []);
  const [reviewer, setReviewer] = useState(definition?.reviewer_id || '');
  const [independent, setIndependent] = useState<'' | 'yes' | 'no'>(definition ? definition.independent_review_required ? 'yes' : 'no' : '');
  const [deciders, setDeciders] = useState<string[]>(definition?.eligible_decider_ids || []);
  const [recognitionComponents, setRecognitionComponents] = useState<string[]>(definition?.recognition_component_ids || []);
  const [recognitionFiles, setRecognitionFiles] = useState<string[]>(definition?.recognition_file_version_ids || []);
  const [note, setNote] = useState(definition?.review_note || ''), [reason, setReason] = useState('');
  const disabled = h.busy || h.pending || h.loading;
  const stale = !!source && !clone && !h.data?.versions.some(version => version.id === source.id && version.revision === source.revision && version.content_hash === source.content_hash);
  const buildComponent = (form: ComponentForm): NonNullable<c.LearningCriteriaDefinition['main']> | c.LearningCriteriaDefinition['requirements'][number] | null => {
    if (form.kind === 'human_assessment') return form.label.trim() ? { kind: 'human_assessment', component_id: form.id, label: form.label.trim() } : null;
    if (form.kind === 'module_completion') return options.modules.some(item => item.id === form.module) ? { kind: 'module_completion', component_id: form.id, module_id: form.module } : null;
    if (!options.lessons.some(item => item.id === form.lesson && item.type === 'test') || !form.retake || !form.pass) return null;
    if (form.pass === 'session_pass') return { kind: 'test', component_id: form.id, lesson_id: form.lesson, retake_policy: form.retake, pass_rule: { kind: 'session_pass' } };
    if (!/^(?:100(?:\.0{1,2})?|(?:0|[1-9]\d?)(?:\.\d{1,2})?)$/.test(form.threshold) || !form.rounding) return null;
    const [whole, fraction = ''] = form.threshold.split('.');
    const threshold = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
    return { kind: 'test', component_id: form.id, lesson_id: form.lesson, retake_policy: form.retake,
      pass_rule: { kind: 'percent', threshold_basis_points: threshold, rounding: form.rounding } };
  };
  const mainValue = main ? buildComponent(main) : null, requirementValues = requirements.map(buildComponent);
  const inputsValid = (!main || !!mainValue) && requirementValues.every(Boolean) && independent !== '' && !!note.trim() && !!reason.trim()
    && (!reviewer || options.humans.some(human => human.user_id === reviewer && human.can_review))
    && deciders.every(id => options.humans.some(human => human.user_id === id && human.can_decide))
    && recognitionFiles.every(id => options.files.some(file => file.version_id === id));
  const candidate = { schema_version: 1, main: mainValue, requirements: requirementValues, reviewer_id: reviewer || null,
    independent_review_required: independent === 'yes', eligible_decider_ids: deciders, recognition_component_ids: recognitionComponents,
    recognition_file_version_ids: recognitionFiles, review_note: note.trim() };
  const parsed = c.learningCriteriaDefinitionSchema.safeParse(candidate);
  const toggle = (values: string[], value: string, checked: boolean) => checked ? [...values, value] : values.filter(item => item !== value);
  const save = async () => {
    if (!inputsValid || !parsed.success || disabled || stale) return;
    if (await h.mutate({ action: 'save_criteria_version', course_id: h.data!.course_id, program_version_id: h.data!.program_version_id,
      draft_id: source && !clone ? source.id : null, expected_revision: source && !clone ? source.revision : 0, definition: parsed.data, reason: reason.trim() })) onClose();
  };
  return <div className="rounded-xl border bg-muted/20 p-3 space-y-3">
    <h5 className="font-medium">{source && !clone ? 'Изменение черновика' : 'Новый черновик критериев'}</h5>
    <p className="text-xs text-muted-foreground">Проходной балл, основная оценка и ответственные выбираются по программе центра. Сохранение черновика не утверждает критерии.</p>
    {stale && <p role="alert">Черновик уже изменился. Закройте форму и откройте актуальную версию.</p>}
    <label className="block space-y-1"><span>Основная оценка</span><select className={selectClass} aria-label="Основная оценка" disabled={disabled} value={main?.kind || ''}
      onChange={event => { setMain(event.target.value ? blankComponent(event.target.value as 'test' | 'human_assessment') : null); setRecognitionComponents([]); }}>
      <option value="">Пока не выбрана — сохранить неполный черновик</option><option value="test">Конкретный итоговый тест</option><option value="human_assessment">Оценка ответственным по утверждённым основаниям</option></select></label>
    {main && <ComponentFields form={main} onChange={setMain} options={options} disabled={disabled} label="Основная оценка" />}
    <div className="space-y-2"><p className="font-medium">Дополнительные требования</p>{requirements.map((form, index) => <div className="rounded-lg border p-3 space-y-2" key={form.id}>
      <ComponentFields form={form} onChange={value => setRequirements(previous => previous.map(item => item.id === form.id ? value : item))} options={options} disabled={disabled} label={`Требование ${index + 1}`} />
      <Button size="sm" variant="outline" disabled={disabled} onClick={() => { setRequirements(previous => previous.filter(item => item.id !== form.id)); setRecognitionComponents(previous => previous.filter(id => id !== form.id)); }}>Убрать требование {index + 1}</Button>
    </div>)}<div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" disabled={disabled || requirements.length >= 19} onClick={() => setRequirements(previous => [...previous, blankComponent('test')])}>Добавить обязательный тест</Button>
      <Button size="sm" variant="outline" disabled={disabled || requirements.length >= 19} onClick={() => setRequirements(previous => [...previous, blankComponent('module_completion')])}>Добавить обязательный модуль</Button></div></div>
    <label className="block space-y-1"><span>Проверяющий критерии</span><select aria-label="Проверяющий критерии" className={selectClass} disabled={disabled} value={reviewer} onChange={event => setReviewer(event.target.value)}>
      <option value="">Ещё не назначен</option>{options.humans.filter(human => human.can_review).map(human => <option key={human.user_id} value={human.user_id}>{human.display_name}</option>)}</select></label>
    <label className="block space-y-1"><span>Независимая проверка</span><select aria-label="Независимая проверка" className={selectClass} disabled={disabled} value={independent} onChange={event => setIndependent(event.target.value as typeof independent)}>
      <option value="">Выберите правило центра</option><option value="yes">Требуется другой проверяющий</option><option value="no">Может проверить автор с полномочиями</option></select></label>
    <fieldset className="space-y-2"><legend className="font-medium">Кто вправе принять решение об аттестации</legend>{options.humans.filter(human => human.can_decide).map(human => <label className="flex gap-2 items-start" key={human.user_id}>
      <input type="checkbox" disabled={disabled} checked={deciders.includes(human.user_id)} onChange={event => setDeciders(previous => toggle(previous, human.user_id, event.target.checked))} />{human.display_name}</label>)}</fieldset>
    <details className="space-y-2"><summary className="cursor-pointer">Основания признания ранее полученных результатов</summary><p className="text-xs text-muted-foreground">Укажите только предусмотренные программой компоненты и согласованные версии документов. Сам выбор не засчитывает обучение.</p>
      {[...(main ? [main] : []), ...requirements].map((form, index) => <label className="flex gap-2 items-start" key={form.id}><input type="checkbox" disabled={disabled} checked={recognitionComponents.includes(form.id)}
        onChange={event => setRecognitionComponents(previous => toggle(previous, form.id, event.target.checked))} />{index === 0 && main ? 'Основная оценка' : `Требование ${main ? index : index + 1}`}</label>)}
      {options.files.map(file => <label className="flex gap-2 items-start" key={file.version_id}><input type="checkbox" disabled={disabled || !recognitionFiles.includes(file.version_id) && recognitionFiles.length >= 5}
        checked={recognitionFiles.includes(file.version_id)} onChange={event => setRecognitionFiles(previous => toggle(previous, file.version_id, event.target.checked))} />{file.document_name}</label>)}
    </details>
    <Textarea aria-label="Примечание к критериям" placeholder="Основания, условия и источники критериев по программе центра" disabled={disabled} value={note} maxLength={2000} onChange={event => setNote(event.target.value)} />
    <Textarea aria-label="Основание сохранения критериев" placeholder="Что сохраняется или изменяется и почему" disabled={disabled} value={reason} maxLength={2000} onChange={event => setReason(event.target.value)} />
    <div className="flex gap-2"><Button size="sm" variant="outline" disabled={disabled || stale || !inputsValid || !parsed.success} onClick={() => void save()}>Сохранить черновик критериев</Button>
      <Button size="sm" variant="ghost" disabled={h.busy} onClick={onClose}>Закрыть форму</Button></div>
  </div>;
}

function ComponentFields({ form, onChange, options, disabled, label }: { form: ComponentForm; onChange: (value: ComponentForm) => void;
  options: c.LearningCriteriaOptions; disabled: boolean; label: string }) {
  const change = (value: Partial<ComponentForm>) => onChange({ ...form, ...value });
  if (form.kind === 'human_assessment') return <Input aria-label={`${label}: форма оценки`} placeholder="Как ответственное лицо оценивает итог по программе" value={form.label} disabled={disabled} maxLength={500} onChange={event => change({ label: event.target.value })} />;
  if (form.kind === 'module_completion') return <select aria-label={`${label}: модуль`} className={selectClass} value={form.module} disabled={disabled} onChange={event => change({ module: event.target.value })}>
    <option value="">Выберите существующий модуль курса</option>{options.modules.map(module => <option value={module.id} key={module.id}>{module.title}</option>)}</select>;
  return <div className="space-y-2">
    <select aria-label={`${label}: тест`} className={selectClass} value={form.lesson} disabled={disabled} onChange={event => change({ lesson: event.target.value })}><option value="">Выберите существующий тест курса</option>{options.lessons.filter(lesson => lesson.type === 'test').map(lesson => <option key={lesson.id} value={lesson.id}>{lesson.title}</option>)}</select>
    <select aria-label={`${label}: пересдачи`} className={selectClass} value={form.retake} disabled={disabled} onChange={event => change({ retake: event.target.value as ComponentForm['retake'] })}><option value="">Как учитывать пересдачи</option><option value="latest_completed">Последняя завершённая попытка</option><option value="best_percent">Лучшая доля правильных ответов</option></select>
    <select aria-label={`${label}: правило зачёта`} className={selectClass} value={form.pass} disabled={disabled} onChange={event => change({ pass: event.target.value as ComponentForm['pass'] })}><option value="">Выберите правило зачёта</option><option value="session_pass">Исходный результат тестовой сессии</option><option value="percent">Порог по этой версии критериев</option></select>
    {form.pass === 'percent' && <><Input type="number" aria-label={`${label}: проходной процент`} min="0" max="100" step="0.01" placeholder="Проходной процент по программе" value={form.threshold} disabled={disabled} onChange={event => change({ threshold: event.target.value })} />
      <select aria-label={`${label}: округление`} className={selectClass} value={form.rounding} disabled={disabled} onChange={event => change({ rounding: event.target.value as ComponentForm['rounding'] })}><option value="">Выберите правило округления</option><option value="none">Сравнивать точную долю без округления</option><option value="nearest_integer_half_up">До целого процента: половина вверх</option></select></>}
  </div>;
}
