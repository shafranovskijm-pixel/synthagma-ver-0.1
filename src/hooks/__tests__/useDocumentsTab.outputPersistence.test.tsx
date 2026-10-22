import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setOfflineAuthActor, observeOfflineAccess } from '@/utils/courseCache';
const m = vi.hoisted(() => ({ insert: vi.fn(), notice: vi.fn(), word: vi.fn(), warning: vi.fn(), error: vi.fn(), success: vi.fn(), invoiceResult: vi.fn() }));
vi.mock('@/contexts/OrgDashboardContext', () => ({ useOrgDashboard: () => ({ organizationName: 'Синтетическая QA организация' }) }));
vi.mock('../useSubscriptionLimits', () => ({ useSubscriptionLimits: () => ({ plan: 'start' }) }));
vi.mock('../usePostpaidAccessProfile', () => ({ usePostpaidAccessProfile: () => ({ data: { active: false }, isLoading: false, error: null }) }));
vi.mock('@/lib/postpaidAccess', () => ({ fetchPostpaidAccessProfile: async () => ({ active: false }) }));
vi.mock('@/constants/invoiceTemplate', () => ({ generateInvoiceHtml: vi.fn() }));
vi.mock('sonner', () => ({ toast: { error: m.error, warning: m.warning, success: m.success } }));
vi.mock('@/lib/documents/downloadHtmlWord', () => ({ downloadHtmlWord: m.word }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { from: (table: string) => {
            if (table === 'admin_notifications')
                return { insert: m.notice };
            const response = { data: [], error: null, count: 0 };
            let chain: any;
            chain = new Proxy({}, { get: (_target, key) => key === 'then' ? Promise.resolve(response).then.bind(Promise.resolve(response)) : key === 'insert' ? (data: unknown) => { m.insert(data); return { select: () => ({ single: m.invoiceResult }) }; } : () => chain });
            return chain;
        } } }));
import { useDocumentsTab } from '../useDocumentsTab';
const draft = { html: '<p>QA invoice</p>', insertData: { organization_id: 'QA-org', invoice_number: 'QA-1', plan: 'start' }, invoiceNum: 'QA-1', amount: 4490, plan: 'start' };
beforeEach(() => { setOfflineAuthActor(null); vi.clearAllMocks(); m.invoiceResult.mockReset().mockResolvedValue({ data: { id: 'QA-invoice' }, error: null }); m.notice.mockReset().mockResolvedValue({ error: null }); m.word.mockResolvedValue(true); });
afterEach(() => { cleanup(); setOfflineAuthActor(null); });
describe('invoice persistence consumes only the confirmed snapshot', () => {
    it('does not leave a saved invoice retry draft when the later notification fails', async () => {
        m.notice.mockResolvedValue({ error: { message: 'Notification unavailable' } });
        const h = renderHook(() => useDocumentsTab('QA-org'));
        act(() => h.result.current.setPendingInvoice(draft));
        await act(async () => { await h.result.current.handleSavePendingInvoice('download'); });
        expect(h.result.current.pendingInvoice).toBeNull();
        expect(m.insert).toHaveBeenCalledOnce();
        expect(m.notice).toHaveBeenCalledOnce();
        expect(m.word).not.toHaveBeenCalled();
        expect(m.success).not.toHaveBeenCalled();
        expect(m.warning).toHaveBeenCalledWith(expect.stringContaining('Счёт уже сохранён'), expect.anything());
        await act(async () => { await h.result.current.handleSavePendingInvoice('download'); });
        expect(m.insert).toHaveBeenCalledOnce();
    });
    it('consumes a saved invoice before a delayed response meets changed access, retaining any newer draft', async () => {
        setOfflineAuthActor('QA-A');
        let done!: (value: unknown) => void;
        m.invoiceResult.mockImplementation(() => new Promise(resolve => { done = resolve; }));
        const h = renderHook(() => useDocumentsTab('QA-org'));
        act(() => h.result.current.setPendingInvoice(draft));
        let first!: Promise<void>;
        await act(async () => { first = h.result.current.handleSavePendingInvoice('download'); });
        const newer = { ...draft, invoiceNum: 'QA-2', insertData: { ...draft.insertData, invoice_number: 'QA-2' } };
        act(() => h.result.current.setPendingInvoice(newer));
        observeOfflineAccess('QA-A', 'changed');
        await act(async () => { done({ data: { id: 'QA-invoice' }, error: null }); await first; });
        expect(h.result.current.pendingInvoice).toEqual(newer);
        expect(m.notice).not.toHaveBeenCalled();
        expect(m.word).not.toHaveBeenCalled();
        expect(m.insert).toHaveBeenCalledOnce();
    });
    it('keeps an actually rejected invoice draft available for retry without output', async () => {
        m.invoiceResult.mockResolvedValue({ data: null, error: { message: 'Registry rejected' } });
        const h = renderHook(() => useDocumentsTab('QA-org'));
        act(() => h.result.current.setPendingInvoice(draft));
        await act(async () => { await h.result.current.handleSavePendingInvoice('download'); });
        expect(h.result.current.pendingInvoice).toEqual(draft);
        expect(m.notice).not.toHaveBeenCalled();
        expect(m.word).not.toHaveBeenCalled();
        expect(m.warning).not.toHaveBeenCalled();
        expect(m.error).toHaveBeenCalled();
    });
});
