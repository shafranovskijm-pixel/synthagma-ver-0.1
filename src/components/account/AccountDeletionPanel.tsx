import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { safeInternalNext } from "@/utils/authReturn";
import { AccountDeletionError, confirmAccountDeletion, getDeletionPreview, type DeletionAction, type DeletionPreview, type DeletionReceipt } from "./accountDeletion";
import { clearPendingDeletion, savePendingDeletion } from "./pendingDeletion";

const actionLabels: Record<DeletionAction, string> = {
  delete: "Будет удалено", anonymize: "Будет обезличено", retain: "Останется", block: "Требует решения до удаления",
};

export function AccountDeletionPanel({ accountId, accountLabel, onDeleted }: { accountId: string; accountLabel: string; onDeleted: (receipt: DeletionReceipt) => void }) {
  const [preview, setPreview] = useState<DeletionPreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [unresolved, setUnresolved] = useState<{ message: string; requestId?: string } | null>(null);
  const [now, setNow] = useState(Date.now());
  const mounted = useRef(true);
  const generation = useRef(0);
  const submitting = useRef(false);

  async function loadPreview() {
    const request = ++generation.current;
    setLoading(true); setError(""); setPreview(null); setPassword(""); setConfirmed(false); setOpen(false);
    try {
      const result = await getDeletionPreview();
      if (mounted.current && request === generation.current) { setPreview(result); setNow(Date.now()); }
    } catch (cause) {
      if (mounted.current && request === generation.current) setError(cause instanceof Error ? cause.message : "Проверка условий удаления не выполнена.");
    } finally {
      if (mounted.current && request === generation.current) setLoading(false);
    }
  }
  useEffect(() => {
    mounted.current = true;
    void loadPreview();
    return () => { mounted.current = false; generation.current++; };
  }, []);
  useEffect(() => {
    if (!preview?.expiresAt) return;
    const delay = Math.min(2_147_483_647, Math.max(0, Date.parse(preview.expiresAt) - Date.now() + 1));
    const timer = setTimeout(() => setNow(Date.now()), delay);
    return () => clearTimeout(timer);
  }, [preview?.expiresAt]);

  const expired = !!preview?.expiresAt && Date.parse(preview.expiresAt) <= now;
  const canConfirm = !!preview?.canDelete && !!preview.planToken && !expired && !unresolved;

  async function removeAccount() {
    if (!canConfirm || !preview?.planToken || !preview.requestId || !preview.statusToken || !password || !confirmed || submitting.current) return;
    if (!preview.expiresAt || Date.parse(preview.expiresAt) <= Date.now()) { setNow(Date.now()); return; }
    submitting.current = true;
    setBusy(true); setError("");
    const request = generation.current;
    try {
      try { savePendingDeletion({ accountId, requestId: preview.requestId, statusToken: preview.statusToken }); }
      catch { throw new AccountDeletionError("STORAGE_UNAVAILABLE", "Не удалось сохранить данные для проверки результата. Удаление не отправлено."); }
      const result = await confirmAccountDeletion(preview.planToken, password, { requestId: preview.requestId, statusToken: preview.statusToken });
      // Session/cache cleanup in the owner callback must run even if Back unmounted this form.
      if (result.status === "deleted") { onDeleted(result); return; }
      if (!mounted.current || request !== generation.current) return;
      setPassword(""); setOpen(false);
      setUnresolved({ message: result.status === "planned" ? "Сервер пока не начал удаление. Проверьте статус операции." : result.message, requestId: result.requestId });
    } catch (cause) {
      if (!mounted.current || request !== generation.current) return;
      setPassword("");
      if (!(cause instanceof AccountDeletionError) || cause.outcome === "unknown") {
        setOpen(false);
        setUnresolved({ message: cause instanceof Error ? cause.message : "Результат удаления пока неизвестен. Не повторяйте операцию до проверки." });
      } else {
        try { clearPendingDeletion(preview.requestId); } catch { /* Keep the status capability if storage is temporarily unavailable. */ }
        setError(cause.message);
        if (["PLAN_EXPIRED", "PLAN_CHANGED", "OWNERSHIP_TRANSFER_REQUIRED", "RETENTION_POLICY_REQUIRED", "AUTH_REQUIRED", "MFA_REAUTH_REQUIRED"].includes(cause.code)) {
          setPreview(null); setOpen(false); setConfirmed(false);
        }
      }
    } finally {
      submitting.current = false;
      if (mounted.current && request === generation.current) setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Trash2 className="h-5 w-5" />Удаление аккаунта</CardTitle>
        <CardDescription>Проверка ниже относится только к вашей учётной записи. Перед подтверждением ознакомьтесь с последствиями.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {loading && <p role="status" className="flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" />Проверяем данные аккаунта…</p>}
        {error && !open && <p role="alert" className="text-sm text-destructive">{error}</p>}
        {unresolved ? (
          <div role="alert" className="rounded-xl border border-amber-500/50 bg-amber-500/5 p-4 space-y-2">
            <p className="font-medium">Удаление ещё не подтверждено</p>
            <p className="text-sm">{unresolved.message}</p>
            {unresolved.requestId && <p className="text-sm break-all">Номер операции: {unresolved.requestId}</p>}
            <p className="text-sm">Не повторяйте удаление, пока результат не проверен.</p>
            <Button asChild variant="outline" size="sm"><Link to="/account/deletion-status">Проверить статус операции</Link></Button>
          </div>
        ) : preview && (
          <>
            <div className="space-y-3">
              <h3 className="font-medium">Что произойдёт с данными</h3>
              {preview.categories.length ? <ul className="divide-y">
                {preview.categories.map(category => <li key={category.key} className="py-3 flex flex-wrap justify-between gap-2 text-sm">
                  <span>{category.label}: <strong>{category.count}</strong></span>
                  <span className="text-muted-foreground">{actionLabels[category.action]}</span>
                </li>)}
              </ul> : <p className="text-sm text-muted-foreground">Сервер не указал дополнительных категорий данных.</p>}
            </div>
            {preview.blockers.length > 0 && <div className="rounded-xl border p-4 space-y-3">
              <h3 className="font-medium flex items-center gap-2"><AlertTriangle className="h-4 w-4" />Сначала требуется решить</h3>
              <ul className="space-y-3 text-sm">{preview.blockers.map((blocker, index) => {
                const href = safeInternalNext(blocker.actionHref);
                return <li key={`${blocker.code}-${index}`}><p>{blocker.message}</p>{href && <Link to={href} className="underline underline-offset-4">Перейти к решению</Link>}</li>;
              })}</ul>
            </div>}
            {!preview.canDelete && preview.blockers.length === 0 && <p role="alert" className="text-sm">Сервер пока не разрешил удаление. Обновите проверку или обратитесь в поддержку.</p>}
            {expired && <p role="status" className="text-sm">Срок этой проверки истёк. Обновите её перед подтверждением.</p>}
            <Button variant="destructive" disabled={!canConfirm || busy} onClick={() => { setError(""); setOpen(true); }}>Продолжить удаление</Button>
          </>
        )}
        {!unresolved && <Button variant="outline" disabled={loading || busy} onClick={() => void loadPreview()}>Обновить проверку</Button>}
        <Dialog open={open} onOpenChange={value => { if (!busy) { setOpen(value); setPassword(""); setConfirmed(false); } }}>
          <DialogContent className="max-h-[90dvh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Удалить мой аккаунт</DialogTitle>
              <DialogDescription>Подтверждается удаление вашей учётной записи: {accountLabel}. Вход в этот аккаунт станет недоступен. Последствия для данных перечислены выше.</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2"><Label htmlFor="account-delete-password">Текущий пароль</Label><Input id="account-delete-password" type="password" autoComplete="current-password" value={password} disabled={busy} onChange={e => setPassword(e.target.value)} /></div>
              <div className="flex items-start gap-2"><Checkbox id="account-delete-confirm" checked={confirmed} disabled={busy} onCheckedChange={value => setConfirmed(value === true)} /><Label htmlFor="account-delete-confirm" className="text-sm leading-5">Я ознакомился с последствиями и хочу удалить свой аккаунт.</Label></div>
              {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
              {expired && <p role="alert" className="text-sm">Срок проверки истёк. Закройте окно и обновите проверку.</p>}
            </div>
            <DialogFooter>
              <Button variant="outline" disabled={busy} onClick={() => { setOpen(false); setPassword(""); setConfirmed(false); }}>Отмена</Button>
              <Button variant="destructive" disabled={!canConfirm || !password || !confirmed || busy} onClick={() => void removeAccount()}>{busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Удалить мой аккаунт</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
