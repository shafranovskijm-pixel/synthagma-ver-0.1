export interface HomeworkContext {
  organizationId: string;
  courseId: string;
  lessonId: string;
  userId: string;
}

export interface PreparedHomeworkReport extends HomeworkContext {
  text: string;
  revision: number;
}

export const HOMEWORK_TEXT_LIMIT = 200_000;

// Route and loaded state can change at different times. Never construct a
// submission context from a course and lesson that have not caught up together.
export function resolveHomeworkContext(
  routeCourseId: string | undefined,
  course: { id: string; organization_id?: string | null } | null | undefined,
  lesson: { id: string; course_id?: string | null } | null | undefined,
  userId: string | undefined,
  readOnly = false,
): HomeworkContext | null {
  if (readOnly || !routeCourseId || !userId || !course?.organization_id || !lesson?.id
    || course.id !== routeCourseId || lesson.course_id !== routeCourseId) return null;
  return { organizationId: course.organization_id, courseId: routeCourseId, lessonId: lesson.id, userId };
}

export function homeworkContextKey(context: HomeworkContext): string {
  return JSON.stringify([context.organizationId, context.courseId, context.lessonId, context.userId]);
}

// This checks transfer context, not authorship, correctness or an assessment result.
export function isReportForContext(report: PreparedHomeworkReport | undefined, context: HomeworkContext): boolean {
  return !!report && Object.values(context).every(value => typeof value === 'string' && value.length > 0)
    && homeworkContextKey(report) === homeworkContextKey(context)
    && typeof report.text === 'string' && report.text.trim().length > 0
    && report.text.length <= HOMEWORK_TEXT_LIMIT
    && Number.isSafeInteger(report.revision) && report.revision > 0;
}
