/** Convert a school wall-clock value without using the computer's local zone. */
export function schoolDateTime(value: number | Date, timeZone: string): string {
 const parts = new Intl.DateTimeFormat('en-GB', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(value);
 const part = (type: string) => parts.find(p => p.type === type)?.value;
 return `${part('year')}-${part('month')}-${part('day')}T${part('hour')}:${part('minute')}`;
}
export function schoolTimeToUtc(value: string, timeZone: string): string {
 if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) throw new Error('Укажите дату и время занятия');
 const base = Date.parse(`${value}:00Z`);
 if (!Number.isFinite(base) || new Date(base).toISOString().slice(0,16) !== value) throw new Error('Некорректная дата');
 // Gather both possible offsets around a DST transition. Fail closed for ambiguous/nonexistent wall times.
 const offsets = new Set<number>();
 for (const delta of [-36, -12, 0, 12, 36]) {
  const instant = base + delta * 3600000;
  offsets.add(Date.parse(`${schoolDateTime(instant,timeZone)}:00Z`) - instant);
 }
 const candidates = [...offsets].map(offset => base-offset).filter(instant => schoolDateTime(instant,timeZone) === value);
 if (candidates.length !== 1) throw new Error('Это время неоднозначно или отсутствует при переводе часов. Выберите другое время.');
 return new Date(candidates[0]).toISOString();
}
export function rublesToKopecks(input: unknown): number {
 const value = String(input).trim().replace(',', '.');
 if (!/^\d+(\.\d{1,2})?$/.test(value)) throw new Error('Сумма должна быть положительной, не более двух знаков после запятой');
 const [whole, fraction=''] = value.split('.');
 const result = Number(whole)*100 + Number(fraction.padEnd(2,'0'));
 if (!Number.isSafeInteger(result) || result < 1 || result > 100000000) throw new Error('Допустимая сумма: от 0,01 до 1 000 000 рублей');
 return result;
}
export function safeCsvCell(value: unknown): string {
 let text = String(value ?? '');
 if (/^[\s\uFEFF]*[=+@-]/.test(text) || /^[\t\r\n]/.test(text)) text = `'${text}`;
 return `"${text.replace(/"/g,'""')}"`;
}
