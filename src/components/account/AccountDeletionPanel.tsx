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
  delete: "Будет удалено", anonymize: "Будет обезличено, записи останутся", retain: "Будет сохранено", block: "Требует решения до удаления",
};

function DataConsequences({ categories }: { categories: DeletionPreview["categories"] }) {
  return <ul className="divide-y" aria-label="Последствия для данных">
    {categories.map(category => <li key={category.key} className="py-3 flex flex-wrap justify-between gap-2 text-sm">
      <span>{category.label}: <strong>{category.count}</strong></span>
      <span className={category.action === "delete" ? "text-muted-foreground" : "font-medium"}>{actionLabels[category.action]}</span>
    </li>)}
  </ul>;
}

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
  const canConfirm = !!preview?.canDelete && !!preview.planToken && !!preview.warning?.trim() && preview.categories.length > 0
    && preview.blockers.length === 0 && !preview.categories.some(category => category.action === "block") && !expired && !unresolved;
  const hasRemainingData = preview?.categories.some(category => category.count > 0 && ["anonymize", "retain"].includes(category.action));

  async function removeAccount() {
    if (!canConfirm || !preview?.planToken || !preview.requestId || !preview.statusToken || !password || !confirmed || submitting.current) return;
    if (!preview.expiresAt || Date.parse(preview.expiresAt) <= Date.now()) { setNow(Date.now()); return; }
    submitting.current = true;
    setBusy(true); setError("");
    const request = generation.current;
    try {
      try { savePendingDeletion({ accountId, requestId: preview.requestId, statusToken: preview.statusToken }); }
      catch { throw new AccountDeletionError("STORAGE_UNAVAILABLE", "Не удалось сохранить данные для проверки результата. Удаление не отправлено."); }
      const result = await confirmAccountDeletion(preview.planToken, password, { requestId: preview.requestId, statusToken: preview.statusToken }, preview.consentVersion);
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
        if (["PLAN_EXPIRED", "PLAN_CHANGED", "OWNERSHIP_TRANSFER_REQUIRED", "RETENTION_POLICY_REQUIRED", "AUTH_REQUIRED", "MFA_REAUTH_REQUIRED", "CONSENT_REQUIRED", "INVALID_CONSENT"].includes(cause.code)) {
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
              {preview.categories.length ? <DataConsequences categories={preview.categories} />
                : <p role="alert" className="text-sm">Сервер не указал последствия для данных. Обновите проверку перед удалением.</p>}
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
            <Button variant="destructive" disabled={!canConfirm || busy} onClick={() => { setError(""); setPassword(""); setConfirmed(false); setOpen(true); }}>Продолжить удаление</Button>
          </>
        )}
        {!unresolved && <Button variant="outline" disabled={loading || busy} onClick={() => void loadPreview()}>Обновить проверку</Button>}
        <Dialog open={open} onOpenChange={value => { if (!busy) { setOpen(value); setPassword(""); setConfirmed(false); } }}>
          <DialogContent className="max-h-[90dvh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Удалить мой аккаунт</DialogTitle>
              <DialogDescription>Вы удаляете свою учётную запись: {accountLabel}. Перед подтверждением проверьте последствия для своих данных.</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div role="alert" className="rounded-xl border border-destructive/50 bg-destructive/5 p-4 space-y-2 text-sm">
                <p className="font-semibold">Удаление необратимо</p>
                <p>{preview?.warning}</p>
                <p>Вы потеряете доступ к аккаунту. Связанные с вами личные данные, отмеченные «Будет удалено», будут безвозвратно удалены. Восстановить их после завершения операции нельзя.</p>
                <p>До подтверждения скачайте нужные вам документы и учебные материалы.</p>
              </div>
              <section aria-label="Перечень последствий удаления">
                <h3 className="font-medium">Что произойдёт с данными</h3>
                {preview && <DataConsequences categories={preview.categories} />}
                {hasRemainingData && <p className="mt-2 text-sm font-medium">Часть данных останется в системе: сохранённые и обезличенные записи указаны в этом списке.</p>}
              </section>
              <div className="space-y-2"><Label htmlFor="account-delete-password">Текущий пароль</Label><Input id="account-delete-password" type="password" autoComplete="current-password" value={password} disabled={busy} onChange={e => setPassword(e.target.value)} /></div>
              <div className="flex items-start gap-2"><Checkbox id="account-delete-confirm" checked={confirmed} disabled={busy} onCheckedChange={value => setConfirmed(value === true)} /><Label htmlFor="account-delete-confirm" className="text-sm leading-5">Я понимаю, что удаление аккаунта и данных, отмеченных «Будет удалено», безвозвратно, и согласен с указанными последствиями.</Label></div>
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
