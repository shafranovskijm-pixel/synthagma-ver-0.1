import { useAuth } from '@/hooks/useAuth';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Eye, ArrowLeft } from 'lucide-react';
import { SalesManager } from '@/components/admin/SalesManager';
import { PhoneDialerWidget } from '@/components/admin/sales/PhoneDialerWidget';
import { SalesDashboardHeader } from '@/components/admin/sales/SalesDashboardHeader';
import { SalesDashboardFooter } from '@/components/admin/sales/SalesDashboardFooter';
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
    <div className="min-h-screen bg-background flex flex-col">
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

      <SalesDashboardHeader activeLabel="Компании" onSignOut={handleSignOut} />

      <main className="flex-1 max-w-[1600px] w-full mx-auto p-4 lg:p-8">
        <SalesManager />
      </main>

      <SalesDashboardFooter />
      <PhoneDialerWidget />
    </div>

  );
};

export default SalesDashboard;
