import React, { useState, useEffect, useMemo, lazy, Suspense } from "react";
import {
  ClipboardList, Award, GraduationCap, FileCheck,
  FileText, Upload, BookOpen, Wrench, Building2, ScrollText,
  FolderOpen, Database, FileSignature, ShieldCheck, Inbox, BarChart3, Trash2,
  ChevronDown, ArrowUpRight
} from "lucide-react";
import { JournalsManager } from "@/components/organization/JournalsManager";
import { FRDOManager } from "@/components/organization/FRDOManager";
import { Button } from "@/components/ui/button";
import { OrgDocumentsManager } from "@/components/organization/OrgDocumentsManager";
import { DocumentArchiveView } from "@/components/organization/DocumentArchiveView";
import { EducationDocumentsJournal } from "@/components/organization/EducationDocumentsJournal";
import { CourseProgramsList } from "@/components/organization/CourseProgramsList";
import { ContractGenerator } from "@/components/organization/ContractGenerator";
import { SignaturesJournal } from "@/components/signing/SignaturesJournal";
import { DataSubjectRequestsManager } from "@/components/organization/DataSubjectRequestsManager";
import { IncomingDocumentsManager } from "@/components/organization/IncomingDocumentsManager";
// DocumentsKpiDashboard pulls in recharts (~200KB) — load it only when the KPI section renders
const DocumentsKpiDashboard = lazy(() => import("@/components/organization/DocumentsKpiDashboard").then(m => ({ default: m.DocumentsKpiDashboard })));
import { RecycleBinManager } from "@/components/organization/RecycleBinManager";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useDocumentsTab, type DocumentSubTab } from "@/hooks/useDocumentsTab";
import { useOrgDashboard } from "@/contexts/OrgDashboardContext";
import { CounterpartiesSection } from "./documents/CounterpartiesSection";
import { ConstructorSection } from "./documents/ConstructorSection";
import { DocumentDialogs } from "./documents/DocumentDialogs";

// Подпункты группы «Документы организации» (второй уровень)
type OrgDocSubValue = Extract<
  DocumentSubTab,
  "programs" | "journals" | "frdo" | "testimonials" | "diplomas" | "certificates" | "protocols" | "orders" | "org" | "pd_requests"
>;

const ORG_DOCS_SUBITEMS: { value: OrgDocSubValue; label: string; icon: React.ElementType; ordersOnly?: boolean; iconColor?: string }[] = [
  { value: "programs", label: "Программы", icon: BookOpen },
  { value: "journals", label: "Журналы", icon: ClipboardList, iconColor: "text-amber-500" },
  { value: "frdo", label: "ФИС ФРДО", icon: Database, iconColor: "text-violet-500" },
  { value: "testimonials", label: "Свидетельства", icon: FileCheck, iconColor: "text-rose-500" },
  { value: "diplomas", label: "Дипломы", icon: GraduationCap, iconColor: "text-blue-500" },
  { value: "certificates", label: "Удостоверения", icon: Award, iconColor: "text-emerald-500" },
  { value: "protocols", label: "Протоколы АК", icon: ClipboardList, iconColor: "text-violet-500" },
  { value: "orders", label: "Приказы", icon: ScrollText, ordersOnly: true, iconColor: "text-amber-500" },
  { value: "org", label: "Документы орг.", icon: FileText, iconColor: "text-primary/70" },
  { value: "pd_requests", label: "Запросы ПД", icon: ShieldCheck, iconColor: "text-emerald-500" },
];

// Корневые горизонтальные пункты (верхний ряд)
type RootValue = "kpi" | "counterparties" | "incoming" | "org_docs" | "signatures" | "constructor" | "recycle_bin";

const ROOT_ITEMS: { value: RootValue; label: string; icon: React.ElementType; iconColor?: string }[] = [
  { value: "kpi", label: "Сводка", icon: BarChart3, iconColor: "text-primary" },
  { value: "counterparties", label: "Контрагенты", icon: Building2 },
  { value: "incoming", label: "Входящие", icon: Inbox, iconColor: "text-cyan-500" },
  { value: "org_docs", label: "Документы организации", icon: FolderOpen, iconColor: "text-amber-500" },
  { value: "signatures", label: "Подписания", icon: FileSignature, iconColor: "text-indigo-500" },
  { value: "constructor", label: "Конструктор", icon: Wrench },
  { value: "recycle_bin", label: "Корзина", icon: Trash2, iconColor: "text-muted-foreground" },
];

const SECTION_DESCRIPTIONS: Partial<Record<DocumentSubTab, string>> = {
  kpi: "Ключевые метрики документооборота: подписания, выдачи, конверсии, истекающие сроки",
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
  counterparties: "Договоры, счета и закрывающие документы с контрагентами",
  signatures: "Журнал отправленных на подписание документов и доказательства подписей",
  pd_requests: "Запросы субъектов ПД по 152-ФЗ — отзыв согласия, удаление, копия данных. Срок ответа 30 дней.",
  incoming: "Сканы подписанных контрагентом экземпляров — для двустороннего документооборота",
  recycle_bin: "Удалённые документы хранятся 30 дней. Восстановление возвращает их в исходный раздел.",
};

interface DocumentsTabProps {
  organizationId: string | null;
  organizationName?: string;
  onShowBulkUploadDialog?: () => void;
  isOrdersEnabled?: boolean;
  onNavigateToSubscription?: () => void;
}

export const DocumentsTab = React.memo(function DocumentsTab({ organizationId, organizationName, onShowBulkUploadDialog, isOrdersEnabled = true, onNavigateToSubscription }: DocumentsTabProps) {
  const h = useDocumentsTab(organizationId, organizationName);
  const dashboard = useOrgDashboard();

  // Deep-link from Sales: старые маркеры (КП/договоры) теперь ведут в раздел «Продажи»
  useEffect(() => {
    try {
      const dl = localStorage.getItem("documents.deepLink");
      if (dl === "proposals" || dl === "sales_contracts") {
        localStorage.removeItem("documents.deepLink");
        dashboard?.tabNavigation?.setActiveTab?.("sales" as any);
      }
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const visibleOrgSubs = useMemo(
    () => ORG_DOCS_SUBITEMS.filter(i => !i.ordersOnly || isOrdersEnabled),
    [isOrdersEnabled]
  );
  const orgSubValues = useMemo(() => visibleOrgSubs.map(i => i.value as string), [visibleOrgSubs]);

  // Вычисляем активный корневой пункт
  const activeRoot: RootValue = useMemo(() => {
    if (orgSubValues.includes(h.activeTab as string)) return "org_docs";
    const rootValues = ROOT_ITEMS.map(r => r.value) as string[];
    if (rootValues.includes(h.activeTab as string)) return h.activeTab as RootValue;
    return "kpi";
  }, [h.activeTab, orgSubValues]);

  const activeOrgSub = orgSubValues.includes(h.activeTab as string)
    ? (h.activeTab as OrgDocSubValue)
    : null;

  const activeItemMeta = useMemo(() => {
    const sub = ORG_DOCS_SUBITEMS.find(i => i.value === h.activeTab);
    if (sub) return { label: sub.label, icon: sub.icon };
    const root = ROOT_ITEMS.find(r => r.value === h.activeTab);
    if (root) return { label: root.label, icon: root.icon };
    return { label: "Сводка", icon: BarChart3 };
  }, [h.activeTab]);
  const ActiveIcon = activeItemMeta.icon;

  if (!organizationId) {
    return <div className="text-center py-12 text-muted-foreground">Организация не найдена</div>;
  }

  const handleRootClick = (value: RootValue) => {
    if (value === "org_docs") {
      if (!activeOrgSub && visibleOrgSubs[0]) h.setActiveTab(visibleOrgSubs[0].value);
      return;
    }
    h.setActiveTab(value as DocumentSubTab);
  };

  const goToSales = () => dashboard?.tabNavigation?.setActiveTab?.("sales" as any);

  return (
    <div className="space-y-0">
      {/* Горизонтальная навигация — верхний ряд */}
      <div className="bg-card rounded-t-2xl border border-border border-b-0">
        <div className="relative">
          <div className="flex overflow-x-auto gap-1.5 p-2 scrollbar-thin">
            {ROOT_ITEMS.map(item => {
              const Icon = item.icon;
              const isActive = activeRoot === item.value;
              const isOrgDocs = item.value === "org_docs";
              return (
                <button
                  key={item.value}
                  onClick={() => handleRootClick(item.value)}
                  className={cn(
                    "flex items-center gap-1.5 px-3.5 py-2 text-sm font-medium rounded-xl whitespace-nowrap transition-all shrink-0",
                    isActive
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted/60"
                  )}
                >
                  <Icon className={cn("w-4 h-4", isActive ? "" : item.iconColor)} />
                  <span>{item.label}</span>
                  {isOrgDocs && <ChevronDown className="w-3.5 h-3.5 opacity-70" />}
                </button>
              );
            })}

            {/* Подсказка-ссылка на «Продажи» */}
            <div className="ml-auto hidden md:flex items-center pr-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={goToSales}
                className="text-xs gap-1 text-muted-foreground hover:text-primary"
              >
                <ArrowUpRight className="w-3.5 h-3.5" />
                КП и договоры — в разделе «Продажи»
              </Button>
            </div>
          </div>
          <div className="pointer-events-none absolute right-0 top-0 bottom-0 w-8 bg-gradient-to-l from-card to-transparent md:hidden" />
        </div>

        {/* Второй уровень — подпункты «Документы организации» */}
        {activeRoot === "org_docs" && (
          <div className="border-t border-border/60 bg-muted/30 relative">
            <div className="flex overflow-x-auto gap-1 p-2 scrollbar-thin">
              {visibleOrgSubs.map(sub => {
                const Icon = sub.icon;
                const isActive = h.activeTab === sub.value;
                return (
                  <button
                    key={sub.value}
                    onClick={() => h.setActiveTab(sub.value)}
                    className={cn(
                      "flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg whitespace-nowrap transition-colors shrink-0",
                      isActive
                        ? "bg-background text-foreground shadow-sm border border-border"
                        : "text-muted-foreground hover:text-foreground hover:bg-background/60"
                    )}
                  >
                    <Icon className={cn("w-3.5 h-3.5", isActive ? "text-primary" : sub.iconColor)} />
                    <span>{sub.label}</span>
                  </button>
                );
              })}
            </div>
            <div className="pointer-events-none absolute right-0 top-0 bottom-0 w-8 bg-gradient-to-l from-muted/30 to-transparent md:hidden" />
          </div>
        )}
      </div>

      {/* Контент */}
      <div className="bg-card rounded-b-2xl border border-border border-t-0 min-h-[600px]">
        <div className="flex items-center justify-between gap-3 px-4 lg:px-6 py-4 border-b border-border">
          <div className="min-w-0">
            <h2 className="text-base font-semibold flex items-center gap-2">
              <ActiveIcon className="w-4 h-4 text-primary shrink-0" />
              <span className="truncate">{activeItemMeta.label}</span>
            </h2>
            {SECTION_DESCRIPTIONS[h.activeTab] && (
              <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
                {SECTION_DESCRIPTIONS[h.activeTab]}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {onShowBulkUploadDialog && h.activeTab === "org" && (
              <Button variant="outline" size="sm" className="rounded-xl gap-1.5" onClick={onShowBulkUploadDialog}>
                <Upload className="w-3.5 h-3.5" /><span className="hidden sm:inline">Массовая загрузка</span>
              </Button>
            )}
          </div>
        </div>

        <div className="p-4 lg:p-6">
          {h.activeTab === "kpi" && (
            <DocumentsKpiDashboard
              organizationId={organizationId}
              onNavigate={(tab, prefilter) => h.setActiveTab(tab as DocumentSubTab, prefilter)}
            />
          )}
          {h.activeTab === "constructor" && (
            <ConstructorSection
              organizationId={organizationId}
              organizationName={organizationName}
              constructorTab={h.constructorTab}
              setConstructorTab={h.setConstructorTab}
              stampUrl={h.stampUrl}
              signatureUrl={h.signatureUrl}
              onStampUpload={h.handleStampUpload}
              onSignatureUpload={h.handleSignatureUpload}
              onStampRemove={h.handleStampRemove}
              onSignatureRemove={h.handleSignatureRemove}
              onOpenContractEditor={() => h.d.tabNavigation.setActiveTab("contract-editor" as any)}
            />
          )}
          {h.activeTab === "org" && <OrgDocumentsManager organizationId={organizationId} />}
          {h.activeTab === "orders" && isOrdersEnabled && <DocumentArchiveView organizationId={organizationId} categoryId="enrollment_orders" title="Приказы о зачислении / отчислении" docTypes={["enrollment_order", "expulsion_order"]} />}
          {h.activeTab === "protocols" && <DocumentArchiveView organizationId={organizationId} categoryId="attestation_protocols" title="Протоколы аттестационной комиссии" docTypes={["attestation_protocol"]} />}
          {h.activeTab === "certificates" && <EducationDocumentsJournal organizationId={organizationId} onClose={() => {}} documentTypeFilter="certificate" onOpenFrdoTab={() => h.setActiveTab("frdo")} />}
          {h.activeTab === "diplomas" && <EducationDocumentsJournal organizationId={organizationId} onClose={() => {}} documentTypeFilter="diploma" onOpenFrdoTab={() => h.setActiveTab("frdo")} />}
          {h.activeTab === "testimonials" && <EducationDocumentsJournal organizationId={organizationId} onClose={() => {}} documentTypeFilter="qualification" onOpenFrdoTab={() => h.setActiveTab("frdo")} />}
          {h.activeTab === "programs" && <CourseProgramsList organizationId={organizationId} />}
          {h.activeTab === "journals" && <JournalsManager organizationId={organizationId!} />}
          {h.activeTab === "frdo" && <FRDOManager organizationId={organizationId!} />}
          {h.activeTab === "signatures" && (
            <SignaturesJournal
              organizationId={organizationId}
              initialStatus={h.tabPrefilters.signatures?.status}
            />
          )}
          {h.activeTab === "pd_requests" && <DataSubjectRequestsManager organizationId={organizationId} />}
          {h.activeTab === "incoming" && <IncomingDocumentsManager organizationId={organizationId} />}
          {h.activeTab === "recycle_bin" && <RecycleBinManager organizationId={organizationId} />}
          {h.activeTab === "counterparties" && (
            <CounterpartiesSection
              organizationId={organizationId}
              counterpartySubTab={h.counterpartySubTab}
              setCounterpartySubTab={h.setCounterpartySubTab}
              counterpartyDocs={h.counterpartyDocs}
              counterpartyLoading={h.counterpartyLoading}
              onCreateContract={() => h.setShowContractGenerator(true)}
              invoices={h.invoices}
              billingDocs={h.billingDocs}
              onViewDoc={h.handleViewDoc}
              onDownloadDoc={h.handleDownloadDoc}
              onDeleteDoc={h.handleDeleteBillingDoc}
              onShowInvoiceDialog={() => h.setShowInvoiceDialog(true)}
              onShowActDialog={() => h.setShowActDialog(true)}
            />
          )}
        </div>
      </div>

      <DocumentDialogs
        showActDialog={h.showActDialog} setShowActDialog={h.setShowActDialog}
        actDate={h.actDate} setActDate={h.setActDate}
        actBasis={h.actBasis} setActBasis={h.setActBasis}
        actAmount={h.actAmount} setActAmount={h.setActAmount}
        actSubmitting={h.actSubmitting}
        actOtherCustomer={h.actOtherCustomer} setActOtherCustomer={h.setActOtherCustomer}
        actCustomerName={h.actCustomerName} setActCustomerName={h.setActCustomerName}
        actCustomerInn={h.actCustomerInn} setActCustomerInn={h.setActCustomerInn}
        actCustomerKpp={h.actCustomerKpp} setActCustomerKpp={h.setActCustomerKpp}
        actCustomerDirector={h.actCustomerDirector} setActCustomerDirector={h.setActCustomerDirector}
        actCustomerPosition={h.actCustomerPosition} setActCustomerPosition={h.setActCustomerPosition}
        actInnSearching={h.actInnSearching}
        onActSearchByInn={h.handleActSearchByInn}
        onGenerateAct={h.handleGenerateAct}
        pendingAct={h.pendingAct} setPendingAct={h.setPendingAct}
        onSavePendingAct={h.handleSavePendingAct}
        showInvoiceDialog={h.showInvoiceDialog} setShowInvoiceDialog={h.setShowInvoiceDialog}
        invoiceOtherPayer={h.invoiceOtherPayer} setInvoiceOtherPayer={h.setInvoiceOtherPayer}
        invoiceBuyerName={h.invoiceBuyerName} setInvoiceBuyerName={h.setInvoiceBuyerName}
        invoiceBuyerInn={h.invoiceBuyerInn} setInvoiceBuyerInn={h.setInvoiceBuyerInn}
        invoiceBuyerKpp={h.invoiceBuyerKpp} setInvoiceBuyerKpp={h.setInvoiceBuyerKpp}
        innSearching={h.innSearching}
        onSearchByInn={h.handleSearchByInn}
        generatingInvoice={h.generatingInvoice}
        onGenerateInvoice={h.handleGenerateInvoiceFromDocs}
        pendingInvoice={h.pendingInvoice} setPendingInvoice={h.setPendingInvoice}
        onSavePendingInvoice={h.handleSavePendingInvoice}
      />

      {h.orgRequisites && organizationId && (
        <ContractGenerator
          organizationId={organizationId}
          isOpen={h.showContractGenerator}
          onClose={() => h.setShowContractGenerator(false)}
          orgRequisites={h.orgRequisites}
          onSave={async (html, contractNumber, companyName, courseId, amount, studentsCount, contractDate) => {
            const { data: companies } = await supabase.from("companies").select("id").eq("organization_id", organizationId).ilike("name", companyName).limit(1);
            const companyId = companies?.[0]?.id;
            if (companyId) {
              await supabase.from("company_documents").insert({
                company_id: companyId,
                name: `Договор №${contractNumber} — ${companyName}`,
                type: "contract",
                contract_number: contractNumber,
                contract_date: contractDate,
                amount,
                students_count: studentsCount,
                course_id: courseId || null,
              });
              await h.refreshCounterpartyDocs();
              toast.success("Договор сохранён");
            }
            h.setShowContractGenerator(false);
          }}
        />
      )}
    </div>
  );
});
