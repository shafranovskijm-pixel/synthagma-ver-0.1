import { useId, useState } from 'react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { SigmaSpinner } from '@/components/ui/SigmaSpinner';
import { copyDataSchema, type CopyData, type CopyMutation, type CopyRecord, type CopyVerifiedOriginal } from '@/lib/copyRegistry/contract';
import { copyRegistryMessages, normalizeCopyRegistryError } from '@/lib/copyRegistry/errors';
import type { CopyRegistryModel } from '@/hooks/useCopyRegistry';

export const COPY_REASONS = [
  { value: 'lost', label: 'Утеря оригинала' }, { value: 'damaged', label: 'Порча оригинала' },
  { value: 'name_change', label: 'Изменение ФИО' }, { value: 'employer_request', label: 'Запрос работодателя' },
  { value: 'archive', label: 'Для архива' }, { value: 'other', label: 'Другая причина' },
] as const;
export interface CopyOriginalChoice { label: string; original: CopyVerifiedOriginal }
export interface CopyPersonChoice { user_id: string; label: string }
export function CopyChoice({ label, value, options, onChange, disabled = false }: { label: string; value: string; options: { value: string; label: string }[]; onChange: (value: string) => void; disabled?: boolean }) {
  const id = useId();
  return <div className="space-y-2"><Label htmlFor={id}>{label}</Label><Select value={value} onValueChange={onChange} disabled={disabled}><SelectTrigger id={id} aria-label={label} className="rounded-xl"><SelectValue /></SelectTrigger><SelectContent>{options.map(option => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectContent></Select></div>;
}

interface FormState {
  copyType: 'copy' | 'duplicate'; declaredNumber: string; documentDate: string; original: CopyData['original'] | null;
  subjectId: string; recipientMode: 'person' | 'external'; recipientId: string; recipientName: string;
  capacity: 'self' | 'representative' | 'organization' | 'other'; basisReason: CopyData['basis']['reason']; basisNote: string; evidence: CopyVerifiedOriginal | null; notes: string; correctionReason: string;
}
function initialForm(record: CopyRecord | null): FormState {
  const data = record?.data;
  return {
    copyType: data?.copy_type ?? 'copy', declaredNumber: data?.declared_number ?? '', documentDate: data?.document_date ?? format(new Date(), 'yyyy-MM-dd'), original: data?.original ?? null,
    subjectId: data?.subject.kind === 'person' ? data.subject.user_id : 'none', recipientMode: data?.recipient.kind ?? 'person',
    recipientId: data?.recipient.kind === 'person' ? data.recipient.user_id : 'none', recipientName: data?.recipient.kind === 'external' ? data.recipient.name : '',
    capacity: data?.recipient.kind === 'external' ? data.recipient.capacity : 'self', basisReason: data?.basis.reason ?? 'other', basisNote: data?.basis.note ?? '',
    evidence: data?.basis.evidence ?? null, notes: data?.notes ?? '', correctionReason: '',
  };
}

export function CopyRegistryForm({ model, record, originals, people, originalsNext, peopleNext, onMoreOriginals, onMorePeople, onCancel, onSaved }: {
  model: CopyRegistryModel; record: CopyRecord | null; originals: CopyOriginalChoice[]; people: CopyPersonChoice[]; originalsNext: boolean; peopleNext: boolean;
  onMoreOriginals: () => void; onMorePeople: () => void; onCancel: () => void; onSaved: (result: CopyMutation) => void;
}) {
  const [form, setForm] = useState<FormState>(() => initialForm(record));
  const inputId = useId();
  const disabled = model.saving || model.pending;
  const currentOriginal = record?.data.original, currentSubject = record?.data.subject, currentRecipient = record?.data.recipient, currentEvidence = record?.data.basis.evidence;
  const originalValue = form.original?.kind === 'org_document_version' ? form.original.version_id : form.original?.kind === 'unresolved' ? 'historical' : 'none';
  const originalOptions = [{ value: 'none', label: 'Выберите сохранённую версию оригинала' },
    ...(record?.data.original.kind === 'unresolved' ? [{ value: 'historical', label: 'Сохранить историческое описание без подтверждённой связи' }] : []),
    ...originals.map(choice => ({ value: choice.original.version_id, label: choice.label }))];
  if (currentOriginal?.kind === 'org_document_version' && !originalOptions.some(option => option.value === currentOriginal.version_id)) {
    originalOptions.push({ value: currentOriginal.version_id, label: record.original_label ?? 'Сохранённая версия текущего оригинала' });
  }
  const evidenceOptions = [{ value: 'none', label: 'Не приложено' }, ...originals.map(choice => ({ value: choice.original.version_id, label: choice.label }))];
  if (currentEvidence && !evidenceOptions.some(option => option.value === currentEvidence.version_id)) evidenceOptions.push({ value: currentEvidence.version_id, label: 'Сохранённая версия подтверждения основания' });
  const personOptions = people.map(person => ({ value: person.user_id, label: person.label }));
  if (currentSubject?.kind === 'person' && !personOptions.some(option => option.value === currentSubject.user_id)) personOptions.push({ value: currentSubject.user_id, label: record.subject_label ?? 'Участник текущей записи' });
  if (currentRecipient?.kind === 'person' && !personOptions.some(option => option.value === currentRecipient.user_id)) personOptions.push({ value: currentRecipient.user_id, label: record.recipient_label });
  const selectOriginal = (value: string) => {
    const original = value === 'historical' && record?.data.original.kind === 'unresolved' ? record.data.original
      : originals.find(choice => choice.original.version_id === value)?.original
        ?? (record?.data.original.kind === 'org_document_version' && record.data.original.version_id === value ? record.data.original : null);
    setForm(previous => ({ ...previous, original }));
  };
  const save = async () => {
    if (!model.scopeCurrent() || disabled) return;
    const data = copyDataSchema.safeParse({ copy_type: form.copyType, declared_number: form.declaredNumber.trim() || null, document_date: form.documentDate,
      original: form.original, subject: form.subjectId === 'none' ? { kind: 'none' } : { kind: 'person', user_id: form.subjectId },
      recipient: form.recipientMode === 'person' ? { kind: 'person', user_id: form.recipientId } : { kind: 'external', name: form.recipientName.trim(), capacity: form.capacity },
      basis: { reason: form.basisReason, note: form.basisNote.trim(), evidence: form.evidence }, notes: form.notes.trim() });
    if (!data.success) { toast.error(copyRegistryMessages.INVALID_INPUT); return; }
    const payload = data.data as CopyData;
    if (!record && payload.original.kind !== 'org_document_version' || record && !form.correctionReason.trim()) { toast.error(copyRegistryMessages.INVALID_INPUT); return; }
    try {
      const result = await model.mutate(record?.revision ?? 0, record ? { action: 'update', record_id: record.id, data: payload, reason: form.correctionReason.trim() } : { action: 'create', data: payload });
      if (model.scopeCurrent()) onSaved(result);
    } catch (error) { if (model.scopeCurrent()) toast.error(copyRegistryMessages[normalizeCopyRegistryError(error).code]); }
  };
  return <div className="space-y-4">
    <fieldset disabled={disabled} className="space-y-4">
      <CopyChoice label="Тип записи" value={form.copyType} options={[{ value: 'copy', label: 'Копия' }, { value: 'duplicate', label: 'Дубликат' }]} onChange={value => setForm(previous => ({ ...previous, copyType: value as FormState['copyType'] }))} disabled={disabled} />
      <div className="space-y-2"><Label htmlFor={inputId + '-internal'}>Внутренний номер реестра</Label><Input id={inputId + '-internal'} value={record?.registration_id ?? 'Назначится сервером при сохранении'} readOnly className="rounded-xl bg-muted/40" /><p className="text-xs text-muted-foreground">Это номер записи реестра. Выдача официального документа и передача получателю фиксируются отдельно.</p></div>
      <div className="space-y-2"><Label htmlFor={inputId + '-declared'}>Прежний / внешний номер, если есть</Label><Input id={inputId + '-declared'} value={form.declaredNumber} maxLength={120} onChange={event => setForm(previous => ({ ...previous, declaredNumber: event.target.value }))} className="rounded-xl" /></div>
      <CopyChoice label="Оригинал и его сохранённая версия *" value={originalValue} options={originalOptions} onChange={selectOriginal} disabled={disabled} />
      {originalsNext && <Button type="button" variant="outline" size="sm" onClick={onMoreOriginals} disabled={disabled}>Показать ещё оригиналы</Button>}
      {form.original?.kind === 'unresolved' && <p className="text-xs text-muted-foreground">Историческое описание: {form.original.document_type}, № {form.original.document_number}, {form.original.issue_date}. Связь с файлом не подтверждена.</p>}
      <CopyChoice label="Участник, к которому относится оригинал" value={form.subjectId} options={[{ value: 'none', label: 'Без привязки к участнику' }, ...personOptions]} onChange={value => setForm(previous => ({ ...previous, subjectId: value }))} disabled={disabled} />
      <CopyChoice label="Кому передаётся копия" value={form.recipientMode} options={[{ value: 'person', label: 'Участник платформы' }, { value: 'external', label: 'Другой получатель — введённые сведения' }]} onChange={value => setForm(previous => ({ ...previous, recipientMode: value as FormState['recipientMode'] }))} disabled={disabled} />
      {form.recipientMode === 'person' ? <CopyChoice label="Получатель *" value={form.recipientId} options={[{ value: 'none', label: 'Выберите получателя' }, ...personOptions]} onChange={value => setForm(previous => ({ ...previous, recipientId: value }))} disabled={disabled} /> : <>
        <div className="space-y-2"><Label htmlFor={inputId + '-recipient'}>Имя / наименование получателя *</Label><Input id={inputId + '-recipient'} value={form.recipientName} maxLength={300} onChange={event => setForm(previous => ({ ...previous, recipientName: event.target.value }))} className="rounded-xl" /></div>
        <CopyChoice label="В качестве кого получает" value={form.capacity} options={[{ value: 'self', label: 'Лично' }, { value: 'representative', label: 'Представитель' }, { value: 'organization', label: 'Организация' }, { value: 'other', label: 'Иное' }]} onChange={value => setForm(previous => ({ ...previous, capacity: value as FormState['capacity'] }))} disabled={disabled} />
      </>}
      {peopleNext && <Button type="button" variant="outline" size="sm" onClick={onMorePeople} disabled={disabled}>Показать ещё участников</Button>}
      <div className="space-y-2"><Label htmlFor={inputId + '-date'}>Дата документа / записи *</Label><Input id={inputId + '-date'} type="date" value={form.documentDate} onChange={event => setForm(previous => ({ ...previous, documentDate: event.target.value }))} className="rounded-xl" /><p className="text-xs text-muted-foreground">Сообщённая дата не подтверждает передачу получателю.</p></div>
      <CopyChoice label="Основание" value={form.basisReason} options={[...COPY_REASONS]} onChange={value => setForm(previous => ({ ...previous, basisReason: value as FormState['basisReason'] }))} disabled={disabled} />
      <div className="space-y-2"><Label htmlFor={inputId + '-basis'}>Основание / заявление *</Label><Textarea id={inputId + '-basis'} value={form.basisNote} maxLength={2000} onChange={event => setForm(previous => ({ ...previous, basisNote: event.target.value }))} rows={3} className="rounded-xl resize-none" /></div>
      <CopyChoice label="Сохранённое подтверждение основания" value={form.evidence?.version_id ?? 'none'} options={evidenceOptions} onChange={value => setForm(previous => ({ ...previous, evidence: originals.find(choice => choice.original.version_id === value)?.original ?? (record?.data.basis.evidence?.version_id === value ? record.data.basis.evidence : null) }))} disabled={disabled} />
      <div className="space-y-2"><Label htmlFor={inputId + '-notes'}>Примечание</Label><Textarea id={inputId + '-notes'} value={form.notes} maxLength={4000} onChange={event => setForm(previous => ({ ...previous, notes: event.target.value }))} rows={3} className="rounded-xl resize-none" /></div>
      {record && <div className="space-y-2"><Label htmlFor={inputId + '-correction'}>Причина исправления *</Label><Textarea id={inputId + '-correction'} value={form.correctionReason} maxLength={2000} onChange={event => setForm(previous => ({ ...previous, correctionReason: event.target.value }))} rows={2} className="rounded-xl resize-none" /></div>}
    </fieldset>
    <div className="flex justify-end gap-2"><Button variant="outline" onClick={onCancel} disabled={disabled}>Отмена</Button><Button onClick={save} disabled={disabled || (record ? !record.can_edit : !model.capabilities?.can_create)}>{model.saving && <SigmaSpinner size="sm" className="mr-2" />}{record ? 'Сохранить исправление' : 'Добавить запись'}</Button></div>
  </div>;
}
