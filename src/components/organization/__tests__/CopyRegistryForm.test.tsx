import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import type { CopyRegistryModel } from '@/hooks/useCopyRegistry';
import { CopyRegistryError } from '@/lib/copyRegistry/errors';
import { original, record } from '@/lib/copyRegistry/__tests__/fixtures';
import { CopyRegistryForm } from '../CopyRegistryForm';

vi.mock('sonner', () => ({ toast: { error: vi.fn() } }));
afterEach(cleanup);

function setup() {
  const row = { ...record(), can_edit: true };
  const mutate = vi.fn(async () => { throw new CopyRegistryError('REVISION_CONFLICT'); });
  const onSaved = vi.fn(), onCancel = vi.fn();
  const model = { saving: false, pending: false, capabilities: { can_create: true }, scopeCurrent: () => true, mutate } as unknown as CopyRegistryModel;
  render(<Dialog open><DialogContent><DialogTitle>Исправление записи</DialogTitle><DialogDescription>Проверка видимого сообщения</DialogDescription><CopyRegistryForm model={model} record={row} originals={[{ label: 'Проверенная версия', original }]} people={[]} originalsNext={false} peopleNext={false} onMoreOriginals={vi.fn()} onMorePeople={vi.fn()} onCancel={onCancel} onSaved={onSaved} /></DialogContent></Dialog>);
  return { row, mutate, onSaved, onCancel, dialog: screen.getByRole('dialog') };
}

describe('copy edit errors inside the active dialog', () => {
  it('keeps a persistent conflict explanation and the entered text without saving or merging a newer revision', async () => {
    const { row, mutate, onSaved, onCancel, dialog } = setup();
    fireEvent.change(within(dialog).getByLabelText('Примечание'), { target: { value: 'Текст сотрудника Б, который нужно сохранить' } });
    fireEvent.change(within(dialog).getByLabelText('Причина исправления *'), { target: { value: 'Уточнение сведений' } });
    await act(async () => fireEvent.click(within(dialog).getByRole('button', { name: 'Сохранить исправление' })));
    expect(within(dialog).getByRole('alert')).toHaveTextContent('Запись изменил другой сотрудник');
    expect(within(dialog).getByRole('alert')).toHaveTextContent('нажмите «Отмена», обновите реестр');
    expect(within(dialog).getByLabelText('Примечание')).toHaveValue('Текст сотрудника Б, который нужно сохранить');
    expect(within(dialog).getByLabelText('Причина исправления *')).toHaveValue('Уточнение сведений');
    expect(mutate).toHaveBeenCalledWith(row.revision, expect.objectContaining({ action: 'update', record_id: row.id, data: expect.objectContaining({ notes: 'Текст сотрудника Б, который нужно сохранить' }) }));
    expect(onSaved).not.toHaveBeenCalled();
    fireEvent.change(within(dialog).getByLabelText('Примечание'), { target: { value: 'Текст после отказа' } });
    expect(within(dialog).getByRole('alert')).toHaveTextContent('исправление не записано');
    expect(mutate).toHaveBeenCalledOnce();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Отмена' }));
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it('shows missing required correction details inside the dialog and does not call the server', async () => {
    const { mutate, onSaved, dialog } = setup();
    await act(async () => fireEvent.click(within(dialog).getByRole('button', { name: 'Сохранить исправление' })));
    expect(within(dialog).getByRole('alert')).toHaveTextContent('Проверьте обязательные поля');
    expect(mutate).not.toHaveBeenCalled(); expect(onSaved).not.toHaveBeenCalled();
  });
});
