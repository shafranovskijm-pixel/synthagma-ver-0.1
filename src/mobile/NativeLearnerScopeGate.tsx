import type { ReactNode } from 'react';
import { Capacitor } from '@capacitor/core';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { NATIVE_LEARNER_SCOPE, isNativeLearnerPage, nativeLearnerRoute, nativeWebDestination } from './nativeLearnerScope';
import { SmartLoadingFallback } from '@/components/SmartLoadingFallback';
import { toast } from 'sonner';

/** Sits before Routes: unavailable pages must not mount or initiate a live session. */
export function NativeLearnerScope({ children }: { children: ReactNode }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, userRole, loading, signOut } = useAuth();
  if (!Capacitor.isNativePlatform()) return <>{children}</>;
  if (isNativeLearnerPage(location.pathname) && (loading || (user && !userRole))) {
    return <SmartLoadingFallback timeoutSec={8} label="Загружаем кабинет ученика…" />;
  }
  const decision = nativeLearnerRoute(location, userRole);
  if (decision.allowed === true) return <>
    <aside aria-label="Первый выпуск приложения" className="border-b border-border bg-primary/5 px-4 py-2 text-xs text-muted-foreground">
      <details><summary className="cursor-pointer">Первый выпуск — приложение ученика. Чаты и вебинары — на сайте.</summary><p className="pt-2">{NATIVE_LEARNER_SCOPE}</p></details>
    </aside>
    {children}
  </>;
  return <main className="min-h-screen bg-background p-6">
    <div className="mx-auto max-w-xl space-y-5 pt-8">
      <h1 className="font-display text-2xl">СИНТАГМА — приложение ученика</h1>
      <p>{NATIVE_LEARNER_SCOPE}</p>
      <p role="status" className="text-muted-foreground">{decision.reason}</p>
      <p className="text-sm text-muted-foreground">При переходе на сайт откроется внешний браузер. Вход в приложении не переносится на сайт.</p>
      <div className="flex flex-wrap gap-3">
        <Button asChild><Link to={decision.destination}>{decision.destination === '/account' ? 'Настройки аккаунта' : 'Продолжить в приложении'}</Link></Button>
        <Button asChild variant="outline"><a href={nativeWebDestination(location)} target="_self" rel="noopener noreferrer">Открыть веб-версию</a></Button>
        <Button asChild variant="ghost"><Link to="/account">Мой аккаунт</Link></Button>
        <Button variant="ghost" onClick={() => { void signOut().then(() => navigate('/login', { replace: true })).catch(() => toast.error('Не удалось выйти. Повторите попытку.')); }}>Выйти из аккаунта</Button>
      </div>
    </div>
  </main>;
}
