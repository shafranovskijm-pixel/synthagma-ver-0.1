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

it('DA01 draft opens read-only then manual upload delegates exact existing type without saving or approving',()=>{
 render(<EducationCenterAssistant {...props()} />);openCard('Правила приёма');expect(screen.getByLabelText('Текст примера для адаптации')).toHaveTextContent('ПРЕДЛАГАЕМОЕ СОДЕРЖАНИЕ');
 expect(upload).not.toHaveBeenCalled();expect(state.profile.save).not.toHaveBeenCalled();expect(state.decisions.save).not.toHaveBeenCalled();
 fireEvent.click(within(screen.getByRole('dialog')).getByRole('button',{name:'Загрузить подготовленный проект'}));
 expect(upload).toHaveBeenCalledOnce();expect(upload).toHaveBeenCalledWith('admission_rules');expect(screen.queryByRole('dialog')).toBeNull();expect(history).not.toHaveBeenCalled();
});
it('DA02 after user-save props refresh, matched actual file opens existing version history without creating a version',()=>{
 const view=render(<EducationCenterAssistant {...props()} />);openCard('Правила приёма');expect(within(screen.getByRole('dialog')).queryByRole('button',{name:'Открыть файл и версии проекта'})).toBeNull();
 fireEvent.click(within(screen.getByRole('dialog')).getByRole('button',{name:'Закрыть'}));
 const saved:any={id:'saved-draft-17',organization_id:'org-a',type:'admission_rules',name:'Мой проект приёма',file_path:'org-a/existing.pdf',is_active:true,deleted_at:null};
 view.rerender(<EducationCenterAssistant {...props()} documents={[saved]}/>);openCard('Правила приёма');
 fireEvent.click(within(screen.getByRole('dialog')).getByRole('button',{name:'Открыть файл и версии проекта'}));expect(history).toHaveBeenCalledWith(saved);expect(history).toHaveBeenCalledOnce();expect(upload).not.toHaveBeenCalled();expect(state.decisions.save).not.toHaveBeenCalled();
});
it('DA03 read-only actor keeps allowed history but cannot open draft upload, deleted files give no version shortcut',()=>{
 state.permissions.can=(p:string)=>p.endsWith('.read');const saved:any={id:'existing-a',type:'admission_rules',deleted_at:null,is_active:true};
 const view=render(<EducationCenterAssistant {...props()} documents={[saved]}/>);openCard('Правила приёма');let dialog=screen.getByRole('dialog');
 expect(within(dialog).queryByRole('button',{name:'Загрузить подготовленный проект'})).toBeNull();fireEvent.click(within(dialog).getByRole('button',{name:'Открыть файл и версии проекта'}));expect(history).toHaveBeenCalledWith(saved);
 view.rerender(<EducationCenterAssistant {...props()} documents={[{...saved,deleted_at:'2026-10-26T00:00:00Z'}]}/>);openCard('Правила приёма');dialog=screen.getByRole('dialog');expect(within(dialog).queryByRole('button',{name:'Открыть файл и версии проекта'})).toBeNull();expect(upload).not.toHaveBeenCalled();
});
it('DA04 pending profile disables upload callback and org or profile transition drops old draft actions',()=>{
 state.profile.saving=true;const view=render(<EducationCenterAssistant {...props()}/>);openCard('Правила приёма');expect(within(screen.getByRole('dialog')).queryByRole('button',{name:'Загрузить подготовленный проект'})).toBeNull();
 state.profile.saving=false;state.permissions.organizationId='org-b';state.profile.data={...state.profile.data,organization_id:'org-b'};view.rerender(<EducationCenterAssistant {...props('org-b')}/>);expect(screen.queryByRole('dialog')).toBeNull();
 state.permissions.organizationId='org-a';state.profile.data={...state.profile.data,organization_id:'org-a'};view.rerender(<EducationCenterAssistant {...props()}/>);expect(screen.queryByRole('dialog')).toBeNull();openCard('Правила приёма');state.profile.data={...state.profile.data,revision:2};view.rerender(<EducationCenterAssistant {...props()}/>);expect(screen.queryByRole('dialog')).toBeNull();expect(upload).not.toHaveBeenCalled();expect(history).not.toHaveBeenCalled();
});
it('DA05 assigned teacher cannot access organization-wide draft or manual upload/history shortcuts',()=>{
 state.permissions.orgRole='teacher';state.permissions.isOrgOwner=false;render(<EducationCenterAssistant {...props()}/>);
 expect(screen.queryByRole('button',{name:'Образец и подготовка'})).toBeNull();expect(screen.queryByRole('button',{name:'Загрузить подготовленный проект'})).toBeNull();expect(state.readProfile).toHaveBeenCalledWith('org-a',false,false);expect(state.readDecisions.mock.lastCall?.slice(-2)).toEqual([false,false]);expect(upload).not.toHaveBeenCalled();expect(history).not.toHaveBeenCalled();
});
