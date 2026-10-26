import React from 'react';
import { describe, expect, it } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { courseCatalogDestination, courseCatalogLoginHref } from '@/lib/publicCourseExplorer';
import { courseCatalogRegistrationTarget, organizationRegistrationHref, organizationRegistrationTarget, safeInternalNext, DRIVING_ORGANIZATION_PATH } from '@/utils/authReturn';
import { useRegisterOrganization } from '@/hooks/useRegisterOrganization';
import { ports } from './setup';

const COURSE = '20000000-0000-4000-8000-000000000001';
const TARGET = courseCatalogDestination(COURSE)!;
const outer = (next: string) => new URLSearchParams({ next });

describe('Bounded organization registration presentation return', () => {
  it('PCR01 keeps only the canonical selected public course through login → registration → organization target', () => {
    const login = new URL(courseCatalogLoginHref(COURSE)!, 'https://synthetic.example');
    const registration = new URL(organizationRegistrationHref(login.searchParams), login.origin);
    expect(registration.pathname).toBe('/register-organization');
    expect([...registration.searchParams.keys()]).toEqual(['next']);
    expect(organizationRegistrationTarget(registration.searchParams)).toBe(TARGET);
    expect(safeInternalNext(TARGET)).toBe(TARGET);
  });
  it('PCR02 rejects foreign hosts, ambiguous/extra parameters, wrong tabs, missing UUID and fragments without widening registration destinations', () => {
    for (const next of ['https://evil.example' + TARGET, '//evil.example' + TARGET, '/\\evil.example',
      '/organization?tab=admin&catalogCourseId=' + COURSE, '/organization?tab=services', TARGET + '&role=admin',
      TARGET + '&tab=services', TARGET + '&catalogCourseId=' + COURSE, TARGET + '#admin',
      '/organization?tab=services&catalogCourseId=not-a-uuid', '/admin', '/organization/driving-school?view=admin']) {
      expect(courseCatalogRegistrationTarget(next)).toBeNull();
      expect(organizationRegistrationTarget(outer(next))).toBe('/organization');
    }
    const ambiguous = outer(TARGET); ambiguous.append('next', TARGET);
    expect(organizationRegistrationTarget(ambiguous)).toBe('/organization');
  });
  it('PCR03 preserves the driving-school branch and ordinary default exactly', () => {
    expect(organizationRegistrationTarget(new URLSearchParams('module=driving-school&next=https://evil.example'))).toBe(DRIVING_ORGANIZATION_PATH);
    expect(organizationRegistrationHref(new URLSearchParams('module=driving-school'))).toBe('/register-organization?module=driving-school');
    expect(organizationRegistrationTarget(outer(DRIVING_ORGANIZATION_PATH))).toBe(DRIVING_ORGANIZATION_PATH);
    expect(organizationRegistrationTarget(new URLSearchParams())).toBe('/organization');
    expect(organizationRegistrationHref(new URLSearchParams())).toBe('/register-organization');
  });
  it('PCR04 actual registration hook retains the selected presentation target after a successful existing registration, without putting it in the registration payload', async () => {
    const orgId = '30000000-0000-4000-8000-000000000001';
    const userId = '40000000-0000-4000-8000-000000000001';
    ports.registrationInvoke.mockImplementation(async name => ({ data: name === 'register-organization' ? { success: true, organization_id: orgId, user_id: userId } : name === 'log-registration-attempt' ? { attempt_id: 'synthetic-attempt' } : {}, error: null }));
    const wrapper = ({ children }: any) => <MemoryRouter initialEntries={[`/register-organization?${outer(TARGET)}`]}>{children}</MemoryRouter>;
    const hook = renderHook(() => ({ registration: useRegisterOrganization(), location: useLocation() }), { wrapper });
    await act(async () => {
      hook.result.current.registration.setOrgName('Synthetic QA organization'); hook.result.current.registration.setContactName('Synthetic QA owner');
      hook.result.current.registration.setEmail('synthetic@example.invalid'); hook.result.current.registration.setPhone('+70000000000');
      hook.result.current.registration.setPassword('synthetic-test-only'); hook.result.current.registration.setConfirmPassword('synthetic-test-only');
    });
    await act(async () => { await hook.result.current.registration.handleSubmit({ preventDefault() {} } as any); });
    await waitFor(() => expect(hook.result.current.location.pathname + hook.result.current.location.search).toBe(TARGET));
    const call = ports.registrationInvoke.mock.calls.find(([name]) => name === 'register-organization');
    expect(call?.[1].body).not.toHaveProperty('next'); expect(call?.[1].body).not.toHaveProperty('catalogCourseId');
    expect(call?.[1].body.subscription_plan).toBe('free'); expect(ports.purchase).not.toHaveBeenCalled();
  });
  it('PCR05 existing manual-signin recovery keeps the same selected target when automatic signin fails', async () => {
    ports.signIn.mockResolvedValue({ error: { message: 'Synthetic signin failure' } });
    ports.registrationInvoke.mockImplementation(async name => ({ data: name === 'register-organization' ? { success: true, organization_id: 'synthetic-org', user_id: 'synthetic-user' } : { attempt_id: 'synthetic-attempt' }, error: null }));
    const wrapper = ({ children }: any) => <MemoryRouter initialEntries={[`/register-organization?${outer(TARGET)}`]}>{children}</MemoryRouter>;
    const hook = renderHook(() => ({ registration: useRegisterOrganization(), location: useLocation() }), { wrapper });
    expect(new URL(hook.result.current.registration.loginTarget, 'https://synthetic.example').searchParams.get('next')).toBe(TARGET);
    await act(async () => {
      const registration = hook.result.current.registration;
      registration.setOrgName('Synthetic QA organization'); registration.setContactName('Synthetic owner');
      registration.setEmail('synthetic@example.invalid'); registration.setPhone('+70000000000');
      registration.setPassword('synthetic-test-only'); registration.setConfirmPassword('synthetic-test-only');
    });
    await act(async () => { await hook.result.current.registration.handleSubmit({ preventDefault() {} } as any); });
    expect(hook.result.current.location.pathname).toBe('/login');
    expect(new URLSearchParams(hook.result.current.location.search).get('next')).toBe(TARGET);
    expect(ports.purchase).not.toHaveBeenCalled();
  });
});
