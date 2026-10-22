import { setOfflineAuthActor } from '@/utils/courseCache';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { EducationDocumentRecord } from '@/hooks/educationDocumentsHelpers';
const mock = vi.hoisted(() => ({ qr: vi.fn() }));
vi.mock('qrcode', () => ({ default: { toDataURL: mock.qr } }));
import { generateEducationDocumentHtml } from '../generateEducationDocument';
const png = 'data:image/png;base64,aGVsbG8=';
const record = (): EducationDocumentRecord => ({ id: '00000000-0000-4000-8000-000000000001', enrollment_id: '00000000-0000-4000-8000-000000000003', full_name: 'Учебный ученик', birth_date: '1990-01-02', specialty_name: 'Программа', qualification_name: 'Квалификация', document_type: 'diploma', document_series: 'QA', document_number: '17', reg_number: 'Д-2026/001', issue_date: '2026-10-22', document_status: 'original', order_number: 'З-17', order_date: '2026-10-01', protocol_number: 'П-1', protocol_date: '2026-10-20', original_document_data: null, delivery_method: 'personal', delivery_details: null, notes: null });
beforeEach(() => { setOfflineAuthActor('QA-education-A'); vi.clearAllMocks(); mock.qr.mockResolvedValue(png); });
afterEach(() => setOfflineAuthActor(null));
describe('education document output is escaped, locally verifiable and truthful', () => {
  it('does not return old actor document HTML when local QR generation finishes after login changed', async () => {
    let complete!: (value: string) => void; mock.qr.mockReturnValue(new Promise(resolve => { complete = resolve; }));
    const result = generateEducationDocumentHtml(record(), { name: 'Учебный центр' }); const outcome = expect(result).rejects.toThrow('Доступ изменился');
    await vi.waitFor(() => expect(mock.qr).toHaveBeenCalledOnce()); setOfflineAuthActor('QA-education-B'); complete(png); await outcome;
  });
  it('builds the QR locally from the exact verification identifier and preserves the document, stamp and signature layout', async () => {
    const input = record(), original = structuredClone(input);
    const html = await generateEducationDocumentHtml(input, { name: 'Учебный центр', city: 'Владивосток', stamp_url: 'https://files.example.org/stamp.png', signature_url: 'https://files.example.org/signature.png', director_name: 'Директор' });
    expect(mock.qr).toHaveBeenCalledWith(expect.stringContaining('/verify/' + encodeURIComponent(input.reg_number) + '?document_id=' + input.id), expect.objectContaining({ type: 'image/png', width: 110 }));
    expect(html).not.toContain('api.qrserver'); expect(html).not.toContain('chart.googleapis'); const doc = new DOMParser().parseFromString(html, 'text/html'); expect(doc.images).toHaveLength(3); expect(doc.images[2].getAttribute('src')).toBe(png); expect(doc.body.textContent).toContain('Владивосток, 22 октября 2026 г.'); expect(doc.querySelector('style')?.textContent).toContain('.signature-block'); expect(input).toEqual(original);
  });
  it('escapes user and organization data rather than turning it into tags, scripts or image attributes, and does not invent Moscow', async () => {
    const input = record(); input.full_name = '<img src=x onerror=steal()> & ученик'; input.specialty_name = '</td><script>steal()</script>'; input.qualification_name = '<iframe src="https://evil.example">'; input.document_number = '17" onclick="steal()';
    const html = await generateEducationDocumentHtml(input, { name: '<script>org()</script> & центр', license_number: '<b>Лицензия</b>', director_name: '<img src=x>', director_position: 'Директор & учредитель', city: null }); const doc = new DOMParser().parseFromString(html, 'text/html');
    expect(doc.querySelector('script,iframe,[onerror],[onclick]')).toBeNull(); expect(doc.images).toHaveLength(1); expect(doc.body.textContent).toContain(input.full_name); expect(doc.body.textContent).toContain(input.specialty_name); expect(doc.body.textContent).toContain('Место выдачи не указано'); expect(doc.body.textContent).not.toContain('Москва');
  });
  it('fails visibly when local QR generation or a stamp source is unsafe, with no external generator fallback', async () => {
    mock.qr.mockRejectedValueOnce(new Error('Local QR failed')); await expect(generateEducationDocumentHtml(record(), { name: 'Центр' })).rejects.toThrow('Local QR failed');
    await expect(generateEducationDocumentHtml(record(), { name: 'Центр', signature_url: 'javascript:steal()' })).rejects.toMatchObject({ code: 'UNSUPPORTED_RESOURCE' });
  });
});
