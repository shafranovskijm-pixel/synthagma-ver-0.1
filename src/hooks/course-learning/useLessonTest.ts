import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { safeInvoke } from "@/utils/safeInvoke";
import { enqueueTestSubmission } from "@/utils/testAnswerQueue";
import { toast } from "sonner";
import { isAdminViewActive } from "@/utils/adminViewMode";
import type { Lesson, LessonProgress, TestQuestion } from "./types";

interface UseLessonTestParams {
  currentLesson: Lesson | undefined;
  user: { id: string } | null;
  lessons: Lesson[];
  lessonProgress: LessonProgress[];
  completedCount: number;
  enrollmentId: string | null;
  courseId: string | undefined;
  course: { title: string; duration: string | null } | null;
  setLessonProgress: React.Dispatch<React.SetStateAction<LessonProgress[]>>;
  saveLessonTime: () => Promise<void>;
  handleCourseCompletion: (testScore?: { score: number; max: number }) => Promise<void>;
}

export function useLessonTest({
  currentLesson, user, lessons, lessonProgress, completedCount,
  enrollmentId, courseId, course, setLessonProgress, saveLessonTime, handleCourseCompletion,
}: UseLessonTestParams) {
  const [testQuestions, setTestQuestions] = useState<TestQuestion[]>([]);
  const [allBankQuestions, setAllBankQuestions] = useState<TestQuestion[]>([]);
  const [usedQuestionIds, setUsedQuestionIds] = useState<string[]>([]);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [testSubmitted, setTestSubmitted] = useState(false);
  const [testScore, setTestScore] = useState<{ score: number; max: number } | null>(null);
  const [testQuestionsCount, setTestQuestionsCount] = useState<number | null>(null);
  const [testPassingScore, setTestPassingScore] = useState<number>(60);
  const [testExplanations, setTestExplanations] = useState<Record<string, string | null>>({});

  useEffect(() => {
    setTestSubmitted(false); setTestScore(null); setTestQuestions([]); setAnswers({});
    if (currentLesson?.type === 'test') fetchTestQuestions(currentLesson.id);
  }, [currentLesson?.id]);

  const selectRandomQuestions = (allQuestions: TestQuestion[], count: number | null, excludeIds: string[]) => {
    if (count === null || count <= 0 || count >= allQuestions.length) {
      setTestQuestions([...allQuestions].sort(() => Math.random() - 0.5));
      return;
    }
    let availableQuestions = allQuestions.filter(q => !excludeIds.includes(q.id));
    if (availableQuestions.length < count) availableQuestions = allQuestions;
    const shuffled = [...availableQuestions].sort(() => Math.random() - 0.5);
    setTestQuestions(shuffled.slice(0, Math.min(count, shuffled.length)));
  };

  const fetchTestQuestions = async (lessonId: string) => {
    const { data: lessonData } = await supabase.from('lessons').select('test_questions_to_show, test_passing_score').eq('id', lessonId).single();
    const questionsToShow = (lessonData as Record<string, unknown>)?.test_questions_to_show as number | null ?? null;
    const passingScore = (lessonData as Record<string, unknown>)?.test_passing_score as number ?? 60;
    setTestQuestionsCount(questionsToShow);
    setTestPassingScore(passingScore);

    const { data, error } = await supabase.from('test_questions_for_students').select('*').eq('lesson_id', lessonId).order('order_index');
    if (error) { console.error('Error fetching questions:', error); return; }
    const allQuestions = (data || []) as TestQuestion[];
    setAllBankQuestions(allQuestions);

    try {
      const { data: resultsData, error: resultsError } = await safeInvoke<{
        hasAttempt?: boolean;
        attempt?: { score: number; max_score: number; answers: Record<string, number>; shown_question_ids: string[] };
        correctAnswers?: Record<string, number>;
        explanations?: Record<string, string | null>;
        usedQuestionIds?: string[];
      }>('get-test-results', { body: { lesson_id: lessonId } });

      if (resultsError) { selectRandomQuestions(allQuestions, questionsToShow, []); setUsedQuestionIds([]); setAnswers({}); return; }

      if (resultsData?.hasAttempt && resultsData.attempt) {
        const { attempt, correctAnswers, explanations, usedQuestionIds: allUsedIds } = resultsData;
        if (explanations) setTestExplanations(explanations);
        setTestSubmitted(true);
        setTestScore({ score: attempt.score, max: attempt.max_score });
        setAnswers(attempt.answers || {});
        setUsedQuestionIds(allUsedIds || []);
        const shownIds = attempt.shown_question_ids || [];
        if (shownIds.length > 0) {
          setTestQuestions(allQuestions.filter(q => shownIds.includes(q.id)).map(q => ({ ...q, correct_answer: correctAnswers?.[q.id] ?? q.correct_answer })));
        } else {
          setTestQuestions(allQuestions);
        }
      } else {
        selectRandomQuestions(allQuestions, questionsToShow, []);
        setUsedQuestionIds([]); setAnswers({});
      }
    } catch {
      selectRandomQuestions(allQuestions, questionsToShow, []);
      setUsedQuestionIds([]); setAnswers({});
    }
  };

  const submitTest = async () => {
    if (!currentLesson || !user) return;
    if (isAdminViewActive()) {
      toast.info('Отправка теста недоступна в режиме просмотра администратора');
      return;
    }
    if (testQuestions.length === 0) { toast.error('Нет вопросов для теста.'); return; }
    await saveLessonTime();
    const shownIds = testQuestions.map(q => q.id);
    try {
      const { data: gradeResult, error: gradeError } = await safeInvoke<{
        score: number; maxScore: number; scorePercent: number; passed: boolean;
        correctAnswers: Record<string, number>; explanations?: Record<string, string | null>;
      }>('grade-test', { body: { lesson_id: currentLesson.id, answers, shown_question_ids: shownIds } });
      if (gradeError || !gradeResult) {
        // Fallback: ставим в очередь, чтобы при восстановлении сети ответ ушёл.
        // Это спасает учеников за корпоративным firewall, у которых edge-функции не открываются.
        await enqueueTestSubmission({ lessonId: currentLesson.id, answers, shownQuestionIds: shownIds });
        toast.warning('Ответы сохранены. Тест будет отправлен автоматически при восстановлении соединения.', { duration: 8000 });
        return;
      }
      const { score, maxScore, scorePercent, passed, correctAnswers, explanations } = gradeResult;
      if (explanations) setTestExplanations(explanations);
      setTestQuestions(testQuestions.map(q => ({ ...q, correct_answer: correctAnswers[q.id] ?? q.correct_answer })));
      setTestSubmitted(true);
      setTestScore({ score, max: maxScore });
      if (passed) {
        setLessonProgress(prev => [...prev.filter(p => p.lesson_id !== currentLesson.id), { lesson_id: currentLesson.id, completed: true }]);
        const newProgress = Math.min(Math.round(((completedCount + 1) / lessons.length) * 100), 100);
        await supabase.from('enrollments').update({ progress: newProgress }).eq('id', enrollmentId);
        if (newProgress >= 100) { await handleCourseCompletion({ score, max: maxScore }); } else { toast.success(`Тест пройден! ${score}/${maxScore} (${scorePercent}%)`); }
      } else {
        toast.error(`Тест не пройден. ${score}/${maxScore} (${scorePercent}%). Нужно: ${testPassingScore}%.`);
      }
    } catch (err) {
      console.error('Error submitting test:', err);
      // Сохраняем в очередь даже при необработанном исключении
      try {
        await enqueueTestSubmission({ lessonId: currentLesson.id, answers, shownQuestionIds: shownIds });
        toast.warning('Ответы сохранены. Тест будет отправлен автоматически при восстановлении соединения.', { duration: 8000 });
      } catch {
        toast.error('Ошибка отправки теста');
      }
    }
  };

  const retryTest = () => {
    const newUsedIds = [...usedQuestionIds, ...testQuestions.map(q => q.id)];
    setUsedQuestionIds(newUsedIds);
    selectRandomQuestions(allBankQuestions, testQuestionsCount, newUsedIds);
    setAnswers({}); setTestSubmitted(false); setTestScore(null);
  };

  return {
    testQuestions, allBankQuestions, answers, setAnswers,
    testSubmitted, testScore, testPassingScore, testExplanations,
    submitTest, retryTest,
  };
}
