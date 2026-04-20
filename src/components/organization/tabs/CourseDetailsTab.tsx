import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useOrgDashboard } from "@/contexts/OrgDashboardContext";
import { CourseDetailsContent } from "@/components/organization/CourseDetailsContent";
import { SigmaSpinner } from "@/components/ui/SigmaSpinner";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";

export function CourseDetailsTab() {
  const d = useOrgDashboard();
  const courseId = d.tabNavigation.selectedCourseId;
  const organizationId = d.organizationId;

  const [course, setCourse] = useState<any>(null);
  const [courseStudents, setCourseStudents] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<"students" | "materials" | "history" | "tests" | "landing" | "settings" | "reminders" | "groups" | "requests" | "achievements" | "editor" | "preview">("editor");
  const [loading, setLoading] = useState(true);

  // Reset to editor whenever a different course is opened
  useEffect(() => {
    setActiveTab("editor");
  }, [courseId]);

  useEffect(() => {
    if (!courseId) return;
    const loadCourse = async () => {
      setLoading(true);
      const { data: courseData } = await supabase
        .from("courses")
        .select("*")
        .eq("id", courseId)
        .single();

      if (courseData) {
        const { count: lessonsCount } = await supabase
          .from("lessons")
          .select("*", { count: "exact", head: true })
          .eq("course_id", courseId);

        const { data: enrollments } = await supabase
          .from("enrollments")
          .select("id, user_id, progress, status")
          .eq("course_id", courseId);

        const studentsList: any[] = [];
        if (enrollments && enrollments.length > 0) {
          const userIds = enrollments.map(e => e.user_id);
          const { data: profiles } = await supabase
            .from("profiles")
            .select("user_id, full_name, email")
            .in("user_id", userIds);

          const profileMap = new Map((profiles || []).map(p => [p.user_id, p]));
          for (const e of enrollments) {
            const prof = profileMap.get(e.user_id);
            studentsList.push({
              id: e.id, user_id: e.user_id, enrollment_id: e.id,
              name: prof?.full_name || "Без имени", email: prof?.email || "",
              progress: e.progress || 0, status: e.status,
            });
          }
        }

        setCourse({
          ...courseData,
          lessonsCount: lessonsCount || 0,
          studentsCount: studentsList.length,
        });
        setCourseStudents(studentsList);
      }
      setLoading(false);
    };
    loadCourse();
  }, [courseId]);

  const refreshStudents = async () => {
    if (!courseId) return;
    const { data: enrollments } = await supabase
      .from("enrollments")
      .select("id, user_id, progress, status")
      .eq("course_id", courseId);
    const studentsList: any[] = [];
    if (enrollments && enrollments.length > 0) {
      const userIds = enrollments.map(e => e.user_id);
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, full_name, email")
        .in("user_id", userIds);
      const profileMap = new Map((profiles || []).map(p => [p.user_id, p]));
      for (const e of enrollments) {
        const prof = profileMap.get(e.user_id);
        studentsList.push({
          id: e.id, user_id: e.user_id, enrollment_id: e.id,
          name: prof?.full_name || "Без имени", email: prof?.email || "",
          progress: e.progress || 0, status: e.status,
        });
      }
    }
    setCourseStudents(studentsList);
    if (course) setCourse({ ...course, studentsCount: studentsList.length });
  };

  const handleBack = () => {
    d.tabNavigation.setSelectedCourseId(null);
    d.tabNavigation.setActiveTab("courses");
  };

  if (!courseId || !organizationId) {
    return <div className="flex items-center justify-center py-20 text-muted-foreground">Курс не найден</div>;
  }

  if (loading) {
    return <div className="flex items-center justify-center py-20"><SigmaSpinner size="lg" /></div>;
  }

  if (!course) {
    return <div className="flex items-center justify-center py-20 text-muted-foreground">Курс не найден</div>;
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
        onCourseUpdated={refreshStudents}
        onRefreshStudents={refreshStudents}
        onBack={handleBack}
      />
    </div>
  );
}
