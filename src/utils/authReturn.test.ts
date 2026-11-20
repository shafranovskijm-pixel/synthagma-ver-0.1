import { describe, it, expect } from 'vitest';
import { safeInternalNext, loginWithNext, organizationRegistrationTarget, organizationRegistrationHref, courseCatalogRegistrationTarget, isDrivingInvitationTarget } from './authReturn';
import { rtnWorkspaceHref } from '@/lib/rtnWorkspaceNavigation';
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

describe('RTN organization registration return intent', () => {
  const event = 'bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb';

  it('retains the exact supported RTN event through login and organization registration', () => {
    const destination = rtnWorkspaceHref({ view: 'changes', eventId: event });
    const login = new URL(loginWithNext(destination), 'https://internal.invalid');
    const registrationHref = organizationRegistrationHref(login.searchParams);
    const registration = new URL(registrationHref, 'https://internal.invalid');
    expect(registration.pathname).toBe('/register-organization');
    expect(organizationRegistrationTarget(registration.searchParams)).toBe(destination);
  });

  it('rejects duplicated return intentions and RTN foreign-scope selectors', () => {
    const target = rtnWorkspaceHref({ view: 'sources' });
    expect(organizationRegistrationTarget(new URLSearchParams({ next: target + '&organizationId=foreign' }))).toBe('/organization');
    expect(organizationRegistrationTarget(new URLSearchParams([['next', target], ['next', '/admin']]))).toBe('/organization');
    expect(organizationRegistrationTarget(new URLSearchParams({ next: target + '&rtnView=training' }))).toBe('/organization');
  });

  it('preserves the existing catalogue and driving-school registration contracts', () => {
    const courseId = 'CCCCCCCC-3333-4333-8333-CCCCCCCCCCCC';
    const catalog = `/organization?tab=services&catalogCourseId=${courseId}`;
    const canonicalCatalog = `/organization?tab=services&catalogCourseId=${courseId.toLowerCase()}`;
    expect(courseCatalogRegistrationTarget(catalog)).toBe(canonicalCatalog);
    expect(organizationRegistrationTarget(new URLSearchParams({ next: catalog }))).toBe(canonicalCatalog);
    expect(organizationRegistrationHref(new URLSearchParams({ module: 'driving-school', next: rtnWorkspaceHref() }))).toBe('/register-organization?module=driving-school');
    expect(organizationRegistrationTarget(new URLSearchParams({ next: '/organization/driving-school' }))).toBe('/organization/driving-school');
  });

  it('does not widen the catalogue-only helper or allow unrelated organization routes', () => {
    expect(courseCatalogRegistrationTarget(rtnWorkspaceHref())).toBeNull();
    expect(organizationRegistrationTarget(new URLSearchParams({ next: '/organization?tab=documents' }))).toBe('/organization');
    expect(organizationRegistrationTarget(new URLSearchParams({ next: '/admin' }))).toBe('/organization');
  });
});

describe('driving invitation sign-in guidance',()=>{it('recognizes only a nonempty invitation in the internal scoped route',()=>{
 expect(isDrivingInvitationTarget('/driving-school?invite=synthetic-token')).toBe(true);
 expect(isDrivingInvitationTarget('/organization/driving-school')).toBe(false);
 expect(isDrivingInvitationTarget('/driving-school?invite=')).toBe(false);
 expect(isDrivingInvitationTarget('//evil.test/driving-school?invite=x')).toBe(false);
});});
