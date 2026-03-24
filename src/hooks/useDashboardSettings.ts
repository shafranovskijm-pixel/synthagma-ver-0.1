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
  };

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
  useEffect(() => {
    const loadMenuSettings = async () => {
      if (!organizationId) return;
      try {
        const { data, error } = await supabase
          .from('organizations')
          .select('menu_settings')
          .eq('id', organizationId)
          .single();
        if (error) throw error;

        if (data?.menu_settings && typeof data.menu_settings === 'object' && Object.keys(data.menu_settings as object).length > 0) {
          const s = data.menu_settings as Record<string, unknown>;
          setMenuSettings({
            ...defaultMenuSettings,
            showStats: s.showStats === true,
            showLinks: s.showLinks === true,
            showDocuments: s.showDocuments === true,
            showLibrary: s.showLibrary !== false,
            showServices: s.showServices !== false,
            showCourses: s.showCourses !== false,
            showCompanies: s.showCompanies !== false,
            showStudents: s.showStudents !== false,
            showJournals: s.showJournals !== false,
            showFrdo: s.showFrdo !== false,
          });
        } else {
          // Migrate from localStorage if DB is empty
          const saved = localStorage.getItem('orgMenuSettings');
          if (saved) {
            try {
              const parsed = JSON.parse(saved);
              const migrated = { ...defaultMenuSettings, ...parsed };
              setMenuSettings(migrated);
              // Save to DB
              await supabase
                .from('organizations')
                .update({ menu_settings: migrated })
                .eq('id', organizationId);
              localStorage.removeItem('orgMenuSettings');
            } catch (e) {
              console.error('Error migrating menu settings:', e);
            }
          } else {
            // No settings anywhere — use defaults (all visible)
            setMenuSettings(defaultMenuSettings);
          }
        }
      } catch (error) {
        console.error('Error loading menu settings from DB:', error);
      }
    };
    loadMenuSettings();
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
  };
}
