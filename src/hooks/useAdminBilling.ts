import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { format } from "date-fns";
import { ru } from "date-fns/locale";
import { getSignedStorageUrl } from "@/utils/storageHelpers";
import { generateActHtml, saveActDocument, type GeneratedAct } from "@/utils/generateAct";
import { generateInvoiceHtml, type InvoiceData } from "@/constants/invoiceTemplate";
import { SUBSCRIPTION_PLANS } from "@/constants/subscriptionPlans";

export interface Invoice {
  id: string; invoice_number: string; amount: number; status: string;
  plan: string; period_months: number; invoice_date: string;
  organization_id: string; org_name?: string;
  buyer_name?: string; buyer_inn?: string; buyer_kpp?: string;
}

export interface BillingDoc {
  id: string; name: string; doc_type: string; file_url: string;
  created_at: string; organization_id: string; org_name?: string;
}

export interface Contract {
  id: string; organization_id: string; contract_number: string | null;
  contract_date: string | null; file_url: string | null; status: string;
  created_at: string; org_name?: string;
}

export interface Org {
  id: string; name: string; inn?: string; kpp?: string;
  director_name?: string; director_position?: string;
  subscription_plan?: string; custom_price?: number; custom_discount?: number;
}

export type ActiveSection = "all" | "org-contracts" | "org-invoices" | "org-closing";

export function useAdminBilling() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [billingDocs, setBillingDocs] = useState<BillingDoc[]>([]);
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [activeSection, setActiveSection] = useState<ActiveSection>("all");
  const [selectedOrgId, setSelectedOrgId] = useState<string>("");

  // Contract dialog
  const [showCreateContract, setShowCreateContract] = useState(false);
  const [contractForm, setContractForm] = useState({ organization_id: "", contract_number: "", contract_date: "" });
  const [submitting, setSubmitting] = useState(false);

  // Invoice dialog
  const [showInvoiceDialog, setShowInvoiceDialog] = useState(false);
  const [generatingInvoice, setGeneratingInvoice] = useState(false);
  const [invoiceOtherPayer, setInvoiceOtherPayer] = useState(false);
  const [invoiceBuyerName, setInvoiceBuyerName] = useState("");
  const [invoiceBuyerInn, setInvoiceBuyerInn] = useState("");
  const [invoiceBuyerKpp, setInvoiceBuyerKpp] = useState("");
  const [innSearching, setInnSearching] = useState(false);
  const [pendingInvoice, setPendingInvoice] = useState<{ html: string; insertData: any; invoiceNum: string; amount: number; plan: string } | null>(null);

  // Act dialog
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

  // Invoice selection
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
    (orgsRes.data || []).forEach((o: any) => { orgMap[o.id] = o.name; orgList.push(o); });
    setOrgs(orgList);
    setInvoices((invoiceRes.data || []).map((i: any) => ({ ...i, org_name: orgMap[i.organization_id] || "—" })));
    setBillingDocs((docsRes.data as any[] || []).map((d: any) => ({ ...d, org_name: orgMap[d.organization_id] || "—" })));
    setContracts((contractsRes.data || []).map((c: any) => ({ ...c, org_name: orgMap[c.organization_id] || "—" })));
    setLoading(false);
  };

  const selectedOrg = orgs.find(o => o.id === selectedOrgId);
  const orgContracts = contracts.filter(c => c.organization_id === selectedOrgId);
  const orgInvoices = invoices.filter(i => i.organization_id === selectedOrgId);
  const orgClosingDocs = billingDocs.filter(d => d.organization_id === selectedOrgId);

  const matchSearch = (text: string) => !search || text.toLowerCase().includes(search.toLowerCase());
  const filteredInvoices = invoices.filter(i => matchSearch(i.invoice_number) || matchSearch(i.org_name || ""));
  const filteredDocs = billingDocs.filter(d => matchSearch(d.name) || matchSearch(d.org_name || ""));
  const filteredContracts = contracts.filter(c => matchSearch(c.contract_number || "") || matchSearch(c.org_name || ""));

  const handleViewDoc = async (doc: BillingDoc) => {
    const url = await getSignedStorageUrl("billing-documents", doc.file_url);
    if (url) {
      try { const res = await fetch(url); const text = await res.text(); const blob = new Blob([text], { type: "text/html;charset=utf-8" }); window.open(URL.createObjectURL(blob), "_blank"); }
      catch { window.open(url, "_blank"); }
    } else { toast.error("Ошибка", { description: "Не удалось получить ссылку" }); }
  };

  const handleDeleteDoc = async (doc: BillingDoc) => {
    if (!confirm("Удалить документ?")) return;
    try {
      await supabase.storage.from("billing-documents").remove([doc.file_url]);
      await supabase.from("org_billing_documents").delete().eq("id", doc.id);
      setBillingDocs(prev => prev.filter(d => d.id !== doc.id));
      toast.success("Документ удалён");
    } catch { toast.error("Ошибка удаления"); }
  };

  const handleCreateContract = async () => {
    const orgId = activeSection === "all" ? contractForm.organization_id : selectedOrgId;
    if (!orgId) return;
    setSubmitting(true);
    const { error } = await supabase.from("org_contracts").insert({ organization_id: orgId, contract_number: contractForm.contract_number || null, contract_date: contractForm.contract_date || null, status: "active" });
    if (error) { toast.error("Ошибка", { description: error.message }); }
    else { toast.success("Договор создан"); setShowCreateContract(false); setContractForm({ organization_id: "", contract_number: "", contract_date: "" }); loadData(); }
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
      const { count } = await supabase.from("subscription_invoices").select("*", { count: "exact", head: true }).eq("organization_id", selectedOrgId);
      const invoiceNum = `СЧ-${year}/${String((count || 0) + 1).padStart(4, "0")}`;
      const insertData: any = { organization_id: selectedOrgId, invoice_number: invoiceNum, plan, amount, period_months: 1 };
      if (invoiceOtherPayer && invoiceBuyerName) { insertData.buyer_name = invoiceBuyerName; insertData.buyer_inn = invoiceBuyerInn || null; insertData.buyer_kpp = invoiceBuyerKpp || null; }
      const planInfo = SUBSCRIPTION_PLANS[plan as keyof typeof SUBSCRIPTION_PLANS];
      const invoiceData: InvoiceData = { invoiceNumber: invoiceNum, invoiceDate: new Date().toLocaleDateString("ru-RU"), buyerName: insertData.buyer_name || org?.name || "Организация", buyerInn: insertData.buyer_inn || org?.inn, buyerKpp: insertData.buyer_kpp || org?.kpp, planName: planInfo?.name || plan, periodMonths: 1, amount };
      const html = generateInvoiceHtml(invoiceData);
      const printWindow = window.open('', '_blank');
      if (printWindow) { printWindow.document.write(html); printWindow.document.close(); }
      setPendingInvoice({ html, insertData, invoiceNum, amount, plan });
      toast.success("Счёт сформирован");
      setShowInvoiceDialog(false); setInvoiceOtherPayer(false); setInvoiceBuyerName(""); setInvoiceBuyerInn(""); setInvoiceBuyerKpp("");
    } catch (e: any) { toast.error("Ошибка", { description: e.message }); }
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
        const link = document.createElement('a'); link.href = url; link.download = `Счёт_${pendingInvoice.invoiceNum}.doc`;
        document.body.appendChild(link); link.click(); document.body.removeChild(link); URL.revokeObjectURL(url);
        toast.success("Счёт скачан и сохранён");
      } else {
        const printWindow = window.open('', '_blank');
        if (printWindow) { printWindow.document.write(pendingInvoice.html); printWindow.document.close(); printWindow.focus(); setTimeout(() => printWindow.print(), 500); }
        toast.success("Счёт отправлен на печать и сохранён");
      }
    } catch (e: any) { toast.error("Ошибка сохранения", { description: e.message }); }
    setPendingInvoice(null);
  };

  const handleSearchByInn = async (inn: string) => {
    if (inn.length < 10) return;
    setInnSearching(true);
    try {
      const { data } = await supabase.from("organizations").select("name, inn, kpp").eq("inn", inn).maybeSingle();
      if (data) { setInvoiceBuyerName(data.name || ""); setInvoiceBuyerInn(data.inn || inn); setInvoiceBuyerKpp(data.kpp || ""); toast.success("Найдено", { description: data.name }); }
      else {
        const { data: dd } = await supabase.functions.invoke("dadata-company", { body: { inn } });
        if (dd?.success) { setInvoiceBuyerName(dd.company.shortName || dd.company.name || ""); setInvoiceBuyerInn(dd.company.inn || inn); setInvoiceBuyerKpp(dd.company.kpp || ""); toast.success("Найдено (DaData)"); }
        else { toast.info("Не найдено", { description: "Введите вручную" }); }
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
      actDate, basis: actBasis, amount: parseFloat(actAmount),
    });
    if (act) {
      setPendingAct(act);
      const printWindow = window.open('', '_blank');
      if (printWindow) { printWindow.document.write(act.html); printWindow.document.close(); }
      toast.success("Акт сформирован");
      setShowActDialog(false); setActBasis(""); setActAmount(""); setActDate(new Date());
      setActOtherCustomer(false); setActCustomerName(""); setActCustomerInn(""); setActCustomerKpp(""); setActCustomerDirector(""); setActCustomerPosition("");
    } else { toast.error("Ошибка генерации акта"); }
    setActSubmitting(false);
  };

  const handleSavePendingAct = async (action: 'download' | 'print') => {
    if (!pendingAct) return;
    await saveActDocument(pendingAct);
    loadData();
    if (action === 'download') {
      const docContent = `<!DOCTYPE html><html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'><head><meta charset="utf-8"></head><body>${pendingAct.html.replace(/<html[^>]*>|<\/html>|<head>[\s\S]*?<\/head>|<body[^>]*>|<\/body>|<!DOCTYPE[^>]*>/gi, '')}</body></html>`;
      const blob = new Blob([docContent], { type: 'application/msword' });
      const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = `${pendingAct.docName}.doc`;
      document.body.appendChild(link); link.click(); document.body.removeChild(link); URL.revokeObjectURL(url);
      toast.success("Акт скачан и сохранён");
    } else {
      const printWindow = window.open('', '_blank');
      if (printWindow) { printWindow.document.write(pendingAct.html); printWindow.document.close(); printWindow.focus(); setTimeout(() => printWindow.print(), 500); }
      toast.success("Акт отправлен на печать и сохранён");
    }
    setPendingAct(null);
  };

  const handleActSearchByInn = async (inn: string) => {
    if (inn.length < 10) return;
    setActInnSearching(true);
    try {
      const { data } = await supabase.from("organizations").select("name, inn, kpp, director_name, director_position").eq("inn", inn).maybeSingle();
      if (data) { setActCustomerName(data.name || ""); setActCustomerInn(data.inn || inn); setActCustomerKpp(data.kpp || ""); setActCustomerDirector(data.director_name || ""); setActCustomerPosition((data as any).director_position || "Руководитель"); toast.success("Найдено", { description: data.name }); }
      else {
        const { data: dd } = await supabase.functions.invoke("dadata-company", { body: { inn } });
        if (dd?.success) { setActCustomerName(dd.company.shortName || dd.company.name || ""); setActCustomerInn(dd.company.inn || inn); setActCustomerKpp(dd.company.kpp || ""); setActCustomerDirector(dd.company.management || ""); setActCustomerPosition(dd.company.managementPosition || "Руководитель"); toast.success("Найдено (DaData)"); }
        else { toast.info("Не найдено"); }
      }
    } catch { /* ignore */ }
    setActInnSearching(false);
  };

  const toggleInvoiceSelection = (id: string) => {
    if (id === '__clear__') { setSelectedInvoiceIds(new Set()); return; }
    setSelectedInvoiceIds(prev => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  };

  const handleDeleteSelectedInvoices = async () => {
    if (selectedInvoiceIds.size === 0) return;
    setDeleting(true);
    try {
      const ids = Array.from(selectedInvoiceIds);
      for (const id of ids) { const { error } = await supabase.from("subscription_invoices").delete().eq("id", id); if (error) throw error; }
      toast.success(`Удалено счетов: ${ids.length}`);
      setSelectedInvoiceIds(new Set()); setShowDeleteConfirm(false); loadData();
    } catch (e: any) { toast.error("Ошибка удаления", { description: e.message }); }
    setDeleting(false);
  };

  const handleMarkPaid = async (inv: Invoice) => {
    try {
      const { error: invErr } = await supabase.from("subscription_invoices").update({ status: "paid" } as any).eq("id", inv.id);
      if (invErr) throw invErr;
      const { data: orgData, error: orgErr } = await supabase.from("organizations").select("paid_until").eq("id", inv.organization_id).single();
      if (orgErr) throw orgErr;
      const now = new Date();
      const currentPaidUntil = orgData?.paid_until ? new Date(orgData.paid_until) : null;
      const base = currentPaidUntil && currentPaidUntil > now ? currentPaidUntil : now;
      const newPaidUntil = new Date(base);
      newPaidUntil.setMonth(newPaidUntil.getMonth() + (inv.period_months || 1));
      const { error: updErr } = await supabase.from("organizations").update({ paid_until: newPaidUntil.toISOString() } as any).eq("id", inv.organization_id);
      if (updErr) throw updErr;
      toast.success("Оплата подтверждена", { description: `Тариф продлён до ${format(newPaidUntil, "d MMMM yyyy", { locale: ru })}` });
      loadData();
    } catch (e: any) { toast.error("Ошибка", { description: e.message }); }
  };

  return {
    invoices, billingDocs, contracts, orgs, search, setSearch,
    loading, activeSection, setActiveSection,
    selectedOrgId, setSelectedOrgId, selectedOrg,
    orgContracts, orgInvoices, orgClosingDocs,
    filteredInvoices, filteredDocs, filteredContracts,
    // Contract
    showCreateContract, setShowCreateContract, contractForm, setContractForm,
    submitting, handleCreateContract,
    // Invoice
    showInvoiceDialog, setShowInvoiceDialog, generatingInvoice,
    invoiceOtherPayer, setInvoiceOtherPayer,
    invoiceBuyerName, setInvoiceBuyerName,
    invoiceBuyerInn, setInvoiceBuyerInn,
    invoiceBuyerKpp, setInvoiceBuyerKpp,
    innSearching, handleSearchByInn,
    pendingInvoice, setPendingInvoice, handleGenerateInvoice, handleSavePendingInvoice,
    // Act
    showActDialog, setShowActDialog,
    actDate, setActDate, actBasis, setActBasis,
    actAmount, setActAmount, actSubmitting,
    actOtherCustomer, setActOtherCustomer,
    actCustomerName, setActCustomerName,
    actCustomerInn, setActCustomerInn,
    actCustomerKpp, setActCustomerKpp,
    actCustomerDirector, setActCustomerDirector,
    actCustomerPosition, setActCustomerPosition,
    actInnSearching, handleActSearchByInn,
    pendingAct, setPendingAct, handleGenerateAct, handleSavePendingAct,
    // Invoice selection
    selectedInvoiceIds, toggleInvoiceSelection,
    showDeleteConfirm, setShowDeleteConfirm,
    deleting, handleDeleteSelectedInvoices,
    // Other
    handleViewDoc, handleDeleteDoc, handleMarkPaid, loadData,
  };
}
