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
    showLibrary: true,
    showAchievements: true,
    showAiChat: true
  });

  const [menuSettings, setMenuSettings] = useState<MenuSettings>({
    showStats: false,
    showLinks: false,
    showDocuments: false,
    showLibrary: true,
    showServices: true
  });

  const [isSavingSettings, setIsSavingSettings] = useState(false);

  // Load theme and menu settings on mount
  useEffect(() => {
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme === 'dark') {
      setIsDarkMode(true);
      document.documentElement.classList.add('dark');
    } else if (savedTheme === 'light') {
      setIsDarkMode(false);
      document.documentElement.classList.remove('dark');
    }

    const savedMenuSettings = localStorage.getItem('orgMenuSettings');
    if (savedMenuSettings) {
      try {
        setMenuSettings(JSON.parse(savedMenuSettings));
      } catch (e) {
        console.error('Error loading menu settings:', e);
      }
    }
  }, []);

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
            showLibrary: settings.showLibrary !== false,
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
