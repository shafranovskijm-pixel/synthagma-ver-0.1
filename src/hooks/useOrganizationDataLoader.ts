import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Student, Course, Company, CourseCategory, Stats, DocumentsStats } from "@/types/shared";
import { isTransientNetworkError, classifyDataError } from "@/utils/isTransientNetworkError";
import { resolveAdminViewOrg } from "@/utils/adminViewOrg";

interface FrdoStatus {
  hasData: boolean;
  isComplete: boolean;
  missingFields: string[];
}

interface UseOrganizationDataLoaderProps {
  userId: string | undefined;
  onCategoriesLoaded?: (categories: CourseCategory[]) => void;
}

const RETRY_TOAST_ID = "org-data-retry";

/**
 * Phase 4B.1.b — light loader.
 *
 * At normal dashboard open we NO LONGER load:
 *   - all profiles / enrollments / user_roles / lessons;
 *   - decrypted passwords;
 *   - student_identity_documents / student_frdo_data.
 *
 * Only these light requests happen:
 *   - resolve current organization (admin-view or profile/org_staff fallback);
 *   - organization row (name, frdo_enabled);
 *   - courses (without student/lesson counts — those come from
 *     get_organization_course_overview via useOrganizationSummary);
 *   - course_categories;
 *   - companies.
 *
 * Legacy fields (`students`, `allProfiles`, `stats`, `documentsStats`,
 * `studentDocsByUser`, `studentFrdoStatus`, `isLoadingStudents`) remain
 * exposed as EMPTY compatibility state so legacy dialogs keep compiling.
 * Their final removal is scheduled for phase 4B.1.c.
 */

async function retryQuery<T>(fn: () => PromiseLike<{ data: T | null; error: unknown }>, label = "query"): Promise<T | null> {
  let lastError: unknown = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt > 0) {
      const delay = attempt * 2000; // 2s, 4s
      toast.loading(`Медленное соединение — повторяем загрузку (${attempt + 1}/3)...`, {
        id: RETRY_TOAST_ID,
        duration: delay + 1500,
      });
      await new Promise(r => setTimeout(r, delay));
    }
    const { data, error } = await fn();
    if (!error) {
      if (attempt > 0) toast.dismiss(RETRY_TOAST_ID);
      return data;
    }
    lastError = error;
    console.warn(`[retryQuery:${label}] attempt ${attempt + 1} failed:`, error);
    if (!isTransientNetworkError(error)) {
      toast.dismiss(RETRY_TOAST_ID);
      throw error;
    }
    if (attempt === 2) {
      toast.dismiss(RETRY_TOAST_ID);
      throw error;
    }
  }
  throw lastError ?? new Error(`retryQuery:${label} exhausted`);
}

export function useOrganizationDataLoader({ userId, onCategoriesLoaded }: UseOrganizationDataLoaderProps) {
  const [organizationId, setOrganizationId] = useState<string | null>(null);
  const [organizationName, setOrganizationName] = useState("Организация");
  const [isFrdoEnabled, setIsFrdoEnabled] = useState(false);

  const [isAdminView, setIsAdminView] = useState(false);
  const [adminViewOrgId, setAdminViewOrgId] = useState<string | null>(null);

  const [courses, setCourses] = useState<Course[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);

  const [isLoadingCourses, setIsLoadingCourses] = useState(true);

  // ==== Compatibility state (empty, no network load) ====
  // Will be removed entirely in 4B.1.c together with legacy consumers.
  const [students, setStudents] = useState<Student[]>([]);
  const [allProfiles, setAllProfiles] = useState<Student[]>([]);
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
  const [studentDocsByUser] = useState<Map<string, string[]>>(new Map());
  const [studentFrdoStatus] = useState<Map<string, FrdoStatus>>(new Map());
  // isLoadingStudents is intentionally always false: there is no global
  // student load anymore. Server-side StudentsTab pagination reports its
  // own loading state independently.
  const isLoadingStudents = false;

  const [refreshKey, setRefreshKey] = useState(0);

  const refreshData = useCallback(() => {
    setRefreshKey(prev => prev + 1);
  }, []);

  // Clear compatibility state whenever the resolved organization changes,
  // so leftover data from another org can never leak across a switch.
  useEffect(() => {
    setStudents([]);
    setAllProfiles([]);
    setStats({ totalStudents: 0, totalCourses: 0, completedCount: 0, averageProgress: 0 });
    setDocumentsStats({ total: 0, withPassport: 0, withSnils: 0, withEducation: 0, complete: 0 });
  }, [organizationId]);

  useEffect(() => {
    let cancelled = false;

    const fetchData = async () => {
      if (!userId) return;

      try {
        const resolution = await resolveAdminViewOrg(userId);
        let orgId: string | null = null;

        if (resolution.status === "admin") {
          orgId = resolution.view.id;
          if (!cancelled) {
            setAdminViewOrgId(resolution.view.id);
            setOrganizationName(resolution.view.name);
            setIsAdminView(true);
          }
        } else {
          const { data: profile } = await supabase
            .from("profiles")
            .select("organization_id")
            .eq("user_id", userId)
            .maybeSingle();

          orgId = profile?.organization_id ?? null;

          if (!orgId) {
            const { data: staffRows } = await supabase
              .from("org_staff")
              .select("organization_id, role, expires_at")
              .eq("user_id", userId)
              .or("expires_at.is.null,expires_at.gt." + new Date().toISOString());

            const active = (staffRows ?? []).filter(
              (r: any) => !r.expires_at || new Date(r.expires_at) > new Date()
            );
            if (active.length === 1) {
              orgId = active[0].organization_id;
            } else if (active.length > 1) {
              console.warn(
                "[useOrganizationDataLoader] user has multiple active org_staff memberships; org selector required",
              );
            }
          }

          if (!orgId) {
            if (!cancelled) setIsLoadingCourses(false);
            return;
          }

          const { data: orgData } = await supabase
            .from("organizations")
            .select("name, frdo_enabled")
            .eq("id", orgId)
            .maybeSingle();

          if (orgData && !cancelled) {
            setOrganizationName(orgData.name);
            setIsFrdoEnabled(orgData.frdo_enabled || false);
          }
        }

        if (cancelled) return;
        setOrganizationId(orgId);

        // Re-fetch organization row in admin-view too (name + frdo_enabled).
        const { data: selectedOrgData } = await supabase
          .from("organizations")
          .select("name, frdo_enabled")
          .eq("id", orgId)
          .maybeSingle();

        if (selectedOrgData && !cancelled) {
          setOrganizationName(selectedOrgData.name);
          setIsFrdoEnabled(selectedOrgData.frdo_enabled || false);
        }

        // Light-only queries. Student/lesson counts come from the aggregate
        // RPC in useOrganizationSummary, not from here.
        const [coursesData, categoriesData, companiesData] = await Promise.all([
          retryQuery(
            () => supabase
              .from("courses")
              .select("id, title, description, is_published, created_at, category_id, duration, cover_image_url, skip_video_identification, sequential_lessons, allow_video_seek, price")
              .eq("organization_id", orgId!)
              .order("created_at", { ascending: false }),
            "courses"
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

        if (onCategoriesLoaded) onCategoriesLoaded((categoriesData || []) as CourseCategory[]);
        setCompanies((companiesData || []) as Company[]);

        const rawCourses = (coursesData || []) as Array<{ id: string; title: string; description: string | null; is_published: boolean; created_at: string; category_id: string | null; duration: string | null; cover_image_url: string | null; skip_video_identification: boolean | null; sequential_lessons: boolean; allow_video_seek: boolean; price: number }>;
        const coursesWithStats = rawCourses.map((course) => ({
          id: course.id,
          title: course.title,
          description: course.description,
          is_published: course.is_published,
          created_at: course.created_at,
          lessonsCount: 0, // filled by useOrganizationSummary.courseOverview
          studentsCount: 0, // filled by useOrganizationSummary.courseOverview
          duration: course.duration || "—",
          category_id: course.category_id,
          cover_image_url: course.cover_image_url || null,
          skip_video_identification: course.skip_video_identification ?? false,
          sequential_lessons: course.sequential_lessons ?? false,
          allow_video_seek: course.allow_video_seek ?? true,
          price: course.price ?? 0,
        }));

        setCourses(coursesWithStats);
        setIsLoadingCourses(false);
      } catch (error) {
        if (cancelled) return;
        console.error("Error fetching data:", error);
        const kind = classifyDataError(error);
        const message =
          kind === "network"
            ? "Не удалось подключиться к серверу. Проверьте интернет / VPN / антивирус."
            : kind === "permission"
            ? "Недостаточно прав. Обратитесь к владельцу организации."
            : kind === "unauthorized"
            ? "Сессия истекла. Войдите заново."
            : "Ошибка загрузки данных";
        toast.error(message, {
          id: "org-data-error",
          duration: 15000,
          action: {
            label: "Повторить",
            onClick: () => setRefreshKey(prev => prev + 1),
          },
        });
      } finally {
        if (!cancelled) {
          setIsLoadingCourses(false);
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
