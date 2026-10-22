import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { webcrypto } from 'node:crypto';
import { org, preview, record } from '@/lib/copyRegistry/__tests__/fixtures';
import { CopyRegistryImport } from '../CopyRegistryImport';
import type { CopyRegistryModel } from '@/hooks/useCopyRegistry';
import type { CopyImportSource } from '@/lib/copyRegistry/legacySource';

vi.mock('sonner', () => ({ toast: { info: vi.fn() } }));
vi.mock('../CopyRegistryForm', () => ({ CopyChoice: ({ label, value, options, onChange, disabled }: any) => <label>{label}<select aria-label={label} value={value} onChange={event => onChange(event.target.value)} disabled={disabled}>{options.map((option: any) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label> }));
beforeEach(() => { localStorage.clear(); vi.stubGlobal('crypto', webcrypto); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
function setup() {
  const imported = preview(101); imported.rows[100].valid = false; imported.rows[100].candidate = null; imported.rows[100].conflicts.push('INVALID_ROW');
  const mutate = vi.fn(async () => undefined), current = vi.fn(() => true);
  const model = { organizationId: org, registryScope: { kind: 'organization' }, capabilities: { can_inventory_local: true, can_import: true }, scopeCurrent: current, saving: false, pending: false, mutate } as unknown as CopyRegistryModel;
  const source: CopyImportSource = { origin: 'file', name: 'historical101.json', raw: imported.source_raw, sha256: imported.source_sha256 };
  return { imported, model, source, mutate, current };
}
describe('reviewable historical copies import', () => {
  it('requires a reason and acknowledgement, and bulk decisions include all 101 source rows beyond the visible page', async () => {
    const { imported, model, source, mutate } = setup(); const remove = vi.spyOn(Storage.prototype, 'removeItem'), write = vi.spyOn(Storage.prototype, 'setItem');
    render(<CopyRegistryImport model={model} source={source} preview={imported} onSource={vi.fn()} onResult={vi.fn()} />);
    expect(screen.getByText('Строк в исходнике: 101')).toBeInTheDocument(); expect(screen.getByText(/Показаны строки 1–25 из 101/)).toBeInTheDocument();
    const confirm = screen.getByRole('button', { name: 'Подтвердить перенос и сохранить отчёт' }); expect(confirm).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Выбрать подходящие строки из всего источника' }));
    fireEvent.change(screen.getByLabelText(/Общее основание решений/), { target: { value: 'Перенос проверенного старого журнала с сохранением исторических сведений' } });
    expect(confirm).toBeDisabled(); fireEvent.click(screen.getByRole('checkbox')); expect(confirm).toBeEnabled();
    await act(async () => { fireEvent.click(confirm); });
    expect(mutate).toHaveBeenCalledOnce(); const [revision, action] = mutate.mock.calls[0] as unknown as [number, any];
    expect(revision).toBe(imported.registry_revision); expect(action.action).toBe('apply_import'); expect(action.decisions).toHaveLength(101);
    expect(action.decisions[99]).toMatchObject({ index: 99, choice: 'import', existing_id: null }); expect(action.decisions[100]).toMatchObject({ index: 100, choice: 'skip', existing_id: null });
    expect(action.decisions.every((row: any) => row.reason.length > 0)).toBe(true); expect(write).not.toHaveBeenCalled(); expect(remove).not.toHaveBeenCalled();
  });
  it('allows an exact already-imported row to be reused without merging a number claim', async () => {
    const { imported, model, source, mutate } = setup(); imported.rows[0].existing_id = record().id; imported.rows[0].conflicts.push('ALREADY_IMPORTED', 'NUMBER_CLAIM_CONFLICT');
    render(<CopyRegistryImport model={model} source={source} preview={imported} onSource={vi.fn()} onResult={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Выбрать подходящие строки из всего источника' }));
    expect(screen.getByLabelText('Решение для строки 1')).toHaveValue('reuse');
    fireEvent.change(screen.getByLabelText(/Общее основание решений/), { target: { value: 'Повторный источник проверен' } }); fireEvent.click(screen.getByRole('checkbox'));
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Подтвердить перенос и сохранить отчёт' })));
    expect((mutate.mock.calls[0] as any)[1].decisions[0]).toMatchObject({ choice: 'reuse', existing_id: record().id });
  });
  it('refuses apply if the original browser bytes changed after preview, preserving the newer bytes', async () => {
    const { imported, model, source, mutate } = setup(); const key = 'copies_duplicates_' + org;
    localStorage.setItem(key, source.raw); const browserSource: CopyImportSource = { ...source, origin: 'browser', name: key };
    render(<CopyRegistryImport model={model} source={browserSource} preview={imported} onSource={vi.fn()} onResult={vi.fn()} />);
    fireEvent.change(screen.getByLabelText(/Общее основание решений/), { target: { value: 'Проверено' } }); fireEvent.click(screen.getByRole('checkbox')); localStorage.setItem(key, 'newer raw bytes');
    const write = vi.spyOn(Storage.prototype, 'setItem'), remove = vi.spyOn(Storage.prototype, 'removeItem');
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Подтвердить перенос и сохранить отчёт' })));
    expect(screen.getByRole('alert')).toHaveTextContent('Источник в браузере изменился'); expect(mutate).not.toHaveBeenCalled(); expect(localStorage.getItem(key)).toBe('newer raw bytes'); expect(write).not.toHaveBeenCalled(); expect(remove).not.toHaveBeenCalled();
  });
  it('does not inspect a browser-wide legacy key from a group-limited actor', async () => {
    const { model } = setup(); model.registryScope = { kind: 'group', group_id: record().id }; model.capabilities = { ...model.capabilities!, can_inventory_local: false, can_import: false };
    const read = vi.spyOn(Storage.prototype, 'getItem');
    render(<CopyRegistryImport model={model} source={null} preview={null} onSource={vi.fn()} onResult={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Проверить прежний журнал этого браузера' })).toBeDisabled(); expect(read).not.toHaveBeenCalled();
  });
});
