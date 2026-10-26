import { sanitizeCourseHtml } from '@/lib/security/courseHtml';
import { cn } from '@/lib/utils';
import { MARKETPLACE_ORG_ID } from '@/constants/marketplace';

export interface HomeworkTaskScope {
  routeCourseId?: string;
  course?: { id: string; organization_id?: string | null } | null;
  lesson?: { id: string; course_id?: string | null } | null;
  actorId?: string | null;
  actorRevision?: number | null;
  contextLease?: object;
}

export interface VerifiedHomeworkTaskProof {
  status: 'verified';
  courseId: string;
  lessonId: string;
  organizationId: string;
  actorId: string;
  actorRevision: number;
  contentSha256: string;
  policyId: string;
  rawContent: string;
  lease: object;
  expiresAt: number;
}

/** Presentation scope only; current source ownership and the loaded lesson must agree with the route. */
export function canRenderPlatformHomeworkHtml(scope: HomeworkTaskScope | undefined, proof?: VerifiedHomeworkTaskProof | null, content?: string | null): boolean {
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const exactLoadedScope = !!scope?.routeCourseId && uuid.test(scope.routeCourseId)
    && scope.course?.id === scope.routeCourseId
    && !!scope.lesson?.id && uuid.test(scope.lesson.id)
    && scope.lesson.course_id === scope.routeCourseId;
  if (!exactLoadedScope || !scope) return false;
  // The existing direct current platform-owner path remains unchanged.
  if (scope.course?.organization_id === MARKETPLACE_ORG_ID) return true;
  // Lineage/source_course_id alone is never presentation proof. This lease is
  // produced only after the parent hook verifies the exact RPC and raw UTF-8 hash.
  return !!proof && proof.status === 'verified' && typeof content === 'string'
    && !!scope.course?.organization_id && uuid.test(scope.course.organization_id)
    && !!scope.actorId && uuid.test(scope.actorId)
    && scope.actorRevision != null && scope.contextLease != null
    && proof.lease === scope.contextLease && proof.actorRevision === scope.actorRevision
    && proof.actorId === scope.actorId && proof.courseId === scope.routeCourseId
    && proof.lessonId === scope.lesson?.id && proof.organizationId === scope.course.organization_id
    && uuid.test(proof.policyId) && /^[0-9a-f]{64}$/.test(proof.contentSha256)
    && proof.rawContent === content && proof.expiresAt > Date.now();
}

const educationalHtml = /<(?:h[1-6]|p|div|ul|ol|li|table|thead|tbody|tfoot|tr|th|td|br|blockquote|pre|strong|em|section|article)\b[^>]*>/i;

interface HomeworkTaskDescriptionProps {
  content: string | null;
  scope?: HomeworkTaskScope;
  proof?: VerifiedHomeworkTaskProof | null;
  className?: string;
  role?: 'document';
  'aria-label'?: string;
}

export function HomeworkTaskDescription({ content, scope, proof, className, role, 'aria-label': ariaLabel }: HomeworkTaskDescriptionProps) {
  if (!content) return null;
  if (!canRenderPlatformHomeworkHtml(scope, proof, content) || !educationalHtml.test(content)) {
    return <div role={role} aria-label={ariaLabel} className={className}>{content}</div>;
  }
  return <div
    role={role}
    aria-label={ariaLabel}
    className={cn(className, 'prose prose-sm max-w-none dark:prose-invert whitespace-normal break-words overflow-x-auto')}
    dangerouslySetInnerHTML={{ __html: sanitizeCourseHtml(content) }}
  />;
}
