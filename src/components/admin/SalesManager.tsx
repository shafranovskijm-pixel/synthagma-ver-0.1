import { useState, useCallback, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Menu, Send, Target, Users, PhoneCall, Package, FileCode, Settings as SettingsIcon, Database, FileText } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { CommercialProposals } from './sales/CommercialProposals';
import { SalesServices } from './sales/SalesServices';
import { SalesManagersList } from './sales/SalesManagersList';
import { SalesControlPanel } from './sales/SalesControlPanel';
import { SalesSettings } from './sales/SalesSettings';
import { SalesContracts } from './sales/SalesContracts';
import { CompetitorComparison } from './sales/CompetitorComparison';
import { DocumentSigning } from './sales/DocumentSigning';
import { SalesSidebarContent, salesMenuGroups } from './sales/SalesSidebar';
import { Deals360 } from './sales/Deals360';
import { BroadcastManager } from './BroadcastManager';
import { SalesOverview } from './sales/SalesOverview';
import { SalesTasks } from './sales/SalesTasks';
import { CompaniesUnified } from './sales/CompaniesUnified';
import { LogActivityDialog } from './sales/LogActivityDialog';
import { SalesReport } from './sales/SalesReport';
import { SalesShiftView } from './sales/SalesShiftView';
import { LeadsManager } from './sales/LeadsManager';
import { CallRecordingsAdminList } from './sales/CallRecordingsAdminList';
import { EmailTemplatesManager } from '@/components/shared/sales/EmailTemplatesManager';
import { AdminDocumentsManager } from './AdminDocumentsManager';
import { useAuth } from '@/hooks/useAuth';
import { getAdminSalesView } from '@/utils/adminViewMode';


type PendingCompany = { name: string; inn: string };

export function SalesManager() {
  const { userRole } = useAuth();
  // Админ без активного «просмотра от лица менеджера» видит СПИСОК менеджеров
  // (логины/пароли/история/войти как), а не персональную смену продажника.
  const isAdminView = userRole === 'admin' && !getAdminSalesView();
  const [activeTab, setActiveTab] = useState(() => {
    try {
      const stored = localStorage.getItem('sales_initial_tab');
      if (stored) {
        localStorage.removeItem('sales_initial_tab');
        return stored;
      }
    } catch {}
    return isAdminView ? 'broadcast' : 'shift';
  });
  const [mobileNavOpen, setMobileNavOpen] = useState(false);


  // Верхняя горизонтальная навигация (запрос: «Рассылка» первой)
  const topNav: { id: string; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
    { id: 'broadcast', label: 'Рассылка', icon: Send },
    { id: 'overview', label: 'Обзор', icon: Target },
    { id: 'leads', label: 'Лиды', icon: Database },
    { id: 'companies', label: 'База компаний', icon: Database },
    { id: 'admin-documents', label: 'Документы', icon: FileText },
    { id: 'recordings', label: 'Дозвоны', icon: PhoneCall },
    { id: 'managers', label: 'Менеджеры', icon: Users },
    { id: 'templates', label: 'Шаблоны писем', icon: FileCode },
    { id: 'services', label: 'Услуги', icon: Package },
    { id: 'settings', label: 'Настройки / SMTP', icon: SettingsIcon },
  ];


  // Контекст компании, прокинутой из «Сделок 360°»
  const [proposalPrefill, setProposalPrefill] = useState<PendingCompany | null>(null);
  const [contractPrefill, setContractPrefill] = useState<PendingCompany | null>(null);
  const [taskPrefill, setTaskPrefill] = useState<PendingCompany | null>(null);

  // ИНН компании, выбранной из «Обзора» (Топ-5 / Алерты) — пробрасываем в Deals360
  const [dealSelectedInn, setDealSelectedInn] = useState<string | null>(null);

  // Диалог звонок/заметка
  const [activityDialog, setActivityDialog] = useState<{
    open: boolean; type: 'call' | 'note'; company: PendingCompany | null;
  }>({ open: false, type: 'call', company: null });

  // Чтобы DealCommunication перезагружался после новой активности
  const [commRefresh, setCommRefresh] = useState(0);

  const goCreateProposal = useCallback((c: PendingCompany) => {
    setProposalPrefill(c);
    setActiveTab('proposals');
  }, []);
  const goCreateContract = useCallback((c: PendingCompany) => {
    setContractPrefill(c);
    setActiveTab('contracts');
  }, []);
  const goCreateInvoice = useCallback((c: PendingCompany) => {
    // Счета пока выставляются вручную в КП-редакторе
    setProposalPrefill(c);
    setActiveTab('proposals');
  }, []);
  const openActivity = useCallback((type: 'call' | 'note') => (c: PendingCompany) => {
    setActivityDialog({ open: true, type, company: c });
  }, []);
  const goAddTask = useCallback((c: PendingCompany) => {
    setTaskPrefill(c);
    setActiveTab('tasks');
  }, []);

  // Из «Обзора» можно прийти на «Сделки 360°» с выбранной компанией
  const handleJump = useCallback((tab: string, inn?: string | null) => {
    if (inn) setDealSelectedInn(inn);
    setActiveTab(tab);
  }, []);

  // Внешняя навигация (из меню под аватаром в шапке)
  useEffect(() => {
    const handler = (e: Event) => {
      const tab = (e as CustomEvent).detail;
      if (typeof tab === 'string') setActiveTab(tab);
    };
    window.addEventListener('sales-nav', handler);
    return () => window.removeEventListener('sales-nav', handler);
  }, []);

  const TABS: Record<string, React.ReactNode> = {
    shift: <SalesShiftView onCreateProposal={goCreateProposal} onCreateContract={goCreateContract} />,
    
    
    overview: <SalesOverview onJump={handleJump} />,
    report: <SalesReport />,
    tasks: <SalesTasks
      prefillCompany={taskPrefill}
      onPrefillConsumed={() => setTaskPrefill(null)}
      onOpenDeal={(inn) => handleJump('deals', inn)}
    />,
    deals: (
      <Deals360
        onCreateProposal={goCreateProposal}
        onCreateContract={goCreateContract}
        onCreateInvoice={goCreateInvoice}
        onAddCall={openActivity('call')}
        onAddNote={openActivity('note')}
        onAddTask={goAddTask}
        communicationRefreshKey={commRefresh}
        initialSelectedInn={dealSelectedInn}
      />
    ),
    companies: <CompaniesUnified />,
    proposals: (
      <CommercialProposals
        prefillCompany={proposalPrefill}
        onPrefillConsumed={() => setProposalPrefill(null)}
      />
    ),
    broadcast: <BroadcastManager />,
    services: <SalesServices />,
    managers: <SalesManagersList />,
    leads: <LeadsManager />,
    recordings: <CallRecordingsAdminList />,
    templates: <EmailTemplatesManager scope="platform" organizationId={null} />,
    contracts: (
      <SalesContracts
        prefillCompany={contractPrefill}
        onPrefillConsumed={() => setContractPrefill(null)}
      />
    ),
    signing: <DocumentSigning />,
    control: <SalesControlPanel />,
    settings: <SalesSettings />,
    comparison: <CompetitorComparison />,
  };


  const isBroadcast = activeTab === 'broadcast';

  return (
    <div className="flex flex-col gap-4">

      {/* Верхняя горизонтальная навигация — скрыта в «Рассылке» для Coldy-вида */}
      {!isBroadcast && (
        <div className="flex items-center gap-2">
          <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
            <SheetTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="rounded-xl gap-2 shrink-0"
                aria-label="Все разделы продаж"
                title="Все разделы (включая КП, Договоры, Подписание, Сделки, Задачи, Отчёт)"
              >
                <Menu className="w-4 h-4" />
                <span className="hidden sm:inline">Ещё</span>
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-72 overflow-y-auto">
              <SheetHeader className="mb-4">
                <SheetTitle>Все разделы продаж</SheetTitle>
              </SheetHeader>
              <SalesSidebarContent
                activeTab={activeTab}
                onTabChange={(tab) => { setActiveTab(tab); setMobileNavOpen(false); }}
              />
            </SheetContent>
          </Sheet>

          <div className="flex-1 flex items-center gap-1.5 overflow-x-auto pb-1">
            {topNav.map(item => {
              const Icon = item.icon;
              const active = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setActiveTab(item.id)}
                  className={cn(
                    "flex items-center gap-2 px-3.5 py-2 rounded-xl text-sm font-medium transition-all whitespace-nowrap shrink-0",
                    active
                      ? "bg-primary text-primary-foreground shadow-md"
                      : "bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground"
                  )}
                >
                  <Icon className="w-4 h-4" />
                  {item.label}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Кнопка «назад» когда в Coldy-виде */}
      {isBroadcast && (
        <button
          onClick={() => setActiveTab('overview')}
          className="self-start text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 px-2 py-1 rounded-md hover:bg-muted transition-colors"
        >
          ← Выйти из рассылки
        </button>
      )}


      <div className="flex-1 min-w-0">
        {TABS[activeTab]}
      </div>



      {/* Универсальный диалог звонок/заметка */}
      {activityDialog.company && (
        <LogActivityDialog
          open={activityDialog.open}
          onOpenChange={(v) => setActivityDialog(s => ({ ...s, open: v }))}
          companyName={activityDialog.company.name}
          inn={activityDialog.company.inn}
          defaultType={activityDialog.type}
          onLogged={() => setCommRefresh(x => x + 1)}
        />
      )}
    </div>
  );
}
