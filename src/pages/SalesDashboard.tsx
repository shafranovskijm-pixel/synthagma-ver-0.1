import { useAuth } from '@/hooks/useAuth';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { LogOut, Eye, ArrowLeft } from 'lucide-react';
import { SigmaLogo } from '@/components/ui/SigmaLogo';
import { SalesManager } from '@/components/admin/SalesManager';
import { getAdminSalesView, clearAdminSalesView } from '@/utils/adminViewMode';

const SalesDashboard = () => {
  const { signOut } = useAuth();
  const navigate = useNavigate();
  const viewAs = getAdminSalesView();

  const handleSignOut = async () => {
    await signOut();
    navigate('/login');
  };

  const handleReturn = () => {
    const back = viewAs?.returnTo || '/admin';
    clearAdminSalesView();
    navigate(back);
  };

  return (
    <div className="min-h-screen bg-background">
      {viewAs && (
        <div className="bg-amber-500/15 border-b border-amber-500/30 text-amber-900 dark:text-amber-200">
          <div className="max-w-[1600px] mx-auto px-4 py-2 flex items-center justify-between gap-3 text-sm">
            <span className="flex items-center gap-2 truncate">
              <Eye className="w-4 h-4 shrink-0" />
              Просмотр от лица менеджера: <strong className="truncate">{viewAs.fullName}</strong>
            </span>
            <Button size="sm" variant="outline" onClick={handleReturn} className="rounded-lg gap-1.5 shrink-0">
              <ArrowLeft className="w-3.5 h-3.5" /> Вернуться в админку
            </Button>
          </div>
        </div>
      )}
      <header className="sticky top-0 z-30 bg-card/95 backdrop-blur-sm border-b border-border">
        <div className="flex items-center justify-between px-4 h-14 max-w-[1600px] mx-auto">
          <div className="flex items-center gap-3">
            <SigmaLogo size="sm" showText={false} />
            <span className="font-display font-bold">Кабинет менеджера</span>
          </div>
          {!viewAs && (
            <Button variant="ghost" size="sm" onClick={handleSignOut}>
              <LogOut className="w-4 h-4 mr-1" />
              Выйти
            </Button>
          )}
        </div>
      </header>

      <main className="max-w-[1600px] mx-auto p-4">
        <SalesManager />
      </main>
    </div>
  );
};

export default SalesDashboard;
