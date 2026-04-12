import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

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
  showCourses?: boolean;
  showCompanies?: boolean;
  showStudents?: boolean;
  showJournals?: boolean;
  showFrdo?: boolean;
  showSubscription?: boolean;
  courseViewMode?: 'grid' | 'list';
  courseFolderMode?: 'folders' | 'flat';
}

const defaultMenuSettings: MenuSettings = {
  showStats: false,
  showLinks: false,
  showDocuments: false,
  showLibrary: true,
  showServices: true,
  showCourses: true,
  showCompanies: true,
  showStudents: true,
  showJournals: true,
  showFrdo: true,
  showSubscription: true,
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
    // Critical items — always true unless explicitly set to false
    showCourses: raw.showCourses !== false,
    showCompanies: raw.showCompanies !== false,
    showStudents: raw.showStudents !== false,
    showJournals: raw.showJournals !== false,
    showFrdo: raw.showFrdo !== false,
    showSubscription: raw.showSubscription !== false,
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

  // Load menu settings from DB (with localStorage migration)
  const loadMenuSettings = useCallback(async () => {
    if (!organizationId) return;
    try {
      const { data, error } = await supabase
        .from('organizations')
        .select('menu_settings')
        .eq('id', organizationId)
        .single();
      if (error) throw error;

      if (data?.menu_settings && typeof data.menu_settings === 'object' && Object.keys(data.menu_settings as object).length > 0) {
        setMenuSettings(normalizeMenuSettings(data.menu_settings as Record<string, unknown>));
      } else {
        // Migrate from localStorage if DB is empty
        const saved = localStorage.getItem('orgMenuSettings');
        if (saved) {
          try {
            const parsed = JSON.parse(saved);
            const migrated = normalizeMenuSettings(parsed);
            setMenuSettings(migrated);
            await supabase
              .from('organizations')
              .update({ menu_settings: migrated as any })
              .eq('id', organizationId);
            localStorage.removeItem('orgMenuSettings');
          } catch (e) {
            console.error('Error migrating menu settings:', e);
          }
        } else {
          setMenuSettings({ ...defaultMenuSettings });
        }
      }
    } catch (error) {
      console.error('Error loading menu settings from DB:', error);
    }
  }, [organizationId]);

  useEffect(() => {
    loadMenuSettings();
  }, [loadMenuSettings]);

  // Realtime subscription for menu_settings changes
  useEffect(() => {
    if (!organizationId) return;

    const channel = supabase
      .channel(`org-menu-${organizationId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'organizations',
          filter: `id=eq.${organizationId}`,
        },
        (payload) => {
          const newSettings = (payload.new as any)?.menu_settings;
          if (newSettings && typeof newSettings === 'object') {
            setMenuSettings(normalizeMenuSettings(newSettings));
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [organizationId]);

  // Load student dashboard settings from organization
  useEffect(() => {
    const loadStudentSettings = async () => {
      if (!organizationId) return;
      try {
        const { data, error } = await supabase
          .from('organizations')
          .select('student_dashboard_settings')
          .eq('id', organizationId)
          .single();
        if (error) throw error;
        if (data?.student_dashboard_settings && typeof data.student_dashboard_settings === 'object') {
          const settings = data.student_dashboard_settings as Record<string, unknown>;
          setStudentDashboardSettings({
            showLibrary: settings.showLibrary === true,
            showAchievements: settings.showAchievements !== false,
            showAiChat: settings.showAiChat !== false
          });
        }
      } catch (error) {
        console.error('Error loading student dashboard settings:', error);
      }
    };
    loadStudentSettings();
  }, [organizationId]);

  // Reload menu from DB (for manual refresh button)
  const reloadMenuSettings = useCallback(async () => {
    await loadMenuSettings();
  }, [loadMenuSettings]);

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
    } catch (error) {
      console.error('Error resetting menu settings:', error);
    }
  }, [organizationId]);

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
