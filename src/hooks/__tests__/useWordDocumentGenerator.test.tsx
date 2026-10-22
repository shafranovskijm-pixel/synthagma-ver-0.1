import { setOfflineAuthActor } from '@/utils/courseCache';
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useWordDocumentGenerator } from '../useWordDocumentGenerator';
import { buildWordDocument } from '@/lib/documents/wordDocument';
const m = vi.hoisted(() => ({ blob: vi.fn(), download: vi.fn(), success: vi.fn(), error: vi.fn() }));
vi.mock('@/lib/docx/htmlToDocx', async (original) => ({ ...await original<typeof import('@/lib/docx/htmlToDocx')>(), htmlToDocxBlob: m.blob, downloadBlob: m.download }));
vi.mock('sonner', () => ({ toast: { success: m.success, error: m.error } }));
beforeEach(() => { vi.clearAllMocks(); m.blob.mockResolvedValue(new Blob(['PK'])); m.download.mockReset(); });
describe('editable Word draft', () => {
    it('does not turn missing assessments into passed and keeps explicit negative results', () => {
        const result = buildWordDocument({ templateType: 'protokol', persons: [{ fullName: 'Без оценки' }, { fullName: 'Сдал явно', isPassed: true }, { fullName: 'Не сдал явно', isPassed: false }] }, new Date(2026, 9, 22));
        const doc = new DOMParser().parseFromString(result.html, 'text/html');
        const rows = [...doc.querySelectorAll('tr')].slice(1);
        expect(rows.map(r => r.lastElementChild!.textContent)).toEqual(['Результат не указан', 'Сдал', 'Не сдал']);
        expect(result.fileName).toMatch(/\.docx$/);
    });
    it('uses the requested enrollment purpose and does not invent a statutory basis', () => {
        const doc = buildWordDocument({ templateType: 'prikaz', purpose: 'enrollment', persons: [{ fullName: 'Иванов <Иван>' }] }).html;
        expect(doc).toContain('О зачислении на обучение (проект)');
        expect(doc).not.toContain('№ 2464');
        expect(doc).toContain('Иванов &lt;Иван&gt;');
    });
    it('prevents concurrent clicks while real DOCX conversion is pending', async () => {
        let done!: (blob: Blob) => void;
        m.blob.mockImplementation(() => new Promise(resolve => { done = resolve; }));
        const h = renderHook(() => useWordDocumentGenerator());
        let first!: Promise<boolean>;
        await act(async () => { first = h.result.current.generateDocument({ templateType: 'prikaz', persons: [{ fullName: 'QA' }] }); const second = await h.result.current.generateDocument({ templateType: 'prikaz', persons: [{ fullName: 'QA' }] }); expect(second).toBe(false); });
        expect(m.blob).toHaveBeenCalledOnce();
        await act(async () => { done(new Blob(['PK'])); expect(await first).toBe(true); });
        expect(m.download).toHaveBeenCalledWith(expect.any(Blob), expect.stringMatching(/\.docx$/));
    });
    it('never announces success or starts a download when conversion fails; permits a clean retry', async () => {
        m.blob.mockRejectedValueOnce(new Error('Подпись недоступна'));
        const h = renderHook(() => useWordDocumentGenerator());
        await act(async () => { expect(await h.result.current.generateDocument({ templateType: 'protokol', persons: [{ fullName: 'QA' }] })).toBe(false); });
        expect(m.download).not.toHaveBeenCalled();
        expect(m.success).not.toHaveBeenCalled();
        expect(h.result.current.isGenerating).toBe(false);
        await act(async () => { expect(await h.result.current.generateDocument({ templateType: 'protokol', persons: [{ fullName: 'QA' }] })).toBe(true); });
        expect(m.download).toHaveBeenCalledOnce();
    });
    it('reports browser handoff failure rather than pretending a file was saved', async () => {
        m.download.mockImplementation(() => { throw new Error('Download blocked'); });
        const h = renderHook(() => useWordDocumentGenerator());
        await act(async () => { expect(await h.result.current.generateDocument({ templateType: 'prikaz', persons: [{ fullName: 'QA' }] })).toBe(false); });
        expect(m.success).not.toHaveBeenCalled();
        expect(m.error).toHaveBeenCalledWith('Не удалось сформировать DOCX', expect.objectContaining({ description: 'Download blocked' }));
    });
    it('cancels an in-flight Word handoff after account change', async () => {
        setOfflineAuthActor('QA-A');
        let done!: (blob: Blob) => void;
        m.blob.mockImplementation(() => new Promise(resolve => { done = resolve; }));
        const h = renderHook(() => useWordDocumentGenerator());
        let result!: Promise<boolean>;
        await act(async () => { result = h.result.current.generateDocument({ templateType: 'prikaz', persons: [{ fullName: 'QA-A' }] }); });
        setOfflineAuthActor('QA-B');
        await act(async () => { done(new Blob(['PK'])); expect(await result).toBe(false); });
        expect(m.download).not.toHaveBeenCalled();
        expect(m.success).not.toHaveBeenCalled();
        setOfflineAuthActor(null);
    });
});
