import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FileText, Receipt, Search, Eye, ExternalLink, ScrollText, Plus } from "lucide-react";
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

interface Contract {
  id: string;
  organization_id: string;
  contract_number: string | null;
  contract_date: string | null;
  file_url: string | null;
  status: string;
  created_at: string;
  org_name?: string;
}

interface Org {
  id: string;
  name: string;
}

export const AdminBillingOverview = () => {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [billingDocs, setBillingDocs] = useState<BillingDoc[]>([]);
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [showCreateContract, setShowCreateContract] = useState(false);
  const [contractForm, setContractForm] = useState({ organization_id: "", contract_number: "", contract_date: "" });
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    const [invoiceRes, docsRes, contractsRes, orgsRes] = await Promise.all([
      supabase.from("subscription_invoices").select("*").order("created_at", { ascending: false }),
      supabase.from("org_billing_documents" as any).select("*").order("created_at", { ascending: false }),
      supabase.from("org_contracts").select("*").order("created_at", { ascending: false }),
      supabase.from("organizations").select("id, name"),
    ]);

    const orgMap: Record<string, string> = {};
    const orgList: Org[] = [];
    (orgsRes.data || []).forEach((o: any) => { orgMap[o.id] = o.name; orgList.push({ id: o.id, name: o.name }); });

    setOrgs(orgList);
    setInvoices((invoiceRes.data || []).map((i: any) => ({ ...i, org_name: orgMap[i.organization_id] || "—" })));
    setBillingDocs((docsRes.data as any[] || []).map((d: any) => ({ ...d, org_name: orgMap[d.organization_id] || "—" })));
    setContracts((contractsRes.data || []).map((c: any) => ({ ...c, org_name: orgMap[c.organization_id] || "—" })));
    setLoading(false);
  };

  const handleViewDoc = async (doc: BillingDoc) => {
    const url = await getSignedStorageUrl("billing-documents", doc.file_url);
    if (url) window.open(url, "_blank");
    else toast({ title: "Ошибка", description: "Не удалось получить ссылку", variant: "destructive" });
  };

  const handleCreateContract = async () => {
    if (!contractForm.organization_id) return;
    setSubmitting(true);
    const { error } = await supabase.from("org_contracts").insert({
      organization_id: contractForm.organization_id,
      contract_number: contractForm.contract_number || null,
      contract_date: contractForm.contract_date || null,
      status: "active",
    });
    if (error) {
      toast({ title: "Ошибка", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Договор создан" });
      setShowCreateContract(false);
      setContractForm({ organization_id: "", contract_number: "", contract_date: "" });
      loadData();
    }
    setSubmitting(false);
  };

  const matchSearch = (text: string) => !search || text.toLowerCase().includes(search.toLowerCase());

  const filteredInvoices = invoices.filter(i => matchSearch(i.invoice_number) || matchSearch(i.org_name || ""));
  const filteredDocs = billingDocs.filter(d => matchSearch(d.name) || matchSearch(d.org_name || ""));
  const filteredContracts = contracts.filter(c => matchSearch(c.contract_number || "") || matchSearch(c.org_name || ""));

  const statusBadge = (status: string) => {
    if (status === "paid") return <Badge variant="default" className="bg-emerald-500/10 text-emerald-600 border-emerald-200">Оплачен</Badge>;
    if (status === "pending") return <Badge variant="secondary">Ожидает</Badge>;
    if (status === "active") return <Badge variant="default" className="bg-blue-500/10 text-blue-600 border-blue-200">Активен</Badge>;
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

      <Tabs defaultValue="contracts">
        <TabsList className="bg-muted/50 rounded-xl">
          <TabsTrigger value="contracts" className="rounded-lg text-xs gap-1.5">
            <ScrollText className="w-3.5 h-3.5" />
            Договоры ({filteredContracts.length})
          </TabsTrigger>
          <TabsTrigger value="invoices" className="rounded-lg text-xs gap-1.5">
            <Receipt className="w-3.5 h-3.5" />
            Счета ({filteredInvoices.length})
          </TabsTrigger>
          <TabsTrigger value="closing" className="rounded-lg text-xs gap-1.5">
            <FileText className="w-3.5 h-3.5" />
            Закрывающие ({filteredDocs.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="contracts" className="mt-4">
          <div className="flex justify-end mb-3">
            <Button size="sm" className="rounded-xl gap-1.5" onClick={() => setShowCreateContract(true)}>
              <Plus className="w-3.5 h-3.5" />
              Создать договор
            </Button>
          </div>
          {filteredContracts.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground text-sm">Договоров не найдено</div>
          ) : (
            <div className="space-y-2">
              {filteredContracts.map(c => (
                <div key={c.id} className="flex items-center justify-between p-3 rounded-lg border border-border hover:bg-muted/30 transition-colors">
                  <div className="flex items-center gap-3">
                    <ScrollText className="w-4 h-4 text-primary" />
                    <div>
                      <div className="text-sm font-medium">
                        {c.contract_number ? `Договор №${c.contract_number}` : "Договор (без номера)"}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {c.org_name} {c.contract_date && `· ${format(new Date(c.contract_date), "d MMM yyyy", { locale: ru })}`}
                      </div>
                    </div>
                  </div>
                  {statusBadge(c.status)}
                </div>
              ))}
            </div>
          )}
        </TabsContent>

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

      <Dialog open={showCreateContract} onOpenChange={setShowCreateContract}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Создать договор</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Организация *</Label>
              <Select value={contractForm.organization_id} onValueChange={v => setContractForm(f => ({ ...f, organization_id: v }))}>
                <SelectTrigger><SelectValue placeholder="Выберите организацию" /></SelectTrigger>
                <SelectContent>
                  {orgs.map(o => (
                    <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Номер договора</Label>
              <Input value={contractForm.contract_number} onChange={e => setContractForm(f => ({ ...f, contract_number: e.target.value }))} placeholder="№..." />
            </div>
            <div className="space-y-2">
              <Label>Дата договора</Label>
              <Input type="date" value={contractForm.contract_date} onChange={e => setContractForm(f => ({ ...f, contract_date: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateContract(false)}>Отмена</Button>
            <Button onClick={handleCreateContract} disabled={submitting || !contractForm.organization_id}>
              {submitting ? "Создание..." : "Создать"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
