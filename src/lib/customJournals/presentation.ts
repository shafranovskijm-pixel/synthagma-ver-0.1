import type { JournalField, JournalValues } from './contract';
export function displayJournalValue(value:JournalValues[string]|undefined):string {return value===null||value===undefined?'—':typeof value==='boolean'?(value?'Да':'Нет'):String(value);}
export function inputJournalValue(field:JournalField,raw:string):JournalValues[string] {if(raw==='')return null;if(field.type==='integer')return Number(raw);if(field.type==='boolean')return raw==='true';return raw;}
export const signatureNotice='Поле «Подпись» хранит непроверенный текст и не создаёт электронную подпись.';
export const subjectNotice='Запись относится к выбранному лицу. Не вводите данные других лиц.';
