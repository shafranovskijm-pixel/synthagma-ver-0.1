// Organization types
export interface Organization {
  id: string;
  name: string;
  email: string;
  contact_name: string | null;
  phone: string | null;
  inn: string | null;
  kpp: string | null;
  ogrn: string | null;
  legal_address: string | null;
  actual_address: string | null;
  ai_enabled: boolean;
  ai_tokens_limit: number;
  frdo_enabled: boolean;
  storage_limit_bytes: number;
  director_name: string | null;
  director_position: string | null;
  bank_name: string | null;
  bank_account: string | null;
  bank_bik: string | null;
  bank_corr_account: string | null;
  signature_url: string | null;
  stamp_url: string | null;
  branding: BrandingSettings | null;
  student_dashboard_settings: StudentDashboardSettings | null;
  created_at: string;
  updated_at: string;
  // Computed fields
  studentsCount?: number;
  coursesCount?: number;
}

export interface BrandingSettings {
  coverUrl?: string;
  primaryColor?: string;
  secondaryColor?: string;
  logoUrl?: string;
  showOrgName?: boolean;
}

export interface StudentDashboardSettings {
  showLibrary?: boolean;
  showAchievements?: boolean;
  showAiChat?: boolean;
}

export interface OrgRequisites {
  name: string;
  inn: string | null;
  kpp: string | null;
  ogrn: string | null;
  legal_address: string | null;
  actual_address: string | null;
  director_name: string | null;
  director_position: string | null;
  bank_name: string | null;
  bank_account: string | null;
  bank_bik: string | null;
  bank_corr_account: string | null;
  signature_url: string | null;
  stamp_url: string | null;
}

export interface Company {
  id: string;
  name: string;
  inn: string | null;
  kpp: string | null;
  ogrn: string | null;
  address: string | null;
  director: string | null;
  organization_id: string;
  signature_url: string | null;
  stamp_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface RegistrationLink {
  id: string;
  token: string;
  name: string | null;
  inn: string | null;
  company_id: string | null;
  course_id: string | null;
  expires_at: string | null;
  used_count: number;
  created_at: string;
  organization_id: string;
}

export interface MenuSettings {
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

export interface DocumentsStats {
  total: number;
  withPassport: number;
  withSnils: number;
  withEducation: number;
  complete: number;
}

export interface OrganizationStats {
  totalStudents: number;
  totalCourses: number;
  completedCount: number;
  averageProgress: number;
}
