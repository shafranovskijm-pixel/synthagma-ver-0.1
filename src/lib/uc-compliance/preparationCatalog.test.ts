import { describe, expect, it } from 'vitest';
import { REQUIREMENTS } from './catalog';
import { PREPARATION_PLANS, preparationPlan, preparationExample, preparationFileName } from './preparationCatalog';
import { TEMPLATES } from '@/lib/group-docs/templates';

describe('UC029 explicit preparation coverage', () => {
 it('PC01 covers exactly the existing 32 cards with 17 adaptation structures and 3 official-record checklists', () => {
  expect(Object.keys(PREPARATION_PLANS).sort()).toEqual(REQUIREMENTS.map(x => x.id).sort());
  expect(Object.values(PREPARATION_PLANS).filter(x => x.kind === 'adaptation_outline')).toHaveLength(17);
  expect(Object.values(PREPARATION_PLANS).filter(x => x.kind === 'official_record')).toHaveLength(3);
  expect(Object.values(PREPARATION_PLANS).filter(x => x.kind === 'existing_workflow')).toHaveLength(12);
 });
 it('PC02 rejects prototype names and unknown IDs rather than exporting an arbitrary template', () => {
  for (const id of ['__proto__', 'constructor', 'toString', '../charter', 'unknown']) {
   expect(preparationPlan(id)).toBeNull(); expect(preparationExample(id)).toBeNull(); expect(preparationFileName(id)).toBeNull();
  }
 });
 it('PC03 exports each exact card as a readable LF-separated unapproved example with unfilled centre facts', () => {
  for (const requirement of REQUIREMENTS) {
   const plan = preparationPlan(requirement.id)!; const text = preparationExample(requirement.id)!;
   expect(plan.steps.length).toBeGreaterThanOrEqual(4); expect(plan.nextStep.length).toBeGreaterThan(35);
   expect(text).toContain(plan.title); expect(text.split('\n').length).toBeGreaterThan(15); expect(text).not.toContain('\\n');
   for (const step of plan.steps) expect(text).toContain(step);
   expect(text).toContain('Сведения центра и источник: [не заполнено]'); expect(text).toContain('не является утверждённым актом');
   expect(preparationFileName(requirement.id)).toMatch(/^sintagma-example-[a-z_]+\.txt$/);
   expect(text).not.toMatch(/ГОРЭЛТЕХ|ГОРЕЛТЕХ|24@24zxc|\+7\s*\(?\d{3}/i);
  }
 });
 it('PC04 uses real-record checklists for charter, registration and licence without manufacturing official content', () => {
  expect(preparationExample('license')).toContain('ЧЕК-ЛИСТ ПРОВЕРКИ ПОДЛИННОГО ДОКУМЕНТА');
  expect(preparationPlan('license')!.links!.some(x => x.href === 'https://islod.obrnadzor.gov.ru/rlic/')).toBe(true);
  expect(preparationPlan('registration')!.links!.some(x => x.href.includes('nalog.gov.ru'))).toBe(true);
  expect(preparationPlan('charter')!.scope).toMatch(/собственного|подлинного|центра/i);
  expect(preparationExample('registration')).toContain('[не заполнено]');
 });
 it('PC05 keeps consent, previews and PO document checklists explicitly narrower than complete local acts', () => {
  expect(preparationPlan('personal_data')!.steps.join(' ')).toContain('только часть пакета, а не политика центра');
  expect(preparationPlan('doc_forms_approval')!.steps.join(' ')).toContain('решение отдельно; графический предпросмотр его не заменяет');
  for (const id of ['testimonial_profession','testimonial_position']) {
   expect(preparationPlan(id)!.limit).toContain('Универсальный графический образец здесь не предоставляется');
   expect(preparationPlan(id)!.existingSource!.key).toBe('qualification');
  }
 });
 it('PC06 binds actual group-template keys and distinct qualification previews instead of a generic generator', () => {
  for (const id of ['enrollment_order','expulsion_order','attestation_protocol']) {
   const source = preparationPlan(id)!.existingSource!;
   expect(source.file).toBe('src/lib/group-docs/templates.ts');
   expect(TEMPLATES.some(x => x.doc_type === source.key)).toBe(true);
  }
  expect(preparationPlan('certificate_qualification')!.existingSource!.key).toBe('certificate');
  expect(preparationPlan('diploma_retraining')!.existingSource!.key).toBe('diploma');
 });
});
