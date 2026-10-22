import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { base, org, source } from '@/lib/documentRegistry/__tests__/fixtures';
import type { DocumentRegistryModel } from '@/hooks/useDocumentRegistry';
const mock = vi.hoisted(() => ({ prepare: vi.fn(), upload: vi.fn(), success: vi.fn(), current: true }));
vi.mock('@/lib/documentRegistry/files', () => ({ prepareRegistrySourceUpload: mock.prepare, uploadRegistrySource: mock.upload }));
vi.mock('sonner', () => ({ toast: { success: mock.success } }));
import { RegistrySourceField } from '../RegistrySourceField';
import { DocumentRegistryError } from '@/lib/documentRegistry/errors';
beforeEach(() => { vi.clearAllMocks(); mock.upload.mockReset(); mock.current = true; mock.prepare.mockReturnValue({ documentId: source.document_id, requestId: source.version_id }); }); afterEach(cleanup);
function setup() { const read = vi.fn(async () => ({ ...base(), kind: 'source', source: { label: 'Точный собственный исходник', source } })), change = vi.fn(), busy = vi.fn(); const model = { organizationId: org, scope: { organizationId: org }, scopeCurrent: () => mock.current, capabilities: { ...base().capabilities, can_open_file: false }, read } as unknown as DocumentRegistryModel; render(<RegistrySourceField model={model} value={{ label: 'Прежний выбор', source }} title="Новый исходник" onChange={change} onBusy={busy} />); return { read, change, busy }; }
describe('source upload identity is separate from registration', () => {
  it('retries the same staged source after uncertainty, requests proof by exact committed IDs and never lists old private files', async () => {
    mock.upload.mockRejectedValueOnce(new DocumentRegistryError('DEPENDENCY_UNAVAILABLE')).mockResolvedValueOnce({ document_id: source.document_id, version_id: source.version_id }); const { read, change, busy } = setup();
    const file = new File(['synthetic QA'], 'source.txt', { type: 'text/plain' }); fireEvent.change(screen.getByLabelText('Новый исходный файл'), { target: { files: [file] } });
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Сохранить версию файла' })));
    expect(screen.getByRole('alert')).toHaveTextContent('Результат запроса пока не подтверждён'); expect(change).toHaveBeenCalledWith(null); expect(screen.getByLabelText('Новый исходный файл')).toBeDisabled();
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Повторить сохранение той же версии' })));
    expect(mock.prepare).toHaveBeenCalledOnce(); expect(mock.upload.mock.calls[0][1]).toBe(mock.upload.mock.calls[1][1]); expect(read).toHaveBeenCalledOnce(); expect(read).toHaveBeenCalledWith({ kind: 'source', document_id: source.document_id, version_id: source.version_id });
    expect(change).toHaveBeenLastCalledWith({ label: 'Точный собственный исходник', source }); expect(busy).toHaveBeenLastCalledWith(false); expect(mock.success).toHaveBeenCalledWith(expect.stringContaining('Регистрация выполняется отдельно'));
  });
  it('does not accept proof or announce success after the current actor changes during upload', async () => {
    mock.upload.mockImplementation(async () => { mock.current = false; return { document_id: source.document_id, version_id: source.version_id }; }); const { read, change } = setup();
    fireEvent.change(screen.getByLabelText('Новый исходный файл'), { target: { files: [new File(['qa'], 'source.txt')] } }); await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Сохранить версию файла' })));
    expect(read).not.toHaveBeenCalled(); expect(change.mock.calls).toEqual([[null]]); expect(mock.success).not.toHaveBeenCalled();
  });
});
