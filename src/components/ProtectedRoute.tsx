import { Navigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';

interface ProtectedRouteProps {
  children: React.ReactNode;
  requiredRole?: 'admin' | 'organization' | 'student' | 'sales_manager';
}

export function ProtectedRoute({ children, requiredRole }: ProtectedRouteProps) {
  const { user, userRole, loading } = useAuth();

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
    // Role is still loading, show loading state
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
    // Redirect based on actual role
    if (userRole === 'organization') {
      return <Navigate to="/organization" replace />;
    } else if (userRole === 'student') {
      return <Navigate to="/student" replace />;
    } else if (userRole === 'sales_manager') {
      return <Navigate to="/sales" replace />;
    } else {
      return <Navigate to="/" replace />;
    }
  }

  return <>{children}</>;
}
