import { RegistryPendingNotice } from './RegistryPendingNotice';
import { useId, useRef, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import type { DocumentRegistryModel } from '@/hooks/useDocumentRegistry';
import { registryCaptureIncomingSchema, type RegistryCaptureIncoming, type RegistryMutation, type RegistrySourceChoice } from '@/lib/documentRegistry/contract';
import { normalizeRegistryError, registryMessages } from '@/lib/documentRegistry/errors';
import { RegistryChoice, RegistrySourceField } from './RegistrySourceField';

/** Save a private incoming source without pretending that it is registered or issued. */
export function CaptureIncomingForm({ model, onSaved, onCancel }: { model: DocumentRegistryModel; onSaved: (result: RegistryMutation) => void; onCancel: () => void }) {
  const id = useId(), mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const current = () => mounted.current && model.scopeCurrent();
  const [type, setType] = useState<RegistryCaptureIncoming['doc_type']>('other'), [title, setTitle] = useState(''), [name, setName] = useState(''), [inn, setInn] = useState(''), [number, setNumber] = useState(''), [date, setDate] = useState(''), [notes, setNotes] = useState('');
  const [source, setSource] = useState<RegistrySourceChoice | null>(null), [sourceBusy, setSourceBusy] = useState(false), [error, setError] = useState<string | null>(null);
  const disabled = sourceBusy || model.saving || model.pending;
  const save = async () => {
    if (!current() || disabled || !model.capabilities?.can_capture_incoming) return;
    setError(null);
    const parsed = registryCaptureIncomingSchema.safeParse({ doc_type: type, title: title.trim(), counterparty_name: name.trim() || null, counterparty_inn: inn.trim() || null, doc_number: number.trim() || null, doc_date: date || null, notes: notes.trim(), source: source?.source });
    if (!parsed.success) { setError(registryMessages.INVALID_INPUT); return; }
    try { const result = await model.mutate(0, { action: 'capture_incoming', data: parsed.data as RegistryCaptureIncoming }); if (current()) onSaved(result); }
    catch (failure) { if (current()) setError(registryMessages[normalizeRegistryError(failure).code]); }
  };
  return <div className="space-y-4">
    <p className="text-sm text-muted-foreground">Файл сохранится во входящих без регистрации. Внутренний номер, запись журнала, подпись или факт вручения не создаются.</p>
    <fieldset disabled={disabled} className="space-y-4">
      <RegistryChoice label="Тип входящего документа" value={type} options={[{ value: 'contract', label: 'Договор' }, { value: 'act', label: 'Акт' }, { value: 'invoice', label: 'Счёт' }, { value: 'other', label: 'Прочее' }]} onChange={value => setType(value as typeof type)} disabled={disabled} />
      <div className="space-y-2"><Label htmlFor={id + '-title'}>Название *</Label><Input id={id + '-title'} value={title} onChange={event => setTitle(event.target.value)} maxLength={500} className="rounded-xl" /></div>
      <RegistrySourceField model={model} value={source} title={title} onChange={setSource} onBusy={setSourceBusy} disabled={model.saving || model.pending} />
      <div className="space-y-2"><Label htmlFor={id + '-name'}>Контрагент — введённые сведения</Label><Input id={id + '-name'} value={name} onChange={event => setName(event.target.value)} maxLength={300} className="rounded-xl" /></div>
      <div className="grid grid-cols-2 gap-3"><div className="space-y-2"><Label htmlFor={id + '-inn'}>ИНН контрагента</Label><Input id={id + '-inn'} value={inn} onChange={event => setInn(event.target.value)} maxLength={12} className="rounded-xl" /></div><div className="space-y-2"><Label htmlFor={id + '-number'}>Номер документа, если указан</Label><Input id={id + '-number'} value={number} onChange={event => setNumber(event.target.value)} maxLength={120} className="rounded-xl" /></div></div>
      <div className="space-y-2"><Label htmlFor={id + '-date'}>Дата документа, если указана</Label><Input id={id + '-date'} type="date" value={date} onChange={event => setDate(event.target.value)} className="rounded-xl" /></div>
      <div className="space-y-2"><Label htmlFor={id + '-notes'}>Примечание</Label><Textarea id={id + '-notes'} value={notes} onChange={event => setNotes(event.target.value)} maxLength={4000} className="rounded-xl" /></div>
    </fieldset>
    {error && <p role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error}</p>}
    <RegistryPendingNotice model={model} onResult={onSaved} onCancel={onCancel} />
    <div className="flex justify-end gap-2"><Button variant="outline" onClick={onCancel} disabled={model.saving || model.pending}>Отмена</Button><Button onClick={save} disabled={disabled || !source || !model.capabilities?.can_capture_incoming}>Сохранить во входящих без регистрации</Button></div>
  </div>;
}
