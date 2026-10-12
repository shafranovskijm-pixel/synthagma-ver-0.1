import { createContext, useContext, useEffect, useState, ReactNode, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { resolveStaffOrganization, type StaffOrganizationResolution } from '@/utils/resolveStaffOrganization';
import { toast } from 'sonner';
import {
  Permission,
  OrgStaffRole,
  AdminStaffRole,
  AdminSection,
  ADMIN_ROLE_SECTIONS,
  ORG_TAB_TO_PERMISSION,
  computeOrgPermissions,
} from '@/constants/rolePermissions';

interface StaffPermissionsContextValue {
  loading: boolean;
  error: string | null;
  organizationId: string | null;
  /** Роль сотрудника организации (если пользователь — сотрудник) */
  orgRole: OrgStaffRole | null;
  /** Роль сотрудника платформы (если пользователь — админ-сотрудник) */
  adminRole: AdminStaffRole | null;
  /** Полный набор прав в организации (роль + personal overrides) */
  orgPermissions: Set<Permission>;
  /** Доступные разделы админ-панели */
  adminSections: Set<AdminSection>;
  /** True, если пользователь — владелец/админ организации (без записи в org_staff) */
  isOrgOwner: boolean;
  /** Универсальная проверка разрешения для сотрудника организации */
  can: (perm: Permission) => boolean;
  /** Можно ли показать вкладку sidebar организации */
  canSeeOrgTab: (tabId: string) => boolean;
  /** Можно ли показать вкладку sidebar админ-панели */
  canSeeAdminTab: (tabId: AdminSection | string) => boolean;
}

const StaffPermissionsContext = createContext<StaffPermissionsContextValue | undefined>(undefined);
const PERMISSIONS_ERROR_TOAST = 'staff-permissions-error';

export function StaffPermissionsProvider({ children }: { children: ReactNode }) {
  const { user, userRole, loading: authLoading = false } = useAuth();
  const userId = user?.id;
  const accessKey = `${userId || ''}:${userRole || ''}`;
  const [refreshKey, setRefreshKey] = useState(0);
  const [access, setAccess] = useState<{
    key: string;
    workspace: StaffOrganizationResolution | null;
    adminRole: AdminStaffRole | null;
    error: string | null;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (!userId) {
        toast.dismiss(PERMISSIONS_ERROR_TOAST);
        return;
      }
      if (authLoading) return;
      if (userRole !== 'organization' && userRole !== 'admin') {
        // get_user_role resolves active organization staff to 'organization'.
        // Ordinary learners/company users do not need staff permission reads.
        setAccess({ key: accessKey, workspace: null, adminRole: null, error: null });
        toast.dismiss(PERMISSIONS_ERROR_TOAST);
        return;
      }
      setAccess(null);
      try {
        if (userRole === 'admin') {
          // A global admin keeps the platform section restrictions from
          // admin_staff; only a successful empty result means the legacy
          // unrestricted administrator. A failed query grants no UI rights.
          const { data, error } = await supabase.from('admin_staff')
            .select('role').eq('user_id', userId).maybeSingle();
          if (error) throw error;
          if (data?.role && !Object.prototype.hasOwnProperty.call(ADMIN_ROLE_SECTIONS, data.role)) {
            throw new Error('Не удалось определить роль сотрудника платформы.');
          }
          if (!cancelled) setAccess({ key: accessKey, workspace: null, adminRole: (data?.role as AdminStaffRole) || null, error: null });
        } else {
          const workspace = await resolveStaffOrganization(userId);
          if (!cancelled) setAccess({ key: accessKey, workspace, adminRole: null, error: null });
        }
        if (!cancelled) toast.dismiss(PERMISSIONS_ERROR_TOAST);
      } catch (error) {
        if (!cancelled) {
          const message = error instanceof Error ? error.message : 'Не удалось подтвердить права. Повторите загрузку.';
          setAccess({ key: accessKey, workspace: null, adminRole: null, error: message });
          toast.error(message, {
            id: PERMISSIONS_ERROR_TOAST,
            duration: Infinity,
            action: { label: 'Повторить', onClick: () => setRefreshKey(key => key + 1) },
          });
        }
      }
    };
    void load();
    return () => { cancelled = true; };
  }, [userId, userRole, accessKey, authLoading, refreshKey]);

  const value = useMemo<StaffPermissionsContextValue>(() => {
    const currentAccess = userId && access?.key === accessKey ? access : null;
    const loading = !!userId && (authLoading || !currentAccess);
    const ready = !loading && !!currentAccess && !currentAccess.error;
    const workspace = ready ? currentAccess.workspace : null;
    const orgRole = workspace?.kind === 'staff' ? workspace.role : null;
    const adminRole = ready ? currentAccess.adminRole : null;
    const isGlobalAdmin = ready && userRole === 'admin';
    const isOrgOwner = workspace?.kind === 'owner';
    const orgPermissions = isOrgOwner || isGlobalAdmin
      ? computeOrgPermissions('owner', null)
      : computeOrgPermissions(orgRole, workspace?.sectionsAccess);

    const adminSections = isGlobalAdmin
      ? new Set(ADMIN_ROLE_SECTIONS[adminRole || 'super_admin'])
      : new Set<AdminSection>();

    return {
      loading,
      error: currentAccess?.error || null,
      organizationId: workspace?.organizationId || null,
      orgRole,
      adminRole,
      orgPermissions,
      adminSections,
      isOrgOwner: isOrgOwner || isGlobalAdmin,
      can: (perm) => orgPermissions.has(perm),
      canSeeOrgTab: (tabId) => {
        if (isOrgOwner || isGlobalAdmin) return true;
        if (workspace?.kind !== 'staff') return false;
        const required = ORG_TAB_TO_PERMISSION[tabId];
        if (!required) return true; // вкладки без явного маппинга показываем всем сотрудникам
        return orgPermissions.has(required);
      },
      canSeeAdminTab: (tabId) => {
        if (!isGlobalAdmin) return false;
        // Если admin_staff не настроен — даём все разделы (обратная совместимость).
        if (!adminRole) return true;
        return adminSections.has(tabId as AdminSection);
      },
    };
  }, [access, accessKey, userId, userRole, authLoading]);

  return (
    <StaffPermissionsContext.Provider value={value}>
      {children}
    </StaffPermissionsContext.Provider>
  );
}

// Стабильный фолбек: создаём один раз, чтобы потребители не получали новый объект на каждом рендере.
const FALLBACK_VALUE: StaffPermissionsContextValue = {
  loading: false,
  error: null,
  organizationId: null,
  orgRole: null,
  adminRole: null,
  orgPermissions: new Set(),
  adminSections: new Set(),
  isOrgOwner: false,
  can: () => true,
  canSeeOrgTab: () => true,
  canSeeAdminTab: () => true,
};

export function useStaffPermissions(): StaffPermissionsContextValue {
  const ctx = useContext(StaffPermissionsContext);
  return ctx ?? FALLBACK_VALUE;
}

interface RequirePermProps {
  perm: Permission;
  fallback?: ReactNode;
  children: ReactNode;
}

export function RequirePerm({ perm, fallback = null, children }: RequirePermProps) {
  const { can, loading } = useStaffPermissions();
  if (loading) return null;
  return can(perm) ? <>{children}</> : <>{fallback}</>;
}
