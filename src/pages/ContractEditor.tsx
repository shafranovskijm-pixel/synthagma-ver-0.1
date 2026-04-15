import { useNavigate } from "react-router-dom";
import { useOrganization } from "@/hooks/useOrganization";
import { Button } from "@/components/ui/button";
import { ArrowLeft} from "lucide-react";
import { ContractTemplateEditor } from "@/components/organization/ContractTemplateEditor";
import { SigmaLogo } from "@/components/ui/SigmaLogo";
import { getAdminAwareBackPath } from "@/lib/utils";

export default function ContractEditor() {
  const navigate = useNavigate();
  const { organization, organizationName, isLoading } = useOrganization();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <SigmaSpinner size="lg" />
      </div>
    );
  }

  if (!organization) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <p className="text-muted-foreground">Организация не найдена</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Sticky header */}
      <header className="sticky top-0 z-50 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="flex items-center justify-between px-4 h-14">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="sm"
              className="gap-1.5 rounded-lg"
              onClick={() => navigate(getAdminAwareBackPath())}
            >
              <ArrowLeft className="w-4 h-4" />
              <span className="hidden sm:inline">Назад</span>
            </Button>
            <div className="w-px h-6 bg-border hidden sm:block" />
            <SigmaLogo className="hidden sm:block" />
          </div>
        </div>
      </header>

      {/* Full-width editor */}
      <main className="flex-1 p-4 lg:p-6">
        <ContractTemplateEditor
          organizationId={organization.id}
          organizationName={organizationName}
          fullPage
        />
      </main>
    </div>
  );
}
