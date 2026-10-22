import {describe,expect,it} from 'vitest';
import {isStudentAssignmentQuotaError,studentAssignmentQuotaFailure} from '../../functions/_shared/course-quota-error';
import {STUDENT_ASSIGNMENT_QUOTA_ERROR_CODE} from '../../functions/_shared/student-quota-rules';
describe('Student assignment quota error contract',()=>{
 it('recognizes stable PostgreSQL detail and the legacy code message',()=>{
  expect(isStudentAssignmentQuotaError({code:'P0001',message:'Месячный лимит назначений достигнут',details:STUDENT_ASSIGNMENT_QUOTA_ERROR_CODE})).toBe(true);
  expect(isStudentAssignmentQuotaError({message:STUDENT_ASSIGNMENT_QUOTA_ERROR_CODE})).toBe(true);
  expect(studentAssignmentQuotaFailure.code).toBe('STUDENT_LIMIT_EXCEEDED');
  expect(studentAssignmentQuotaFailure.quota_code).toBe(STUDENT_ASSIGNMENT_QUOTA_ERROR_CODE);
 });
 it('does not misclassify other database errors or transport failures as quota',()=>{
  for(const error of [null,undefined,'P0001',{code:'P0001',message:'Different business rule'},{code:'23505',message:'duplicate key'},{details:'prefix '+STUDENT_ASSIGNMENT_QUOTA_ERROR_CODE},{message:'Failed to fetch'}])expect(isStudentAssignmentQuotaError(error)).toBe(false);
 });
});
