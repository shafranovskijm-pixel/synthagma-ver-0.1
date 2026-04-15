import React from "react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollText, Receipt, File, Download, Eye, ExternalLink, Trash2 } from "lucide-react";
import { FileText } from "lucide-react";
import { format } from "date-fns";
import { ru } from "date-fns/locale";
import type { BillingDoc, BillingSubTab, InvoiceRow } from "@/hooks/useDocumentsTab";

const docTypeLabels: Record<string, { label: string; icon: React.ReactNode }> = {
  invoice: { label: "Счёт", icon: <FileText className="w-4 h-4 text-blue-500" /> },
  receipt: { label: "Чек", icon: <Receipt className="w-4 h-4 text-emerald-500" /> },
  act: { label: "Акт", icon: <File className="w-4 h-4 text-amber-500" /> },
  other: { label: "Другое", icon: <File className="w-4 h-4 text-muted-foreground" /> },
};

interface BillingDocumentsSectionProps {
  billingSubTab: BillingSubTab;
  setBillingSubTab: (v: BillingSubTab) => void;
  invoices: InvoiceRow[];
  billingDocs: BillingDoc[];
  onViewDoc: (doc: BillingDoc) => void;
  onDownloadDoc: (doc: BillingDoc) => void;
  onDeleteDoc: (doc: BillingDoc) => void;
}

export function BillingDocumentsSection({ billingSubTab, setBillingSubTab, invoices, billingDocs, onViewDoc, onDownloadDoc, onDeleteDoc }: BillingDocumentsSectionProps) {
  return (
    <div>
      <Tabs value={billingSubTab} onValueChange={(v) => setBillingSubTab(v as BillingSubTab)}>
        <TabsList className="bg-muted/50 rounded-xl mb-4">
          <TabsTrigger value="contracts" className="rounded-lg text-xs gap-1.5">
            <ScrollText className="w-3.5 h-3.5" />
            Договоры
          </TabsTrigger>
          <TabsTrigger value="invoices" className="rounded-lg text-xs gap-1.5">
            <Receipt className="w-3.5 h-3.5" />
            Счета
          </TabsTrigger>
          <TabsTrigger value="closing" className="rounded-lg text-xs gap-1.5">
            <File className="w-3.5 h-3.5" />
            Закрывающие
          </TabsTrigger>
        </TabsList>

        <TabsContent value="contracts" className="mt-0">
          <div className="text-center py-12 text-muted-foreground">
            <ScrollText className="w-10 h-10 mx-auto mb-2 opacity-30" />
            <p className="text-sm font-medium">Договоры с платформой</p>
            <p className="text-xs mt-1">Здесь будут отображаться ваши договоры с Sintagma</p>
          </div>
        </TabsContent>

        <TabsContent value="invoices" className="mt-0">
          {invoices.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Receipt className="w-10 h-10 mx-auto mb-2 opacity-30" />
              <p className="text-sm">Счетов пока нет</p>
            </div>
          ) : (
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
          )}
        </TabsContent>

        <TabsContent value="closing" className="mt-0">
          {billingDocs.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <FileText className="w-10 h-10 mx-auto mb-2 opacity-30" />
              <p className="text-sm">Закрывающих документов пока нет</p>
            </div>
          ) : (
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
                      <Button variant="ghost" size="sm" title="Просмотр" onClick={() => onViewDoc(doc)}>
                        <Eye className="w-4 h-4" />
                      </Button>
                      <Button variant="ghost" size="sm" title="Скачать" onClick={() => onDownloadDoc(doc)}>
                        <Download className="w-4 h-4" />
                      </Button>
                      <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" title="Удалить" onClick={() => onDeleteDoc(doc)}>
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
