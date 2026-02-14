import { useNavigate } from "react-router-dom";
import { AnimatedTabContent } from "@/components/ui/AnimatedTabContent";
import { OrgSidebar } from "@/components/organization/OrgSidebar";
import { TabContentRenderer } from "@/components/organization/tabs/TabContentRenderer";
import { DialogsContainer } from "@/components/organization/dialogs/DialogsContainer";
import { MissingCredentialsAlert } from "@/components/organization/MissingCredentialsAlert";
import { OrgDashboardHeader } from "@/components/organization/OrgDashboardHeader";
import { Button } from "@/components/ui/button";
import { Eye, X } from "lucide-react";
import { OnboardingDialog } from "@/components/onboarding/OnboardingDialog";
import { organizationOnboardingSteps } from "@/constants/onboardingSteps";
import { OrgDashboardProvider, useOrgDashboard } from "@/contexts/OrgDashboardContext";

function OrganizationDashboardContent() {
  const navigate = useNavigate();
  const d = useOrgDashboard();

  const exitAdminView = () => { localStorage.removeItem("adminViewAsOrg"); navigate("/admin"); };

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
      
      {/* Mobile Overlay */}
      {d.isMobileSidebarOpen && <div className="fixed inset-0 bg-black/50 z-40 lg:hidden" onClick={() => d.setIsMobileSidebarOpen(false)} />}
      
      {/* Sidebar - no props needed */}
      <OrgSidebar />

      {/* Main content */}
      <main ref={d.swipeRef} className={`flex-1 overflow-auto lg:ml-64 ${d.isAdminView ? 'mt-10' : ''}`}>
        {/* Cover Image */}
        {d.branding.brandingSettings.coverUrl && (
          <div className="relative w-full h-32 lg:h-48 overflow-hidden">
            <img 
              src={d.branding.brandingSettings.coverUrl} 
              alt="Обложка организации" 
              className="w-full h-full"
              style={{
                objectFit: d.branding.brandingSettings.coverPosition === 'contain' ? 'contain' : 'cover',
                objectPosition: 
                  d.branding.brandingSettings.coverPosition === 'top' ? 'center top' 
                  : d.branding.brandingSettings.coverPosition === 'bottom' ? 'center bottom' 
                  : d.branding.brandingSettings.coverPosition === 'contain' ? 'center center'
                  : 'center center',
                backgroundColor: 'hsl(var(--muted))'
              }}
            />
          </div>
        )}
        
        {/* Header - no props needed */}
        <OrgDashboardHeader />

        <div className="p-4 lg:p-8 overflow-hidden">
          <MissingCredentialsAlert 
            students={d.students}
            isCreating={d.studentActions.isCreatingBulkCredentials}
            onCreateCredentials={d.handleBulkCreateCredentials}
          />
          
          <AnimatedTabContent tabKey={d.tabNavigation.activeTab} direction={d.tabNavigation.swipeDirection} isMobile={d.isMobile}>
            <TabContentRenderer />
          </AnimatedTabContent>
        </div>

        {/* Mobile Tab Indicator Dots */}
        {d.isMobile && (
          <div className="fixed bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-1.5 bg-card/80 backdrop-blur-sm px-3 py-2 rounded-full border border-border shadow-lg z-40">
            {d.tabNavigation.getVisibleTabs().map((tab, index) => (
              <button
                key={tab}
                onClick={() => {
                  d.tabNavigation.triggerHapticFeedback();
                  const currentIndex = d.tabNavigation.getVisibleTabs().indexOf(d.tabNavigation.activeTab);
                  d.tabNavigation.setSwipeDirection(index > currentIndex ? 1 : -1);
                  d.tabNavigation.setActiveTab(tab);
                }}
                className={`transition-all duration-200 rounded-full ${
                  tab === d.tabNavigation.activeTab ? 'w-6 h-2 bg-primary' : 'w-2 h-2 bg-muted-foreground/30 hover:bg-muted-foreground/50'
                }`}
                aria-label={`Перейти к вкладке ${tab}`}
              />
            ))}
          </div>
        )}
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
