import { useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { CreditCard } from 'lucide-react';
import { CommercialProposals } from './sales/CommercialProposals';
import { SalesServices } from './sales/SalesServices';
import { SalesManagersList } from './sales/SalesManagersList';
import { SalesControlPanel } from './sales/SalesControlPanel';
import { SalesContracts } from './sales/SalesContracts';
import { CompetitorComparison } from './sales/CompetitorComparison';
import { CompanyCard } from './sales/CompanyCard';
import { DocumentSigning } from './sales/DocumentSigning';
import { SalesSidebar } from './sales/SalesSidebar';
import { Deals360 } from './sales/Deals360';
import { BroadcastManager } from './BroadcastManager';
import { SalesOverview } from './sales/SalesOverview';
import { SalesTasks } from './sales/SalesTasks';
import { CompaniesUnified } from './sales/CompaniesUnified';
import { LogActivityDialog } from './sales/LogActivityDialog';

type PendingCompany = { name: string; inn: string };

export function SalesManager() {
  const [activeTab, setActiveTab] = useState('overview');
  const [cardOpen, setCardOpen] = useState(false);

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

  const TABS: Record<string, React.ReactNode> = {
    overview: <SalesOverview onJump={handleJump} />,
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

  return (
    <div className="flex gap-4">
      <SalesSidebar activeTab={activeTab} onTabChange={setActiveTab} />
      <div className="flex-1 min-w-0">
        {/* Header with quick "Our details" button */}
        <div className="flex justify-end mb-3">
          <Dialog open={cardOpen} onOpenChange={setCardOpen}>
            <DialogTrigger asChild>
              <Button size="sm" variant="outline" className="rounded-xl gap-1.5">
                <CreditCard className="w-3.5 h-3.5" />
                Наши реквизиты
              </Button>
            </DialogTrigger>
            <DialogContent className="rounded-2xl max-w-3xl max-h-[85vh] overflow-y-auto">
              <DialogHeader><DialogTitle>Реквизиты компании</DialogTitle></DialogHeader>
              <CompanyCard />
            </DialogContent>
          </Dialog>
        </div>
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
