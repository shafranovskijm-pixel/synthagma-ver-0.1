import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, useLocation, useNavigate } from 'react-router-dom';
import { MARKETPLACE_ORG_ID } from '@/constants/marketplace';
import { courseCatalogDestination, courseCatalogLoginHref, resolvePublicCourseDeepLink } from '@/lib/publicCourseExplorer';
import { usePublicCourseDeepLink } from '@/hooks/usePublicCourseDeepLink';
import { useCourseStoreManager } from '@/hooks/useCourseStoreManager';
import { ports } from './setup';

const COURSE = '20000000-0000-4000-8000-000000000001';
const ORG = '30000000-0000-4000-8000-000000000001';
const OTHER = '30000000-0000-4000-8000-000000000002';
const USER = '40000000-0000-4000-8000-000000000001';
const scope = { organizationId: ORG, userId: USER, requestVersion: 1 };
function listing() {
  return { course_id: COURSE, organization_id: MARKETPLACE_ORG_ID, is_active: true, is_validated: true,
    course: { id: COURSE, title: 'Синтетический публичный курс', organization_id: MARKETPLACE_ORG_ID, is_published: true, hidden_from_catalog: false, category: { hidden_from_catalog: false } } };
}
const resolve = (rows: any[], overrides: any = {}) => resolvePublicCourseDeepLink(rows, overrides.id ?? COURSE, overrides.expected ?? scope, overrides.loaded === undefined ? scope : overrides.loaded, overrides.loading ?? false);

describe('Exact current public source links', () => {
  it('PCD01 encodes only a valid UUID into a relative organization destination and one login return parameter', () => {
    const href = courseCatalogLoginHref(COURSE)!; const url = new URL(href, 'https://synthetic.example');
    expect(url.pathname).toBe('/login'); expect([...url.searchParams.keys()]).toEqual(['next']);
    expect(url.searchParams.get('next')).toBe(courseCatalogDestination(COURSE));
    const destination = new URL(url.searchParams.get('next')!, url.origin);
    expect(destination.pathname).toBe('/organization'); expect(destination.searchParams.get('tab')).toBe('services');
    expect(destination.searchParams.get('catalogCourseId')).toBe(COURSE);
    for (const invalid of ['', 'javascript:alert(1)', `${COURSE}&organizationId=${OTHER}`, '//external.example']) expect(courseCatalogLoginHref(invalid)).toBeNull();
  });
  it('PCD02 rejects missing, duplicate, client-owned and mismatched identities without title/lineage substitution', () => {
    const row = listing(); expect(resolve([row])).toBe(row);
    expect(resolve([])).toBeNull(); expect(resolve([row, row])).toBeNull();
    expect(resolve([{ ...row, organization_id: OTHER }])).toBeNull();
    expect(resolve([{ ...row, organization_id: null }])).toBeNull();
    expect(resolve([{ ...row, source_course_id: COURSE, course: { ...row.course, organization_id: OTHER } }])).toBeNull();
    expect(resolve([{ ...row, course: { ...row.course, id: OTHER } }])).toBeNull();
  });
  it('PCD03 requires current active/validated/published/not-hidden facts including category visibility', () => {
    const row = listing();
    for (const altered of [{ ...row, is_active: false }, { ...row, is_validated: false }, { ...row, is_validated: undefined },
      { ...row, course: { ...row.course, is_published: false } }, { ...row, course: { ...row.course, hidden_from_catalog: true } },
      { ...row, course: { ...row.course, category: { hidden_from_catalog: true } } }, { ...row, course: { ...row.course, category: undefined } }]) expect(resolve([altered])).toBeNull();
    expect(resolve([{ ...row, course: { ...row.course, category: null } }])).not.toBeNull();
  });
  it('PCD04 never selects while loading, without authenticated context or from a catalogue loaded for an earlier organization/user', () => {
    for (const overrides of [{ loading: true }, { loaded: null }, { loaded: { ...scope, organizationId: OTHER } }, { loaded: { ...scope, userId: OTHER } }, { expected: { organizationId: ORG } }]) expect(resolve([listing()], overrides)).toBeNull();
  });
  it('PCD05 actual hook waits for matching load scope; one selection opens only detail and never invokes purchase', async () => {
    const onSelect = vi.fn(); const onOpenCatalog = vi.fn();
    const wrapper = ({ children }: any) => <MemoryRouter initialEntries={[`/organization?tab=services&catalogCourseId=${COURSE}`]}>{children}</MemoryRouter>;
    const hook = renderHook(({ org, loaded }: any) => usePublicCourseDeepLink({ catalog: [listing()], isLoading: false, loadedScope: loaded, organizationId: org, userId: USER, onSelect, onOpenCatalog }), { wrapper, initialProps: { org: OTHER, loaded: scope } });
    expect(onSelect).not.toHaveBeenCalled();
    hook.rerender({ org: OTHER, loaded: { ...scope, organizationId: OTHER } });
    await waitFor(() => expect(onSelect).toHaveBeenCalledOnce());
    hook.rerender({ org: OTHER, loaded: { ...scope, organizationId: OTHER } });
    expect(onSelect).toHaveBeenCalledOnce(); expect(onOpenCatalog).toHaveBeenCalledWith('catalog');
    expect(ports.purchase).not.toHaveBeenCalled(); expect(fetch).not.toHaveBeenCalled();
  });
  it('PCD06 unavailable/duplicate URL values fail closed and clearing removes only the request parameter', async () => {
    const select = vi.fn();
    function Harness() {
      const location = useLocation();
      const deep = usePublicCourseDeepLink({ catalog: [listing()], loadedScope: scope, isLoading: false, organizationId: ORG, userId: USER, onSelect: select, onOpenCatalog: () => {} });
      return <><output>{location.search}</output><span>{deep.unavailable ? 'Недоступен' : 'Ожидание'}</span><button onClick={deep.clearRequestedCourse}>Очистить</button></>;
    }
    render(<MemoryRouter initialEntries={[`/organization?tab=services&utm_source=synthetic&catalogCourseId=${COURSE}&catalogCourseId=${OTHER}&course=legacy`]}><Harness /></MemoryRouter>);
    await screen.findByText('Недоступен'); expect(select).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Очистить' }));
    expect(screen.getByRole('status').textContent).toBe('?tab=services&utm_source=synthetic&course=legacy');
  });
  it('PCD07 history return creates a new presentation visit but never an order', async () => {
    const select = vi.fn();
    function Harness() {
      const navigate = useNavigate();
      usePublicCourseDeepLink({ catalog: [listing()], loadedScope: scope, isLoading: false, organizationId: ORG, userId: USER, onSelect: select, onOpenCatalog: () => {} });
      return <><button onClick={() => navigate('/organization?tab=services')}>Каталог</button><button onClick={() => navigate(-1)}>Назад</button></>;
    }
    render(<MemoryRouter initialEntries={[`/organization?tab=services&catalogCourseId=${COURSE}`]}><Harness /></MemoryRouter>);
    await waitFor(() => expect(select).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole('button', { name: 'Каталог' })); fireEvent.click(screen.getByRole('button', { name: 'Назад' }));
    await waitFor(() => expect(select).toHaveBeenCalledTimes(2)); expect(ports.purchase).not.toHaveBeenCalled();
  });
});

describe('Actual store loading lease', () => {
  it('PCL01 late old-organization callbacks cannot replace the current catalogue or its scope', async () => {
    const pending: Array<{ org: string; receive: (rows: any[]) => void; finish: () => void }> = [];
    ports.fetchCatalog.mockImplementation((org, receive) => new Promise<void>(finish => pending.push({ org, receive, finish })));
    const rendered: Array<{ organizationId: string; isLoading: boolean }> = [];
    const hook = renderHook(({ org }) => {
      const value = useCourseStoreManager({ organizationId: org, userId: USER });
      rendered.push({ organizationId: org, isLoading: value.isLoading });
      return value;
    }, { initialProps: { org: ORG } });
    await waitFor(() => expect(pending).toHaveLength(1));
    hook.rerender({ org: OTHER }); await waitFor(() => expect(pending).toHaveLength(2));
    // Recorded inside render, before its effects can clear old arrays or start the new request.
    expect(rendered.find(value => value.organizationId === OTHER)?.isLoading).toBe(true);
    const current = { ...listing(), id: '50000000-0000-4000-8000-000000000002' };
    await act(async () => { pending[1].receive([current]); pending[1].finish(); });
    expect(hook.result.current.catalogReadScope?.organizationId).toBe(OTHER);
    expect(hook.result.current.catalogCourses).toEqual([current]);
    await act(async () => { pending[0].receive([{ ...current, id: '50000000-0000-4000-8000-000000000001' }]); pending[0].finish(); });
    expect(hook.result.current.catalogReadScope?.organizationId).toBe(OTHER);
    expect(hook.result.current.catalogCourses).toEqual([current]); expect(hook.result.current.isLoading).toBe(false);
    expect(ports.purchase).not.toHaveBeenCalled();
  });
  it('PCL02 a new actor invalidates the previously loaded scope before another request resolves', async () => {
    const pending: Array<{ receive: (rows: any[]) => void; finish: () => void }> = [];
    ports.fetchCatalog.mockImplementation((_org, receive) => new Promise<void>(finish => pending.push({ receive, finish })));
    const hook = renderHook(({ userId }) => useCourseStoreManager({ organizationId: ORG, userId }), { initialProps: { userId: USER } });
    await act(async () => { pending[0].receive([listing()]); pending[0].finish(); });
    expect(hook.result.current.catalogReadScope?.userId).toBe(USER);
    hook.rerender({ userId: OTHER });
    expect(hook.result.current.catalogReadScope).toBeNull(); expect(hook.result.current.catalogCourses).toEqual([]);
    expect(hook.result.current.isLoading).toBe(true); expect(ports.purchase).not.toHaveBeenCalled();
    await act(async () => { pending[1].receive([listing()]); pending[1].finish(); });
    expect(hook.result.current.catalogReadScope?.userId).toBe(OTHER);
  });
  it('PCL03 a failed catalogue read exposes retry state without legitimizing earlier rows', async () => {
    ports.fetchCatalog.mockImplementation(async () => {});
    const hook = renderHook(() => useCourseStoreManager({ organizationId: ORG, userId: USER }));
    await waitFor(() => expect(hook.result.current.isLoading).toBe(false));
    expect(hook.result.current.catalogReadScope).toBeNull();
    expect(hook.result.current.catalogLoadFailed).toBe(true);
    expect(hook.result.current.isLoading).toBe(false); // Failed current read is not an endless spinner.
    expect(hook.result.current.catalogCourses).toEqual([]);
    ports.fetchCatalog.mockImplementation(async (_org, receive) => receive([listing()]));
    await act(async () => { await hook.result.current.refreshCatalog(); });
    expect(hook.result.current.catalogLoadFailed).toBe(false);
    expect(hook.result.current.catalogReadScope?.organizationId).toBe(ORG);
    expect(ports.purchase).not.toHaveBeenCalled();
  });
});
