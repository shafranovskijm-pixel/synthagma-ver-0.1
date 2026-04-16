import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { format, parseISO, startOfMonth, endOfMonth, isWithinInterval } from "date-fns";
import { ru } from "date-fns/locale";
import { getXLSX } from "@/utils/xlsxHelper";

interface AttemptQuestion {
  id: string; question: string; options: (string | { text: string })[]; correct_answer: number | null; explanation?: string | null;
}

export interface AttemptDetails {
  answers: Record<string, number>; shown_question_ids: string[]; questions: AttemptQuestion[];
  score: number; max_score: number; student_name: string; course_title: string;
}

export interface FinalAttestationRecord {
  id: string; user_id: string; student_name: string; student_email: string;
  course_id: string; course_title: string; enrollment_status: string;
  started_at: string; completed_at: string | null; progress: number;
  final_test_score: number | null; final_test_max_score: number | null;
  final_test_passed: boolean; final_test_date: string | null;
  total_time_spent: number; test_attempt_id: string | null;
}

interface Course { id: string; title: string; }

export function useAutoFinalAttestation(organizationId: string) {
  const [loading, setLoading] = useState(true);
  const [records, setRecords] = useState<FinalAttestationRecord[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCourse, setSelectedCourse] = useState("all");
  const [selectedStatus, setSelectedStatus] = useState("all");
  const [dateRange, setDateRange] = useState({ from: startOfMonth(new Date()), to: endOfMonth(new Date()) });
  const [attemptDetails, setAttemptDetails] = useState<AttemptDetails | null>(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);

  const handleViewAttempt = async (record: FinalAttestationRecord) => {
    if (!record.test_attempt_id) return;
    setDetailsLoading(true); setDetailsOpen(true);
    try {
      const { data: attempt } = await supabase.from("test_attempts").select("id, answers, shown_question_ids, score, max_score").eq("id", record.test_attempt_id).single();
      if (!attempt) throw new Error("Attempt not found");
      const shownIds = (attempt.shown_question_ids as string[]) || [];
      const { data: questions } = await supabase.from("test_questions").select("id, question, options, correct_answer, explanation").in("id", shownIds);
      setAttemptDetails({
        answers: (attempt.answers as Record<string, number>) || {}, shown_question_ids: shownIds,
        questions: (questions || []) as AttemptQuestion[], score: attempt.score, max_score: attempt.max_score,
        student_name: record.student_name, course_title: record.course_title,
      });
    } catch (err) { console.error("Error loading attempt:", err); toast.error("Ошибка загрузки деталей теста"); setDetailsOpen(false); }
    finally { setDetailsLoading(false); }
  };

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const { data: coursesData } = await supabase.from("courses").select("id, title").eq("organization_id", organizationId).order("title");
        if (coursesData) setCourses(coursesData);
        const courseIds = coursesData?.map(c => c.id) || [];
        if (courseIds.length === 0) { setRecords([]); setLoading(false); return; }

        const { data: enrollments } = await supabase.from("enrollments").select("*").in("course_id", courseIds).order("started_at", { ascending: false });
        if (!enrollments?.length) { setRecords([]); setLoading(false); return; }

        const userIds = [...new Set(enrollments.map(e => e.user_id))];
        const { data: profiles } = await supabase.from("profiles").select("user_id, full_name, email").eq("organization_id", organizationId).in("user_id", userIds);
        const { data: lessons } = await supabase.from("lessons").select("id, course_id, type, order_index").in("course_id", courseIds).eq("type", "test").order("order_index", { ascending: false });

        const finalTestMap = new Map<string, string>();
        const processed = new Set<string>();
        for (const l of lessons || []) { if (!processed.has(l.course_id)) { finalTestMap.set(l.course_id, l.id); processed.add(l.course_id); } }

        const finalTestIds = Array.from(finalTestMap.values());
        const { data: testAttempts } = await supabase.from("test_attempts").select("*").in("lesson_id", finalTestIds).in("user_id", userIds);

        const profileMap = new Map(profiles?.map(p => [p.user_id, p]) || []);
        const courseMap = new Map(coursesData?.map(c => [c.id, c]) || []);
        const bestAttemptMap = new Map<string, (typeof testAttempts)[0]>();
        for (const a of testAttempts || []) { const k = `${a.user_id}_${a.lesson_id}`; const ex = bestAttemptMap.get(k); if (!ex || a.score > ex.score) bestAttemptMap.set(k, a); }

        const result: FinalAttestationRecord[] = [];
        for (const e of enrollments) {
          const p = profileMap.get(e.user_id); const c = courseMap.get(e.course_id);
          if (!p || !c) continue;
          const ftId = finalTestMap.get(e.course_id);
          const attempt = ftId ? bestAttemptMap.get(`${e.user_id}_${ftId}`) : null;
          let passed = false;
          if (attempt && attempt.max_score > 0) passed = (attempt.score / attempt.max_score) * 100 >= 70;
          result.push({
            id: e.id, user_id: e.user_id, student_name: p.full_name || p.email || "Без имени", student_email: p.email || "",
            course_id: e.course_id, course_title: c.title, enrollment_status: e.status,
            started_at: e.started_at, completed_at: e.completed_at, progress: e.progress || 0,
            final_test_score: attempt?.score ?? null, final_test_max_score: attempt?.max_score ?? null,
            final_test_passed: passed, final_test_date: attempt?.completed_at ?? null,
            total_time_spent: e.time_spent || 0, test_attempt_id: attempt?.id ?? null,
          });
        }
        setRecords(result);
      } catch (error) { console.error("Error fetching attestation data:", error); toast.error("Ошибка загрузки данных"); }
      finally { setLoading(false); }
    })();
  }, [organizationId]);

  const filteredRecords = useMemo(() => records.filter(r => {
    const sl = searchQuery.toLowerCase();
    const matchSearch = !searchQuery || r.student_name.toLowerCase().includes(sl) || r.student_email.toLowerCase().includes(sl) || r.course_title.toLowerCase().includes(sl);
    const matchCourse = selectedCourse === "all" || r.course_id === selectedCourse;
    let matchStatus = true;
    if (selectedStatus === "completed") matchStatus = r.enrollment_status === "completed";
    else if (selectedStatus === "in_progress") matchStatus = r.enrollment_status === "in_progress";
    else if (selectedStatus === "passed") matchStatus = r.final_test_passed;
    else if (selectedStatus === "failed") matchStatus = r.final_test_score !== null && !r.final_test_passed;
    const rd = r.completed_at ? parseISO(r.completed_at) : parseISO(r.started_at);
    const matchDate = isWithinInterval(rd, { start: dateRange.from, end: dateRange.to });
    return matchSearch && matchCourse && matchStatus && matchDate;
  }), [records, searchQuery, selectedCourse, selectedStatus, dateRange]);

  const stats = useMemo(() => {
    const unique = new Set(filteredRecords.map(r => r.user_id)).size;
    const completed = filteredRecords.filter(r => r.enrollment_status === "completed").length;
    const withTest = filteredRecords.filter(r => r.final_test_score !== null).length;
    const passed = filteredRecords.filter(r => r.final_test_passed).length;
    const avg = withTest > 0 ? Math.round(filteredRecords.filter(r => r.final_test_score !== null && r.final_test_max_score).reduce((a, r) => a + (r.final_test_score! / r.final_test_max_score!) * 100, 0) / withTest) : 0;
    return { uniqueStudents: unique, completed, withFinalTest: withTest, passedFinal: passed, avgScore: avg };
  }, [filteredRecords]);

  const exportToExcel = async () => {
    if (filteredRecords.length === 0) { toast.error("Нет данных для экспорта"); return; }
    const XLSX = await getXLSX();
    const data = filteredRecords.map(r => ({
      "ФИО ученика": r.student_name, "Email": r.student_email, "Курс": r.course_title,
      "Статус": r.enrollment_status === "completed" ? "Завершён" : "В процессе", "Прогресс (%)": r.progress,
      "Дата начала": format(parseISO(r.started_at), "dd.MM.yyyy", { locale: ru }),
      "Дата завершения": r.completed_at ? format(parseISO(r.completed_at), "dd.MM.yyyy", { locale: ru }) : "—",
      "Итоговый тест": r.final_test_score !== null ? `${r.final_test_score}/${r.final_test_max_score}` : "Не сдан",
      "Процент": r.final_test_score !== null && r.final_test_max_score ? `${Math.round((r.final_test_score / r.final_test_max_score) * 100)}%` : "—",
      "Результат": r.final_test_score === null ? "Ожидается" : r.final_test_passed ? "ЗАЧЁТ" : "НЕЗАЧЁТ",
      "Дата аттестации": r.final_test_date ? format(parseISO(r.final_test_date), "dd.MM.yyyy HH:mm", { locale: ru }) : "—",
      "Время (мин)": Math.round(r.total_time_spent / 60),
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    ws["!cols"] = [{ wch: 30 }, { wch: 25 }, { wch: 40 }, { wch: 15 }, { wch: 10 }, { wch: 12 }, { wch: 15 }, { wch: 18 }, { wch: 10 }, { wch: 20 }, { wch: 22 }, { wch: 18 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Итоговая аттестация");
    XLSX.writeFile(wb, `Журнал_итоговой_аттестации_${format(new Date(), "dd-MM-yyyy")}.xlsx`);
    toast.success("Журнал экспортирован в Excel");
  };

  const formatTime = (s: number) => { const h = Math.floor(s / 3600); const m = Math.floor((s % 3600) / 60); return h > 0 ? `${h}ч ${m}м` : `${m}м`; };

  const getScoreColor = (score: number | null, maxScore: number | null) => {
    if (score === null || maxScore === null || maxScore === 0) return "";
    const pct = (score / maxScore) * 100;
    if (pct >= 90) return "text-green-600 bg-green-500/10";
    if (pct >= 70) return "text-blue-600 bg-blue-500/10";
    if (pct >= 50) return "text-amber-600 bg-amber-500/10";
    return "text-red-600 bg-red-500/10";
  };

  return {
    loading, records, courses, filteredRecords, stats,
    searchQuery, setSearchQuery, selectedCourse, setSelectedCourse,
    selectedStatus, setSelectedStatus, dateRange, setDateRange,
    attemptDetails, detailsLoading, detailsOpen, setDetailsOpen,
    handleViewAttempt, exportToExcel, formatTime, getScoreColor,
  };
}
