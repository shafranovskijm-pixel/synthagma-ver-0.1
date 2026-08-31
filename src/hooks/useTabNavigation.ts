import { useState, useCallback, useEffect, useMemo } from "react";
import { useLocation, useSearchParams } from "react-router-dom";
import type { TabType } from "@/components/organization/OrgSidebar";
import { resolveTabParams } from "@/lib/groups/groupContext";
import { normalizeOrganizationWorkspaceTab } from "@/lib/organization/workspaceNavigation";

interface MenuSettings {
  showLibrary: boolean;
  showStats: boolean;
  showLinks: boolean;
  showDocuments: boolean;
  showServices: boolean;
  showLaborSafety: boolean;
  showCourses?: boolean;
  showCompanies?: boolean;
  showStudents?: boolean;
  showJournals?: boolean;
  showFrdo?: boolean;
  showSubscription?: boolean;
}

interface UseTabNavigationProps {
  isMobile: boolean;
  menuSettings: MenuSettings;
  isFrdoEnabled: boolean;
  isEnabled: (featureId: string) => boolean;
}

export function useTabNavigation({
  isMobile,
  menuSettings,
  isFrdoEnabled,
  isEnabled,
}: UseTabNavigationProps) {
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();

  // URL is the source of truth for the active tab so that reload and
  // browser Back/Forward correctly restore the previous section.
  const requestedTab = (searchParams.get("tab") as TabType | null) ?? "home";
  const activeTab = normalizeOrganizationWorkspaceTab(requestedTab);

  const setActiveTab = useCallback((tab: TabType) => {
    const normalizedTab = normalizeOrganizationWorkspaceTab(tab);
    setSearchParams((prev) => {
      const next = resolveTabParams(prev, normalizedTab);
      // Selecting the top-level Companies item means its list, while a
      // companiesPath(companyId) deep link remains independently reloadable.
      if (normalizedTab === "organizations") next.delete("companyId");
      return next;
    });
  }, [setSearchParams]);

  // Old bookmarks must not reopen unfinished CRM or the demo course-payment
  // workspace. Replace their URL once, without adding a history entry.
  useEffect(() => {
    if (requestedTab === activeTab) return;
    setSearchParams(
      (prev) => resolveTabParams(prev, activeTab),
      { replace: true },
    );
  }, [activeTab, requestedTab, setSearchParams]);

  const [swipeDirection, setSwipeDirection] = useState(0);
  const selectedCourseId = searchParams.get("courseId");
  const selectedStudentId = searchParams.get("studentId");
  const selectedGroupId = searchParams.get("groupId");

  // Support legacy navigation via location.state (from Profile etc.)
  useEffect(() => {
    const state = location.state as { tab?: TabType } | null;
    if (state?.tab) {
      setActiveTab(state.tab);
      window.history.replaceState({}, document.title);
    }
  }, [location.state, setActiveTab]);

  // Entity selection is derived from this window's URL. Setters update only
  // the URL, avoiding a one-render stale A value while Back/Forward selects B.
  const setSelectedCourseIdWithUrl = useCallback((id: string | null) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (id) next.set("courseId", id); else next.delete("courseId");
      return next;
    });
  }, [setSearchParams]);

  const setSelectedStudentIdWithUrl = useCallback((id: string | null) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (id) next.set("studentId", id); else next.delete("studentId");
      return next;
    });
  }, [setSearchParams]);

  const setSelectedGroupIdWithUrl = useCallback((id: string | null) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (id) next.set("groupId", id); else { next.delete("groupId"); next.delete("folder"); }
      return next;
    });
  }, [setSearchParams]);

  const openCourseDetails = useCallback((courseId: string) => {
    setSearchParams((prev) => {
      const next = resolveTabParams(prev, "course-details");
      next.set("courseId", courseId);
      return next;
    });
  }, [setSearchParams]);

  const openStudentDetails = useCallback((studentId: string) => {
    setSearchParams((prev) => {
      const next = resolveTabParams(prev, "student-details");
      next.set("studentId", studentId);
      return next;
    });
  }, [setSearchParams]);

  const openGroupFolder = useCallback((groupId: string) => {
    setSearchParams((prev) => {
      const next = resolveTabParams(prev, "group-folder");
      next.set("studentsView", "groups");
      next.set("groupId", groupId);
      next.delete("folder");
      next.delete("returnToGroupId");
      next.delete("groupSettings");
      return next;
    });
  }, [setSearchParams]);




  // Haptic feedback helper
  const triggerHapticFeedback = useCallback(() => {
    if ('vibrate' in navigator) {
      navigator.vibrate(10);
    }
  }, []);

  const getVisibleTabs = useCallback((): TabType[] => {
    const baseTabs: TabType[] = ["home"];
    
    if (menuSettings.showCourses !== false && isEnabled("courses")) baseTabs.push("courses");
    if (menuSettings.showCompanies !== false && isEnabled("companies")) baseTabs.push("organizations");
    if (menuSettings.showStudents !== false && isEnabled("students")) baseTabs.push("students");
    if (menuSettings.showLibrary && isEnabled("library")) baseTabs.push("library");
    if (menuSettings.showStats) baseTabs.push("stats");
    if (menuSettings.showLinks && isEnabled("links")) baseTabs.push("links");
    if (menuSettings.showLaborSafety !== false && isEnabled("labor_safety")) baseTabs.push("labor-safety");
    
    // Subscription billing remains available. The old course-payment/T-Bank
    // workspace is intentionally excluded from organization navigation.
    if (menuSettings.showSubscription !== false) baseTabs.push("subscription");
    if (menuSettings.showServices && isEnabled("services")) baseTabs.push("services");
    baseTabs.push("chats");
    if (menuSettings.showDocuments && isEnabled("documents")) baseTabs.push("documents");
    if (menuSettings.showJournals !== false && isEnabled("journals")) baseTabs.push("journals");
    if (isFrdoEnabled && menuSettings.showFrdo !== false && isEnabled("frdo")) baseTabs.push("frdo");
    
    return baseTabs;
  }, [menuSettings, isFrdoEnabled, isEnabled]);

  const handleSwipeLeft = useCallback(() => {
    if (!isMobile) return;
    const tabs = getVisibleTabs();
    const currentIndex = tabs.indexOf(activeTab);
    if (currentIndex >= 0 && currentIndex < tabs.length - 1) {
      triggerHapticFeedback();
      setSwipeDirection(1);
      setActiveTab(tabs[currentIndex + 1]);
    }
  }, [activeTab, getVisibleTabs, isMobile, triggerHapticFeedback]);

  const handleSwipeRight = useCallback(() => {
    if (!isMobile) return;
    const tabs = getVisibleTabs();
    const currentIndex = tabs.indexOf(activeTab);
    if (currentIndex > 0) {
      triggerHapticFeedback();
      setSwipeDirection(-1);
      setActiveTab(tabs[currentIndex - 1]);
    }
  }, [activeTab, getVisibleTabs, isMobile, triggerHapticFeedback]);

  const handleTabClick = useCallback((tab: TabType) => {
    triggerHapticFeedback();
    const tabs = getVisibleTabs();
    const currentIndex = tabs.indexOf(activeTab);
    const newIndex = tabs.indexOf(tab);
    setSwipeDirection(newIndex > currentIndex ? 1 : -1);
    setActiveTab(tab);
  }, [activeTab, getVisibleTabs, triggerHapticFeedback]);

  const tabAnimationVariants = {
    enter: (direction: number) => ({
      x: direction > 0 ? 100 : -100,
      opacity: 0,
    }),
    center: {
      x: 0,
      opacity: 1,
    },
    exit: (direction: number) => ({
      x: direction > 0 ? -100 : 100,
      opacity: 0,
    }),
  };

  return {
    activeTab,
    setActiveTab,
    swipeDirection,
    setSwipeDirection,
    getVisibleTabs,
    handleSwipeLeft,
    handleSwipeRight,
    handleTabClick,
    triggerHapticFeedback,
    tabAnimationVariants,
    selectedCourseId,
    setSelectedCourseId: setSelectedCourseIdWithUrl,
    openCourseDetails,
    selectedStudentId,
    setSelectedStudentId: setSelectedStudentIdWithUrl,
    openStudentDetails,
    selectedGroupId,
    setSelectedGroupId: setSelectedGroupIdWithUrl,
    openGroupFolder,
  };

}
