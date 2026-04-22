import { useState } from 'react';
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

export function SalesManager() {
  const [activeTab, setActiveTab] = useState('overview');
  const [cardOpen, setCardOpen] = useState(false);

  const TABS: Record<string, React.ReactNode> = {
    overview: <SalesOverview onJump={setActiveTab} />,
    tasks: <SalesTasks />,
    deals: <Deals360 />,
    companies: <CompaniesUnified />,
    proposals: <CommercialProposals />,
    broadcast: <BroadcastManager />,
    services: <SalesServices />,
    managers: <SalesManagersList />,
    contracts: <SalesContracts />,
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
    </div>
  );
}
