import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { actor, issuedRecord, org, uid } from '@/lib/educationIssuance/__tests__/fixtures';
import { recipientIntent, recipientPolicy } from '@/lib/educationIssuance/__tests__/recipientRequest.fixtures';
import type { EducationIssuanceScope } from '@/lib/educationIssuance/client';
import type { PolicyVersion } from '@/lib/signatureAssurance/types';
import { IssuedRecipientRequest } from '../IssuedRecipientRequest';

const port = vi.hoisted(() => ({ current: true, sourceAvailable: true, read: vi.fn(), policies: vi.fn(), prepare: vi.fn(), preparedRun: vi.fn(), resume: vi.fn() }));
vi.mock('@/lib/educationIssuance/client', () => ({ issuanceScopeCurrent: () => port.current }));
vi.mock('@/lib/educationIssuance/recipientRequest', () => ({
  issuedRecipientRecordAvailable: () => port.sourceAvailable,
  normalizeIssuedRecipientError: (cause: { code?: string }) => ({ code: cause?.code ?? 'DEPENDENCY_UNAVAILABLE', message: 'Результат пока не подтверждён. Проверьте состояние сохранённого запроса.' }),
  prepareIssuedRecipientRequest: port.prepare, readIssuedRecipientPolicies: port.policies, readIssuedRecipientRequest: port.read, resumeIssuedRecipientRequest: port.resume,
}));
vi.mock('@/components/organization/SignatureEvidencePanel', () => ({ SignatureEvidencePanel: ({ organizationId, signatureId }: { organizationId: string; signatureId: string }) => <div data-testid="staff-evidence">{organizationId} / {signatureId}</div> }));
const scope: EducationIssuanceScope = { actorId: actor, accessRevision: 1, organizationId: org, issuanceScope: { kind: 'organization' }, current: () => true };
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; }
let policy: PolicyVersion;
const choose = () => fireEvent.change(screen.getByLabelText('Принятые правила ПЭП'), { target: { value: policy.id } });
const sendButton = () => screen.getByRole('button', { name: 'Запросить подтверждение у ученика' });
beforeEach(async () => {
  vi.clearAllMocks(); port.current = true; port.sourceAvailable = true; policy = await recipientPolicy();
  port.read.mockResolvedValue(null); port.policies.mockResolvedValue({ items: [policy], nextAfterId: null, canPrepare: true });
  port.prepare.mockReturnValue({ requestId: uid(79), run: port.preparedRun }); port.preparedRun.mockResolvedValue(recipientIntent(policy));
  port.resume.mockResolvedValue(recipientIntent(policy, 'pending'));
});
afterEach(cleanup);

describe('issued-copy request in the existing document card', () => {
  it('reads existing state, requires explicit accepted-policy selection, and never sends automatically', async () => {
    const record = issuedRecord(); render(<IssuedRecipientRequest scope={scope} record={record} />);
    await screen.findByLabelText('Принятые правила ПЭП'); expect((sendButton() as HTMLButtonElement).disabled).toBe(true);
    expect(port.read).toHaveBeenCalledWith(scope, { kind: 'record', record_id: record.official.id }, record);
    expect(port.prepare).not.toHaveBeenCalled(); expect(port.resume).not.toHaveBeenCalled();
    choose(); expect((sendButton() as HTMLButtonElement).disabled).toBe(false);
    expect(screen.getByText(/не заменяет отметку о вручении/)).toBeTruthy();
  });
  it('sends only the selected edition and editable expiry, then shows the actual pending result', async () => {
    const locks: boolean[] = []; const record = issuedRecord(); render(<IssuedRecipientRequest scope={scope} record={record} onLockChange={value => locks.push(value)} />);
    await screen.findByLabelText('Принятые правила ПЭП'); choose(); fireEvent.change(screen.getByLabelText('Срок подтверждения, дней'), { target: { value: '45' } });
    fireEvent.click(sendButton()); await screen.findByText('Запрос доступен в личном кабинете ученика. Ожидаем подтверждение.');
    expect(port.prepare).toHaveBeenCalledWith(scope, record, policy, 45); expect(port.resume).toHaveBeenCalledWith(scope, recipientIntent(policy));
    expect(locks).toEqual([true, false]); expect(screen.queryByText(/Ученик подтвердил/)).toBeNull();
    expect(screen.queryByRole('button', { name: /Запросить подтверждение|Продолжить отправку/ })).toBeNull();
  });
  it('blocks invalid expiry and a second click while a durable preparation is in flight', async () => {
    const held = deferred<ReturnType<typeof recipientIntent>>(); port.preparedRun.mockReturnValue(held.promise);
    render(<IssuedRecipientRequest scope={scope} record={issuedRecord()} />); await screen.findByLabelText('Принятые правила ПЭП'); choose();
    fireEvent.change(screen.getByLabelText('Срок подтверждения, дней'), { target: { value: '91' } }); expect((sendButton() as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('Срок подтверждения, дней'), { target: { value: '30' } }); fireEvent.click(sendButton()); fireEvent.click(screen.getByRole('button', { name: 'Подготавливаем запрос…' }));
    expect(port.prepare).toHaveBeenCalledTimes(1); await act(async () => { held.resolve(recipientIntent(policy)); });
    await screen.findByText('Запрос доступен в личном кабинете ученика. Ожидаем подтверждение.');
  });
  it('resumes the stored source-verified request after reload without preparing another signature', async () => {
    const saved = recipientIntent(policy, 'source_verified'); port.read.mockResolvedValue(saved);
    const view = render(<IssuedRecipientRequest scope={scope} record={issuedRecord()} />); await screen.findByText('PDF проверен. Осталось отправить запрос ученику.');
    view.unmount(); render(<IssuedRecipientRequest scope={scope} record={issuedRecord()} />); fireEvent.click(await screen.findByRole('button', { name: 'Продолжить отправку запроса' }));
    await screen.findByText('Запрос доступен в личном кабинете ученика. Ожидаем подтверждение.'); expect(port.prepare).not.toHaveBeenCalled(); expect(port.resume).toHaveBeenCalledWith(scope, saved);
  });
  it('opens existing staff evidence for the exact signature and only claims confirmation from its real event', async () => {
    port.read.mockResolvedValue(recipientIntent(policy, 'confirmed')); render(<IssuedRecipientRequest scope={scope} record={issuedRecord()} />);
    await screen.findByText('Ученик подтвердил получение электронной копии по правилам ПЭП.'); expect(screen.getByText(/Событие подтверждения/)).toBeTruthy();
    expect(screen.queryByTestId('staff-evidence')).toBeNull(); fireEvent.click(screen.getByRole('button', { name: 'Открыть подтверждения' }));
    expect(screen.getByTestId('staff-evidence').textContent).toBe(org + ' / ' + uid(81)); expect(port.prepare).not.toHaveBeenCalled(); expect(port.resume).not.toHaveBeenCalled();
  });
  it.each(['closed', 'source_changed', 'source_unavailable', 'expired', 'revoked'] as const)('shows %s without suggesting another request or a false success', async state => {
    const record = issuedRecord(); if (state === 'closed') { record.lifecycle = 'annulled'; port.sourceAvailable = false; }
    port.read.mockResolvedValue(recipientIntent(policy, state)); render(<IssuedRecipientRequest scope={scope} record={record} />);
    await screen.findByRole('status'); expect(screen.queryByRole('button', { name: /Запросить подтверждение|Продолжить отправку/ })).toBeNull();
    expect(screen.queryByText(/Ученик подтвердил/)).toBeNull(); expect(port.prepare).not.toHaveBeenCalled(); expect(port.read).toHaveBeenCalledTimes(1);
  });
  it('leaves legacy records unchanged without any new recipient-request RPC, even when their old enrollment is unknown', async () => {
    const record = issuedRecord(); record.provenance = 'legacy_unverified'; record.proof = null; record.proof_availability = 'legacy_unverified'; record.frdo_facts = null;
    record.official.enrollment_id = null; record.official.user_id = null; record.official.course_id = null; record.official.group_id = null; record.artifact = { availability: 'legacy_unverified', artifact: null };
    const view = render(<IssuedRecipientRequest scope={scope} record={record} />);
    await act(async () => {}); expect(view.container.textContent).toBe(''); expect(port.read).not.toHaveBeenCalled(); expect(port.policies).not.toHaveBeenCalled(); expect(port.prepare).not.toHaveBeenCalled(); expect(port.resume).not.toHaveBeenCalled();
  });
  it('does not offer creation for an unavailable historical PDF or read-only staff', async () => {
    port.sourceAvailable = false; const view = render(<IssuedRecipientRequest scope={scope} record={issuedRecord()} />);
    await screen.findByText(/нет доступного активного закреплённого PDF/); expect(port.policies).not.toHaveBeenCalled(); expect(screen.queryByLabelText('Принятые правила ПЭП')).toBeNull();
    view.unmount(); port.sourceAvailable = true; port.policies.mockResolvedValue({ items: [policy], nextAfterId: null, canPrepare: false });
    render(<IssuedRecipientRequest scope={scope} record={issuedRecord()} />); await screen.findByText(/нужны права на подпись документов/); expect(screen.queryByRole('button', { name: /Запросить подтверждение/ })).toBeNull();
  });
  it('does not invent or accept a policy when no approved edition exists', async () => {
    port.policies.mockResolvedValue({ items: [], nextAfterId: null, canPrepare: true }); render(<IssuedRecipientRequest scope={scope} record={issuedRecord()} />);
    await screen.findByText(/Подходящие правила ещё не приняты/); expect((sendButton() as HTMLButtonElement).disabled).toBe(true); expect(port.prepare).not.toHaveBeenCalled();
  });
  it('checks a lost send result before allowing further mutation, using the durable request from the server', async () => {
    port.resume.mockRejectedValueOnce(new Error('RAW_PRIVATE_ERROR')); render(<IssuedRecipientRequest scope={scope} record={issuedRecord()} />);
    await screen.findByLabelText('Принятые правила ПЭП'); choose(); fireEvent.click(sendButton()); await screen.findByRole('alert');
    expect(screen.getByRole('alert').textContent).not.toContain('RAW_PRIVATE_ERROR'); expect((screen.getByRole('button', { name: 'Продолжить отправку запроса' }) as HTMLButtonElement).disabled).toBe(true);
    port.read.mockResolvedValue(recipientIntent(policy, 'pending')); fireEvent.click(screen.getByRole('button', { name: 'Проверить состояние' }));
    await screen.findByText('Запрос доступен в личном кабинете ученика. Ожидаем подтверждение.'); expect(port.prepare).toHaveBeenCalledTimes(1); expect(port.resume).toHaveBeenCalledTimes(1);
  });
  it('retains the same unknown preparation request after checking that no intent is readable yet', async () => {
    port.preparedRun.mockRejectedValueOnce(new Error('network result unknown')).mockResolvedValueOnce(recipientIntent(policy));
    render(<IssuedRecipientRequest scope={scope} record={issuedRecord()} />); await screen.findByLabelText('Принятые правила ПЭП'); choose(); fireEvent.click(sendButton()); await screen.findByRole('alert');
    fireEvent.click(screen.getByRole('button', { name: 'Проверить состояние' })); await screen.findByRole('button', { name: 'Повторить ту же подготовку' });
    await waitFor(() => expect((screen.getByRole('button', { name: 'Повторить ту же подготовку' }) as HTMLButtonElement).disabled).toBe(false)); fireEvent.click(screen.getByRole('button', { name: 'Повторить ту же подготовку' }));
    await screen.findByText('Запрос доступен в личном кабинете ученика. Ожидаем подтверждение.'); expect(port.prepare).toHaveBeenCalledTimes(1); expect(port.preparedRun).toHaveBeenCalledTimes(2);
  });
  it('allows explicit policy reselection after a definitive refusal and a fresh state read', async () => {
    port.preparedRun.mockRejectedValueOnce({ code: 'POLICY_CHANGED' }); render(<IssuedRecipientRequest scope={scope} record={issuedRecord()} />);
    await screen.findByLabelText('Принятые правила ПЭП'); choose(); fireEvent.click(sendButton()); await screen.findByRole('alert');
    const next = structuredClone(policy); next.id = uid(971); next.version = 2;
    port.policies.mockResolvedValue({ items: [next], nextAfterId: null, canPrepare: true }); fireEvent.click(screen.getByRole('button', { name: 'Проверить состояние' }));
    await screen.findByText('electronic_copy_receipt · редакция 2'); expect((screen.getByLabelText('Принятые правила ПЭП') as HTMLSelectElement).disabled).toBe(false);
    fireEvent.change(screen.getByLabelText('Принятые правила ПЭП'), { target: { value: next.id } }); fireEvent.click(sendButton());
    await screen.findByText('Запрос доступен в личном кабинете ученика. Ожидаем подтверждение.'); expect(port.prepare).toHaveBeenCalledTimes(2); expect(port.prepare.mock.calls[1][2].id).toBe(next.id);
  });
  it('retries the same unknown operation after its policy disappears, then permits fresh reselection only after a definitive refusal', async () => {
    const record = issuedRecord();
    port.preparedRun.mockRejectedValueOnce(new Error('unknown prepare result')).mockRejectedValueOnce({ code: 'POLICY_NOT_ACCEPTED' }).mockResolvedValueOnce(recipientIntent(policy));
    render(<IssuedRecipientRequest scope={scope} record={record} />); await screen.findByLabelText('Принятые правила ПЭП'); choose(); fireEvent.click(sendButton()); await screen.findByRole('alert');
    const next = structuredClone(policy); next.id = uid(972); next.version = 2;
    port.policies.mockResolvedValue({ items: [next], nextAfterId: null, canPrepare: true }); fireEvent.click(screen.getByRole('button', { name: 'Проверить состояние' }));
    await screen.findByText('electronic_copy_receipt · редакция 2');
    const selector = screen.getByLabelText('Принятые правила ПЭП') as HTMLSelectElement;
    expect(selector.value).toBe(''); expect(selector.disabled).toBe(true);
    const retry = screen.getByRole('button', { name: 'Повторить ту же подготовку' }) as HTMLButtonElement;
    await waitFor(() => expect(retry.disabled).toBe(false)); fireEvent.click(retry); await screen.findByRole('alert');
    expect(port.prepare).toHaveBeenCalledTimes(1); expect(port.preparedRun).toHaveBeenCalledTimes(2);
    expect(port.prepare.mock.calls[0]).toEqual([scope, record, policy, 30]);
    fireEvent.click(screen.getByRole('button', { name: 'Проверить состояние' }));
    await waitFor(() => expect((screen.getByLabelText('Принятые правила ПЭП') as HTMLSelectElement).disabled).toBe(false));
    expect((sendButton() as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('Принятые правила ПЭП'), { target: { value: next.id } }); fireEvent.click(sendButton());
    await screen.findByText('Запрос доступен в личном кабинете ученика. Ожидаем подтверждение.');
    expect(port.prepare).toHaveBeenCalledTimes(2); expect(port.prepare.mock.calls[1][2].id).toBe(next.id); expect(port.preparedRun).toHaveBeenCalledTimes(3);
  });
  it.each(['draft', 'source_verified', 'bound'] as const)('explains why the saved %s request cannot currently resume without inventing a cause', async state => {
    const saved = recipientIntent(policy, state); saved.capabilities.can_resume = false; port.read.mockResolvedValue(saved);
    render(<IssuedRecipientRequest scope={scope} record={issuedRecord()} />);
    await screen.findByText('Продолжение недоступно. Проверьте принятые правила ПЭП и права на изменение и подпись документов.');
    expect(screen.queryByRole('button', { name: 'Продолжить отправку запроса' })).toBeNull(); expect(port.prepare).not.toHaveBeenCalled(); expect(port.resume).not.toHaveBeenCalled();
  });
  it('discards a late old record response after the selected document changes', async () => {
    const old = deferred<ReturnType<typeof recipientIntent> | null>(); port.read.mockReturnValueOnce(old.promise).mockResolvedValue(null);
    const record = issuedRecord(), view = render(<IssuedRecipientRequest scope={scope} record={record} />); await waitFor(() => expect(port.read).toHaveBeenCalledTimes(1));
    const next = structuredClone(record); next.official.id = uid(952); view.rerender(<IssuedRecipientRequest scope={scope} record={next} />);
    await screen.findByLabelText('Принятые правила ПЭП'); await act(async () => { old.resolve(recipientIntent(policy, 'confirmed')); });
    expect(screen.queryByText(/Ученик подтвердил/)).toBeNull(); expect(screen.queryByRole('button', { name: 'Открыть подтверждения' })).toBeNull();
  });
  it('hides request/evidence immediately after actor access is revoked', async () => {
    port.read.mockResolvedValue(recipientIntent(policy, 'confirmed')); const view = render(<IssuedRecipientRequest scope={scope} record={issuedRecord()} />); await screen.findByText(/Ученик подтвердил/);
    port.current = false; view.rerender(<IssuedRecipientRequest scope={scope} record={issuedRecord()} />); expect(screen.queryByRole('region', { name: 'Получение электронной копии' })).toBeNull();
    expect(screen.queryByText(/Ученик подтвердил/)).toBeNull(); expect(port.prepare).not.toHaveBeenCalled();
  });
});
