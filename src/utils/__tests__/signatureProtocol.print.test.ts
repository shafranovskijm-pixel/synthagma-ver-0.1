import { beforeEach, describe, expect, it, vi } from 'vitest';
const mock = vi.hoisted(() => ({ print: vi.fn(), error: vi.fn() }));
vi.mock('../printHtmlToPdf', () => ({ printHtmlContent: mock.print }));
vi.mock('sonner', () => ({ toast: { error: mock.error } }));
import { buildProtocolHtml, downloadSignatureProtocol } from '../signatureProtocol';
const data = () => ({ documentTitle: '<script>steal()</script> & договор', documentType: 'contract', documentHash: '<b>hash</b>', organizationName: '<img onerror=steal()>', recipientName: 'Ученик <b>ФИО</b>', recipientEmail: 'qa@example.org', recipientType: 'student', status: 'signed', createdAt: '2026-10-22T01:00:00Z', signedAt: '2026-10-22T01:00:00Z', signedUserAgent: '<iframe src=x>', expiresAt: '2026-11-22T01:00:00Z', signatureToken: '00000000-0000-4000-8000-000000000001' });
beforeEach(() => { vi.clearAllMocks(); });
describe('signature protocol print boundary', () => {
  it('keeps reported signature evidence as text and never executes document titles or user-agent markup', () => { const input = data(), doc = new DOMParser().parseFromString(buildProtocolHtml(input), 'text/html'); expect(doc.querySelector('script,img,iframe')).toBeNull(); expect(doc.body.textContent).toContain(input.documentTitle); expect(doc.body.textContent).toContain(input.signedUserAgent); expect(doc.querySelector('style')?.textContent).toContain('.stamp'); });
  it('reports rejected print promises to the user without an unhandled rejection or a saved-PDF success', async () => { mock.print.mockRejectedValue(new Error('Не загрузилась подпись')); await expect(downloadSignatureProtocol(data())).resolves.toBeUndefined(); expect(mock.error).toHaveBeenCalledWith('Не загрузилась подпись'); });
});
