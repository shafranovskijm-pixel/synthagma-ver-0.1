import { useState, useCallback, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Menu } from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { CommercialProposals } from './sales/CommercialProposals';
import { SalesServices } from './sales/SalesServices';
import { SalesManagersList } from './sales/SalesManagersList';
import { SalesControlPanel } from './sales/SalesControlPanel';
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
import { useAuth } from '@/hooks/useAuth';
import { getAdminSalesView } from '@/utils/adminViewMode';


type PendingCompany = { name: string; inn: string };

export function SalesManager() {
  const { userRole } = useAuth();
  // Админ без активного «просмотра от лица менеджера» видит СПИСОК менеджеров
  // (логины/пароли/история/войти как), а не персональную смену продажника.
  const isAdminView = userRole === 'admin' && !getAdminSalesView();
  const [activeTab, setActiveTab] = useState(isAdminView ? 'managers' : 'shift');
  const [mobileNavOpen, setMobileNavOpen] = useState(false);


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
    contracts: (
      <SalesContracts
        prefillCompany={contractPrefill}
        onPrefillConsumed={() => setContractPrefill(null)}
      />
    ),
    signing: <DocumentSigning />,
    control: <SalesControlPanel />,
    comparison: <CompetitorComparison />,
  };

  const currentItem = salesMenuGroups
    .flatMap(g => g.items)
    .find(i => i.id === activeTab) ?? salesMenuGroups[0].items[0];
  const CurrentIcon = currentItem.icon;

  return (
    <div className="flex flex-col gap-4">
      {/* Единая кнопка «меню» — раскрывает список разделов слева */}
      <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
        <div className="flex items-center gap-2">
          <SheetTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className="rounded-xl gap-2 shrink-0"
              aria-label="Открыть меню продаж"
            >
              <Menu className="w-4 h-4" />
              <span className="hidden sm:inline">Меню</span>
            </Button>
          </SheetTrigger>
          <div className="flex items-center gap-2 min-w-0">
            <CurrentIcon className="w-4 h-4 text-primary shrink-0" />
            <span className="font-medium text-sm truncate">{currentItem.label}</span>
          </div>
        </div>
        <SheetContent side="left" className="w-72 overflow-y-auto">
          <SheetHeader className="mb-4">
            <SheetTitle>Разделы продаж</SheetTitle>
          </SheetHeader>
          <SalesSidebarContent
            activeTab={activeTab}
            onTabChange={(tab) => { setActiveTab(tab); setMobileNavOpen(false); }}
          />
        </SheetContent>
      </Sheet>

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
