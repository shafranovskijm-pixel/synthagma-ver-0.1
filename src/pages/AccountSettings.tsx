import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Shield } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AccountDeletionPanel } from "@/components/account/AccountDeletionPanel";
import { PendingAccountDeletionLink } from "@/components/account/PendingAccountDeletionLink";
import { loadPendingDeletion } from "@/components/account/pendingDeletion";
import { clearDeletedAccountSession } from "@/components/account/clearDeletedAccountSession";
import { safeInternalNext } from "@/utils/authReturn";
import { ensureOwnProfile } from "@/api/selfProfile";

const dashboardPaths = { admin: "/admin", organization: "/organization", student: "/student", sales_manager: "/sales", company: "/company" };

export default function AccountSettings() {
  const { user, userRole } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const mounted = useRef(true);
  const currentAccount = useRef(user?.id);
  currentAccount.current = user?.id;
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const pendingDeletion = !!loadPendingDeletion();
  const profileScope = useRef<{ userId: string | undefined; pendingDeletion: boolean; operation?: ReturnType<typeof ensureOwnProfile> }>({ userId: user?.id, pendingDeletion });
  if (profileScope.current.userId !== user?.id || profileScope.current.pendingDeletion !== pendingDeletion) {
    profileScope.current = { userId: user?.id, pendingDeletion };
  }
  const scope = profileScope.current;
  const [profileCheck, setProfileCheck] = useState<{ scope: typeof scope; failed: boolean } | null>(null);
  useEffect(() => {
    if (!scope.userId || scope.pendingDeletion) return;
    let active = true;
    // StrictMode replays this effect; attach to one operation for this exact scope.
    scope.operation ??= ensureOwnProfile(scope.userId);
    void scope.operation.then(
      () => { if (active && profileScope.current === scope) setProfileCheck({ scope, failed: false }); },
      () => { if (active && profileScope.current === scope) setProfileCheck({ scope, failed: true }); },
    );
    return () => { active = false; };
  }, [scope]);
  const profileSettled = profileCheck?.scope === scope;
  if (!user) return null; // The route requires authentication without restricting the user's role.
  const accountLabel = user.email || user.phone || "текущий пользователь";
  const requestedReturn = location.state?.accountReturnTo;
  const returnTo = safeInternalNext(typeof requestedReturn === "string" ? requestedReturn : null) || (userRole ? dashboardPaths[userRole] : "/");

  return (
    <main className="min-h-screen bg-background px-4 py-6 sm:px-6 sm:py-10">
      <div className="mx-auto max-w-2xl space-y-6">
        <Button asChild variant="ghost" className="-ml-3 gap-2"><Link to={returnTo}><ArrowLeft className="h-4 w-4" />В кабинет</Link></Button>
        <div className="space-y-2"><h1 className="font-display text-2xl sm:text-3xl">Настройки аккаунта</h1><p className="text-muted-foreground">Личные данные и управление своей учётной записью.</p></div>
        <Card><CardHeader><CardTitle className="flex items-center gap-2"><Shield className="h-5 w-5" />Ваш аккаунт</CardTitle></CardHeader><CardContent className="space-y-3"><p className="break-all">{accountLabel}</p>{!pendingDeletion && !profileSettled && <p role="status" className="text-sm text-muted-foreground">Проверяем данные аккаунта…</p>}{!pendingDeletion && profileSettled && profileCheck?.failed && <p role="alert" className="text-sm text-destructive">Не удалось проверить профиль. Обновите страницу и повторите.</p>}<p className="text-sm text-muted-foreground">Здесь меняется только ваша учётная запись, даже если вы просматривали кабинет другого пользователя.</p><Link to="/documents/personal-data-policy" className="text-sm underline underline-offset-4">Политика обработки персональных данных</Link></CardContent></Card>
        {pendingDeletion ? <PendingAccountDeletionLink /> : profileSettled && <AccountDeletionPanel key={user.id} accountId={user.id} accountLabel={accountLabel} onDeleted={receipt => {
          void clearDeletedAccountSession(user.id, receipt.requestId, queryClient);
          if (mounted.current && currentAccount.current === user.id) navigate("/account/deletion-complete", { replace: true, state: { deletionReceipt: receipt } });
        }} />}
      </div>
    </main>
  );
}
