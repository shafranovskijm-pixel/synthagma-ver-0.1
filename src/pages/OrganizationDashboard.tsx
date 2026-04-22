import { useEffect, useState, useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { cn } from "@/lib/utils";
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
import { useOrgDashboard } from "@/contexts/OrgDashboardContext";
import { PlatformAnnouncementsBanner } from "@/components/organization/PlatformAnnouncementsBanner";
import { getStoredThemeId, getThemeById, type AdminTheme } from "@/constants/admin-themes";
import { ThemeAnimations, getStoredAnimationLevel, type AnimationLevel } from "@/components/ui/ThemeAnimations";
import { AtmosphericBleed } from "@/components/ui/AtmosphericBleed";
import { useOrgTheme } from "@/hooks/useOrgTheme";
import { GlobalCommandPalette } from "@/components/shared/GlobalCommandPalette";
import { OrgMobileBottomNav } from "@/components/organization/OrgMobileBottomNav";

export default function OrganizationDashboard() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const d = useOrgDashboard();

  // Sync org-wide theme from DB (source of truth across devices/staff).
  // The hook respects `enforce` — it applies only when the organization
  // has enabled the shared interface toggle.
  useOrgTheme(d.organizationId);

  // Visual theme
  const [activeTheme, setActiveTheme] = useState<AdminTheme | null>(() => {
    const id = getStoredThemeId();
    return id ? getThemeById(id) || null : null;
  });
  const [animLevel, setAnimLevel] = useState<AnimationLevel>(getStoredAnimationLevel);

  // Sidebar expanded state — sync margin of main content
  const [sidebarExpanded, setSidebarExpanded] = useState<boolean>(() => {
    try { return localStorage.getItem("org-sidebar-expanded") === "1"; } catch { return false; }
  });
  useEffect(() => {
    const handler = (e: Event) => setSidebarExpanded(!!(e as CustomEvent).detail);
    window.addEventListener("org-sidebar-expanded-change", handler);
    return () => window.removeEventListener("org-sidebar-expanded-change", handler);
  }, []);

  useEffect(() => {
    const handler = (e: Event) => {
      const id = (e as CustomEvent).detail;
      setActiveTheme(id ? getThemeById(id) || null : null);
    };
    const animHandler = (e: Event) => setAnimLevel((e as CustomEvent).detail);
    window.addEventListener("visual-theme-change", handler);
    window.addEventListener("visual-animation-change", animHandler);
    return () => {
      window.removeEventListener("visual-theme-change", handler);
      window.removeEventListener("visual-animation-change", animHandler);
    };
  }, []);

  // Handle ?tab= and ?courseId= query parameters
  useEffect(() => {
    const tab = searchParams.get('tab');
    const courseId = searchParams.get('courseId');
    const studentId = searchParams.get('studentId');
    const enableSales = searchParams.get('enableSales');

    // Hidden URL toggle: ?enableSales=1 enables Sales menu permanently
    if (enableSales === '1' && d.organizationId) {
      (async () => {
        const { supabase } = await import('@/integrations/supabase/client');
        const { data: org } = await supabase.from('organizations').select('menu_settings').eq('id', d.organizationId!).maybeSingle();
        const current = (org?.menu_settings as any) || {};
        await supabase.from('organizations').update({ menu_settings: { ...current, showSales: true } as any }).eq('id', d.organizationId!);
      })();
    }

    if (tab) {
      if (tab === 'course-details' && courseId) {
        d.tabNavigation.setSelectedCourseId(courseId);
      }
      if (tab === 'student-details' && studentId) {
        d.tabNavigation.setSelectedStudentId(studentId);
      }
      d.tabNavigation.setActiveTab(tab as any);
      setSearchParams({}, { replace: true });
    } else if (enableSales === '1') {
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, d.organizationId]);

  const exitAdminView = () => { localStorage.removeItem("adminViewAsOrg"); navigate("/admin"); };

  useEffect(() => {
    const handler = () => d.tabNavigation.setActiveTab('subscription' as any);
    window.addEventListener('navigate-to-subscription', handler);
    return () => window.removeEventListener('navigate-to-subscription', handler);
  }, [d.tabNavigation]);

  return (
    <div className={`min-h-screen bg-background flex relative ${activeTheme?.bgClass || ''}`}
      style={activeTheme?.id === 'turquoise' ? {
        background: 'linear-gradient(to bottom, #d4f5ef 0%, #8fd8ca 12%, #4db8a8 25%, #2a8a80 40%, #1a5a58 55%, #0f3a3e 70%, #0c2a30 85%, #050e12 100%)',
      } : undefined}
    >
      {activeTheme && <ThemeAnimations animation={activeTheme.animation} level={animLevel} />}
      {activeTheme && (
        <AtmosphericBleed
          bannerUrl={activeTheme.bannerUrl}
          blur={activeTheme.atmosphereBlur}
          opacity={activeTheme.atmosphereOpacity}
          sharp={activeTheme.atmosphereSharp}
        />
      )}
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
      
      {/* Single sidebar - always visible */}
      <OrgSidebar />

      {/* Main content */}
      <main 
        ref={d.swipeRef} 
        className={cn(
          "flex-1 flex flex-col min-w-0 transition-all duration-300 pb-14 lg:pb-0",
          sidebarExpanded ? "lg:ml-[220px]" : "lg:ml-[88px]",
          d.isAdminView ? "mt-10" : ""
        )}
      >
        {/* Header with hero banner */}
        <OrgDashboardHeader />

        <div className="flex-1 p-4 lg:p-8 overflow-x-clip">
          <div className={cn("mx-auto", sidebarExpanded ? "max-w-[1400px]" : "max-w-none")}>
            <PlatformAnnouncementsBanner />

            <AnimatedTabContent tabKey={d.tabNavigation.activeTab} direction={d.tabNavigation.swipeDirection} isMobile={d.isMobile}>
              <TabContentRenderer />
            </AnimatedTabContent>
          </div>
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

      {/* Global Cmd+K palette */}
      <GlobalCommandPalette scope="organization" organizationId={d.organizationId} />

      {/* Mobile bottom navigation */}
      <OrgMobileBottomNav />
    </div>
  );
}
