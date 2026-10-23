import { beforeEach, describe, expect, it, vi } from 'vitest';
const mock = vi.hoisted(() => ({ print: vi.fn(), error: vi.fn() }));
vi.mock('../printHtmlToPdf', () => ({ printHtmlContent: mock.print }));
vi.mock('sonner', () => ({ toast: { error: mock.error } }));
import { buildProtocolHtml, downloadSignatureProtocol } from '../signatureProtocol';
const data = () => ({ documentTitle: '<script>steal()</script> & договор', documentType: 'contract', documentHash: '<b>hash</b>', organizationName: '<img onerror=steal()>', recipientName: 'Ученик <b>ФИО</b>', recipientEmail: 'qa@example.org', recipientType: 'student', status: 'signed', createdAt: '2026-10-22T01:00:00Z', signedAt: '2026-10-22T01:00:00Z', signedUserAgent: '<iframe src=x>', expiresAt: '2026-11-22T01:00:00Z', signatureId: '00000000-0000-4000-8000-000000000001' });
beforeEach(() => { vi.clearAllMocks(); });
describe('signature protocol print boundary', () => {
  it('keeps reported signature evidence as text and never executes document titles or user-agent markup', () => { const input = data(), doc = new DOMParser().parseFromString(buildProtocolHtml(input), 'text/html'); expect(doc.querySelector('script,img,iframe')).toBeNull(); expect(doc.body.textContent).toContain(input.documentTitle); expect(doc.body.textContent).toContain(input.signedUserAgent); expect(doc.querySelector('style')?.textContent).toContain('.stamp'); });
  it('reports rejected print promises to the user without an unhandled rejection or a saved-PDF success', async () => { mock.print.mockRejectedValue(new Error('Не загрузилась подпись')); await expect(downloadSignatureProtocol(data())).resolves.toBeUndefined(); expect(mock.error).toHaveBeenCalledWith('Не загрузилась подпись'); });
  it('uses the actual row UUID and omits an invitation bearer and prefix from HTML, number and print filename', async () => {
    const token = 'bearer-secret-prefix-DO-NOT-EXPORT', input = { ...data(), signatureToken: token };
    const html = buildProtocolHtml(input); expect(html).toContain(input.signatureId);
    expect(html).not.toContain(token); expect(html).not.toContain(token.slice(0, 8));
    mock.print.mockResolvedValue(undefined); await downloadSignatureProtocol(input);
    expect(mock.print).toHaveBeenLastCalledWith(html, `Протокол ${input.signatureId}`);
  });
  it('does not derive password, OTP, verified identity or legal equivalence from the legacy signed status', () => {
    const html = buildProtocolHtml(data()), text = new DOMParser().parseFromString(html, 'text/html').body.textContent || '';
    expect(text).toContain('Зафиксировано подтверждение получателя'); expect(text).toContain('Не подтверждены этим протоколом');
    expect(text).not.toMatch(/OTP|email \+ пароль|равную юридическую силу|ПОДПИСАНИЯ ПРОСТОЙ ЭЛЕКТРОННОЙ/);
  });
  it('passes the journal owner guard through to the asynchronous print lifecycle', async () => {
    const options = { assertCurrent: vi.fn() }; mock.print.mockResolvedValue(undefined);
    await downloadSignatureProtocol(data(), options);
    expect(options.assertCurrent).toHaveBeenCalled();
    expect(mock.print).toHaveBeenLastCalledWith(buildProtocolHtml(data()), `Протокол ${data().signatureId}`, options);
  });
});
