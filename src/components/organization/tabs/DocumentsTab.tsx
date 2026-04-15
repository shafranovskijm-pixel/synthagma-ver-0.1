import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { 
  Users, ClipboardList, Award, GraduationCap, FileCheck, 
  FileText, Upload, BookOpen, Wrench, Building2, ScrollText,
  UserCheck, Stamp, ExternalLink, Lock, ArrowUpRight,
  FolderOpen, Download, Receipt, File, Calendar, Lightbulb, Trash2,
  Info, FileSpreadsheet, Database
} from "lucide-react";
import { JournalsManager } from "@/components/organization/JournalsManager";
import { FRDOManager } from "@/components/organization/FRDOManager";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { OrgDocumentsManager } from "@/components/organization/OrgDocumentsManager";
import { DocumentArchiveView } from "@/components/organization/DocumentArchiveView";
import { EducationDocumentsJournal } from "@/components/organization/EducationDocumentsJournal";
import { CourseProgramsList } from "@/components/organization/CourseProgramsList";
import { OrgRequisitesForm } from "@/components/organization/OrgRequisitesForm";
import { ContractTemplateEditor } from "@/components/organization/ContractTemplateEditor";
import { ConsentGenerator } from "@/components/organization/ConsentGenerator";
import { ProtocolTemplateEditor } from "@/components/organization/ProtocolTemplateEditor";
import { CertificateTemplateEditor } from "@/components/organization/CertificateTemplateEditor";
import { StampSignatureUploader } from "@/components/organization/StampSignatureUploader";
import { useSubscriptionLimits } from "@/hooks/useSubscriptionLimits";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { DocumentPreview } from "@/components/organization/DocumentPreview";
import { Eye, Printer } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useOrgDashboard } from "@/contexts/OrgDashboardContext";
import { getSignedStorageUrl } from "@/utils/storageHelpers";
import { generateActHtml, saveActDocument, type GeneratedAct } from "@/utils/generateAct";
import { PayersSection } from "@/components/organization/PayersSection";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { ru } from "date-fns/locale";
import { toast } from "sonner";
import { generateInvoiceHtml, type InvoiceData } from "@/constants/invoiceTemplate";
import { SUBSCRIPTION_PLANS } from "@/constants/subscriptionPlans";

type DocumentSubTab = "constructor" | "programs" | "org" | "orders" | "protocols" | "certificates" | "diplomas" | "testimonials" | "billing" | "payers" | "journals" | "frdo";

interface DocumentsTabProps {
  organizationId: string | null;
  organizationName?: string;
  onShowBulkUploadDialog?: () => void;
  isOrdersEnabled?: boolean;
  onNavigateToSubscription?: () => void;
}

interface BillingDoc {
  id: string;
  name: string;
  doc_type: string;
  file_url: string;
  created_at: string;
}

const docTypeLabels: Record<string, { label: string; icon: React.ReactNode }> = {
  invoice: { label: "Счёт", icon: <FileText className="w-4 h-4 text-blue-500" /> },
  receipt: { label: "Чек", icon: <Receipt className="w-4 h-4 text-emerald-500" /> },
  act: { label: "Акт", icon: <File className="w-4 h-4 text-amber-500" /> },
  other: { label: "Другое", icon: <File className="w-4 h-4 text-muted-foreground" /> },
};

const NAV_ITEMS: { value: DocumentSubTab; label: string; shortLabel?: string; icon: React.ElementType; ordersOnly?: boolean; iconColor?: string; group?: string }[] = [
  { value: "billing", label: "Документы Синтагма", icon: FolderOpen, group: "platform" },
  { value: "payers", label: "Плательщики", icon: Users, group: "platform" },
  { value: "org", label: "Документы орг.", icon: FileText, iconColor: "text-primary/70", group: "docs" },
  { value: "orders", label: "Приказы", icon: ScrollText, ordersOnly: true, iconColor: "text-amber-500", group: "docs" },
  { value: "protocols", label: "Протоколы АК", icon: ClipboardList, iconColor: "text-violet-500", group: "docs" },
  { value: "certificates", label: "Удостоверения", icon: Award, iconColor: "text-emerald-500", group: "docs" },
  { value: "diplomas", label: "Дипломы", icon: GraduationCap, iconColor: "text-blue-500", group: "docs" },
  { value: "testimonials", label: "Свидетельства", icon: FileCheck, iconColor: "text-rose-500", group: "docs" },
  { value: "programs", label: "Программы", icon: BookOpen, group: "tools" },
  { value: "journals", label: "Журналы", icon: ClipboardList, iconColor: "text-amber-500", group: "tools" },
  { value: "frdo", label: "ФИС ФРДО", icon: Database, iconColor: "text-violet-500", group: "tools" },
  { value: "constructor", label: "Конструктор", icon: Wrench, group: "tools" },
];

const SECTION_DESCRIPTIONS: Partial<Record<DocumentSubTab, string>> = {
  constructor: "Настройте шаблоны документов — реквизиты, печать и подпись будут автоматически подставляться",
  org: "Загрузите обязательные документы организации по 273-ФЗ",
  orders: "Сгенерированные приказы о зачислении и отчислении",
  protocols: "Протоколы аттестационной комиссии",
  certificates: "Журнал выданных удостоверений о повышении квалификации",
  diplomas: "Журнал выданных дипломов о профессиональной переподготовке",
  testimonials: "Журнал выданных свидетельств о квалификации",
  programs: "Управление образовательными программами",
  journals: "Журналы учёта обучения",
  frdo: "Выгрузка данных в ФИС ФРДО",
  billing: "Договоры, счета и закрывающие документы с платформой",
  payers: "Взаиморасчёты с учениками и компаниями",
};

type BillingSubTab = "contracts" | "invoices" | "closing";

interface InvoiceRow {
  id: string;
  invoice_number: string;
  amount: number;
  status: string;
  plan: string;
  period_months: number;
  invoice_date: string;
  created_at: string | null;
}

export const DocumentsTab = React.memo(function DocumentsTab({ organizationId, organizationName, onShowBulkUploadDialog, isOrdersEnabled = true, onNavigateToSubscription }: DocumentsTabProps) {
  const navigate = useNavigate();
  const d = useOrgDashboard();
  const [activeTab, setActiveTab] = useState<DocumentSubTab>("billing");
  const [constructorTab, setConstructorTab] = useState("requisites");
  const [stampUrl, setStampUrl] = useState<string | null>(null);
  const [signatureUrl, setSignatureUrl] = useState<string | null>(null);
  const { plan } = useSubscriptionLimits(organizationId);
  const isFreePlan = plan === 'free';

  const [billingDocs, setBillingDocs] = useState<BillingDoc[]>([]);
  const [invoices, setInvoices] = useState<InvoiceRow[]>([]);
  const [billingSubTab, setBillingSubTab] = useState<BillingSubTab>("contracts");
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
  const [generatingInvoice, setGeneratingInvoice] = useState(false);
  const [showInvoiceDialog, setShowInvoiceDialog] = useState(false);
  const [invoiceOtherPayer, setInvoiceOtherPayer] = useState(false);
  const [invoiceBuyerName, setInvoiceBuyerName] = useState("");
  const [invoiceBuyerInn, setInvoiceBuyerInn] = useState("");
  const [invoiceBuyerKpp, setInvoiceBuyerKpp] = useState("");
  const [innSearching, setInnSearching] = useState(false);
  const [orgDetails, setOrgDetails] = useState<{ inn?: string; director_name?: string; director_position?: string; custom_price?: number; custom_discount?: number; subscription_plan?: string }>({});
  const [pendingInvoice, setPendingInvoice] = useState<{ html: string; insertData: any; invoiceNum: string; amount: number } | null>(null);

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
      // First try local DB
      const { data } = await supabase
        .from("organizations")
        .select("name, inn, kpp, director_name, director_position")
        .eq("inn", inn)
        .maybeSingle();
      if (data) {
        setActCustomerName(data.name || "");
        setActCustomerInn(data.inn || inn);
        setActCustomerKpp(data.kpp || "");
        setActCustomerDirector(data.director_name || "");
        setActCustomerPosition((data as any).director_position || "Руководитель");
        toast.success("Организация найдена", { description: data.name });
      } else {
        // Fallback to DaData
        const { data: dadataResult } = await supabase.functions.invoke("dadata-company", {
          body: { inn },
        });
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
      const { data } = await supabase
        .from("organizations")
        .select("name, inn, kpp")
        .eq("inn", inn)
        .maybeSingle();
      if (data) {
        setInvoiceBuyerName(data.name || "");
        setInvoiceBuyerInn(data.inn || inn);
        setInvoiceBuyerKpp(data.kpp || "");
        toast.success("Организация найдена", { description: data.name });
      } else {
        toast.success("Не найдено", { description: "Введите реквизиты вручную" });
      }
    } catch {
      // ignore
    } finally {
      setInnSearching(false);
    }
  };

  const handleGenerateInvoiceFromDocs = async () => {
    if (!organizationId) return;
    setGeneratingInvoice(true);
    try {
      const PLAN_PRICES: Record<string, number> = {
        free: 0, start: 1990, standard: 4990, professional: 9990, maximum: 19990,
      };
      const plan = orgDetails.subscription_plan || "start";
      const basePrice = orgDetails.custom_price ?? PLAN_PRICES[plan] ?? 1990;
      const discount = orgDetails.custom_discount ?? 0;
      const amount = Math.max(0, basePrice - discount);

      const year = new Date().getFullYear();
      const { count } = await supabase
        .from("subscription_invoices")
        .select("*", { count: "exact", head: true })
        .eq("organization_id", organizationId);

      const invoiceNum = `СЧ-${year}/${String((count || 0) + 1).padStart(4, "0")}`;

      const insertData: any = {
        organization_id: organizationId,
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
        buyerName: insertData.buyer_name || d.organizationName || organizationName || "Организация",
        buyerInn: insertData.buyer_inn || orgDetails.inn,
        buyerKpp: insertData.buyer_kpp,
        planName: planInfo?.name || plan,
        periodMonths: 1,
        amount,
      };
      const html = generateInvoiceHtml(invoiceData);

      const printWindow = window.open('', '_blank');
      if (printWindow) {
        printWindow.document.write(html);
        printWindow.document.close();
      }

      setPendingInvoice({ html, insertData, invoiceNum, amount });
      toast.success("Счёт сформирован", { description: "Скачайте или распечатайте для сохранения" });
      setShowInvoiceDialog(false);
      setInvoiceOtherPayer(false);
      setInvoiceBuyerName("");
      setInvoiceBuyerInn("");
      setInvoiceBuyerKpp("");
    } catch (e: any) {
      toast.error("Ошибка", { description: e.message });
    } finally {
      setGeneratingInvoice(false);
    }
  };

  const handleSavePendingInvoice = async (action: 'download' | 'print') => {
    if (!pendingInvoice) return;
    try {
      const { data: invoice, error } = await supabase
        .from("subscription_invoices")
        .insert(pendingInvoice.insertData)
        .select("id")
        .single();
      if (error) throw error;
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

  if (!organizationId) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        Организация не найдена
      </div>
    );
  }

  const LockedOverlay = ({ requiredPlan = "Старт", features = [] }: { requiredPlan?: string; features?: string[] }) => (
    <div className="absolute inset-0 z-10 bg-background/60 backdrop-blur-[2px] rounded-xl lg:rounded-2xl flex items-center justify-center">
      <div className="flex flex-col items-center gap-2 text-center px-4 max-w-sm">
        <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center">
          <Lock className="w-5 h-5 text-muted-foreground" />
        </div>
        <p className="text-sm font-medium text-foreground">Доступно от тарифа «{requiredPlan}»</p>
        {features.length > 0 && (
          <ul className="text-left space-y-1 mt-1">
            {features.map((f, i) => (
              <li key={i} className="flex items-start gap-2 text-xs text-muted-foreground">
                <span className="text-primary mt-0.5">✓</span>
                <span>{f}</span>
              </li>
            ))}
          </ul>
        )}
        <Button
          size="sm"
          variant="outline"
          className="rounded-xl gap-1.5 text-xs mt-1"
          onClick={() => onNavigateToSubscription?.()}
        >
          <ArrowUpRight className="w-3.5 h-3.5" />
          Сменить тариф
        </Button>
      </div>
    </div>
  );

  const visibleItems = NAV_ITEMS.filter(item => !item.ordersOnly || isOrdersEnabled);
  const activeItem = visibleItems.find(i => i.value === activeTab) || visibleItems[0];

  return (
    <div className="space-y-0">
      <div className="flex flex-col lg:flex-row gap-0 min-h-[600px]">
        {/* Left sidebar navigation */}
        <nav className="lg:w-56 xl:w-64 shrink-0 border-b lg:border-b-0 lg:border-r border-border bg-card lg:rounded-l-2xl">
          {/* Mobile: horizontal scroll */}
          <div className="lg:hidden flex overflow-x-auto gap-1 p-2">
            {visibleItems.map(item => {
              const Icon = item.icon;
              const isActive = activeTab === item.value;
              return (
                <button
                  key={item.value}
                  onClick={() => setActiveTab(item.value)}
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg whitespace-nowrap transition-colors",
                    isActive
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                  )}
                >
                  <Icon className="w-3.5 h-3.5" />
                  {item.label}
                </button>
              );
            })}
          </div>

          {/* Desktop: vertical list */}
          <div className="hidden lg:flex flex-col py-3 bg-gradient-to-b from-card to-muted/20">
            {(() => {
              let lastGroup = "";
              return visibleItems.map((item, idx) => {
                const Icon = item.icon;
                const isActive = activeTab === item.value;
                const showDivider = item.group && item.group !== lastGroup && idx > 0;
                const groupLabel = item.group === "docs" && lastGroup !== "docs" ? "Документооборот" : item.group === "tools" && lastGroup !== "tools" ? "Инструменты" : null;
                lastGroup = item.group || "";
                return (
                  <React.Fragment key={item.value}>
                    {showDivider && (
                      <div className="px-4 pt-3 pb-1">
                        <div className="h-px bg-border/60" />
                        {groupLabel && (
                          <span className="text-[10px] uppercase tracking-wider text-muted-foreground/60 font-semibold mt-2 block">{groupLabel}</span>
                        )}
                      </div>
                    )}
                    <button
                      onClick={() => setActiveTab(item.value)}
                      className={cn(
                        "flex items-center gap-2.5 px-4 py-2.5 text-sm font-medium text-left transition-all duration-200 group",
                        isActive
                          ? "bg-primary/15 text-primary border-r-2 border-primary"
                          : "text-muted-foreground hover:text-primary hover:bg-primary/10 hover:translate-x-0.5"
                      )}
                    >
                      <Icon className={cn(
                        "w-4 h-4 shrink-0 transition-colors duration-200",
                        isActive ? "text-primary" : item.iconColor || "group-hover:text-primary"
                      )} />
                      {item.label}
                    </button>
                  </React.Fragment>
                );
              });
            })()}
          </div>
        </nav>

        {/* Right content panel */}
        <div className="flex-1 min-w-0 bg-card lg:rounded-r-2xl border-l-0">
          {/* Content header */}
          <div className="flex items-center justify-between px-4 lg:px-6 py-4 border-b border-border">
            <div>
              <h2 className="text-base font-semibold flex items-center gap-2">
                <activeItem.icon className="w-4 h-4 text-primary" />
                {activeItem.label}
              </h2>
              {SECTION_DESCRIPTIONS[activeTab] && (
                <p className="text-xs text-muted-foreground mt-0.5">{SECTION_DESCRIPTIONS[activeTab]}</p>
              )}
            </div>
            <div className="flex items-center gap-2">
              {activeTab === "billing" && billingSubTab === "invoices" && (
                <Button variant="outline" size="sm" className="rounded-xl gap-1.5" onClick={() => setShowInvoiceDialog(true)}>
                  <Receipt className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Сформировать счёт</span>
                </Button>
              )}
              {activeTab === "billing" && billingSubTab === "closing" && (
                <Button variant="outline" size="sm" className="rounded-xl gap-1.5" onClick={() => setShowActDialog(true)}>
                  <FileText className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Сформировать акт</span>
                </Button>
              )}
              {onShowBulkUploadDialog && activeTab === "org" && (
                <Button variant="outline" size="sm" className="rounded-xl gap-1.5" onClick={onShowBulkUploadDialog}>
                  <Upload className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Массовая загрузка</span>
                </Button>
              )}
            </div>
          </div>

          {/* Content body */}
          <div className="p-4 lg:p-6">
            {activeTab === "constructor" && (
              <div className="relative">
                <Tabs value={constructorTab} onValueChange={setConstructorTab}>
                  <TabsList className="flex flex-wrap h-auto gap-1 bg-muted/50 p-1 rounded-xl mb-4">
                    <TabsTrigger value="requisites" className="rounded-lg text-xs gap-1.5 px-2.5 py-1.5">
                      <Building2 className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline">Реквизиты</span>
                    </TabsTrigger>
                    <TabsTrigger value="contract" className="rounded-lg text-xs gap-1.5 px-2.5 py-1.5">
                      <FileText className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline">Договор</span>
                    </TabsTrigger>
                    <TabsTrigger value="protocol" className="rounded-lg text-xs gap-1.5 px-2.5 py-1.5">
                      <ScrollText className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline">Протокол АК</span>
                    </TabsTrigger>
                    <TabsTrigger value="documents" className="rounded-lg text-xs gap-1.5 px-2.5 py-1.5">
                      <Award className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline">Удост./Диплом</span>
                    </TabsTrigger>
                    <TabsTrigger value="consent" className="rounded-lg text-xs gap-1.5 px-2.5 py-1.5">
                      <UserCheck className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline">Согласие ПД</span>
                    </TabsTrigger>
                    <TabsTrigger value="stamp" className="rounded-lg text-xs gap-1.5 px-2.5 py-1.5">
                      <Stamp className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline">Печать</span>
                    </TabsTrigger>
                  </TabsList>

                  <TabsContent value="requisites" className="mt-0 space-y-4">
                    <OrgRequisitesForm organizationId={organizationId} />
                  </TabsContent>

                  <TabsContent value="contract" className="mt-0">
                    <div className="flex flex-col items-center justify-center py-8 gap-4 text-center">
                      <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center">
                        <FileText className="w-7 h-7 text-primary" />
                      </div>
                      <div>
                        <h4 className="font-semibold text-sm mb-1">Конструктор шаблона договора</h4>
                        <p className="text-xs text-muted-foreground max-w-sm">
                          Полноэкранный редактор с подсветкой переменных, панелью вставки и предпросмотром
                        </p>
                      </div>
                      <Button className="rounded-xl gap-2" onClick={() => navigate("/contract-editor")}>
                        <ExternalLink className="w-4 h-4" />
                        Открыть конструктор
                      </Button>
                    </div>
                  </TabsContent>

                  <TabsContent value="protocol" className="mt-0">
                    <ProtocolTemplateEditor organizationId={organizationId} />
                  </TabsContent>

                  <TabsContent value="documents" className="mt-0">
                    <CertificateTemplateEditor organizationId={organizationId} />
                  </TabsContent>

                  <TabsContent value="consent" className="mt-0">
                    <ConsentGenerator organizationId={organizationId} organizationName={organizationName || ""} />
                  </TabsContent>

                  <TabsContent value="stamp" className="mt-0">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                      <StampSignatureUploader
                        type="stamp"
                        currentUrl={stampUrl}
                        onUpload={handleStampUpload}
                        onRemove={handleStampRemove}
                        organizationId={organizationId}
                      />
                      <StampSignatureUploader
                        type="signature"
                        currentUrl={signatureUrl}
                        onUpload={handleSignatureUpload}
                        onRemove={handleSignatureRemove}
                        organizationId={organizationId}
                      />
                    </div>
                    <Accordion type="single" collapsible className="mt-6">
                      <AccordionItem value="preview" className="border border-border rounded-xl px-4">
                        <AccordionTrigger className="text-sm hover:no-underline">
                          <span className="flex items-center gap-2">
                            <Eye className="w-4 h-4" />
                            Предпросмотр документа
                          </span>
                        </AccordionTrigger>
                        <AccordionContent>
                          <DocumentPreview type="certificate" data={{}} />
                        </AccordionContent>
                      </AccordionItem>
                    </Accordion>
                  </TabsContent>
                </Tabs>
              </div>
            )}

            {activeTab === "org" && (
              <OrgDocumentsManager organizationId={organizationId} />
            )}

            {activeTab === "orders" && isOrdersEnabled && (
              <DocumentArchiveView
                organizationId={organizationId}
                categoryId="enrollment_orders"
                title="Приказы о зачислении / отчислении"
                docTypes={["enrollment_order", "expulsion_order"]}
              />
            )}

            {activeTab === "protocols" && (
              <DocumentArchiveView
                organizationId={organizationId}
                categoryId="attestation_protocols"
                title="Протоколы аттестационной комиссии"
                docTypes={["attestation_protocol"]}
              />
            )}

            {activeTab === "certificates" && (
              <EducationDocumentsJournal
                organizationId={organizationId}
                onClose={() => {}}
                documentTypeFilter="certificate"
              />
            )}

            {activeTab === "diplomas" && (
              <EducationDocumentsJournal
                organizationId={organizationId}
                onClose={() => {}}
                documentTypeFilter="diploma"
              />
            )}

            {activeTab === "testimonials" && (
              <EducationDocumentsJournal
                organizationId={organizationId}
                onClose={() => {}}
                documentTypeFilter="qualification"
              />
            )}

            {activeTab === "programs" && (
              <CourseProgramsList organizationId={organizationId} />
            )}

            {activeTab === "journals" && (
              <div className="bg-card rounded-xl lg:rounded-2xl border border-border p-4 lg:p-6">
                <JournalsManager organizationId={organizationId!} />
              </div>
            )}

            {activeTab === "frdo" && (
              <div className="bg-card rounded-xl lg:rounded-2xl border border-border p-4 lg:p-6">
                <FRDOManager organizationId={organizationId!} />
              </div>
            )}

            {activeTab === "payers" && (
              <PayersSection organizationId={organizationId} />
            )}

            {activeTab === "billing" && (
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
                                <Button variant="ghost" size="sm" title="Просмотр" onClick={() => handleViewDoc(doc)}>
                                  <Eye className="w-4 h-4" />
                                </Button>
                                <Button variant="ghost" size="sm" title="Скачать" onClick={() => handleDownloadDoc(doc)}>
                                  <Download className="w-4 h-4" />
                                </Button>
                                <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" title="Удалить" onClick={() => handleDeleteBillingDoc(doc)}>
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
            )}
          </div>
        </div>
      </div>

      {/* Act Generation Dialog */}
      <Dialog open={showActDialog} onOpenChange={setShowActDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Сформировать акт</DialogTitle>
            <DialogDescription>
              Акт выполненных работ — предоставление доступа к платформе Sintagma
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Дата акта</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !actDate && "text-muted-foreground")}>
                    <Calendar className="mr-2 h-4 w-4" />
                    {actDate ? format(actDate, "d MMMM yyyy", { locale: ru }) : "Выберите дату"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <CalendarComponent
                    mode="single"
                    selected={actDate}
                    onSelect={(d) => d && setActDate(d)}
                    initialFocus
                    className={cn("p-3 pointer-events-auto")}
                  />
                </PopoverContent>
              </Popover>
            </div>
            <div className="space-y-2">
              <Label>Основание (номер договора или счёта)</Label>
              <Input
                placeholder="Например: Договор №12 от 01.01.2025"
                value={actBasis}
                onChange={e => setActBasis(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Сумма, руб.</Label>
              <Input
                type="number"
                placeholder="0.00"
                value={actAmount}
                onChange={e => setActAmount(e.target.value)}
                min="0"
                step="0.01"
              />
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="actOtherCustomer"
                checked={actOtherCustomer}
                onChange={e => {
                  setActOtherCustomer(e.target.checked);
                  if (!e.target.checked) {
                    setActCustomerName("");
                    setActCustomerInn("");
                    setActCustomerKpp("");
                    setActCustomerDirector("");
                    setActCustomerPosition("");
                  }
                }}
                className="rounded border-input"
              />
              <Label htmlFor="actOtherCustomer" className="text-sm cursor-pointer">Заказчик — другая организация</Label>
            </div>
            {actOtherCustomer && (
              <div className="space-y-3 p-3 rounded-lg border border-border bg-muted/30">
                <div className="space-y-2">
                  <Label>ИНН заказчика</Label>
                  <div className="flex gap-2">
                    <Input
                      placeholder="Введите ИНН"
                      value={actCustomerInn}
                      onChange={e => setActCustomerInn(e.target.value)}
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleActSearchByInn(actCustomerInn)}
                      disabled={actInnSearching || actCustomerInn.length < 10}
                    >
                      {actInnSearching ? "Поиск..." : "Найти"}
                    </Button>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Название организации</Label>
                  <Input
                    placeholder="ООО «Компания»"
                    value={actCustomerName}
                    onChange={e => setActCustomerName(e.target.value)}
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>КПП</Label>
                    <Input
                      placeholder="КПП"
                      value={actCustomerKpp}
                      onChange={e => setActCustomerKpp(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Должность руководителя</Label>
                    <Input
                      placeholder="Генеральный директор"
                      value={actCustomerPosition}
                      onChange={e => setActCustomerPosition(e.target.value)}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>ФИО руководителя</Label>
                  <Input
                    placeholder="Иванов Иван Иванович"
                    value={actCustomerDirector}
                    onChange={e => setActCustomerDirector(e.target.value)}
                  />
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowActDialog(false)}>Отмена</Button>
            <Button onClick={handleGenerateAct} disabled={actSubmitting || !actBasis || !actAmount || (actOtherCustomer && !actCustomerName)}>
              {actSubmitting ? "Генерация..." : "Создать акт"}
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
              <Printer className="w-4 h-4" />Печать
            </Button>
            <Button className="gap-1.5" onClick={() => handleSavePendingAct('download')}>
              <Download className="w-4 h-4" />Скачать
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Invoice Generation Dialog */}
      <Dialog open={showInvoiceDialog} onOpenChange={setShowInvoiceDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Сформировать счёт</DialogTitle>
            <DialogDescription>
              Счёт на оплату подписки платформы Sintagma
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="otherPayer"
                checked={invoiceOtherPayer}
                onChange={e => {
                  setInvoiceOtherPayer(e.target.checked);
                  if (!e.target.checked) {
                    setInvoiceBuyerName("");
                    setInvoiceBuyerInn("");
                    setInvoiceBuyerKpp("");
                  }
                }}
                className="rounded border-input"
              />
              <Label htmlFor="otherPayer" className="text-sm cursor-pointer">Плательщик — другая организация</Label>
            </div>
            {invoiceOtherPayer && (
              <div className="space-y-3 p-3 rounded-lg border border-border bg-muted/30">
                <div className="space-y-2">
                  <Label>ИНН плательщика</Label>
                  <div className="flex gap-2">
                    <Input
                      placeholder="Введите ИНН"
                      value={invoiceBuyerInn}
                      onChange={e => setInvoiceBuyerInn(e.target.value)}
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleSearchByInn(invoiceBuyerInn)}
                      disabled={innSearching || invoiceBuyerInn.length < 10}
                    >
                      {innSearching ? "Поиск..." : "Найти"}
                    </Button>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Название организации</Label>
                  <Input
                    placeholder="ООО «Компания»"
                    value={invoiceBuyerName}
                    onChange={e => setInvoiceBuyerName(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>КПП</Label>
                  <Input
                    placeholder="КПП (необязательно)"
                    value={invoiceBuyerKpp}
                    onChange={e => setInvoiceBuyerKpp(e.target.value)}
                  />
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowInvoiceDialog(false)}>Отмена</Button>
            <Button
              onClick={handleGenerateInvoiceFromDocs}
              disabled={generatingInvoice || (invoiceOtherPayer && !invoiceBuyerName)}
            >
              {generatingInvoice ? "Создание..." : "Создать счёт"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
});
