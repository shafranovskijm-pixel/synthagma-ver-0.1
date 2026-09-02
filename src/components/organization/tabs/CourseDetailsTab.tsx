import { useCallback, useState, useEffect, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { publishCourse } from "@/api/courses";
import { useOrgDashboard } from "@/contexts/OrgDashboardContext";
import { CourseDetailsContent } from "@/components/organization/CourseDetailsContent";
import { Button } from "@/components/ui/button";
import { SigmaSpinner } from "@/components/ui/SigmaSpinner";
import { RequirePerm } from "@/hooks/useStaffPermissions";
import { classifyDataError } from "@/utils/isTransientNetworkError";
import { invalidateOrganizationCourseOverview } from "@/lib/invalidateOrganizationQueries";

type LoadState = "loading" | "success" | "not_found" | "error";

export function CourseDetailsTab() {
  const d = useOrgDashboard();
  const qc = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const courseId = d.tabNavigation.selectedCourseId;
  const organizationId = d.organizationId;
  const courseSection = searchParams.get("courseSection");
  const setDashboardActiveTab = d.tabNavigation.setActiveTab;
  const setSelectedCourseId = d.tabNavigation.setSelectedCourseId;
  const refreshDashboardData = d.refreshData;

  const [course, setCourse] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<
    | "students" | "materials" | "history" | "tests" | "landing" | "settings"
    | "reminders" | "groups" | "requests" | "achievements" | "editor" | "preview"
  >(courseSection === "library" ? "materials" : "editor");
  const [state, setState] = useState<LoadState>("loading");
  const [errorMessage, setErrorMessage] = useState<string>("");
  const [isPublicationChanging, setIsPublicationChanging] = useState(false);
  const loadSequenceRef = useRef(0);
  const publicationSequenceRef = useRef(0);

  useEffect(() => {
    setActiveTab(courseSection === "library" ? "materials" : "editor");
  }, [courseId, courseSection]);

  useEffect(() => {
    // A pending mutation belongs to the course URL from which it started.
    // Reset the control for a newly opened course and prevent an older
    // request's finally block from changing its loading state.
    publicationSequenceRef.current += 1;
    setIsPublicationChanging(false);
  }, [courseId]);

  const handleTabChange = useCallback((nextTab: typeof activeTab) => {
    setActiveTab(nextTab);
    const nextParams = new URLSearchParams(searchParams);
    if (nextTab === "materials") nextParams.set("courseSection", "library");
    else nextParams.delete("courseSection");
    setSearchParams(nextParams, { replace: true });
  }, [searchParams, setSearchParams]);

  useEffect(() => {
    if (!courseId) setDashboardActiveTab("courses");
  }, [courseId, setDashboardActiveTab]);

  const loadCourse = useCallback(async (withSpinner = true) => {
    if (!courseId || !organizationId) return;
    const requestSequence = ++loadSequenceRef.current;
    const isCurrentRequest = () => loadSequenceRef.current === requestSequence;

    if (withSpinner) {
      // A URL change must never leave the previous course actionable while
      // the newly selected course is still loading.
      setCourse(null);
      setState("loading");
    }
    setErrorMessage("");

    // 1) Course itself — scoped to this organization.
    const { data: courseData, error: courseError } = await supabase
      .from("courses")
      .select("*")
      .eq("id", courseId)
      .eq("organization_id", organizationId)
      .maybeSingle();

    if (!isCurrentRequest()) return;

    if (courseError) {
      console.error("[CourseDetailsTab] course fetch failed:", courseError);
      const kind = classifyDataError(courseError);
      setState("error");
      setErrorMessage(
        kind === "permission"
          ? "Недостаточно прав для просмотра курса."
          : kind === "network"
          ? "Не удалось загрузить курс — проблема с сетью или прокси. Повторите попытку."
          : "Не удалось загрузить курс. Повторите попытку."
      );
      return;
    }

    if (!courseData) {
      setState("not_found");
      return;
    }

    // 2) Lesson count (non-critical).
    const { count: lessonsCount } = await supabase
      .from("lessons")
      .select("*", { count: "exact", head: true })
      .eq("course_id", courseId);

    if (!isCurrentRequest()) return;

    // 3) Students are loaded lazily inside useCourseDetails via the paginated
    //    RPC — CourseDetailsTab no longer prefetches the entire enrollment list.
    setCourse({
      ...courseData,
      lessonsCount: lessonsCount || 0,
    });
    setState("success");
  }, [courseId, organizationId]);

  useEffect(() => {
    void loadCourse();
    return () => {
      // Invalidate an unresolved request when the URL id changes or this
      // details view unmounts. The network request may finish, but it cannot
      // commit stale state into the next course card.
      loadSequenceRef.current += 1;
    };
  }, [loadCourse]);

  const handleBack = useCallback(() => {
    setSelectedCourseId(null);
    setDashboardActiveTab("courses");
  }, [setDashboardActiveTab, setSelectedCourseId]);

  // Deleting a course affects the base course list, dashboard summary,
  // course overview, and enrollment-derived rows simultaneously — refresh
  // everything before we navigate back.
  const handleCourseDeleted = useCallback(() => {
    refreshDashboardData();
    handleBack();
  }, [handleBack, refreshDashboardData]);

  const handlePublicationChange = useCallback(async () => {
    if (!course || isPublicationChanging) return;

    const targetCourseId = course.id;
    const nextPublished = !course.is_published;
    // Do not let a course snapshot that started before this mutation commit
    // an older publication state after the server update.
    loadSequenceRef.current += 1;
    const requestSequence = ++publicationSequenceRef.current;
    setIsPublicationChanging(true);

    try {
      const success = await publishCourse(targetCourseId, nextPublished);
      if (!success) {
        toast.error("Ошибка изменения статуса публикации");
        return;
      }

      // A background reload may also have started while the mutation was in
      // flight. Invalidate it before committing the confirmed server value.
      loadSequenceRef.current += 1;
      // Update both the open details card and the dashboard's base course
      // list only after the database returned the persisted value.
      setCourse((current: any) => current?.id === targetCourseId
        ? { ...current, is_published: nextPublished }
        : current);
      d.setCourses((currentCourses) => currentCourses.map((currentCourse) =>
        currentCourse.id === targetCourseId
          ? { ...currentCourse, is_published: nextPublished }
          : currentCourse
      ));
      invalidateOrganizationCourseOverview(qc, organizationId);
      toast.success(nextPublished ? "Курс опубликован" : "Курс снят с публикации");
    } catch (error) {
      console.error("[CourseDetailsTab] publication update failed:", error);
      toast.error("Ошибка изменения статуса публикации");
    } finally {
      if (publicationSequenceRef.current === requestSequence) {
        setIsPublicationChanging(false);
      }
    }
  }, [course, d, isPublicationChanging, organizationId, qc]);

  // Adding/removing lessons inside a course changes lessonsCount on the
  // overview RPC. Invalidate only that key on unmount so the returning
  // course list re-renders with fresh studentsCount / lessonsCount, without
  // triggering the base loader or student-population refetches.
  useEffect(() => {
    return () => {
      invalidateOrganizationCourseOverview(qc, organizationId);
    };
  }, [qc, organizationId]);

  if (!courseId || !organizationId) {
    return <div className="flex items-center justify-center py-20"><SigmaSpinner size="lg" /></div>;
  }

  if (state === "loading") {
    return <div className="flex items-center justify-center py-20"><SigmaSpinner size="lg" /></div>;
  }

  if (state === "error") {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3 text-muted-foreground">
        <span>{errorMessage || "Не удалось загрузить курс"}</span>
        <div className="flex items-center gap-4">
          <button className="text-sm text-primary underline" onClick={() => loadCourse()}>
            Повторить
          </button>
          <button className="text-sm underline" onClick={handleBack}>Вернуться к курсам</button>
        </div>
      </div>
    );
  }

  if (state === "not_found" || !course) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3 text-muted-foreground">
        <span>Курс не найден или больше не доступен</span>
        <button className="text-sm text-primary underline" onClick={handleBack}>
          Вернуться к курсам
        </button>
      </div>
    );
  }

  return (
    <div className="animate-in fade-in duration-300">
      <RequirePerm perm="courses.write">
        <div className="mb-3 flex justify-end">
          <Button
            type="button"
            variant={course.is_published ? "outline" : "default"}
            onClick={handlePublicationChange}
            disabled={isPublicationChanging}
            aria-busy={isPublicationChanging}
          >
            {isPublicationChanging && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
            {isPublicationChanging
              ? course.is_published ? "Снимаем с публикации…" : "Публикуем…"
              : course.is_published ? "Снять с публикации" : "Опубликовать курс"}
          </Button>
        </div>
      </RequirePerm>
      <CourseDetailsContent
        course={course}
        courseStudents={[]}
        organizationId={organizationId}
        activeTab={activeTab}
        onTabChange={handleTabChange}
        onEnrollStudent={() => {}}
        onCourseDeleted={handleCourseDeleted}
        onCourseUpdated={() => loadCourse(false)}
        // Phase 4B.1.c.2.b.2 — separate callbacks per mutation kind so
        // course-scoped changes never invalidate wider dashboard state.
        //   enrollment       — bulk enroll/unenroll, request approval, group enrollment
        //   grouping         — students moved into a group
        //   population       — new student profile created in a group
        //   group directory  — group create/rename/delete/date-edit
        onEnrollmentChanged={d.refreshEnrollmentData}
        onStudentGroupingChanged={d.refreshStudentGrouping}
        onStudentPopulationChanged={d.refreshStudentPopulation}
        onGroupDirectoryChanged={d.refreshGroupDirectory}
        onBack={handleBack}
      />
    </div>
  );
}

