import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
import { CopyRegistryError } from '@/lib/copyRegistry/errors';
import { base, capabilities, data, group, org, preview, record, uid } from '@/lib/copyRegistry/__tests__/fixtures';
import { ServerCopiesDuplicatesJournal } from '../ServerCopiesDuplicatesJournal';

const mock = vi.hoisted(() => ({ model: null as any, provider: null as null | (() => any), error: vi.fn(), success: vi.fn() }));
vi.mock('@/hooks/useCopyRegistry', () => ({ useCopyRegistry: () => mock.provider ? mock.provider() : mock.model }));
vi.mock('sonner', () => ({ toast: { error: mock.error, success: mock.success } }));
vi.mock('@/lib/copyRegistry/excel', () => ({ downloadCopyRegistryExcel: vi.fn() }));
beforeEach(() => {
  vi.clearAllMocks(); mock.provider = null;
  const row = record(); row.data.document_date = new Date().toISOString().slice(0, 10);
  mock.model = { contextKey: 'current-actor-and-scope', organizationId: org, registryScope: { kind: 'organization' }, scopeCurrent: () => true, records: [row], next: null, capabilities: { ...capabilities }, registryRevision: 101, loading: false, saving: false, pending: false, error: null, mutationError: null,
    read: vi.fn(async ({ kind }: any) => ({ ...base(), kind, [kind]: [], next_after_id: null })), mutate: vi.fn(), reload: vi.fn(), loadMore: vi.fn(), retry: vi.fn(), cancelRejected: vi.fn() };
});
afterEach(cleanup);
describe('production server copies journal presentation and actions', () => {
  it('distinguishes registration, loaded-page counts and an actual transfer; unavailable source keeps archival available', async () => {
    await act(async () => { render(<ServerCopiesDuplicatesJournal organizationId={org} onClose={vi.fn()} />); });
    await waitFor(() => expect(mock.model.read).toHaveBeenCalled());
    expect(screen.getByText('Внутренний номер')).toBeInTheDocument(); expect(screen.getByText('Не зафиксирована')).toBeInTheDocument();
    expect(screen.getByText('Записей в выборке')).toBeInTheDocument(); expect(screen.getByText(/Фильтры относятся к загруженным страницам/)).toBeInTheDocument();
    expect(screen.getByText('Недоступен с текущими правами')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'В архив ' + record().registration_id })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Исправить ' + record().registration_id })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Зафиксировать передачу ' + record().registration_id })).toBeDisabled();
  });
  it('shows a clear source-permission reason and no raw-import entry point to a group reader', async () => {
    mock.model.registryScope = { kind: 'group', group_id: group }; mock.model.capabilities = { ...capabilities, can_write: false, can_create: false, can_import: false, can_inventory_local: false }; mock.model.records[0].can_archive = false;
    const localRead = vi.spyOn(Storage.prototype, 'getItem');
    await act(async () => { render(<ServerCopiesDuplicatesJournal organizationId={org} registryScope={{ kind: 'group', group_id: group }} onClose={vi.fn()} />); });
    await waitFor(() => expect(screen.getByText(/Общий реестр этой группы/)).toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'Добавить' })).toBeDisabled(); expect(screen.getByText(/Добавление записи требует права вести реестр/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Перенести прежние записи' })).not.toBeInTheDocument(); expect(localRead).not.toHaveBeenCalledWith('copies_duplicates_' + org); localRead.mockRestore();
  });
  it('archives with a mandatory reason and the exact loaded revision, retaining the entry rather than deleting data', async () => {
    mock.model.mutate.mockResolvedValue({ ...base(), kind: 'archive', request_id: uid(50), replayed: false, record: { ...mock.model.records[0], archived: true, revision: 2 } });
    await act(async () => { render(<ServerCopiesDuplicatesJournal organizationId={org} onClose={vi.fn()} />); });
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'В архив ' + record().registration_id })));
    expect(screen.getByRole('button', { name: 'Сохранить' })).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Причина фиксации *'), { target: { value: 'Ошибочная запись сохранена в архиве' } });
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Сохранить' })));
    expect(mock.model.mutate).toHaveBeenCalledWith(1, { action: 'archive', record_id: record().id, reason: 'Ошибочная запись сохранена в архиве' }); expect(mock.success).toHaveBeenCalledWith(expect.stringContaining('номер и история остались'));
  });
  it('clears an open private editor when a server capability downgrade arrives before the permission provider', async () => {
    mock.model.records[0].can_edit = true; mock.model.records[0].original_label = 'Previously private source title';
    mock.model.read.mockImplementation(async ({ kind }: any) => kind === 'originals' ? { ...base(), kind, originals: [{ label: 'Previously private source title', original: data().original }], next_after_id: null } : { ...base(), kind, [kind]: [], next_after_id: null });
    let page: ReturnType<typeof render>; await act(async () => { page = render(<ServerCopiesDuplicatesJournal organizationId={org} onClose={vi.fn()} />); });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Добавить' })).toBeEnabled());
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Исправить ' + record().registration_id })); }); expect(screen.getByLabelText('Внутренний номер реестра')).toBeInTheDocument();
    mock.model = { ...mock.model, capabilities: { ...capabilities, can_create: false, can_write: false, can_import: false, can_inventory_local: false }, records: [{ ...mock.model.records[0], original_label: null, can_edit: false, can_transfer: false, can_archive: false }] };
    await act(async () => { page.rerender(<ServerCopiesDuplicatesJournal organizationId={org} onClose={vi.fn()} />); });
    expect(screen.queryByLabelText('Внутренний номер реестра')).not.toBeInTheDocument(); expect(screen.queryByText('Previously private source title')).not.toBeInTheDocument();
  });
  it('refreshes the visible main list after confirmed import while retaining the saved source and report', async () => {
    const imported = preview(), summary = { ...imported, report_counts: null }, initial = mock.model;
    const fresh = record(9); fresh.data.document_date = new Date().toISOString().slice(0, 10); fresh.recipient_label = 'Импортированный получатель после чтения сервера';
    const read = vi.fn(async ({ kind }: any) => kind === 'imports' ? { ...base(), kind, imports: [summary], next_after_id: null } : kind === 'import' ? { ...base(), kind, import: imported } : { ...base(), kind, [kind]: [], next_after_id: null });
    const reload = vi.fn();
    initial.mutate.mockImplementation(async (_revision: number, action: any) => ({ ...base(), kind: 'apply_import', request_id: uid(50), replayed: false, import: { ...imported, status: 'applied', report: { decisions: action.decisions, imported: 1, reused: 0, skipped: 0 } } }));
    mock.provider = () => { const [rows, setRows] = useState([]); return { ...initial, records: rows, read, reload: async () => { reload(); setRows([fresh]); } }; };
    await act(async () => { render(<ServerCopiesDuplicatesJournal organizationId={org} onClose={vi.fn()} />); });
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Открыть источник и отчёт' })));
    fireEvent.click(screen.getByRole('button', { name: 'Выбрать подходящие строки из всего источника' }));
    fireEvent.change(screen.getByLabelText(/Общее основание решений/), { target: { value: 'Подтверждены решения переноса' } });
    const dialog = screen.getByRole('dialog'); fireEvent.click(dialog.querySelector('input[type="checkbox"]')!);
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Подтвердить перенос и сохранить отчёт' })));
    await waitFor(() => expect(reload).toHaveBeenCalledOnce()); expect(screen.getByRole('status')).toHaveTextContent('Отчёт: перенесено 1');
    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument()); expect(screen.getByText(fresh.recipient_label)).toBeVisible();
  });
  it('does not replace a newly selected source workspace with an older slow saved-report response', async () => {
    const imported = preview(); let resolve!: (value: any) => void; const pending = new Promise<any>(yes => { resolve = yes; });
    mock.model.read.mockImplementation(async ({ kind }: any) => kind === 'imports' ? { ...base(), kind, imports: [{ ...imported, report_counts: null }], next_after_id: null } : kind === 'import' ? pending : { ...base(), kind, [kind]: [], next_after_id: null });
    await act(async () => { render(<ServerCopiesDuplicatesJournal organizationId={org} onClose={vi.fn()} />); });
    fireEvent.click(screen.getByRole('button', { name: 'Открыть источник и отчёт' }));
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Перенести прежние записи' })));
    expect(screen.getByLabelText('Файл прежнего журнала')).toBeInTheDocument();
    await act(async () => resolve({ ...base(), kind: 'import', import: imported }));
    expect(screen.queryByText('Строк в исходнике: 1')).not.toBeInTheDocument(); expect(screen.queryByText('Сохранённый исходник переноса')).not.toBeInTheDocument();
  });
  it.each(['REVISION_CONFLICT', 'DEPENDENCY_UNAVAILABLE'] as const)('keeps failed archive details visible in the modal for %s without a false success or history event', async code => {
    mock.model.mutate.mockRejectedValue(new CopyRegistryError(code));
    await act(async () => { render(<ServerCopiesDuplicatesJournal organizationId={org} onClose={vi.fn()} />); });
    fireEvent.click(screen.getByRole('button', { name: 'В архив ' + record().registration_id }));
    const dialog = screen.getByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText('Причина фиксации *'), { target: { value: 'Введённое основание архивации' } });
    await act(async () => fireEvent.click(within(dialog).getByRole('button', { name: 'Сохранить' })));
    expect(within(dialog).getByRole('alert')).toHaveTextContent(code === 'REVISION_CONFLICT' ? 'действие не записано' : 'Результат пока не подтверждён');
    expect(within(dialog).getByLabelText('Причина фиксации *')).toHaveValue('Введённое основание архивации');
    expect(mock.model.mutate).toHaveBeenCalledWith(1, { action: 'archive', record_id: record().id, reason: 'Введённое основание архивации' });
    expect(mock.success).not.toHaveBeenCalled(); expect(mock.model.reload).not.toHaveBeenCalled();
    expect(mock.model.records[0].revision).toBe(1); expect(mock.model.records[0].archived).toBe(false);
  });
  it('shows transfer validation inside the modal, then preserves transfer text on a stale revision without recording it', async () => {
    mock.model.records[0].can_transfer = true; mock.model.mutate.mockRejectedValue(new CopyRegistryError('REVISION_CONFLICT'));
    await act(async () => { render(<ServerCopiesDuplicatesJournal organizationId={org} onClose={vi.fn()} />); });
    fireEvent.click(screen.getByRole('button', { name: 'Зафиксировать передачу ' + record().registration_id }));
    const dialog = screen.getByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText('Причина фиксации *'), { target: { value: 'Сообщение сотрудника' } });
    await act(async () => fireEvent.click(within(dialog).getByRole('button', { name: 'Сохранить' })));
    expect(within(dialog).getByRole('alert')).toHaveTextContent('Проверьте обязательные поля'); expect(mock.model.mutate).not.toHaveBeenCalled();
    fireEvent.change(within(dialog).getByLabelText('Сведения о передаче *'), { target: { value: 'Подтверждение вручения, введённое сотрудником' } });
    await act(async () => fireEvent.click(within(dialog).getByRole('button', { name: 'Сохранить' })));
    expect(within(dialog).getByRole('alert')).toHaveTextContent('нажмите «Отмена», обновите реестр');
    expect(within(dialog).getByLabelText('Сведения о передаче *')).toHaveValue('Подтверждение вручения, введённое сотрудником');
    expect(mock.model.mutate).toHaveBeenCalledOnce(); expect(mock.success).not.toHaveBeenCalled(); expect(mock.model.records[0].latest_transfer).toBeNull();
  });

});
