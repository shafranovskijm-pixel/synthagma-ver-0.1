import { useAuth } from '@/hooks/useAuth';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { LogOut } from 'lucide-react';
import { SigmaLogo } from '@/components/ui/SigmaLogo';
import { SalesManager } from '@/components/admin/SalesManager';

const SalesDashboard = () => {
  const { signOut } = useAuth();
  const navigate = useNavigate();

  const handleSignOut = async () => {
    await signOut();
    navigate('/login');
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-30 bg-card/95 backdrop-blur-sm border-b border-border">
        <div className="flex items-center justify-between px-4 h-14 max-w-[1600px] mx-auto">
          <div className="flex items-center gap-3">
            <SigmaLogo size="sm" showText={false} />
            <span className="font-display font-bold">Кабинет менеджера</span>
          </div>
          <Button variant="ghost" size="sm" onClick={handleSignOut}>
            <LogOut className="w-4 h-4 mr-1" />
            Выйти
          </Button>
        </div>
      </header>

      <main className="max-w-[1600px] mx-auto p-4">
        <SalesManager />
      </main>
    </div>
  );
};

export default SalesDashboard;
