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

/** Helper: run a Supabase query with up to 3 retries, increased delays */
async function retryQuery<T>(fn: () => PromiseLike<{ data: T | null; error: unknown }>, label = "query"): Promise<T | null> {
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt > 0) {
      const delay = attempt * 3000; // 3s, 6s
      await new Promise(r => setTimeout(r, delay));
    }
    const { data, error } = await fn();
    if (!error) return data;
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

        // ===== PHASE 1: Light queries only (courses, profiles, categories, companies) =====
        // NO passwords, NO heavy RPCs — render fast
        const [coursesData, allProfilesData, categoriesData, companiesData] = await Promise.all([
          retryQuery(
            () => supabase
              .from("courses")
              .select("id, title, description, is_published, created_at, category_id, duration, cover_image_url, skip_video_identification, sequential_lessons, allow_video_seek, price")
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

        // Set categories & companies & courses early for fast render
        if (onCategoriesLoaded) onCategoriesLoaded((categoriesData || []) as CourseCategory[]);
        setCompanies((companiesData || []) as Company[]);

        // Process courses immediately (without student counts yet)
        const coursesWithStats = ((coursesData || []) as Array<Record<string, unknown>>).map((course) => ({
          id: course.id,
          title: course.title,
          description: course.description,
          is_published: course.is_published,
          created_at: course.created_at,
          lessonsCount: 0, // will be updated asynchronously
          studentsCount: 0, // will be updated in phase 2
          duration: course.duration || "—",
          category_id: course.category_id,
          cover_image_url: course.cover_image_url || null,
          skip_video_identification: course.skip_video_identification ?? false,
          sequential_lessons: course.sequential_lessons ?? false,
          allow_video_seek: course.allow_video_seek ?? true,
          price: course.price ?? 0,
        }));
        
        setCourses(coursesWithStats);
        setIsLoadingCourses(false); // Courses visible NOW

        // Lazy-load lesson counts (non-blocking)
        const allCourseIds = coursesWithStats.map((c) => c.id);
        if (allCourseIds.length > 0) {
          (async () => {
            try {
              const { data: lessonsData } = await supabase
                .from("lessons")
                .select("course_id")
                .in("course_id", allCourseIds);
              if (cancelled || !lessonsData || lessonsData.length === 0) return;
              const countMap = new Map<string, number>();
              for (const row of lessonsData) {
                countMap.set(row.course_id, (countMap.get(row.course_id) || 0) + 1);
              }
              setCourses(prev => prev.map(c => ({
                ...c,
                lessonsCount: countMap.get(c.id) ?? c.lessonsCount ?? 0
              })));
            } catch {
              // non-fatal: lesson counts load silently
            }
          })();
        }

        // ===== PHASE 2: Enrollments (needed for students tab) =====
        const courseIds = (coursesData || []).map((c: Record<string, unknown>) => c.id as string);
        let allEnrollments: Array<{ id: string; user_id: string; course_id: string; progress: number; status: string; started_at: string }> = [];
        if (courseIds.length > 0) {
          const enrollmentsData = await retryQuery(
            () => supabase
              .from("enrollments")
              .select("id, user_id, course_id, progress, status, started_at")
              .in("course_id", courseIds),
            "enrollments"
          );
          allEnrollments = (enrollmentsData || []) as typeof allEnrollments;
        }

        if (cancelled) return;

        // Filter org/admin users
        const profileUserIds = uniq((allProfilesData || []).map((p: { user_id: string }) => p.user_id));
        let orgAdminUserIds = new Set<string>();
        if (profileUserIds.length > 0) {
          const rolesData = await fetchAllRows(({ from, to }) =>
            supabase
              .from("user_roles")
              .select("user_id, role")
              .in("user_id", profileUserIds)
              .in("role", ["organization", "admin"])
              .range(from, to)
          );
          orgAdminUserIds = new Set(((rolesData || []) as Array<{ user_id: string; role: string }>).map((r) => r.user_id));
        }

        if (cancelled) return;

        const studentProfilesData = (allProfilesData || []).filter(
          (p: { user_id: string }) => !orgAdminUserIds.has(p.user_id)
        );
          
        const userEnrollmentsMap: Record<string, typeof allEnrollments> = {};
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
              generated_password: null, // will be filled in phase 3
              course: null,
              course_id: null,
              progress: 0,
              lastActivity: null,
              status: null
            });
          } else {
            for (const enrollment of userEnrollments) {
              const course = (coursesData || []).find((c: Record<string, unknown>) => c.id === enrollment.course_id);
              studentsList.push({
                id: profile.id,
                user_id: profile.user_id,
                enrollment_id: enrollment.id,
                name: profile.full_name || "Без имени",
                email: profile.email || "",
                login: profile.login || null,
                generated_password: null, // will be filled in phase 3
                course: (course?.title as string) || "—",
                course_id: enrollment.course_id,
                progress: enrollment.progress || 0,
                lastActivity: enrollment.started_at,
                status: enrollment.status
              });
            }
          }
        }
        
        if (cancelled) return;

        const allStudents = [...studentsList, ...profilesWithoutEnrollments];
        setStudents(allStudents);
        setAllProfiles(profilesWithoutEnrollments);
        setIsLoadingStudents(false);

        // Update course student counts now that we have enrollments
        const studentUserIdsSet = new Set(studentProfilesData.map((p: { user_id: string }) => p.user_id));
        const studentEnrollments = allEnrollments.filter(e => studentUserIdsSet.has(e.user_id));

        setCourses(prev => prev.map(course => {
          const courseEnrollments = studentEnrollments.filter(e => e.course_id === course.id);
          const uniqueStudentIds = new Set(courseEnrollments.map(e => e.user_id));
          return { ...course, studentsCount: uniqueStudentIds.size };
        }));

        // Calculate stats
        const totalStudents = studentProfilesData.length;
        const totalCourses = (coursesData || []).length;
        const completedCount = studentEnrollments.filter(e => e.status === 'completed').length;
        const averageProgress = studentEnrollments.length > 0 
          ? Math.round(studentEnrollments.reduce((sum, e) => sum + (e.progress || 0), 0) / studentEnrollments.length) 
          : 0;
          
        setStats({ totalStudents, totalCourses, completedCount, averageProgress });

        // ===== PHASE 3: Heavy/deferred data (passwords, docs, frdo) — non-blocking =====
        // These run after UI is already rendered
        
        // Passwords — deferred, catch errors silently
        retryQuery(
          () => supabase.rpc("get_decrypted_student_passwords", { p_organization_id: orgId }),
          "passwords"
        ).then(decryptedPasswords => {
          if (cancelled) return;
          const passwordMap = new Map<string, string>();
          ((decryptedPasswords || []) as Array<{ user_id: string; decrypted_password: string | null }>).forEach((row) => {
            if (row.decrypted_password) passwordMap.set(row.user_id, row.decrypted_password);
          });
          if (passwordMap.size > 0) {
            setStudents(prev => prev.map(s => ({
              ...s,
              generated_password: passwordMap.get(s.user_id) || s.generated_password
            })));
            setAllProfiles(prev => prev.map(s => ({
              ...s,
              generated_password: passwordMap.get(s.user_id) || s.generated_password
            })));
          }
        }).catch(() => {
          // non-fatal: passwords load silently
        });

        // Identity docs — deferred
        retryQuery(
          () => supabase
            .from("student_identity_documents")
            .select("user_id, type")
            .eq("organization_id", orgId!),
          "identity-docs"
        ).then(identityDocsData => {
          if (cancelled) return;
          const identityDocs = (identityDocsData || []) as Array<{ user_id: string; type: string }>;
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
        }).catch(() => {
          // non-fatal: identity docs load silently
        });

        // FRDO data — deferred
        if (profileUserIds.length > 0) {
          retryQuery(
            () => supabase
              .from("student_frdo_data")
              .select("user_id, last_name, first_name, middle_name, birth_date, gender, snils, education_level")
              .eq("organization_id", orgId!)
              .in("user_id", profileUserIds),
            "frdo-data"
          ).then(frdoDataResult => {
            if (cancelled) return;
            const frdoData = ((frdoDataResult || []) as Array<Record<string, unknown>>);
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
          }).catch(() => {
            // non-fatal: FRDO data loads silently
          });
        }

      } catch (error) {
        if (cancelled) return;
        console.error("Error fetching data:", error);
        toast.error("Ошибка загрузки данных");
      } finally {
        if (!cancelled) {
          setIsLoadingCourses(false);
          setIsLoadingStudents(false);
        }
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
