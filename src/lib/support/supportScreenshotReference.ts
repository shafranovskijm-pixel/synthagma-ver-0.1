export type SupportScreenshotMime = 'image/png' | 'image/jpeg' | 'image/webp';
export interface SupportScreenshotLocation {
  bucket: 'student-documents';
  path: string;
}

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const validUuid = (value: unknown): value is string =>
  typeof value === 'string' && value.length === 36 && uuidPattern.test(value);
const extensions: Record<SupportScreenshotMime, string> = {
  'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp',
};
const prefix = 'storage://student-documents/';
const pathPattern = /^support\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})-([0-9a-f]{64})\.(png|jpg|webp)$/;

/** A private object locator, never a signed URL or an authorization token. */
export function buildSupportScreenshotReference(userId: string, requestId: string, sha256: string,
  mime: SupportScreenshotMime): SupportScreenshotLocation & { reference: string } {
  if (!validUuid(userId) || !validUuid(requestId) || typeof sha256 !== 'string' ||
    sha256.length !== 64 || !/^[0-9a-f]{64}$/i.test(sha256) ||
    !Object.prototype.hasOwnProperty.call(extensions, mime)) {
    throw new Error('invalid_support_screenshot_reference');
  }
  const path = `support/${userId.toLowerCase()}/${requestId.toLowerCase()}-${sha256.toLowerCase()}.${extensions[mime]}`;
  return { bucket: 'student-documents', path, reference: `${prefix}${path}` };
}

/** Bind both the object owner and incident before granting a temporary read URL. */
export function parseSupportScreenshotReference(reference: string, expectedUserId: string,
  expectedRequestId: string): SupportScreenshotLocation | null {
  if (!validUuid(expectedUserId) || !validUuid(expectedRequestId) ||
    typeof reference !== 'string' || !reference.startsWith(prefix)) return null;
  const path = reference.slice(prefix.length);
  const match = pathPattern.exec(path);
  // Exact equality also refuses a trailing newline, which JS `$` can otherwise accept.
  if (!match || match[0] !== path || match[1] !== expectedUserId.toLowerCase() ||
    match[2] !== expectedRequestId.toLowerCase()) return null;
  return { bucket: 'student-documents', path };
}
