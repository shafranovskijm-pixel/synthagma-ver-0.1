import React from "react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollText, Receipt, FileCheck, Download, FileText, Lightbulb } from "lucide-react";
import { ContractLegalFaq } from "@/components/organization/ContractLegalFaq";
import type { CounterpartySubTab, CounterpartyDoc } from "@/hooks/useDocumentsTab";

interface CounterpartiesSectionProps {
  counterpartySubTab: CounterpartySubTab;
  setCounterpartySubTab: (v: CounterpartySubTab) => void;
  counterpartyDocs: CounterpartyDoc[];
  counterpartyLoading: boolean;
  onCreateContract: () => void;
}

export function CounterpartiesSection({ counterpartySubTab, setCounterpartySubTab, counterpartyDocs, counterpartyLoading, onCreateContract }: CounterpartiesSectionProps) {
  const renderDocList = (type: string, emptyIcon: React.ReactNode, emptyText: string, showAmount = false) => {
    const docs = counterpartyDocs.filter(d => d.type === type);
    if (counterpartyLoading) return <div className="text-center py-12 text-muted-foreground text-sm">Загрузка...</div>;
    if (docs.length === 0) {
      return (
        <div className="text-center py-12 text-muted-foreground">
          {emptyIcon}
          <p className="text-sm">{emptyText}</p>
          {type === "contract" && (
            <Button className="mt-4 rounded-xl gap-1.5" size="sm" onClick={onCreateContract}>
              <FileText className="w-3.5 h-3.5" />
              Создать договор
            </Button>
          )}
        </div>
      );
    }
    return (
      <div className="space-y-2">
        {docs.map(doc => (
          <div key={doc.id} className="flex items-center justify-between p-3 rounded-lg border border-border hover:bg-muted/30 transition-colors">
            <div className="flex items-center gap-3">
              {type === "contract" ? <ScrollText className="w-4 h-4 text-primary" /> : type === "invoice" ? <Receipt className="w-4 h-4 text-primary" /> : <FileCheck className="w-4 h-4 text-primary" />}
              <div>
                <div className="text-sm font-medium">{doc.name}</div>
                <div className="text-xs text-muted-foreground">
                  {doc.contract_number || "—"} · {doc.contract_date ? new Date(doc.contract_date).toLocaleDateString("ru-RU") : new Date(doc.uploaded_at).toLocaleDateString("ru-RU")} · {doc.company_name}
                  {showAmount && doc.amount ? ` · ${new Intl.NumberFormat("ru-RU").format(doc.amount)} ₽` : ""}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {showAmount && (doc.is_paid ? <span className="text-xs font-medium text-emerald-600">Оплачен</span> : <span className="text-xs font-medium text-amber-600">Не оплачен</span>)}
              {doc.file_url && (
                <Button variant="ghost" size="icon" asChild>
                  <a href={doc.file_url} target="_blank" rel="noopener noreferrer"><Download className="w-4 h-4" /></a>
                </Button>
              )}
            </div>
          </div>
        ))}
      </div>
    );
  };

  return (
    <div>
      <Tabs value={counterpartySubTab} onValueChange={(v) => setCounterpartySubTab(v as CounterpartySubTab)}>
        <TabsList className="bg-muted/50 rounded-xl mb-4">
          <TabsTrigger value="contracts" className="rounded-lg text-xs gap-1.5"><ScrollText className="w-3.5 h-3.5" />Договоры</TabsTrigger>
          <TabsTrigger value="invoices" className="rounded-lg text-xs gap-1.5"><Receipt className="w-3.5 h-3.5" />Счета</TabsTrigger>
          <TabsTrigger value="acts" className="rounded-lg text-xs gap-1.5"><FileCheck className="w-3.5 h-3.5" />Акты</TabsTrigger>
          <TabsTrigger value="faq" className="rounded-lg text-xs gap-1.5"><Lightbulb className="w-3.5 h-3.5" />Справка 273-ФЗ</TabsTrigger>
        </TabsList>
        <TabsContent value="contracts" className="mt-0">
          {renderDocList("contract", <><ScrollText className="w-10 h-10 mx-auto mb-2 opacity-30" /><p className="text-sm font-medium">Договоры с контрагентами</p><p className="text-xs mt-1">Создайте первый договор с помощью конструктора</p></>, "Договоров пока нет")}
        </TabsContent>
        <TabsContent value="invoices" className="mt-0">
          {renderDocList("invoice", <><Receipt className="w-10 h-10 mx-auto mb-2 opacity-30" /></>, "Счетов пока нет", true)}
        </TabsContent>
        <TabsContent value="acts" className="mt-0">
          {renderDocList("act", <><FileCheck className="w-10 h-10 mx-auto mb-2 opacity-30" /></>, "Актов пока нет")}
        </TabsContent>
        <TabsContent value="faq" className="mt-0"><ContractLegalFaq /></TabsContent>
      </Tabs>
    </div>
  );
}
