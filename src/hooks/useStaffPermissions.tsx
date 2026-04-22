import { createContext, useContext, useEffect, useState, ReactNode, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
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

export function StaffPermissionsProvider({ children }: { children: ReactNode }) {
  const { user, userRole } = useAuth();
  const [orgRole, setOrgRole] = useState<OrgStaffRole | null>(null);
  const [overrides, setOverrides] = useState<string[]>([]);
  const [adminRole, setAdminRole] = useState<AdminStaffRole | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (!user) {
        setOrgRole(null);
        setOverrides([]);
        setAdminRole(null);
        setLoading(false);
        return;
      }
      setLoading(true);

      // Параллельно тянем admin_staff и org_staff
      const [adminRes, orgRes] = await Promise.all([
        supabase.from('admin_staff').select('role').eq('user_id', user.id).maybeSingle(),
        supabase.from('org_staff').select('role, sections_access').eq('user_id', user.id).maybeSingle(),
      ]);
      if (cancelled) return;

      setAdminRole((adminRes.data?.role as AdminStaffRole) || null);
      setOrgRole((orgRes.data?.role as OrgStaffRole) || null);
      const so = orgRes.data?.sections_access;
      setOverrides(Array.isArray(so) ? (so as string[]) : []);
      setLoading(false);
    };
    load();
    return () => { cancelled = true; };
  }, [user]);

  const value = useMemo<StaffPermissionsContextValue>(() => {
    // Владелец организации = глобальная роль 'organization' БЕЗ записи в org_staff (он и есть owner).
    // Если запись есть — используем её роль. Глобальный admin получает все права автоматически.
    const isGlobalAdmin = userRole === 'admin';
    const isOrgOwner = userRole === 'organization' && !orgRole;

    const orgPermissions = isOrgOwner || isGlobalAdmin
      ? computeOrgPermissions('owner', null)
      : computeOrgPermissions(orgRole, overrides);

    const adminSections = isGlobalAdmin
      ? new Set(ADMIN_ROLE_SECTIONS[adminRole || 'super_admin'])
      : new Set<AdminSection>();

    return {
      loading,
      orgRole,
      adminRole,
      orgPermissions,
      adminSections,
      isOrgOwner: isOrgOwner || isGlobalAdmin,
      can: (perm) => orgPermissions.has(perm),
      canSeeOrgTab: (tabId) => {
        if (isOrgOwner || isGlobalAdmin) return true;
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
  }, [loading, orgRole, overrides, adminRole, userRole]);

  return (
    <StaffPermissionsContext.Provider value={value}>
      {children}
    </StaffPermissionsContext.Provider>
  );
}

export function useStaffPermissions(): StaffPermissionsContextValue {
  const ctx = useContext(StaffPermissionsContext);
  if (!ctx) {
    // Безопасный фолбек, если провайдер не подключен — ничего не ломаем.
    return {
      loading: false,
      orgRole: null,
      adminRole: null,
      orgPermissions: new Set(),
      adminSections: new Set(),
      isOrgOwner: false,
      can: () => true,
      canSeeOrgTab: () => true,
      canSeeAdminTab: () => true,
    };
  }
  return ctx;
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
