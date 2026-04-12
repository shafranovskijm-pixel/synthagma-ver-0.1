import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Student, Course, Company, CourseCategory, Stats, DocumentsStats } from "@/types/shared";
import { fetchAllRows } from "@/utils/retryFetch";

const uniq = <T,>(arr: T[]) => Array.from(new Set(arr));

interface FrdoStatus {
  hasData: boolean;
  isComplete: boolean;
  missingFields: string[];
}

interface UseOrganizationDataLoaderProps {
  userId: string | undefined;
  onCategoriesLoaded?: (categories: CourseCategory[]) => void;
}

/** Helper: run a Supabase query with up to 3 retries */
async function retryQuery<T>(fn: () => PromiseLike<{ data: T | null; error: any }>, label = "query"): Promise<T | null> {
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt > 0) {
      const delay = attempt * 1500;
      console.log(`[retryQuery] ${label} attempt ${attempt + 1}/3, waiting ${delay}ms`);
      await new Promise(r => setTimeout(r, delay));
    }
    const { data, error } = await fn();
    if (!error) return data;
    console.warn(`[retryQuery] ${label} attempt ${attempt + 1} failed:`, error);
    if (attempt === 2) throw error;
  }
  return null;
}

export function useOrganizationDataLoader({ userId, onCategoriesLoaded }: UseOrganizationDataLoaderProps) {
  const [organizationId, setOrganizationId] = useState<string | null>(null);
  const [organizationName, setOrganizationName] = useState("Организация");
  const [isFrdoEnabled, setIsFrdoEnabled] = useState(false);
  
  const [isAdminView, setIsAdminView] = useState(false);
  const [adminViewOrgId, setAdminViewOrgId] = useState<string | null>(null);
  
  const [courses, setCourses] = useState<Course[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [allProfiles, setAllProfiles] = useState<Student[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  
  const [isLoadingCourses, setIsLoadingCourses] = useState(true);
  const [isLoadingStudents, setIsLoadingStudents] = useState(true);
  
  const [stats, setStats] = useState<Stats>({
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
  const [studentFrdoStatus, setStudentFrdoStatus] = useState<Map<string, FrdoStatus>>(new Map());
  
  const [refreshKey, setRefreshKey] = useState(0);
  
  const refreshData = useCallback(() => {
    setRefreshKey(prev => prev + 1);
  }, []);

  // Main data fetch
  useEffect(() => {
    let cancelled = false;

    const fetchData = async () => {
      if (!userId) return;
      
      try {
        // Check for admin view mode
        const adminViewData = localStorage.getItem("adminViewAsOrg");
        let orgId: string | null = null;
        
        if (adminViewData) {
          const adminView = JSON.parse(adminViewData);
          orgId = adminView.id;
          if (!cancelled) {
            setAdminViewOrgId(adminView.id);
            setOrganizationName(adminView.name);
            setIsAdminView(true);
          }
        } else {
          const { data: profile } = await supabase
            .from("profiles")
            .select("organization_id")
            .eq("user_id", userId)
            .single();
            
          if (!profile?.organization_id) {
            if (!cancelled) setIsLoadingCourses(false);
            return;
          }
          
          orgId = profile.organization_id;
          
          const { data: orgData } = await supabase
            .from("organizations")
            .select("name, frdo_enabled")
            .eq("id", orgId)
            .single();
            
          if (orgData && !cancelled) {
            setOrganizationName(orgData.name);
            setIsFrdoEnabled(orgData.frdo_enabled || false);
          }
        }
        
        if (cancelled) return;
        setOrganizationId(orgId);

        // ===== GROUP 1: Parallel independent queries with retry =====
        const [coursesData, allProfilesData, decryptedPasswords, categoriesData, companiesData] = await Promise.all([
          retryQuery(
            () => supabase
              .from("courses")
              .select(`*, lessons(count)`)
              .eq("organization_id", orgId!)
              .order("created_at", { ascending: false }),
            "courses"
          ),
          fetchAllRows(({ from, to }) =>
            supabase
              .from("profiles")
              .select("id, user_id, full_name, email, login")
              .eq("organization_id", orgId!)
              .range(from, to)
          ),
          retryQuery(
            () => supabase.rpc("get_decrypted_student_passwords", { p_organization_id: orgId }),
            "passwords"
          ).catch(() => [] as any[]),
          retryQuery(
            () => supabase
              .from("course_categories")
              .select("*")
              .eq("organization_id", orgId!)
              .order("name"),
            "categories"
          ),
          retryQuery(
            () => supabase
              .from("companies")
              .select("id, name, inn")
              .eq("organization_id", orgId!)
              .order("name"),
            "companies"
          ),
        ]);

        if (cancelled) return;

        // Set categories & companies early
        if (onCategoriesLoaded) onCategoriesLoaded((categoriesData || []) as CourseCategory[]);
        setCompanies((companiesData || []) as Company[]);

        // Password map
        const passwordMap = new Map<string, string>();
        ((decryptedPasswords || []) as any[]).forEach((row: any) => {
          if (row.decrypted_password) passwordMap.set(row.user_id, row.decrypted_password);
        });

        // ===== Enrollments =====
        const courseIds = (coursesData || []).map((c: any) => c.id);
        let allEnrollments: any[] = [];
        if (courseIds.length > 0) {
          const enrollmentsData = await retryQuery(
            () => supabase
              .from("enrollments")
              .select("*")
              .in("course_id", courseIds),
            "enrollments"
          );
          allEnrollments = (enrollmentsData || []) as any[];
        }

        if (cancelled) return;

        // ===== GROUP 2: Parallel queries needing profileUserIds with retry =====
        const profileUserIds = uniq((allProfilesData || []).map((p: any) => p.user_id));

        const [rolesData, identityDocsData, frdoDataResult] = await Promise.all([
          profileUserIds.length > 0
            ? fetchAllRows(({ from, to }) =>
                supabase
                  .from("user_roles")
                  .select("user_id, role")
                  .in("user_id", profileUserIds)
                  .in("role", ["organization", "admin"])
                  .range(from, to)
              )
            : Promise.resolve([] as any[]),
          retryQuery(
            () => supabase
              .from("student_identity_documents")
              .select("user_id, type")
              .eq("organization_id", orgId!),
            "identity-docs"
          ),
          profileUserIds.length > 0
            ? retryQuery(
                () => supabase
                  .from("student_frdo_data")
                  .select("user_id, last_name, first_name, middle_name, birth_date, gender, snils, education_level")
                  .eq("organization_id", orgId!)
                  .in("user_id", profileUserIds),
                "frdo-data"
              )
            : Promise.resolve([] as any[]),
        ]);

        if (cancelled) return;

        const orgAdminUserIds = new Set(((rolesData || []) as any[]).map((r: any) => r.user_id));
        const studentProfilesData = (allProfilesData || []).filter(
          (p: any) => !orgAdminUserIds.has(p.user_id)
        );
          
        const userEnrollmentsMap: Record<string, any[]> = {};
        for (const enrollment of allEnrollments) {
          if (!userEnrollmentsMap[enrollment.user_id]) {
            userEnrollmentsMap[enrollment.user_id] = [];
          }
          userEnrollmentsMap[enrollment.user_id].push(enrollment);
        }
        
        const studentsList: Student[] = [];
        const profilesWithoutEnrollments: Student[] = [];
        
        for (const profile of studentProfilesData) {
          const userEnrollments = userEnrollmentsMap[profile.user_id] || [];
          
          if (userEnrollments.length === 0) {
            profilesWithoutEnrollments.push({
              id: profile.id,
              user_id: profile.user_id,
              enrollment_id: null,
              name: profile.full_name || "Без имени",
              email: profile.email || "",
              login: profile.login || null,
              generated_password: passwordMap.get(profile.user_id) || null,
              course: null,
              course_id: null,
              progress: 0,
              lastActivity: null,
              status: null
            });
          } else {
            for (const enrollment of userEnrollments) {
              const course = (coursesData || []).find((c: any) => c.id === enrollment.course_id);
              studentsList.push({
                id: profile.id,
                user_id: profile.user_id,
                enrollment_id: enrollment.id,
                name: profile.full_name || "Без имени",
                email: profile.email || "",
                login: profile.login || null,
                generated_password: passwordMap.get(profile.user_id) || null,
                course: course?.title || "—",
                course_id: enrollment.course_id,
                progress: enrollment.progress || 0,
                lastActivity: enrollment.started_at,
                status: enrollment.status
              });
            }
          }
        }
        
        if (cancelled) return;

        setStudents([...studentsList, ...profilesWithoutEnrollments]);
        setAllProfiles(profilesWithoutEnrollments);
        setIsLoadingStudents(false);

        // Calculate stats
        const studentUserIdsSet = new Set(studentProfilesData.map((p: any) => p.user_id));
        const totalStudents = studentProfilesData.length;
        const totalCourses = (coursesData || []).length;
        const studentEnrollments = allEnrollments.filter(e => studentUserIdsSet.has(e.user_id));
        const completedCount = studentEnrollments.filter(e => e.status === 'completed').length;
        const averageProgress = studentEnrollments.length > 0 
          ? Math.round(studentEnrollments.reduce((sum, e) => sum + (e.progress || 0), 0) / studentEnrollments.length) 
          : 0;
          
        setStats({ totalStudents, totalCourses, completedCount, averageProgress });

        // Documents stats
        const identityDocs = (identityDocsData || []) as any[];
        if (identityDocs && studentProfilesData) {
          const docsByUser = new Map<string, string[]>();
          identityDocs.forEach(doc => {
            const existing = docsByUser.get(doc.user_id) || [];
            existing.push(doc.type);
            docsByUser.set(doc.user_id, existing);
          });

          let withPassport = 0, withSnils = 0, withEducation = 0, complete = 0;

          for (const profile of studentProfilesData) {
            const userDocs = docsByUser.get(profile.user_id) || [];
            const hasPassport = userDocs.some(t => t === "passport" || t === "birth_certificate");
            const hasSnils = userDocs.includes("snils");
            const hasEducation = userDocs.some(t => t === "education_document" || t === "diploma" || t === "attestat");

            if (hasPassport) withPassport++;
            if (hasSnils) withSnils++;
            if (hasEducation) withEducation++;
            if (hasPassport && hasSnils && hasEducation) complete++;
          }

          setStudentDocsByUser(docsByUser);
          setDocumentsStats({ total: studentProfilesData.length, withPassport, withSnils, withEducation, complete });
        }

        // FRDO status
        const frdoData = ((frdoDataResult || []) as any[]);
        if (studentProfilesData.length > 0) {
          const frdoStatusMap = new Map<string, FrdoStatus>();
          const requiredFields = [
            { key: "last_name", label: "Фамилия" },
            { key: "first_name", label: "Имя" },
            { key: "birth_date", label: "Дата рождения" },
            { key: "gender", label: "Пол" },
            { key: "snils", label: "СНИЛС" },
          ];

          for (const profile of studentProfilesData) {
            const data = frdoData.find(f => f.user_id === profile.user_id);
            const missing: string[] = [];
            
            if (data) {
              for (const field of requiredFields) {
                if (!data[field.key as keyof typeof data]) {
                  missing.push(field.label);
                }
              }
              frdoStatusMap.set(profile.user_id, { hasData: true, isComplete: missing.length === 0, missingFields: missing });
            } else {
              frdoStatusMap.set(profile.user_id, { hasData: false, isComplete: false, missingFields: requiredFields.map(f => f.label) });
            }
          }
          
          setStudentFrdoStatus(frdoStatusMap);
        }

        // Process courses with stats
        const coursesWithStats = ((coursesData || []) as any[]).map((course: any) => {
          const courseEnrollments = studentEnrollments.filter(e => e.course_id === course.id);
          const uniqueStudentIds = new Set(courseEnrollments.map(e => e.user_id));
          return {
            id: course.id,
            title: course.title,
            description: course.description,
            is_published: course.is_published,
            created_at: course.created_at,
            lessonsCount: course.lessons?.[0]?.count || 0,
            studentsCount: uniqueStudentIds.size,
            duration: course.duration || "—",
            category_id: course.category_id,
            cover_image_url: course.cover_image_url || null,
            skip_video_identification: course.skip_video_identification ?? false,
            sequential_lessons: course.sequential_lessons ?? false,
            allow_video_seek: course.allow_video_seek ?? true,
          };
        });
        
        setCourses(coursesWithStats);
      } catch (error) {
        if (cancelled) return;
        console.error("Error fetching data:", error);
        toast.error("Ошибка загрузки данных");
      } finally {
        if (!cancelled) setIsLoadingCourses(false);
      }
    };
    
    fetchData();

    return () => { cancelled = true; };
  }, [userId, refreshKey, onCategoriesLoaded]);

  return {
    organizationId,
    organizationName,
    isFrdoEnabled,
    isAdminView,
    adminViewOrgId,
    courses,
    setCourses,
    students,
    setStudents,
    allProfiles,
    setAllProfiles,
    companies,
    setCompanies,
    isLoadingCourses,
    isLoadingStudents,
    stats,
    setStats,
    documentsStats,
    setDocumentsStats,
    studentDocsByUser,
    studentFrdoStatus,
    refreshKey,
    refreshData,
  };
}
