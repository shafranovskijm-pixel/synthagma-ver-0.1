import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Course, Company, CourseCategory } from "@/types/shared";
import { isTransientNetworkError, classifyDataError } from "@/utils/isTransientNetworkError";
import { resolveAdminViewOrg } from "@/utils/adminViewOrg";
import { resolveStaffOrganization, StaffOrganizationResolutionError } from "@/utils/resolveStaffOrganization";

interface UseOrganizationDataLoaderProps {
  userId: string | undefined;
  onCategoriesLoaded?: (categories: CourseCategory[]) => void;
}

const RETRY_TOAST_ID = "org-data-retry";

/**
 * Phase 4B.1.c.1 — light loader.
 *
 * Only lightweight per-organization data is loaded here:
 *   - resolve current organization (admin-view or profile/org_staff fallback);
 *   - organization row (name, frdo_enabled);
 *   - courses (without student/lesson counts — those come from
 *     get_organization_course_overview via useOrganizationSummary);
 *   - course_categories;
 *   - companies.
 *
 * All previously exposed compatibility state
 * (students / allProfiles / stats / documentsStats / studentDocsByUser /
 * studentFrdoStatus / isLoadingStudents) was removed once every legacy
 * consumer was deleted in 4B.1.c.1. Server-side StudentsTab pagination and
 * useOrganizationSummary own that data now.
 */

async function retryQuery<T>(fn: () => PromiseLike<{ data: T | null; error: unknown }>, label = "query"): Promise<T | null> {
  let lastError: unknown = null;
  // Phase 5D.1 — at most 2 retries (3 attempts) and only for transient
  // network errors. 401/403/42501 fail immediately.
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

function describeError(error: unknown): string {
  if (error instanceof StaffOrganizationResolutionError) return error.message;
  const kind = classifyDataError(error);
  if (kind === "network") return "Не удалось подключиться к серверу. Проверьте интернет / VPN / антивирус.";
  if (kind === "permission") return "Недостаточно прав. Обратитесь к владельцу организации.";
  if (kind === "unauthorized") return "Сессия истекла. Войдите заново.";
  return "Ошибка загрузки данных";
}

export function useOrganizationDataLoader({ userId, onCategoriesLoaded }: UseOrganizationDataLoaderProps) {
  const [organizationId, setOrganizationId] = useState<string | null>(null);
  const [organizationName, setOrganizationName] = useState("Организация");
  const [isFrdoEnabled, setIsFrdoEnabled] = useState(false);

  const [isAdminView, setIsAdminView] = useState(false);
  const [adminViewOrgId, setAdminViewOrgId] = useState<string | null>(null);
  /** True when resolveAdminViewOrg could not confirm the admin role (transient). */
  const [adminResolutionUnknown, setAdminResolutionUnknown] = useState(false);

  const [courses, setCourses] = useState<Course[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);

  const [isLoadingCourses, setIsLoadingCourses] = useState(true);
  const [coursesError, setCoursesError] = useState<string | null>(null);
  const [categoriesError, setCategoriesError] = useState<string | null>(null);
  const [companiesError, setCompaniesError] = useState<string | null>(null);

  const [refreshKey, setRefreshKey] = useState(0);

  const refreshData = useCallback(() => {
    setRefreshKey(prev => prev + 1);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    const boundedQuery = <T,>(query:T):T => typeof (query as {abortSignal?:unknown}).abortSignal === 'function' ? (query as T & {abortSignal:(signal:AbortSignal)=>T}).abortSignal(controller.signal) : query;
    const deadline = setTimeout(() => {
      if (cancelled || !userId) return;
      cancelled = true;
      controller.abort();
      setCoursesError('Не удалось подтвердить загрузку данных. Повторите загрузку.');
      setIsLoadingCourses(false);
    }, 15000);

    const fetchData = async () => {
      if (!userId) {
        setOrganizationId(null);
        setIsLoadingCourses(false);
        return;
      }
      let organizationResolved = false;

      try {
        const resolution = await resolveAdminViewOrg(userId);
        let orgId: string | null = null;

        if (resolution.status === "admin") {
          orgId = resolution.view.id;
          if (!cancelled) {
            setAdminResolutionUnknown(false);
            setAdminViewOrgId(resolution.view.id);
            setOrganizationName(resolution.view.name);
            setIsAdminView(true);
          }
        } else if (resolution.status === "unknown") {
          // Phase 5D.1 — NEVER fall back to the admin's own profile org here.
          // Keep the selected organization + adminViewAsOrg flag and ask the
          // user to retry; no data of any other organization is loaded.
          if (!cancelled) {
            setAdminResolutionUnknown(true);
            setIsAdminView(true);
            setIsLoadingCourses(false);
            toast.error("Не удалось подтвердить режим просмотра", {
              id: "admin-view-unknown",
              duration: Infinity,
              action: { label: "Повторить", onClick: () => setRefreshKey(prev => prev + 1) },
            });
          }
          return;
        } else {
          // status: "none" | "not_admin" — normal profile / org_staff resolution.
          if (!cancelled) {
            setAdminResolutionUnknown(false);
            setIsAdminView(false);
            setAdminViewOrgId(null);
          }
          toast.dismiss("admin-view-unknown");
          const workspace = await resolveStaffOrganization(userId);
          orgId = workspace.organizationId;
          if (!orgId) throw new StaffOrganizationResolutionError(
            "NO_ORGANIZATION", "Активный доступ к кабинету организации не найден. Обратитесь к владельцу организации.",
          );
        }

        if (cancelled || !orgId) return;
        toast.dismiss("admin-view-unknown");
        setOrganizationId(orgId);
        organizationResolved = true;

        // The scoped core projection is available to active staff without
        // granting settings.read or SELECT access to the full organization row.
        const { data: coreData } = await boundedQuery(supabase.rpc("get_organization_core", { p_org_id: orgId }));
        if (cancelled) return;
        const selectedOrgData = coreData as { name: string | null; frdo_enabled: boolean | null } | null;

        if (selectedOrgData && !cancelled) {
          setOrganizationName(selectedOrgData.name || "Организация");
          setIsFrdoEnabled(selectedOrgData.frdo_enabled || false);
        }

        // Phase 5D.1 — independent result sets. A failing optional query
        // (categories / companies) must never hide the courses list.
        const [coursesResult, categoriesResult, companiesResult] = await Promise.allSettled([
          retryQuery(
            () => boundedQuery(supabase
              .from("courses")
              .select("id, title, description, is_published, created_at, system_key, category_id, duration, frdo_duration_hours, training_form, cover_image_url, skip_video_identification, require_final_test_photo, sequential_lessons, allow_video_seek, price")
              .eq("organization_id", orgId!)
              .order("created_at", { ascending: false })),
            "courses"
          ),
          retryQuery(
            () => boundedQuery(supabase
              .from("course_categories")
              .select("*")
              .eq("organization_id", orgId!)
              .order("name")),
            "categories"
          ),
          retryQuery(
            () => boundedQuery(supabase
              .from("companies")
              .select("id, name, inn")
              .eq("organization_id", orgId!)
              .order("name")),
            "companies"
          ),
        ]);

        if (cancelled) return;

        // --- optional: categories ---
        if (categoriesResult.status === "fulfilled") {
          setCategoriesError(null);
          if (onCategoriesLoaded) onCategoriesLoaded((categoriesResult.value || []) as CourseCategory[]);
        } else {
          console.error("[org-data] categories failed:", categoriesResult.reason);
          setCategoriesError(describeError(categoriesResult.reason));
        }

        // --- optional: companies (keep previous successful data) ---
        if (companiesResult.status === "fulfilled") {
          setCompaniesError(null);
          setCompanies((companiesResult.value || []) as Company[]);
        } else {
          console.error("[org-data] companies failed:", companiesResult.reason);
          setCompaniesError(describeError(companiesResult.reason));
        }

        // --- required: courses ---
        if (coursesResult.status === "fulfilled") {
          setCoursesError(null);
          const rawCourses = (coursesResult.value || []) as Array<{ id: string; title: string; description: string | null; is_published: boolean; created_at: string; system_key: string | null; category_id: string | null; duration: string | null; frdo_duration_hours: number | null; training_form: string | null; cover_image_url: string | null; skip_video_identification: boolean | null; require_final_test_photo: boolean; sequential_lessons: boolean; allow_video_seek: boolean; price: number }>;
          setCourses(rawCourses.map((course) => ({
            id: course.id,
            title: course.title,
            description: course.description,
            is_published: course.is_published,
            created_at: course.created_at,
            system_key: course.system_key,
            lessonsCount: 0, // filled by useOrganizationSummary.courseOverview
            studentsCount: 0, // filled by useOrganizationSummary.courseOverview
            duration: course.duration || "—",
            frdo_duration_hours: course.frdo_duration_hours ?? null,
            training_form: course.training_form ?? null,
            category_id: course.category_id,
            cover_image_url: course.cover_image_url || null,
            skip_video_identification: course.skip_video_identification ?? false,
            require_final_test_photo: course.require_final_test_photo === true,
            sequential_lessons: course.sequential_lessons ?? false,
            allow_video_seek: course.allow_video_seek ?? true,
            price: course.price ?? 0,
          })));
        } else {
          // Background refetch keeps previously loaded courses on screen.
          console.error("[org-data] courses failed:", coursesResult.reason);
          setCoursesError(describeError(coursesResult.reason));
          toast.error(describeError(coursesResult.reason), {
            id: "org-data-error",
            duration: 15000,
            action: { label: "Повторить", onClick: () => setRefreshKey(prev => prev + 1) },
          });
        }
      } catch (error) {
        if (cancelled) return;
        if (!organizationResolved) {
          setOrganizationId(null);
          setOrganizationName("Организация");
          setIsFrdoEnabled(false);
        }
        console.error("Error fetching data:", error);
        setCoursesError(describeError(error));
        toast.error(describeError(error), {
          id: "org-data-error",
          duration: 15000,
          action: {
            label: "Повторить",
            onClick: () => setRefreshKey(prev => prev + 1),
          },
        });
      } finally {
        clearTimeout(deadline);
        if (!cancelled) {
          setIsLoadingCourses(false);
        }
      }
    };

    fetchData();

    return () => { cancelled = true; clearTimeout(deadline); controller.abort(); };
  }, [userId, refreshKey, onCategoriesLoaded]);

  return {
    organizationId,
    organizationName,
    isFrdoEnabled,
    isAdminView,
    adminViewOrgId,
    adminResolutionUnknown,
    courses,
    setCourses,
    companies,
    setCompanies,
    isLoadingCourses,
    coursesError,
    categoriesError,
    companiesError,
    refreshKey,
    refreshData,
  };
}
