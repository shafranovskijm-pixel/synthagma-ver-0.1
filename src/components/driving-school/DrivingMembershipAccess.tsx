import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import type { DrivingMemberRole, DrivingMembershipAccess, DrivingMembershipAccessPort } from '@/lib/driving-school/membership-access';

type Props = {
  port: DrivingMembershipAccessPort;
  role: DrivingMemberRole;
  targetId: string;
  name: string;
  enabled: boolean;
  onRevoke: (access: DrivingMembershipAccess, reason: string, requestId: string) => Promise<void>;
};

/** Only an explicit owner click reads access. No load-time writes or preview grants. */
export function DrivingMembershipAccessButton({ port, role, targetId, name, enabled, onRevoke }: Props) {
  const scope = useRef({ port, role, targetId, enabled, generation: 0 });
  if (scope.current.port !== port || scope.current.role !== role || scope.current.targetId !== targetId
      || scope.current.enabled !== enabled)
    scope.current = { port, role, targetId, enabled, generation: scope.current.generation + 1 };
  const generation = scope.current.generation;
  const mounted = useRef(true), running = useRef<{ generation: number } | null>(null), readVersion = useRef(0);
  const operation = useRef<{ key: string; requestId: string } | null>(null);
  const [openedFor, setOpenedFor] = useState<number | null>(null), [busyFor, setBusyFor] = useState<number | null>(null);
  const [failure, setFailure] = useState<{ generation: number; message: string } | null>(null);
  const [reason, setReason] = useState('');
  const [result, setResult] = useState<{ generation: number; access: DrivingMembershipAccess } | null>(null);
  const current = () => mounted.current && scope.current.generation === generation && scope.current.port === port;
  const busy = busyFor === generation;
  const error = failure?.generation === generation ? failure.message : '';
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; readVersion.current++; }; }, []);
  // Hide previous actor/school/resource results synchronously, including A→B→A.
  const access = enabled && result?.generation === generation ? result.access : null;

  const read = async () => {
    if (!current() || !enabled || running.current?.generation === generation) return;
    const work = { generation }; running.current = work;
    setBusyFor(generation); setFailure(null); setResult(null);
    const request = ++readVersion.current;
    try {
      const next = await port.read(role, targetId);
      if (current() && request === readVersion.current) setResult({ generation, access: next });
    } catch (failure) {
      if (current() && request === readVersion.current)
        setFailure({ generation, message: failure instanceof Error ? failure.message : 'Доступ участника не подтверждён.' });
    } finally {
      if (running.current === work) running.current = null;
      if (current() && request === readVersion.current) setBusyFor(null);
    }
  };
  const revoke = async () => {
    if (!current() || !enabled || running.current?.generation === generation || access?.state !== 'linked' || !access.membership
        || !reason.trim() || reason.trim().length > 2000) return;
    const key = JSON.stringify([generation, access.actorId, access.membership.id, access.membership.updatedAt, reason.trim()]);
    if (operation.current?.key !== key) operation.current = { key, requestId: crypto.randomUUID() };
    const requestId = operation.current.requestId;
    const work = { generation }; running.current = work;
    setBusyFor(generation); setFailure(null);
    try {
      await onRevoke(access, reason.trim(), requestId);
      if (current()) { setOpenedFor(null); setReason(''); setResult(null); operation.current = null; }
    } catch (failure) {
      // Retain the exact operation id for a same-payload retry after a lost response.
      if (current()) setFailure({ generation, message: failure instanceof Error ? failure.message : 'Отзыв доступа не подтверждён.' });
    } finally {
      if (running.current === work) running.current = null;
      if (current()) setBusyFor(null);
    }
  };
  return <>
    <Button variant="outline" size="sm" disabled={!enabled || busy} onClick={() => {
      if (!current() || !enabled) return;
      setOpenedFor(generation); setReason(''); operation.current = null; void read();
    }}>Доступ в кабинет</Button>
    <Dialog open={openedFor === generation && enabled} onOpenChange={value => { if (!busy) setOpenedFor(value ? generation : null); }}>
      <DialogContent className="driving-dialog">
        <DialogHeader>
          <DialogTitle>Доступ в автошколу</DialogTitle>
          <DialogDescription>{name}</DialogDescription>
        </DialogHeader>
        {busy && !access && <p>Проверяем текущую привязку…</p>}
        {error && <p role="alert" className="error">{error}</p>}
        {!access && !busy && <Button variant="outline" onClick={() => void read()}>Проверить доступ</Button>}
        {access?.state === 'unlinked' && <p>Аккаунт ещё не связан с этой записью.</p>}
        {access?.state === 'protected' && <p>Управленческий доступ изменяется в общем кабинете организации.</p>}
        {access?.state === 'revoked' && <p>Вход в автошколу для этой записи отозван. Повторное приглашение не восстанавливает отозванный вход.</p>}
        {access?.state === 'linked' && <>
          <p>Вход в автошколу разрешён. Отзыв закроет его для этой записи ученика или инструктора. Обычный кабинет СИНТАГМЫ и история обучения сохранятся.</p>
          <label>Причина отзыва<Input value={reason} maxLength={2000} disabled={busy} onChange={event => {
            setReason(event.target.value); operation.current = null;
          }} /></label>
          <Button variant="destructive" disabled={busy || !reason.trim()} onClick={() => void revoke()}>
            {busy ? 'Отзываем…' : 'Отозвать доступ в автошколу'}
          </Button>
        </>}
        <Button variant="outline" disabled={busy} onClick={() => setOpenedFor(null)}>Закрыть</Button>
      </DialogContent>
    </Dialog>
  </>;
}
