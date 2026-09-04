import { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  acknowledgeEnrollmentOrder, beginEnrollmentOrder, downloadEnrollmentOrder, enrollmentOrderStorageKey,
  finalizeEnrollmentOrder, listEnrollmentOrders, previewEnrollmentOrder, readEnrollmentOrder,
  readPendingEnrollmentOrder, resumeEnrollmentOrder,
  type EnrollmentOrderOperation, type EnrollmentOrderPreview, type OrderScope,
} from "@/lib/group-docs/enrollmentOrderIssue";

interface Props { organizationId: string; groupId: string }

/** Separate start-of-training action; the nine-document draft batch is unchanged. */
export function GoreltechEnrollmentOrderCard(props: Props) {
  const [open, setOpen] = useState(false);
  return <Card className="space-y-3 rounded-xl p-4">
    <div className="flex flex-wrap items-center gap-2"><h3 className="font-semibold">Приказ о зачислении</h3><Badge variant="outline">Beta</Badge></div>
    <p className="text-sm text-muted-foreground">Оформляется в начале обучения. Итоговые оценки, удостоверения и ФРДО для него не нужны.</p>
    {!open ? <Button type="button" variant="outline" onClick={() => setOpen(true)}>Оформить отдельный приказ</Button>
      : <AuthenticatedOrderPanel key={`${props.organizationId}:${props.groupId}`} {...props} />}
  </Card>;
}

function AuthenticatedOrderPanel(props: Props) {
  const { user } = useAuth();
  if (!user) return <p role="alert">Войдите в кабинет организации для оформления приказа.</p>;
  return <OrderPanel key={`${user.id}:${props.organizationId}:${props.groupId}`} scope={{ ...props, actorId: user.id }} />;
}

function OrderPanel({ scope: inputScope }: { scope: OrderScope }) {
  const { actorId, organizationId, groupId } = inputScope;
  const scope = useMemo(() => ({ actorId, organizationId, groupId }), [actorId, organizationId, groupId]);
  const [preview, setPreview] = useState<EnrollmentOrderPreview | null>(null);
  const [operations, setOperations] = useState<EnrollmentOrderOperation[]>([]);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [operation, setOperation] = useState<EnrollmentOrderOperation | null>(null);
  const [retryPending, setRetryPending] = useState(false);
  const [documentDate, setDocumentDate] = useState("");
  const [position, setPosition] = useState("");
  const [name, setName] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [storageError, setStorageError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const running = useRef(false);
  const alive = useRef(true);
  const previewVersion = useRef<string | null>(null);
  const supportsLock = typeof navigator !== "undefined" && Boolean(navigator.locks?.request);

  useEffect(() => {
    alive.current = true;
    const sync = () => {
      try { setPendingId(readPendingEnrollmentOrder(scope)); setStorageError(null); }
      catch { setStorageError("Хранилище операции недоступно. Оформление отключено, чтобы не потерять номер при сбое."); }
    };
    const changed = (event: StorageEvent) => {
      const key = enrollmentOrderStorageKey(scope);
      if (event.key === null || event.key === key || event.key.startsWith(`${key}:ack:`)) {
        sync(); setConfirmed(false); setPreview(null); setRetryPending(false);
      }
    };
    sync(); window.addEventListener("storage", changed);
    return () => { alive.current = false; window.removeEventListener("storage", changed); };
  }, [scope]);

  async function task(action: () => Promise<void>) {
    if (running.current) return;
    running.current = true; setBusy(true); setError(null); setMessage(null);
    try { await action(); }
    catch (failure) { if (alive.current) setError(failure instanceof Error ? failure.message : "Операция не подтверждена."); }
    finally { running.current = false; if (alive.current) setBusy(false); }
  }
  async function acceptResult(result: EnrollmentOrderOperation) {
    if (result.status === "completed") acknowledgeEnrollmentOrder(scope, result.operationId);
    if (!alive.current) return;
    setOperation(result); setPendingId(readPendingEnrollmentOrder(scope));
    setRetryPending(false);
    if (result.status === "completed") {
      setOperations(previous => [result, ...previous.filter(item => item.operationId !== result.operationId)]);
      setConfirmed(false); setPreview(null);
      setMessage(`Приказ № ${result.documentNumber} оформлен, готов к подписи. Подпись не проставлена.`);
    } else setMessage(`Номер ${result.documentNumber} закреплён. Нужно завершить сборку того же приказа.`);
  }
  const load = () => task(async () => {
    setPreview(null); setConfirmed(false);
    const version = localStorage.getItem(enrollmentOrderStorageKey(scope));
    const next = await previewEnrollmentOrder(scope);
    if (!alive.current) return;
    if (version !== localStorage.getItem(enrollmentOrderStorageKey(scope))) throw new Error("В другой вкладке изменилось состояние приказа. Повторите проверку состава.");
    previewVersion.current = version; setPreview(next);
  });
  const loadArchive = () => task(async () => {
    const saved = await listEnrollmentOrders(scope);
    if (!alive.current) return;
    setOperations(saved);
    if (!saved.length) setMessage("Оформленных приказов этой группы пока нет.");
  });
  const inspectPending = () => task(async () => {
    if (!pendingId) return;
    const saved = await readEnrollmentOrder(scope, pendingId);
    if (!alive.current) return;
    if (saved) await acceptResult(saved);
    else {
      setOperation(null); setRetryPending(true); setConfirmed(false);
      setMessage("Сервер пока не подтвердил эту операцию. Перечитайте состав и подтвердите данные для повторного запроса с тем же идентификатором. Если первый запрос уже закрепил номер, вернётся его исходный приказ — новый номер не создаётся.");
    }
  });
  const issue = () => task(async () => {
    if (!supportsLock || storageError || !preview?.canFinalize || !confirmed || !documentDate || !position.trim() || !name.trim() || (pendingId && !retryPending)) return;
    const key = enrollmentOrderStorageKey(scope);
    await navigator.locks.request(key, { ifAvailable: true }, async lock => {
      if (!lock) throw new Error("Приказ уже оформляется в другой вкладке. Проверьте состояние сохранённой операции.");
      if (!alive.current) return;
      if (previewVersion.current !== localStorage.getItem(key)) {
        setPreview(null); setConfirmed(false);
        throw new Error("В другой вкладке изменилось состояние приказа. Повторите проверку состава.");
      }
      const savedId = readPendingEnrollmentOrder(scope);
      if (pendingId && savedId !== pendingId) throw new Error("Состояние сохранённой операции изменилось. Перечитайте приказ.");
      const operationId = pendingId || beginEnrollmentOrder(scope);
      setPendingId(operationId); setOperation(null);
      setRetryPending(false);
      const result = await finalizeEnrollmentOrder(scope, operationId, {
        expectedSnapshotHash: preview.snapshotHash, documentDate,
        signatory: { position: position.trim(), name: name.trim() },
      });
      await acceptResult(result);
    });
  });
  const resume = () => task(async () => {
    if (!supportsLock || !pendingId || operation?.operationId !== pendingId || operation.status !== "reserved") return;
    await navigator.locks.request(enrollmentOrderStorageKey(scope), { ifAvailable: true }, async lock => {
      if (!lock) throw new Error("Приказ уже оформляется в другой вкладке. Проверьте состояние сохранённой операции.");
      if (!alive.current) return;
      await acceptResult(await resumeEnrollmentOrder(scope, pendingId));
    });
  });
  const change = (update: () => void) => { update(); setConfirmed(false); };
  const summary = preview?.documentSummary;

  return <div className="space-y-4">
    <p className="text-sm">Сначала проверьте состав из базы, затем укажите дату и подписанта. Проверка состава не сохраняет документ и не расходует номер.</p>
    <div className="flex flex-wrap gap-2">
      <Button type="button" variant="outline" disabled={busy} onClick={load}>Проверить состав и реквизиты</Button>
      <Button type="button" variant="outline" disabled={busy} onClick={loadArchive}>Открыть оформленные приказы</Button>
    </div>
    {busy && <p role="status">Проверяем данные…</p>}
    {error && <p role="alert" className="text-sm text-destructive">{error} {pendingId ? "Не создавайте повторный приказ — сначала проверьте сохранённую операцию." : "Если серверный этап ещё не опубликован, оформление пока недоступно. Остальные документы можно открывать как раньше."}</p>}
    {storageError && <p role="alert">{storageError}</p>}
    {!supportsLock && <p role="alert">Этот браузер не поддерживает защиту от одновременного оформления в нескольких вкладках. Просмотр доступен; для оформления используйте актуальный Chrome или Edge.</p>}
    {message && <p role="status" className="text-sm">{message}</p>}
    {pendingId && <div className="space-y-2 rounded-lg border border-amber-500/40 p-3">
      <p className="text-sm">Есть незавершённая или ещё не подтверждённая операция. Её номер и данные нельзя заменять новой попыткой.</p>
      <p className="break-all text-xs text-muted-foreground">Идентификатор: {pendingId}</p>
      <Button type="button" variant="outline" disabled={busy} onClick={inspectPending}>Проверить состояние приказа</Button>
      {operation?.status === "reserved" && operation.operationId === pendingId && <div className="space-y-2">
        <p>Сохранено: № {operation.documentNumber}, {operation.documentDate}; {operation.signatory.position}, {operation.signatory.name}.</p>
        <Button type="button" disabled={busy || !supportsLock} onClick={resume}>Завершить этот приказ без нового номера</Button>
      </div>}
    </div>}
    {preview && <div className="space-y-3 rounded-lg border p-3">
      <p className="font-medium">{preview.snapshot.organization.name} · {summary?.groupNumber || "—"}</p>
      <p>{summary?.programTitle || "Программа не указана"} · {summary?.programHours || "—"} ч. · {summary?.startDate || "—"} — {summary?.endDate || "—"}</p>
      <ul className="list-disc pl-5">{preview.snapshot.profiles.map(student => <li key={student.user_id}>{student.full_name || "ФИО не заполнено"}</li>)}</ul>
      {preview.issues.length > 0 && <ul className="list-disc pl-5 text-sm text-amber-800 dark:text-amber-300">{preview.issues.map((issue, index) => <li key={index}>{issue.message}</li>)}</ul>}
      <fieldset disabled={busy || Boolean(pendingId && !retryPending) || !preview.canFinalize} className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-3">
          <div><Label htmlFor="enrollment-order-date">Дата приказа</Label><Input id="enrollment-order-date" type="date" value={documentDate} onChange={e => change(() => setDocumentDate(e.target.value))} /></div>
          <div><Label htmlFor="enrollment-order-position">Должность подписанта</Label><Input id="enrollment-order-position" maxLength={200} value={position} onChange={e => change(() => setPosition(e.target.value))} /></div>
          <div><Label htmlFor="enrollment-order-name">ФИО подписанта</Label><Input id="enrollment-order-name" maxLength={300} value={name} onChange={e => change(() => setName(e.target.value))} /></div>
        </div>
        <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} /><span>Проверил состав, дату и подписанта. Документ будет подготовлен без подписи.{pendingId && retryPending ? " Если номер уже был закреплён, будет восстановлен приказ с ранее подтверждёнными данными." : ""}</span></label>
        <Button type="button" disabled={!confirmed || !documentDate || !position.trim() || !name.trim() || Boolean(storageError) || !supportsLock} onClick={issue}>{pendingId && retryPending ? "Повторить с тем же идентификатором" : "Оформить приказ и закрепить номер"}</Button>
      </fieldset>
    </div>}
    {operations.length > 0 && <section className="space-y-2" aria-label="Оформленные приказы о зачислении"><h4 className="font-medium">Оформленные приказы</h4>
      {operations.map(saved => <div key={saved.operationId} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3"><div><p>№ {saved.documentNumber} · {saved.documentDate}</p><p className="text-sm text-muted-foreground">Оформлен, готов к подписи</p></div>
        <Button type="button" variant="outline" disabled={busy} onClick={() => task(() => downloadEnrollmentOrder(scope, saved.operationId))}>Скачать приказ № {saved.documentNumber}</Button>
      </div>)}
    </section>}
  </div>;
}
