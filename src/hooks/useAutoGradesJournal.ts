import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { format, parseISO, startOfMonth, endOfMonth, isWithinInterval } from "date-fns";
import { ru } from "date-fns/locale";
import { getXLSX } from "@/utils/xlsxHelper";

export interface GradeRecord {
  id: string;
  user_id: string;
  student_name: string;
  student_email: string;
  course_id: string;
  course_title: string;
  lesson_id: string;
  lesson_title: string;
  lesson_type: string;
  completed_at: string;
  score: number | null;
  max_score: number | null;
  passed: boolean;
  control_type: "test" | "lesson" | "practice";
}

interface Course {
  id: string;
  title: string;
}

export function useAutoGradesJournal(organizationId: string) {
  const [loading, setLoading] = useState(true);
  const [records, setRecords] = useState<GradeRecord[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCourse, setSelectedCourse] = useState<string>("all");
  const [selectedType, setSelectedType] = useState<string>("all");
  const [dateRange, setDateRange] = useState<{ from: Date; to: Date }>({
    from: startOfMonth(new Date()),
    to: endOfMonth(new Date()),
  });

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const { data: coursesData } = await supabase.from("courses").select("id, title").eq("organization_id", organizationId).order("title");
        if (coursesData) setCourses(coursesData);

        const { data: testAttempts } = await supabase.from("test_attempts").select("*").order("completed_at", { ascending: false });
        const { data: lessonProgress } = await supabase.from("lesson_progress").select("*").eq("completed", true).not("completed_at", "is", null).order("completed_at", { ascending: false });

        const testLessonIds = testAttempts?.map(t => t.lesson_id) || [];
        const progressLessonIds = lessonProgress?.map(p => p.lesson_id) || [];
        const allLessonIds = [...new Set([...testLessonIds, ...progressLessonIds])];
        const allUserIds = [...new Set([...(testAttempts?.map(t => t.user_id) || []), ...(lessonProgress?.map(p => p.user_id) || [])])];

        const { data: lessons } = await supabase.from("lessons").select("id, title, course_id, type").in("id", allLessonIds);
        const { data: profiles } = await supabase.from("profiles").select("user_id, full_name, email").eq("organization_id", organizationId).in("user_id", allUserIds);
        const courseIds = lessons ? [...new Set(lessons.map(l => l.course_id))] : [];
        const { data: courseDetails } = await supabase.from("courses").select("id, title").eq("organization_id", organizationId).in("id", courseIds);

        const profileMap = new Map(profiles?.map(p => [p.user_id, p]) || []);
        const lessonMap = new Map(lessons?.map(l => [l.id, l]) || []);
        const courseMap = new Map(courseDetails?.map(c => [c.id, c]) || []);

        const gradeRecords: GradeRecord[] = [];

        for (const attempt of testAttempts || []) {
          const profile = profileMap.get(attempt.user_id);
          const lesson = lessonMap.get(attempt.lesson_id);
          if (!profile || !lesson) continue;
          const course = courseMap.get(lesson.course_id);
          if (!course) continue;
          const percentage = attempt.max_score > 0 ? Math.round((attempt.score / attempt.max_score) * 100) : 0;
          gradeRecords.push({
            id: attempt.id, user_id: attempt.user_id,
            student_name: profile.full_name || profile.email || "Без имени",
            student_email: profile.email || "", course_id: lesson.course_id,
            course_title: course.title, lesson_id: attempt.lesson_id,
            lesson_title: lesson.title, lesson_type: lesson.type,
            completed_at: attempt.completed_at, score: attempt.score,
            max_score: attempt.max_score, passed: percentage >= 70, control_type: "test",
          });
        }

        const testLessonIdsSet = new Set(testLessonIds);
        for (const progress of lessonProgress || []) {
          if (testLessonIdsSet.has(progress.lesson_id)) continue;
          const profile = profileMap.get(progress.user_id);
          const lesson = lessonMap.get(progress.lesson_id);
          if (!profile || !lesson) continue;
          const course = courseMap.get(lesson.course_id);
          if (!course) continue;
          gradeRecords.push({
            id: progress.id, user_id: progress.user_id,
            student_name: profile.full_name || profile.email || "Без имени",
            student_email: profile.email || "", course_id: lesson.course_id,
            course_title: course.title, lesson_id: progress.lesson_id,
            lesson_title: lesson.title, lesson_type: lesson.type,
            completed_at: progress.completed_at!, score: null, max_score: null,
            passed: true, control_type: lesson.type === "test" ? "test" : "lesson",
          });
        }

        gradeRecords.sort((a, b) => new Date(b.completed_at).getTime() - new Date(a.completed_at).getTime());
        setRecords(gradeRecords);
      } catch (error) {
        console.error("Error fetching grades data:", error);
        toast.error("Ошибка при загрузке данных");
      } finally { setLoading(false); }
    };
    fetchData();
  }, [organizationId]);

  const filteredRecords = useMemo(() => {
    return records.filter(record => {
      const searchLower = searchQuery.toLowerCase();
      const matchesSearch = !searchQuery || record.student_name.toLowerCase().includes(searchLower) || record.student_email.toLowerCase().includes(searchLower) || record.course_title.toLowerCase().includes(searchLower) || record.lesson_title.toLowerCase().includes(searchLower);
      const matchesCourse = selectedCourse === "all" || record.course_id === selectedCourse;
      const matchesType = selectedType === "all" || record.control_type === selectedType;
      const recordDate = parseISO(record.completed_at);
      const matchesDate = isWithinInterval(recordDate, { start: dateRange.from, end: dateRange.to });
      return matchesSearch && matchesCourse && matchesType && matchesDate;
    });
  }, [records, searchQuery, selectedCourse, selectedType, dateRange]);

  const stats = useMemo(() => {
    const uniqueStudents = new Set(filteredRecords.map(r => r.user_id)).size;
    const testRecords = filteredRecords.filter(r => r.control_type === "test");
    const totalTests = testRecords.length;
    const passedTests = testRecords.filter(r => r.passed).length;
    const testsWithScore = testRecords.filter(r => r.max_score && r.max_score > 0);
    const avgScore = testsWithScore.length > 0
      ? Math.round(testsWithScore.reduce((acc, r) => acc + (r.score! / r.max_score!) * 100, 0) / testsWithScore.length)
      : 0;
    return { uniqueStudents, totalTests, passedTests, avgScore, totalRecords: filteredRecords.length };
  }, [filteredRecords]);

  const exportToExcel = async () => {
    if (filteredRecords.length === 0) { toast.error("Нет данных для экспорта"); return; }
    const XLSX = await getXLSX();
    const exportData = filteredRecords.map(record => ({
      "ФИО ученика": record.student_name, "Email": record.student_email,
      "Курс": record.course_title, "Модуль/Урок": record.lesson_title,
      "Тип контроля": record.control_type === "test" ? "Тест" : "Урок/Практика",
      "Балл": record.score !== null ? `${record.score}/${record.max_score}` : "—",
      "Процент": record.score !== null && record.max_score ? `${Math.round((record.score / record.max_score) * 100)}%` : "—",
      "Результат": record.passed ? "Зачёт" : "Незачёт",
      "Дата": format(parseISO(record.completed_at), "dd.MM.yyyy HH:mm", { locale: ru }),
    }));
    const worksheet = XLSX.utils.json_to_sheet(exportData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Успеваемость");
    worksheet["!cols"] = [{ wch: 30 }, { wch: 25 }, { wch: 40 }, { wch: 40 }, { wch: 15 }, { wch: 10 }, { wch: 10 }, { wch: 12 }, { wch: 18 }];
    XLSX.writeFile(workbook, `Журнал_успеваемости_${format(new Date(), "dd-MM-yyyy")}.xlsx`);
    toast.success("Журнал экспортирован в Excel");
  };

  const getScoreColor = (score: number | null, maxScore: number | null) => {
    if (score === null || maxScore === null || maxScore === 0) return "";
    const percentage = (score / maxScore) * 100;
    if (percentage >= 90) return "text-green-600 bg-green-500/10";
    if (percentage >= 70) return "text-blue-600 bg-blue-500/10";
    if (percentage >= 50) return "text-amber-600 bg-amber-500/10";
    return "text-red-600 bg-red-500/10";
  };

  return {
    loading, records, courses, filteredRecords, stats,
    searchQuery, setSearchQuery, selectedCourse, setSelectedCourse,
    selectedType, setSelectedType, dateRange, setDateRange,
    exportToExcel, getScoreColor,
  };
}
