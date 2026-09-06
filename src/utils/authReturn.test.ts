import { describe, it, expect } from 'vitest';
import { safeInternalNext, loginWithNext, organizationRegistrationTarget, isDrivingInvitationTarget } from './authReturn';
describe('common Auth return routes', () => {
  it('preserves internal deep links including school intent', () => {
    const path='/organization/driving-school?view=schedule#today';
    expect(safeInternalNext(path)).toBe(path);
    expect(new URL(loginWithNext(path),'https://internal.invalid').searchParams.get('next')).toBe(path);
  });
  it.each(['https://evil.test','//evil.test','/\\evil.test','/%5cevil.test','/%2f%2fevil.test','/x%0aLocation:evil','/login?next=/login','/register-organization','/%zz','/.//evil.test','/a/..//evil.test','/%2e//evil.test'])('rejects unsafe return %s', value => expect(safeInternalNext(value)).toBeNull());
  it('accepts only the fixed registration intent', () => {
    expect(organizationRegistrationTarget(new URLSearchParams('module=driving-school&next=https://evil.test'))).toBe('/organization/driving-school');
    expect(organizationRegistrationTarget(new URLSearchParams('next=%2Forganization%2Fdriving-school'))).toBe('/organization/driving-school');
    expect(organizationRegistrationTarget(new URLSearchParams('module=admin&next=/admin'))).toBe('/organization');
    expect(organizationRegistrationTarget(new URLSearchParams())).toBe('/organization');
  });
});

describe('driving invitation sign-in guidance',()=>{it('recognizes only a nonempty invitation in the internal scoped route',()=>{
 expect(isDrivingInvitationTarget('/driving-school?invite=synthetic-token')).toBe(true);
 expect(isDrivingInvitationTarget('/organization/driving-school')).toBe(false);
 expect(isDrivingInvitationTarget('/driving-school?invite=')).toBe(false);
 expect(isDrivingInvitationTarget('//evil.test/driving-school?invite=x')).toBe(false);
});});
