import {it,expect} from 'vitest';
import {createHash} from 'node:crypto';
import {REQUIREMENTS} from '@/lib/uc-compliance/catalog';
import {PREPARATION_PLANS,preparationExample} from '@/lib/uc-compliance/preparationCatalog';
import {ADAPTATION_DRAFTS,adaptationDraft,adaptationDraftBasis,adaptationDraftText} from '@/lib/uc-compliance/adaptationDrafts';
it('DC01 every adaptation card has substantive procedures, factual fields and retained quick steps',()=>{
 const ids=Object.keys(PREPARATION_PLANS).filter(id=>PREPARATION_PLANS[id].kind==='adaptation_outline');
 expect(Object.keys(ADAPTATION_DRAFTS).sort()).toEqual(ids.sort());expect(ids).toHaveLength(17);
 for(const id of ids){const draft=adaptationDraft(id)!;const text=preparationExample(id)!;
  expect(draft.fields.length).toBeGreaterThanOrEqual(3);expect(draft.sections.length).toBeGreaterThanOrEqual(5);
  expect(draft.sections.every(([,paragraphs])=>paragraphs.every(p=>p.length>80))).toBe(true);
  for(const step of PREPARATION_PLANS[id].steps)expect(text).toContain(step);
  for(const [title,paragraphs]of draft.sections){expect(text).toContain(title);for(const p of paragraphs)expect(text).toContain(p);}
  expect(text).toContain('ПРОЕКТ ДЛЯ АДАПТАЦИИ — НЕ УТВЕРЖДЁН');expect(text).toContain('Решение об утверждении, дата и подпись: [не оформлены]');
  expect(text).toContain('Сведения центра и источник: [не заполнено]');expect(text).toContain('Файл и версии');
 }
});
it('DC02 actual procedures distinguish DPO, PO and provider-specific limits rather than one universal act',()=>{
 expect(preparationExample('admission_rules')).toContain('Для ДПО отдельно проверяются');expect(preparationExample('admission_rules')).toContain('Для ПО отдельно проверяются');
 expect(preparationExample('attestation_rules')).toContain('части квалификационного экзамена');expect(preparationExample('attestation_rules')).toContain('протокола не является решением комиссии');
 expect(preparationExample('salary_rules')).toContain('не приравниваются к работникам');expect(preparationExample('pedagogical_council')).toContain('не объявляется обязательным каждому ИП');
 expect(preparationExample('elearning_rules')).toContain('не предписывает непроверенный сервис');expect(preparationExample('commission_orders')).toContain('заранее заполненные положительные результаты недопустимы');
 for(const id of ['electronic_docs_rules','electronic_docs_order']){const t=preparationExample(id)!;expect(t).toContain('с её учредителем');expect(t).toContain('ст.28 ч.8');expect(t).toContain('ИП');}
 expect(preparationExample('vsoko')).toContain('ст.95 — к независимой оценке');expect(preparationExample('expulsion_rules')).toContain('незавершённой основной профессиональной образовательной программе');
});
it('DC03 per-card provisions trace exact known reading scope and preserve unknown current law',()=>{
 for(const id of Object.keys(ADAPTATION_DRAFTS)){const requirement=REQUIREMENTS.find(x=>x.id===id)!;const basis=adaptationDraftBasis(id);
  expect(basis.map(x=>[x.id,x.provision])).toEqual(requirement.legalSources.map(x=>[x.id,x.provision]));
  for(const b of basis){expect(b.href).toMatch(/^https:\/\//);expect(b.readEdition.length).toBeGreaterThan(35);expect(b.readScope.length).toBeGreaterThan(60);expect(preparationExample(id)).toContain(b.readEdition);}
 }
 const education=adaptationDraftBasis('edu_relations').find(x=>x.id==='LEGAL-01')!;
 expect(education.readEdition).toContain('ст.30, 53, 54, 61');expect(education.readEdition).toContain('Получена24.10.2026 UTC');expect(education.readEdition).not.toContain('сохранён 24.09');expect(education.href).toBe('https://mchs.gov.ru/uploads/document/2026-09-24/b5bb7424f411b38df7dfe047a2415cbb.docx');expect(education.readScope).toContain('Полная текущая официальная цепочка изменений');
 const expected273={"admission_rules":[30,55],"attestation_rules":[30,58,74,76],"edu_relations":[30,53,54,61],"expulsion_rules":[30,61,62],"vsoko":[28,95],"elearning_rules":[16],"credit_rules":[34],"pedagogical_council":[26],"electronic_docs_rules":[16,28,30],"electronic_docs_order":[16,28,30]};for(const [id,articles]of Object.entries(expected273)){const b=adaptationDraftBasis(id).find(x=>x.id==='LEGAL-01')!;expect(b.readEdition).toContain('Прочитаны для этой карточки: ст.'+articles.join(', ')+'.');}
 expect(Object.keys(expected273)).toHaveLength(10);expect(new Set(Object.values(expected273).flat()).size).toBe(14);
 for(const id of Object.keys(ADAPTATION_DRAFTS).filter(id=>!Object.prototype.hasOwnProperty.call(expected273,id)))expect(adaptationDraftBasis(id).some(x=>x.id==='LEGAL-01')).toBe(false);
 expect(adaptationDraftBasis('electronic_docs_rules').find(x=>x.id==='LEGAL-17')!.readEdition).toContain('ред.31.07.2025');
 expect(preparationExample('program_dev_rules')).toContain('Текущая правовая актуальность не подтверждена');
});
it('DC04 authentic-record checklists and other workflows retain their existing content, no invented official act',()=>{
 const charter=preparationExample('charter')!;expect(createHash('sha256').update(charter).digest('hex')).toBe('bf49aadac115b098b900cd7dcd3c6ba768da95bdc7be065d8943807837b60187');
 for(const id of ['charter','license','registration','personal_data','paid_services','certificate_qualification','testimonial_profession']){
  expect(adaptationDraft(id)).toBeNull();expect(adaptationDraftText(id)).toBeNull();expect(preparationExample(id)).not.toContain('ПРЕДЛАГАЕМОЕ СОДЕРЖАНИЕ');
 }
 expect(preparationExample('personal_data')).toContain('не политика центра');expect(preparationExample('testimonial_profession')).toContain('Универсальный графический образец здесь не предоставляется');
});
it('DC05 unknown IDs and prototype keys never produce arbitrary draft or provenance',()=>{
 for(const id of ['__proto__','constructor','toString','../admission_rules','unknown']){expect(adaptationDraft(id)).toBeNull();expect(adaptationDraftText(id)).toBeNull();expect(adaptationDraftBasis(id)).toEqual([]);}
});
