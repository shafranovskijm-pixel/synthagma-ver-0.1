import { useCallback, useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useOrgDashboard } from "@/contexts/OrgDashboardContext";
import { CourseDetailsContent } from "@/components/organization/CourseDetailsContent";
import { SigmaSpinner } from "@/components/ui/SigmaSpinner";
import { loadCourseStudents } from "@/api/courseStudents";
import { classifyDataError } from "@/utils/isTransientNetworkError";

type LoadState = "loading" | "success" | "not_found" | "error";

export function CourseDetailsTab() {
  const d = useOrgDashboard();
  const courseId = d.tabNavigation.selectedCourseId;
  const organizationId = d.organizationId;

  const [course, setCourse] = useState<any>(null);
  const [courseStudents, setCourseStudents] = useState<any[]>([]);
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

    // 3) Students of the course via the shared loader — errors are surfaced.
    let students: any[] = [];
    try {
      students = await loadCourseStudents({ courseId, courseTitle: courseData.title });
    } catch (err) {
      console.error("[CourseDetailsTab] students fetch failed:", err);
      const kind = classifyDataError(err);
      setState("error");
      setErrorMessage(
        kind === "permission"
          ? "Недостаточно прав для просмотра учеников этого курса."
          : kind === "network"
          ? "Не удалось загрузить учеников — проблема с сетью или прокси. Повторите попытку."
          : "Не удалось загрузить учеников курса. Повторите попытку."
      );
      return;
    }

    setCourse({
      ...courseData,
      lessonsCount: lessonsCount || 0,
      studentsCount: students.length,
    });
    setCourseStudents(students);
    setState("success");
  }, [courseId, organizationId]);

  useEffect(() => {
    loadCourse();
  }, [loadCourse]);

  const refreshStudents = useCallback(async () => {
    if (!courseId) return;
    try {
      const students = await loadCourseStudents({ courseId, courseTitle: course?.title ?? null });
      setCourseStudents(students);
      if (course) setCourse({ ...course, studentsCount: students.length });
    } catch (err) {
      console.error("[CourseDetailsTab] refresh students failed:", err);
    }
  }, [courseId, course]);

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
        courseStudents={courseStudents}
        organizationId={organizationId}
        activeTab={activeTab}
        onTabChange={setActiveTab}
        onEnrollStudent={() => {}}
        onCourseDeleted={handleBack}
        onCourseUpdated={() => loadCourse(false)}
        onRefreshStudents={refreshStudents}
        onBack={handleBack}
      />
    </div>
  );
}
