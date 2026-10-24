import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { SigmaSpinner } from '@/components/ui/SigmaSpinner';
import { IssuanceSourcePicker } from '../education-issuance/SourcePicker';
import { FrdoSupplementForm } from './SupplementForm';
import { frdoRowLabel } from './OperationForms';
import { readEducationIssuance } from '@/lib/educationIssuance/client';
import type { IssuanceRecord } from '@/lib/educationIssuance/types';
import { officialTemplateRef } from '@/lib/frdoFoundation/dictionaries';
import { issuerReviewIntentSchema, unconfirmedIssuerReview, type IssuerReviewIntent } from '@/lib/frdoPackets/issuerReview';
import { readFrdoPackets, requireFrdoScope, normalizeFrdoError, type FrdoScope, type FrdoPacket, type FrdoAction, type FrdoRead, type FrdoWire } from '@/lib/frdoPackets/client';
import type { sourceRefSchema } from '@/lib/frdoFoundation/contract';
import type { z } from 'zod';

type Receipt = Extract<FrdoRead, { kind: 'receipt' }>['receipt'];
type Preview = Extract<FrdoRead, { kind: 'preview' }>;
type Source = FrdoWire<z.infer<typeof sourceRefSchema>>;
type Regime = 'unconfirmed' | 'ordinary_rf' | 'joint_rf_foreign';

export function FrdoCorrectionForm({ scope, packet, receipt, onAction, onClose, disabled = false }: {
  scope: FrdoScope; packet: FrdoPacket; receipt: Receipt;
  onAction: (action: FrdoAction) => Promise<unknown>; onClose: () => void; disabled?: boolean;
}) {
  const [records, setRecords] = useState<IssuanceRecord[]>([]), [after, setAfter] = useState<string | null>(null);
  const [choices, setChoices] = useState<Record<string, string>>({}), [reason, setReason] = useState('');
  const [regime, setRegime] = useState<Regime>('unconfirmed'), [source, setSource] = useState<Source | null>(null), [note, setNote] = useState('');
  const [preview, setPreview] = useState<Preview | null>(null), [editing, setEditing] = useState<IssuanceRecord | null>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null);
  const epoch = useRef(0), flight = useRef(false);
  const key = JSON.stringify([scope.actorId, scope.accessRevision, scope.organizationId, scope.issuanceScope, packet.ref, receipt.event_id]);
  const load = async (append = false) => {
    if (flight.current) return;
    flight.current = true; const run = ++epoch.current; setBusy(true); setError(null);
    try {
      const result = await readEducationIssuance(scope, { kind: 'records', course_id: null, after_id: append ? after : null, limit: 50, filter: 'all' });
      requireFrdoScope(scope); if (result.kind !== 'records') throw Error();
      if (run === epoch.current) { setRecords(old => append ? [...old, ...result.items.filter(r => !old.some(v => v.official.id === r.official.id))] : result.items); setAfter(result.next_after_id); }
    } catch (cause) { if (run === epoch.current) setError(normalizeFrdoError(cause).message); }
    finally { if (run === epoch.current) { flight.current = false; setBusy(false); } }
  };
  useEffect(() => { setRecords([]); setAfter(null); setChoices({}); setReason(''); setPreview(null); setEditing(null); setRegime('unconfirmed'); setSource(null); setNote(''); flight.current = false; void load(); return () => { ++epoch.current; flight.current = false; }; }, [key]);
  let current = false; try { requireFrdoScope(scope); current = true; } catch { /* Context epoch hides retained drafts. */ }
  const locked = disabled || busy || !current || !packet.capabilities.can_create_correction;
  const rejected = packet.capture.mapped_batch.rows.filter(row => receipt.outcomes.some(o => o.row_key === row.row_key && o.outcome === 'rejected'));
  const candidates = (row: typeof rejected[number]) => records.filter(r => r.provenance === 'controlled_issuance' && !!r.frdo_facts && r.lifecycle !== 'annulled' && r.official.user_id === row.record.user_id && r.official.enrollment_id === row.record.enrollment_id && r.official.course_id === row.record.course_id && r.official.group_id === row.record.group_id && (packet.stream === 'po' ? r.official.document_type === 'qualification' : r.official.document_type !== 'qualification'));
  const prepare = async () => {
    if (locked || flight.current) return;
    const replacements = rejected.flatMap(row => choices[row.row_key] ? [{ parent_row_key: row.row_key, record_id: choices[row.row_key] }] : []);
    if (!replacements.length || !reason.trim() || replacements.some(r => !candidates(rejected.find(row => row.row_key === r.parent_row_key)!).some(v => v.official.id === r.record_id))) { setError('Выберите отклонённые строки, доступные выдачи и укажите причину исправления.'); return; }
    let issuer: FrdoWire<IssuerReviewIntent>;
    try { issuer = issuerReviewIntentSchema.parse(regime === 'unconfirmed' ? unconfirmedIssuerReview : { regime, evidence: source, review_note: note.trim() }) as FrdoWire<IssuerReviewIntent>; }
    catch { setError('Укажите документ-основание и проверку режима учреждения.'); return; }
    flight.current = true; const run = ++epoch.current; setBusy(true); setError(null); setPreview(null);
    try {
      const result = await readFrdoPackets(scope, { kind: 'correction_preview', plan: { parent_job: packet.ref, receipt_event_id: receipt.event_id, replacements, reason: reason.trim() }, template: officialTemplateRef(packet.stream), issuer_review: issuer });
      requireFrdoScope(scope); if (result.kind !== 'preview') throw Error(); if (run === epoch.current) setPreview(result);
    } catch (cause) { if (run === epoch.current) setError(normalizeFrdoError(cause).message); }
    finally { if (run === epoch.current) { flight.current = false; setBusy(false); } }
  };
  const create = async () => {
    if (locked || flight.current || !preview?.preview.ready || !preview.preview.correction) return;
    if (Date.parse(preview.preview.expires_at) <= Date.now()) { setPreview(null); setError('Предпросмотр устарел. Повторите проверку.'); return; }
    flight.current = true; const run = epoch.current; setBusy(true); setError(null);
    try { await onAction({ kind: 'create_correction', plan: preview.preview.correction, template: preview.preview.selection.template, expected_preview_hash: preview.preview.preview_hash, issuer_review: preview.issuer_review }); requireFrdoScope(scope); if (run === epoch.current) onClose(); }
    catch (cause) { if (run === epoch.current) setError(normalizeFrdoError(cause).message); }
    finally { if (run === epoch.current) { flight.current = false; setBusy(false); } }
  };
  if (!current) return null;
  if (editing) return <FrdoSupplementForm scope={scope} record={editing} stream={packet.stream} onSave={onAction} disabled={disabled} onClose={() => { setEditing(null); setPreview(null); }} />;
  return <section className="space-y-4">
    <div><h3 className="font-semibold">Отдельный пакет исправлений</h3><p className="text-sm text-muted-foreground">Выберите только отклонённые строки этой квитанции. Принятые строки, исходный файл и история сохранятся. Исправление не изменяет внешние записи ФИС автоматически.</p></div>
    {rejected.map(row => { const selected = choices[row.row_key] !== undefined, available = candidates(row), value = records.find(r => r.official.id === choices[row.row_key]); return <div key={row.row_key} className="rounded-xl border p-3 space-y-3">
      <Label className="flex gap-2 items-center"><Checkbox checked={selected} disabled={locked} onCheckedChange={checked => { setChoices(old => { const next = { ...old }; if (checked === true) next[row.row_key] = available.some(r => r.official.id === row.record.record_id) ? row.record.record_id : ''; else delete next[row.row_key]; return next; }); setPreview(null); }} />{frdoRowLabel(packet, row)}</Label>
      {selected && <><Select value={choices[row.row_key]} disabled={locked} onValueChange={id => { setChoices(old => ({ ...old, [row.row_key]: id })); setPreview(null); }}><SelectTrigger aria-label="Выдача для исправления строки"><SelectValue placeholder="Выберите доступную выдачу того же ученика и обучения" /></SelectTrigger><SelectContent>{available.map(r => <SelectItem key={r.official.id} value={r.official.id}>{r.official.document_number} · {r.official.issue_date}</SelectItem>)}</SelectContent></Select><Button type="button" size="sm" variant="outline" disabled={locked || !value} onClick={() => value && setEditing(value)}>Проверить дополнительные сведения</Button>{!available.length && <p className="text-xs text-muted-foreground">Выдача ещё не загружена или недоступна. Загрузите следующую страницу. Новая выдача оформляется отдельно в журнале.</p>}</>}
    </div>; })}
    {after && <Button type="button" variant="outline" disabled={locked} onClick={() => void load(true)}>Ещё выданные документы</Button>}{busy && <SigmaSpinner size="sm" />}
    <Label htmlFor="frdo-correction-reason">Причина нового пакета</Label><Textarea id="frdo-correction-reason" maxLength={4000} value={reason} disabled={locked} onChange={e => { setReason(e.target.value); setPreview(null); }} />
    <div className="rounded-xl border p-4 space-y-3"><Label>Режим учреждения для нового пакета</Label><Select value={regime} disabled={locked} onValueChange={v => { setRegime(v as Regime); setPreview(null); }}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="unconfirmed">Режим пока не подтверждён</SelectItem><SelectItem value="ordinary_rf">Обычное российское учреждение</SelectItem><SelectItem value="joint_rf_foreign">Совместное российско-иностранное учреждение</SelectItem></SelectContent></Select>{regime !== 'unconfirmed' && <><IssuanceSourcePicker scope={scope} value={source} onChange={v => { setSource(v); setPreview(null); }} disabled={locked} label="Документ о режиме учреждения" /><Label htmlFor="frdo-correction-review">Что проверил ответственный сотрудник</Label><Textarea id="frdo-correction-review" maxLength={2000} value={note} disabled={locked} onChange={e => { setNote(e.target.value); setPreview(null); }} /></>}<p className="text-xs text-muted-foreground">Проверка режима записывается отдельно для нового пакета. Совместный режим пока не поддерживает формирование.</p></div>
    {preview && <div className="rounded-xl border p-4 space-y-2"><h4 className="font-medium">{preview.preview.ready ? 'Исправления прошли проверку' : 'Исправьте замечания'}</h4>{preview.preview.deadlines.map(row => <p key={row.row_key} className="text-xs text-muted-foreground">{row.deadline.message}</p>)}{preview.preview.rows.map(row => <div key={row.row_key} className="text-sm"><p>{frdoRowLabel(packet, row)}</p>{row.issues.map((issue, index) => <p key={index} className={issue.severity === 'blocker' ? 'text-destructive' : 'text-muted-foreground'}>{issue.message}</p>)}</div>)}</div>}
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    <div className="flex justify-end gap-2"><Button type="button" variant="outline" disabled={busy} onClick={onClose}>Закрыть</Button><Button type="button" variant="outline" disabled={locked || !Object.keys(choices).length} onClick={() => void prepare()}>Проверить исправления</Button><Button type="button" disabled={locked || !preview?.preview.ready || Date.parse(preview.preview.expires_at) <= Date.now()} onClick={() => void create()}>Сохранить новый пакет</Button></div>
  </section>;
}
