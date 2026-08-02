import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Course, Company, CourseCategory } from "@/types/shared";
import { isTransientNetworkError, classifyDataError } from "@/utils/isTransientNetworkError";
import { resolveAdminViewOrg } from "@/utils/adminViewOrg";

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

    const fetchData = async () => {
      if (!userId) return;

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
          if (!cancelled) setAdminResolutionUnknown(false);
          toast.dismiss("admin-view-unknown");

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
        }

        if (cancelled || !orgId) return;
        toast.dismiss("admin-view-unknown");
        setOrganizationId(orgId);

        // Organization row (name + frdo_enabled) — optional metadata.
        const { data: selectedOrgData } = await supabase
          .from("organizations")
          .select("name, frdo_enabled")
          .eq("id", orgId)
          .maybeSingle();

        if (selectedOrgData && !cancelled) {
          setOrganizationName(selectedOrgData.name);
          setIsFrdoEnabled(selectedOrgData.frdo_enabled || false);
        }

        // Phase 5D.1 — independent result sets. A failing optional query
        // (categories / companies) must never hide the courses list.
        const [coursesResult, categoriesResult, companiesResult] = await Promise.allSettled([
          retryQuery(
            () => supabase
              .from("courses")
              .select("id, title, description, is_published, created_at, category_id, duration, frdo_duration_hours, training_form, cover_image_url, skip_video_identification, sequential_lessons, allow_video_seek, price")
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
          const rawCourses = (coursesResult.value || []) as Array<{ id: string; title: string; description: string | null; is_published: boolean; created_at: string; category_id: string | null; duration: string | null; frdo_duration_hours: number | null; training_form: string | null; cover_image_url: string | null; skip_video_identification: boolean | null; sequential_lessons: boolean; allow_video_seek: boolean; price: number }>;
          setCourses(rawCourses.map((course) => ({
            id: course.id,
            title: course.title,
            description: course.description,
            is_published: course.is_published,
            created_at: course.created_at,
            lessonsCount: 0, // filled by useOrganizationSummary.courseOverview
            studentsCount: 0, // filled by useOrganizationSummary.courseOverview
            duration: course.duration || "—",
            frdo_duration_hours: course.frdo_duration_hours ?? null,
            training_form: course.training_form ?? null,
            category_id: course.category_id,
            cover_image_url: course.cover_image_url || null,
            skip_video_identification: course.skip_video_identification ?? false,
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
