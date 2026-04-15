import React, { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FileText, Receipt, Search, Eye, ExternalLink, ScrollText, Plus, FolderOpen, Building2, FileCheck, Download, Trash2, CheckCircle2 } from "lucide-react";
import { format } from "date-fns";
import { ru } from "date-fns/locale";
import { getSignedStorageUrl } from "@/utils/storageHelpers";
import { generateActHtml, saveActDocument, type GeneratedAct } from "@/utils/generateAct";
import { toast } from "sonner";
import { generateInvoiceHtml, type InvoiceData } from "@/constants/invoiceTemplate";
import { SUBSCRIPTION_PLANS } from "@/constants/subscriptionPlans";
import { cn } from "@/lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { Calendar } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";

// Types
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
  buyer_name?: string;
  buyer_inn?: string;
  buyer_kpp?: string;
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
  inn?: string;
  kpp?: string;
  director_name?: string;
  director_position?: string;
  subscription_plan?: string;
  custom_price?: number;
  custom_discount?: number;
}

type ActiveSection = "all" | "org-contracts" | "org-invoices" | "org-closing";

const NAV_SECTIONS = [
  { value: "all" as const, label: "Все расчёты", icon: FolderOpen, group: "overview" },
  { value: "org-contracts" as const, label: "Договоры", icon: ScrollText, group: "org" },
  { value: "org-invoices" as const, label: "Счета", icon: Receipt, group: "org" },
  { value: "org-closing" as const, label: "Закрывающие", icon: FileCheck, group: "org" },
];

const SECTION_DESCRIPTIONS: Record<ActiveSection, string> = {
  all: "Договоры, счета и закрывающие документы по всем организациям",
  "org-contracts": "Договоры выбранной организации",
  "org-invoices": "Счета выбранной организации",
  "org-closing": "Акты и закрывающие документы выбранной организации",
};

export const AdminBillingOverview = () => {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [billingDocs, setBillingDocs] = useState<BillingDoc[]>([]);
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [activeSection, setActiveSection] = useState<ActiveSection>("all");
  const [selectedOrgId, setSelectedOrgId] = useState<string>("");

  // Create contract dialog
  const [showCreateContract, setShowCreateContract] = useState(false);
  const [contractForm, setContractForm] = useState({ organization_id: "", contract_number: "", contract_date: "" });
  const [submitting, setSubmitting] = useState(false);

  // Create invoice dialog
  const [showInvoiceDialog, setShowInvoiceDialog] = useState(false);
  const [generatingInvoice, setGeneratingInvoice] = useState(false);
  const [invoiceOtherPayer, setInvoiceOtherPayer] = useState(false);
  const [invoiceBuyerName, setInvoiceBuyerName] = useState("");
  const [invoiceBuyerInn, setInvoiceBuyerInn] = useState("");
  const [invoiceBuyerKpp, setInvoiceBuyerKpp] = useState("");
  const [innSearching, setInnSearching] = useState(false);
  const [pendingInvoice, setPendingInvoice] = useState<{ html: string; insertData: any; invoiceNum: string; amount: number; plan: string } | null>(null);

  // Create act dialog
  const [showActDialog, setShowActDialog] = useState(false);
  const [actDate, setActDate] = useState<Date>(new Date());
  const [actBasis, setActBasis] = useState("");
  const [actAmount, setActAmount] = useState("");
  const [actSubmitting, setActSubmitting] = useState(false);
  const [actOtherCustomer, setActOtherCustomer] = useState(false);
  const [actCustomerName, setActCustomerName] = useState("");
  const [actCustomerInn, setActCustomerInn] = useState("");
  const [actCustomerKpp, setActCustomerKpp] = useState("");
  const [actCustomerDirector, setActCustomerDirector] = useState("");
  const [actCustomerPosition, setActCustomerPosition] = useState("");
  const [actInnSearching, setActInnSearching] = useState(false);
  const [pendingAct, setPendingAct] = useState<GeneratedAct | null>(null);

  // Invoice selection & delete
  const [selectedInvoiceIds, setSelectedInvoiceIds] = useState<Set<string>>(new Set());
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    setLoading(true);
    const [invoiceRes, docsRes, contractsRes, orgsRes] = await Promise.all([
      supabase.from("subscription_invoices").select("*").order("created_at", { ascending: false }),
      supabase.from("org_billing_documents" as any).select("*").order("created_at", { ascending: false }),
      supabase.from("org_contracts").select("*").order("created_at", { ascending: false }),
      supabase.from("organizations").select("id, name, inn, kpp, director_name, director_position, subscription_plan, custom_price, custom_discount"),
    ]);

    const orgMap: Record<string, string> = {};
    const orgList: Org[] = [];
    (orgsRes.data || []).forEach((o: any) => {
      orgMap[o.id] = o.name;
      orgList.push(o);
    });

    setOrgs(orgList);
    setInvoices((invoiceRes.data || []).map((i: any) => ({ ...i, org_name: orgMap[i.organization_id] || "—" })));
    setBillingDocs((docsRes.data as any[] || []).map((d: any) => ({ ...d, org_name: orgMap[d.organization_id] || "—" })));
    setContracts((contractsRes.data || []).map((c: any) => ({ ...c, org_name: orgMap[c.organization_id] || "—" })));
    setLoading(false);
  };

  const selectedOrg = orgs.find(o => o.id === selectedOrgId);

  // Filtered data for selected org
  const orgContracts = contracts.filter(c => c.organization_id === selectedOrgId);
  const orgInvoices = invoices.filter(i => i.organization_id === selectedOrgId);
  const orgClosingDocs = billingDocs.filter(d => d.organization_id === selectedOrgId);

  // All data search
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

  const handleViewDoc = async (doc: BillingDoc) => {
    const url = await getSignedStorageUrl("billing-documents", doc.file_url);
    if (url) {
      try {
        const res = await fetch(url);
        const text = await res.text();
        const blob = new Blob([text], { type: "text/html;charset=utf-8" });
        window.open(URL.createObjectURL(blob), "_blank");
      } catch {
        window.open(url, "_blank");
      }
    } else {
      toast.error("Ошибка", { description: "Не удалось получить ссылку" });
    }
  };

  const handleDeleteDoc = async (doc: BillingDoc) => {
    if (!confirm("Удалить документ?")) return;
    try {
      await supabase.storage.from("billing-documents").remove([doc.file_url]);
      await supabase.from("org_billing_documents").delete().eq("id", doc.id);
      setBillingDocs(prev => prev.filter(d => d.id !== doc.id));
      toast.success("Документ удалён");
    } catch {
      toast.error("Ошибка удаления");
    }
  };

  const handleCreateContract = async () => {
    const orgId = activeSection === "all" ? contractForm.organization_id : selectedOrgId;
    if (!orgId) return;
    setSubmitting(true);
    const { error } = await supabase.from("org_contracts").insert({
      organization_id: orgId,
      contract_number: contractForm.contract_number || null,
      contract_date: contractForm.contract_date || null,
      status: "active",
    });
    if (error) {
      toast.error("Ошибка", { description: error.message });
    } else {
      toast.success("Договор создан");
      setShowCreateContract(false);
      setContractForm({ organization_id: "", contract_number: "", contract_date: "" });
      loadData();
    }
    setSubmitting(false);
  };

  const handleGenerateInvoice = async () => {
    if (!selectedOrgId) return;
    setGeneratingInvoice(true);
    try {
      const org = selectedOrg;
      const PLAN_PRICES: Record<string, number> = { free: 0, start: 1990, standard: 4990, professional: 9990, maximum: 19990 };
      const plan = org?.subscription_plan || "start";
      const basePrice = org?.custom_price ?? PLAN_PRICES[plan] ?? 1990;
      const discount = org?.custom_discount ?? 0;
      const amount = Math.max(0, basePrice - discount);

      const year = new Date().getFullYear();
      const { count } = await supabase
        .from("subscription_invoices")
        .select("*", { count: "exact", head: true })
        .eq("organization_id", selectedOrgId);

      const invoiceNum = `СЧ-${year}/${String((count || 0) + 1).padStart(4, "0")}`;

      const insertData: any = {
        organization_id: selectedOrgId,
        invoice_number: invoiceNum,
        plan,
        amount,
        period_months: 1,
      };

      if (invoiceOtherPayer && invoiceBuyerName) {
        insertData.buyer_name = invoiceBuyerName;
        insertData.buyer_inn = invoiceBuyerInn || null;
        insertData.buyer_kpp = invoiceBuyerKpp || null;
      }

      // Generate HTML preview without saving
      const planInfo = SUBSCRIPTION_PLANS[plan as keyof typeof SUBSCRIPTION_PLANS];
      const invoiceData: InvoiceData = {
        invoiceNumber: invoiceNum,
        invoiceDate: new Date().toLocaleDateString("ru-RU"),
        buyerName: insertData.buyer_name || org?.name || "Организация",
        buyerInn: insertData.buyer_inn || org?.inn,
        buyerKpp: insertData.buyer_kpp || org?.kpp,
        planName: planInfo?.name || plan,
        periodMonths: 1,
        amount,
      };
      const html = generateInvoiceHtml(invoiceData);

      // Show preview
      const printWindow = window.open('', '_blank');
      if (printWindow) {
        printWindow.document.write(html);
        printWindow.document.close();
      }

      setPendingInvoice({ html, insertData, invoiceNum, amount, plan });
      toast.success("Счёт сформирован", { description: "Скачайте или распечатайте для сохранения" });
      setShowInvoiceDialog(false);
      setInvoiceOtherPayer(false);
      setInvoiceBuyerName("");
      setInvoiceBuyerInn("");
      setInvoiceBuyerKpp("");
    } catch (e: any) {
      toast.error("Ошибка", { description: e.message });
    }
    setGeneratingInvoice(false);
  };

  const handleSavePendingInvoice = async (action: 'download' | 'print') => {
    if (!pendingInvoice) return;
    try {
      const { error } = await supabase.from("subscription_invoices").insert(pendingInvoice.insertData);
      if (error) throw error;
      loadData();
      if (action === 'download') {
        const blob = new Blob([pendingInvoice.html], { type: 'application/msword' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url; link.download = `Счёт_${pendingInvoice.invoiceNum}.doc`;
        document.body.appendChild(link); link.click(); document.body.removeChild(link);
        URL.revokeObjectURL(url);
        toast.success("Счёт скачан и сохранён");
      } else {
        const printWindow = window.open('', '_blank');
        if (printWindow) {
          printWindow.document.write(pendingInvoice.html);
          printWindow.document.close();
          printWindow.focus();
          setTimeout(() => printWindow.print(), 500);
        }
        toast.success("Счёт отправлен на печать и сохранён");
      }
    } catch (e: any) {
      toast.error("Ошибка сохранения", { description: e.message });
    }
    setPendingInvoice(null);
  };

  const handleSearchByInn = async (inn: string) => {
    if (inn.length < 10) return;
    setInnSearching(true);
    try {
      const { data } = await supabase.from("organizations").select("name, inn, kpp").eq("inn", inn).maybeSingle();
      if (data) {
        setInvoiceBuyerName(data.name || "");
        setInvoiceBuyerInn(data.inn || inn);
        setInvoiceBuyerKpp(data.kpp || "");
        toast.success("Найдено", { description: data.name });
      } else {
        const { data: dd } = await supabase.functions.invoke("dadata-company", { body: { inn } });
        if (dd?.success) {
          setInvoiceBuyerName(dd.company.shortName || dd.company.name || "");
          setInvoiceBuyerInn(dd.company.inn || inn);
          setInvoiceBuyerKpp(dd.company.kpp || "");
          toast.success("Найдено (DaData)");
        } else {
          toast.info("Не найдено", { description: "Введите вручную" });
        }
      }
    } catch { /* ignore */ }
    setInnSearching(false);
  };

  const handleGenerateAct = async () => {
    if (!selectedOrgId || !actBasis || !actAmount) return;
    setActSubmitting(true);
    const org = selectedOrg;
    const act = await generateActHtml({
      organizationId: selectedOrgId,
      orgName: actOtherCustomer && actCustomerName ? actCustomerName : (org?.name || ""),
      orgInn: actOtherCustomer && actCustomerInn ? actCustomerInn : (org?.inn || null),
      directorName: actOtherCustomer && actCustomerDirector ? actCustomerDirector : (org?.director_name || null),
      directorPosition: actOtherCustomer && actCustomerPosition ? actCustomerPosition : (org?.director_position || null),
      actDate,
      basis: actBasis,
      amount: parseFloat(actAmount),
    });
    if (act) {
      setPendingAct(act);
      // Open preview without saving
      const printWindow = window.open('', '_blank');
      if (printWindow) {
        printWindow.document.write(act.html);
        printWindow.document.close();
      }
      toast.success("Акт сформирован", { description: "Скачайте или распечатайте для сохранения" });
      setShowActDialog(false);
      setActBasis(""); setActAmount(""); setActDate(new Date());
      setActOtherCustomer(false); setActCustomerName(""); setActCustomerInn("");
      setActCustomerKpp(""); setActCustomerDirector(""); setActCustomerPosition("");
    } else {
      toast.error("Ошибка генерации акта");
    }
    setActSubmitting(false);
  };

  const handleSavePendingAct = async (action: 'download' | 'print') => {
    if (!pendingAct) return;
    // Save to DB
    await saveActDocument(pendingAct);
    loadData();
    if (action === 'download') {
      const docContent = `<!DOCTYPE html><html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'><head><meta charset="utf-8"></head><body>${pendingAct.html.replace(/<html[^>]*>|<\/html>|<head>[\s\S]*?<\/head>|<body[^>]*>|<\/body>|<!DOCTYPE[^>]*>/gi, '')}</body></html>`;
      const blob = new Blob([docContent], { type: 'application/msword' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${pendingAct.docName}.doc`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      toast.success("Акт скачан и сохранён");
    } else {
      const printWindow = window.open('', '_blank');
      if (printWindow) {
        printWindow.document.write(pendingAct.html);
        printWindow.document.close();
        printWindow.focus();
        setTimeout(() => printWindow.print(), 500);
      }
      toast.success("Акт отправлен на печать и сохранён");
    }
    setPendingAct(null);
  };

  const handleActSearchByInn = async (inn: string) => {
    if (inn.length < 10) return;
    setActInnSearching(true);
    try {
      const { data } = await supabase.from("organizations").select("name, inn, kpp, director_name, director_position").eq("inn", inn).maybeSingle();
      if (data) {
        setActCustomerName(data.name || "");
        setActCustomerInn(data.inn || inn);
        setActCustomerKpp(data.kpp || "");
        setActCustomerDirector(data.director_name || "");
        setActCustomerPosition((data as any).director_position || "Руководитель");
        toast.success("Найдено", { description: data.name });
      } else {
        const { data: dd } = await supabase.functions.invoke("dadata-company", { body: { inn } });
        if (dd?.success) {
          setActCustomerName(dd.company.shortName || dd.company.name || "");
          setActCustomerInn(dd.company.inn || inn);
          setActCustomerKpp(dd.company.kpp || "");
          setActCustomerDirector(dd.company.management || "");
          setActCustomerPosition(dd.company.managementPosition || "Руководитель");
          toast.success("Найдено (DaData)");
        } else {
          toast.info("Не найдено");
        }
      }
    } catch { /* ignore */ }
    setActInnSearching(false);
  };

  const toggleInvoiceSelection = (id: string) => {
    setSelectedInvoiceIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const handleDeleteSelectedInvoices = async () => {
    if (selectedInvoiceIds.size === 0) return;
    setDeleting(true);
    try {
      const ids = Array.from(selectedInvoiceIds);
      for (const id of ids) {
        const { error } = await supabase.from("subscription_invoices").delete().eq("id", id);
        if (error) throw error;
      }
      toast.success(`Удалено счетов: ${ids.length}`);
      setSelectedInvoiceIds(new Set());
      setShowDeleteConfirm(false);
      loadData();
    } catch (e: any) {
      toast.error("Ошибка удаления", { description: e.message });
    }
    setDeleting(false);
  };

  const handleMarkPaid = async (inv: Invoice) => {
    try {
      // 1. Update invoice status
      const { error: invErr } = await supabase
        .from("subscription_invoices")
        .update({ status: "paid" } as any)
        .eq("id", inv.id);
      if (invErr) throw invErr;

      // 2. Get current paid_until
      const { data: orgData, error: orgErr } = await supabase
        .from("organizations")
        .select("paid_until")
        .eq("id", inv.organization_id)
        .single();
      if (orgErr) throw orgErr;

      const now = new Date();
      const currentPaidUntil = orgData?.paid_until ? new Date(orgData.paid_until) : null;
      const base = currentPaidUntil && currentPaidUntil > now ? currentPaidUntil : now;
      const newPaidUntil = new Date(base);
      newPaidUntil.setMonth(newPaidUntil.getMonth() + (inv.period_months || 1));

      // 3. Update organization paid_until
      const { error: updErr } = await supabase
        .from("organizations")
        .update({ paid_until: newPaidUntil.toISOString() } as any)
        .eq("id", inv.organization_id);
      if (updErr) throw updErr;

      toast.success("Оплата подтверждена", { description: `Тариф продлён до ${format(newPaidUntil, "d MMMM yyyy", { locale: ru })}` });
      loadData();
    } catch (e: any) {
      toast.error("Ошибка", { description: e.message });
    }
  };

  if (loading) return <div className="text-center py-8 text-muted-foreground text-sm">Загрузка...</div>;

  const activeNavItem = NAV_SECTIONS.find(n => n.value === activeSection) || NAV_SECTIONS[0];

  return (
    <div className="space-y-0">
      <div className="flex flex-col lg:flex-row gap-0 min-h-[600px]">
        {/* Left sidebar navigation */}
        <nav className="lg:w-56 xl:w-64 shrink-0 border-b lg:border-b-0 lg:border-r border-border bg-card lg:rounded-l-2xl">
          {/* Mobile: horizontal */}
          <div className="lg:hidden flex overflow-x-auto gap-1 p-2">
            {NAV_SECTIONS.map(item => {
              const Icon = item.icon;
              const isActive = activeSection === item.value;
              const disabled = item.group === "org" && !selectedOrgId;
              return (
                <button
                  key={item.value}
                  onClick={() => !disabled && setActiveSection(item.value)}
                  disabled={disabled}
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg whitespace-nowrap transition-colors",
                    isActive ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground hover:bg-muted/50",
                    disabled && "opacity-40 cursor-not-allowed"
                  )}
                >
                  <Icon className="w-3.5 h-3.5" />
                  {item.label}
                </button>
              );
            })}
          </div>

          {/* Desktop: vertical */}
          <div className="hidden lg:flex flex-col py-3 bg-gradient-to-b from-card to-muted/20">
            {/* Overview group */}
            <div className="px-4 pb-1">
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground/60 font-semibold">Обзор</span>
            </div>
            <button
              onClick={() => setActiveSection("all")}
              className={cn(
                "flex items-center gap-2.5 px-4 py-2.5 text-sm font-medium text-left transition-all duration-200 group",
                activeSection === "all"
                  ? "bg-primary/15 text-primary border-r-2 border-primary"
                  : "text-muted-foreground hover:text-primary hover:bg-primary/10 hover:translate-x-0.5"
              )}
            >
              <FolderOpen className={cn("w-4 h-4 shrink-0 transition-colors duration-200", activeSection === "all" ? "text-primary" : "group-hover:text-primary")} />
              Все расчёты
            </button>

            {/* Org group */}
            <div className="px-4 pt-3 pb-1">
              <div className="h-px bg-border/60" />
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground/60 font-semibold mt-2 block">Организация</span>
            </div>

            {/* Org selector */}
            <div className="px-3 pb-2">
              <Select value={selectedOrgId} onValueChange={v => { setSelectedOrgId(v); setActiveSection("org-contracts"); }}>
                <SelectTrigger className="h-8 text-xs rounded-lg">
                  <SelectValue placeholder="Выберите..." />
                </SelectTrigger>
                <SelectContent className="max-h-60">
                  {orgs.map(o => (
                    <SelectItem key={o.id} value={o.id} className="text-xs">{o.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Org nav items */}
            {NAV_SECTIONS.filter(n => n.group === "org").map(item => {
              const Icon = item.icon;
              const isActive = activeSection === item.value;
              const disabled = !selectedOrgId;
              const count = item.value === "org-contracts" ? orgContracts.length
                : item.value === "org-invoices" ? orgInvoices.length
                : orgClosingDocs.length;
              return (
                <button
                  key={item.value}
                  onClick={() => !disabled && setActiveSection(item.value)}
                  disabled={disabled}
                  className={cn(
                    "flex items-center gap-2.5 px-4 py-2.5 text-sm font-medium text-left transition-all duration-200 group",
                    isActive
                      ? "bg-primary/15 text-primary border-r-2 border-primary"
                      : "text-muted-foreground hover:text-primary hover:bg-primary/10 hover:translate-x-0.5",
                    disabled && "opacity-40 cursor-not-allowed hover:bg-transparent hover:text-muted-foreground hover:translate-x-0"
                  )}
                >
                  <Icon className={cn("w-4 h-4 shrink-0 transition-colors duration-200", isActive ? "text-primary" : "group-hover:text-primary")} />
                  {item.label}
                  {selectedOrgId && <span className="ml-auto text-xs text-muted-foreground">{count}</span>}
                </button>
              );
            })}
          </div>
        </nav>

        {/* Right content panel */}
        <div className="flex-1 min-w-0 bg-card lg:rounded-r-2xl border-l-0">
          {/* Header */}
          <div className="flex items-center justify-between px-4 lg:px-6 py-4 border-b border-border">
            <div>
              <h2 className="text-base font-semibold flex items-center gap-2">
                <activeNavItem.icon className="w-4 h-4 text-primary" />
                {activeNavItem.label}
                {selectedOrgId && activeSection !== "all" && selectedOrg && (
                  <span className="text-xs font-normal text-muted-foreground ml-1">— {selectedOrg.name}</span>
                )}
              </h2>
              <p className="text-xs text-muted-foreground mt-0.5">{SECTION_DESCRIPTIONS[activeSection]}</p>
            </div>
            <div className="flex items-center gap-2">
              {activeSection === "org-contracts" && selectedOrgId && (
                <Button variant="outline" size="sm" className="rounded-xl gap-1.5" onClick={() => { setContractForm(f => ({ ...f, organization_id: selectedOrgId })); setShowCreateContract(true); }}>
                  <Plus className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Создать договор</span>
                </Button>
              )}
              {activeSection === "org-invoices" && selectedOrgId && (
                <Button variant="outline" size="sm" className="rounded-xl gap-1.5" onClick={() => setShowInvoiceDialog(true)}>
                  <Receipt className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Сформировать счёт</span>
                </Button>
              )}
              {activeSection === "org-closing" && selectedOrgId && (
                <Button variant="outline" size="sm" className="rounded-xl gap-1.5" onClick={() => setShowActDialog(true)}>
                  <FileText className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Сформировать акт</span>
                </Button>
              )}
            </div>
          </div>

          {/* Content */}
          <div className="p-4 lg:p-6">
            {activeSection === "all" && <AllBillingContent
              search={search} setSearch={setSearch}
              filteredContracts={filteredContracts} filteredInvoices={filteredInvoices} filteredDocs={filteredDocs}
              statusBadge={statusBadge} handleViewDoc={handleViewDoc}
              onCreateContract={() => setShowCreateContract(true)}
              orgs={orgs}
              onMarkPaid={handleMarkPaid}
              selectedInvoiceIds={selectedInvoiceIds}
              toggleInvoiceSelection={toggleInvoiceSelection}
              onDeleteSelected={() => setShowDeleteConfirm(true)}
            />}
            {activeSection === "org-contracts" && (
              selectedOrgId ? (
                <OrgContractsList contracts={orgContracts} statusBadge={statusBadge} />
              ) : <EmptyOrgPrompt />
            )}
            {activeSection === "org-invoices" && (
              selectedOrgId ? (
                <OrgInvoicesList invoices={orgInvoices} statusBadge={statusBadge} onMarkPaid={handleMarkPaid} selectedInvoiceIds={selectedInvoiceIds} toggleInvoiceSelection={toggleInvoiceSelection} onDeleteSelected={() => setShowDeleteConfirm(true)} />
              ) : <EmptyOrgPrompt />
            )}
            {activeSection === "org-closing" && (
              selectedOrgId ? (
                <OrgClosingList docs={orgClosingDocs} handleViewDoc={handleViewDoc} handleDeleteDoc={handleDeleteDoc} />
              ) : <EmptyOrgPrompt />
            )}
          </div>
        </div>
      </div>

      {/* Create contract dialog */}
      <Dialog open={showCreateContract} onOpenChange={setShowCreateContract}>
        <DialogContent>
          <DialogHeader><DialogTitle>Создать договор</DialogTitle></DialogHeader>
          <div className="space-y-4">
            {activeSection === "all" && (
              <div className="space-y-2">
                <Label>Организация *</Label>
                <Select value={contractForm.organization_id} onValueChange={v => setContractForm(f => ({ ...f, organization_id: v }))}>
                  <SelectTrigger><SelectValue placeholder="Выберите организацию" /></SelectTrigger>
                  <SelectContent>{orgs.map(o => <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            )}
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
            <Button onClick={handleCreateContract} disabled={submitting || (activeSection === "all" && !contractForm.organization_id)}>
              {submitting ? "Создание..." : "Создать"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create invoice dialog */}
      <Dialog open={showInvoiceDialog} onOpenChange={setShowInvoiceDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>Сформировать счёт</DialogTitle></DialogHeader>
          <div className="space-y-4">
            {selectedOrg && (
              <div className="p-3 rounded-lg bg-muted/50 text-sm">
                <div className="font-medium">{selectedOrg.name}</div>
                <div className="text-xs text-muted-foreground mt-1">
                  Тариф: {selectedOrg.subscription_plan || "start"} · Сумма: {(() => {
                    const PLAN_PRICES: Record<string, number> = { free: 0, start: 1990, standard: 4990, professional: 9990, maximum: 19990 };
                    const base = selectedOrg.custom_price ?? PLAN_PRICES[selectedOrg.subscription_plan || "start"] ?? 1990;
                    const disc = selectedOrg.custom_discount ?? 0;
                    return Math.max(0, base - disc).toLocaleString("ru-RU");
                  })()} ₽
                </div>
              </div>
            )}
            <div className="flex items-center gap-2">
              <Checkbox id="otherPayer" checked={invoiceOtherPayer} onCheckedChange={v => setInvoiceOtherPayer(!!v)} />
              <Label htmlFor="otherPayer" className="text-sm">Другой плательщик</Label>
            </div>
            {invoiceOtherPayer && (
              <div className="space-y-3 p-3 rounded-lg border">
                <div className="space-y-1">
                  <Label className="text-xs">ИНН</Label>
                  <div className="flex gap-2">
                    <Input value={invoiceBuyerInn} onChange={e => setInvoiceBuyerInn(e.target.value)} placeholder="ИНН" className="text-sm" />
                    <Button size="sm" variant="outline" onClick={() => handleSearchByInn(invoiceBuyerInn)} disabled={innSearching}>
                      {innSearching ? "..." : <Search className="w-3.5 h-3.5" />}
                    </Button>
                  </div>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Название</Label>
                  <Input value={invoiceBuyerName} onChange={e => setInvoiceBuyerName(e.target.value)} className="text-sm" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">КПП</Label>
                  <Input value={invoiceBuyerKpp} onChange={e => setInvoiceBuyerKpp(e.target.value)} className="text-sm" />
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowInvoiceDialog(false)}>Отмена</Button>
            <Button onClick={handleGenerateInvoice} disabled={generatingInvoice}>
              {generatingInvoice ? "Формирование..." : "Сформировать"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create act dialog */}
      <Dialog open={showActDialog} onOpenChange={setShowActDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Сформировать акт</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1">
              <Label>Дата акта</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-full justify-start text-left text-sm">
                    <Calendar className="w-4 h-4 mr-2" />
                    {format(actDate, "d MMMM yyyy", { locale: ru })}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0"><CalendarComponent mode="single" selected={actDate} onSelect={d => d && setActDate(d)} /></PopoverContent>
              </Popover>
            </div>
            <div className="space-y-1">
              <Label>Основание (предмет)</Label>
              <Input value={actBasis} onChange={e => setActBasis(e.target.value)} placeholder="Оказание образовательных услуг..." />
            </div>
            <div className="space-y-1">
              <Label>Сумма (₽)</Label>
              <Input type="number" value={actAmount} onChange={e => setActAmount(e.target.value)} placeholder="0" />
            </div>
            <div className="flex items-center gap-2">
              <Checkbox id="actOther" checked={actOtherCustomer} onCheckedChange={v => setActOtherCustomer(!!v)} />
              <Label htmlFor="actOther" className="text-sm">Другой заказчик</Label>
            </div>
            {actOtherCustomer && (
              <div className="space-y-3 p-3 rounded-lg border">
                <div className="space-y-1">
                  <Label className="text-xs">ИНН</Label>
                  <div className="flex gap-2">
                    <Input value={actCustomerInn} onChange={e => setActCustomerInn(e.target.value)} placeholder="ИНН" className="text-sm" />
                    <Button size="sm" variant="outline" onClick={() => handleActSearchByInn(actCustomerInn)} disabled={actInnSearching}>
                      {actInnSearching ? "..." : <Search className="w-3.5 h-3.5" />}
                    </Button>
                  </div>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Название</Label>
                  <Input value={actCustomerName} onChange={e => setActCustomerName(e.target.value)} className="text-sm" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">КПП</Label>
                  <Input value={actCustomerKpp} onChange={e => setActCustomerKpp(e.target.value)} className="text-sm" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Руководитель</Label>
                  <Input value={actCustomerDirector} onChange={e => setActCustomerDirector(e.target.value)} className="text-sm" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Должность</Label>
                  <Input value={actCustomerPosition} onChange={e => setActCustomerPosition(e.target.value)} className="text-sm" />
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowActDialog(false)}>Отмена</Button>
            <Button onClick={handleGenerateAct} disabled={actSubmitting || !actBasis || !actAmount}>
              {actSubmitting ? "Создание..." : "Сформировать"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Pending Act Actions */}
      <Dialog open={!!pendingAct} onOpenChange={() => setPendingAct(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Акт сформирован</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Акт «{pendingAct?.docName}» готов. Выберите действие для сохранения:
          </p>
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button variant="outline" onClick={() => setPendingAct(null)}>Закрыть без сохранения</Button>
            <Button variant="outline" className="gap-1.5" onClick={() => handleSavePendingAct('print')}>
              <Eye className="w-4 h-4" />Печать
            </Button>
            <Button className="gap-1.5" onClick={() => handleSavePendingAct('download')}>
              <Download className="w-4 h-4" />Скачать
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Pending Invoice Actions */}
      <Dialog open={!!pendingInvoice} onOpenChange={() => setPendingInvoice(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Счёт сформирован</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Счёт «{pendingInvoice?.invoiceNum}» на {pendingInvoice?.amount?.toLocaleString("ru-RU")} ₽ готов. Выберите действие для сохранения:
          </p>
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button variant="outline" onClick={() => setPendingInvoice(null)}>Закрыть без сохранения</Button>
            <Button variant="outline" className="gap-1.5" onClick={() => handleSavePendingInvoice('print')}>
              <Eye className="w-4 h-4" />Печать
            </Button>
            <Button className="gap-1.5" onClick={() => handleSavePendingInvoice('download')}>
              <Download className="w-4 h-4" />Скачать
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete invoices confirmation */}
      <Dialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <DialogContent>
          <DialogHeader><DialogTitle>Удалить счета?</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">
            Вы уверены, что хотите удалить выбранные счета ({selectedInvoiceIds.size} шт.)? Это действие необратимо.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDeleteConfirm(false)}>Отмена</Button>
            <Button variant="destructive" onClick={handleDeleteSelectedInvoices} disabled={deleting}>
              {deleting ? "Удаление..." : `Удалить (${selectedInvoiceIds.size})`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

// ---- Sub-components ----

function EmptyOrgPrompt() {
  return <div className="text-center py-12 text-muted-foreground text-sm">Выберите организацию в боковом меню</div>;
}

function AllBillingContent({ search, setSearch, filteredContracts, filteredInvoices, filteredDocs, statusBadge, handleViewDoc, onCreateContract, orgs, onMarkPaid }: any) {
  return (
    <div className="space-y-4">
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input placeholder="Поиск по номеру или организации..." value={search} onChange={(e: any) => setSearch(e.target.value)} className="pl-9 rounded-xl" />
      </div>

      <Tabs defaultValue="contracts">
        <TabsList className="bg-muted/50 rounded-xl">
          <TabsTrigger value="contracts" className="rounded-lg text-xs gap-1.5"><ScrollText className="w-3.5 h-3.5" />Договоры ({filteredContracts.length})</TabsTrigger>
          <TabsTrigger value="invoices" className="rounded-lg text-xs gap-1.5"><Receipt className="w-3.5 h-3.5" />Счета ({filteredInvoices.length})</TabsTrigger>
          <TabsTrigger value="closing" className="rounded-lg text-xs gap-1.5"><FileText className="w-3.5 h-3.5" />Закрывающие ({filteredDocs.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="contracts" className="mt-4">
          <div className="flex justify-end mb-3">
            <Button size="sm" className="rounded-xl gap-1.5" onClick={onCreateContract}><Plus className="w-3.5 h-3.5" />Создать договор</Button>
          </div>
          {filteredContracts.length === 0 ? <EmptyState text="Договоров не найдено" /> : (
            <div className="space-y-2">
              {filteredContracts.map((c: Contract) => (
                <div key={c.id} className="flex items-center justify-between p-3 rounded-lg border border-border hover:bg-muted/30 transition-colors">
                  <div className="flex items-center gap-3">
                    <ScrollText className="w-4 h-4 text-primary" />
                    <div>
                      <div className="text-sm font-medium">{c.contract_number ? `Договор №${c.contract_number}` : "Договор (без номера)"}</div>
                      <div className="text-xs text-muted-foreground">{c.org_name} {c.contract_date && `· ${format(new Date(c.contract_date), "d MMM yyyy", { locale: ru })}`}</div>
                    </div>
                  </div>
                  {statusBadge(c.status)}
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="invoices" className="mt-4">
          {filteredInvoices.length === 0 ? <EmptyState text="Счетов не найдено" /> : (
            <div className="space-y-2">
              {filteredInvoices.map((inv: Invoice) => (
                <div key={inv.id} className="flex items-center justify-between p-3 rounded-lg border border-border hover:bg-muted/30 transition-colors">
                  <div className="flex items-center gap-3">
                    <Receipt className="w-4 h-4 text-blue-500" />
                    <div>
                      <div className="text-sm font-medium">Счёт {inv.invoice_number}</div>
                      <div className="text-xs text-muted-foreground">{inv.org_name} · {format(new Date(inv.invoice_date), "d MMM yyyy", { locale: ru })} · {inv.amount.toLocaleString("ru-RU")} ₽</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {inv.status === "pending" && onMarkPaid && (
                      <Button variant="ghost" size="sm" className="text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50" onClick={() => onMarkPaid(inv)} title="Отметить как оплаченный">
                        <CheckCircle2 className="w-4 h-4" />
                      </Button>
                    )}
                    {statusBadge(inv.status)}
                    <Button variant="ghost" size="sm" onClick={() => window.open(`/invoice/${inv.id}`, "_blank")}><ExternalLink className="w-4 h-4" /></Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="closing" className="mt-4">
          {filteredDocs.length === 0 ? <EmptyState text="Документов не найдено" /> : (
            <div className="space-y-2">
              {filteredDocs.map((doc: BillingDoc) => (
                <div key={doc.id} className="flex items-center justify-between p-3 rounded-lg border border-border hover:bg-muted/30 transition-colors">
                  <div className="flex items-center gap-3">
                    <FileText className="w-4 h-4 text-amber-500" />
                    <div>
                      <div className="text-sm font-medium">{doc.name}</div>
                      <div className="text-xs text-muted-foreground">{doc.org_name} · {format(new Date(doc.created_at), "d MMM yyyy", { locale: ru })}</div>
                    </div>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => handleViewDoc(doc)}><Eye className="w-4 h-4" /></Button>
                </div>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

function OrgContractsList({ contracts, statusBadge }: { contracts: Contract[]; statusBadge: (s: string) => React.ReactNode }) {
  if (contracts.length === 0) return <EmptyState text="Нет договоров" />;
  return (
    <div className="space-y-2">
      {contracts.map(c => (
        <div key={c.id} className="flex items-center justify-between p-3 rounded-lg border border-border hover:bg-muted/30 transition-colors">
          <div className="flex items-center gap-3">
            <ScrollText className="w-4 h-4 text-primary" />
            <div>
              <div className="text-sm font-medium">{c.contract_number ? `Договор №${c.contract_number}` : "Договор (без номера)"}</div>
              <div className="text-xs text-muted-foreground">{c.contract_date && format(new Date(c.contract_date), "d MMM yyyy", { locale: ru })}</div>
            </div>
          </div>
          {statusBadge(c.status)}
        </div>
      ))}
    </div>
  );
}

function OrgInvoicesList({ invoices, statusBadge, onMarkPaid }: { invoices: Invoice[]; statusBadge: (s: string) => React.ReactNode; onMarkPaid?: (inv: Invoice) => void }) {
  if (invoices.length === 0) return <EmptyState text="Нет счетов" />;
  return (
    <div className="space-y-2">
      {invoices.map(inv => (
        <div key={inv.id} className="flex items-center justify-between p-3 rounded-lg border border-border hover:bg-muted/30 transition-colors">
          <div className="flex items-center gap-3">
            <Receipt className="w-4 h-4 text-blue-500" />
            <div>
              <div className="text-sm font-medium">Счёт {inv.invoice_number}</div>
              <div className="text-xs text-muted-foreground">{format(new Date(inv.invoice_date), "d MMM yyyy", { locale: ru })} · {inv.amount.toLocaleString("ru-RU")} ₽</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {inv.status === "pending" && onMarkPaid && (
              <Button variant="ghost" size="sm" className="text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50" onClick={() => onMarkPaid(inv)} title="Отметить как оплаченный">
                <CheckCircle2 className="w-4 h-4" />
              </Button>
            )}
            {statusBadge(inv.status)}
            <Button variant="ghost" size="sm" onClick={() => window.open(`/invoice/${inv.id}`, "_blank")}><ExternalLink className="w-4 h-4" /></Button>
          </div>
        </div>
      ))}
    </div>
  );
}

function OrgClosingList({ docs, handleViewDoc, handleDeleteDoc }: { docs: BillingDoc[]; handleViewDoc: (d: BillingDoc) => void; handleDeleteDoc: (d: BillingDoc) => void }) {
  if (docs.length === 0) return <EmptyState text="Нет закрывающих документов" />;
  return (
    <div className="space-y-2">
      {docs.map(doc => (
        <div key={doc.id} className="flex items-center justify-between p-3 rounded-lg border border-border hover:bg-muted/30 transition-colors">
          <div className="flex items-center gap-3">
            <FileText className="w-4 h-4 text-amber-500" />
            <div>
              <div className="text-sm font-medium">{doc.name}</div>
              <div className="text-xs text-muted-foreground">{format(new Date(doc.created_at), "d MMM yyyy", { locale: ru })}</div>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="sm" onClick={() => handleViewDoc(doc)}><Eye className="w-4 h-4" /></Button>
            <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={() => handleDeleteDoc(doc)}><Trash2 className="w-4 h-4" /></Button>
          </div>
        </div>
      ))}
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return <div className="text-center py-8 text-muted-foreground text-sm">{text}</div>;
}
