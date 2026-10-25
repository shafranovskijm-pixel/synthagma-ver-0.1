import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createEmptyEducationProfile } from '@/lib/uc-compliance/model';
const state = vi.hoisted(() => ({ profile: {} as any, decisions: {} as any, permissions: {} as any, readProfile: vi.fn(), readDecisions: vi.fn() }));
vi.mock('@/hooks/useStaffPermissions', () => ({ useStaffPermissions: () => state.permissions }));
vi.mock('@/hooks/useEducationComplianceProfile', () => ({ useEducationComplianceProfile: (...args: unknown[]) => { state.readProfile(...args); return state.profile; } }));
vi.mock('@/hooks/useDocumentApplicabilityDecisions', () => ({ useDocumentApplicabilityDecisions: (...args: unknown[]) => { state.readDecisions(...args); return state.decisions; } }));
vi.mock('./EducationProfileDialog', () => ({ EducationProfileDialog: () => null }));
vi.mock('./NormativeGovernancePanel', () => ({ NormativeGovernancePanel: () => null }));
vi.mock('./PublicationCalendarPanel', () => ({ PublicationCalendarPanel: () => null }));
import { EducationCenterAssistant } from './EducationCenterAssistant';
const upload = vi.fn(), history = vi.fn(), archive = vi.fn(), self = vi.fn();
const props = (organizationId = 'org-a') => ({ organizationId, organization: { name: 'QA centre' }, documents: [], onUpload: upload, onHistory: history, onArchive: archive, onSelfExamination: self });
const openCard = (name: string) => fireEvent.click(within(screen.getByRole('article', { name })).getByRole('button', { name: 'Образец и подготовка' }));
afterEach(() => cleanup());
beforeEach(() => {
 vi.clearAllMocks();
 state.permissions = { organizationId: 'org-a', loading: false, error: null, orgRole: 'owner', isOrgOwner: true, adminRole: null, orgPermissions: new Set(['documents.read']), can: () => true, canSeeOrgTab: () => true };
 state.profile = { data: { organization_id: 'org-a', revision: 1, profile: createEmptyEducationProfile(), updated_at: null, updated_by: null }, loading: false, saving: false, denied: false, conflict: false, uncertain: false, error: null, save: vi.fn().mockResolvedValue(true), reload: vi.fn() };
 state.decisions = { data: [], loading: false, saving: false, denied: false, conflict: false, uncertain: false, error: null, save: vi.fn().mockResolvedValue(true), reload: vi.fn(), loadHistory: vi.fn().mockResolvedValue([]) };
 Element.prototype.scrollIntoView = vi.fn(); Element.prototype.hasPointerCapture = vi.fn(() => false);
 Element.prototype.setPointerCapture = vi.fn(); Element.prototype.releasePointerCapture = vi.fn();
});
it('PA01 opens the selected real card structure without uploading, approving or generating another document', () => {
 render(<EducationCenterAssistant {...props()} />); openCard('Правила приёма');
 const dialog = screen.getByRole('dialog');
 expect(within(dialog).getByRole('heading', { name: 'Правила приёма: образец и подготовка' })).toBeVisible();
 expect(within(dialog).getByLabelText('Текст примера для адаптации')).toHaveTextContent('ПРОЕКТ ДЛЯ АДАПТАЦИИ');
 expect(state.decisions.save).not.toHaveBeenCalled(); expect(state.profile.save).not.toHaveBeenCalled();
 expect(upload).not.toHaveBeenCalled(); expect(history).not.toHaveBeenCalled(); expect(archive).not.toHaveBeenCalled();
});
it('PA02 lets read-only staff inspect the partial consent guidance without granting constructor access', () => {
 state.permissions.can = (permission: string) => permission.endsWith('.read');
 render(<EducationCenterAssistant {...props()} />);
 const card = screen.getByRole('article', { name: 'Организация обработки и защиты персональных данных' });
 expect(within(card).getByRole('button', { name: 'Загрузить файл' })).toBeDisabled();
 openCard('Организация обработки и защиты персональных данных');
 const dialog = screen.getByRole('dialog'); expect(within(dialog).getByText('Проект согласия в конструкторе — только часть пакета, а не политика центра')).toBeVisible();
 expect(within(dialog).queryByRole('link', { name: 'Подготовить проект согласия на ПД' })).toBeNull();
 expect(state.decisions.save).not.toHaveBeenCalled(); expect(upload).not.toHaveBeenCalled();
});
it('PA03 routes the real group-document card through the authorized group selector instead of fabricating group context', () => {
 render(<EducationCenterAssistant {...props()} />); openCard('Приказ / основание зачисления');
 expect(within(screen.getByRole('dialog')).getByRole('link', { name: 'Выбрать группу и документы' })).toHaveAttribute('href', '/organization?tab=students&studentsView=groups');
 expect(screen.getByLabelText('Текст примера для адаптации')).toHaveTextContent('Выбрать свою группу и её точную программу');
 expect(state.decisions.save).not.toHaveBeenCalled();
});
it('PA04 closes the preparation on organization and profile changes and does not revive it on returning to an old context', () => {
 const view = render(<EducationCenterAssistant {...props()} />); openCard('Правила приёма'); expect(screen.getByRole('dialog')).toBeVisible();
 state.permissions.organizationId = 'org-b'; state.profile.data = { ...state.profile.data, organization_id: 'org-b' };
 view.rerender(<EducationCenterAssistant {...props('org-b')} />); expect(screen.queryByRole('dialog')).toBeNull();
 state.permissions.organizationId = 'org-a'; state.profile.data = { ...state.profile.data, organization_id: 'org-a' };
 view.rerender(<EducationCenterAssistant {...props()} />); expect(screen.queryByRole('dialog')).toBeNull();
 openCard('Правила приёма'); state.profile.data = { ...state.profile.data, revision: 2 };
 view.rerender(<EducationCenterAssistant {...props()} />); expect(screen.queryByRole('dialog')).toBeNull();
 expect(upload).not.toHaveBeenCalled(); expect(state.decisions.save).not.toHaveBeenCalled();
});
it('PA05 preserves the assigned-teacher boundary and disables organization-wide reads for the new examples', () => {
 state.permissions.orgRole = 'teacher'; state.permissions.isOrgOwner = false;
 render(<EducationCenterAssistant {...props()} />);
 expect(screen.queryByRole('button', { name: 'Образец и подготовка' })).toBeNull();
 expect(screen.getByRole('link', { name: 'Перейти к группам' })).toHaveAttribute('href', '/organization?tab=students&studentsView=groups');
 expect(state.readProfile).toHaveBeenCalledWith('org-a', false, false); expect(state.readDecisions.mock.lastCall?.slice(-2)).toEqual([false, false]);
});
it('PA06 keeps the existing self-examination action writable-only inside the new preparation dialog', () => {
 const view = render(<EducationCenterAssistant {...props()} />);
 fireEvent.click(screen.getByRole('button', { name: /Периодически/ })); openCard('Отчёт о самообследовании');
 fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Открыть анкету самообследования' })); expect(self).toHaveBeenCalledOnce();
 state.permissions.can = (permission: string) => permission.endsWith('.read');
 view.rerender(<EducationCenterAssistant {...props()} />);
 expect(within(screen.getByRole('dialog')).queryByRole('button', { name: 'Открыть анкету самообследования' })).toBeNull();
 expect(self).toHaveBeenCalledOnce(); expect(state.profile.save).not.toHaveBeenCalled();
});
