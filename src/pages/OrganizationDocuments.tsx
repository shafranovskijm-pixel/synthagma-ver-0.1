import { useState, useEffect, lazy, Suspense } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { ArrowLeft, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { OrgDashboardProvider } from "@/contexts/OrgDashboardContext";

const LazyDocumentsTab = lazy(() => import("@/components/organization/tabs/DocumentsTab").then(m => ({ default: m.DocumentsTab })));

export default function OrganizationDocuments() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [organizationId, setOrganizationId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    const load = async () => {
      const { data: prof } = await supabase.from("profiles").select("organization_id").eq("user_id", user.id).maybeSingle();
      let orgId = prof?.organization_id || (await supabase.rpc("current_organization_id")).data as string | null;
      if (!orgId) {
        const { data: firstOrg } = await supabase.from("organizations").select("id").limit(1).maybeSingle();
        orgId = firstOrg?.id || null;
      }
      setOrganizationId(orgId);
      setLoading(false);
    };
    load();
  }, [user]);

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center"><div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" /></div>;
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-30 h-14 bg-card border-b border-border flex items-center px-4 lg:px-6 gap-3">
        <Button variant="ghost" size="icon" className="rounded-xl" onClick={() => navigate(-1)}>
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <div className="flex items-center gap-2">
          <FileText className="w-5 h-5 text-primary" />
          <h1 className="font-display font-semibold text-lg">Документы</h1>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-4 py-6">
        {organizationId && (
          <OrgDashboardProvider>
            <Suspense fallback={<div className="flex justify-center py-8"><div className="animate-spin w-6 h-6 border-2 border-primary border-t-transparent rounded-full" /></div>}>
              <LazyDocumentsTab organizationId={organizationId} organizationName="" isOrdersEnabled={true} />
            </Suspense>
          </OrgDashboardProvider>
        )}
      </div>
    </div>
  );
}
