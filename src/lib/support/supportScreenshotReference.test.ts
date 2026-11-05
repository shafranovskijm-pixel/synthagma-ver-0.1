import { describe, expect, it } from 'vitest';
import { buildSupportScreenshotReference, parseSupportScreenshotReference, type SupportScreenshotMime } from './supportScreenshotReference';

const userId = '10000000-0000-4000-8000-000000000001';
const requestId = '20000000-0000-4000-8000-000000000002';
const sha = 'abc123'.repeat(10) + 'abcd';
const reference = `storage://student-documents/support/${userId}/${requestId}-${sha}.png`;

describe('private support screenshot references', () => {
  it.each([
    ['image/png', 'png'], ['image/jpeg', 'jpg'], ['image/webp', 'webp'],
  ] as const)('builds and parses a request-bound %s locator', (mime, extension) => {
    const built = buildSupportScreenshotReference(userId, requestId, sha, mime);
    expect(built).toEqual({ bucket: 'student-documents', path: `support/${userId}/${requestId}-${sha}.${extension}`,
      reference: `storage://student-documents/support/${userId}/${requestId}-${sha}.${extension}` });
    expect(parseSupportScreenshotReference(built.reference, userId, requestId)).toEqual({ bucket: built.bucket, path: built.path });
    expect(built.reference).not.toMatch(/[?#]/);
  });

  it('normalizes valid UUID/hash casing without decoding paths', () => {
    const owner = 'abcdef01-abcd-4000-8000-abcdef123456';
    const built = buildSupportScreenshotReference(owner.toUpperCase(), requestId, sha.toUpperCase(), 'image/png');
    expect(built.reference).toBe(`storage://student-documents/support/${owner}/${requestId}-${sha}.png`);
    expect(parseSupportScreenshotReference(built.reference, owner.toUpperCase(), requestId)).not.toBeNull();
  });

  it.each([
    ['../other', requestId, sha, 'image/png'], [userId, `${requestId}\n`, sha, 'image/png'],
    [userId, requestId, `${sha}\n`, 'image/png'], [userId, requestId, `${sha}?token=secret`, 'image/png'],
    [userId, requestId, 'x'.repeat(64), 'image/png'], [userId, requestId, sha, 'image/svg+xml'],
    [userId, requestId, sha, '__proto__'],
  ])('refuses malformed builder inputs', (owner, request, digest, mime) => {
    expect(() => buildSupportScreenshotReference(owner, request, digest, mime as SupportScreenshotMime))
      .toThrow('invalid_support_screenshot_reference');
  });

  it.each([
    `${reference}?token=secret`, `${reference}#secret`, `${reference}\n`,
    reference.replace('student-documents', 'org-documents'), reference.replace('student-documents', 'unknown'),
    reference.replace('support/', '../support/'), reference.replace('support/', 'support/../'),
    reference.replace('support/', 'support/%2e%2e/'), reference.replace('support/', 'support\\'),
    reference.replace('.png', '.svg'), reference.replace('.png', '.png/extra'),
    reference.replace(`/${requestId}-`, `/%2f${requestId}-`),
    reference.replace('storage://', 'https://'), ` ${reference}`, '',
  ])('rejects noncanonical, traversal, secret-bearing or unsupported references', value => {
    expect(parseSupportScreenshotReference(value, userId, requestId)).toBeNull();
  });

  it('rejects another user or request and malformed expected identities', () => {
    expect(parseSupportScreenshotReference(reference, requestId, requestId)).toBeNull();
    expect(parseSupportScreenshotReference(reference, userId, userId)).toBeNull();
    expect(parseSupportScreenshotReference(reference, `${userId}\n`, requestId)).toBeNull();
    expect(parseSupportScreenshotReference(reference, userId, '../request')).toBeNull();
  });
});
