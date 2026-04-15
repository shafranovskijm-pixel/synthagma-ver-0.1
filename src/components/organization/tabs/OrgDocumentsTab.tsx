import { lazy, Suspense } from "react";
import { useOrgDashboard } from "@/contexts/OrgDashboardContext";

const LazyDocumentsTab = lazy(() => import("@/components/organization/tabs/DocumentsTab").then(m => ({ default: m.DocumentsTab })));

interface OrgDocumentsTabProps {
  organizationId: string;
}

export function OrgDocumentsTab({ organizationId }: OrgDocumentsTabProps) {
  const d = useOrgDashboard();
  const customName = d.branding.brandingSettings.customName;
  const organizationName = d.organizationName;

  return (
    <Suspense fallback={<div className="flex justify-center py-8"><div className="animate-spin w-6 h-6 border-2 border-primary border-t-transparent rounded-full" /></div>}>
      <LazyDocumentsTab organizationId={organizationId} organizationName={customName || organizationName || ""} isOrdersEnabled={true} />
    </Suspense>
  );
}
