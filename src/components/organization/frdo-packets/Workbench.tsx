import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { SigmaSpinner } from '@/components/ui/SigmaSpinner';
import { useFrdoPackets } from '@/hooks/useFrdoPackets';
import { FrdoPacketBuilder } from './PacketBuilder';
import { FrdoPacketDetail } from './PacketDetail';
import { FrdoOperatorsPanel } from './OperatorsPanel';
import { packetStateLabels, sourceCurrencyLabels, formatFrdoTime } from '@/lib/frdoPackets/presentation';
import type { FrdoAction } from '@/lib/frdoPackets/client';

type View = 'packets' | 'new' | 'operators' | 'packet';
export function FrdoPacketWorkbench({ organizationId, groupId, onBlockingChange }: { organizationId: string; groupId?: string | null; onBlockingChange?: (blocking: boolean) => void }) {
  const flow = useFrdoPackets(organizationId, groupId), [view, setView] = useState<View>('packets'), [selected, setSelected] = useState<string | null>(null), [setAside, setSetAside] = useState(false);
  const key = JSON.stringify([organizationId, groupId ?? null, flow.scope?.actorId, flow.scope?.accessRevision, flow.scope?.issuanceScope]);
  useEffect(() => { setView('packets'); setSelected(null); setSetAside(false); }, [key]);
  const open = (id: string) => { setSelected(id); setView('packet'); void flow.openPacket(id); };
  const action = async (value: FrdoAction) => {
    const result = await flow.run(value);
    if (value.kind === 'freeze_preview' || value.kind === 'create_correction') {
      const next = value.kind === 'create_correction' ? result.packets.find(p => p.parent_correction?.parent_job.id === value.plan.parent_job.id) : result.packets[0];
      if (next) { setSelected(next.ref.id); setView('packet'); }
    }
    await flow.refresh(false); return result;
  };
  const retry = async () => { try { const result = await flow.run(); const next = result.packets[result.packets.length - 1]; if (next) { setSelected(next.ref.id); setView('packet'); } await flow.refresh(false); } catch { /* The hook retains the exact request and displays a closed error. */ } };
  const locked = flow.busy || !!flow.pending;
  useEffect(() => { onBlockingChange?.(locked); return () => onBlockingChange?.(false); }, [locked, onBlockingChange]);
  if (!flow.current || !flow.scope) return <div className="py-8 text-center space-y-3">{flow.busy ? <SigmaSpinner className="mx-auto" /> : <p role={flow.error ? 'alert' : undefined} className="text-sm text-muted-foreground">{flow.error ?? 'Проверяем текущий доступ к пакетам…'}</p>}</div>;
  return <div className="space-y-5">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-lg font-semibold">Пакеты ФИС ФРДО</h2><p className="text-sm text-muted-foreground">Выданные документы → проверенные сведения → точный файл → внешняя квитанция.</p></div><div className="flex flex-wrap gap-2"><Button type="button" variant={view === 'packets' ? 'default' : 'outline'} disabled={flow.busy} onClick={() => setView('packets')}>Пакеты</Button><Button type="button" variant={view === 'new' ? 'default' : 'outline'} disabled={locked} onClick={() => setView('new')}>Новый пакет</Button><Button type="button" variant={view === 'operators' ? 'default' : 'outline'} disabled={locked || flow.scope.issuanceScope.kind === 'group'} onClick={() => setView('operators')}>Операторы</Button></div></div>
    {flow.scope.issuanceScope.kind === 'group' && <p className="text-xs text-muted-foreground">Назначения операторов настраиваются в разделе ФРДО всей организации. Для события в группе доступны только собственные действующие назначения сотрудника.</p>}
    <div className="rounded-xl border bg-muted/20 p-3 text-sm text-muted-foreground">СИНТАГМА формирует файл по официальному шаблону и хранит историю. Загрузку во внешнюю ФИС выполняет уполномоченный оператор; её факт и результаты квитанции вносятся отдельно.</div>
    {flow.pending && <div role="status" className="rounded-xl border border-amber-300 bg-amber-50 p-4 space-y-3"><p className="font-medium text-sm">Результат последнего запроса ещё не подтверждён</p><p className="text-sm text-muted-foreground">Повтор восстанавливает ту же операцию с тем же номером запроса. Перед новым действием проверьте результат или явно отложите этот локальный запрос. Серверная история при этом сохраняется.</p><div className="flex flex-wrap gap-2"><Button type="button" disabled={flow.busy} onClick={() => void retry()}>Проверить и повторить тот же запрос</Button><Button type="button" variant="outline" disabled={flow.busy} onClick={() => setSetAside(true)}>Отложить локальный запрос</Button></div>{setAside && <div className="rounded-lg border p-3 space-y-2"><p className="text-sm">Операция могла уже сохраниться на сервере. После откладывания обновите пакет и проверьте историю перед новым действием.</p><div className="flex gap-2"><Button type="button" variant="outline" onClick={() => setSetAside(false)}>Вернуться</Button><Button type="button" onClick={() => { flow.setAsidePending(); setSetAside(false); void flow.refresh(false); }}>Отложить и проверить пакеты</Button></div></div>}</div>}
    {flow.error && <p role="alert" className="text-sm text-destructive">{flow.error}</p>}
    {view === 'packets' && <section className="space-y-3"><div className="flex justify-end"><Button type="button" variant="outline" disabled={flow.busy} onClick={() => void flow.refresh(false)}>Обновить пакеты</Button></div>{flow.packets.map(packet => <button key={packet.ref.id} type="button" disabled={flow.busy} onClick={() => open(packet.ref.id)} className="w-full text-left rounded-xl border bg-card p-4 hover:bg-accent/40 transition-colors disabled:opacity-60"><div className="flex flex-wrap justify-between gap-2"><p className="font-medium">{packet.stream.toUpperCase()} · {formatFrdoTime(packet.created_at)} · {packet.row_count} строк</p><Badge variant="outline">{packetStateLabels[packet.state]}</Badge></div><p className="text-sm text-muted-foreground mt-2">{sourceCurrencyLabels[packet.source_currency]}</p></button>)}{!flow.busy && !flow.packets.length && <p className="text-sm text-muted-foreground py-6 text-center">На этой странице доступных пакетов нет. Новый пакет создаётся из уже выданных документов.</p>}{flow.after && <Button type="button" variant="outline" disabled={flow.busy} onClick={() => void flow.refresh(true)}>Продолжить просмотр пакетов</Button>}</section>}
    {view === 'new' && <FrdoPacketBuilder key={key} scope={flow.scope} onAction={action} onCreated={() => setView('packet')} disabled={locked} />}
    {view === 'operators' && <FrdoOperatorsPanel key={key} scope={flow.scope} onAction={action} disabled={locked} />}
    {view === 'packet' && <section className="space-y-3"><Button type="button" variant="ghost" disabled={flow.busy} onClick={() => setView('packets')}>← К списку пакетов</Button>{flow.packet && flow.packet.ref.id === selected ? <FrdoPacketDetail key={flow.packet.ref.id} scope={flow.scope} packet={flow.packet} onAction={action} onOpen={open} disabled={locked} /> : !flow.busy && <p className="text-sm text-muted-foreground">Пакет не загружен. Обновите список и откройте его снова.</p>}</section>}
    {flow.busy && <SigmaSpinner size="sm" />}
  </div>;
}

/** Closing the dialog unmounts request state. The server remains the source of
 * packet/event history; reopening starts an authorized current read. */
export function FrdoPacketWorkbenchDialog({ open, onOpenChange, organizationId, groupId }: { open: boolean; onOpenChange: (open: boolean) => void; organizationId: string; groupId?: string | null }) {
  const [blocking, setBlocking] = useState(false), [closeBlocked, setCloseBlocked] = useState(false);
  return <Dialog open={open} onOpenChange={value => { if (!value && blocking) { setCloseBlocked(true); return; } setCloseBlocked(false); onOpenChange(value); }}><DialogContent className="max-w-6xl max-h-[92vh] overflow-y-auto"><DialogHeader><DialogTitle>Пакеты ФИС ФРДО</DialogTitle><DialogDescription>Подготовка файлов и учёт внешних результатов с сохранением исходных документов.</DialogDescription></DialogHeader>{closeBlocked && <p role="status" className="text-sm text-amber-700">Завершите проверку результата или явно отложите локальный запрос перед закрытием.</p>}{open && <FrdoPacketWorkbench onBlockingChange={setBlocking} key={organizationId + ':' + (groupId ?? '')} organizationId={organizationId} groupId={groupId} />}</DialogContent></Dialog>;
}
