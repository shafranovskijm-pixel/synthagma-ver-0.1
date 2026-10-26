import { useState, useEffect, useMemo, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { buildHistoryExport, resolveAttemptHistory, storedAttemptOutcome, type QuestionDetail, type ResolvedAttemptHistory } from "@/lib/courseTestHistory";
export type { QuestionDetail } from "@/lib/courseTestHistory";

function normalizeOption(opt: unknown): string {
  if (typeof opt === 'string') return opt;
  if (opt && typeof opt === 'object' && 'text' in opt) return String((opt as any).text);
  return String(opt ?? '');
}

export { normalizeOption };

export interface TestQuestion {
  id: string;
  question: string;
  options: string[];
  correct_answer: number;
}

export interface TestAttemptData {
  id: string;
  user_id: string;
  lesson_id: string;
  score: number;
  max_score: number;
  completed_at: string;
  user_name: string;
  user_email: string;
  lesson_title: string;
  answers: Record<string, number>;
  shown_question_ids: string[];
  passed: boolean | null;
  passing_score: number | null;
  history: ResolvedAttemptHistory;
}


export function useCourseTestReport(courseId: string, courseName: string, organizationId: string) {
  const [testData, setTestData] = useState<TestAttemptData[]>([]);
  const requestEpoch = useRef(0);
  const [loadError, setLoadError] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [expandedAttempts, setExpandedAttempts] = useState<Set<string>>(new Set());

  const [selectedStudent, setSelectedStudent] = useState<string>("all");
  const [selectedTest, setSelectedTest] = useState<string>("all");
  const [dateFrom, setDateFrom] = useState<Date | undefined>(undefined);
  const [dateTo, setDateTo] = useState<Date | undefined>(undefined);

  useEffect(() => {
    setSelectedStudent("all");
    setSelectedTest("all");
    setDateFrom(undefined);
    setDateTo(undefined);
    void fetchTestData();
    return () => { requestEpoch.current += 1; };
  }, [courseId, organizationId]);

  const fetchTestData = async () => {
    const epoch = ++requestEpoch.current;
    const current = () => requestEpoch.current === epoch;
    setIsLoading(true);
    setLoadError(false);
    setTestData([]);
    setExpandedAttempts(new Set());
    try {
      const { data: lessons, error: lessonsError } = await supabase
        .from("lessons")
        .select("id, title")
        .eq("course_id", courseId)
        .eq("type", "test");
      if (lessonsError) throw new Error("report unavailable");
      if (!current()) return;
      if (!lessons || lessons.length === 0) return;
      const lessonIds = lessons.map(l => l.id);
      const lessonsMap = new Map(lessons.map(l => [l.id, l.title]));
      const { data: attempts, error: attemptsError } = await supabase
        .from("test_attempts")
        .select("id, user_id, lesson_id, score, max_score, completed_at, answers, shown_question_ids, passed, passing_score")
        .in("lesson_id", lessonIds)
        .order("completed_at", { ascending: false });
      if (attemptsError) throw new Error("report unavailable");
      if (!current()) return;
      if (!attempts || attempts.length === 0) return;

      // The RPC authorizes the original caller and returns only the exact
      // completed session snapshot. It never reads the current question bank.
      const historyClient = supabase as unknown as {
        rpc(name: "get_teacher_test_attempt_history", args: {
          p_course_id: string; p_attempt_ids: string[];
        }): PromiseLike<{ data: unknown; error: unknown }>;
      };
      const historyRows = new Map<string, unknown>();
      for (let offset = 0; offset < attempts.length; offset += 200) {
        const ids = attempts.slice(offset, offset + 200).map(a => a.id);
        const { data, error } = await historyClient.rpc("get_teacher_test_attempt_history", {
          p_course_id: courseId, p_attempt_ids: ids,
        });
        if (error || !Array.isArray(data) || data.length !== ids.length) throw new Error("history unavailable");
        const expected = new Set(ids);
        for (const row of data) {
          if (!row || typeof row !== "object" || !expected.delete(row.attempt_id)) {
            throw new Error("history unavailable");
          }
          historyRows.set(row.attempt_id, row);
        }
        if (expected.size !== 0) throw new Error("history unavailable");
        if (!current()) return;
      }
      const { data: profiles, error: profilesError } = await supabase
        .from("profiles")
        .select("user_id, full_name, email")
        .eq("organization_id", organizationId);
      if (profilesError) throw new Error("report unavailable");
      if (!current()) return;
      const profilesMap = new Map(
        (profiles || []).map(p => [p.user_id, { name: p.full_name || "Неизвестный", email: p.email || "" }])
      );
      const enrichedData: TestAttemptData[] = attempts.map(a => {
        const attempt = {
          ...a,
          answers: a.answers as Record<string, number>,
          shown_question_ids: (a.shown_question_ids ?? []) as string[],
        };
        return {
          ...attempt,
          user_name: profilesMap.get(a.user_id)?.name || "Неизвестный",
          user_email: profilesMap.get(a.user_id)?.email || "",
          lesson_title: lessonsMap.get(a.lesson_id) || "Тест",
          history: resolveAttemptHistory(attempt, historyRows.get(a.id)),
        };
      });
      if (current()) setTestData(enrichedData);
    } catch {
      if (current()) {
        setTestData([]);
        setLoadError(true);
        console.error("course_test_report_unavailable");
      }
    } finally {
      if (current()) setIsLoading(false);
    }
  };

  const uniqueStudents = useMemo(() => {
    const students = new Map<string, string>();
    testData.forEach(a => { if (!students.has(a.user_id)) students.set(a.user_id, a.user_name); });
    return Array.from(students.entries()).map(([id, name]) => ({ id, name }));
  }, [testData]);

  const uniqueTests = useMemo(() => {
    const tests = new Map<string, string>();
    testData.forEach(a => { if (!tests.has(a.lesson_id)) tests.set(a.lesson_id, a.lesson_title); });
    return Array.from(tests.entries()).map(([id, title]) => ({ id, title }));
  }, [testData]);

  const filteredData = useMemo(() => {
    return testData.filter(a => {
      if (selectedStudent !== "all" && a.user_id !== selectedStudent) return false;
      if (selectedTest !== "all" && a.lesson_id !== selectedTest) return false;
      const attemptDate = new Date(a.completed_at);
      if (dateFrom) { const f = new Date(dateFrom); f.setHours(0,0,0,0); if (attemptDate < f) return false; }
      if (dateTo) { const t = new Date(dateTo); t.setHours(23,59,59,999); if (attemptDate > t) return false; }
      return true;
    });
  }, [testData, selectedStudent, selectedTest, dateFrom, dateTo]);

  const stats = useMemo(() => {
    const passedCount = filteredData.filter(a => storedAttemptOutcome(a) === true).length;
    const averageScore = filteredData.length > 0
      ? Math.round(filteredData.reduce((sum, a) => sum + (a.max_score > 0 ? (a.score / a.max_score) * 100 : 0), 0) / filteredData.length)
      : 0;
    return { totalAttempts: filteredData.length, passedCount, averageScore, uniqueStudents: new Set(filteredData.map(a => a.user_id)).size };
  }, [filteredData]);

  const hasActiveFilters = selectedStudent !== "all" || selectedTest !== "all" || !!dateFrom || !!dateTo;

  const clearFilters = () => {
    setSelectedStudent("all");
    setSelectedTest("all");
    setDateFrom(undefined);
    setDateTo(undefined);
  };

  const toggleExpanded = (attemptId: string) => {
    setExpandedAttempts(prev => {
      const s = new Set(prev);
      s.has(attemptId) ? s.delete(attemptId) : s.add(attemptId);
      return s;
    });
  };

  const getAttemptQuestionDetails = (attempt: TestAttemptData): QuestionDetail[] => attempt.history.details;

  const handleExport = async () => {
    const XLSX = await import('xlsx');
    const { summaryData, detailedData, wrongAnswersData } = buildHistoryExport(filteredData);

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summaryData), 'Сводка');
    if (detailedData.length > 0) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(detailedData), 'Все ответы');
    if (wrongAnswersData.length > 0) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(wrongAnswersData), 'Неправильные ответы');
    XLSX.writeFile(wb, `результаты_тестов_${courseName}_${new Date().toISOString().split('T')[0]}.xlsx`);
    toast.success('Результаты тестов с вопросами экспортированы');
  };

  return {
    testData, isLoading, loadError, retry: fetchTestData, expandedAttempts,
    selectedStudent, setSelectedStudent,
    selectedTest, setSelectedTest,
    dateFrom, setDateFrom,
    dateTo, setDateTo,
    uniqueStudents, uniqueTests,
    filteredData, stats, hasActiveFilters,
    clearFilters, toggleExpanded,
    getAttemptQuestionDetails, handleExport,
  };
}
