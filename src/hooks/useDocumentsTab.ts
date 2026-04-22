import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useOrgDashboard } from "@/contexts/OrgDashboardContext";
import { useSubscriptionLimits } from "@/hooks/useSubscriptionLimits";
import { getSignedStorageUrl } from "@/utils/storageHelpers";
import { generateActHtml, saveActDocument, type GeneratedAct } from "@/utils/generateAct";
import { generateInvoiceHtml, type InvoiceData } from "@/constants/invoiceTemplate";
import { SUBSCRIPTION_PLANS } from "@/constants/subscriptionPlans";
import { type OrgRequisites } from "@/hooks/useCompanyLinksAndGenerators";
import { toast } from "sonner";

export type DocumentSubTab = "constructor" | "programs" | "org" | "orders" | "protocols" | "certificates" | "diplomas" | "testimonials" | "journals" | "frdo" | "counterparties" | "incoming" | "signatures" | "pd_requests";
export type CounterpartySubTab = "contracts" | "invoices" | "closing";
export type CounterpartyType = "platform" | "company" | "payer";

export interface CounterpartyOption {
  id: string;
  name: string;
  type: CounterpartyType;
}

export interface BillingDoc {
  id: string;
  name: string;
  doc_type: string;
  file_url: string;
  created_at: string;
}

export interface InvoiceRow {
  id: string;
  invoice_number: string;
  amount: number;
  status: string;
  plan: string;
  period_months: number;
  invoice_date: string;
  created_at: string | null;
}

export interface CounterpartyDoc {
  id: string;
  name: string;
  type: string;
  file_url: string | null;
  amount: number | null;
  is_paid: boolean | null;
  uploaded_at: string;
  contract_number: string | null;
  contract_date: string | null;
  company_name?: string;
}

export function useDocumentsTab(organizationId: string | null, organizationName?: string) {
  const d = useOrgDashboard();
  const { plan } = useSubscriptionLimits(organizationId);
  const isFreePlan = plan === 'free';

  const [activeTab, setActiveTab] = useState<DocumentSubTab>("counterparties");
  const [constructorTab, setConstructorTab] = useState("requisites");
  const [stampUrl, setStampUrl] = useState<string | null>(null);
  const [signatureUrl, setSignatureUrl] = useState<string | null>(null);
  const [billingDocs, setBillingDocs] = useState<BillingDoc[]>([]);
  const [invoices, setInvoices] = useState<InvoiceRow[]>([]);
  const [counterpartySubTab, setCounterpartySubTab] = useState<CounterpartySubTab>("contracts");
  const [counterpartyDocs, setCounterpartyDocs] = useState<CounterpartyDoc[]>([]);
  const [counterpartyLoading, setCounterpartyLoading] = useState(false);

  // Act dialog state
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

  // Invoice dialog state
  const [generatingInvoice, setGeneratingInvoice] = useState(false);
  const [showInvoiceDialog, setShowInvoiceDialog] = useState(false);
  const [invoiceOtherPayer, setInvoiceOtherPayer] = useState(false);
  const [invoiceBuyerName, setInvoiceBuyerName] = useState("");
  const [invoiceBuyerInn, setInvoiceBuyerInn] = useState("");
  const [invoiceBuyerKpp, setInvoiceBuyerKpp] = useState("");
  const [innSearching, setInnSearching] = useState(false);
  const [orgDetails, setOrgDetails] = useState<{ inn?: string; director_name?: string; director_position?: string; custom_price?: number; custom_discount?: number; subscription_plan?: string }>({});
  const [pendingInvoice, setPendingInvoice] = useState<{ html: string; insertData: any; invoiceNum: string; amount: number } | null>(null);

  // Contract Generator
  const [showContractGenerator, setShowContractGenerator] = useState(false);
  const [orgRequisites, setOrgRequisites] = useState<OrgRequisites | null>(null);

  useEffect(() => {
    if (!organizationId) return;
    supabase
      .from("organizations")
      .select("*")
      .eq("id", organizationId)
      .single()
      .then(({ data }) => {
        if (data) {
          setOrgRequisites({
            name: data.name || "",
            inn: data.inn || "",
            kpp: data.kpp || "",
            ogrn: data.ogrn || "",
            legal_address: data.legal_address || "",
            actual_address: data.actual_address || "",
            director_name: data.director_name || "",
            director_position: data.director_position || "",
            bank_name: data.bank_name || "",
            bank_bik: data.bank_bik || "",
            bank_account: data.bank_account || "",
            bank_corr_account: data.bank_corr_account || "",
            stamp_url: data.stamp_url,
            signature_url: data.signature_url,
          });
        }
      });
  }, [organizationId]);

  useEffect(() => {
    if (!organizationId) return;
    supabase
      .from('organizations')
      .select('stamp_url, signature_url, inn, director_name, director_position, custom_price, custom_discount, subscription_plan')
      .eq('id', organizationId)
      .single()
      .then(({ data }) => {
        if (data) {
          setStampUrl(data.stamp_url);
          setSignatureUrl(data.signature_url);
          setOrgDetails({
            inn: data.inn,
            director_name: data.director_name,
            director_position: (data as any).director_position,
            custom_price: (data as any).custom_price,
            custom_discount: (data as any).custom_discount,
            subscription_plan: data.subscription_plan,
          });
        }
      });

    supabase
      .from("org_billing_documents" as any)
      .select("*")
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: false })
      .then(({ data }) => {
        if (data) setBillingDocs(data as any[]);
      });

    supabase
      .from("subscription_invoices")
      .select("*")
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: false })
      .then(({ data }) => {
        if (data) setInvoices(data as InvoiceRow[]);
      });

    setCounterpartyLoading(true);
    supabase
      .from("companies")
      .select("id, name")
      .eq("organization_id", organizationId)
      .then(async ({ data: companies }) => {
        if (!companies || companies.length === 0) {
          setCounterpartyDocs([]);
          setCounterpartyLoading(false);
          return;
        }
        const companyIds = companies.map(c => c.id);
        const companyMap = Object.fromEntries(companies.map(c => [c.id, c.name]));
        const { data: docs } = await supabase
          .from("company_documents")
          .select("id, name, type, file_url, amount, is_paid, uploaded_at, contract_number, contract_date, company_id")
          .in("company_id", companyIds)
          .order("uploaded_at", { ascending: false });
        setCounterpartyDocs(
          (docs || []).map((d: any) => ({ ...d, company_name: companyMap[d.company_id] || "—" }))
        );
        setCounterpartyLoading(false);
      });
  }, [organizationId]);

  const handleStampUpload = async (url: string) => {
    setStampUrl(url);
    await supabase.from('organizations').update({ stamp_url: url }).eq('id', organizationId);
  };
  const handleSignatureUpload = async (url: string) => {
    setSignatureUrl(url);
    await supabase.from('organizations').update({ signature_url: url }).eq('id', organizationId);
  };
  const handleStampRemove = async () => {
    setStampUrl(null);
    await supabase.from('organizations').update({ stamp_url: null }).eq('id', organizationId);
  };
  const handleSignatureRemove = async () => {
    setSignatureUrl(null);
    await supabase.from('organizations').update({ signature_url: null }).eq('id', organizationId);
  };

  const handleViewDoc = async (doc: BillingDoc) => {
    const url = await getSignedStorageUrl("billing-documents", doc.file_url);
    if (!url) {
      toast.error("Ошибка", { description: "Не удалось получить ссылку на файл" });
      return;
    }
    try {
      const res = await fetch(url);
      const text = await res.text();
      const blob = new Blob([text], { type: "text/html;charset=utf-8" });
      const blobUrl = URL.createObjectURL(blob);
      window.open(blobUrl, "_blank");
    } catch (e) {
      console.error("Error opening document:", e);
      window.open(url, "_blank");
    }
  };

  const handleDownloadDoc = async (doc: BillingDoc) => {
    const url = await getSignedStorageUrl("billing-documents", doc.file_url);
    if (!url) {
      toast.error("Ошибка", { description: "Не удалось получить ссылку на файл" });
      return;
    }
    try {
      const { downloadHtmlFile } = await import("@/utils/downloadHtmlFile");
      await downloadHtmlFile(url, doc.name);
    } catch (e) {
      console.error("Error downloading document:", e);
      toast.error("Ошибка", { description: "Не удалось скачать файл" });
    }
  };

  const handleDeleteBillingDoc = async (doc: BillingDoc) => {
    if (!confirm("Удалить документ?")) return;
    try {
      await supabase.storage.from("billing-documents").remove([doc.file_url]);
      const { error } = await supabase.from("org_billing_documents").delete().eq("id", doc.id);
      if (error) throw error;
      setBillingDocs(prev => prev.filter(d => d.id !== doc.id));
      toast.success("Документ удалён");
    } catch (e) {
      console.error("Error deleting document:", e);
      toast.error("Ошибка", { description: "Не удалось удалить документ" });
    }
  };

  const handleGenerateAct = async () => {
    if (!organizationId || !actBasis || !actAmount) return;
    setActSubmitting(true);
    const act = await generateActHtml({
      organizationId,
      orgName: actOtherCustomer && actCustomerName ? actCustomerName : (d.organizationName || organizationName || ""),
      orgInn: actOtherCustomer && actCustomerInn ? actCustomerInn : (orgDetails.inn || null),
      directorName: actOtherCustomer && actCustomerDirector ? actCustomerDirector : (orgDetails.director_name || null),
      directorPosition: actOtherCustomer && actCustomerPosition ? actCustomerPosition : (orgDetails.director_position || null),
      actDate,
      basis: actBasis,
      amount: parseFloat(actAmount),
    });
    if (act) {
      setPendingAct(act);
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
      toast.error("Ошибка", { description: "Не удалось сгенерировать акт" });
    }
    setActSubmitting(false);
  };

  const handleSavePendingAct = async (action: 'download' | 'print') => {
    if (!pendingAct) return;
    await saveActDocument(pendingAct);
    const { data } = await supabase.from("org_billing_documents" as any)
      .select("*").eq("organization_id", organizationId).order("created_at", { ascending: false });
    if (data) setBillingDocs(data as any[]);
    if (action === 'download') {
      const docContent = `<!DOCTYPE html><html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'><head><meta charset="utf-8"></head><body>${pendingAct.html.replace(/<html[^>]*>|<\/html>|<head>[\s\S]*?<\/head>|<body[^>]*>|<\/body>|<!DOCTYPE[^>]*>/gi, '')}</body></html>`;
      const blob = new Blob([docContent], { type: 'application/msword' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url; link.download = `${pendingAct.docName}.doc`;
      document.body.appendChild(link); link.click(); document.body.removeChild(link);
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
        toast.success("Организация найдена", { description: data.name });
      } else {
        const { data: dadataResult } = await supabase.functions.invoke("dadata-company", { body: { inn } });
        if (dadataResult?.success) {
          setActCustomerName(dadataResult.company.shortName || dadataResult.company.name || "");
          setActCustomerInn(dadataResult.company.inn || inn);
          setActCustomerKpp(dadataResult.company.kpp || "");
          setActCustomerDirector(dadataResult.company.management || "");
          setActCustomerPosition(dadataResult.company.managementPosition || "Руководитель");
          toast.success("Организация найдена (DaData)", { description: dadataResult.company.shortName || dadataResult.company.name });
        } else {
          toast.success("Не найдено", { description: "Введите реквизиты вручную" });
        }
      }
    } catch {
      toast.error("Ошибка поиска");
    } finally {
      setActInnSearching(false);
    }
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
        toast.success("Организация найдена", { description: data.name });
      } else {
        toast.success("Не найдено", { description: "Введите реквизиты вручную" });
      }
    } catch { /* ignore */ } finally {
      setInnSearching(false);
    }
  };

  const handleGenerateInvoiceFromDocs = async () => {
    if (!organizationId) return;
    setGeneratingInvoice(true);
    try {
      const PLAN_PRICES: Record<string, number> = { free: 0, start: 1990, standard: 4990, professional: 9990, maximum: 19990 };
      const currentPlan = orgDetails.subscription_plan || "start";
      const basePrice = orgDetails.custom_price ?? PLAN_PRICES[currentPlan] ?? 1990;
      const discount = orgDetails.custom_discount ?? 0;
      const amount = Math.max(0, basePrice - discount);
      const year = new Date().getFullYear();
      const { count } = await supabase.from("subscription_invoices").select("*", { count: "exact", head: true }).eq("organization_id", organizationId);
      const invoiceNum = `СЧ-${year}/${String((count || 0) + 1).padStart(4, "0")}`;
      const insertData: any = { organization_id: organizationId, invoice_number: invoiceNum, plan: currentPlan, amount, period_months: 1 };
      if (invoiceOtherPayer && invoiceBuyerName) {
        insertData.buyer_name = invoiceBuyerName;
        insertData.buyer_inn = invoiceBuyerInn || null;
        insertData.buyer_kpp = invoiceBuyerKpp || null;
      }
      const planInfo = SUBSCRIPTION_PLANS[currentPlan as keyof typeof SUBSCRIPTION_PLANS];
      const invoiceData: InvoiceData = {
        invoiceNumber: invoiceNum,
        invoiceDate: new Date().toLocaleDateString("ru-RU"),
        buyerName: insertData.buyer_name || d.organizationName || organizationName || "Организация",
        buyerInn: insertData.buyer_inn || orgDetails.inn,
        buyerKpp: insertData.buyer_kpp,
        planName: planInfo?.name || currentPlan,
        periodMonths: 1,
        amount,
      };
      const html = generateInvoiceHtml(invoiceData);
      const printWindow = window.open('', '_blank');
      if (printWindow) { printWindow.document.write(html); printWindow.document.close(); }
      setPendingInvoice({ html, insertData, invoiceNum, amount });
      toast.success("Счёт сформирован", { description: "Скачайте или распечатайте для сохранения" });
      setShowInvoiceDialog(false);
      setInvoiceOtherPayer(false); setInvoiceBuyerName(""); setInvoiceBuyerInn(""); setInvoiceBuyerKpp("");
    } catch (e: any) {
      toast.error("Ошибка", { description: e.message });
    } finally {
      setGeneratingInvoice(false);
    }
  };

  const handleSavePendingInvoice = async (action: 'download' | 'print') => {
    if (!pendingInvoice) return;
    try {
      const { data: invoice, error } = await supabase.from("subscription_invoices").insert(pendingInvoice.insertData).select("id").single();
      if (error) throw error;
      const orgDisplayName = d.organizationName || organizationName || "Организация";
      await supabase.from("admin_notifications").insert({
        type: "invoice",
        title: `Новый счёт: ${pendingInvoice.invoiceNum}`,
        message: `Организация «${orgDisplayName}» сформировала счёт на ${pendingInvoice.amount.toLocaleString("ru-RU")} ₽ (план: ${pendingInvoice.insertData.plan})`,
        related_entity_id: organizationId,
        metadata: { invoice_id: (invoice as any).id, organization_id: organizationId, amount: pendingInvoice.amount, plan: pendingInvoice.insertData.plan },
      } as any);
      setInvoices(prev => [{ id: (invoice as any).id, invoice_number: pendingInvoice.invoiceNum, amount: pendingInvoice.amount, status: "pending", plan: pendingInvoice.insertData.plan, period_months: 1, invoice_date: new Date().toISOString(), created_at: new Date().toISOString() }, ...prev]);
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
        if (printWindow) { printWindow.document.write(pendingInvoice.html); printWindow.document.close(); printWindow.focus(); setTimeout(() => printWindow.print(), 500); }
        toast.success("Счёт отправлен на печать и сохранён");
      }
    } catch (e: any) {
      toast.error("Ошибка сохранения", { description: e.message });
    }
    setPendingInvoice(null);
  };

  const refreshCounterpartyDocs = async () => {
    if (!organizationId) return;
    const { data: allCompanies } = await supabase.from("companies").select("id, name").eq("organization_id", organizationId);
    if (allCompanies) {
      const companyIds = allCompanies.map(c => c.id);
      const companyMap = Object.fromEntries(allCompanies.map(c => [c.id, c.name]));
      const { data: docs } = await supabase.from("company_documents")
        .select("id, name, type, file_url, amount, is_paid, uploaded_at, contract_number, contract_date, company_id")
        .in("company_id", companyIds).order("uploaded_at", { ascending: false });
      setCounterpartyDocs((docs || []).map((doc: any) => ({ ...doc, company_name: companyMap[doc.company_id] || "—" })));
    }
  };

  return {
    d, plan, isFreePlan,
    activeTab, setActiveTab,
    constructorTab, setConstructorTab,
    stampUrl, signatureUrl,
    handleStampUpload, handleSignatureUpload, handleStampRemove, handleSignatureRemove,
    billingDocs, invoices,
    
    counterpartySubTab, setCounterpartySubTab,
    counterpartyDocs, counterpartyLoading,
    // Act
    showActDialog, setShowActDialog,
    actDate, setActDate, actBasis, setActBasis, actAmount, setActAmount,
    actSubmitting, actOtherCustomer, setActOtherCustomer,
    actCustomerName, setActCustomerName, actCustomerInn, setActCustomerInn,
    actCustomerKpp, setActCustomerKpp, actCustomerDirector, setActCustomerDirector,
    actCustomerPosition, setActCustomerPosition, actInnSearching,
    pendingAct, setPendingAct,
    handleGenerateAct, handleSavePendingAct, handleActSearchByInn,
    // Invoice
    generatingInvoice, showInvoiceDialog, setShowInvoiceDialog,
    invoiceOtherPayer, setInvoiceOtherPayer,
    invoiceBuyerName, setInvoiceBuyerName,
    invoiceBuyerInn, setInvoiceBuyerInn,
    invoiceBuyerKpp, setInvoiceBuyerKpp,
    innSearching, pendingInvoice, setPendingInvoice,
    handleSearchByInn, handleGenerateInvoiceFromDocs, handleSavePendingInvoice,
    // Billing docs
    handleViewDoc, handleDownloadDoc, handleDeleteBillingDoc,
    // Contract
    showContractGenerator, setShowContractGenerator,
    orgRequisites, orgDetails,
    refreshCounterpartyDocs,
  };
}
