import { useState, useEffect, useRef } from "react";
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
  handleCourseCompletion: (testScore?: { score: number; max: number }) => Promise<boolean>;
  /** Проверяет, что async-операция всё ещё относится к открытому course route. */
  isCurrentContext: () => boolean;
}

export function useLessonTest({
  currentLesson, user, lessons, lessonProgress, completedCount,
  enrollmentId, courseId, course, setLessonProgress, saveLessonTime, handleCourseCompletion,
  isCurrentContext,
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
  const [testMaxAttempts, setTestMaxAttempts] = useState<number | null>(null);
  const [testAttemptsUsed, setTestAttemptsUsed] = useState<number>(0);
  const [testQuestionsLoading, setTestQuestionsLoading] = useState(false);
  const [testQuestionsError, setTestQuestionsError] = useState<string | null>(null);
  const testQuestionRequestRef = useRef(0);
  const testSubmissionRequestRef = useRef(0);
  const activeTestLessonIdRef = useRef<string | null>(null);
  activeTestLessonIdRef.current = currentLesson?.id ?? null;

  useEffect(() => {
    const requestId = ++testQuestionRequestRef.current;
    testSubmissionRequestRef.current += 1;
    setTestSubmitted(false); setTestScore(null); setTestQuestions([]); setAnswers({});
    setAllBankQuestions([]); setUsedQuestionIds([]); setTestExplanations({});
    setTestMaxAttempts(null); setTestAttemptsUsed(0);
    setTestQuestionsError(null);
    setTestQuestionsLoading(currentLesson?.type === 'test');
    if (currentLesson?.type === 'test') void fetchTestQuestions(currentLesson.id, requestId);
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

  const fetchTestQuestions = async (lessonId: string, requestId: number) => {
    const isCurrentRequest = () => testQuestionRequestRef.current === requestId;
    try {
      const { data: lessonData, error: lessonError } = await supabase.from('lessons').select('test_questions_to_show, test_passing_score').eq('id', lessonId).single();
      if (!isCurrentRequest()) return;
      if (lessonError) throw lessonError;
      const questionsToShow = (lessonData as Record<string, unknown>)?.test_questions_to_show as number | null ?? null;
      const passingScore = (lessonData as Record<string, unknown>)?.test_passing_score as number ?? 60;
      setTestQuestionsCount(questionsToShow);
      setTestPassingScore(passingScore);

      const { data, error } = await supabase.rpc(
        'get_student_test_questions' as never,
        { p_lesson_id: lessonId } as never,
      );
      if (!isCurrentRequest()) return;
      if (error) throw error;
      const allQuestions = (data || []) as TestQuestion[];
      setAllBankQuestions(allQuestions);
      if (allQuestions.length === 0) {
        setTestQuestionsError('В этом тесте пока нет доступных вопросов. Обратитесь в учебную организацию.');
        return;
      }

      const { data: resultsData, error: resultsError } = await safeInvoke<{
        hasAttempt?: boolean;
        attempt?: { score: number; max_score: number; answers: Record<string, number>; shown_question_ids: string[] };
        correctAnswers?: Record<string, number>;
        explanations?: Record<string, string | null>;
        usedQuestionIds?: string[];
        maxAttempts?: number | null;
        attemptsUsed?: number;
      }>('get-test-results', { body: { lesson_id: lessonId } });
      if (!isCurrentRequest()) return;

      if (resultsData) {
        setTestMaxAttempts(resultsData.maxAttempts ?? null);
        setTestAttemptsUsed(resultsData.attemptsUsed ?? 0);
      }

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
    } catch (error) {
      if (!isCurrentRequest()) return;
      console.error('Error fetching test questions:', error);
      setTestQuestions([]);
      setAllBankQuestions([]);
      setTestQuestionsError('Не удалось загрузить вопросы. Проверьте соединение и повторите попытку.');
    } finally {
      if (isCurrentRequest()) setTestQuestionsLoading(false);
    }
  };

  const submitTest = async () => {
    if (!currentLesson || !user) return;
    if (isAdminViewActive()) {
      toast.info('Отправка теста недоступна в режиме просмотра администратора');
      return;
    }
    if (testQuestions.length === 0) { toast.error('Нет вопросов для теста.'); return; }
    const submissionId = ++testSubmissionRequestRef.current;
    const submissionLessonId = currentLesson.id;
    const isCurrentSubmission = () => (
      testSubmissionRequestRef.current === submissionId
      && activeTestLessonIdRef.current === submissionLessonId
      && isCurrentContext()
    );
    await saveLessonTime();
    if (!isCurrentSubmission()) return;
    const shownIds = testQuestions.map(q => q.id);
    try {
      const { data: gradeResult, error: gradeError } = await safeInvoke<{
        score: number; maxScore: number; scorePercent: number; passed: boolean;
        correctAnswers: Record<string, number>; explanations?: Record<string, string | null>;
        maxAttempts?: number | null; attemptsUsed?: number;
      }>('grade-test', { body: { lesson_id: currentLesson.id, answers, shown_question_ids: shownIds } });
      if (!isCurrentSubmission()) return;
      if (gradeError || !gradeResult) {
        // Fallback: ставим в очередь, чтобы при восстановлении сети ответ ушёл.
        // Это спасает учеников за корпоративным firewall, у которых edge-функции не открываются.
        await enqueueTestSubmission({ lessonId: submissionLessonId, answers, shownQuestionIds: shownIds });
        if (!isCurrentSubmission()) return;
        toast.warning('Ответы сохранены. Тест будет отправлен автоматически при восстановлении соединения.', { duration: 8000 });
        return;
      }
      const { score, maxScore, scorePercent, passed, correctAnswers, explanations, maxAttempts, attemptsUsed } = gradeResult;
      if (explanations) setTestExplanations(explanations);
      if (maxAttempts !== undefined) setTestMaxAttempts(maxAttempts ?? null);
      if (attemptsUsed !== undefined) setTestAttemptsUsed(attemptsUsed);
      setTestQuestions(testQuestions.map(q => ({ ...q, correct_answer: correctAnswers[q.id] ?? q.correct_answer })));
      setTestSubmitted(true);
      setTestScore({ score, max: maxScore });
      if (passed) {
        setLessonProgress(prev => [...prev.filter(p => p.lesson_id !== submissionLessonId), { lesson_id: submissionLessonId, completed: true }]);
        const newProgress = Math.min(Math.round(((completedCount + 1) / lessons.length) * 100), 100);
        if (newProgress >= 100) {
          if (isCurrentSubmission()) await handleCourseCompletion({ score, max: maxScore });
        } else if (isCurrentSubmission()) {
          toast.success(`Тест пройден! ${score}/${maxScore} (${scorePercent}%)`);
        }
      } else {
        toast.error(`Тест не пройден. ${score}/${maxScore} (${scorePercent}%). Нужно: ${testPassingScore}%.`);
      }
    } catch (err) {
      if (!isCurrentSubmission()) return;
      console.error('Error submitting test:', err);
      // Сохраняем в очередь даже при необработанном исключении
      try {
        await enqueueTestSubmission({ lessonId: submissionLessonId, answers, shownQuestionIds: shownIds });
        if (!isCurrentSubmission()) return;
        toast.warning('Ответы сохранены. Тест будет отправлен автоматически при восстановлении соединения.', { duration: 8000 });
      } catch {
        if (isCurrentSubmission()) toast.error('Ошибка отправки теста');
      }
    }
  };

  const retryTest = () => {
    if (testMaxAttempts && testMaxAttempts > 0 && testAttemptsUsed >= testMaxAttempts) {
      toast.error(`Использованы все попытки (${testAttemptsUsed}/${testMaxAttempts})`);
      return;
    }
    const newUsedIds = [...usedQuestionIds, ...testQuestions.map(q => q.id)];
    setUsedQuestionIds(newUsedIds);
    selectRandomQuestions(allBankQuestions, testQuestionsCount, newUsedIds);
    setAnswers({}); setTestSubmitted(false); setTestScore(null);
  };

  return {
    testQuestions, allBankQuestions, answers, setAnswers,
    testSubmitted, testScore, testPassingScore, testExplanations,
    testMaxAttempts, testAttemptsUsed,
    testQuestionsLoading, testQuestionsError,
    submitTest, retryTest,
  };
}
