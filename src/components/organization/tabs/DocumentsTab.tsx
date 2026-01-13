import { useState } from "react";
import { 
  Users, ClipboardList, Award, GraduationCap, FileCheck, 
  FileText, Upload, BookOpen
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { OrgDocumentsManager } from "@/components/organization/OrgDocumentsManager";
import { DocumentArchiveView } from "@/components/organization/DocumentArchiveView";
import { EducationDocumentsJournal } from "@/components/organization/EducationDocumentsJournal";
import { ProgramsManager } from "@/components/organization/ProgramsManager";

type DocumentSubTab = "programs" | "org" | "orders" | "protocols" | "certificates" | "diplomas" | "testimonials";

interface DocumentsTabProps {
  organizationId: string | null;
  onShowBulkUploadDialog?: () => void;
  isOrdersEnabled?: boolean;
}

export function DocumentsTab({ organizationId, onShowBulkUploadDialog, isOrdersEnabled = true }: DocumentsTabProps) {
  const [activeDocTab, setActiveDocTab] = useState<DocumentSubTab>("org");

  if (!organizationId) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        Организация не найдена
      </div>
    );
  }

  const tabs: { id: DocumentSubTab; label: string; shortLabel: string; icon: React.ReactNode }[] = [
    { id: "programs", label: "Программы", shortLabel: "Прогр.", icon: <BookOpen className="w-4 h-4" /> },
    { id: "org", label: "Документы орг.", shortLabel: "Орг.", icon: <FileText className="w-4 h-4" /> },
    ...(isOrdersEnabled ? [{ id: "orders" as DocumentSubTab, label: "Приказы", shortLabel: "Приказы", icon: <Users className="w-4 h-4" /> }] : []),
    { id: "protocols", label: "Протоколы АК", shortLabel: "Протоколы", icon: <ClipboardList className="w-4 h-4" /> },
    { id: "certificates", label: "Удостоверения", shortLabel: "Удост.", icon: <Award className="w-4 h-4" /> },
    { id: "diplomas", label: "Дипломы", shortLabel: "Дипломы", icon: <GraduationCap className="w-4 h-4" /> },
    { id: "testimonials", label: "Свидетельства", shortLabel: "Свид.", icon: <FileCheck className="w-4 h-4" /> },
  ];

  return (
    <div className="space-y-4">
      {/* Header with tabs and bulk upload button */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        {/* Tab buttons */}
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

        {/* Bulk upload button */}
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
}
