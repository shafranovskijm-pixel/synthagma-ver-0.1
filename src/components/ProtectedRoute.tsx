import { useState, useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { RefreshCw } from 'lucide-react';
import { SmartLoadingFallback } from '@/components/SmartLoadingFallback';

const ROLE_LOADING_TIMEOUT = 8000; // 8 seconds

interface ProtectedRouteProps {
  children: React.ReactNode;
  requiredRole?: 'admin' | 'organization' | 'student' | 'sales_manager' | 'company';
}

export function ProtectedRoute({ children, requiredRole }: ProtectedRouteProps) {
  const { user, userRole, loading, refreshUserRole } = useAuth();
  const [timedOut, setTimedOut] = useState(false);
  const [retrying, setRetrying] = useState(false);

  // Auto-retry once after a few seconds in case role lookup raced with
  // the post-signup role insert. This is what made first-time org users
  // appear stuck on a spinner right after registration.
  useEffect(() => {
    if (!loading && user && requiredRole && !userRole) {
      const autoRetry = setTimeout(() => {
        refreshUserRole().catch(() => {});
      }, 1500);
      const timer = setTimeout(() => {
        setTimedOut(true);
      }, ROLE_LOADING_TIMEOUT);
      return () => {
        clearTimeout(autoRetry);
        clearTimeout(timer);
      };
    }
    if (userRole) {
      setTimedOut(false);
    }
  }, [loading, user, userRole, requiredRole, refreshUserRole]);

  if (loading) {
    return <SmartLoadingFallback timeoutSec={8} label="Загрузка..." />;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  // Wait for role to load before making redirect decisions
  if (requiredRole && !userRole) {
    if (timedOut) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-background">
          <div className="flex flex-col items-center gap-4 text-center max-w-md px-6">
            <div className="w-16 h-16 rounded-2xl bg-destructive/20 flex items-center justify-center">
              <span className="font-display text-3xl font-bold text-destructive">!</span>
            </div>
            <p className="text-foreground font-medium">Не удалось загрузить кабинет</p>
            <p className="text-muted-foreground text-sm">
              Похоже, данные вашего аккаунта ещё не успели подтянуться.
              Попробуйте обновить страницу или войти заново.
            </p>
            <div className="flex gap-3 flex-wrap justify-center">
              <Button
                variant="outline"
                onClick={async () => {
                  setRetrying(true);
                  setTimedOut(false);
                  await refreshUserRole();
                  setRetrying(false);
                }}
                disabled={retrying}
                className="rounded-xl"
              >
                <RefreshCw className={`w-4 h-4 mr-2 ${retrying ? 'animate-spin' : ''}`} />
                Попробовать снова
              </Button>
              <Button
                variant="outline"
                onClick={() => window.location.reload()}
                className="rounded-xl"
              >
                Перезагрузить страницу
              </Button>
              <Button
                variant="default"
                onClick={() => (window.location.href = '/login')}
                className="rounded-xl"
              >
                Войти заново
              </Button>
            </div>
          </div>
        </div>
      );
    }

    return <SmartLoadingFallback timeoutSec={6} label="Загружаем ваш кабинет..." />;
  }

  if (requiredRole && userRole !== requiredRole && userRole !== 'admin') {
    if (userRole === 'organization') return <Navigate to="/organization" replace />;
    if (userRole === 'company') return <Navigate to="/company" replace />;
    if (userRole === 'student') return <Navigate to="/student" replace />;
    if (userRole === 'sales_manager') return <Navigate to="/sales" replace />;
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}
