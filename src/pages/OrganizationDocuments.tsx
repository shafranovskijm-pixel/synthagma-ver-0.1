import { lazy, Suspense } from "react";
import { FileText } from "lucide-react";
import OrgPageLayout from "@/components/organization/OrgPageLayout";
import { useOrgDashboard } from "@/contexts/OrgDashboardContext";

const LazyDocumentsTab = lazy(() => import("@/components/organization/tabs/DocumentsTab").then(m => ({ default: m.DocumentsTab })));

function DocumentsContent() {
  const d = useOrgDashboard();
  const customName = d.branding.brandingSettings.customName;
  const organizationName = d.organizationName;

  return (
    <Suspense fallback={<div className="flex justify-center py-8"><div className="animate-spin w-6 h-6 border-2 border-primary border-t-transparent rounded-full" /></div>}>
      <LazyDocumentsTab organizationId="" organizationName={customName || organizationName || ""} isOrdersEnabled={true} />
    </Suspense>
  );
}

export default function OrganizationDocuments() {
  return (
    <OrgPageLayout title="Документы" icon={FileText}>
      <DocumentsContent />
    </OrgPageLayout>
  );
}
