import { isPlatformCourseListing, type CourseListingOwnership } from '@/lib/platformCourseCatalog';

export interface ConfirmedFreeCourseReceipt {
  actorId: string;
  organizationId: string;
  sourceCourseId: string;
  copiedCourseId: string;
  orderId: string;
}
interface PurchaseReceipt { orderId: string; courseId: string; price: number; }
interface Options {
  listing: CourseListingOwnership;
  actorId: string;
  organizationId: string;
  isCurrent: () => boolean;
  acquire: () => Promise<PurchaseReceipt>;
  onConfirmed?: (receipt: ConfirmedFreeCourseReceipt) => void;
}
const uuid = (value: unknown): value is string => typeof value === 'string'
  && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

/** The existing RPC owns price/authorization/copy. This only refreshes presentation after its confirmed free receipt. */
export async function acquireAndRefreshOwnFreeCourse(options: Options) {
  const receipt = await options.acquire();
  if (!receipt) throw new Error('Course receipt is unavailable');
  const current = options.isCurrent();
  if (current && isPlatformCourseListing(options.listing) && receipt.price === 0
    && uuid(options.actorId) && uuid(options.organizationId) && uuid(receipt.orderId) && uuid(receipt.courseId)
    && receipt.courseId !== options.listing.course_id) {
    try {
      options.onConfirmed?.({ actorId: options.actorId, organizationId: options.organizationId,
        sourceCourseId: options.listing.course_id as string, copiedCourseId: receipt.courseId, orderId: receipt.orderId });
    } catch {
      // A presentation refresh failure must not turn an already delivered course into a failed purchase.
    }
  }
  return { receipt, current };
}
