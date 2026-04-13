import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { FileText, Receipt, Search, Eye, Download, ExternalLink } from "lucide-react";
import { format } from "date-fns";
import { ru } from "date-fns/locale";
import { getSignedStorageUrl } from "@/utils/storageHelpers";
import { toast } from "@/hooks/use-toast";

interface Invoice {
  id: string;
  invoice_number: string;
  amount: number;
  status: string;
  plan: string;
  period_months: number;
  invoice_date: string;
  organization_id: string;
  org_name?: string;
}

interface BillingDoc {
  id: string;
  name: string;
  doc_type: string;
  file_url: string;
  created_at: string;
  organization_id: string;
  org_name?: string;
}

export const AdminBillingOverview = () => {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [billingDocs, setBillingDocs] = useState<BillingDoc[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    const [invoiceRes, docsRes, orgsRes] = await Promise.all([
      supabase.from("subscription_invoices").select("*").order("created_at", { ascending: false }),
      supabase.from("org_billing_documents" as any).select("*").order("created_at", { ascending: false }),
      supabase.from("organizations").select("id, name"),
    ]);

    const orgMap: Record<string, string> = {};
    (orgsRes.data || []).forEach((o: any) => { orgMap[o.id] = o.name; });

    setInvoices((invoiceRes.data || []).map((i: any) => ({ ...i, org_name: orgMap[i.organization_id] || "—" })));
    setBillingDocs((docsRes.data as any[] || []).map((d: any) => ({ ...d, org_name: orgMap[d.organization_id] || "—" })));
    setLoading(false);
  };

  const handleViewDoc = async (doc: BillingDoc) => {
    const url = await getSignedStorageUrl("billing-documents", doc.file_url);
    if (url) window.open(url, "_blank");
    else toast({ title: "Ошибка", description: "Не удалось получить ссылку", variant: "destructive" });
  };

  const filteredInvoices = invoices.filter(i =>
    !search || i.invoice_number.toLowerCase().includes(search.toLowerCase()) ||
    (i.org_name || "").toLowerCase().includes(search.toLowerCase())
  );

  const filteredDocs = billingDocs.filter(d =>
    !search || d.name.toLowerCase().includes(search.toLowerCase()) ||
    (d.org_name || "").toLowerCase().includes(search.toLowerCase())
  );

  const statusBadge = (status: string) => {
    if (status === "paid") return <Badge variant="default" className="bg-emerald-500/10 text-emerald-600 border-emerald-200">Оплачен</Badge>;
    if (status === "pending") return <Badge variant="secondary">Ожидает</Badge>;
    return <Badge variant="outline">{status}</Badge>;
  };

  if (loading) return <div className="text-center py-8 text-muted-foreground text-sm">Загрузка...</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Поиск по номеру или организации..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9 rounded-xl" />
        </div>
      </div>

      <Tabs defaultValue="invoices">
        <TabsList className="bg-muted/50 rounded-xl">
          <TabsTrigger value="invoices" className="rounded-lg text-xs gap-1.5">
            <Receipt className="w-3.5 h-3.5" />
            Счета ({filteredInvoices.length})
          </TabsTrigger>
          <TabsTrigger value="closing" className="rounded-lg text-xs gap-1.5">
            <FileText className="w-3.5 h-3.5" />
            Закрывающие ({filteredDocs.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="invoices" className="mt-4">
          {filteredInvoices.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground text-sm">Счетов не найдено</div>
          ) : (
            <div className="space-y-2">
              {filteredInvoices.map(inv => (
                <div key={inv.id} className="flex items-center justify-between p-3 rounded-lg border border-border hover:bg-muted/30 transition-colors">
                  <div className="flex items-center gap-3">
                    <Receipt className="w-4 h-4 text-blue-500" />
                    <div>
                      <div className="text-sm font-medium">Счёт {inv.invoice_number}</div>
                      <div className="text-xs text-muted-foreground">
                        {inv.org_name} · {format(new Date(inv.invoice_date), "d MMM yyyy", { locale: ru })} · {inv.amount.toLocaleString("ru-RU")} ₽
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {statusBadge(inv.status)}
                    <Button variant="ghost" size="sm" onClick={() => window.open(`/invoice/${inv.id}`, "_blank")}>
                      <ExternalLink className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="closing" className="mt-4">
          {filteredDocs.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground text-sm">Документов не найдено</div>
          ) : (
            <div className="space-y-2">
              {filteredDocs.map(doc => (
                <div key={doc.id} className="flex items-center justify-between p-3 rounded-lg border border-border hover:bg-muted/30 transition-colors">
                  <div className="flex items-center gap-3">
                    <FileText className="w-4 h-4 text-amber-500" />
                    <div>
                      <div className="text-sm font-medium">{doc.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {doc.org_name} · {format(new Date(doc.created_at), "d MMM yyyy", { locale: ru })}
                      </div>
                    </div>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => handleViewDoc(doc)}>
                    <Eye className="w-4 h-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
};
