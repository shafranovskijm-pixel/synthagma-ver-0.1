import { describe, expect, it } from 'vitest';
import { documentPreparationReason, groupNextActions } from './nextActions';

const base = {
  participants: { status: 'ready' as const, detail: '2 активных участника' },
  learning: { status: 'blocked' as 'ready' | 'blocked' | 'unknown', detail: '1 из 2 завершили' },
  courseId: 'course-a', missingOrganizationFields: [] as string[], missingGroupFields: [] as string[],
  permissions: { members: true, settings: true, requisites: true, journals: true, documents: true },
};
describe('group next actions are truthful navigation suggestions', () => {
  it('prioritizes actual missing participants, course and centre fields, at most3 actions', () => {
    const actions = groupNextActions({ ...base, participants: { status: 'blocked', detail: 'Добавьте учеников' }, courseId: null,
      missingOrganizationFields: ['ИНН центра'], missingGroupFields: ['даты обучения'] });
    expect(actions.map(a => a.target)).toEqual(['members', 'settings', 'requisites']);
    expect(actions[2].reason).toContain('ИНН центра');
  });
  it('unknown evidence stays unknown rather than being treated as no learning', () => {
    const actions = groupNextActions({ ...base, learning: { status: 'unknown', detail: 'Не удалось подтвердить обучение' } });
    expect(actions[0].target).toBe('refresh');
    expect(actions[0].reason).toContain('не означает');
    expect(actions.some(a => a.target === 'journals')).toBe(false);
    expect(actions.some(a => a.reason.includes('не проводилось'))).toBe(true);
  });
  it('denied destinations remain disabled with a visible responsibility explanation', () => {
    const actions = groupNextActions({ ...base, missingGroupFields: ['номер группы'], permissions: { ...base.permissions, documents: false, journals: false } });
    expect(actions.find(a => a.target === 'documents')).toMatchObject({ enabled: false, unavailableReason: expect.stringContaining('администратору') });
    expect(actions.find(a => a.target === 'journals')).toMatchObject({ enabled: false });
  });
  it('a completed course does not claim attestation, document issuance or handover', () => {
    const actions = groupNextActions({ ...base, learning: { status: 'ready', detail: '2 из 2 завершили обучение' } });
    expect(actions[0]).toMatchObject({ target: 'journals', title: 'Проверьте результаты обучения' });
    expect(actions[0].reason).toContain('проверяются отдельно');
    expect(actions.some(a => /готов к выдаче|документ выдан|вручён/.test(a.title))).toBe(false);
  });
});
describe('document preparation explains existing blockers', () => {
  const ready = { kind: 'snapshot' as const, busy: false, pending: false, sourceKnown: true, canCapture: true, hasSource: true, hasReason: true };
  it('does not replace an unknown source with a made-up missing calendar', () => {
    expect(documentPreparationReason({ ...ready, sourceKnown: false, hasSource: false })).toContain('пока не подтверждены');
  });
  it('explains reason, calendar, exact date and existing server prerequisites', () => {
    expect(documentPreparationReason({ ...ready, hasReason: false })).toContain('основание');
    expect(documentPreparationReason({ ...ready, hasSource: false })).toContain('календарь');
    expect(documentPreparationReason({ ...ready, canCapture: false, prerequisites: ['Подтвердите версию программы'] })).toBe('Подтвердите версию программы');
    expect(documentPreparationReason({ ...ready, kind: 'drafts', missingDateNames: ['Приказ о зачислении', 'Итоговая ведомость'] })).toContain('Приказ о зачислении, Итоговая ведомость');
    expect(documentPreparationReason(ready)).toBeNull();
  });
  it('pending mutations point to the same request, never a new automatic attempt', () => {
    expect(documentPreparationReason({ ...ready, pending: true })).toContain('того же запроса');
  });
});
