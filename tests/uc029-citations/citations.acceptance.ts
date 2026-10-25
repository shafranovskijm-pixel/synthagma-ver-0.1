import { describe, expect, it } from 'vitest';
import { REQUIREMENTS } from '../../src/lib/uc-compliance/catalog';
import { ADAPTATION_DRAFTS, adaptationDraftBasis, adaptationDraftText } from '../../src/lib/uc-compliance/adaptationDrafts';
const governmentCopy = 'https://mchs.gov.ru/uploads/document/2025-12-22/20f20f229c014d35cc094a9765e7f6e9.docx';
const basis = (id: string) => adaptationDraftBasis(id).find(item => item.id === 'LEGAL-03');
describe('proven DPO routes in actual adaptation exports', () => {
 it('CB01 credit export adds direct DPO paragraph17 while preserving unknown current credit procedure', () => {
  const text = adaptationDraftText('credit_rules')!;
  expect(basis('credit_rules')?.provision).toContain('п.17');
  expect(basis('credit_rules')?.href).toBe(governmentCopy);
  expect(text).toContain('ст.34 ч.1 п.7');
  expect(text).toContain('п.17 (для ДПО)');
  expect(text).toContain(governmentCopy);
  expect(text).toContain('не доказывает его действие после01.09.2026');
  expect(text).toContain('действующий порядок зачёта и его применимость требуют отдельной проверки');
 });
 it('CB02 quality export uses direct DPO paragraphs22–23 while keeping internal and independent assessment distinct', () => {
  const text = adaptationDraftText('vsoko')!;
  expect(basis('vsoko')?.provision).toContain('п.22–23 (для ДПО)');
  expect(text).toContain('ст.28 ч.3 п.13; ст.95');
  expect(text).toContain('внутренняя оценка отдельно от внешней независимой');
  expect(text).toContain(governmentCopy);
  expect(text).toContain('Текущая правовая актуальность не подтверждена.');
 });
 it('CB03 schedule export includes paragraph15 without issuing or approving an order', () => {
  const text = adaptationDraftText('schedule_approval')!;
  expect(basis('schedule_approval')?.provision).toBe('п.8,11,15');
  expect(text).toContain('п.8,11,15');
  expect(text).toContain(governmentCopy);
  expect(text).toContain('Решение об утверждении, дата и подпись: [не оформлены]');
  expect(REQUIREMENTS.find(item => item.id === 'schedule_approval')?.conditionDescription).toContain('отдельный приказ не универсально обязателен');
 });
 it('CB04 all seventeen exports keep explicit unapproved and unknown-current states without changing catalog inputs', () => {
  const before = JSON.stringify(REQUIREMENTS), ids = Object.keys(ADAPTATION_DRAFTS);
  expect(ids).toHaveLength(17);
  for (const id of ids) {
   const text = adaptationDraftText(id, ['Сопоставьте выбранную версию с фактической программой.'])!;
   expect(text).toContain('ПРОЕКТ ДЛЯ АДАПТАЦИИ — НЕ УТВЕРЖДЁН');
   expect(text).toContain('Редакция проекта: uc029-substantive-drafts-2026-10-26-v2');
   expect(text).toContain('Текущая правовая актуальность не подтверждена.');
   expect(text).toContain('Сам помощник не утверждает и не подписывает проект.');
   expect(text).toContain('Файл и версии');
  }
  const po = adaptationDraftBasis('admission_rules').find(item => item.id === 'LEGAL-08');
  expect(po?.readScope).toContain('возможная утрата силы или замена с01.09.2026');
  expect(po?.readScope).toContain('не установлены');
  expect(JSON.stringify(REQUIREMENTS)).toBe(before);
 });
});
