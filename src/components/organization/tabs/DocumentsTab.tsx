import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { 
  Users, ClipboardList, Award, GraduationCap, FileCheck, 
  FileText, Upload, BookOpen, Wrench, Building2, ScrollText,
  UserCheck, Stamp, ExternalLink, Lock, ArrowUpRight,
  FolderOpen, Download, Receipt, File, Calendar, Lightbulb, Trash2,
  Info
} from "lucide-react";
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
import { ProgramsManager } from "@/components/organization/ProgramsManager";
import { OrgRequisitesForm } from "@/components/organization/OrgRequisitesForm";
import { ContractTemplateEditor } from "@/components/organization/ContractTemplateEditor";
import { ConsentGenerator } from "@/components/organization/ConsentGenerator";
import { ProtocolTemplateEditor } from "@/components/organization/ProtocolTemplateEditor";
import { CertificateTemplateEditor } from "@/components/organization/CertificateTemplateEditor";
import { StampSignatureUploader } from "@/components/organization/StampSignatureUploader";
import { useSubscriptionLimits } from "@/hooks/useSubscriptionLimits";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { DocumentPreview } from "@/components/organization/DocumentPreview";
import { Eye } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useOrgDashboard } from "@/contexts/OrgDashboardContext";
import { getSignedStorageUrl } from "@/utils/storageHelpers";
import { generateAct } from "@/utils/generateAct";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { ru } from "date-fns/locale";

type DocumentSubTab = "constructor" | "programs" | "org" | "orders" | "protocols" | "certificates" | "diplomas" | "testimonials" | "billing";

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

const NAV_ITEMS: { value: DocumentSubTab; label: string; shortLabel?: string; icon: React.ElementType; ordersOnly?: boolean }[] = [
  { value: "constructor", label: "Конструктор", icon: Wrench },
  { value: "org", label: "Документы орг.", icon: FileText },
  { value: "orders", label: "Приказы", icon: Users, ordersOnly: true },
  { value: "protocols", label: "Протоколы АК", icon: ClipboardList },
  { value: "certificates", label: "Удостоверения", icon: Award },
  { value: "diplomas", label: "Дипломы", icon: GraduationCap },
  { value: "testimonials", label: "Свидетельства", icon: FileCheck },
  { value: "programs", label: "Программы", icon: BookOpen },
  { value: "billing", label: "Закрывающие", icon: FolderOpen },
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
  billing: "Договоры, счета и закрывающие документы",
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
  const [activeTab, setActiveTab] = useState<DocumentSubTab>("constructor");
  const [constructorTab, setConstructorTab] = useState("requisites");
  const [stampUrl, setStampUrl] = useState<string | null>(null);
  const [signatureUrl, setSignatureUrl] = useState<string | null>(null);
  const { plan } = useSubscriptionLimits(organizationId);
  const isFreePlan = plan === 'free';

  const [billingDocs, setBillingDocs] = useState<BillingDoc[]>([]);
  const [showActDialog, setShowActDialog] = useState(false);
  const [actDate, setActDate] = useState<Date>(new Date());
  const [actBasis, setActBasis] = useState("");
  const [actAmount, setActAmount] = useState("");
  const [actSubmitting, setActSubmitting] = useState(false);
  const [orgDetails, setOrgDetails] = useState<{ inn?: string; director_name?: string; director_position?: string }>({});

  useEffect(() => {
    if (!organizationId) return;
    supabase
      .from('organizations')
      .select('stamp_url, signature_url, inn, director_name, director_position')
      .eq('id', organizationId)
      .single()
      .then(({ data }) => {
        if (data) {
          setStampUrl(data.stamp_url);
          setSignatureUrl(data.signature_url);
          setOrgDetails({ inn: data.inn, director_name: data.director_name, director_position: data.director_position });
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
      toast({ title: "Ошибка", description: "Не удалось получить ссылку на файл", variant: "destructive" });
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
      toast({ title: "Ошибка", description: "Не удалось получить ссылку на файл", variant: "destructive" });
      return;
    }
    try {
      const { downloadHtmlFile } = await import("@/utils/downloadHtmlFile");
      await downloadHtmlFile(url, doc.name);
    } catch (e) {
      console.error("Error downloading document:", e);
      toast({ title: "Ошибка", description: "Не удалось скачать файл", variant: "destructive" });
    }
  };

  const handleDeleteBillingDoc = async (doc: BillingDoc) => {
    if (!confirm("Удалить документ?")) return;
    try {
      await supabase.storage.from("billing-documents").remove([doc.file_url]);
      const { error } = await supabase.from("org_billing_documents").delete().eq("id", doc.id);
      if (error) throw error;
      setBillingDocs(prev => prev.filter(d => d.id !== doc.id));
      toast({ title: "Документ удалён" });
    } catch (e) {
      console.error("Error deleting document:", e);
      toast({ title: "Ошибка", description: "Не удалось удалить документ", variant: "destructive" });
    }
  };

  const handleGenerateAct = async () => {
    if (!organizationId || !actBasis || !actAmount) return;
    setActSubmitting(true);
    const result = await generateAct({
      organizationId,
      orgName: d.organizationName || organizationName || "",
      orgInn: orgDetails.inn || null,
      directorName: orgDetails.director_name || null,
      directorPosition: orgDetails.director_position || null,
      actDate,
      basis: actBasis,
      amount: parseFloat(actAmount),
    });
    if (result) {
      toast({ title: "Акт создан", description: result });
      const { data } = await supabase.from("org_billing_documents" as any)
        .select("*").eq("organization_id", organizationId).order("created_at", { ascending: false });
      if (data) setBillingDocs(data as any[]);
      setShowActDialog(false);
      setActBasis("");
      setActAmount("");
      setActDate(new Date());
    } else {
      toast({ title: "Ошибка", description: "Не удалось сгенерировать акт", variant: "destructive" });
    }
    setActSubmitting(false);
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
          <div className="hidden lg:flex flex-col py-2">
            {visibleItems.map(item => {
              const Icon = item.icon;
              const isActive = activeTab === item.value;
              return (
                <button
                  key={item.value}
                  onClick={() => setActiveTab(item.value)}
                  className={cn(
                    "flex items-center gap-2.5 px-4 py-2.5 text-sm font-medium transition-colors text-left",
                    isActive
                      ? "bg-primary/10 text-primary border-r-2 border-primary"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted/30"
                  )}
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  {item.label}
                </button>
              );
            })}
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
              {activeTab === "billing" && (
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
              <ProgramsManager organizationId={organizationId} />
            )}

            {activeTab === "billing" && (
              <div>
                {billingDocs.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">
                    <FileText className="w-10 h-10 mx-auto mb-2 opacity-30" />
                    <p className="text-sm">Документов пока нет</p>
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
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowActDialog(false)}>Отмена</Button>
            <Button onClick={handleGenerateAct} disabled={actSubmitting || !actBasis || !actAmount}>
              {actSubmitting ? "Генерация..." : "Создать акт"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
});
