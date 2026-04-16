import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollText, Receipt, FileCheck, Download, FileText, Lightbulb, Eye, Trash2, ExternalLink, Building2, User, Store } from "lucide-react";
import { ContractLegalFaq } from "@/components/organization/ContractLegalFaq";
import { File } from "lucide-react";
import { format } from "date-fns";
import { ru } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import type { CounterpartySubTab, CounterpartyDoc, BillingDoc, InvoiceRow, CounterpartyOption } from "@/hooks/useDocumentsTab";

const docTypeLabels: Record<string, { label: string; icon: React.ReactNode }> = {
  invoice: { label: "Счёт", icon: <FileText className="w-4 h-4 text-blue-500" /> },
  receipt: { label: "Чек", icon: <Receipt className="w-4 h-4 text-emerald-500" /> },
  act: { label: "Акт", icon: <File className="w-4 h-4 text-amber-500" /> },
  other: { label: "Другое", icon: <File className="w-4 h-4 text-muted-foreground" /> },
};

interface CounterpartiesSectionProps {
  organizationId: string;
  counterpartySubTab: CounterpartySubTab;
  setCounterpartySubTab: (v: CounterpartySubTab) => void;
  counterpartyDocs: CounterpartyDoc[];
  counterpartyLoading: boolean;
  onCreateContract: () => void;
  invoices: InvoiceRow[];
  billingDocs: BillingDoc[];
  onViewDoc: (doc: BillingDoc) => void;
  onDownloadDoc: (doc: BillingDoc) => void;
  onDeleteDoc: (doc: BillingDoc) => void;
  onShowInvoiceDialog: () => void;
  onShowActDialog: () => void;
}

export function CounterpartiesSection({
  organizationId,
  counterpartySubTab,
  setCounterpartySubTab,
  counterpartyDocs,
  counterpartyLoading,
  onCreateContract,
  invoices,
  billingDocs,
  onViewDoc,
  onDownloadDoc,
  onDeleteDoc,
  onShowInvoiceDialog,
  onShowActDialog,
}: CounterpartiesSectionProps) {
  const [counterparties, setCounterparties] = useState<CounterpartyOption[]>([]);
  const [selectedId, setSelectedId] = useState<string>("platform");
  const [showFaq, setShowFaq] = useState(false);

  useEffect(() => {
    const list: CounterpartyOption[] = [{ id: "platform", name: "Синтагма", type: "platform" }];

    supabase
      .from("companies")
      .select("id, name")
      .eq("organization_id", organizationId)
      .order("name")
      .then(({ data }) => {
        const companies = (data || []).map(c => ({ id: c.id, name: c.name, type: "company" as const }));

        supabase
          .from("org_payers" as any)
          .select("id, name")
          .eq("organization_id", organizationId)
          .order("name")
          .then(({ data: pData }) => {
            const payers = ((pData as any[]) || []).map((p: any) => ({ id: p.id, name: p.name, type: "payer" as const }));
            setCounterparties([...list, ...companies, ...payers]);
          });
      });
  }, [organizationId]);

  const selected = counterparties.find(c => c.id === selectedId) || counterparties[0];
  const isPlatform = selected?.type === "platform";
  const isCompany = selected?.type === "company";
  const isPayer = selected?.type === "payer";

  const companyDocs = isCompany ? counterpartyDocs.filter(d => {
    return (d as any).company_id === selectedId || d.company_name === selected?.name;
  }) : [];

  const platformItems = counterparties.filter(c => c.type === "platform");
  const companyItems = counterparties.filter(c => c.type === "company");
  const payerItems = counterparties.filter(c => c.type === "payer");

  const renderPlatformContracts = () => (
    <div className="text-center py-12 text-muted-foreground">
      <ScrollText className="w-10 h-10 mx-auto mb-2 opacity-30" />
      <p className="text-sm font-medium">Договоры с платформой</p>
      <p className="text-xs mt-1">Здесь будут отображаться ваши договоры с Sintagma</p>
    </div>
  );

  const renderPlatformInvoices = () => {
    if (invoices.length === 0) {
      return (
        <div className="text-center py-12 text-muted-foreground">
          <Receipt className="w-10 h-10 mx-auto mb-2 opacity-30" />
          <p className="text-sm">Счетов пока нет</p>
          <Button className="mt-4 rounded-xl gap-1.5" size="sm" onClick={onShowInvoiceDialog}>
            <Receipt className="w-3.5 h-3.5" />Сформировать счёт
          </Button>
        </div>
      );
    }
    return (
      <div className="space-y-2">
        {invoices.map(inv => (
          <div key={inv.id} className="flex items-center justify-between p-3 rounded-lg border border-border hover:bg-muted/30 transition-colors">
            <div className="flex items-center gap-3">
              <Receipt className="w-4 h-4 text-primary" />
              <div>
                <div className="text-sm font-medium">Счёт {inv.invoice_number}</div>
                <div className="text-xs text-muted-foreground">
                  {format(new Date(inv.invoice_date), "d MMM yyyy", { locale: ru })} · {inv.amount.toLocaleString("ru-RU")} ₽ · {inv.plan}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {inv.status === "paid" ? (
                <span className="text-xs font-medium text-emerald-600">Оплачен</span>
              ) : (
                <span className="text-xs font-medium text-amber-600">Не оплачен</span>
              )}
              <Button variant="ghost" size="sm" title="Скачать / Печать" onClick={() => window.open(`/invoice/${inv.id}`, "_blank")}>
                <Download className="w-4 h-4" />
              </Button>
              <Button variant="ghost" size="sm" title="Открыть" onClick={() => window.open(`/invoice/${inv.id}`, "_blank")}>
                <ExternalLink className="w-4 h-4" />
              </Button>
            </div>
          </div>
        ))}
      </div>
    );
  };

  const renderPlatformClosing = () => {
    if (billingDocs.length === 0) {
      return (
        <div className="text-center py-12 text-muted-foreground">
          <FileText className="w-10 h-10 mx-auto mb-2 opacity-30" />
          <p className="text-sm">Закрывающих документов пока нет</p>
          <Button className="mt-4 rounded-xl gap-1.5" size="sm" onClick={onShowActDialog}>
            <FileText className="w-3.5 h-3.5" />Сформировать акт
          </Button>
        </div>
      );
    }
    return (
      <div className="space-y-2">
        {billingDocs.map(doc => {
          const docType = docTypeLabels[doc.doc_type] || docTypeLabels.other;
          return (
            <div key={doc.id} className="flex items-center justify-between p-3 rounded-lg border border-border hover:bg-muted/30 transition-colors">
              <div className="flex items-center gap-3">
                {docType.icon}
                <div>
                  <div className="text-sm font-medium">{doc.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {docType.label} · {format(new Date(doc.created_at), "d MMM yyyy", { locale: ru })}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="sm" title="Просмотр" onClick={() => onViewDoc(doc)}><Eye className="w-4 h-4" /></Button>
                <Button variant="ghost" size="sm" title="Скачать" onClick={() => onDownloadDoc(doc)}><Download className="w-4 h-4" /></Button>
                <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" title="Удалить" onClick={() => onDeleteDoc(doc)}><Trash2 className="w-4 h-4" /></Button>
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  const renderCompanyDocList = (type: string, emptyIcon: React.ReactNode, emptyText: string, showAmount = false) => {
    const docs = companyDocs.filter(d => d.type === type);
    if (counterpartyLoading) return <div className="text-center py-12 text-muted-foreground text-sm">Загрузка...</div>;
    if (docs.length === 0) {
      return (
        <div className="text-center py-12 text-muted-foreground">
          {emptyIcon}
          <p className="text-sm">{emptyText}</p>
          {type === "contract" && (
            <Button className="mt-4 rounded-xl gap-1.5" size="sm" onClick={onCreateContract}>
              <FileText className="w-3.5 h-3.5" />Создать договор
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
                  {doc.contract_number || "—"} · {doc.contract_date ? new Date(doc.contract_date).toLocaleDateString("ru-RU") : new Date(doc.uploaded_at).toLocaleDateString("ru-RU")}
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

  const renderPayerContent = () => (
    <div className="text-center py-12 text-muted-foreground">
      <User className="w-10 h-10 mx-auto mb-2 opacity-30" />
      <p className="text-sm font-medium">Документы плательщика</p>
      <p className="text-xs mt-1">Здесь будут отображаться документы по взаиморасчётам</p>
    </div>
  );

  const getIcon = (type: CounterpartyOption["type"]) => {
    if (type === "platform") return <Store className="w-3.5 h-3.5" />;
    if (type === "company") return <Building2 className="w-3.5 h-3.5" />;
    return <User className="w-3.5 h-3.5" />;
  };

  const renderChip = (cp: CounterpartyOption) => (
    <button
      key={cp.id}
      onClick={() => setSelectedId(cp.id)}
      className={cn(
        "inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border transition-all",
        selectedId === cp.id
          ? "bg-primary text-primary-foreground border-primary shadow-sm"
          : "bg-muted/40 text-muted-foreground border-border hover:bg-muted hover:text-foreground"
      )}
    >
      {getIcon(cp.type)}
      {cp.name}
    </button>
  );

  return (
    <div className="space-y-4">
      {/* Header with counterparty selector + FAQ button */}
      <div className="flex items-center gap-3">
        <div className="flex flex-wrap items-center gap-1.5 flex-1">
          {/* Platform */}
          {platformItems.map(renderChip)}

          {/* Divider + Clients */}
          {companyItems.length > 0 && (
            <>
              <div className="h-5 w-px bg-border mx-1" />
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground/60 font-semibold mr-0.5">Клиенты</span>
              {companyItems.map(renderChip)}
            </>
          )}

          {/* Divider + Payers */}
          {payerItems.length > 0 && (
            <>
              <div className="h-5 w-px bg-border mx-1" />
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground/60 font-semibold mr-0.5">Плательщики</span>
              {payerItems.map(renderChip)}
            </>
          )}
        </div>

        {/* Pulsing FAQ button */}
        <button
          onClick={() => setShowFaq(true)}
          className="relative shrink-0 w-8 h-8 flex items-center justify-center rounded-full bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
          title="Справка по договорам (273-ФЗ)"
        >
          <span className="absolute inset-0 rounded-full animate-ping bg-primary/20" />
          <Lightbulb className="w-4 h-4 relative z-10" />
        </button>
      </div>

      {/* FAQ Dialog */}
      <Dialog open={showFaq} onOpenChange={setShowFaq}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Lightbulb className="w-5 h-5 text-primary" />
              Справка по договорам (273-ФЗ)
            </DialogTitle>
          </DialogHeader>
          <ContractLegalFaq />
        </DialogContent>
      </Dialog>

      {/* Sub-tabs */}
      <Tabs value={counterpartySubTab} onValueChange={(v) => setCounterpartySubTab(v as CounterpartySubTab)}>
        <TabsList className="bg-muted/50 rounded-xl mb-4">
          <TabsTrigger value="contracts" className="rounded-lg text-xs gap-1.5"><ScrollText className="w-3.5 h-3.5" />Договоры</TabsTrigger>
          <TabsTrigger value="invoices" className="rounded-lg text-xs gap-1.5"><Receipt className="w-3.5 h-3.5" />Счета</TabsTrigger>
          <TabsTrigger value="closing" className="rounded-lg text-xs gap-1.5"><FileCheck className="w-3.5 h-3.5" />Закрывающие</TabsTrigger>
        </TabsList>

        {isPlatform && (
          <>
            <TabsContent value="contracts" className="mt-0">{renderPlatformContracts()}</TabsContent>
            <TabsContent value="invoices" className="mt-0">{renderPlatformInvoices()}</TabsContent>
            <TabsContent value="closing" className="mt-0">{renderPlatformClosing()}</TabsContent>
          </>
        )}

        {isCompany && (
          <>
            <TabsContent value="contracts" className="mt-0">
              {renderCompanyDocList("contract", <><ScrollText className="w-10 h-10 mx-auto mb-2 opacity-30" /><p className="text-sm font-medium">Договоры</p></>, "Договоров пока нет")}
            </TabsContent>
            <TabsContent value="invoices" className="mt-0">
              {renderCompanyDocList("invoice", <><Receipt className="w-10 h-10 mx-auto mb-2 opacity-30" /></>, "Счетов пока нет", true)}
            </TabsContent>
            <TabsContent value="closing" className="mt-0">
              {renderCompanyDocList("act", <><FileCheck className="w-10 h-10 mx-auto mb-2 opacity-30" /></>, "Актов пока нет")}
            </TabsContent>
          </>
        )}

        {isPayer && (
          <>
            <TabsContent value="contracts" className="mt-0">{renderPayerContent()}</TabsContent>
            <TabsContent value="invoices" className="mt-0">{renderPayerContent()}</TabsContent>
            <TabsContent value="closing" className="mt-0">{renderPayerContent()}</TabsContent>
          </>
        )}
      </Tabs>
    </div>
  );
}
