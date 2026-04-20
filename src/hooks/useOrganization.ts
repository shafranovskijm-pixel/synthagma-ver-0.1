import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import type { 
  Organization, 
  BrandingSettings, 
  StudentDashboardSettings,
  OrganizationStats,
  DocumentsStats 
} from "@/types";
import { 
  fetchOrganizationByUserId,
  fetchOrganization,
  fetchOrganizationStats,
  fetchDocumentsStats,
  updateBrandingSettings as updateBrandingApi,
  updateStudentDashboardSettings as updateSettingsApi
} from "@/api/organizations";
import { toast } from "sonner";

export type { 
  Organization, 
  BrandingSettings, 
  StudentDashboardSettings,
  OrganizationStats,
  DocumentsStats 
};

interface UseOrganizationReturn {
  organizationId: string | null;
  organizationName: string;
  organization: Organization | null;
  isFrdoEnabled: boolean;
  isLoading: boolean;
  isAdminView: boolean;
  adminViewOrgId: string | null;
  stats: OrganizationStats;
  documentsStats: DocumentsStats;
  studentDocsByUser: Map<string, string[]>;
  brandingSettings: BrandingSettings;
  studentDashboardSettings: StudentDashboardSettings;
  setBrandingSettings: (settings: BrandingSettings) => void;
  setStudentDashboardSettings: (settings: StudentDashboardSettings) => void;
  saveBranding: () => Promise<boolean>;
  saveStudentSettings: () => Promise<boolean>;
  refresh: () => void;
  exitAdminView: () => void;
}

export function useOrganization(): UseOrganizationReturn {
  const { user } = useAuth();
  
  const [organizationId, setOrganizationId] = useState<string | null>(null);
  const [organizationName, setOrganizationName] = useState("Организация");
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [isFrdoEnabled, setIsFrdoEnabled] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isAdminView, setIsAdminView] = useState(false);
  const [adminViewOrgId, setAdminViewOrgId] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  
  const [stats, setStats] = useState<OrganizationStats>({
    totalStudents: 0,
    totalCourses: 0,
    completedCount: 0,
    averageProgress: 0
  });
  
  const [documentsStats, setDocumentsStats] = useState<DocumentsStats>({
    total: 0,
    withPassport: 0,
    withSnils: 0,
    withEducation: 0,
    complete: 0
  });
  
  const [studentDocsByUser, setStudentDocsByUser] = useState<Map<string, string[]>>(new Map());
  
  const [brandingSettings, setBrandingSettings] = useState<BrandingSettings>({
    coverUrl: '',
    primaryColor: '#0d9488',
    secondaryColor: '#14b8a6',
    logoUrl: '',
    showOrgName: true
  });
  
  const [studentDashboardSettings, setStudentDashboardSettings] = useState<StudentDashboardSettings>({
    showLibrary: true,
    showAchievements: true,
    showAiChat: true
  });

  // Load organization data
  useEffect(() => {
    const loadOrganization = async () => {
      if (!user) {
        setIsLoading(false);
        return;
      }

      try {
        // Check for admin view mode
        const adminViewData = localStorage.getItem("adminViewAsOrg");
        let orgId: string | null = null;

        if (adminViewData) {
          // Verify the current user actually has admin role before trusting the localStorage flag.
          // This prevents non-admin users from spoofing admin-only UI (e.g. "Перенести в другую организацию").
          const { data: isAdmin } = await supabase.rpc('has_role', {
            _role: 'admin',
            _user_id: user.id,
          });

          if (isAdmin) {
            const adminView = JSON.parse(adminViewData);
            orgId = adminView.id;
            setAdminViewOrgId(adminView.id);
            setOrganizationName(adminView.name);
            setIsAdminView(true);
          } else {
            // Not actually an admin — clear the spoofed flag and fall back to normal flow.
            localStorage.removeItem("adminViewAsOrg");
            const result = await fetchOrganizationByUserId(user.id);
            orgId = result.organizationId;
            setOrganizationName(result.organizationName);
            setIsFrdoEnabled(result.isFrdoEnabled);
          }
        } else {
          const result = await fetchOrganizationByUserId(user.id);
          orgId = result.organizationId;
          setOrganizationName(result.organizationName);
          setIsFrdoEnabled(result.isFrdoEnabled);
        }

        if (!orgId) {
          setIsLoading(false);
          return;
        }

        setOrganizationId(orgId);

        // Fetch full organization data
        const org = await fetchOrganization(orgId);
        if (org) {
          setOrganization(org);
          setIsFrdoEnabled(org.frdo_enabled);
          
          // Load branding
          if (org.branding && typeof org.branding === 'object') {
            const branding = org.branding as Record<string, unknown>;
            setBrandingSettings({
              coverUrl: branding.coverUrl as string || '',
              primaryColor: branding.primaryColor as string || '#0d9488',
              secondaryColor: branding.secondaryColor as string || '#14b8a6',
              logoUrl: branding.logoUrl as string || '',
              showOrgName: branding.showOrgName !== false
            });
          }
          
          // Load student dashboard settings
          if (org.student_dashboard_settings && typeof org.student_dashboard_settings === 'object') {
            const settings = org.student_dashboard_settings as Record<string, unknown>;
            setStudentDashboardSettings({
              showLibrary: settings.showLibrary !== false,
              showAchievements: settings.showAchievements !== false,
              showAiChat: settings.showAiChat !== false
            });
          }
        }

        // Fetch stats
        const orgStats = await fetchOrganizationStats(orgId);
        setStats(orgStats);

        // Fetch documents stats
        const { stats: docStats, docsByUser } = await fetchDocumentsStats(orgId);
        setDocumentsStats(docStats);
        setStudentDocsByUser(docsByUser);

      } catch (error) {
        console.error("Error loading organization:", error);
      } finally {
        setIsLoading(false);
      }
    };

    loadOrganization();
  }, [user, refreshKey]);

  const saveBranding = useCallback(async (): Promise<boolean> => {
    if (!organizationId) return false;
    
    const success = await updateBrandingApi(organizationId, brandingSettings);
    if (success) {
      toast.success("Настройки брендирования сохранены");
    } else {
      toast.error("Ошибка сохранения настроек");
    }
    return success;
  }, [organizationId, brandingSettings]);

  const saveStudentSettings = useCallback(async (): Promise<boolean> => {
    if (!organizationId) return false;
    
    const success = await updateSettingsApi(organizationId, studentDashboardSettings);
    if (success) {
      toast.success("Настройки панели студента сохранены");
    } else {
      toast.error("Ошибка сохранения настроек");
    }
    return success;
  }, [organizationId, studentDashboardSettings]);

  const refresh = useCallback(() => {
    setRefreshKey(prev => prev + 1);
  }, []);

  const exitAdminView = useCallback(() => {
    localStorage.removeItem("adminViewAsOrg");
    setIsAdminView(false);
    setAdminViewOrgId(null);
    window.location.reload();
  }, []);

  return {
    organizationId,
    organizationName,
    organization,
    isFrdoEnabled,
    isLoading,
    isAdminView,
    adminViewOrgId,
    stats,
    documentsStats,
    studentDocsByUser,
    brandingSettings,
    studentDashboardSettings,
    setBrandingSettings,
    setStudentDashboardSettings,
    saveBranding,
    saveStudentSettings,
    refresh,
    exitAdminView
  };
}
