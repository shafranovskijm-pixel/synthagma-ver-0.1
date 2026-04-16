import { useState } from 'react';
import { CommercialProposals } from './sales/CommercialProposals';
import { SalesServices } from './sales/SalesServices';
import { SalesManagersList } from './sales/SalesManagersList';
import { LeadsManager } from './sales/LeadsManager';
import { SalesControlPanel } from './sales/SalesControlPanel';
import { SalesContracts } from './sales/SalesContracts';
import { CompetitorComparison } from './sales/CompetitorComparison';
import { DemoLinksManager } from './sales/DemoLinksManager';
import { CompanyCard } from './sales/CompanyCard';
import { SalesSidebar } from './sales/SalesSidebar';

const TABS: Record<string, React.ReactNode> = {
  proposals: <CommercialProposals />,
  services: <SalesServices />,
  managers: <SalesManagersList />,
  leads: <LeadsManager />,
  contracts: <SalesContracts />,
  control: <SalesControlPanel />,
  comparison: <CompetitorComparison />,
  demo: <DemoLinksManager />,
  'company-card': <CompanyCard />,
};

export function SalesManager() {
  const [activeTab, setActiveTab] = useState('proposals');

  return (
    <div className="flex gap-4">
      <SalesSidebar activeTab={activeTab} onTabChange={setActiveTab} />
      <div className="flex-1 min-w-0">
        {TABS[activeTab]}
      </div>
    </div>
  );
}
