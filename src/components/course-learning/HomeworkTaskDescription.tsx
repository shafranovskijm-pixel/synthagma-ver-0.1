import { sanitizeCourseHtml } from '@/lib/security/courseHtml';
import { cn } from '@/lib/utils';
import { MARKETPLACE_ORG_ID } from '@/constants/marketplace';

export interface HomeworkTaskScope {
  routeCourseId?: string;
  course?: { id: string; organization_id?: string | null } | null;
  lesson?: { id: string; course_id?: string | null } | null;
}

/** Presentation scope only; current source ownership and the loaded lesson must agree with the route. */
export function canRenderPlatformHomeworkHtml(scope: HomeworkTaskScope | undefined): boolean {
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return !!scope?.routeCourseId && uuid.test(scope.routeCourseId)
    && scope.course?.id === scope.routeCourseId
    && scope.course.organization_id === MARKETPLACE_ORG_ID
    && !!scope.lesson?.id && uuid.test(scope.lesson.id)
    && scope.lesson.course_id === scope.routeCourseId;
}

const educationalHtml = /<(?:h[1-6]|p|div|ul|ol|li|table|thead|tbody|tfoot|tr|th|td|br|blockquote|pre|strong|em|section|article)\b[^>]*>/i;

interface HomeworkTaskDescriptionProps {
  content: string | null;
  scope?: HomeworkTaskScope;
  className?: string;
  role?: 'document';
  'aria-label'?: string;
}

export function HomeworkTaskDescription({ content, scope, className, role, 'aria-label': ariaLabel }: HomeworkTaskDescriptionProps) {
  if (!content) return null;
  if (!canRenderPlatformHomeworkHtml(scope) || !educationalHtml.test(content)) {
    return <div role={role} aria-label={ariaLabel} className={className}>{content}</div>;
  }
  return <div
    role={role}
    aria-label={ariaLabel}
    className={cn(className, 'prose prose-sm max-w-none dark:prose-invert whitespace-normal break-words overflow-x-auto')}
    dangerouslySetInnerHTML={{ __html: sanitizeCourseHtml(content) }}
  />;
}
