import { describe, expect, it, vi } from 'vitest';
import { MARKETPLACE_ORG_ID } from '@/constants/marketplace';
import { acquireAndRefreshOwnFreeCourse } from '@/lib/freeCourseReceipt';

const actorId = '10000000-0000-4000-8000-000000000001';
const organizationId = '20000000-0000-4000-8000-000000000002';
const sourceCourseId = '00327a03-f79c-5d5c-9f57-d3c46cc54bae';
const receipt = { orderId: '30000000-0000-4000-8000-000000000003', courseId: '40000000-0000-4000-8000-000000000004', price: 0 };
function options() {
  return {
    listing: { course_id: sourceCourseId, organization_id: MARKETPLACE_ORG_ID, course: { id: sourceCourseId, organization_id: MARKETPLACE_ORG_ID } },
    actorId, organizationId, isCurrent: () => true,
    acquire: vi.fn(async () => receipt), onConfirmed: vi.fn(),
  };
}

describe('Existing own free acquisition refreshes only its current organization loader', () => {
  it('CR01 a successful exact own free receipt refreshes once with the RPC copied ID and captured actor/org', async () => {
    const input = options(); const result = await acquireAndRefreshOwnFreeCourse(input);
    expect(input.acquire).toHaveBeenCalledTimes(1);
    expect(result.receipt).toBe(receipt); expect(result.current).toBe(true);
    expect(input.onConfirmed).toHaveBeenCalledTimes(1);
    expect(input.onConfirmed).toHaveBeenCalledWith({ actorId, organizationId, sourceCourseId, copiedCourseId: receipt.courseId, orderId: receipt.orderId });
  });
  it('CR02 a failed RPC propagates its existing error and never refreshes or reports a current receipt', async () => {
    const failure = new Error('synthetic gateway error'); const input = options();
    input.acquire.mockRejectedValue(failure);
    await expect(acquireAndRefreshOwnFreeCourse(input)).rejects.toBe(failure);
    expect(input.onConfirmed).not.toHaveBeenCalled();
  });
  it('CR03 a missing RPC result fails without a refresh callback', async () => {
    const input = options(); input.acquire.mockResolvedValue(undefined as any);
    await expect(acquireAndRefreshOwnFreeCourse(input)).rejects.toThrow('Course receipt is unavailable');
    expect(input.onConfirmed).not.toHaveBeenCalled();
  });
  it('CR04 a paid customer result retains the original receipt and does not trigger the own-free refresh', async () => {
    const input = options(); input.listing.organization_id = organizationId; input.listing.course.organization_id = organizationId;
    const paid = { ...receipt, price: 12000 }; input.acquire.mockResolvedValue(paid);
    const result = await acquireAndRefreshOwnFreeCourse(input);
    expect(result.receipt).toBe(paid); expect(result.receipt.price).toBe(12000);
    expect(input.onConfirmed).not.toHaveBeenCalled();
  });
  it('CR05 an actor, organization or mounted-context change during the RPC suppresses refresh and current-success acknowledgement', async () => {
    for (const changed of ['actor', 'organization', 'unmount']) {
      const input = options(); let context = 'original'; let finish!: (value: typeof receipt) => void;
      input.isCurrent = () => context === 'original';
      input.acquire.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
      const pending = acquireAndRefreshOwnFreeCourse(input); context = changed; finish(receipt);
      const result = await pending;
      expect(result.current).toBe(false); expect(input.onConfirmed).not.toHaveBeenCalled();
    }
  });
  it('CR06 absent or mismatched current source ownership never grants the own-free refresh from lineage or equal IDs', async () => {
    for (const change of ['missing', 'foreign', 'wrong-id']) {
      const input = options();
      if (change === 'missing') delete (input.listing.course as any).organization_id;
      if (change === 'foreign') input.listing.course.organization_id = organizationId;
      if (change === 'wrong-id') input.listing.course.id = receipt.courseId;
      const before = JSON.stringify(input.listing);
      await acquireAndRefreshOwnFreeCourse(input);
      expect(input.onConfirmed).not.toHaveBeenCalled(); expect(JSON.stringify(input.listing)).toBe(before);
    }
  });
  it('CR07 an optional parent refresh failure never turns the delivered copy into a failed purchase or retries acquisition', async () => {
    const input = options(); input.onConfirmed.mockImplementation(() => { throw new Error('synthetic refresh failure'); });
    const result = await acquireAndRefreshOwnFreeCourse(input);
    expect(result.receipt).toBe(receipt); expect(result.current).toBe(true);
    expect(input.acquire).toHaveBeenCalledTimes(1); expect(input.onConfirmed).toHaveBeenCalledTimes(1);
  });
});
