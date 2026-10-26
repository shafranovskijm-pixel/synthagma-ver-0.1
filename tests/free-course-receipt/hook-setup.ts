import { afterEach, beforeEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';

const hookPorts = vi.hoisted(() => ({
  acquire: vi.fn(), notify: vi.fn(), refetchLimits: vi.fn(), parentRefresh: vi.fn(),
  orgNotifications: [] as unknown[], authUser: '10000000-0000-4000-8000-000000000001',
}));
export { hookPorts };
vi.mock('@/api/marketplacePurchase', () => ({
  MarketplacePurchaseError: class MarketplacePurchaseError extends Error {},
  purchaseMarketplaceCourse: hookPorts.acquire,
}));
vi.mock('@/utils/safeInvoke', () => ({ safeInvoke: hookPorts.notify }));
vi.mock('@/hooks/useSubscriptionLimits', () => ({ useSubscriptionLimits: () => ({ checkLimit: () => ({ allowed: true }), refetch: hookPorts.refetchLimits }) }));
vi.mock('@/utils/limitToast', () => ({ showLimitToast: vi.fn() }));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock('@/hooks/useCourseStoreFetch', () => Object.fromEntries([
  'fetchCatalog', 'fetchMyCourses', 'fetchOrders', 'fetchAvailableCourses', 'fetchCourseRequests', 'fetchDbCategories',
  'handleAddToMarketplace', 'handleToggleActive', 'handleDeleteFromMarketplace', 'handleEditCourse',
].map(name => [name, vi.fn(async () => {})])));
vi.mock('@/integrations/supabase/client', () => ({ supabase: {
  auth: { getUser: async () => ({ data: { user: { id: hookPorts.authUser } } }) },
  from(table: string) {
    if (table === 'organizations') {
      const query: any = { select: () => query, eq: () => query, single: async () => ({ data: { name: 'Synthetic QA organization', email: 'qa@example.invalid' }, error: null }) };
      return query;
    }
    if (table === 'org_notifications') return { insert: async (row: unknown) => { hookPorts.orgNotifications.push(row); return { error: null }; } };
    throw new Error('Unexpected metadata query: ' + table);
  },
} }));
beforeEach(() => {
  hookPorts.acquire.mockReset(); hookPorts.notify.mockReset(); hookPorts.refetchLimits.mockReset(); hookPorts.parentRefresh.mockReset();
  hookPorts.notify.mockResolvedValue({ data: { success: true }, error: null });
  hookPorts.refetchLimits.mockResolvedValue(undefined); hookPorts.orgNotifications = [];
  hookPorts.authUser = '10000000-0000-4000-8000-000000000001';
  vi.stubGlobal('fetch', vi.fn(() => { throw new Error('No real network calls in receipt-hook tests'); }));
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
