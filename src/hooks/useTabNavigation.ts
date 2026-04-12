import { useState, useCallback } from "react";
import { TabType } from "@/components/organization/OrgSidebar";

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
  const [activeTab, setActiveTab] = useState<TabType>("courses");
  const [swipeDirection, setSwipeDirection] = useState(0);

  // Haptic feedback helper
  const triggerHapticFeedback = useCallback(() => {
    if ('vibrate' in navigator) {
      navigator.vibrate(10);
    }
  }, []);

  const getVisibleTabs = useCallback((): TabType[] => {
    const baseTabs: TabType[] = [];
    
    if (isEnabled("courses")) baseTabs.push("courses");
    if (isEnabled("companies")) baseTabs.push("organizations");
    if (isEnabled("students")) baseTabs.push("students");
    if (menuSettings.showLibrary && isEnabled("library")) baseTabs.push("library");
    if (menuSettings.showStats) baseTabs.push("stats");
    if (menuSettings.showLinks && isEnabled("links")) baseTabs.push("links");
    if (menuSettings.showLaborSafety !== false && isEnabled("labor_safety")) baseTabs.push("labor-safety");
    
    baseTabs.push("payments");
    if (menuSettings.showSubscription !== false) baseTabs.push("subscription");
    if (menuSettings.showServices && isEnabled("services")) baseTabs.push("services");
    baseTabs.push("chats");
    if (isEnabled("settings")) baseTabs.push("settings");
    
    return baseTabs;
  }, [menuSettings, isFrdoEnabled, isEnabled]);

  const handleSwipeLeft = useCallback(() => {
    if (!isMobile) return;
    const tabs = getVisibleTabs();
    const currentIndex = tabs.indexOf(activeTab);
    if (currentIndex < tabs.length - 1) {
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
  };
}
