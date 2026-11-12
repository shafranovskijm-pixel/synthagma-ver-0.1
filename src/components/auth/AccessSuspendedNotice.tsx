import { useState } from 'react';
import { Button } from '@/components/ui/button';

/** The server owns the suspension. These actions only re-check it or sign out. */
export function AccessSuspendedNotice({ onRetry, onSignOut }: {
  onRetry: () => Promise<unknown>;
  onSignOut?: () => Promise<unknown>;
}) {
  const [busy, setBusy] = useState(false);
  const run = async (action: () => Promise<unknown>) => {
    if (busy) return;
    setBusy(true);
    try { await action(); } catch { /* Auth state continues to own the failure. */ }
    finally { setBusy(false); }
  };
  return <div className="min-h-screen flex items-center justify-center bg-background"><div role="alert" className="max-w-md space-y-4 px-6 text-center">
    <p className="font-medium">Доступ временно приостановлен</p>
    <p className="text-sm text-muted-foreground">Для восстановления доступа свяжитесь с администратором СИНТАГМЫ.</p>
    <Button variant="outline" disabled={busy} onClick={() => void run(onRetry)}>Проверить доступ</Button>
    {onSignOut && <Button variant="ghost" disabled={busy} onClick={() => void run(onSignOut)}>Войти в другой аккаунт</Button>}
  </div></div>;
}
