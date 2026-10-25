import { expect, it, vi } from 'vitest';
import { appendStampPage, applyWatermarkToAllPages } from '../pdfStampDrawer.ts';
it('draws stored-party facts without asserting verified PEP or legal equivalence from a legacy method flag', () => {
  const texts: string[] = [], page: any = { getSize: () => ({ width: 595, height: 842 }), drawText: (s: string) => texts.push(s), drawLine: vi.fn(), drawRectangle: vi.fn() };
  const pdf: any = { addPage: () => page, getPages: () => [page] }, font: any = { widthOfTextAtSize: (s: string, n: number) => s.length * n / 2 };
  const party = { fullName: 'Synthetic Recipient', email: 'synthetic@example.invalid', signedAt: '2026-10-23T00:00:00Z', documentHash: 'a'.repeat(64) };
  appendStampPage(pdf, undefined, party, { font, fontBold: font, signatureMethod: 'pep', documentTitle: 'Synthetic contract' });
  applyWatermarkToAllPages(pdf, undefined, party, font, font, 'pep');
  const text = texts.join(' '); expect(text).toContain('Synthetic Recipient'); expect(text).toContain('проверяются отдельно');
  expect(text).not.toMatch(/63-ФЗ|равную собственноручной|ПЭП/);
});
