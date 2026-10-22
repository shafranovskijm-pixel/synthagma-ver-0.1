import { RegistryPendingNotice } from './RegistryPendingNotice';
import { useEffect, useId, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import type { DocumentRegistryModel } from '@/hooks/useDocumentRegistry';
import { registryDataSchema, registryIncomingDataSchema, type RegistryContext, type RegistryContextChoice, type RegistryData, type RegistryIncoming, type RegistryIncomingData, type RegistryIncomingTarget, type RegistryLegacy, type RegistryMutation, type RegistryParty, type RegistryPartyChoice, type RegistryRead, type RegistryRecord, type RegistrySourceChoice, type RegistrySubject } from '@/lib/documentRegistry/contract';
import { normalizeRegistryError, registryMessages } from '@/lib/documentRegistry/errors';
import { RegistryChoice, RegistrySourceField } from './RegistrySourceField';

export const REGISTRY_DOCUMENT_TYPES = [{ value: 'contract', label: 'Договор' }, { value: 'enrollment_order', label: 'Приказ о зачислении' }, { value: 'expulsion_order', label: 'Приказ об отчислении' }, { value: 'certificate', label: 'Удостоверение' }, { value: 'diploma', label: 'Диплом' }, { value: 'qualification', label: 'Свидетельство' }, { value: 'protocol', label: 'Протокол' }, { value: 'invoice', label: 'Счёт' }, { value: 'act', label: 'Акт' }, { value: 'other', label: 'Прочее' }] as const;
const partyKey = (party: RegistryParty) => party.kind === 'student' ? 'student:' + party.user_id : party.kind === 'company' ? 'company:' + party.company_id : party.kind;
const contextKey = (context: RegistryContext) => context.kind === 'enrollment' ? context.enrollment_id : context.kind === 'organization' ? 'organization' : context.contract_id;
type Validation = Extract<RegistryRead, { kind: 'validate' | 'validate_incoming' }>['validation'];

export function DocumentRegistryForm({ model, record = null, incoming = null, legacy = null, incomingOnly = false, onSaved, onCancel }: { model: DocumentRegistryModel; record?: RegistryRecord | null; incoming?: RegistryIncoming | null; legacy?: RegistryLegacy | null; incomingOnly?: boolean; onSaved: (result: RegistryMutation) => void; onCancel: () => void }) {
  const id = useId(), mounted = useRef(true), partyTicket = useRef(0), contextTicket = useRef(0), validationTicket = useRef(0);
  const ownParty: RegistryParty = { kind: 'organization', organization_id: model.organizationId };
  const initialDirection = record?.data.direction ?? (incoming || incomingOnly ? 'incoming' : 'outgoing');
  const [direction, setDirection] = useState<'incoming' | 'outgoing'>(initialDirection), [type, setType] = useState<RegistryData['document_type']>(record?.data.document_type ?? incoming?.doc_type ?? 'other');
  const [title, setTitle] = useState(record?.data.title ?? incoming?.title ?? legacy?.claim.document_name ?? ''), [date, setDate] = useState(record?.data.document_date ?? incoming?.doc_date ?? legacy?.claim.issued_at.slice(0, 10) ?? new Date().toISOString().slice(0, 10));
  const [number, setNumber] = useState(record?.data.declared_document_number ?? incoming?.doc_number ?? legacy?.claim.reg_number ?? ''), [notes, setNotes] = useState(record?.data.notes ?? incoming?.notes ?? ''), [reason, setReason] = useState('');
  const [source, setSource] = useState<RegistrySourceChoice | null>(record ? { source: record.data.source, label: record.source_label ?? 'Сохранённая версия текущей записи' } : incoming?.linked_source ? { source: incoming.linked_source, label: incoming.source_label ?? 'Сохранённая версия входящего файла' } : null);
  const [party, setParty] = useState<RegistryParty>(record ? record.data.direction === 'incoming' ? record.data.sender : record.data.recipient : { kind: 'external', entity_type: 'organization', name: incoming?.counterparty_name ?? '', inn: incoming?.counterparty_inn ?? null });
  const [subject, setSubject] = useState<RegistrySubject>(record?.data.subject ?? (legacy?.relationship_verified && legacy.student ? { kind: 'student', user_id: legacy.student.user_id } : { kind: 'none' }));
  const [contextKind, setContextKind] = useState<RegistryContext['kind']>(record?.data.context.kind ?? 'organization'), [context, setContext] = useState<RegistryContext | null>(record?.data.context ?? null), [notApplicable, setNotApplicable] = useState(record?.data.context.kind === 'organization' ? record.data.context.not_applicable_reason : '');
  const [combinedEnrollment, setCombinedEnrollment] = useState(record?.data.context.kind === 'enrollment_contract' ? record.data.context.enrollment_id : 'none');
  const [partySearch, setPartySearch] = useState(''), [contextSearch, setContextSearch] = useState(''), [parties, setParties] = useState<RegistryPartyChoice[]>([]), [studentsNext, setStudentsNext] = useState<string | null>(null), [companiesNext, setCompaniesNext] = useState<string | null>(null);
  const [contexts, setContexts] = useState<RegistryContextChoice[]>([]), [contextNext, setContextNext] = useState<string | null>(null), [enrollmentChoices, setEnrollmentChoices] = useState<RegistryContextChoice[]>([]), [enrollmentNext, setEnrollmentNext] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false), [sourceBusy, setSourceBusy] = useState(false), [reviewBusy, setReviewBusy] = useState(false), [review, setReview] = useState<Validation | null>(null);
  const current = () => mounted.current && model.scopeCurrent();
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; partyTicket.current++; contextTicket.current++; validationTicket.current++; }; }, []);
  const invalidate = () => { validationTicket.current++; setReview(null); };
  const disabled = model.saving || model.pending || sourceBusy || reviewBusy;
  const target: RegistryIncomingTarget = incoming ? { kind: 'existing', incoming_document_id: incoming.id, expected_binding_hash: incoming.binding_hash } : { kind: 'new' };
  const loadParties = async (kind?: 'student' | 'company', more = false) => {
    if (!current()) return;
    const ticket = ++partyTicket.current; setLoading(true);
    try {
      const kinds: ('student' | 'company')[] = kind ? [kind] : ['student', 'company'];
      const results = await Promise.all(kinds.map(party_kind => model.read({ kind: 'parties', party_kind, text: partySearch, after_id: more ? party_kind === 'student' ? studentsNext : companiesNext : null, limit: 100 })));
      if (!current() || ticket !== partyTicket.current) return;
      const rows = results.flatMap(result => result.kind === 'parties' ? result.parties : []);
      setParties(old => more ? [...old, ...rows.filter(row => !old.some(known => partyKey(known.party) === partyKey(row.party)))] : rows);
      results.forEach((result, index) => { if (result.kind === 'parties') { if (kinds[index] === 'student') setStudentsNext(result.next_after_id); else setCompaniesNext(result.next_after_id); } });
    } catch (error) { if (current() && ticket === partyTicket.current) setError(registryMessages[normalizeRegistryError(error).code]); }
    finally { if (current() && ticket === partyTicket.current) setLoading(false); }
  };
  useEffect(() => { const timer = setTimeout(() => void loadParties(), 250); return () => { clearTimeout(timer); partyTicket.current++; }; }, [partySearch, model.read]);
  const loadContexts = async (more = false, enrollmentStep = false) => {
    if (!current() || contextKind === 'organization' || contextKind === 'enrollment_contract' && !enrollmentStep && combinedEnrollment === 'none') return;
    const ticket = ++contextTicket.current; setLoading(true);
    const kind = enrollmentStep ? 'enrollment' : contextKind as 'enrollment' | 'contract' | 'enrollment_contract';
    try {
      const result = await model.read({ kind: 'contexts', subject, context_kind: kind, enrollment_id: kind === 'enrollment_contract' ? combinedEnrollment : null, text: contextSearch, after_id: more ? enrollmentStep ? enrollmentNext : contextNext : null, limit: 100 });
      if (!current() || ticket !== contextTicket.current || result.kind !== 'contexts') return;
      if (enrollmentStep) { setEnrollmentChoices(old => more ? [...old, ...result.contexts] : result.contexts); setEnrollmentNext(result.next_after_id); }
      else { setContexts(old => more ? [...old, ...result.contexts] : result.contexts); setContextNext(result.next_after_id); }
    } catch (error) { if (current() && ticket === contextTicket.current) setError(registryMessages[normalizeRegistryError(error).code]); }
    finally { if (current() && ticket === contextTicket.current) setLoading(false); }
  };
  useEffect(() => {
    const timer = setTimeout(async () => { if (contextKind === 'enrollment_contract') { await loadContexts(false, true); if (current()) await loadContexts(); } else await loadContexts(); }, 250);
    return () => { clearTimeout(timer); contextTicket.current++; };
  }, [contextKind, subject.kind, subject.kind === 'student' ? subject.user_id : null, combinedEnrollment, contextSearch, model.read]);
  const buildData = () => {
    const selectedContext = contextKind === 'organization' ? { kind: 'organization', not_applicable_reason: notApplicable.trim() } : context;
    const origin = record?.data.origin ?? (legacy ? { kind: 'legacy_issuance_log', legacy_id: legacy.id, legacy_binding_hash: legacy.legacy_binding_hash, relationship_reason: reason.trim() } : { kind: 'org_document' });
    const data = { direction, document_type: type, title: title.trim(), document_date: date, declared_document_number: number.trim() || null, source: source?.source, sender: direction === 'incoming' ? party : ownParty, recipient: direction === 'incoming' ? ownParty : party, subject, context: selectedContext, notes: notes.trim() };
    const parsed = record || direction === 'outgoing' ? registryDataSchema.safeParse({ ...data, origin }) : registryIncomingDataSchema.safeParse(data);
    if (!parsed.success || !reason.trim()) { setError(registryMessages.INVALID_INPUT); return null; }
    return parsed.data as RegistryData | RegistryIncomingData;
  };
  const validate = async () => {
    if (!current() || disabled) return; setError(null); const data = buildData(); if (!data) return;
    const ticket = ++validationTicket.current; setReviewBusy(true);
    try {
      const result = await model.read(!record && direction === 'incoming' ? { kind: 'validate_incoming', incoming: target, data: data as RegistryIncomingData } : { kind: 'validate', data: data as RegistryData });
      if (current() && ticket === validationTicket.current && (result.kind === 'validate' || result.kind === 'validate_incoming')) setReview(result.validation);
    } catch (error) { if (current() && ticket === validationTicket.current) setError(registryMessages[normalizeRegistryError(error).code]); }
    finally { if (current() && ticket === validationTicket.current) setReviewBusy(false); }
  };
  const save = async () => {
    if (!current() || disabled || !review) return;
    setError(null);
    try {
      const result = await model.mutate(record?.revision ?? 0, record ? { action: 'correct', record_id: record.id, data: review.data as RegistryData, reason: reason.trim() }
        : direction === 'incoming' ? { action: 'register_incoming', incoming: target, data: review.data as RegistryIncomingData, reason: reason.trim() } : { action: 'register', data: review.data as RegistryData, reason: reason.trim() });
      if (current()) onSaved(result);
    } catch (failure) { if (current()) { const code = normalizeRegistryError(failure).code; setError(registryMessages[code] + (code === 'REVISION_CONFLICT' ? ' Ваш текст остался в форме. Скопируйте нужное, закройте форму и обновите реестр.' : '')); } }
  };
  const options = parties.map(choice => ({ value: partyKey(choice.party), label: choice.label }));
  const selectedParty = party.kind === 'student' || party.kind === 'company';
  if (selectedParty && !options.some(option => option.value === partyKey(party))) options.push({ value: partyKey(party), label: record ? direction === 'incoming' ? record.sender_label : record.recipient_label : 'Сохранённая выбранная связь' });
  const subjectOptions = parties.filter(choice => choice.party.kind === 'student').map(choice => ({ value: choice.party.kind === 'student' ? choice.party.user_id : '', label: choice.label }));
  const selectedSubject = subject.kind === 'student' ? subject.user_id : null;
  if (selectedSubject && !subjectOptions.some(option => option.value === selectedSubject)) subjectOptions.push({ value: selectedSubject, label: record?.subject_label ?? legacy?.student?.label ?? 'Сохранённая связь с учеником' });
  const contextOptions = contexts.map(choice => ({ value: contextKey(choice.context), label: choice.label }));
  if (context && context.kind !== 'organization' && !contextOptions.some(option => option.value === contextKey(context))) contextOptions.push({ value: contextKey(context), label: record?.context_label ?? 'Ранее выбранная подтверждённая связь' });
  return <div className="space-y-4">
    {incoming?.legacy_unversioned && <p className="text-sm text-muted-foreground">Прежний файл и поля входящего документа сохранятся. Для регистрации выберите точную сохранённую версию или отдельно сохраните исходник.</p>}
    {legacy && <p className="text-sm text-muted-foreground">Это новая регистрация выбранного файла со ссылкой на историческую запись. Прежняя выдача, файл или вручение этим не подтверждаются.</p>}
    <fieldset disabled={disabled} className="space-y-4">
      <RegistryChoice label="Направление" value={direction} options={[{ value: 'outgoing', label: 'Исходящий' }, { value: 'incoming', label: 'Входящий' }]} onChange={value => { setDirection(value as typeof direction); invalidate(); }} disabled={disabled || !!record || !!incoming || !!legacy || incomingOnly} />
      <RegistryChoice label="Тип документа" value={type} options={[...REGISTRY_DOCUMENT_TYPES]} onChange={value => { setType(value as typeof type); invalidate(); }} disabled={disabled} />
      <div className="space-y-2"><Label htmlFor={id + '-internal'}>Внутренний номер регистрации</Label><Input id={id + '-internal'} readOnly value={record?.registration_id ?? 'Назначится сервером после сохранения'} className="rounded-xl bg-muted/40" /><p className="text-xs text-muted-foreground">Официальный номер документа об образовании здесь не выдаётся и не изменяется.</p></div>
      <div className="space-y-2"><Label htmlFor={id + '-title'}>Наименование *</Label><Input id={id + '-title'} value={title} maxLength={500} onChange={event => { setTitle(event.target.value); invalidate(); }} className="rounded-xl" /></div>
      <div className="grid grid-cols-2 gap-3"><div className="space-y-2"><Label htmlFor={id + '-number'}>Заявленный номер документа</Label><Input id={id + '-number'} value={number} maxLength={120} onChange={event => { setNumber(event.target.value); invalidate(); }} className="rounded-xl" /></div><div className="space-y-2"><Label htmlFor={id + '-date'}>Дата документа *</Label><Input id={id + '-date'} type="date" value={date} onChange={event => { setDate(event.target.value); invalidate(); }} className="rounded-xl" /></div></div>
      <RegistrySourceField model={model} value={source} title={title} onChange={value => { setSource(value); invalidate(); }} onBusy={setSourceBusy} disabled={model.saving || model.pending || reviewBusy} />
      <p className="text-xs text-muted-foreground">{direction === 'incoming' ? 'Получатель — текущая организация. Ниже выберите отправителя.' : 'Отправитель — текущая организация. Ниже выберите получателя.'}</p>
      <Input aria-label="Поиск учеников и компаний" value={partySearch} maxLength={200} onChange={event => setPartySearch(event.target.value)} placeholder="Поиск участников и компаний..." className="rounded-xl" />
      <RegistryChoice label={direction === 'incoming' ? 'Отправитель' : 'Получатель'} value={selectedParty ? partyKey(party) : 'external'} options={[{ value: 'external', label: 'Внешнее лицо — введённые сведения' }, ...options]} onChange={key => { setParty(parties.find(choice => partyKey(choice.party) === key)?.party ?? (selectedParty && partyKey(party) === key ? party : { kind: 'external', entity_type: 'person', name: '', inn: null })); invalidate(); }} disabled={disabled || loading} />
      {party.kind === 'external' && <><RegistryChoice label="Внешний контрагент" value={party.entity_type} options={[{ value: 'person', label: 'Физическое лицо' }, { value: 'organization', label: 'Организация' }]} onChange={value => { setParty(previous => previous.kind === 'external' ? { ...previous, entity_type: value as 'person' | 'organization' } : previous); invalidate(); }} disabled={disabled} /><div className="space-y-2"><Label htmlFor={id + '-party'}>Имя / наименование контрагента *</Label><Input id={id + '-party'} value={party.name} maxLength={300} onChange={event => { setParty(previous => previous.kind === 'external' ? { ...previous, name: event.target.value } : previous); invalidate(); }} className="rounded-xl" /></div><div className="space-y-2"><Label htmlFor={id + '-inn'}>ИНН, если известен</Label><Input id={id + '-inn'} value={party.inn ?? ''} maxLength={12} onChange={event => { setParty(previous => previous.kind === 'external' ? { ...previous, inn: event.target.value || null } : previous); invalidate(); }} className="rounded-xl" /></div><p className="text-xs text-muted-foreground">Введённое имя не создаёт учётную запись и не подтверждает личность.</p></>}
      <RegistryChoice label="Ученик, к которому относится документ" value={subject.kind === 'student' ? subject.user_id : 'none'} options={[{ value: 'none', label: 'Не относится к конкретному ученику' }, ...subjectOptions]} onChange={value => { setSubject(value === 'none' ? { kind: 'none' } : { kind: 'student', user_id: value }); setContext(null); setCombinedEnrollment('none'); invalidate(); }} disabled={disabled || loading} />
      <div className="flex gap-2">{studentsNext && <Button variant="outline" size="sm" onClick={() => loadParties('student', true)} disabled={disabled || loading}>Ещё ученики</Button>}{companiesNext && <Button variant="outline" size="sm" onClick={() => loadParties('company', true)} disabled={disabled || loading}>Ещё компании</Button>}</div>
      <RegistryChoice label="Связь с обучением / договором" value={contextKind} options={[{ value: 'enrollment', label: 'Зачисление на курс' }, { value: 'contract', label: 'Договор' }, { value: 'enrollment_contract', label: 'Зачисление и договор' }, { value: 'organization', label: 'Общий документ организации' }]} onChange={value => { setContextKind(value as typeof contextKind); setContext(null); setCombinedEnrollment('none'); setContexts([]); invalidate(); }} disabled={disabled} />
      {contextKind === 'organization' ? <div className="space-y-2"><Label htmlFor={id + '-na'}>Почему связь с зачислением / договором не применяется *</Label><Textarea id={id + '-na'} value={notApplicable} maxLength={2000} onChange={event => { setNotApplicable(event.target.value); invalidate(); }} className="rounded-xl" /></div> : <>
        <Input aria-label="Поиск зачисления или договора" value={contextSearch} maxLength={200} onChange={event => setContextSearch(event.target.value)} placeholder="Найти зачисление или договор..." className="rounded-xl" />
        {contextKind === 'enrollment_contract' && <><RegistryChoice label="Точное зачисление" value={combinedEnrollment} options={[{ value: 'none', label: 'Выберите зачисление' }, ...enrollmentChoices.map(choice => ({ value: choice.context.kind === 'enrollment' ? choice.context.enrollment_id : '', label: choice.label })), ...(combinedEnrollment !== 'none' && !enrollmentChoices.some(choice => choice.context.kind === 'enrollment' && choice.context.enrollment_id === combinedEnrollment) ? [{ value: combinedEnrollment, label: 'Сохранённое зачисление текущей записи' }] : [])]} onChange={value => { setCombinedEnrollment(value); setContext(null); invalidate(); }} disabled={disabled || loading} />{enrollmentNext && <Button variant="outline" size="sm" onClick={() => loadContexts(true, true)} disabled={disabled || loading}>Ещё зачисления</Button>}</>}
        <RegistryChoice label={contextKind === 'enrollment' ? 'Точное зачисление' : 'Точный договор'} value={context ? contextKey(context) : 'none'} options={[{ value: 'none', label: 'Выберите подтверждённую связь' }, ...contextOptions]} onChange={value => { setContext(contexts.find(choice => contextKey(choice.context) === value)?.context ?? (context && contextKey(context) === value ? context : null)); invalidate(); }} disabled={disabled || loading || contextKind === 'enrollment_contract' && combinedEnrollment === 'none'} />{contextNext && <Button variant="outline" size="sm" onClick={() => loadContexts(true)} disabled={disabled || loading}>Ещё связи</Button>}
      </>}
      <div className="space-y-2"><Label htmlFor={id + '-notes'}>Примечание</Label><Textarea id={id + '-notes'} value={notes} maxLength={4000} onChange={event => { setNotes(event.target.value); invalidate(); }} className="rounded-xl" /></div>
      <div className="space-y-2"><Label htmlFor={id + '-reason'}>{record ? 'Причина исправления *' : 'Основание регистрации *'}</Label><Textarea id={id + '-reason'} value={reason} maxLength={2000} onChange={event => { setReason(event.target.value); invalidate(); }} className="rounded-xl" /></div>
    </fieldset>
    {error && <p role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error}</p>}
    {review && <div className="rounded-xl border border-border bg-muted/30 p-4 space-y-2" role="status"><p className="font-medium">Связи проверены</p><p className="text-sm">Файл: {review.source_label}</p><p className="text-sm">{review.sender_label} → {review.recipient_label}</p>{review.subject_label && <p className="text-sm">Ученик: {review.subject_label}</p>}<p className="text-sm">{review.context_label}</p><p className="text-xs text-muted-foreground">Регистрация не подтверждает подпись, выдачу или вручение документа. Дата документа остаётся сообщённой; время регистрации назначит сервер.</p></div>}
    <RegistryPendingNotice model={model} onResult={onSaved} onCancel={onCancel} />
    <div className="flex flex-wrap justify-end gap-2"><Button variant="outline" onClick={onCancel} disabled={model.saving || model.pending}>Отмена</Button><Button variant="outline" onClick={validate} disabled={disabled || !source || !reason.trim()}>Проверить связи</Button><Button onClick={save} disabled={disabled || !review}>{record ? 'Сохранить исправление' : 'Зарегистрировать'}</Button></div>
  </div>;
}
