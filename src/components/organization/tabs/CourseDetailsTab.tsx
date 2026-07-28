import { useCallback, useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useOrgDashboard } from "@/contexts/OrgDashboardContext";
import { CourseDetailsContent } from "@/components/organization/CourseDetailsContent";
import { SigmaSpinner } from "@/components/ui/SigmaSpinner";
import { classifyDataError } from "@/utils/isTransientNetworkError";

type LoadState = "loading" | "success" | "not_found" | "error";

export function CourseDetailsTab() {
  const d = useOrgDashboard();
  const courseId = d.tabNavigation.selectedCourseId;
  const organizationId = d.organizationId;

  const [course, setCourse] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<
    | "students" | "materials" | "history" | "tests" | "landing" | "settings"
    | "reminders" | "groups" | "requests" | "achievements" | "editor" | "preview"
  >("editor");
  const [state, setState] = useState<LoadState>("loading");
  const [errorMessage, setErrorMessage] = useState<string>("");

  useEffect(() => { setActiveTab("editor"); }, [courseId]);

  useEffect(() => {
    if (!courseId) d.tabNavigation.setActiveTab("courses");
  }, [courseId]);

  const loadCourse = useCallback(async (withSpinner = true) => {
    if (!courseId || !organizationId) return;
    if (withSpinner) setState("loading");
    setErrorMessage("");

    // 1) Course itself — scoped to this organization.
    const { data: courseData, error: courseError } = await supabase
      .from("courses")
      .select("*")
      .eq("id", courseId)
      .eq("organization_id", organizationId)
      .maybeSingle();

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

    // 3) Students are loaded lazily inside useCourseDetails via the paginated
    //    RPC — CourseDetailsTab no longer prefetches the entire enrollment list.
    setCourse({
      ...courseData,
      lessonsCount: lessonsCount || 0,
    });
    setState("success");
  }, [courseId, organizationId]);

  useEffect(() => {
    loadCourse();
  }, [loadCourse]);

  const handleBack = () => {
    d.tabNavigation.setSelectedCourseId(null);
    d.tabNavigation.setActiveTab("courses");
  };

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
        onCourseDeleted={handleBack}
        onCourseUpdated={() => loadCourse(false)}
        onRefreshStudents={() => { /* useCourseDetails invalidates its own queries */ }}
        onBack={handleBack}
      />
    </div>
  );
}

