import { afterEach, beforeEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';

const ports = vi.hoisted(() => ({
  purchase: vi.fn(), checkLimit: vi.fn(), refetchLimits: vi.fn(),
  fetchCatalog: vi.fn(), fetchMyCourses: vi.fn(), fetchOrders: vi.fn(), fetchAvailableCourses: vi.fn(), fetchRequests: vi.fn(), fetchCategories: vi.fn(),
  registrationInvoke: vi.fn(), signIn: vi.fn(), refreshRole: vi.fn(), tracking: vi.fn(),
  authState: { user: null as any, userRole: 'organization', loading: false },
}));
export { ports };
vi.mock('@/integrations/supabase/publicCatalogClient', () => ({ publicCatalogClient: { from: () => { throw Error('Use offline catalogue pages'); } } }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { from: () => { throw Error('No database calls'); }, auth: { getUser: () => { throw Error('No authentication calls'); }, signInWithPassword: ports.signIn }, functions: { invoke: ports.registrationInvoke } } }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ ...ports.authState, refreshUserRole: ports.refreshRole }) }));
vi.mock('@/utils/referralCookie', () => ({ getRefCode: () => null, clearRefCode: vi.fn(), captureRefFromUrl: vi.fn() }));
vi.mock('@/utils/utmCapture', () => ({ getUtmData: () => null }));
vi.mock('@/lib/yandexMetrika', () => ({ reachYandexGoal: ports.tracking }));
vi.mock('@/utils/safeInvoke', () => ({ safeInvoke: () => { throw Error('No remote function calls'); } }));
vi.mock('@/api/marketplacePurchase', () => ({ MarketplacePurchaseError: class extends Error {}, purchaseMarketplaceCourse: ports.purchase }));
vi.mock('@/hooks/useSubscriptionLimits', () => ({ useSubscriptionLimits: () => ({ checkLimit: ports.checkLimit, refetch: ports.refetchLimits }) }));
vi.mock('@/hooks/useCourseStoreFetch', () => ({
  fetchCatalog: ports.fetchCatalog, fetchMyCourses: ports.fetchMyCourses, fetchOrders: ports.fetchOrders,
  fetchAvailableCourses: ports.fetchAvailableCourses, fetchCourseRequests: ports.fetchRequests, fetchDbCategories: ports.fetchCategories,
  handleAddToMarketplace: () => { throw Error('No writes'); }, handleToggleActive: () => { throw Error('No writes'); },
  handleDeleteFromMarketplace: () => { throw Error('No writes'); }, handleEditCourse: () => { throw Error('No writes'); },
}));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn(), warning: vi.fn() } }));
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('fetch', vi.fn(() => { throw Error('Network forbidden'); }));
  ports.purchase.mockImplementation(() => { throw Error('No purchase should be triggered'); });
  ports.fetchCatalog.mockImplementation(async (_org, receive) => receive([]));
  ports.fetchMyCourses.mockImplementation(async (_org, receive) => receive([]));
  ports.fetchOrders.mockImplementation(async (_org, _user, received, orders) => { received([]); orders([]); });
  ports.fetchAvailableCourses.mockImplementation(async (_org, receive) => receive([]));
  ports.fetchRequests.mockImplementation(async receive => receive([]));
  ports.fetchCategories.mockImplementation(async receive => receive([]));
  ports.authState.user = null; ports.authState.userRole = 'organization'; ports.authState.loading = false;
  ports.registrationInvoke.mockImplementation(async () => { throw Error('Unexpected registration operation'); });
  ports.signIn.mockResolvedValue({ error: null });
  ports.refreshRole.mockResolvedValue('organization');
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
