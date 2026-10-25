import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { SigmaSpinner } from '@/components/ui/SigmaSpinner';
import { FrdoUploadFactForm, FrdoReceiptForm, frdoRowLabel, type UploadEvent } from './OperationForms';
import { FrdoCorrectionForm } from './CorrectionForm';
import { downloadFrdoArtifact, downloadFrdoBuild } from '@/lib/frdoPackets/files';
import { prepareFrdoRegistryAction } from '@/lib/frdoPackets/registry';
import { packetStateLabels, sourceCurrencyLabels, eventLabels, formatFrdoTime } from '@/lib/frdoPackets/presentation';
import { readFrdoPackets, requireFrdoScope, normalizeFrdoError, type FrdoScope, type FrdoPacket, type FrdoAction, type FrdoRead, type FrdoSummary, type FrdoFileRequestedEvent } from '@/lib/frdoPackets/client';

type History = Extract<FrdoRead, { kind: 'history' }>;
type Artifact = Extract<FrdoRead, { kind: 'artifacts' }>['artifacts'][number];
type Receipt = Extract<FrdoRead, { kind: 'receipt' }>['receipt'];
type Panel = 'upload' | 'receipt' | 'correction' | 'handover' | 'register' | 'abandon' | null;

export function FrdoPacketDetail({ scope, packet, onAction, onResume, onOpen, disabled = false }: {
  scope: FrdoScope; packet: FrdoPacket; onAction: (action: FrdoAction) => Promise<unknown>; onResume?: (event: FrdoFileRequestedEvent) => Promise<unknown>; onOpen: (id: string) => void; disabled?: boolean;
}) {
  const [history, setHistory] = useState<History['events']>([]), [ceiling, setCeiling] = useState<number | null>(null), [before, setBefore] = useState<number | null>(null);
  const [artifacts, setArtifacts] = useState<Artifact[]>([]), [artifactAfter, setArtifactAfter] = useState<string | null>(null);
  const [children, setChildren] = useState<FrdoSummary[]>([]), [childAfter, setChildAfter] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<Receipt | null>(null), [panel, setPanel] = useState<Panel>(null);
  const [note, setNote] = useState(''), [registry, setRegistry] = useState<Awaited<ReturnType<typeof prepareFrdoRegistryAction>> | null>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null);
  const epoch = useRef(0), flight = useRef(false);
  const key = JSON.stringify([scope.actorId, scope.accessRevision, scope.organizationId, scope.issuanceScope, packet.ref]);
  const guard = () => { requireFrdoScope(scope); };
  const load = async (section: 'all' | 'history' | 'artifacts' | 'corrections', append = false) => {
    if (flight.current) return;
    flight.current = true; const run = epoch.current; setBusy(true); setError(null);
    try {
      if (section === 'all' || section === 'history') {
        const value = await readFrdoPackets(scope, { kind: 'history', packet_id: packet.ref.id, ceiling_revision: append ? ceiling : null, before_revision: append ? before : null, limit: 50 });
        guard(); if (value.kind !== 'history') throw Error();
        if (run === epoch.current) { setHistory(old => append ? [...old, ...value.events.filter(e => !old.some(v => v.id === e.id))] : value.events); setCeiling(value.ceiling_revision); setBefore(value.next_before_revision); }
      }
      if (section === 'all' || section === 'artifacts') {
        const value = await readFrdoPackets(scope, { kind: 'artifacts', packet_id: packet.ref.id, after_id: append ? artifactAfter : null, limit: 50 });
        guard(); if (value.kind !== 'artifacts') throw Error();
        if (run === epoch.current) { setArtifacts(old => append ? [...old, ...value.artifacts.filter(a => !old.some(v => v.id === a.id))] : value.artifacts); setArtifactAfter(value.next_after_id); }
      }
      if (section === 'all' || section === 'corrections') {
        const value = await readFrdoPackets(scope, { kind: 'corrections', packet_id: packet.ref.id, after_cursor: append ? childAfter : null, limit: 25 });
        guard(); if (value.kind !== 'corrections') throw Error();
        if (run === epoch.current) { setChildren(old => append ? [...old, ...value.packets.filter(a => !old.some(v => v.ref.id === a.ref.id))] : value.packets); setChildAfter(value.next_cursor); }
      }
      if (section === 'all' && packet.latest_receipt_event_id) {
        const value = await readFrdoPackets(scope, { kind: 'receipt', packet_id: packet.ref.id, receipt_event_id: packet.latest_receipt_event_id });
        guard(); if (value.kind !== 'receipt') throw Error(); if (run === epoch.current) setReceipt(value.receipt);
      }
    } catch (cause) { if (run === epoch.current) setError(normalizeFrdoError(cause).message); }
    finally { if (run === epoch.current) { flight.current = false; setBusy(false); } }
  };
  useEffect(() => { ++epoch.current; flight.current = false; setHistory([]); setBefore(null); setCeiling(null); setArtifacts([]); setArtifactAfter(null); setChildren([]); setChildAfter(null); setReceipt(null); setPanel(null); setNote(''); setRegistry(null); void load('all'); return () => { ++epoch.current; flight.current = false; }; }, [key]);
  let current = false; try { guard(); current = true; } catch { /* Do not display retained PII outside the current scope. */ }
  const locked = disabled || busy || !current;
  const upload = history.find((event): event is UploadEvent => event.kind === 'fis_upload' && event.id === packet.latest_upload_event_id);
  const build = packet.current_build;
  const recoveryEvent = packet.state === 'file_generating' && build && (build.state === 'queued' || build.state === 'generating') && packet.source_currency === 'current' && packet.capabilities.can_preview && build.input_revision + 1 === packet.ref.revision
    ? history.find((event): event is FrdoFileRequestedEvent => event.kind === 'file_requested' && event.build_id === build.id && event.actor_id === scope.actorId && event.revision === packet.ref.revision && event.state_hash === packet.ref.state_hash && event.previous_state_hash !== null) : undefined;

  const runLocal = async (operation: () => Promise<unknown>, close = false) => {
    if (locked || flight.current) return;
    flight.current = true; const run = epoch.current; setBusy(true); setError(null);
    try { await operation(); guard(); if (run === epoch.current && close) { setPanel(null); setNote(''); setRegistry(null); } }
    catch (cause) { if (run === epoch.current) setError(normalizeFrdoError(cause).message); }
    finally { if (run === epoch.current) { flight.current = false; setBusy(false); } }
  };
  const open = (value: Panel) => { setPanel(value); setNote(''); setRegistry(null); setError(null); };
  if (!current) return null;
  if (panel === 'upload') return <FrdoUploadFactForm key={key} scope={scope} packet={packet} onAction={onAction} onClose={() => setPanel(null)} disabled={disabled} />;
  if (panel === 'receipt' && upload) return <FrdoReceiptForm key={key} scope={scope} packet={packet} upload={upload} onAction={onAction} onClose={() => setPanel(null)} disabled={disabled} />;
  if (panel === 'correction' && receipt) return <FrdoCorrectionForm key={key} scope={scope} packet={packet} receipt={receipt} onAction={onAction} onClose={() => setPanel(null)} disabled={disabled} />;
  return <section className="space-y-5">
    <div className="rounded-xl border p-4 space-y-3"><div className="flex flex-wrap justify-between gap-3"><div><h3 className="font-semibold">Пакет {packet.stream.toUpperCase()} · {formatFrdoTime(packet.created_at)}</h3><p className="text-sm text-muted-foreground">{packet.capture.mapped_batch.rows.length} строк · редакция {packet.ref.revision}</p></div><Badge variant="outline">{packetStateLabels[packet.state]}</Badge></div><p className="text-sm text-muted-foreground">{sourceCurrencyLabels[packet.source_currency]}. {packet.issuer_review.regime === 'ordinary_rf' ? 'Для пакета записана проверка обычного российского учреждения.' : 'Режим учреждения не подтверждён для формирования.'}</p><p className="text-xs text-muted-foreground">Сохранённый снимок и файлы не являются подтверждением внешней загрузки. Электронная подпись и внешние полномочия учитываются отдельно.</p>{packet.parent_correction && <Button type="button" size="sm" variant="link" disabled={locked} onClick={() => onOpen(packet.parent_correction!.parent_job.id)}>Открыть исходный пакет и квитанцию</Button>}
    <div className="flex flex-wrap gap-2">{onResume && packet.state === 'file_generating' && <Button type="button" variant="outline" disabled={locked || !recoveryEvent} onClick={() => { if (recoveryEvent) void runLocal(() => onResume(recoveryEvent)); }}>Проверить и продолжить сохранённое формирование</Button>}<Button type="button" disabled={locked || !packet.capabilities.can_generate_file} onClick={() => void runLocal(() => onAction({ kind: 'generate_file', packet: packet.ref, expected_template: packet.capture.source_cas.template }))}>{packet.state === 'file_generation_failed' ? 'Повторить формирование файла' : 'Сформировать официальный XLSX'}</Button><Button type="button" variant="outline" disabled={locked || packet.current_build?.state !== 'sealed' || packet.source_currency !== 'current'} onClick={() => void runLocal(() => downloadFrdoArtifact(scope, packet))}>Скачать текущий файл</Button><Button type="button" variant="outline" disabled={locked || !packet.capabilities.can_register_packet} onClick={() => { open('register'); void runLocal(async () => { const value = await prepareFrdoRegistryAction(packet, scope.organizationId, { assertCurrent: guard }); guard(); setRegistry(value); }); }}>Зарегистрировать в документах</Button><Button type="button" variant="outline" disabled={locked || !packet.capabilities.can_record_admin_handover} onClick={() => open('handover')}>Передать администратору</Button><Button type="button" variant="outline" disabled={locked || !packet.capabilities.can_record_external_upload} onClick={() => open('upload')}>Записать внешнюю загрузку</Button><Button type="button" variant="outline" disabled={locked || !packet.capabilities.can_record_receipt || !upload} onClick={() => open('receipt')}>Внести квитанцию</Button><Button type="button" variant="outline" disabled={locked || !packet.capabilities.can_create_correction || !receipt} onClick={() => open('correction')}>Создать исправление</Button>{packet.capabilities.can_abandon_correction && <Button type="button" variant="outline" disabled={locked} onClick={() => open('abandon')}>Отложить неотправленное исправление</Button>}</div>{packet.capabilities.can_record_receipt && !upload && <p className="text-xs text-muted-foreground">Для внесения квитанции загрузите историю до последнего события внешней загрузки.</p>}{onResume && packet.state === 'file_generating' && <p className="text-sm text-muted-foreground">Продолжение использует тот же запрос и сохранённую попытку. Если файл ещё формируется, сервер попросит подождать. Новая выдача и новый пакет не создаются.</p>}{packet.state === 'file_generation_failed' && <p className="text-sm text-amber-700">Неудачная попытка сохранена. Если исходные сведения изменились, создайте новый снимок; прежний файл не заменяется.</p>}</div>
    {panel && <div className="rounded-xl border p-4 space-y-3"><h4 className="font-medium">{panel === 'register' ? 'Регистрация точного файла в реестре документов' : panel === 'handover' ? 'Внутренняя передача администратору платформы' : 'Отложить неотправленное исправление'}</h4><p className="text-sm text-muted-foreground">{panel === 'register' ? 'В реестр попадёт ссылка на уже сформированный файл этого снимка. Это не означает отправку или принятие ФИС.' : panel === 'handover' ? 'Администратору платформы будет направлено внутреннее сообщение с привязкой к файлу. Внешняя загрузка во ФИС этим действием не выполняется.' : 'История и все файлы сохранятся. Для этих отклонённых строк можно будет создать новое исправление. Уже отправленный пакет отложить нельзя.'}</p>{panel === 'register' ? registry ? <p className="text-sm">{registry.data.title} · {registry.data.document_date}</p> : <SigmaSpinner size="sm" /> : <><Label htmlFor="frdo-detail-note">{panel === 'abandon' ? 'Почему это исправление больше не используется' : 'Что передаётся администратору'}</Label><Textarea id="frdo-detail-note" maxLength={panel === 'abandon' ? 4000 : 2000} value={note} disabled={locked} onChange={e => setNote(e.target.value)} /></>}<div className="flex justify-end gap-2"><Button type="button" variant="outline" disabled={busy} onClick={() => open(null)}>Закрыть</Button><Button type="button" disabled={locked || (panel === 'register' ? !registry : !note.trim())} onClick={() => void runLocal(async () => { if (panel === 'register' && registry) await onAction(registry.action); else if (panel === 'abandon') await onAction({ kind: 'abandon_correction', packet: packet.ref, reason: note.trim() }); else if (panel === 'handover' && packet.current_build?.state === 'sealed') await onAction({ kind: 'record_admin_handover', packet: packet.ref, artifact: packet.current_build.artifact, recipient: 'platform_administrator', note: note.trim() }); }, true)}>{panel === 'register' ? 'Зарегистрировать файл' : panel === 'handover' ? 'Записать внутреннюю передачу' : 'Отложить с сохранением истории'}</Button></div></div>}
    <div className="rounded-xl border p-4 space-y-2"><h4 className="font-medium">Строки сохранённого снимка</h4><div className="max-h-72 overflow-y-auto space-y-2">{packet.capture.mapped_batch.rows.map(row => <p key={row.row_key} className="text-sm">{frdoRowLabel(packet, row)}</p>)}</div></div>
    {receipt && <div className="rounded-xl border p-4 space-y-2"><h4 className="font-medium">Последняя внесённая квитанция</h4><p className="text-sm text-muted-foreground">Загрузка {receipt.submission_id} · получена {formatFrdoTime(receipt.received_at)}. {receipt.receipt_evidence.availability === 'available' ? 'Файл-основание доступен.' : 'Файл-основание сейчас недоступен.'} Содержание перенесено оператором; внешний источник платформой не удостоверен.</p>{receipt.outcomes.map(outcome => { const row = packet.capture.mapped_batch.rows.find(r => r.row_key === outcome.row_key); return <div key={outcome.row_key} className="rounded-lg bg-muted/30 p-2 text-sm"><p>{row ? frdoRowLabel(packet, row) : 'Строка снимка'} · {outcome.outcome === 'accepted' ? 'Принята' : outcome.outcome === 'rejected' ? 'Отклонена' : 'Результат не разобран'}</p>{outcome.outcome !== 'accepted' && <p className="text-muted-foreground">{outcome.message}</p>}</div>; })}</div>}
    <div className="rounded-xl border p-4 space-y-3"><h4 className="font-medium">Попытки формирования и файлы</h4>{artifacts.map(build => <div key={build.id} className="flex flex-wrap items-center justify-between gap-2 text-sm"><span>{formatFrdoTime(build.recorded_at)} · {build.state === 'sealed' ? 'Файл сформирован; повторное чтение проверено' : build.state === 'failed' ? 'Попытка не завершена: ' + build.failure : 'Формирование ожидается'}</span>{build.state === 'sealed' && <Button type="button" variant="outline" size="sm" disabled={locked} onClick={() => void runLocal(() => downloadFrdoBuild(scope, packet, build, 'historical_copy'))}>Историческая копия</Button>}</div>)}{!artifacts.length && !busy && <p className="text-sm text-muted-foreground">Попыток формирования ещё нет.</p>}{artifactAfter && <Button type="button" variant="outline" disabled={locked} onClick={() => void load('artifacts', true)}>Ещё файлы</Button>}</div>
    <div className="rounded-xl border p-4 space-y-3"><h4 className="font-medium">Отдельные исправления</h4>{children.map(child => <Button key={child.ref.id} type="button" variant="outline" disabled={locked} className="h-auto text-left whitespace-normal" onClick={() => onOpen(child.ref.id)}>{formatFrdoTime(child.created_at)} · {packetStateLabels[child.state]} · {child.row_count} строк</Button>)}{!children.length && !busy && <p className="text-sm text-muted-foreground">На этой странице исправлений нет.</p>}{childAfter && <Button type="button" variant="outline" disabled={locked} onClick={() => void load('corrections', true)}>Продолжить просмотр исправлений</Button>}</div>
    <div className="rounded-xl border p-4 space-y-3"><h4 className="font-medium">История событий</h4>{history.map(event => <div key={event.id} className="border-l-2 pl-3 py-1"><p className="text-sm font-medium">{eventLabels[event.kind] ?? 'Событие пакета'}</p><p className="text-xs text-muted-foreground">{formatFrdoTime(event.recorded_at)} · редакция {event.revision}</p>{event.kind === 'admin_handover' && <p className="text-sm text-muted-foreground">{event.note}</p>}{event.kind === 'correction_abandoned' && <p className="text-sm text-muted-foreground">{event.reason}</p>}{event.kind === 'fis_upload' && <p className="text-sm text-muted-foreground">Внешняя загрузка {event.submission_id} · {formatFrdoTime(event.occurred_at)}. Факт записан оператором.</p>}{event.kind === 'file_failed' && <p className="text-sm text-muted-foreground">{event.code}</p>}</div>)}{before !== null && <Button type="button" variant="outline" disabled={locked} onClick={() => void load('history', true)}>Ранее в истории</Button>}</div>
    {busy && <SigmaSpinner size="sm" />}{error && <p role="alert" className="text-sm text-destructive">{error}</p>}
  </section>;
}
