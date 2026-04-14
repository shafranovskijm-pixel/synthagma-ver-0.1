import { useState, useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { RefreshCw } from 'lucide-react';

const ROLE_LOADING_TIMEOUT = 10000; // 10 seconds

interface ProtectedRouteProps {
  children: React.ReactNode;
  requiredRole?: 'admin' | 'organization' | 'student' | 'sales_manager' | 'company';
}

export function ProtectedRoute({ children, requiredRole }: ProtectedRouteProps) {
  const { user, userRole, loading, refreshUserRole } = useAuth();
  const [timedOut, setTimedOut] = useState(false);
  const [retrying, setRetrying] = useState(false);

  useEffect(() => {
    if (!loading && user && requiredRole && !userRole) {
      const timer = setTimeout(() => {
        setTimedOut(true);
      }, ROLE_LOADING_TIMEOUT);
      return () => clearTimeout(timer);
    }
    if (userRole) {
      setTimedOut(false);
    }
  }, [loading, user, userRole, requiredRole]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-pulse flex flex-col items-center gap-4">
          <div className="w-16 h-16 rounded-2xl bg-primary/20 flex items-center justify-center">
            <span className="font-display text-3xl font-bold text-primary">Σ</span>
          </div>
          <p className="text-muted-foreground">Загрузка...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  // Wait for role to load before making redirect decisions
  if (requiredRole && !userRole) {
    if (timedOut) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-background">
          <div className="flex flex-col items-center gap-4 text-center">
            <div className="w-16 h-16 rounded-2xl bg-destructive/20 flex items-center justify-center">
              <span className="font-display text-3xl font-bold text-destructive">!</span>
            </div>
            <p className="text-foreground font-medium">Не удалось загрузить данные</p>
            <p className="text-muted-foreground text-sm max-w-xs">
              Попробуйте обновить страницу или войти заново
            </p>
            <div className="flex gap-3">
              <Button
                variant="outline"
                onClick={async () => {
                  setRetrying(true);
                  setTimedOut(false);
                  await refreshUserRole();
                  setRetrying(false);
                }}
                disabled={retrying}
              >
                <RefreshCw className={`w-4 h-4 mr-2 ${retrying ? 'animate-spin' : ''}`} />
                Попробовать снова
              </Button>
              <Button variant="default" onClick={() => window.location.href = '/login'}>
                Войти заново
              </Button>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-pulse flex flex-col items-center gap-4">
          <div className="w-16 h-16 rounded-2xl bg-primary/20 flex items-center justify-center">
            <span className="font-display text-3xl font-bold text-primary">Σ</span>
          </div>
          <p className="text-muted-foreground">Загрузка...</p>
        </div>
      </div>
    );
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
