import { STUDENT_ASSIGNMENT_QUOTA_ERROR_CODE, STUDENT_ASSIGNMENT_QUOTA_LIMIT_MESSAGE } from './student-quota-rules.ts';

/** Match the stable DB detail, never an unrelated P0001 or network failure. */
export function isStudentAssignmentQuotaError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const value = error as { details?: unknown; message?: unknown };
  return value.details === STUDENT_ASSIGNMENT_QUOTA_ERROR_CODE || value.message === STUDENT_ASSIGNMENT_QUOTA_ERROR_CODE;
}
export const studentAssignmentQuotaFailure = {
  code: 'STUDENT_LIMIT_EXCEEDED',
  quota_code: STUDENT_ASSIGNMENT_QUOTA_ERROR_CODE,
  message: STUDENT_ASSIGNMENT_QUOTA_LIMIT_MESSAGE,
} as const;
