/**
 * Ядро логики "завершить урок".
 *
 * Вынесено из useCourseLearningFacade для устранения гонки, из-за которой
 * прогресс не сохранялся при последовательном прохождении нескольких уроков
 * подряд с autoAdvance:
 *
 * - completedCount в замыкании ссылался на устаревший React-state и после
 *   первого autoAdvance давал тот же процент прогресса, что и раньше;
 * - параллельные клики создавали дублирующие запросы;
 * - autoAdvance/toast срабатывали даже при ошибках БД.
 *
 * Функция принимает мутируемый state (переданный из ref'ов hook'а)
 * и адаптеры БД, поэтому легко тестируется без сети и React-состояния.
 */

export interface MarkLessonDeps {
  saveLessonTime: () => Promise<void>;
  upsertLessonProgress: (lessonId: string, userId: string) => Promise<{ error: unknown | null }>;
  updateEnrollmentProgress: (enrollmentId: string, progress: number) => Promise<{ error: unknown | null }>;
  /** true только после подтверждённого перевода enrollment в completed. */
  handleCourseCompletion: () => Promise<boolean>;
  goToNextLesson: () => void;
  /**
   * Вызывается ПОСЛЕ успешной записи lesson_progress и enrollments.
   * hook использует callback для обновления React-состояния прогресса.
   */
  onProgressUpdated: (completedIds: string[], progressPercent: number) => void;
  toastSuccess: (msg: string) => void;
  toastError: (msg: string) => void;
}

export interface MarkLessonState {
  /** Мутируемый Set: lesson_id, для которых сейчас идёт запись (мьютекс). */
  inFlight: Set<string>;
  /** Мутируемый Set: lesson_id всех уроков, помеченных как завершённые. */
  completed: Set<string>;
  /** Флаг, что handleCourseCompletion уже запущен (защита от повторного вызова). */
  courseCompletionStarted: { value: boolean };
  /** Отдельный серверно подтверждённый статус; started не равен completed. */
  courseCompletionConfirmed: { value: boolean };
}

export interface MarkLessonInput {
  lessonId: string;
  userId: string;
  enrollmentId: string | null;
  totalLessons: number;
  autoAdvance: boolean;
  state: MarkLessonState;
  deps: MarkLessonDeps;
}

export type MarkLessonOutcome =
  | {
      ok: true;
      progress: number;
      /** true, если это первое успешное завершение этого урока в текущей сессии. */
      completed: boolean;
      alreadyCompleted?: boolean;
      skipped?: boolean;
      courseCompleted?: boolean;
    }
  | {
      ok: false;
      reason: "progress_save_failed" | "enrollment_update_failed" | "no_enrollment" | "course_completion_failed";
      /** Прогресс уроков уже сохранён, но завершение enrollment не подтверждено. */
      progress?: number;
      lessonCompleted?: boolean;
    };

function percentOf(count: number, total: number): number {
  if (total <= 0) return 0;
  return Math.min(Math.round((count / total) * 100), 100);
}

export async function markLessonProgress(input: MarkLessonInput): Promise<MarkLessonOutcome> {
  const { lessonId, userId, enrollmentId, totalLessons, autoAdvance, state, deps } = input;

  // Мьютекс: параллельный клик по этому же уроку не создаёт дублирующие запросы.
  if (state.inFlight.has(lessonId)) {
    return {
      ok: true,
      progress: percentOf(state.completed.size, totalLessons),
      completed: false,
      skipped: true,
    };
  }

  // Урок уже завершён — не увеличиваем прогресс, но всё равно двигаемся дальше.
  if (state.completed.has(lessonId)) {
    const progress = percentOf(state.completed.size, totalLessons);
    if (progress >= 100 && state.courseCompletionConfirmed.value) {
      if (autoAdvance) deps.goToNextLesson();
      return { ok: true, progress, completed: false, alreadyCompleted: true, courseCompleted: true };
    }
    // Последний урок мог сохраниться, а серверное завершение курса — временно
    // упасть или быть отклонено лимитом. Повторный клик должен повторить именно
    // завершение enrollment, а не навсегда уходить в alreadyCompleted.
    if (progress >= 100 && !state.courseCompletionStarted.value) {
      state.courseCompletionStarted.value = true;
      try {
        const confirmed = await deps.handleCourseCompletion();
        if (!confirmed) {
          state.courseCompletionStarted.value = false;
          return { ok: false, reason: "course_completion_failed", progress, lessonCompleted: true };
        }
        state.courseCompletionConfirmed.value = true;
      } catch (e) {
        console.error("[markLessonProgress] handleCourseCompletion threw", e);
        state.courseCompletionStarted.value = false;
        return { ok: false, reason: "course_completion_failed", progress, lessonCompleted: true };
      }
      if (autoAdvance) deps.goToNextLesson();
      return { ok: true, progress, completed: false, alreadyCompleted: true, courseCompleted: true };
    }
    if (progress < 100) {
      if (autoAdvance) deps.goToNextLesson();
      return { ok: true, progress, completed: false, alreadyCompleted: true, courseCompleted: false };
    }
    // started=true означает только выполняющийся запрос. До server-confirmed
    // результата не двигаем UI дальше и не сообщаем о завершении.
    return {
      ok: true,
      progress,
      completed: false,
      alreadyCompleted: true,
      courseCompleted: false,
      skipped: progress >= 100 && state.courseCompletionStarted.value,
    };
  }

  state.inFlight.add(lessonId);
  try {
    await deps.saveLessonTime();

    const { error: progressErr } = await deps.upsertLessonProgress(lessonId, userId);
    if (progressErr) {
      console.error("[markLessonProgress] lesson_progress upsert failed", progressErr);
      deps.toastError("Ошибка сохранения прогресса. Попробуйте ещё раз.");
      return { ok: false, reason: "progress_save_failed" };
    }

    // Прогресс считаем по актуальному Set-у, а не по устаревшему completedCount.
    const projected = state.completed.size + 1;
    const progress = percentOf(projected, totalLessons);

    if (!enrollmentId) {
      // Без enrollment мы не можем персистить прогресс курса.
      deps.toastError("Не удалось определить запись на курс.");
      return { ok: false, reason: "no_enrollment" };
    }

    const { error: enrollErr } = await deps.updateEnrollmentProgress(enrollmentId, progress);
    if (enrollErr) {
      console.error("[markLessonProgress] enrollments update failed", enrollErr);
      deps.toastError("Не удалось обновить прогресс курса. Попробуйте ещё раз.");
      return { ok: false, reason: "enrollment_update_failed" };
    }

    // Коммитим состояние только после успешной записи обеих таблиц.
    state.completed.add(lessonId);
    deps.onProgressUpdated(Array.from(state.completed), progress);

    if (progress >= 100) {
      // Защита от параллельного повторного запуска handleCourseCompletion.
      if (!state.courseCompletionStarted.value) {
        state.courseCompletionStarted.value = true;
        try {
          const confirmed = await deps.handleCourseCompletion();
          if (!confirmed) {
            state.courseCompletionStarted.value = false;
            return { ok: false, reason: "course_completion_failed", progress, lessonCompleted: true };
          }
          state.courseCompletionConfirmed.value = true;
        } catch (e) {
          console.error("[markLessonProgress] handleCourseCompletion threw", e);
          // Разрешаем повторную попытку завершения.
          state.courseCompletionStarted.value = false;
          return { ok: false, reason: "course_completion_failed", progress, lessonCompleted: true };
        }
      }
    } else {
      deps.toastSuccess("Урок завершён!");
    }

    if (progress >= 100 && !state.courseCompletionConfirmed.value) {
      return { ok: false, reason: "course_completion_failed", progress, lessonCompleted: true };
    }
    if (autoAdvance) deps.goToNextLesson();
    return { ok: true, progress, completed: true, courseCompleted: progress >= 100 && state.courseCompletionConfirmed.value };
  } finally {
    state.inFlight.delete(lessonId);
  }
}
