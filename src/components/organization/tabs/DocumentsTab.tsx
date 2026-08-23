import React, { useCallback, useEffect, useMemo, lazy, Suspense } from "react";
import { useSearchParams } from "react-router-dom";
import {
  ClipboardList, Award, GraduationCap, FileCheck,
  FileText, Upload, BookOpen, Wrench, Building2, ScrollText,
  FolderOpen, Database, FileSignature, ShieldCheck, Inbox, BarChart3, Trash2,
  ChevronDown, ArrowLeft, ArrowUpRight, LayoutGrid
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
import { CounterpartiesSection } from "./documents/CounterpartiesSection";
import { ConstructorSection } from "./documents/ConstructorSection";
import { DocumentDialogs } from "./documents/DocumentDialogs";
import { TestInboxButton } from "@/components/organization/documents/TestInboxButton";
import { useStaffPermissions } from "@/hooks/useStaffPermissions";
import { canAccessDocumentSubTab } from "@/lib/organization/documentNavigationPermissions";
import {
  readCounterpartyView,
  readDocumentView,
  setDocumentViewParams,
} from "@/lib/organization/documentWorkspaceNavigation";
import type { CounterpartySubTab } from "@/hooks/useDocumentsTab";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

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

interface DocumentsTabContentProps extends DocumentsTabProps {
  canReadJournals: boolean;
  canReadFrdo: boolean;
  canReadSales: boolean;
  canReadStudents: boolean;
  canReadCompanies: boolean;
  canWriteDocuments: boolean;
  canConfigureDocuments: boolean;
}

function DocumentsTabContent({
  organizationId,
  organizationName,
  onShowBulkUploadDialog,
  isOrdersEnabled = true,
  onNavigateToSubscription,
  canReadJournals,
  canReadFrdo,
  canReadSales,
  canReadStudents,
  canReadCompanies,
  canWriteDocuments,
  canConfigureDocuments,
}: DocumentsTabContentProps) {
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedDocumentView = readDocumentView(searchParams);
  const requestedCounterpartyView = readCounterpartyView(searchParams);

  const canOpenDocumentView = useCallback((tab: DocumentSubTab) => {
    if (tab === "orders") return isOrdersEnabled;
    if (tab === "journals") return canReadJournals;
    if (tab === "frdo") return canReadFrdo;
    if (tab === "counterparties") return canReadCompanies;
    if (tab === "constructor") return canConfigureDocuments;
    return true;
  }, [canConfigureDocuments, canReadCompanies, canReadFrdo, canReadJournals, isOrdersEnabled]);

  const documentView = requestedDocumentView && canOpenDocumentView(requestedDocumentView)
    ? requestedDocumentView
    : null;
  const counterpartyView = documentView === "counterparties"
    ? requestedCounterpartyView
    : "contracts";

  const setDocumentWorkspace = useCallback((
    tab: DocumentSubTab | null,
    requestedCounterpartyTab?: CounterpartySubTab,
  ) => {
    if (tab && !canOpenDocumentView(tab)) return;
    setSearchParams(
      (current) => setDocumentViewParams(current, tab, requestedCounterpartyTab),
    );
  }, [canOpenDocumentView, setSearchParams]);

  const setCounterpartyWorkspace = useCallback((tab: CounterpartySubTab) => {
    setDocumentWorkspace("counterparties", tab);
  }, [setDocumentWorkspace]);

  const h = useDocumentsTab(organizationId, organizationName, {
    activeTab: documentView ?? "kpi",
    onActiveTabChange: (tab) => setDocumentWorkspace(tab),
    counterpartySubTab: counterpartyView,
    onCounterpartySubTabChange: setCounterpartyWorkspace,
  });

  // Invalid, stale and newly forbidden nested routes fall back to the hub.
  // This also prevents a copied URL from mounting a workspace the staff member
  // can no longer access.
  useEffect(() => {
    const rawDocumentView = searchParams.get("documentView");
    const rawCounterpartyView = searchParams.get("counterpartyView");
    const invalidOrForbiddenDocumentView = Boolean(rawDocumentView) && !documentView;
    const invalidCounterpartyView = documentView === "counterparties"
      && Boolean(rawCounterpartyView)
      && rawCounterpartyView !== requestedCounterpartyView;
    const staleCounterpartyView = documentView !== "counterparties" && Boolean(rawCounterpartyView);

    if (!invalidOrForbiddenDocumentView && !invalidCounterpartyView && !staleCounterpartyView) return;

    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      if (invalidOrForbiddenDocumentView) next.delete("documentView");
      if (invalidOrForbiddenDocumentView || invalidCounterpartyView || staleCounterpartyView) {
        next.delete("counterpartyView");
      }
      return next;
    }, { replace: true });
  }, [documentView, requestedCounterpartyView, searchParams, setSearchParams]);

  // Deep-link from Sales / SubscriptionTab: старые маркеры (КП/договоры) теперь ведут в раздел «Продажи»,
  // маркер «open-act-dialog:<invoiceId>» открывает вкладку контрагентов → закрывающие и запускает диалог.
  useEffect(() => {
    try {
      const dl = localStorage.getItem("documents.deepLink");
      if (!dl) return;
      if (dl === "proposals" || dl === "sales_contracts") {
        localStorage.removeItem("documents.deepLink");
        if (canReadSales) {
          setSearchParams((current) => {
            const next = new URLSearchParams(current);
            next.set("tab", "sales");
            next.delete("documentView");
            next.delete("counterpartyView");
            return next;
          });
        }
        return;
      }
      if (dl.startsWith("open-act-dialog")) {
        localStorage.removeItem("documents.deepLink");
        setDocumentWorkspace("counterparties", "closing");
        const invId = dl.split(":")[1];
        // Ждём подгрузки счетов, потом открываем диалог с предзаполнением
        const timer = setInterval(() => {
          if (h.invoices && h.invoices.length > 0) {
            clearInterval(timer);
            const inv = invId ? h.invoices.find(i => i.id === invId) : h.invoices.find(i => i.status === "paid");
            if (inv) h.openActDialogForInvoice(inv);
            else h.setShowActDialog(true);
          }
        }, 200);
        setTimeout(() => clearInterval(timer), 5000);
        return;
      }
      if (dl === "open-invoice-dialog") {
        localStorage.removeItem("documents.deepLink");
        setDocumentWorkspace("counterparties", "invoices");
        h.setShowInvoiceDialog(true);
      }
    } catch {
      // Ignore an unavailable or malformed optional deep-link value.
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [h.invoices]);

  const visibleOrgSubs = useMemo(
    () => ORG_DOCS_SUBITEMS.filter((item) => {
      if (item.ordersOnly && !isOrdersEnabled) return false;
      if (item.value === "journals" && !canReadJournals) return false;
      if (item.value === "frdo" && !canReadFrdo) return false;
      return true;
    }),
    [canReadFrdo, canReadJournals, isOrdersEnabled]
  );
  const orgSubValues = useMemo(() => visibleOrgSubs.map(i => i.value as string), [visibleOrgSubs]);
  const visibleRootItems = useMemo(
    () => ROOT_ITEMS.filter((item) => {
      if (item.value === "counterparties") return canReadCompanies;
      if (item.value === "constructor") return canConfigureDocuments;
      return true;
    }),
    [canConfigureDocuments, canReadCompanies],
  );

  // Вычисляем активный корневой пункт
  const activeRoot: RootValue = useMemo(() => {
    if (orgSubValues.includes(h.activeTab as string)) return "org_docs";
    const rootValues = visibleRootItems.map(r => r.value) as string[];
    if (rootValues.includes(h.activeTab as string)) return h.activeTab as RootValue;
    return "kpi";
  }, [h.activeTab, orgSubValues, visibleRootItems]);

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

  const openWorkspace = (tab: DocumentSubTab | "students") => {
    if (tab === "students") {
      if (!canReadStudents) return;
      setSearchParams((current) => {
        const next = new URLSearchParams(current);
        next.set("tab", "students");
        next.delete("documentView");
        next.delete("counterpartyView");
        return next;
      });
      return;
    }
    setDocumentWorkspace(tab);
  };

  const handleRootClick = (value: RootValue) => {
    if (!visibleRootItems.some((item) => item.value === value)) return;
    if (value === "org_docs") {
      if (!activeOrgSub && visibleOrgSubs[0]) h.setActiveTab(visibleOrgSubs[0].value);
      return;
    }
    h.setActiveTab(value as DocumentSubTab);
  };

  const goToSales = () => {
    if (!canReadSales) return;
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      next.set("tab", "sales");
      next.delete("documentView");
      next.delete("counterpartyView");
      return next;
    });
  };

  if (!documentView) {
    const primaryWorkspaces = [
      {
        id: "students" as const,
        title: "Ученики и группы",
        description: "Личные дела, приказы, ведомости, протоколы и документы учебной группы",
        icon: FileText,
        visible: canReadStudents,
      },
      {
        id: "counterparties" as const,
        title: "Компании и расчёты",
        description: "Договоры, счета, акты и закрывающие документы заказчиков",
        icon: Building2,
        visible: canReadCompanies,
      },
      {
        id: "journals" as const,
        title: "Журналы",
        description: "Обязательные, автоматические и собственные журналы организации",
        icon: ClipboardList,
        visible: canReadJournals,
      },
      {
        id: "frdo" as const,
        title: "ФИС ФРДО",
        description: "Готовность сведений, проверка обязательных полей и выгрузка",
        icon: Database,
        visible: canReadFrdo,
      },
      {
        id: (visibleOrgSubs[0]?.value ?? "kpi") as DocumentSubTab,
        title: "Документы организации",
        description: "Программы, приказы, удостоверения, шаблоны и запросы персональных данных",
        icon: FolderOpen,
        visible: true,
      },
      {
        id: "constructor" as const,
        title: "Настройка документов",
        description: "Реквизиты, шаблоны, печать, подписи и правила автоматического заполнения",
        icon: Wrench,
        visible: canConfigureDocuments,
      },
    ].filter((workspace) => workspace.visible);

    return (
      <section className="space-y-5" data-testid="documents-workspace-chooser">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-primary">Управление</p>
            <h1 className="mt-1 font-display text-2xl font-bold tracking-tight lg:text-3xl">Документы</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Выберите рабочую задачу. Все прежние инструменты сохранены внутри разделов.
            </p>
          </div>
          <Button variant="outline" className="rounded-xl gap-2" onClick={() => openWorkspace("kpi")}>
            <BarChart3 className="h-4 w-4" /> Сводка документооборота
          </Button>
        </div>

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {primaryWorkspaces.map((workspace) => {
            const Icon = workspace.icon;
            return (
              <button
                key={`${workspace.id}-${workspace.title}`}
                type="button"
                onClick={() => openWorkspace(workspace.id)}
                className="group min-h-36 rounded-2xl border border-border bg-card p-5 text-left transition-all hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-md"
              >
                <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <Icon className="h-5 w-5" />
                </span>
                <span className="mt-4 block font-display text-base font-semibold">{workspace.title}</span>
                <span className="mt-1 block text-sm leading-relaxed text-muted-foreground">{workspace.description}</span>
                <span className="mt-4 inline-flex items-center gap-1 text-xs font-semibold text-primary">
                  Открыть <ArrowUpRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                </span>
              </button>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-border bg-muted/20 p-3">
          <span className="px-2 text-xs font-medium text-muted-foreground">Дополнительно:</span>
          <Button variant="ghost" size="sm" className="rounded-lg gap-1.5" onClick={() => openWorkspace("incoming")}>
            <Inbox className="h-3.5 w-3.5" /> Входящие
          </Button>
          <Button variant="ghost" size="sm" className="rounded-lg gap-1.5" onClick={() => openWorkspace("signatures")}>
            <FileSignature className="h-3.5 w-3.5" /> Подписания
          </Button>
          <Button variant="ghost" size="sm" className="rounded-lg gap-1.5" onClick={() => openWorkspace("recycle_bin")}>
            <Trash2 className="h-3.5 w-3.5" /> Корзина
          </Button>
        </div>
      </section>
    );
  }

  return (
    <div className="space-y-0">
      {/* Компактная контекстная навигация вместо семи равноправных вкладок. */}
      <div className="bg-card rounded-t-2xl border border-border border-b-0">
        <div className="flex flex-wrap items-center gap-3 p-3">
          <Button variant="ghost" size="sm" className="rounded-lg gap-1.5" onClick={() => setDocumentWorkspace(null)}>
            <ArrowLeft className="h-4 w-4" /> Все документы
          </Button>
          <div className="h-6 w-px bg-border" />
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <ActiveIcon className="h-4 w-4 shrink-0 text-primary" />
            <span className="truncate text-sm font-semibold">{activeItemMeta.label}</span>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="rounded-lg gap-1.5">
                <LayoutGrid className="h-3.5 w-3.5" /> Сменить раздел <ChevronDown className="h-3.5 w-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-64 rounded-xl">
              {visibleRootItems.map((item) => {
                const Icon = item.icon;
                return (
                  <DropdownMenuItem
                    key={item.value}
                    onClick={() => handleRootClick(item.value)}
                    className={cn("gap-2 rounded-lg", activeRoot === item.value && "bg-primary/10 text-primary")}
                  >
                    <Icon className={cn("h-4 w-4", item.iconColor)} />
                    {item.label}
                  </DropdownMenuItem>
                );
              })}
            </DropdownMenuContent>
          </DropdownMenu>
          {canReadSales && (
            <Button variant="ghost" size="sm" onClick={goToSales} className="hidden rounded-lg text-xs text-muted-foreground hover:text-primary lg:inline-flex">
              <ArrowUpRight className="mr-1 h-3.5 w-3.5" /> Продажи
            </Button>
          )}
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
            {canWriteDocuments && onShowBulkUploadDialog && h.activeTab === "org" && (
              <Button variant="outline" size="sm" className="rounded-xl gap-1.5" onClick={onShowBulkUploadDialog}>
                <Upload className="w-3.5 h-3.5" /><span className="hidden sm:inline">Массовая загрузка</span>
              </Button>
            )}
            {canWriteDocuments && organizationId && <TestInboxButton organizationId={organizationId} />}
          </div>
        </div>

        <div className="p-4 lg:p-6">
          {h.activeTab === "kpi" && (
            <Suspense fallback={<div className="flex justify-center py-8 text-sm text-muted-foreground">Загрузка дашборда…</div>}>
              <DocumentsKpiDashboard
                organizationId={organizationId}
                onNavigate={(tab, prefilter) => {
                  if (tab === "journals" && !canReadJournals) return;
                  if (tab === "frdo" && !canReadFrdo) return;
                  h.setActiveTab(tab as DocumentSubTab, prefilter);
                }}
              />
            </Suspense>
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
          {h.activeTab === "certificates" && <EducationDocumentsJournal organizationId={organizationId} onClose={() => {}} documentTypeFilter="certificate" onOpenFrdoTab={canReadFrdo ? () => h.setActiveTab("frdo") : undefined} />}
          {h.activeTab === "diplomas" && <EducationDocumentsJournal organizationId={organizationId} onClose={() => {}} documentTypeFilter="diploma" onOpenFrdoTab={canReadFrdo ? () => h.setActiveTab("frdo") : undefined} />}
          {h.activeTab === "testimonials" && <EducationDocumentsJournal organizationId={organizationId} onClose={() => {}} documentTypeFilter="qualification" onOpenFrdoTab={canReadFrdo ? () => h.setActiveTab("frdo") : undefined} />}
          {h.activeTab === "programs" && <CourseProgramsList organizationId={organizationId} />}
          {h.activeTab === "journals" && canReadJournals && <JournalsManager organizationId={organizationId!} />}
          {h.activeTab === "frdo" && canReadFrdo && <FRDOManager organizationId={organizationId!} />}
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
              canWrite={canWriteDocuments}
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
              onShowActDialog={() => { h.setActSourceInvoiceId(null); h.setShowActDialog(true); }}
              onShowActDialogForInvoice={(inv) => h.openActDialogForInvoice(inv)}
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

      {canWriteDocuments && h.orgRequisites && organizationId && (
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
}

export const DocumentsTab = React.memo(function DocumentsTab(props: DocumentsTabProps) {
  const { can, canSeeOrgTab, loading } = useStaffPermissions();

  if (loading) {
    return (
      <div className="py-12 text-center text-sm text-muted-foreground" role="status">
        Проверка доступа…
      </div>
    );
  }

  if (!canAccessDocumentSubTab("kpi", can)) {
    return (
      <div
        className="rounded-2xl border border-border bg-card p-8 text-center"
        role="alert"
        data-testid="documents-permission-denied"
      >
        <h2 className="font-semibold">Нет доступа к документам</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Обратитесь к администратору организации, чтобы получить право documents.read.
        </p>
      </div>
    );
  }

  return (
    <DocumentsTabContent
      {...props}
      canReadJournals={canSeeOrgTab("journals") && canAccessDocumentSubTab("journals", can)}
      canReadFrdo={canSeeOrgTab("frdo") && canAccessDocumentSubTab("frdo", can)}
      canReadSales={canSeeOrgTab("sales") && can("sales.read")}
      canReadStudents={canSeeOrgTab("students") && can("students.read")}
      canReadCompanies={canSeeOrgTab("organizations") && can("companies.read")}
      canWriteDocuments={canSeeOrgTab("documents") && can("documents.write")}
      canConfigureDocuments={canSeeOrgTab("settings") && can("settings.write")}
    />
  );
});
