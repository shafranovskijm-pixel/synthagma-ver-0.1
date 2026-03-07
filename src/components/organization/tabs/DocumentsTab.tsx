import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { 
  Users, ClipboardList, Award, GraduationCap, FileCheck, 
  FileText, Upload, BookOpen, Wrench, Building2, ScrollText,
  UserCheck, Stamp, ExternalLink, Lock, ArrowUpRight
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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

type DocumentSubTab = "constructor" | "programs" | "org" | "orders" | "protocols" | "certificates" | "diplomas" | "testimonials";

interface DocumentsTabProps {
  organizationId: string | null;
  organizationName?: string;
  onShowBulkUploadDialog?: () => void;
  isOrdersEnabled?: boolean;
  onNavigateToSubscription?: () => void;
}

export const DocumentsTab = React.memo(function DocumentsTab({ organizationId, organizationName, onShowBulkUploadDialog, isOrdersEnabled = true, onNavigateToSubscription }: DocumentsTabProps) {
  const navigate = useNavigate();
  const [activeDocTab, setActiveDocTab] = useState<DocumentSubTab>("constructor");
  const [constructorTab, setConstructorTab] = useState("requisites");
  const [stampUrl, setStampUrl] = useState<string | null>(null);
  const [signatureUrl, setSignatureUrl] = useState<string | null>(null);
  const { plan } = useSubscriptionLimits(organizationId);
  const isFreePlan = plan === 'free';

  // Load stamp/signature
  useEffect(() => {
    if (!organizationId) return;
    supabase
      .from('organizations')
      .select('stamp_url, signature_url')
      .eq('id', organizationId)
      .single()
      .then(({ data }) => {
        if (data) {
          setStampUrl(data.stamp_url);
          setSignatureUrl(data.signature_url);
        }
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

  const tabs: { id: DocumentSubTab; label: string; shortLabel: string; icon: React.ReactNode }[] = [
    { id: "constructor", label: "Конструктор", shortLabel: "Констр.", icon: <Wrench className="w-4 h-4" /> },
    { id: "org", label: "Документы орг.", shortLabel: "Орг.", icon: <FileText className="w-4 h-4" /> },
    ...(isOrdersEnabled ? [{ id: "orders" as DocumentSubTab, label: "Приказы", shortLabel: "Приказы", icon: <Users className="w-4 h-4" /> }] : []),
    { id: "protocols", label: "Протоколы АК", shortLabel: "Протоколы", icon: <ClipboardList className="w-4 h-4" /> },
    { id: "certificates", label: "Удостоверения", shortLabel: "Удост.", icon: <Award className="w-4 h-4" /> },
    { id: "diplomas", label: "Дипломы", shortLabel: "Дипломы", icon: <GraduationCap className="w-4 h-4" /> },
    { id: "testimonials", label: "Свидетельства", shortLabel: "Свид.", icon: <FileCheck className="w-4 h-4" /> },
    { id: "programs", label: "Программы", shortLabel: "Прогр.", icon: <BookOpen className="w-4 h-4" /> },
  ];

  return (
    <div className="space-y-4">
      {/* Header with tabs and bulk upload button */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex flex-wrap gap-2">
          {tabs.map((tab) => (
            <Button
              key={tab.id}
              variant={activeDocTab === tab.id ? "default" : "outline"}
              size="sm"
              onClick={() => setActiveDocTab(tab.id)}
              className={`rounded-xl gap-2 ${
                activeDocTab === tab.id 
                  ? "bg-primary text-primary-foreground" 
                  : "hover:bg-secondary"
              }`}
            >
              {tab.icon}
              <span className="hidden lg:inline">{tab.label}</span>
              <span className="lg:hidden">{tab.shortLabel}</span>
            </Button>
          ))}
        </div>

        {onShowBulkUploadDialog && (
          <Button 
            variant="outline" 
            size="sm"
            className="rounded-xl gap-2" 
            onClick={onShowBulkUploadDialog}
          >
            <Upload className="w-4 h-4" />
            <span className="hidden sm:inline">Массовая загрузка</span>
            <span className="sm:hidden">Загрузка</span>
          </Button>
        )}
      </div>

      {/* Content */}
      <div className="mt-4">
        {activeDocTab === "constructor" && (
          <div className="bg-card rounded-xl lg:rounded-2xl border border-border p-4 lg:p-6 relative">
            {isFreePlan && <LockedOverlay features={[
              "Шаблоны договоров с автозаполнением реквизитов",
              "Протоколы аттестационной комиссии (Word)",
              "Конструктор удостоверений и дипломов",
              "Согласия на обработку персональных данных",
              "Печать и подпись — автовставка во все документы",
            ]} />}
            <Tabs value={constructorTab} onValueChange={setConstructorTab}>
              <TabsList className="flex flex-wrap h-auto gap-1 bg-muted/50 p-1 rounded-xl">
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

              <TabsContent value="requisites" className="mt-4 space-y-4">
                <div>
                  <h4 className="font-medium mb-2 flex items-center gap-2 text-sm">
                    <Building2 className="w-4 h-4" />
                    Реквизиты организации
                  </h4>
                  <p className="text-xs text-muted-foreground mb-3">
                    Введите ИНН для автозаполнения данных. Реквизиты используются во всех генерируемых документах.
                  </p>
                  <OrgRequisitesForm organizationId={organizationId} />
                </div>
              </TabsContent>

              <TabsContent value="contract" className="mt-4">
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

              <TabsContent value="protocol" className="mt-4">
                <p className="text-xs text-muted-foreground mb-3">
                  Настройте шаблон протокола аттестационной комиссии и состав комиссии
                </p>
                <ProtocolTemplateEditor organizationId={organizationId} />
              </TabsContent>

              <TabsContent value="documents" className="mt-4">
                <p className="text-xs text-muted-foreground mb-3">
                  Настройте серии, нумерацию и формат регистрационных номеров документов об образовании
                </p>
                <CertificateTemplateEditor organizationId={organizationId} />
              </TabsContent>

              <TabsContent value="consent" className="mt-4">
                <p className="text-xs text-muted-foreground mb-3">
                  Генератор согласия на обработку персональных данных
                </p>
                <ConsentGenerator organizationId={organizationId} organizationName={organizationName || ""} />
              </TabsContent>

              <TabsContent value="stamp" className="mt-4">
                <p className="text-xs text-muted-foreground mb-3">
                  Загруженные печать и подпись используются во всех генерируемых документах (протоколы, договоры, приказы)
                </p>
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
              </TabsContent>
            </Tabs>
          </div>
        )}

        {activeDocTab === "programs" && (
          <ProgramsManager organizationId={organizationId} />
        )}

        {activeDocTab === "org" && (
          <OrgDocumentsManager organizationId={organizationId} />
        )}

        {activeDocTab === "orders" && (
          <DocumentArchiveView
            organizationId={organizationId}
            categoryId="enrollment_orders"
            title="Приказы о зачислении / отчислении"
            docTypes={["enrollment_order", "expulsion_order"]}
          />
        )}

        {activeDocTab === "protocols" && (
          <DocumentArchiveView
            organizationId={organizationId}
            categoryId="attestation_protocols"
            title="Протоколы аттестационной комиссии"
            docTypes={["attestation_protocol"]}
          />
        )}

        {activeDocTab === "certificates" && (
          <EducationDocumentsJournal
            organizationId={organizationId}
            onClose={() => setActiveDocTab("org")}
            documentTypeFilter="certificate"
          />
        )}

        {activeDocTab === "diplomas" && (
          <EducationDocumentsJournal
            organizationId={organizationId}
            onClose={() => setActiveDocTab("org")}
            documentTypeFilter="diploma"
          />
        )}

        {activeDocTab === "testimonials" && (
          <EducationDocumentsJournal
            organizationId={organizationId}
            onClose={() => setActiveDocTab("org")}
            documentTypeFilter="qualification"
          />
        )}
      </div>
    </div>
  );
});
