import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { base, event, incoming, legacy, org, record, uid } from '@/lib/documentRegistry/__tests__/fixtures';
const mock = vi.hoisted(() => ({ model: null as any, openFile: vi.fn() }));
vi.mock('@/hooks/useDocumentRegistry', () => ({ useDocumentRegistry: () => mock.model }));
vi.mock('../RegistryFileViewer', () => ({ useRegistryFileViewer: () => ({ open: mock.openFile, dialog: null, busy: false }) }));
vi.mock('@/lib/documentRegistry/export', () => ({ downloadRegistryExport: vi.fn() }));
import { ServerDocumentRegistrationJournal } from '../ServerDocumentRegistrationJournal';
import { IncomingDocumentsManager } from '../IncomingDocumentsManager';
import { DocumentRegistryError } from '@/lib/documentRegistry/errors';
beforeEach(() => { vi.clearAllMocks(); const row = record(); mock.model = { contextKey: 'current', organizationId: org, registryScope: { kind: 'organization' }, scopeCurrent: () => true, records: [row], incoming: [incoming()], next: 'next', counts: { total: 101, incoming: 31, outgoing: 70, contracts: 11, orders: 22 }, capabilities: base().capabilities, filters: { direction: 'all', document_type: 'all', status: 'registered', date_from: '2026-01-01', date_to: '2026-12-31', text: '' }, setFilters: vi.fn(), registryRevision: 101, loading: false, saving: false, pending: false, error: null, mutationError: null, read: vi.fn(async ({ kind }: any) => ({ ...base(), kind, legacy_records: Array.from({ length: 8 }, (_, index) => legacy(index + 1)), next_after_id: null })), mutate: vi.fn(), reload: vi.fn(), loadMore: vi.fn() }; });
afterEach(cleanup);
describe('shared document registry presentation', () => {
  it('shows full server-filtered counters separately from loaded rows and labels the internal and reported numbers honestly', async () => {
    render(<ServerDocumentRegistrationJournal organizationId={org} onClose={vi.fn()} />);
    expect(screen.getByText('101')).toBeInTheDocument(); expect(screen.getByText(/Загружено 1 из 101/)).toBeInTheDocument(); expect(screen.getByText('Внутренний номер')).toBeInTheDocument(); expect(screen.getByText('Заявленный № З-17')).toBeInTheDocument(); expect(screen.getByText(/Регистрация не подтверждает выдачу или вручение/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Предпросмотр ' + record().registration_id })); expect(mock.openFile).toHaveBeenCalledWith({ kind: 'record', row: mock.model.records[0] });
  });
  it('keeps all eight old issuance claims read-only and does not display a fabricated file or recipient based on the stored issuer', async () => {
    render(<ServerDocumentRegistrationJournal organizationId={org} onClose={vi.fn()} />); await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Исторические записи выдачи' })));
    expect(screen.getAllByText('Файл отсутствует в исторической записи')).toHaveLength(8); expect(screen.getAllByText(/Исторический номер:/)).toHaveLength(8); expect(screen.getAllByRole('button', { name: 'Связать с сохранённым файлом' })).toHaveLength(8);
    expect(screen.queryByRole('button', { name: /^Скачать / })).not.toBeInTheDocument(); expect(screen.getByText(/получатель не определяется по автору записи/)).toBeInTheDocument();
  });
  it('keeps archive conflict visible in the modal without false success or record replacement', async () => {
    mock.model.mutate.mockRejectedValue(new DocumentRegistryError('REVISION_CONFLICT')); render(<ServerDocumentRegistrationJournal organizationId={org} onClose={vi.fn()} />); fireEvent.click(screen.getByRole('button', { name: 'В архив ' + record().registration_id })); const dialog = screen.getByRole('dialog'); fireEvent.change(within(dialog).getByLabelText('Причина переноса в архив *'), { target: { value: 'Моя причина' } });
    await act(async () => fireEvent.click(within(dialog).getByRole('button', { name: 'Сохранить' })));
    expect(within(dialog).getByRole('alert')).toHaveTextContent('Введённый текст остался в форме'); expect(within(dialog).getByLabelText('Причина переноса в архив *')).toHaveValue('Моя причина'); expect(mock.model.reload).not.toHaveBeenCalled(); expect(mock.model.records[0].revision).toBe(1);
  });
  it('opens exact server history, retaining actor attribution separate from learner and recipient', async () => {
    mock.model.read.mockResolvedValue({ ...base(), kind: 'history', history: [event(record())], next_after_revision: null }); render(<ServerDocumentRegistrationJournal organizationId={org} onClose={vi.fn()} />); await act(async () => fireEvent.click(screen.getByRole('button', { name: 'История ' + record().registration_id })));
    expect(mock.model.read).toHaveBeenCalledWith({ kind: 'history', record_id: record().id, after_revision: 0, limit: 100 }); const dialog = screen.getByRole('dialog'); expect(within(dialog).getByText(/Основание: Проверенное основание/)).toBeInTheDocument(); expect(within(dialog).getByText(/Сотрудник/)).toBeInTheDocument();
  });
  it('preserves existing incoming business links and resolves the actual server descriptor instead of guessing a bucket or falling back to a public URL', async () => {
    render(<IncomingDocumentsManager organizationId={org} />); expect(screen.getByText(/Прежние связи с подписанием/)).toBeInTheDocument(); fireEvent.click(screen.getByRole('button', { name: 'Скачать ' + incoming().title })); expect(mock.openFile).toHaveBeenCalledWith({ kind: 'incoming', row: mock.model.incoming[0] }, true); expect(screen.queryByRole('button', { name: /Изменить связь/ })).not.toBeInTheDocument();
  });
  it('lets a docs.write-only actor save their own incoming source while exposing neither old rows nor general registration', async () => {
    mock.model.incoming = []; mock.model.records = []; mock.model.next = null; mock.model.capabilities = { ...base().capabilities, can_read: false, can_read_incoming: false, can_open_file: false, can_register_incoming: false, can_register: false };
    render(<IncomingDocumentsManager organizationId={org} />); expect(screen.getByRole('button', { name: 'Загрузить' })).toBeEnabled(); expect(screen.getByText(/прежние документы не раскрываются/)).toBeInTheDocument(); expect(screen.queryByText('Входящий исходник')).not.toBeInTheDocument();
  });
});
