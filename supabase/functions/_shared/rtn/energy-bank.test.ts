// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { normalizeEnergy, type EnergyWorkbook } from './energy-bank';

const hash = 'a'.repeat(64);
function book(): EnergyWorkbook {
  return { SheetNames: ['II'], Sheets: { II: {
    A1: { v: '№' }, B1: { v: 'Работники потребителей' }, A3: { v: 'Раздел закона' },
    A4: { v: 1 }, B4: { v: 'Какое значение?' }, C4: { v: '+' },
    B5: { v: 0.1, z: '0%' }, C5: { v: '+' }, B6: { v: 'Второй вариант' },
    A7: { v: 'Другой раздел' }, A8: { v: 1 }, B8: { v: 'Какое значение?' }, B9: { v: 'Да' }, B10: { v: 'Нет' },
  } } };
}
describe('energy official workbook normalization', () => {
  it('preserves repeated numbers across sections as separate questions with provenance', async () => {
    const [bank] = await normalizeEnergy(book(), hash);
    expect(bank.questions.map(q => q.number)).toEqual([1, 1]);
    expect(new Set(bank.questions.map(q => q.id)).size).toBe(2);
    expect(bank.questions[1].section?.text).toBe('Другой раздел');
    expect(bank.questions[0].source).toMatchObject({ sheet: 'II', row: 4, cell: 'B4', workbook_sha256: hash });
  });
  it('renders Excel percentage cells correctly and never treats applicability as an answer key', async () => {
    const [bank] = await normalizeEnergy(book(), hash);
    expect(bank.questions[0].options[0]).toMatchObject({ text: '10%', source_value: 0.1, number_format: '0%' });
    expect(bank.questions[0].applicability).toEqual([expect.objectContaining({ dimension: 'voltage', included: true })]);
    expect(JSON.stringify(bank)).not.toMatch(/correct_option_ids|correct_answer|is_correct|answerKey/);
  });
  it('does not silently repair text or infer a response mode', async () => {
    const workbook = book(); (workbook.Sheets.II.B4 as { v: string }).v = '  Вопрос\nс переносом?  ';
    const [bank] = await normalizeEnergy(workbook, hash);
    expect(bank.questions[0].text).toBe('  Вопрос\nс переносом?  ');
    expect(bank.questions[0]).not.toHaveProperty('responseMode');
  });
  it('fails on formulas, orphan options, missing options and unknown number formats', async () => {
    const formula = book(); formula.Sheets.II.B5 = { v: 1, f: '1+1' };
    await expect(normalizeEnergy(formula, hash)).rejects.toThrow('FORMULA');
    const orphan = book(); delete orphan.Sheets.II.A4;
    await expect(normalizeEnergy(orphan, hash)).rejects.toThrow('ORPHAN_OPTION');
    const incomplete = book(); delete incomplete.Sheets.II.B6;
    await expect(normalizeEnergy(incomplete, hash)).rejects.toThrow('INCOMPLETE_QUESTION');
    const unknown = book(); unknown.Sheets.II.B5 = { v: 0.1, z: '0.00%' };
    await expect(normalizeEnergy(unknown, hash)).rejects.toThrow('NUMBER_FORMAT');
  });
  it('is deterministic and changes identifiers for a changed source hash', async () => {
    const a = await normalizeEnergy(book(), hash), b = await normalizeEnergy(book(), hash), c = await normalizeEnergy(book(), 'b'.repeat(64));
    expect(a).toEqual(b); expect(a[0].questions[0].id).not.toBe(c[0].questions[0].id);
  });
  it('uses XML line endings consistently across OOXML libraries', async () => {
    const workbook = book(); workbook.Sheets.II.B5 = { v: 'Строка\r\nвторая' };
    const [bank] = await normalizeEnergy(workbook, hash);
    expect(bank.questions[0].options[0]).toMatchObject({ text: 'Строка\nвторая', source_value: 'Строка\nвторая' });
  });
});
