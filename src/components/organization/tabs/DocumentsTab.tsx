import React, { useState, useEffect } from "react";
import {
  Users, ClipboardList, Award, GraduationCap, FileCheck,
  FileText, Upload, BookOpen, Wrench, Building2, ScrollText,
  Lock, ArrowUpRight, FolderOpen, Receipt, Database, FileSignature, ShieldCheck, Inbox, BarChart3, Trash2,
  PanelLeftClose, PanelLeftOpen, Briefcase, Send
} from "lucide-react";
import { OrgProposalsManager } from "@/components/organization/sales/OrgProposalsManager";
import { OrgContractsManager } from "@/components/organization/sales/OrgContractsManager";
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
import { DocumentsKpiDashboard } from "@/components/organization/DocumentsKpiDashboard";
import { RecycleBinManager } from "@/components/organization/RecycleBinManager";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useDocumentsTab, type DocumentSubTab } from "@/hooks/useDocumentsTab";
import { CounterpartiesSection } from "./documents/CounterpartiesSection";
import { ConstructorSection } from "./documents/ConstructorSection";
import { DocumentDialogs } from "./documents/DocumentDialogs";

const NAV_ITEMS: { value: DocumentSubTab; label: string; icon: React.ElementType; ordersOnly?: boolean; iconColor?: string; group?: string }[] = [
  { value: "kpi", label: "Сводка / KPI", icon: BarChart3, iconColor: "text-primary", group: "platform" },
  { value: "counterparties", label: "Контрагенты", icon: Building2, group: "platform" },
  { value: "incoming", label: "Входящие", icon: Inbox, iconColor: "text-cyan-500", group: "platform" },
  { value: "orders", label: "Приказы", icon: ScrollText, ordersOnly: true, iconColor: "text-amber-500", group: "docs" },
  { value: "protocols", label: "Протоколы АК", icon: ClipboardList, iconColor: "text-violet-500", group: "docs" },
  { value: "certificates", label: "Удостоверения", icon: Award, iconColor: "text-emerald-500", group: "docs" },
  { value: "diplomas", label: "Дипломы", icon: GraduationCap, iconColor: "text-blue-500", group: "docs" },
  { value: "testimonials", label: "Свидетельства", icon: FileCheck, iconColor: "text-rose-500", group: "docs" },
  { value: "proposals", label: "Коммерч. предложения", icon: Send, iconColor: "text-fuchsia-500", group: "commerce" },
  { value: "sales_contracts", label: "Договоры (продажи)", icon: Briefcase, iconColor: "text-indigo-500", group: "commerce" },
  { value: "programs", label: "Программы", icon: BookOpen, group: "tools" },
  { value: "journals", label: "Журналы", icon: ClipboardList, iconColor: "text-amber-500", group: "tools" },
  { value: "frdo", label: "ФИС ФРДО", icon: Database, iconColor: "text-violet-500", group: "tools" },
  { value: "constructor", label: "Конструктор", icon: Wrench, group: "tools" },
  { value: "org", label: "Документы орг.", icon: FileText, iconColor: "text-primary/70", group: "tools" },
  { value: "signatures", label: "Подписания", icon: FileSignature, iconColor: "text-indigo-500", group: "tools" },
  { value: "pd_requests", label: "Запросы ПД", icon: ShieldCheck, iconColor: "text-emerald-500", group: "tools" },
  { value: "recycle_bin", label: "Корзина", icon: Trash2, iconColor: "text-muted-foreground", group: "tools" },
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
  proposals: "Коммерческие предложения (КП) — артефакты воронки продаж. Активная работа с лидами — в разделе «Продажи».",
  sales_contracts: "Договоры из CRM-воронки. Версионирование, статусы, share-ссылки. Подписания — в разделе «Подписания».",
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
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(() => {
    try { return localStorage.getItem("documents.sidebar.collapsed") === "1"; } catch { return false; }
  });
  useEffect(() => {
    try { localStorage.setItem("documents.sidebar.collapsed", sidebarCollapsed ? "1" : "0"); } catch {}
  }, [sidebarCollapsed]);

  if (!organizationId) {
    return <div className="text-center py-12 text-muted-foreground">Организация не найдена</div>;
  }

  const visibleItems = NAV_ITEMS.filter(item => !item.ordersOnly || isOrdersEnabled);
  // Fallback to first item (kpi) if active tab was disabled by plan/visibility change
  const activeItem = visibleItems.find(i => i.value === h.activeTab) || visibleItems[0] || NAV_ITEMS[0];
  const ActiveIcon = activeItem.icon;

  return (
    <div className="space-y-0">
      <div className="flex flex-col lg:flex-row gap-0 min-h-[600px]">
        {/* Left sidebar navigation */}
        <nav className={cn(
          "shrink-0 border-b lg:border-b-0 lg:border-r border-border bg-card lg:rounded-l-2xl transition-[width] duration-200",
          sidebarCollapsed ? "lg:w-14" : "lg:w-52 xl:w-60"
        )}>
          {/* Mobile horizontal tab bar with right fade */}
          <div className="lg:hidden relative">
            <div className="flex overflow-x-auto gap-1 p-2 scrollbar-thin">
              {visibleItems.map(item => {
                const Icon = item.icon;
                const isActive = h.activeTab === item.value;
                return (
                  <button key={item.value} onClick={() => h.setActiveTab(item.value)} className={cn(
                    "flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg whitespace-nowrap transition-colors shrink-0",
                    isActive ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                  )}>
                    <Icon className="w-3.5 h-3.5" />
                    {item.label}
                  </button>
                );
              })}
            </div>
            {/* Right edge fade indicator — hints there's more to scroll */}
            <div className="pointer-events-none absolute right-0 top-0 bottom-0 w-8 bg-gradient-to-l from-card to-transparent" />
          </div>
          <div className="hidden lg:flex flex-col py-3 bg-gradient-to-b from-card to-muted/20">
            {(() => {
              let lastGroup = "";
              return visibleItems.map((item, idx) => {
                const Icon = item.icon;
                const isActive = h.activeTab === item.value;
                const showDivider = item.group && item.group !== lastGroup && idx > 0;
                const groupLabel = item.group === "docs" && lastGroup !== "docs" ? "Документооборот" : item.group === "commerce" && lastGroup !== "commerce" ? "Коммерческие" : item.group === "tools" && lastGroup !== "tools" ? "Инструменты" : null;
                lastGroup = item.group || "";
                return (
                  <React.Fragment key={item.value}>
                    {showDivider && !sidebarCollapsed && (
                      <div className="px-4 pt-3 pb-1">
                        <div className="h-px bg-border/60" />
                        {groupLabel && <span className="text-[10px] uppercase tracking-wider text-muted-foreground/60 font-semibold mt-2 block">{groupLabel}</span>}
                      </div>
                    )}
                    {showDivider && sidebarCollapsed && (
                      <div className="px-2 py-1.5"><div className="h-px bg-border/60" /></div>
                    )}
                    <button
                      onClick={() => h.setActiveTab(item.value)}
                      title={sidebarCollapsed ? item.label : undefined}
                      className={cn(
                        "flex items-center gap-2.5 text-sm font-medium text-left transition-all duration-200 group",
                        sidebarCollapsed ? "justify-center px-0 py-2.5 mx-2 rounded-lg" : "px-4 py-2.5",
                        isActive
                          ? sidebarCollapsed
                            ? "bg-primary/15 text-primary"
                            : "bg-primary/15 text-primary border-r-2 border-primary"
                          : "text-muted-foreground hover:text-primary hover:bg-primary/10",
                        !isActive && !sidebarCollapsed && "hover:translate-x-0.5"
                      )}
                    >
                      <Icon className={cn("w-4 h-4 shrink-0 transition-colors duration-200", isActive ? "text-primary" : item.iconColor || "group-hover:text-primary")} />
                      {!sidebarCollapsed && <span className="truncate">{item.label}</span>}
                    </button>
                  </React.Fragment>
                );
              });
            })()}
          </div>
        </nav>

        {/* Right content panel */}
        <div className="flex-1 min-w-0 bg-card lg:rounded-r-2xl border-l-0">
          <div className="flex items-center justify-between gap-3 px-4 lg:px-6 py-4 border-b border-border">
            <div className="flex items-center gap-2 min-w-0">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setSidebarCollapsed(v => !v)}
                className="hidden lg:inline-flex h-8 w-8 shrink-0"
                title={sidebarCollapsed ? "Развернуть меню" : "Свернуть меню"}
              >
                {sidebarCollapsed ? <PanelLeftOpen className="w-4 h-4" /> : <PanelLeftClose className="w-4 h-4" />}
              </Button>
              <div className="min-w-0">
                <h2 className="text-base font-semibold flex items-center gap-2">
                  <ActiveIcon className="w-4 h-4 text-primary shrink-0" />
                  <span className="truncate">{activeItem.label}</span>
                </h2>
                {SECTION_DESCRIPTIONS[h.activeTab] && <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{SECTION_DESCRIPTIONS[h.activeTab]}</p>}
              </div>
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
            {h.activeTab === "proposals" && <OrgProposalsManager organizationId={organizationId} />}
            {h.activeTab === "sales_contracts" && <OrgContractsManager organizationId={organizationId} />}
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
