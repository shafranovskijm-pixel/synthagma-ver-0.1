import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { clearDeletedAccountSession } from "@/components/account/clearDeletedAccountSession";
import { getDeletionStatus, resumeAccountDeletion, type DeletionStatus } from "@/components/account/accountDeletion";
import { clearPendingDeletion, loadPendingDeletion } from "@/components/account/pendingDeletion";

export default function AccountDeletionStatus() {
  const [pending] = useState(loadPendingDeletion);
  const [status, setStatus] = useState<DeletionStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const mounted = useRef(true);
  const inFlight = useRef(false);
  async function check(resume = false) {
    if (!pending || inFlight.current) return;
    inFlight.current = true; setBusy(true); setError("");
    try {
      const result = await (resume ? resumeAccountDeletion(pending) : getDeletionStatus(pending));
      if (result.status === "deleted") {
        void clearDeletedAccountSession(pending.accountId, result.requestId, queryClient);
        if (mounted.current) navigate("/account/deletion-complete", { replace: true, state: { deletionReceipt: result } });
      } else if (mounted.current) setStatus(result);
    } catch { if (mounted.current) setError("Сейчас не удалось проверить статус. Повторная проверка не отправляет запрос на удаление."); }
    finally { inFlight.current = false; if (mounted.current) setBusy(false); }
  }
  useEffect(() => { mounted.current = true; void check(); return () => { mounted.current = false; }; }, []);
  return <main className="min-h-screen bg-background px-4 py-12"><Card className="mx-auto max-w-xl"><CardHeader><CardTitle>Проверка удаления аккаунта</CardTitle></CardHeader><CardContent className="space-y-4">
    {!pending ? <><p>На этом устройстве нет сохранённой операции для проверки. Удаление не подтверждено.</p><Button asChild><Link to="/account">Настройки аккаунта</Link></Button></> : <>
      <p className="text-sm text-muted-foreground break-all">Номер операции: {pending.requestId}</p>
      {busy && <p role="status">Проверяем состояние операции…</p>}
      {error && <p role="alert">{error}</p>}
      {status?.status === "cleanup_pending" && <><p>{status.message}</p><p className="text-sm">Можно продолжить обработку уже подтверждённого вами удаления. Новая операция не создаётся.</p><Button disabled={busy} onClick={() => void check(true)}>Продолжить обработку</Button></>}
      {status?.status === "planned" && <><p>Сервер пока не начал удаление аккаунта. Оно не считается выполненным.</p><Button variant="outline" disabled={busy} onClick={() => { clearPendingDeletion(pending.requestId); navigate("/account", { replace: true }); }}>Вернуться к настройкам</Button></>}
      <Button variant="outline" disabled={busy} onClick={() => void check()}>Проверить статус</Button>
      <p className="text-sm"><Link to="/help" className="underline underline-offset-4">Помощь</Link></p>
    </>}
  </CardContent></Card></main>;
}
