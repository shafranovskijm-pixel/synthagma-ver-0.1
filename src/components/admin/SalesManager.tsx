import { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { FileText, Package, Users, Building2, BarChart3, ScrollText, GitCompareArrows } from 'lucide-react';
import { CommercialProposals } from './sales/CommercialProposals';
import { SalesServices } from './sales/SalesServices';
import { SalesManagersList } from './sales/SalesManagersList';
import { LeadsManager } from './sales/LeadsManager';
import { SalesControlPanel } from './sales/SalesControlPanel';
import { SalesContracts } from './sales/SalesContracts';
import { CompetitorComparison } from './sales/CompetitorComparison';

export function SalesManager() {
  return (
    <Tabs defaultValue="proposals" className="space-y-4">
      <TabsList className="flex flex-wrap gap-1">
        <TabsTrigger value="proposals" className="gap-1.5"><FileText className="w-4 h-4" />КП</TabsTrigger>
        <TabsTrigger value="services" className="gap-1.5"><Package className="w-4 h-4" />Услуги</TabsTrigger>
        <TabsTrigger value="managers" className="gap-1.5"><Users className="w-4 h-4" />Менеджеры</TabsTrigger>
        <TabsTrigger value="leads" className="gap-1.5"><Building2 className="w-4 h-4" />База компаний</TabsTrigger>
        <TabsTrigger value="contracts" className="gap-1.5"><ScrollText className="w-4 h-4" />Договоры</TabsTrigger>
        <TabsTrigger value="control" className="gap-1.5"><BarChart3 className="w-4 h-4" />Контроль</TabsTrigger>
      </TabsList>
      <TabsContent value="proposals"><CommercialProposals /></TabsContent>
      <TabsContent value="services"><SalesServices /></TabsContent>
      <TabsContent value="managers"><SalesManagersList /></TabsContent>
      <TabsContent value="leads"><LeadsManager /></TabsContent>
      <TabsContent value="contracts"><SalesContracts /></TabsContent>
      <TabsContent value="control"><SalesControlPanel /></TabsContent>
    </Tabs>
  );
}
