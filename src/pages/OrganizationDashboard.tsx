import { useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { AnimatedTabContent } from "@/components/ui/AnimatedTabContent";
import { OrgSidebar } from "@/components/organization/OrgSidebar";
import { TabContentRenderer } from "@/components/organization/tabs/TabContentRenderer";
import { DialogsContainer } from "@/components/organization/dialogs/DialogsContainer";
import { OrgDashboardHeader } from "@/components/organization/OrgDashboardHeader";
import { OrgDashboardFooter } from "@/components/organization/OrgDashboardFooter";

import { Button } from "@/components/ui/button";
import { Eye, X } from "lucide-react";
import { OnboardingDialog } from "@/components/onboarding/OnboardingDialog";
import { organizationOnboardingSteps } from "@/constants/onboardingSteps";
import { OrgDashboardProvider, useOrgDashboard } from "@/contexts/OrgDashboardContext";
import { PlatformAnnouncementsBanner } from "@/components/organization/PlatformAnnouncementsBanner";

function OrganizationDashboardContent() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const d = useOrgDashboard();

  // Handle ?tab= query parameter
  useEffect(() => {
    const tab = searchParams.get('tab');
    if (tab) {
      d.tabNavigation.setActiveTab(tab as any);
      setSearchParams({}, { replace: true });
    }
  }, [searchParams]);

  const exitAdminView = () => { localStorage.removeItem("adminViewAsOrg"); navigate("/admin"); };

  useEffect(() => {
    const handler = () => d.tabNavigation.setActiveTab('subscription' as any);
    window.addEventListener('navigate-to-subscription', handler);
    return () => window.removeEventListener('navigate-to-subscription', handler);
  }, [d.tabNavigation]);

  return (
    <div className="min-h-screen bg-background flex">
      {/* Admin View Banner */}
      {d.isAdminView && (
        <div className="fixed top-0 left-0 right-0 z-50 bg-primary text-primary-foreground py-2 px-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Eye className="w-4 h-4" />
            <span className="text-sm font-medium">Режим просмотра: {d.organizationName}</span>
          </div>
          <Button variant="secondary" size="sm" onClick={exitAdminView} className="gap-1">
            <X className="w-3 h-3" />
            Выйти
          </Button>
        </div>
      )}
      
      {/* Sidebar - 88px icon style */}
      <OrgSidebar />

      {/* Main content */}
      <main 
        ref={d.swipeRef} 
        className={`flex-1 flex flex-col min-w-0 lg:ml-[88px] ${d.isAdminView ? 'mt-10' : ''}`}
      >
        {/* Header with hero banner */}
        <OrgDashboardHeader />

        <div className="flex-1 p-4 lg:p-8 overflow-hidden">
          <PlatformAnnouncementsBanner />
          
          <AnimatedTabContent tabKey={d.tabNavigation.activeTab} direction={d.tabNavigation.swipeDirection} isMobile={d.isMobile}>
            <TabContentRenderer />
          </AnimatedTabContent>
        </div>

        {/* Footer */}
        <OrgDashboardFooter />
      </main>


      {/* All Dialogs */}
      <DialogsContainer />

      {/* Onboarding Tour */}
      <OnboardingDialog
        open={d.showOnboarding}
        onClose={d.handleOnboardingClose}
        steps={organizationOnboardingSteps}
        onNavigateToTab={(tab) => d.tabNavigation.setActiveTab(tab as any)}
      />
    </div>
  );
}

export default function OrganizationDashboard() {
  return (
    <OrgDashboardProvider>
      <OrganizationDashboardContent />
    </OrgDashboardProvider>
  );
}
