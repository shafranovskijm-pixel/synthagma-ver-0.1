import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import type { 
  Organization, 
  Company, 
  RegistrationLink, 
  BrandingSettings, 
  StudentDashboardSettings,
  DocumentsStats,
  OrganizationStats 
} from "@/types";

// ============= Organization API =============

export async function fetchOrganization(organizationId: string): Promise<Organization | null> {
  const { data, error } = await supabase
    .from("organizations")
    .select("*")
    .eq("id", organizationId)
    .single();
  
  if (error) {
    console.error("Error fetching organization:", error);
    return null;
  }
  
  return data as Organization;
}

export async function fetchOrganizationByUserId(userId: string): Promise<{ organizationId: string | null; organizationName: string; isFrdoEnabled: boolean }> {
  const { data: profile } = await supabase
    .from("profiles")
    .select("organization_id")
    .eq("user_id", userId)
    .single();
  
  if (!profile?.organization_id) {
    return { organizationId: null, organizationName: "", isFrdoEnabled: false };
  }
  
  const { data: orgData } = await supabase
    .from("organizations")
    .select("name, frdo_enabled")
    .eq("id", profile.organization_id)
    .single();
  
  return {
    organizationId: profile.organization_id,
    organizationName: orgData?.name || "Организация",
    isFrdoEnabled: orgData?.frdo_enabled || false
  };
}

export async function fetchAllOrganizations(): Promise<Organization[]> {
  const { data: orgs, error } = await supabase
    .from("organizations")
    .select("*")
    .order("created_at", { ascending: false });
  
  if (error) {
    console.error("Error fetching organizations:", error);
    return [];
  }
  
  // Get stats for each organization
  const orgsWithStats = await Promise.all(
    (orgs || []).map(async (org) => {
      const { count: coursesCount } = await supabase
        .from("courses")
        .select("*", { count: "exact", head: true })
        .eq("organization_id", org.id);
      
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id")
        .eq("organization_id", org.id);
      
      return {
        ...org,
        coursesCount: coursesCount || 0,
        studentsCount: profiles?.length || 0
      } as Organization;
    })
  );
  
  return orgsWithStats;
}

export async function updateOrganization(
  organizationId: string,
  updates: Record<string, unknown>
): Promise<boolean> {
  const { error } = await supabase
    .from("organizations")
    .update(updates)
    .eq("id", organizationId);
  
  if (error) {
    console.error("Error updating organization:", error);
    return false;
  }
  
  return true;
}

export async function updateBrandingSettings(
  organizationId: string,
  branding: BrandingSettings
): Promise<boolean> {
  const { error } = await supabase
    .from("organizations")
    .update({ branding: branding as unknown as Json })
    .eq("id", organizationId);
  
  if (error) {
    console.error("Error saving branding:", error);
    return false;
  }
  
  return true;
}

export async function updateStudentDashboardSettings(
  organizationId: string,
  settings: StudentDashboardSettings
): Promise<boolean> {
  const { error } = await supabase
    .from("organizations")
    .update({ student_dashboard_settings: settings as unknown as Json })
    .eq("id", organizationId);
  
  if (error) {
    console.error("Error saving student dashboard settings:", error);
    return false;
  }
  
  return true;
}

// ============= Companies API =============

export async function fetchCompanies(organizationId: string): Promise<Company[]> {
  const { data, error } = await supabase
    .from("companies")
    .select("*")
    .eq("organization_id", organizationId)
    .order("name");
  
  if (error) {
    console.error("Error fetching companies:", error);
    return [];
  }
  
  return data as Company[];
}

export async function createCompany(company: Omit<Company, "id" | "created_at" | "updated_at">): Promise<Company | null> {
  const { data, error } = await supabase
    .from("companies")
    .insert(company)
    .select()
    .single();
  
  if (error) {
    console.error("Error creating company:", error);
    return null;
  }
  
  return data as Company;
}

export async function updateCompany(companyId: string, updates: Partial<Company>): Promise<boolean> {
  const { error } = await supabase
    .from("companies")
    .update(updates)
    .eq("id", companyId);
  
  if (error) {
    console.error("Error updating company:", error);
    return false;
  }
  
  return true;
}

export async function deleteCompany(companyId: string): Promise<boolean> {
  const { error } = await supabase
    .from("companies")
    .delete()
    .eq("id", companyId);
  
  if (error) {
    console.error("Error deleting company:", error);
    return false;
  }
  
  return true;
}

// ============= Registration Links API =============

export async function fetchRegistrationLinks(organizationId: string): Promise<RegistrationLink[]> {
  const { data, error } = await supabase
    .from("registration_links")
    .select("*")
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false });
  
  if (error) {
    console.error("Error fetching registration links:", error);
    return [];
  }
  
  return data as RegistrationLink[];
}

export async function createRegistrationLink(
  organizationId: string,
  name: string | null,
  inn: string | null,
  companyId?: string | null,
  courseId?: string | null
): Promise<RegistrationLink | null> {
  const token = Math.random().toString(36).substring(2) + Date.now().toString(36);
  
  const { data, error } = await supabase
    .from("registration_links")
    .insert({
      organization_id: organizationId,
      token,
      name,
      inn,
      company_id: companyId || null,
      course_id: courseId || null
    })
    .select()
    .single();
  
  if (error) {
    console.error("Error creating registration link:", error);
    return null;
  }
  
  return data as RegistrationLink;
}

export async function deleteRegistrationLink(linkId: string): Promise<boolean> {
  const { error } = await supabase
    .from("registration_links")
    .delete()
    .eq("id", linkId);
  
  if (error) {
    console.error("Error deleting registration link:", error);
    return false;
  }
  
  return true;
}

// ============= Stats API =============

export async function fetchOrganizationStats(organizationId: string): Promise<OrganizationStats> {
  const { data: profiles } = await supabase
    .from("profiles")
    .select("id")
    .eq("organization_id", organizationId);
  
  const { data: courses } = await supabase
    .from("courses")
    .select("id")
    .eq("organization_id", organizationId);
  
  const courseIds = courses?.map(c => c.id) || [];
  
  let enrollments: any[] = [];
  if (courseIds.length > 0) {
    const { data } = await supabase
      .from("enrollments")
      .select("*")
      .in("course_id", courseIds);
    enrollments = data || [];
  }
  
  const completedCount = enrollments.filter(e => e.status === "completed").length;
  const averageProgress = enrollments.length > 0
    ? Math.round(enrollments.reduce((sum, e) => sum + (e.progress || 0), 0) / enrollments.length)
    : 0;
  
  return {
    totalStudents: profiles?.length || 0,
    totalCourses: courses?.length || 0,
    completedCount,
    averageProgress
  };
}

export async function fetchDocumentsStats(organizationId: string): Promise<{ stats: DocumentsStats; docsByUser: Map<string, string[]> }> {
  const { data: profiles } = await supabase
    .from("profiles")
    .select("user_id")
    .eq("organization_id", organizationId);
  
  const { data: identityDocs } = await supabase
    .from("student_identity_documents")
    .select("user_id, type")
    .eq("organization_id", organizationId);
  
  const docsByUser = new Map<string, string[]>();
  
  (identityDocs || []).forEach(doc => {
    const existing = docsByUser.get(doc.user_id) || [];
    existing.push(doc.type);
    docsByUser.set(doc.user_id, existing);
  });
  
  let withPassport = 0;
  let withSnils = 0;
  let withEducation = 0;
  let complete = 0;
  
  for (const profile of profiles || []) {
    const userDocs = docsByUser.get(profile.user_id) || [];
    const hasPassport = userDocs.some(t => t === "passport" || t === "birth_certificate");
    const hasSnils = userDocs.includes("snils");
    const hasEducation = userDocs.some(t => t === "education_document" || t === "diploma" || t === "attestat");
    
    if (hasPassport) withPassport++;
    if (hasSnils) withSnils++;
    if (hasEducation) withEducation++;
    if (hasPassport && hasSnils && hasEducation) complete++;
  }
  
  return {
    stats: {
      total: profiles?.length || 0,
      withPassport,
      withSnils,
      withEducation,
      complete
    },
    docsByUser
  };
}
