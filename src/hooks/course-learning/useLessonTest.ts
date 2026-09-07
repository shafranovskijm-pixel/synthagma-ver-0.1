import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { enqueueTestSubmission, isRetryableTestError } from "@/utils/testAnswerQueue";
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
interface Limits {
  maxAttempts: number | null;
  maxAttemptsPerDay: number | null;
  attemptsUsed: number;
  attemptsUsedToday: number;
  resetAt: string | null;
}
interface ActiveAttempt extends Limits {
  attemptId: string;
  status?: string;
  startedAt: string;
  questions: TestQuestion[];
  passingScore: number;
  showAnswers: boolean;
}
interface TestState extends Limits {
  hasAttempt: boolean;
  passed?: boolean | null;
  passingScore: number;
  showAnswers: boolean;
  activeAttempt: ActiveAttempt | null;
  manualCredit?: { creditedAt: string; creditedBy: string } | null;
  attempt?: { legacy?: boolean; score: number; max_score: number; answers: Record<string, number>; questions?: TestQuestion[]; question_snapshot?: TestQuestion[]; passing_score?: number };
  correctAnswers?: Record<string, number | null>;
  explanations?: Record<string, string | null>;
}
const emptyLimits: Limits = { maxAttempts: null, maxAttemptsPerDay: null, attemptsUsed: 0, attemptsUsedToday: 0, resetAt: null };
const withAnswerKey = (question: TestQuestion, keys?: Record<string, number | null>): TestQuestion =>
  keys && Object.prototype.hasOwnProperty.call(keys, question.id)
    ? { ...question, correct_answer: keys[question.id] }
    : question;
const rpc = async <T,>(name: string, args: Record<string, unknown>): Promise<T> => {
  const { data, error } = await supabase.rpc(name as never, args as never);
  if (error) throw error;
  if (data == null) throw new Error('Сервер не вернул состояние теста.');
  return data as T;
};
export function testErrorMessage(error: unknown): string {
  const message = (error as { message?: string })?.message || '';
  if (/test content invalid|no test questions available/i.test(message)) return 'В тесте некорректно настроены вопросы или варианты ответа. Попытка не списана. Обратитесь в учебную организацию.';
  if (/daily|per.day|суточн/i.test(message)) return 'На сегодня попытки закончились. Лимит обновится в 00:00 по Москве.';
  if (/exhaust|attempt.limit|попытк.*исчерп/i.test(message)) return 'Использованы все доступные попытки теста.';
  if (/manual|credit/i.test(message)) return 'Курс уже зачтён организацией. Обновите состояние теста.';
  return 'Не удалось выполнить действие с тестом. Проверьте соединение и повторите попытку.';
}
function readDraft(userId: string, attemptId: string): Record<string, number> {
  try { return JSON.parse(sessionStorage.getItem('test-draft:' + userId + ':' + attemptId) || '{}'); } catch { return {}; }
}
export function useLessonTest({ currentLesson, user, lessons, lessonProgress, setLessonProgress, saveLessonTime, handleCourseCompletion }: UseLessonTestParams) {
  const [testQuestions, setTestQuestions] = useState<TestQuestion[]>([]);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [testSubmitted, setTestSubmitted] = useState(false);
  const [testLegacy, setTestLegacy] = useState(false);
  const [testScore, setTestScore] = useState<{ score: number; max: number } | null>(null);
  const [testPassingScore, setTestPassingScore] = useState(60);
  const [testExplanations, setTestExplanations] = useState<Record<string, string | null>>({});
  const [limits, setLimits] = useState<Limits>(emptyLimits);
  const [testQuestionsLoading, setTestQuestionsLoading] = useState(false);
  const [testQuestionsError, setTestQuestionsError] = useState<string | null>(null);
  const [testSubmitting, setTestSubmitting] = useState(false);
  const [testAttemptId, setTestAttemptId] = useState<string | null>(null);
  const [testStartedAt, setTestStartedAt] = useState<string | null>(null);
  const [testShowAnswers, setTestShowAnswers] = useState(false);
  const [testManualCredit, setTestManualCredit] = useState<TestState['manualCredit']>(null);
  const scope = user?.id + ':' + currentLesson?.id;
  const scopeRef = useRef(scope); scopeRef.current = scope;
  const requestRef = useRef(0);
  const activeScopeRef = useRef<string | null>(null);
  const busyRef = useRef(false);
  const startRequestRef = useRef<string | null>(null);
  const lessonId = currentLesson?.type === 'test' ? currentLesson.id : null;

  const applyActive = (active: ActiveAttempt) => {
    activeScopeRef.current = scope; setTestLegacy(false);
    setTestAttemptId(active.attemptId); setTestStartedAt(active.startedAt);
    setTestQuestions(active.questions || []); setTestSubmitted(false); setTestScore(null);
    setTestPassingScore(active.passingScore); setTestShowAnswers(active.showAnswers);
    setAnswers(user ? readDraft(user.id, active.attemptId) : {});
    setLimits(active);
  };
  const refreshTestState = useCallback(async () => {
    if (!lessonId || !user) return;
    const expectedScope = scope; const request = ++requestRef.current;
    setTestQuestionsLoading(true); setTestQuestionsError(null);
    try {
      const data = await rpc<TestState>('get_student_test_state', { p_lesson_id: lessonId });
      if (scopeRef.current !== expectedScope || request !== requestRef.current) return;
      setLimits(data); setTestPassingScore(data.passingScore ?? 60); setTestShowAnswers(data.showAnswers === true);
      setTestManualCredit(data.manualCredit ?? null); setTestLegacy(data.attempt?.legacy === true && !data.manualCredit);
      setTestExplanations(data.explanations || {});
      if (data.manualCredit) {
        setTestSubmitted(true); setTestScore(null); setTestQuestions([]); setTestAttemptId(null);
        setLessonProgress(prev => [...prev.filter(p => p.lesson_id !== lessonId), { lesson_id: lessonId, completed: true }]);
      } else if (data.activeAttempt) {
        applyActive(data.activeAttempt);
      } else if (data.hasAttempt && data.attempt) {
        const attempt = data.attempt;
        setTestAttemptId(null); setTestSubmitted(true); setTestScore({ score: attempt.score, max: attempt.max_score });
        setAnswers(attempt.answers || {});
        if (attempt.passing_score != null) setTestPassingScore(attempt.passing_score);
        setTestQuestions((attempt.questions || attempt.question_snapshot || []).map(q => withAnswerKey(q, data.correctAnswers)));
      } else { setTestSubmitted(false); setTestQuestions([]); setTestScore(null); setTestAttemptId(null); }
      if (data.passed === true && !data.manualCredit) setLessonProgress(prev => [...prev.filter(p => p.lesson_id !== lessonId), { lesson_id: lessonId, completed: true }]);
      return data;
    } catch (error) {
      if (scopeRef.current === expectedScope && request === requestRef.current) setTestQuestionsError(testErrorMessage(error));
    } finally {
      if (scopeRef.current === expectedScope && request === requestRef.current) setTestQuestionsLoading(false);
    }
  }, [lessonId, user?.id, scope]);

  useEffect(() => {
    requestRef.current++; activeScopeRef.current = null; startRequestRef.current = null; busyRef.current = false;
    setTestSubmitted(false); setTestScore(null); setTestQuestions([]); setAnswers({}); setLimits(emptyLimits);
    setTestManualCredit(null); setTestLegacy(false); setTestAttemptId(null); setTestStartedAt(null); setTestExplanations({}); setTestSubmitting(false);
    setTestQuestionsError(null); setTestQuestionsLoading(!!lessonId);
    if (lessonId) void refreshTestState();
    return () => { requestRef.current++; };
  }, [scope, lessonId, refreshTestState]);
  useEffect(() => {
    if (!lessonId) return;
    const refresh = () => { if (!busyRef.current) void refreshTestState(); };
    window.addEventListener('focus', refresh);
    const synced = async () => {
      if (busyRef.current) return;
      const expectedScope = scope;
      const data = await refreshTestState();
      if (scopeRef.current !== expectedScope || !data?.passed || data.manualCredit || !data.attempt) return;
      if (lessons.every(l => l.id === lessonId || lessonProgress.some(p => p.lesson_id === l.id && p.completed))) {
        await handleCourseCompletion({ score: data.attempt.score, max: data.attempt.max_score });
      }
    };
    window.addEventListener('test-submission-synced', synced);
    const resetDelay = limits.resetAt ? Date.parse(limits.resetAt) - Date.now() + 1000 : 0;
    const timer = resetDelay > 0 ? window.setTimeout(refresh, Math.min(resetDelay, 2147483647)) : null;
    return () => { window.removeEventListener('focus', refresh); window.removeEventListener('test-submission-synced', synced); if (timer) window.clearTimeout(timer); };
  }, [lessonId, limits.resetAt, refreshTestState, lessons, lessonProgress, handleCourseCompletion, scope]);
  useEffect(() => {
    if (!user || !testAttemptId || testSubmitted || activeScopeRef.current !== scope) return;
    try { sessionStorage.setItem('test-draft:' + user.id + ':' + testAttemptId, JSON.stringify(answers)); } catch { /* Submission still works when storage is unavailable. */ }
  }, [answers, testAttemptId, testSubmitted, user?.id]);

  const startTest = async () => {
    if (!lessonId || !user || busyRef.current || testManualCredit) return;
    if (isAdminViewActive()) { toast.info('Начало теста недоступно в режиме просмотра администратора'); return; }
    const expectedScope = scope;
    requestRef.current++;
    busyRef.current = true; setTestQuestionsLoading(true); setTestQuestionsError(null);
    const requestId = startRequestRef.current ?? crypto.randomUUID(); startRequestRef.current = requestId;
    try {
      const active = await rpc<ActiveAttempt>('start_test_attempt', { p_lesson_id: lessonId, p_request_id: requestId });
      if (scopeRef.current !== expectedScope) return;
      if (active.status === "completed") await refreshTestState(); else applyActive(active);
      startRequestRef.current = null;
    } catch (error) { if (scopeRef.current === expectedScope) setTestQuestionsError(testErrorMessage(error)); }
    finally { if (scopeRef.current === expectedScope) { busyRef.current = false; setTestQuestionsLoading(false); } }
  };
  const submitTest = async () => {
    if (!lessonId || !user || !testAttemptId || busyRef.current || testSubmitted || testManualCredit) return;
    if (isAdminViewActive()) { toast.info('Отправка теста недоступна в режиме просмотра администратора'); return; }
    if (testQuestions.length === 0 || testQuestions.some(q => answers[q.id] == null)) { toast.error('Ответьте на все вопросы.'); return; }
    const expectedScope = scope; const attemptId = testAttemptId;
    requestRef.current++;
    busyRef.current = true; setTestSubmitting(true); setTestQuestionsLoading(false); setTestQuestionsError(null);
    try {
      const result = await rpc<Limits & { score: number; maxScore: number; scorePercent: number; passed: boolean; passingScore: number; showAnswers?: boolean; correctAnswers: Record<string, number | null>; explanations: Record<string, string | null> }>('submit_test_attempt', { p_attempt_id: attemptId, p_answers: answers });
      if (scopeRef.current !== expectedScope) return;
      setLimits(result); if (result.showAnswers !== undefined) setTestShowAnswers(result.showAnswers); setTestPassingScore(result.passingScore); setTestExplanations(result.explanations || {});
      setTestQuestions(prev => prev.map(q => withAnswerKey(q, result.correctAnswers)));
      setTestSubmitted(true); setTestAttemptId(null); setTestScore({ score: result.score, max: result.maxScore });
      try { sessionStorage.removeItem('test-draft:' + user.id + ':' + attemptId); } catch { /* optional cache */ }
      await saveLessonTime();
      if (scopeRef.current !== expectedScope) return;
      if (result.passed) {
        setLessonProgress(prev => [...prev.filter(p => p.lesson_id !== lessonId), { lesson_id: lessonId, completed: true }]);
        const complete = lessons.every(l => l.id === lessonId || lessonProgress.some(p => p.lesson_id === l.id && p.completed));
        if (complete) await handleCourseCompletion({ score: result.score, max: result.maxScore });
        else toast.success('Тест пройден! ' + result.score + '/' + result.maxScore + ' (' + result.scorePercent + '%)');
      } else toast.error('Тест не пройден. ' + result.scorePercent + '%. Нужно: ' + result.passingScore + '%.');
    } catch (error) {
      if (scopeRef.current !== expectedScope) return;
      if (isRetryableTestError(error)) {
        try {
          await enqueueTestSubmission({ attemptId, userId: user.id, lessonId, answers, shownQuestionIds: testQuestions.map(q => q.id) });
          toast.warning('Ответы сохранены на этом устройстве и будут отправлены при восстановлении соединения.');
        } catch { toast.error('Не удалось сохранить ответы на устройстве. Оставьте страницу открытой и повторите отправку.'); }
      } else toast.error(testErrorMessage(error));
    } finally { if (scopeRef.current === expectedScope) { busyRef.current = false; setTestSubmitting(false); } }
  };
  const testLimitReached = (limits.maxAttempts != null && limits.attemptsUsed >= limits.maxAttempts)
    || (limits.maxAttemptsPerDay != null && limits.attemptsUsedToday >= limits.maxAttemptsPerDay);
  return {
    testQuestions, allBankQuestions: testQuestions, answers, setAnswers, testSubmitted, testScore, testPassingScore, testExplanations,
    testMaxAttempts: limits.maxAttempts, testAttemptsUsed: limits.attemptsUsed,
    testMaxAttemptsPerDay: limits.maxAttemptsPerDay, testAttemptsUsedToday: limits.attemptsUsedToday, testResetAt: limits.resetAt,
    testQuestionsLoading, testQuestionsError, testLegacy, testSubmitting, testAttemptId, testStartedAt, testShowAnswers, testManualCredit, testLimitReached,
    submitTest, retryTest: startTest, startTest, refreshTestState,
  };
}
