import type { JournalField, JournalValues, JournalRecord } from './contract.ts';
export function displayJournalValue(value:JournalValues[string]|undefined):string {return value===null||value===undefined?'—':typeof value==='boolean'?(value?'Да':'Нет'):String(value);}
export function inputJournalValue(field:JournalField,raw:string):JournalValues[string] {if(raw==='')return null;if(field.type==='integer')return Number(raw);if(field.type==='boolean')return raw==='true';return raw;}
export const signatureNotice='Поле «Подпись» хранит непроверенный текст и не создаёт электронную подпись.';
export const subjectNotice='Запись относится к выбранному лицу. Не вводите данные других лиц.';

/** The immutable schema of this saved record, never the latest journal header. */
export function savedJournalFields(record:Pick<JournalRecord,'schema'|'values'|'redacted'>){
 if(record.redacted||record.schema.redacted)return [];
 return record.schema.fields.map(field=>({id:field.id,label:field.label,type:field.type,semantic:field.semantic,value:displayJournalValue(record.values[field.id])}));
}
