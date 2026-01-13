import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Student, Course, Company, CourseCategory, Stats, DocumentsStats } from "@/types/shared";

interface FrdoStatus {
  hasData: boolean;
  isComplete: boolean;
  missingFields: string[];
}

interface UseOrganizationDataLoaderProps {
  userId: string | undefined;
  onCategoriesLoaded?: (categories: CourseCategory[]) => void;
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
    const fetchData = async () => {
      if (!userId) return;
      
      try {
        // Check for admin view mode
        const adminViewData = localStorage.getItem("adminViewAsOrg");
        let orgId: string | null = null;
        
        if (adminViewData) {
          const adminView = JSON.parse(adminViewData);
          orgId = adminView.id;
          setAdminViewOrgId(adminView.id);
          setOrganizationName(adminView.name);
          setIsAdminView(true);
        } else {
          const { data: profile } = await supabase
            .from("profiles")
            .select("organization_id")
            .eq("user_id", userId)
            .single();
            
          if (!profile?.organization_id) {
            setIsLoadingCourses(false);
            return;
          }
          
          orgId = profile.organization_id;
          
          const { data: orgData } = await supabase
            .from("organizations")
            .select("name, frdo_enabled")
            .eq("id", orgId)
            .single();
            
          if (orgData) {
            setOrganizationName(orgData.name);
            setIsFrdoEnabled(orgData.frdo_enabled || false);
          }
        }
        
        setOrganizationId(orgId);

        // Fetch courses
        const { data: coursesData, error } = await supabase
          .from("courses")
          .select(`*, lessons(count)`)
          .eq("organization_id", orgId)
          .order("created_at", { ascending: false });
          
        if (error) throw error;
        
        const courseIds = (coursesData || []).map((c: any) => c.id);

        // Get enrollments
        let allEnrollments: any[] = [];
        if (courseIds.length > 0) {
          const { data: enrollmentsData } = await supabase
            .from("enrollments")
            .select("*")
            .in("course_id", courseIds);
          allEnrollments = enrollmentsData || [];
        }

        // Fetch students
        const { data: allProfilesData } = await supabase
          .from("profiles")
          .select("id, user_id, full_name, email, login, generated_password")
          .eq("organization_id", orgId);
          
        const userEnrollmentsMap: Record<string, any[]> = {};
        for (const enrollment of allEnrollments) {
          if (!userEnrollmentsMap[enrollment.user_id]) {
            userEnrollmentsMap[enrollment.user_id] = [];
          }
          userEnrollmentsMap[enrollment.user_id].push(enrollment);
        }
        
        const studentsList: Student[] = [];
        const profilesWithoutEnrollments: Student[] = [];
        
        for (const profile of allProfilesData || []) {
          const userEnrollments = userEnrollmentsMap[profile.user_id] || [];
          
          if (userEnrollments.length === 0) {
            profilesWithoutEnrollments.push({
              id: profile.id,
              user_id: profile.user_id,
              enrollment_id: null,
              name: profile.full_name || "Без имени",
              email: profile.email || "",
              login: profile.login || null,
              generated_password: profile.generated_password || null,
              course: null,
              course_id: null,
              progress: 0,
              lastActivity: null,
              status: null
            });
          } else {
            for (const enrollment of userEnrollments) {
              const course = coursesData?.find((c: any) => c.id === enrollment.course_id);
              studentsList.push({
                id: profile.id,
                user_id: profile.user_id,
                enrollment_id: enrollment.id,
                name: profile.full_name || "Без имени",
                email: profile.email || "",
                login: profile.login || null,
                generated_password: profile.generated_password || null,
                course: course?.title || "—",
                course_id: enrollment.course_id,
                progress: enrollment.progress || 0,
                lastActivity: enrollment.started_at,
                status: enrollment.status
              });
            }
          }
        }
        
        setStudents([...studentsList, ...profilesWithoutEnrollments]);
        setAllProfiles(profilesWithoutEnrollments);
        setIsLoadingStudents(false);

        // Calculate stats
        const totalStudents = (allProfilesData || []).length;
        const totalCourses = coursesData?.length || 0;
        const completedCount = allEnrollments.filter(e => e.status === 'completed').length;
        const averageProgress = allEnrollments.length > 0 
          ? Math.round(allEnrollments.reduce((sum, e) => sum + (e.progress || 0), 0) / allEnrollments.length) 
          : 0;
          
        setStats({
          totalStudents,
          totalCourses,
          completedCount,
          averageProgress
        });

        // Fetch documents stats
        const { data: identityDocs } = await supabase
          .from("student_identity_documents")
          .select("user_id, type")
          .eq("organization_id", orgId);

        if (identityDocs && allProfilesData) {
          const docsByUser = new Map<string, string[]>();
          identityDocs.forEach(doc => {
            const existing = docsByUser.get(doc.user_id) || [];
            existing.push(doc.type);
            docsByUser.set(doc.user_id, existing);
          });

          let withPassport = 0;
          let withSnils = 0;
          let withEducation = 0;
          let complete = 0;

          for (const profile of allProfilesData) {
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
          setDocumentsStats({
            total: allProfilesData.length,
            withPassport,
            withSnils,
            withEducation,
            complete
          });
        }

        // Fetch FRDO data status for all students
        const userIds = (allProfilesData || []).map(p => p.user_id);
        if (userIds.length > 0) {
          const { data: frdoData } = await supabase
            .from("student_frdo_data")
            .select("user_id, last_name, first_name, middle_name, birth_date, gender, snils, education_level")
            .eq("organization_id", orgId)
            .in("user_id", userIds);

          const frdoStatusMap = new Map<string, FrdoStatus>();
          
          const requiredFields = [
            { key: "last_name", label: "Фамилия" },
            { key: "first_name", label: "Имя" },
            { key: "birth_date", label: "Дата рождения" },
            { key: "gender", label: "Пол" },
            { key: "snils", label: "СНИЛС" },
          ];

          for (const profile of allProfilesData || []) {
            const data = frdoData?.find(f => f.user_id === profile.user_id);
            const missing: string[] = [];
            
            if (data) {
              for (const field of requiredFields) {
                if (!data[field.key as keyof typeof data]) {
                  missing.push(field.label);
                }
              }
              frdoStatusMap.set(profile.user_id, {
                hasData: true,
                isComplete: missing.length === 0,
                missingFields: missing,
              });
            } else {
              frdoStatusMap.set(profile.user_id, {
                hasData: false,
                isComplete: false,
                missingFields: requiredFields.map(f => f.label),
              });
            }
          }
          
          setStudentFrdoStatus(frdoStatusMap);
        }

        // Fetch categories
        const { data: categoriesData } = await supabase
          .from("course_categories")
          .select("*")
          .eq("organization_id", orgId)
          .order("name");
          
        if (onCategoriesLoaded) {
          onCategoriesLoaded(categoriesData || []);
        }

        // Fetch companies
        const { data: companiesData } = await supabase
          .from("companies")
          .select("id, name, inn")
          .eq("organization_id", orgId)
          .order("name");
          
        setCompanies(companiesData || []);

        // Process courses with stats
        const coursesWithStats = (coursesData || []).map((course: any) => {
          const courseEnrollments = allEnrollments.filter(e => e.course_id === course.id);
          return {
            id: course.id,
            title: course.title,
            description: course.description,
            is_published: course.is_published,
            created_at: course.created_at,
            lessonsCount: course.lessons?.[0]?.count || 0,
            studentsCount: courseEnrollments.length,
            duration: course.duration || "—",
            category_id: course.category_id
          };
        });
        
        setCourses(coursesWithStats);
      } catch (error) {
        console.error("Error fetching data:", error);
        toast.error("Ошибка загрузки данных");
      } finally {
        setIsLoadingCourses(false);
      }
    };
    
    fetchData();
  }, [userId, refreshKey, onCategoriesLoaded]);

  return {
    // Organization info
    organizationId,
    organizationName,
    isFrdoEnabled,
    isAdminView,
    adminViewOrgId,
    
    // Data
    courses,
    setCourses,
    students,
    setStudents,
    allProfiles,
    setAllProfiles,
    companies,
    setCompanies,
    
    // Loading states
    isLoadingCourses,
    isLoadingStudents,
    
    // Stats
    stats,
    setStats,
    documentsStats,
    setDocumentsStats,
    
    // Document tracking
    studentDocsByUser,
    studentFrdoStatus,
    
    // Refresh
    refreshKey,
    refreshData,
  };
}
