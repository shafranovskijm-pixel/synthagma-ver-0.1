import { describe, expect, it } from 'vitest';
import {
  parseRtnWorkspaceNavigation,
  rtnWorkspaceHref,
  rtnWorkspaceRegistrationTarget,
  withRtnWorkspaceNavigation,
} from '../rtnWorkspaceNavigation';

const bank = 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa';
const event = 'bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb';
const parse = (search: string) => parseRtnWorkspaceNavigation(new URLSearchParams(search));
const params = (href: string) => new URL(href, 'https://internal.invalid').searchParams;

describe('RTN canonical course workspace navigation', () => {
  it('keeps ordinary courses as the default without a hidden RTN selection', () => {
    expect(parse('tab=courses&search=abc')).toEqual({ workspace: 'mine', view: 'training', bankId: null, eventId: null, invalidTarget: false });
    expect(parse('tab=courses&courseWorkspace=mine').workspace).toBe('mine');
  });

  it.each(['training', 'changes', 'sources'] as const)('survives refresh and reconstruction for %s', view => {
    const href = rtnWorkspaceHref({ view, bankId: bank.toUpperCase() });
    const state = parseRtnWorkspaceNavigation(params(href));
    expect(state).toEqual({ workspace: 'rtn', view, bankId: bank, eventId: null, invalidTarget: false });
    expect(rtnWorkspaceHref({ view: state.view, bankId: state.bankId })).toBe(href);
  });

  it('opens an exact event and affected bank without adding organization or actor claims', () => {
    const href = rtnWorkspaceHref({ view: 'changes', bankId: bank, eventId: event.toUpperCase() });
    expect([...params(href).keys()]).toEqual(['tab', 'courseWorkspace', 'rtnView', 'rtnBankId', 'rtnEventId']);
    expect(parseRtnWorkspaceNavigation(params(href))).toMatchObject({ eventId: event, bankId: bank, invalidTarget: false });
  });

  it('changes views without mutating history input or retaining a stale subject', () => {
    const original = params(rtnWorkspaceHref({ view: 'changes', eventId: event, bankId: bank }));
    original.set('search', 'own courses');
    original.set('category', 'mine');
    const next = withRtnWorkspaceNavigation(original, { workspace: 'rtn', view: 'sources' });
    expect(next.get('search')).toBe('own courses');
    expect(next.get('category')).toBe('mine');
    expect(next.has('rtnBankId')).toBe(false);
    expect(next.has('rtnEventId')).toBe(false);
    expect(original.get('rtnEventId')).toBe(event);
    expect(parseRtnWorkspaceNavigation(original).view).toBe('changes');
    expect(parseRtnWorkspaceNavigation(next).view).toBe('sources');
  });

  it('returns to My courses and clears all RTN-owned selectors only', () => {
    const original = params(rtnWorkspaceHref({ view: 'changes', eventId: event }));
    original.set('search', 'safety');
    original.set('rtnUnknown', 'stale');
    const next = withRtnWorkspaceNavigation(original, { workspace: 'mine' });
    expect(next.toString()).toBe('tab=courses&search=safety');
    expect(parseRtnWorkspaceNavigation(next).workspace).toBe('mine');
  });

  it.each([
    'tab=students&courseWorkspace=rtn',
    'tab=courses&tab=admin&courseWorkspace=rtn',
    'tab=courses&courseWorkspace=rtn&courseWorkspace=mine',
    'tab=courses&courseWorkspace=admin',
    'tab=courses&rtnView=changes',
    'tab=courses&courseWorkspace=rtn&rtnView=',
    'tab=courses&courseWorkspace=rtn&rtnView=editorial',
    'tab=courses&courseWorkspace=rtn&rtnView=changes&rtnView=sources',
    'tab=courses&courseWorkspace=rtn&rtnBankId=',
    'tab=courses&courseWorkspace=rtn&rtnBankId=not-a-uuid',
    `tab=courses&courseWorkspace=rtn&rtnBankId=${bank}&rtnBankId=${event}`,
    `tab=courses&courseWorkspace=rtn&rtnEventId=${event}`,
    `tab=courses&courseWorkspace=rtn&rtnView=sources&rtnEventId=${event}`,
    'tab=courses&courseWorkspace=rtn&rtnOrganizationId=foreign',
  ])('rejects ambiguous or malformed subject selection: %s', search => {
    expect(parse(search)).toMatchObject({ invalidTarget: true, bankId: null, eventId: null });
  });

  it('does not generate malformed IDs or event targets outside Changes', () => {
    expect(() => rtnWorkspaceHref({ bankId: 'bad' })).toThrow(TypeError);
    expect(() => rtnWorkspaceHref({ view: 'sources', eventId: event })).toThrow(TypeError);
    expect(() => withRtnWorkspaceNavigation(new URLSearchParams(), { workspace: 'mine', bankId: bank })).toThrow(TypeError);
  });
});

describe('narrow RTN registration intent', () => {
  it('normalizes a supported deep link and optional default view', () => {
    expect(rtnWorkspaceRegistrationTarget('/organization?tab=courses&courseWorkspace=rtn')).toBe(rtnWorkspaceHref());
    expect(rtnWorkspaceRegistrationTarget(`/organization?tab=courses&courseWorkspace=rtn&rtnView=changes&rtnEventId=${event.toUpperCase()}`))
      .toBe(rtnWorkspaceHref({ view: 'changes', eventId: event }));
  });

  it.each([
    'https://evil.test/organization?tab=courses&courseWorkspace=rtn',
    '//evil.test/organization?tab=courses&courseWorkspace=rtn',
    '/\\evil.test/organization?tab=courses&courseWorkspace=rtn',
    '/%2f%2fevil.test?tab=courses&courseWorkspace=rtn',
    '/organization?tab=courses&courseWorkspace=rtn#admin',
    '/organization?tab=courses&courseWorkspace=rtn&rtnView=sources&organizationId=foreign',
    '/organization?tab=courses&courseWorkspace=rtn&organization_id=foreign',
    '/organization?tab=courses&courseWorkspace=rtn&actorId=foreign',
    '/organization?tab=courses&courseWorkspace=rtn&next=/admin',
    '/organization?tab=courses&courseWorkspace=rtn&access=all',
    '/organization?tab=courses&courseWorkspace=rtn&catalogCourseId=00000000-0000-0000-0000-000000000000',
    '/organization?tab=courses&courseWorkspace=rtn&rtnView=changes%0a',
    '/organization?tab=courses&courseWorkspace=rtn&rtnView=changes&rtnEventId=bad',
  ])('refuses scope widening or unsafe routing: %s', raw => {
    expect(rtnWorkspaceRegistrationTarget(raw)).toBeNull();
  });
});
