import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { base, binding, data, incoming, legacy, org, pupil, record, source, uid } from '@/lib/documentRegistry/__tests__/fixtures';
import type { DocumentRegistryModel } from '@/hooks/useDocumentRegistry';
import { DocumentRegistryForm } from '../DocumentRegistryForm';
import { CaptureIncomingForm } from '../CaptureIncomingForm';
import { DocumentRegistryError } from '@/lib/documentRegistry/errors';
vi.mock('../RegistrySourceField', () => ({
  RegistryChoice: ({ label, value, options, onChange, disabled }: any) => <label>{label}<select aria-label={label} value={value} disabled={disabled} onChange={event => onChange(event.target.value)}>{options.map((option: any) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>,
  RegistrySourceField: ({ value, onChange, disabled }: any) => <div><span>{value?.label ?? 'Версия не выбрана'}</span><button disabled={disabled} onClick={() => onChange({ label: 'Точная выбранная версия', source })}>Выбрать точную версию</button></div>,
}));
afterEach(cleanup);
function setup() {
  const mutate = vi.fn(async () => ({ ...base(), kind: 'register', request_id: uid(50), replayed: false, record: record() })), onSaved = vi.fn();
  const read = vi.fn(async (query: any) => query.kind === 'parties' ? { ...base(), kind: 'parties', parties: query.party_kind === 'student' ? [{ label: 'Реальный ученик', party: { kind: 'student', user_id: pupil } }] : [], next_after_id: null }
    : query.kind === 'contexts' ? { ...base(), kind: 'contexts', contexts: [{ label: 'Реальное зачисление', context: data().context, student_id: pupil, group_id: null, company_id: null, current_status: 'active' }], next_after_id: null }
    : { ...base(), kind: query.kind, validation: { valid: true, data: query.data, context_binding: binding(), source_label: 'Точная выбранная версия', sender_label: 'Организация', recipient_label: 'Реальный ученик', subject_label: 'Реальный ученик', context_label: 'Реальное зачисление' } });
  const model = { organizationId: org, capabilities: base().capabilities, scopeCurrent: () => true, saving: false, pending: false, mutationError: null, read, mutate, retry: vi.fn(), cancelRejected: vi.fn() } as unknown as DocumentRegistryModel;
  return { model, mutate, read, onSaved };
}
describe('reviewed exact document registration form', () => {
  it('binds historical claims only to explicitly selected version and verified learner/enrollment, never to stored issuer ID', async () => {
    const { model, read, mutate, onSaved } = setup(), old = legacy();
    render(<DocumentRegistryForm model={model} legacy={old} onSaved={onSaved} onCancel={vi.fn()} />);
    expect(screen.getByLabelText('Ученик, к которому относится документ')).toHaveValue(pupil); expect(screen.getByLabelText('Направление')).toBeDisabled();
    expect(screen.getByLabelText('Внутренний номер регистрации')).toHaveValue('Назначится сервером после сохранения');
    fireEvent.click(screen.getByRole('button', { name: 'Выбрать точную версию' }));
    await waitFor(() => expect(screen.getAllByRole('option', { name: 'Реальный ученик' }).length).toBeGreaterThan(0));
    fireEvent.change(screen.getByLabelText('Получатель'), { target: { value: 'student:' + pupil } });
    fireEvent.change(screen.getByLabelText('Связь с обучением / договором'), { target: { value: 'enrollment' } });
    await waitFor(() => expect(screen.getByRole('option', { name: 'Реальное зачисление' })).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText('Точное зачисление'), { target: { value: uid(7) } });
    fireEvent.change(screen.getByLabelText('Основание регистрации *'), { target: { value: 'Связь проверена вручную по исходнику' } });
    expect(screen.getByRole('button', { name: 'Зарегистрировать' })).toBeDisabled(); expect(mutate).not.toHaveBeenCalled();
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Проверить связи' })));
    const validation = read.mock.calls.find(([query]) => query.kind === 'validate')![0];
    expect(validation.data).toMatchObject({ recipient: { kind: 'student', user_id: pupil }, subject: { kind: 'student', user_id: pupil }, source, context: { kind: 'enrollment', enrollment_id: uid(7) }, origin: { kind: 'legacy_issuance_log', legacy_id: old.id, legacy_binding_hash: old.legacy_binding_hash } });
    expect(validation.data.recipient.user_id).not.toBe(old.claim.stored_user_id);
    expect(screen.getByRole('status')).toHaveTextContent('Регистрация не подтверждает подпись, выдачу или вручение');
    fireEvent.change(screen.getByLabelText('Примечание'), { target: { value: 'Уточнение после проверки' } }); expect(screen.getByRole('button', { name: 'Зарегистрировать' })).toBeDisabled();
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Проверить связи' })));
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Зарегистрировать' })));
    expect(mutate).toHaveBeenCalledWith(0, expect.objectContaining({ action: 'register', data: expect.objectContaining({ source, notes: 'Уточнение после проверки' }) })); expect(onSaved).toHaveBeenCalledOnce();
  });
  it('preserves entered correction text and a persistent in-form conflict without saving or inventing a new revision', async () => {
    const { model, mutate, onSaved } = setup(); mutate.mockRejectedValue(new DocumentRegistryError('REVISION_CONFLICT'));
    render(<DocumentRegistryForm model={model} record={record()} onSaved={onSaved} onCancel={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('Примечание'), { target: { value: 'Текст второго сотрудника' } }); fireEvent.change(screen.getByLabelText('Причина исправления *'), { target: { value: 'Уточнение' } });
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Проверить связи' }))); await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Сохранить исправление' })));
    expect(screen.getByRole('alert')).toHaveTextContent('Ваш текст остался в форме'); expect(screen.getByLabelText('Примечание')).toHaveValue('Текст второго сотрудника'); expect(onSaved).not.toHaveBeenCalled(); expect(mutate).toHaveBeenCalledWith(1, expect.objectContaining({ action: 'correct', record_id: record().id }));
  });
  it('validates new incoming without a fabricated origin or identifier before the server assigns it', async () => {
    const { model, read, mutate, onSaved } = setup();
    render(<DocumentRegistryForm model={model} incoming={incoming()} onSaved={onSaved} onCancel={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('Почему связь с зачислением / договором не применяется *'), { target: { value: 'Общая переписка организации' } }); fireEvent.change(screen.getByLabelText('Основание регистрации *'), { target: { value: 'Полученный оригинал' } });
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Проверить связи' })));
    const call = read.mock.calls.find(([query]) => query.kind === 'validate_incoming')![0]; expect(call.incoming).toEqual({ kind: 'existing', incoming_document_id: incoming().id, expected_binding_hash: incoming().binding_hash }); expect(call.data).not.toHaveProperty('origin');
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Зарегистрировать' })));
    expect(mutate).toHaveBeenCalledWith(0, expect.objectContaining({ action: 'register_incoming', incoming: call.incoming, data: call.data }));
  });
  it('saves an incoming source without a numbered registry event when the actor has only upload rights', async () => {
    const { model, mutate, onSaved } = setup(); model.capabilities = { ...base().capabilities, can_read: false, can_read_incoming: false, can_register: false, can_register_incoming: false, can_open_file: false }; mutate.mockResolvedValue({ ...base(), kind: 'capture_incoming', request_id: uid(50), replayed: false, incoming: incoming() } as any);
    render(<CaptureIncomingForm model={model} onSaved={onSaved} onCancel={vi.fn()} />); fireEvent.change(screen.getByLabelText('Название *'), { target: { value: 'Сохранённый входящий' } }); fireEvent.click(screen.getByRole('button', { name: 'Выбрать точную версию' }));
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Сохранить во входящих без регистрации' })));
    expect(mutate).toHaveBeenCalledWith(0, { action: 'capture_incoming', data: { doc_type: 'other', title: 'Сохранённый входящий', counterparty_name: null, counterparty_inn: null, doc_number: null, doc_date: null, notes: '', source } }); expect(onSaved).toHaveBeenCalledOnce(); expect(screen.queryByLabelText('Внутренний номер регистрации')).not.toBeInTheDocument();
  });
});
