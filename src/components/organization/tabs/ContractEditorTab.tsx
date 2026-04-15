import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ContractTemplateEditor } from "@/components/organization/ContractTemplateEditor";
import { useOrgDashboard } from "@/contexts/OrgDashboardContext";

interface ContractEditorTabProps {
  organizationId: string;
  organizationName: string;
}

export function ContractEditorTab({ organizationId, organizationName }: ContractEditorTabProps) {
  const d = useOrgDashboard();

  return (
    <div className="space-y-4">
      <Button
        variant="ghost"
        size="sm"
        className="gap-1.5 rounded-xl"
        onClick={() => d.tabNavigation.setActiveTab("documents")}
      >
        <ArrowLeft className="w-4 h-4" />
        Назад к документам
      </Button>
      <ContractTemplateEditor
        organizationId={organizationId}
        organizationName={organizationName}
        fullPage
      />
    </div>
  );
}
