import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { issuanceScopeCurrent, normalizeIssuanceError, prepareEducationIssuanceMutation, readEducationIssuance, type EducationIssuanceScope, type PreparedIssuanceMutation } from '@/lib/educationIssuance/client';
import { useEducationIssuanceScope } from '@/hooks/useEducationIssuance';
import type { IssuanceSource, WithdrawalBasis, WithdrawalPreview } from '@/lib/educationIssuance/types';
import { withdrawalDateBounds } from '@/lib/educationIssuance/withdrawalDate';
import { IssuanceSourcePicker } from './SourcePicker';
import { EnrollmentGroupScopePicker } from './EnrollmentGroupScopePicker';

export interface WithdrawalDialogProps {
  open: boolean; onOpenChange: (open: boolean) => void; organizationId: string; groupId?: string | null;
  enrollmentIds: string[]; onWithdrawn: () => void; labels?: string[];
}
export function WithdrawalDialog(props: WithdrawalDialogProps) {
  const selectionKey = [...props.enrollmentIds].sort().join(',');
  const contextKey = JSON.stringify([props.open,props.organizationId,props.groupId,selectionKey]);
  const [groupChoice,setGroupChoice] = useState<{key:string;id:string|null}|null>(null);
  const effectiveGroupId=props.groupId??(groupChoice?.key===contextKey?groupChoice.id:null);
  const capture = useEducationIssuanceScope(props.organizationId, effectiveGroupId,contextKey);
  const [scope, setScope] = useState<EducationIssuanceScope | null>(null), [source, setSource] = useState<IssuanceSource | null>(null);
  const [kind, setKind] = useState<WithdrawalBasis['kind']>('learner_request'), [provision, setProvision] = useState(''), [reason, setReason] = useState(''), [effectiveDate, setEffectiveDate] = useState(()=>withdrawalDateBounds().suggestedDate);
  const [preview, setPreview] = useState<WithdrawalPreview | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null);
  const operation = useRef<PreparedIssuanceMutation | null>(null), flight = useRef(false), epoch = useRef(0);
  useEffect(() => {
    ++epoch.current; operation.current = null; flight.current = false; setBusy(false); setPreview(null); setError(null); setSource(null); setProvision(''); setReason(''); setEffectiveDate(withdrawalDateBounds().suggestedDate);
    if (!props.open) { setScope(null); return; }
    try { setScope(capture()); } catch (error) { setScope(null); setError(normalizeIssuanceError(error).message); }
  }, [props.open, props.organizationId, props.groupId, selectionKey, capture]);
  const current = !!scope && issuanceScopeCurrent(scope);
  const invalidate = () => { if (!operation.current) setPreview(null); };
  const prepare = async () => {
    if (!scope || !current || flight.current || !source) return;
    flight.current = true; setBusy(true); setError(null); const run = epoch.current;
    try {
      const result = await readEducationIssuance(scope, { kind: 'withdrawal_preview', intent: { enrollment_ids: [...new Set(props.enrollmentIds)], effective_date: effectiveDate, basis: { kind, source, provision: provision.trim(), reason: reason.trim() } } });
      if (run !== epoch.current || !issuanceScopeCurrent(scope)) return;
      if (result.kind === 'withdrawal_preview') setPreview(result.preview);
    } catch (error) { if (run === epoch.current && issuanceScopeCurrent(scope)) setError(normalizeIssuanceError(error).message); }
    finally { if (run === epoch.current) { flight.current = false; setBusy(false); } }
  };
  const confirm = async () => {
    if (!scope || !current || flight.current || !preview?.ready) return;
    flight.current = true; setBusy(true); setError(null); const run = epoch.current;
    try {
      operation.current ??= prepareEducationIssuanceMutation(scope, { action: 'withdraw_enrollments', intent: preview.intent, preview_hash: preview.preview_hash, items: preview.items.map(row => row.ref), reason: preview.intent.basis.reason });
      await operation.current.run();
      if (run !== epoch.current || !issuanceScopeCurrent(scope)) return;
      operation.current = null; toast.success('Обучение прекращено. Зачисления и прежние результаты сохранены.'); props.onWithdrawn(); props.onOpenChange(false);
    } catch (error) { if (run === epoch.current && issuanceScopeCurrent(scope)) { const failure = normalizeIssuanceError(error); setError(failure.message); if (failure.code !== 'DEPENDENCY_UNAVAILABLE') { operation.current = null; setPreview(null); } } }
    finally { if (run === epoch.current) { flight.current = false; setBusy(false); } }
  };
  const locked = busy || !!operation.current;
  const dateBounds=withdrawalDateBounds();
  return <Dialog open={props.open} onOpenChange={open => { if (!locked) props.onOpenChange(open); }}>
    <DialogContent className="rounded-2xl max-w-2xl max-h-[90vh] overflow-y-auto">
      <DialogHeader><DialogTitle>Прекратить обучение</DialogTitle><DialogDescription>Выбрано зачислений: {props.enrollmentIds.length}. Доступ к продолжению обучения прекращается после подтверждения. Прежние результаты, документы и начисления сохраняются; приказ автоматически не оформляется.</DialogDescription></DialogHeader>
      {props.labels?.length ? <div className="rounded-xl border p-3 text-sm space-y-1">{props.labels.map((label, index) => <p key={index}>{label}</p>)}</div> : null}
      {!props.groupId&&<EnrollmentGroupScopePicker organizationId={props.organizationId} enrollmentIds={props.enrollmentIds} value={effectiveGroupId} disabled={locked} onChange={id=>setGroupChoice({key:contextKey,id})}/>}
      <fieldset disabled={!current || locked} className="space-y-4">
        <div className="space-y-2"><Label>Дата вступления отчисления в силу</Label><Input aria-label="Дата вступления отчисления в силу" type="date" max={dateBounds.maximumDate} value={effectiveDate} onChange={e => { setEffectiveDate(e.target.value); invalidate(); }} /><p className="text-xs text-muted-foreground">Дата вводится явно и проверяется сервером. Максимальная дата в форме: {dateBounds.maximumDate} (текущий день UTC).{dateBounds.localDate!==dateBounds.maximumDate?" Локальная дата на вашем устройстве: "+dateBounds.localDate+"; начальное значение ограничено допустимым днём.":""}</p></div>
        <div className="space-y-2"><Label>Основание</Label><Select value={kind} onValueChange={value => { setKind(value as WithdrawalBasis['kind']); invalidate(); }}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="learner_request">Заявление ученика</SelectItem><SelectItem value="organization_decision">Решение организации</SelectItem><SelectItem value="contract_termination">Прекращение договора</SelectItem><SelectItem value="other_reviewed">Другое проверенное основание</SelectItem></SelectContent></Select></div>
        <IssuanceSourcePicker scope={scope} value={source} onChange={value => { setSource(value); invalidate(); }} disabled={locked} />
        <div className="space-y-2"><Label>Пункт или реквизиты основания</Label><Input aria-label="Пункт или реквизиты основания" value={provision} maxLength={1000} onChange={e => { setProvision(e.target.value); invalidate(); }} /></div>
        <div className="space-y-2"><Label>Причина решения</Label><Textarea aria-label="Причина решения" value={reason} maxLength={2000} onChange={e => { setReason(e.target.value); invalidate(); }} /></div>
      </fieldset>
      {current && preview && <div className="rounded-xl border p-3 space-y-2"><p className="font-medium">{preview.ready ? 'Сервер подтвердил возможность прекращения обучения' : 'Прекращение обучения пока недоступно'}</p>{preview.items.map(row => <p key={row.ref.enrollment_id} className="text-sm">{row.state === 'withdrawn' ? 'Уже прекращено' : 'Сохраняется'}: {row.technical_status}, {row.technical_progress}% · время {row.technical_time_spent} сек.{row.can_withdraw ? '' : ' · действие недоступно'}</p>)}</div>}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {!current && <p role="alert" className="text-sm text-destructive">Текущий доступ изменился. Откройте диалог заново.</p>}
      <DialogFooter><Button variant="outline" disabled={locked} onClick={() => props.onOpenChange(false)}>Закрыть</Button>{!preview ? <Button disabled={!current || busy || !source || !provision.trim() || !reason.trim() || !effectiveDate} onClick={() => void prepare()}>{busy ? 'Проверка...' : 'Проверить на сервере'}</Button> : <><Button variant="outline" disabled={locked} onClick={() => setPreview(null)}>Изменить решение</Button><Button variant="destructive" disabled={!current || busy || !preview.ready} onClick={() => void confirm()}>{busy ? 'Сохранение...' : operation.current ? 'Повторить тот же запрос' : 'Подтвердить прекращение'}</Button></>}</DialogFooter>
    </DialogContent>
  </Dialog>;
}
