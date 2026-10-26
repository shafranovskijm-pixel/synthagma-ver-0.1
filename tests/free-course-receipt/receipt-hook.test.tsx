import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useCourseStoreManager } from '@/hooks/useCourseStoreManager';
import { MARKETPLACE_ORG_ID } from '@/constants/marketplace';
import { hookPorts } from './hook-setup';

const actorId = '10000000-0000-4000-8000-000000000001';
const organizationId = '20000000-0000-4000-8000-000000000002';
const sourceCourseId = '00327a03-f79c-5d5c-9f57-d3c46cc54bae';
const receipt = { orderId: '30000000-0000-4000-8000-000000000003', courseId: '40000000-0000-4000-8000-000000000004', price: 0 };
const sourceListing = {
  id: '50000000-0000-4000-8000-000000000005', course_id: sourceCourseId, organization_id: MARKETPLACE_ORG_ID,
  price_student: 0, price_organization: 0, is_active: true, description_short: null, preview_image_url: null, created_at: '2026-10-26T00:00:00Z',
  course: { id: sourceCourseId, organization_id: MARKETPLACE_ORG_ID, title: 'Синтетический курс для проверки receipt flow' },
};
const props = { organizationId, userId: actorId, onOwnFreeCourseReceived: hookPorts.parentRefresh };
function refreshEvents(dispatch: { mock: { calls: unknown[][] } }) {
  return dispatch.mock.calls.filter(call => (call[0] as Event).type === 'org-courses-refresh');
}

describe('Actual store hook: fulfilled RPC notification survives UI unmount', () => {
  it('CB01 delayed successful RPC after unmount still attempts the existing notify once, without parent refresh or UI acknowledgement', async () => {
    let finish!: (value: typeof receipt) => void;
    hookPorts.acquire.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    const dispatch = vi.spyOn(window, 'dispatchEvent');
    const hook = renderHook(() => useCourseStoreManager(props));
    await waitFor(() => expect(hook.result.current.isLoading).toBe(false));
    act(() => hook.result.current.setSelectedCourseForOrder(sourceListing));
    let pending!: Promise<void>;
    act(() => { pending = hook.result.current.handleOrder(); });
    await waitFor(() => expect(hookPorts.acquire).toHaveBeenCalledTimes(1));
    const lastMountedState = hook.result.current;
    hook.unmount();
    await act(async () => { finish(receipt); await pending; });
    expect(hookPorts.notify).toHaveBeenCalledTimes(1);
    expect(hookPorts.notify.mock.calls[0][0]).toBe('notify-course-order');
    expect(hookPorts.notify.mock.calls[0][1].body.orderId).toBe(receipt.orderId);
    expect(hookPorts.orgNotifications).toHaveLength(1);
    expect(hookPorts.parentRefresh).not.toHaveBeenCalled();
    expect(hookPorts.refetchLimits).not.toHaveBeenCalled();
    expect(refreshEvents(dispatch)).toHaveLength(0);
    expect(lastMountedState.showSuccessDialog).toBe(false);
  });
  it('CB02 mounted same-actor/org success retains both the parent refresh and the existing notify plus success UI', async () => {
    hookPorts.acquire.mockResolvedValue(receipt);
    const dispatch = vi.spyOn(window, 'dispatchEvent');
    const hook = renderHook(() => useCourseStoreManager(props));
    await waitFor(() => expect(hook.result.current.isLoading).toBe(false));
    act(() => hook.result.current.setSelectedCourseForOrder(sourceListing));
    await act(async () => { await hook.result.current.handleOrder(); });
    expect(hookPorts.acquire).toHaveBeenCalledTimes(1);
    expect(hookPorts.parentRefresh).toHaveBeenCalledTimes(1);
    expect(hookPorts.parentRefresh).toHaveBeenCalledWith({ actorId, organizationId, sourceCourseId, copiedCourseId: receipt.courseId, orderId: receipt.orderId });
    expect(hookPorts.notify).toHaveBeenCalledTimes(1);
    expect(hookPorts.notify.mock.calls[0][0]).toBe('notify-course-order');
    expect(hookPorts.notify.mock.calls[0][1].body.orderId).toBe(receipt.orderId);
    expect(hookPorts.refetchLimits).toHaveBeenCalledTimes(1);
    expect(refreshEvents(dispatch)).toHaveLength(1);
    expect(hook.result.current.showSuccessDialog).toBe(true);
    expect(hook.result.current.showOrderDialog).toBe(false);
  });
});
