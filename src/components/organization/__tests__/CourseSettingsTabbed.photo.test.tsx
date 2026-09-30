import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CourseSettingsTabbed } from '../CourseSettingsTabbed';
import { MemoryRouter, useNavigate } from 'react-router-dom';
vi.mock('../ModuleAccessSchedule', () => ({ ModuleAccessSchedule: () => null }));
afterEach(cleanup);
function HistoryControls() {
  const navigate = useNavigate();
  return <><button onClick={() => navigate(-1)}>History back</button><button onClick={() => navigate(1)}>History forward</button></>;
}
const props = () => ({ course: { id: 'course-a' }, isFrdoEnabled: false, isSavingSettings: false,
  skipVideoId: true, onToggleSkipVideoId: vi.fn(), requireFinalTestPhoto: false, onToggleRequireFinalTestPhoto: vi.fn(),
  sequentialLessons: false, onToggleSequentialLessons: vi.fn(), allowVideoSeek: true, onToggleAllowVideoSeek: vi.fn(),
  copyProtection: false, onToggleCopyProtection: vi.fn(), videoWatermark: false, onToggleVideoWatermark: vi.fn(),
  externalCardUrl: '', setExternalCardUrl: vi.fn(), onUpdateExternalCardUrl: vi.fn(), defaultAccessDays: null, setDefaultAccessDays: vi.fn(), onUpdateDefaultAccessDays: vi.fn(),
  requireEnrollmentApproval: false, onToggleRequireEnrollmentApproval: vi.fn(), trainingForm: '', onUpdateTrainingForm: vi.fn(), frdoSettings: {} as never, onUpdateFrdoSettings: vi.fn(),
  collectDocuments: false, onToggleCollectDocuments: vi.fn(), requirePassport: false, onToggleRequirePassport: vi.fn(), requireSnils: false, onToggleRequireSnils: vi.fn(),
  requireEducationDocument: false, onToggleRequireEducationDocument: vi.fn(), requireBirthCertificate: false, onToggleRequireBirthCertificate: vi.fn(),
});
describe('independent final photo setting', () => {
  it('restores a settings subsection with browser Back and Forward', () => {
    const p = props();
    render(<MemoryRouter initialEntries={['/organization?tab=course-details&courseId=c1&courseSection=settings']}><HistoryControls /><CourseSettingsTabbed {...p} /></MemoryRouter>);
    expect(screen.getByRole('switch', { name: 'Фото перед итоговым тестом' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Доступ' }));
    expect(screen.queryByRole('switch', { name: 'Фото перед итоговым тестом' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'History back' }));
    expect(screen.getByRole('switch', { name: 'Фото перед итоговым тестом' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'History forward' }));
    expect(screen.queryByRole('switch', { name: 'Фото перед итоговым тестом' })).not.toBeInTheDocument();
    expect(p.onToggleRequireFinalTestPhoto).not.toHaveBeenCalled();
  });
  it('can require a final photo while entry identification remains disabled', () => {
    const p = props(); render(<MemoryRouter><CourseSettingsTabbed {...p} /></MemoryRouter>);
    const toggle = screen.getByRole('switch', { name: 'Фото перед итоговым тестом' });
    expect(toggle.getAttribute('aria-checked')).toBe('false');
    fireEvent.click(toggle);
    expect(p.onToggleRequireFinalTestPhoto).toHaveBeenCalledWith(true);
    expect(p.onToggleSkipVideoId).not.toHaveBeenCalled();
  });
  it('reflects saved state and prevents another change while saving', () => {
    const p = props(); render(<MemoryRouter><CourseSettingsTabbed {...p} requireFinalTestPhoto isSavingSettings /></MemoryRouter>);
    const toggle = screen.getByRole('switch', { name: 'Фото перед итоговым тестом' });
    expect(toggle.getAttribute('aria-checked')).toBe('true');
    fireEvent.click(toggle);
    expect(p.onToggleRequireFinalTestPhoto).not.toHaveBeenCalled();
  });
});
