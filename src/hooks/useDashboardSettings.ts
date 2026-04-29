import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useOrganizationCore } from "@/hooks/useOrganizationCore";
import { useQueryClient } from "@tanstack/react-query";

interface StudentDashboardSettings {
  showLibrary: boolean;
  showAchievements: boolean;
  showAiChat: boolean;
}

interface MenuSettings {
  showStats: boolean;
  showLinks: boolean;
  showDocuments: boolean;
  showLibrary: boolean;
  showServices: boolean;
  showLaborSafety: boolean;
  showCourses?: boolean;
  showCompanies?: boolean;
  showStudents?: boolean;
  showJournals?: boolean;
  showFrdo?: boolean;
  showSubscription?: boolean;
  showAITutors?: boolean;
  showSales?: boolean;
  courseViewMode?: 'grid' | 'list';
  courseFolderMode?: 'folders' | 'flat';
}

export const defaultMenuSettings: MenuSettings = {
  showStats: false,
  showLinks: false,
  showDocuments: false,
  showLibrary: true,
  showServices: true,
  showLaborSafety: false,
  showCourses: true,
  showCompanies: false,
  showStudents: true,
  showJournals: true,
  showFrdo: true,
  showSubscription: true,
  showAITutors: false,
  showSales: false,
  courseViewMode: 'grid',
  courseFolderMode: 'folders',
};

/** Ensures critical menu items are never accidentally hidden */
function normalizeMenuSettings(raw: Record<string, unknown> | null | undefined): MenuSettings {
  if (!raw || typeof raw !== 'object') return { ...defaultMenuSettings };
  return {
    showStats: raw.showStats === true,
    showLinks: raw.showLinks === true,
    showDocuments: raw.showDocuments === true,
    showLibrary: raw.showLibrary !== false,
    showServices: raw.showServices !== false,
    showLaborSafety: raw.showLaborSafety !== false,
    showCourses: raw.showCourses !== false,
    // Off by default — user must explicitly enable in settings
    showCompanies: raw.showCompanies === true,
    showStudents: raw.showStudents !== false,
    showJournals: raw.showJournals !== false,
    showFrdo: raw.showFrdo !== false,
    showSubscription: raw.showSubscription !== false,
    // Off by default — user must explicitly enable in settings
    showAITutors: raw.showAITutors === true,
    // Off by default — admin or hidden URL toggle to enable
    showSales: raw.showSales === true,
    courseViewMode: (raw.courseViewMode === 'list' ? 'list' : 'grid') as 'grid' | 'list',
    courseFolderMode: (raw.courseFolderMode === 'flat' ? 'flat' : 'folders') as 'folders' | 'flat',
  };
}

export function useDashboardSettings(organizationId: string | null) {
  const [isDarkMode, setIsDarkMode] = useState(() => {
    if (typeof window !== 'undefined') {
      return document.documentElement.classList.contains('dark');
    }
    return false;
  });

  const [studentDashboardSettings, setStudentDashboardSettings] = useState<StudentDashboardSettings>({
    showLibrary: false,
    showAchievements: true,
    showAiChat: true
  });

  const [menuSettings, setMenuSettings] = useState<MenuSettings>(defaultMenuSettings);
  const [isSavingSettings, setIsSavingSettings] = useState(false);

  const qc = useQueryClient();
  const { data: orgCore } = useOrganizationCore(organizationId);

  // Load theme on mount
  useEffect(() => {
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme === 'dark') {
      setIsDarkMode(true);
      document.documentElement.classList.add('dark');
    } else if (savedTheme === 'light') {
      setIsDarkMode(false);
      document.documentElement.classList.remove('dark');
    }
  }, []);

  // Берём menu_settings из общего кэша core (fallback на localStorage-миграцию ниже)
  useEffect(() => {
    if (!orgCore) return;
    const ms = orgCore.menu_settings;
    if (ms && typeof ms === 'object' && Object.keys(ms as object).length > 0) {
      setMenuSettings(normalizeMenuSettings(ms as Record<string, unknown>));
    } else if (organizationId) {
      // Migrate from localStorage if DB is empty (one-time)
      const saved = localStorage.getItem('orgMenuSettings');
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          const migrated = normalizeMenuSettings(parsed);
          setMenuSettings(migrated);
          supabase
            .from('organizations')
            .update({ menu_settings: migrated as any })
            .eq('id', organizationId)
            .then(() => {
              qc.invalidateQueries({ queryKey: ["org-core", organizationId] });
              localStorage.removeItem('orgMenuSettings');
            });
        } catch (e) {
          console.error('Error migrating menu settings:', e);
        }
      } else {
        setMenuSettings({ ...defaultMenuSettings });
      }
    }
  }, [orgCore, organizationId, qc]);

  // Берём student_dashboard_settings из общего кэша core
  useEffect(() => {
    const sds = orgCore?.student_dashboard_settings;
    if (sds && typeof sds === 'object') {
      const settings = sds as Record<string, unknown>;
      setStudentDashboardSettings({
        showLibrary: settings.showLibrary === true,
        showAchievements: settings.showAchievements !== false,
        showAiChat: settings.showAiChat !== false
      });
    }
  }, [orgCore?.student_dashboard_settings]);

  // Reload menu from DB (for manual refresh button) — теперь через инвалидацию кэша core
  const reloadMenuSettings = useCallback(async () => {
    await qc.invalidateQueries({ queryKey: ["org-core", organizationId] });
  }, [organizationId, qc]);

  // Reset menu to defaults and save to DB
  const resetMenuSettings = useCallback(async () => {
    if (!organizationId) return;
    const defaults = { ...defaultMenuSettings };
    setMenuSettings(defaults);
    try {
      await supabase
        .from('organizations')
        .update({ menu_settings: defaults as any })
        .eq('id', organizationId);
      qc.invalidateQueries({ queryKey: ["org-core", organizationId] });
    } catch (error) {
      console.error('Error resetting menu settings:', error);
    }
  }, [organizationId, qc]);

  // Preview student dashboard
  const previewStudentDashboard = useCallback(() => {
    localStorage.setItem('previewStudentDashboard', 'true');
    localStorage.setItem('studentDashboardSettings', JSON.stringify(studentDashboardSettings));
    window.open('/student', '_blank');
  }, [studentDashboardSettings]);

  return {
    isDarkMode,
    setIsDarkMode,
    studentDashboardSettings,
    setStudentDashboardSettings,
    menuSettings,
    setMenuSettings,
    isSavingSettings,
    setIsSavingSettings,
    previewStudentDashboard,
    reloadMenuSettings,
    resetMenuSettings,
  };
}
