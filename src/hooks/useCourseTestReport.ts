import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

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
}

export interface QuestionDetail {
  questionText: string;
  options: string[];
  selectedAnswer: number;
  correctAnswer: number;
  isCorrect: boolean;
}

export function useCourseTestReport(courseId: string, courseName: string, organizationId: string) {
  const [testData, setTestData] = useState<TestAttemptData[]>([]);
  const [questionsMap, setQuestionsMap] = useState<Map<string, TestQuestion>>(new Map());
  const [isLoading, setIsLoading] = useState(true);
  const [expandedAttempts, setExpandedAttempts] = useState<Set<string>>(new Set());

  const [selectedStudent, setSelectedStudent] = useState<string>("all");
  const [selectedTest, setSelectedTest] = useState<string>("all");
  const [dateFrom, setDateFrom] = useState<Date | undefined>(undefined);
  const [dateTo, setDateTo] = useState<Date | undefined>(undefined);

  useEffect(() => {
    fetchTestData();
  }, [courseId]);

  const fetchTestData = async () => {
    setIsLoading(true);
    try {
      const { data: lessons } = await supabase
        .from("lessons")
        .select("id, title")
        .eq("course_id", courseId)
        .eq("type", "test");

      if (!lessons || lessons.length === 0) {
        setTestData([]);
        setIsLoading(false);
        return;
      }

      const lessonIds = lessons.map(l => l.id);
      const lessonsMap = new Map(lessons.map(l => [l.id, l.title]));

      const { data: attempts } = await supabase
        .from("test_attempts")
        .select("id, user_id, lesson_id, score, max_score, completed_at, answers, shown_question_ids")
        .in("lesson_id", lessonIds)
        .order("completed_at", { ascending: false });

      if (!attempts || attempts.length === 0) {
        setTestData([]);
        setIsLoading(false);
        return;
      }

      const { data: questions } = await supabase
        .from("test_questions")
        .select("id, question, options, correct_answer")
        .in("lesson_id", lessonIds);

      if (questions) {
        const qMap = new Map<string, TestQuestion>();
        questions.forEach(q => {
          qMap.set(q.id, {
            id: q.id,
            question: q.question,
            options: Array.isArray(q.options) ? (q.options as unknown[]).map(normalizeOption) : [],
            correct_answer: q.correct_answer
          });
        });
        setQuestionsMap(qMap);
      }

      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, full_name, email")
        .eq("organization_id", organizationId);

      const profilesMap = new Map(
        (profiles || []).map(p => [p.user_id, { name: p.full_name || "Неизвестный", email: p.email || "" }])
      );

      const enrichedData: TestAttemptData[] = attempts.map(a => ({
        id: a.id,
        user_id: a.user_id,
        lesson_id: a.lesson_id,
        score: a.score,
        max_score: a.max_score,
        completed_at: a.completed_at,
        user_name: profilesMap.get(a.user_id)?.name || "Неизвестный",
        user_email: profilesMap.get(a.user_id)?.email || "",
        lesson_title: lessonsMap.get(a.lesson_id) || "Тест",
        answers: (a.answers as Record<string, number>) || {},
        shown_question_ids: (a.shown_question_ids as string[]) || []
      }));

      setTestData(enrichedData);
    } catch (error) {
      console.error("Error fetching test data:", error);
    } finally {
      setIsLoading(false);
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
    const passedCount = filteredData.filter(a => a.score >= a.max_score * 0.7).length;
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

  const getAttemptQuestionDetails = (attempt: TestAttemptData): QuestionDetail[] => {
    const questionIds = attempt.shown_question_ids.length > 0 ? attempt.shown_question_ids : Object.keys(attempt.answers);
    return questionIds.reduce<QuestionDetail[]>((acc, qId) => {
      const question = questionsMap.get(qId);
      if (question) {
        const selectedAnswer = attempt.answers[qId];
        acc.push({
          questionText: question.question,
          options: question.options,
          selectedAnswer: selectedAnswer ?? -1,
          correctAnswer: question.correct_answer,
          isCorrect: selectedAnswer === question.correct_answer
        });
      }
      return acc;
    }, []);
  };

  const handleExport = async () => {
    const XLSX = await import('xlsx');
    const summaryData = filteredData.map(a => {
      const details = getAttemptQuestionDetails(a);
      return {
        'ФИО': a.user_name, 'Email': a.user_email, 'Тест': a.lesson_title,
        'Баллы': a.score, 'Макс. баллы': a.max_score,
        'Процент': a.max_score > 0 ? Math.round((a.score / a.max_score) * 100) + '%' : '0%',
        'Результат': a.score >= a.max_score * 0.7 ? 'Пройден' : 'Не пройден',
        'Правильных': details.filter(d => d.isCorrect).length,
        'Неправильных': details.filter(d => !d.isCorrect).length,
        'Дата': new Date(a.completed_at).toLocaleString('ru-RU')
      };
    });

    const detailedData: Array<Record<string, string | number>> = [];
    const wrongAnswersData: Array<Record<string, string | number>> = [];

    filteredData.forEach(a => {
      const details = getAttemptQuestionDetails(a);
      details.forEach((d, idx) => {
        const row = {
          'ФИО': a.user_name, 'Тест': a.lesson_title,
          'Дата': new Date(a.completed_at).toLocaleString('ru-RU'),
          '№ вопроса': idx + 1,
          'Вопрос': d.questionText.replace(/<[^>]*>/g, '').substring(0, 500),
          'Ответ студента': d.selectedAnswer >= 0 && d.options[d.selectedAnswer]
            ? normalizeOption(d.options[d.selectedAnswer]).replace(/<[^>]*>/g, '').substring(0, 200) : 'Нет ответа',
          'Правильный ответ': d.options[d.correctAnswer]
            ? normalizeOption(d.options[d.correctAnswer]).replace(/<[^>]*>/g, '').substring(0, 200) : '',
          'Результат': d.isCorrect ? '✓ Верно' : '✗ Неверно'
        };
        detailedData.push(row);
        if (!d.isCorrect) {
          const { 'Результат': _, ...wrongRow } = row;
          wrongAnswersData.push(wrongRow);
        }
      });
    });

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summaryData), 'Сводка');
    if (detailedData.length > 0) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(detailedData), 'Все ответы');
    if (wrongAnswersData.length > 0) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(wrongAnswersData), 'Неправильные ответы');
    XLSX.writeFile(wb, `результаты_тестов_${courseName}_${new Date().toISOString().split('T')[0]}.xlsx`);
    toast.success('Результаты тестов с вопросами экспортированы');
  };

  return {
    testData, isLoading, expandedAttempts,
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
