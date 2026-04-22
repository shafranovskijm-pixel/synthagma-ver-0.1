/**
 * Единая матрица прав сотрудников (frontend mirror SQL-функций).
 *
 * Используется хуком useStaffPermissions для проверки `can('section.read')`
 * и компонентом RequirePerm для условного рендера в UI.
 *
 * Серверная истина — функции public.get_org_staff_permissions
 * и public.has_org_staff_permission. Эта матрица должна быть синхронной
 * с public.org_role_default_permissions в SQL.
 */

// ===== Permissions catalog =====
export type Permission =
  // Курсы и контент
  | 'courses.read' | 'courses.write'
  // Ученики и группы
  | 'students.read' | 'students.write'
  // Компании-клиенты (B2B)
  | 'companies.read' | 'companies.write'
  // Библиотека/маркетплейс
  | 'library.read' | 'library.write'
  // Документы об образовании
  | 'documents.read' | 'documents.write'
  // Журналы и протоколы
  | 'journals.read' | 'journals.write'
  // ФРДО
  | 'frdo.read' | 'frdo.write'
  // Охрана труда
  | 'labor_safety.read' | 'labor_safety.write'
  // Услуги/прайс
  | 'services.read' | 'services.write'
  // Сотрудники
  | 'staff.read' | 'staff.write'
  // Биллинг и подписка
  | 'billing.read' | 'billing.write'
  // Настройки школы
  | 'settings.read' | 'settings.write'
  // Чаты
  | 'chats.read' | 'chats.write'
  // Проверка домашних заданий
  | 'homework.read' | 'homework.write'
  // Вебинары
  | 'webinars.read' | 'webinars.write'
  // Продажи (CRM-модуль)
  | 'sales.read' | 'sales.write';

export type OrgStaffRole = 'owner' | 'admin' | 'school_editor' | 'course_editor' | 'teacher';
export type AdminStaffRole = 'super_admin' | 'admin' | 'sales_manager' | 'viewer';

// ===== Org-staff matrix =====
const ORG_OWNER: Permission[] = [
  'courses.read', 'courses.write',
  'students.read', 'students.write',
  'companies.read', 'companies.write',
  'library.read', 'library.write',
  'documents.read', 'documents.write',
  'journals.read', 'journals.write',
  'frdo.read', 'frdo.write',
  'labor_safety.read', 'labor_safety.write',
  'services.read', 'services.write',
  'staff.read', 'staff.write',
  'billing.read', 'billing.write',
  'settings.read', 'settings.write',
  'chats.read', 'chats.write',
  'homework.read', 'homework.write',
  'webinars.read', 'webinars.write',
  'sales.read', 'sales.write',
];

const ORG_ADMIN: Permission[] = [
  'courses.read', 'courses.write',
  'students.read', 'students.write',
  'companies.read', 'companies.write',
  'library.read', 'library.write',
  'documents.read', 'documents.write',
  'journals.read', 'journals.write',
  'frdo.read', 'frdo.write',
  'labor_safety.read', 'labor_safety.write',
  'services.read', 'services.write',
  'staff.read',
  'billing.read', 'settings.read',
  'chats.read', 'chats.write',
  'homework.read', 'homework.write',
  'webinars.read', 'webinars.write',
  'sales.read',
];

const ORG_SCHOOL_EDITOR: Permission[] = [
  'courses.read', 'courses.write',
  'library.read', 'library.write',
  'documents.read', 'services.read', 'services.write',
  'settings.read', 'webinars.read', 'webinars.write',
];

const ORG_COURSE_EDITOR: Permission[] = [
  'courses.read', 'courses.write',
  'library.read', 'library.write',
  'documents.read', 'webinars.read',
];

const ORG_TEACHER: Permission[] = [
  'courses.read', 'students.read',
  'chats.read', 'chats.write',
  'homework.read', 'homework.write',
  'documents.read', 'journals.read',
];

export const ORG_ROLE_PERMISSIONS: Record<OrgStaffRole, Permission[]> = {
  owner: ORG_OWNER,
  admin: ORG_ADMIN,
  school_editor: ORG_SCHOOL_EDITOR,
  course_editor: ORG_COURSE_EDITOR,
  teacher: ORG_TEACHER,
};

// ===== Admin-staff matrix (платформа) =====
// Действует поверх глобальной роли user_roles.role='admin'.
// Sales-разделы и финансы доступны только super_admin/admin/sales_manager.
const ADMIN_SECTIONS_FULL = [
  'organizations', 'users', 'marketplace', 'sales', 'finance',
  'webinars-admin', 'chats', 'billing', 'broadcast', 'support-chats',
  'referrals', 'support', 'devtools', 'updates', 'staff', 'settings',
  'analytics', 'content', 'ai',
] as const;

export type AdminSection = typeof ADMIN_SECTIONS_FULL[number];

export const ADMIN_ROLE_SECTIONS: Record<AdminStaffRole, AdminSection[]> = {
  super_admin: [...ADMIN_SECTIONS_FULL],
  admin: [
    'organizations', 'users', 'marketplace', 'sales', 'finance',
    'webinars-admin', 'chats', 'billing', 'broadcast', 'support-chats',
    'referrals', 'support', 'updates', 'staff', 'settings',
    'analytics', 'content', 'ai',
  ],
  sales_manager: [
    'sales', 'marketplace', 'finance', 'billing',
    'support-chats', 'chats', 'analytics',
  ],
  viewer: [
    'organizations', 'users', 'analytics', 'support-chats', 'chats',
  ],
};

// ===== Section ↔ permission map (for UI guards) =====
// Маппит вкладку sidebar организации на минимальное право для её показа.
export const ORG_TAB_TO_PERMISSION: Record<string, Permission> = {
  courses: 'courses.read',
  students: 'students.read',
  organizations: 'companies.read', // вкладка «Компании» в OrgSidebar
  library: 'library.read',
  links: 'library.read',
  documents: 'documents.read',
  'documents-orders': 'documents.read',
  'documents-protocols': 'documents.read',
  'documents-certificates': 'documents.read',
  'documents-diplomas': 'documents.read',
  'documents-testimonials': 'documents.read',
  'org-documents': 'documents.read',
  journals: 'journals.read',
  'labor-safety': 'labor_safety.read',
  frdo: 'frdo.read',
  services: 'services.read',
  staff: 'staff.read',
  subscription: 'billing.read',
  payments: 'billing.read',
  settings: 'settings.read',
  chats: 'chats.read',
  'homework-review': 'homework.read',
  'ai-tutors': 'courses.read',
  webinars: 'webinars.read',
  sales: 'sales.read',
  profile: 'settings.read',
  stats: 'courses.read',
};

// Helper: union role + personal overrides.
export function computeOrgPermissions(
  role: OrgStaffRole | string | null | undefined,
  overrides: string[] | null | undefined
): Set<Permission> {
  const base = role && (role in ORG_ROLE_PERMISSIONS)
    ? ORG_ROLE_PERMISSIONS[role as OrgStaffRole]
    : [];
  const merged = new Set<Permission>(base);
  for (const o of overrides || []) merged.add(o as Permission);
  return merged;
}
