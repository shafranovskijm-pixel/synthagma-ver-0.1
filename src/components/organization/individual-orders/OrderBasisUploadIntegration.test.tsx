import { beforeEach, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { actor, choice, course, enrollment, envelope, org, pupil, source, uid, witness } from '@/lib/individualEducationOrders/__tests__/fixtures';
const m = vi.hoisted(() => ({ sources: vi.fn(), reviews: vi.fn(), choice: vi.fn(), prepare: vi.fn(), upload: vi.fn() }));
vi.mock('@/lib/individualEducationOrders/client', () => ({
  captureIndividualOrderScope: (organizationId: string, enrollmentId: string, target: any, current: () => boolean) => ({ organizationId, enrollmentId, ...target, actorId: 'actor', accessRevision: 1, current }),
  individualOrderScopeCurrent: (s: any) => s.current(), normalizeIndividualOrderError: () => ({ code: 'DEPENDENCY_UNAVAILABLE', message: 'Состояние не подтверждено', missingFacts: [] }),
  readIndividualEducationOrder: async () => ({ ...envelope('summary'), context: { enrollment_witness: witness(), student_label: 'Иванов', course_label: 'Курс' }, orders: [], suggested_programme: null, missing_facts: [], capabilities: { can_prepare: true } }),
  readIndividualOrderProgrammeChoices: async () => ({ choices: [choice()], nextAfterVersionId: null }), readIndividualOrderSourceChoices: (...args: any[]) => m.sources(...args), readIndividualOrderBasisReviews: (...args: any[]) => m.reviews(...args),
  chooseIndividualOrderProgramme: vi.fn(), prepareIndividualEducationOrderAction: (...args: any[]) => m.prepare(...args), prepareIndividualOrderRender: vi.fn(),
}));
vi.mock('@/lib/individualEducationOrders/priorAdmissionBasis', () => ({ readIndividualOrderPriorAdmissionBasis: vi.fn() }));
vi.mock('@/lib/individualEducationOrders/artifactPreview', () => ({ loadIndividualOrderPdf: vi.fn() }));
vi.mock('@/lib/individualEducationOrders/basisUpload', () => ({ readSavedOrderBasisChoice: (...args: any[]) => m.choice(...args) }));
vi.mock('./OrderBasisUploadDialog', () => ({ OrderBasisUploadDialog: (props: any) => { m.upload(props); return props.open ? <button onClick={() => void props.onReturn({ id: 'saved', name: 'Новое заявление', current_version_id: 'saved-version' })}>Вернуться из штатной загрузки</button> : null; } }));
import { IndividualEducationOrderDialog } from './IndividualEducationOrderDialog';
beforeEach(() => { vi.clearAllMocks(); m.sources.mockResolvedValue({ choices: [{ label: 'Прежнее основание из общего поиска', source: source(401, 402) }], nextAfterId: uid(450) }); m.choice.mockResolvedValue({ label: 'Новое заявление', source: source(501, 502) }); m.reviews.mockResolvedValue([{ source: source(501, 502), review_id: uid(503), review_revision: 2, approval_number: 'Проверено-1', approval_date: '2026-11-20' }]); });
it('refreshes the exact real saved source and requires its actual selected review before adding a basis', async () => {
  render(<IndividualEducationOrderDialog organizationId={org} row={{ enrollment_id: enrollment, student_user_id: pupil, course_id: course, group_id: null } as any} enabled accessKey={actor} onClose={vi.fn()} onChanged={vi.fn()} />);
  fireEvent.click(await screen.findByRole('button', { name: 'Загрузить основание' })); fireEvent.click(screen.getByRole('button', { name: 'Вернуться из штатной загрузки' }));
  await waitFor(() => expect(screen.getByLabelText('Сохранённая версия документа')).toHaveValue(uid(502)));
  expect(m.choice.mock.calls[0][0]).toMatchObject({ organizationId: org, enrollmentId: enrollment, subjectUserId: pupil, courseId: course });
  expect(screen.queryByRole('button', { name: 'Ещё документы' })).toBeNull(); expect(screen.queryByRole('option', { name: 'Прежнее основание из общего поиска' })).toBeNull(); expect(screen.getByLabelText('Утверждённое рассмотрение')).toHaveValue(''); expect(screen.getByRole('button', { name: 'Добавить основание' })).toBeDisabled();
  fireEvent.change(screen.getByLabelText('Утверждённое рассмотрение'), { target: { value: uid(503) } }); fireEvent.change(screen.getByLabelText('Реквизиты или пункт основания'), { target: { value: 'Заявление Иванова от 20 ноября' } }); fireEvent.click(screen.getByRole('button', { name: 'Добавить основание' }));
  await screen.findByText('Заявление Иванова от 20 ноября'); expect(m.prepare).not.toHaveBeenCalled(); expect(m.reviews).toHaveBeenCalledWith(expect.anything(), source(501, 502));
});
