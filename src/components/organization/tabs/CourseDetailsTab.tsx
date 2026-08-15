import { useCallback, useState, useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrgDashboard } from "@/contexts/OrgDashboardContext";
import { CourseDetailsContent } from "@/components/organization/CourseDetailsContent";
import { SigmaSpinner } from "@/components/ui/SigmaSpinner";
import { classifyDataError } from "@/utils/isTransientNetworkError";
import { invalidateOrganizationCourseOverview } from "@/lib/invalidateOrganizationQueries";

type LoadState = "loading" | "success" | "not_found" | "error";

export function CourseDetailsTab() {
  const d = useOrgDashboard();
  const qc = useQueryClient();
  const courseId = d.tabNavigation.selectedCourseId;
  const organizationId = d.organizationId;

  const [course, setCourse] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<
    | "students" | "materials" | "history" | "tests" | "landing" | "settings"
    | "reminders" | "groups" | "requests" | "achievements" | "editor" | "preview"
  >("editor");
  const [state, setState] = useState<LoadState>("loading");
  const [errorMessage, setErrorMessage] = useState<string>("");
  const loadSequenceRef = useRef(0);

  useEffect(() => { setActiveTab("editor"); }, [courseId]);

  useEffect(() => {
    if (!courseId) d.tabNavigation.setActiveTab("courses");
  }, [courseId]);

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

  const handleBack = () => {
    d.tabNavigation.setSelectedCourseId(null);
    d.tabNavigation.setActiveTab("courses");
  };

  // Deleting a course affects the base course list, dashboard summary,
  // course overview, and enrollment-derived rows simultaneously — refresh
  // everything before we navigate back.
  const handleCourseDeleted = useCallback(() => {
    d.refreshData();
    handleBack();
  }, [d]);

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
      <CourseDetailsContent
        course={course}
        courseStudents={[]}
        organizationId={organizationId}
        activeTab={activeTab}
        onTabChange={setActiveTab}
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

