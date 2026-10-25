import { journalFieldsSchema, legacyDefinitionSchema, type JournalField, type LegacyDefinition } from './contract.ts';
export const builtinJournalFields:Record<string,JournalField>={
 full_name:{id:'full_name',label:'ФИО',type:'text',semantic:'full_name'},phone:{id:'phone',label:'Телефон',type:'text',semantic:'phone'},email:{id:'email',label:'Email',type:'text',semantic:'email'},
 position:{id:'position',label:'Должность',type:'text',semantic:'position'},organization:{id:'organization',label:'Организация',type:'text',semantic:'organization'},
 doc_number:{id:'doc_number',label:'Номер документа',type:'text',semantic:'doc_number'},doc_date:{id:'doc_date',label:'Дата документа',type:'date',semantic:'doc_date'},doc_type:{id:'doc_type',label:'Тип документа',type:'text',semantic:'doc_type'},
 event_date:{id:'event_date',label:'Дата события',type:'date',semantic:'event_date'},event_time:{id:'event_time',label:'Время',type:'time',semantic:'event_time'},location:{id:'location',label:'Место',type:'text',semantic:'location'},topic:{id:'topic',label:'Тема',type:'text',semantic:'topic'},
 result:{id:'result',label:'Результат',type:'text',semantic:'result'},grade:{id:'grade',label:'Оценка/Балл',type:'decimal',semantic:'grade'},notes:{id:'notes',label:'Примечания',type:'long_text',semantic:'notes'},signature:{id:'signature',label:'Подпись (непроверенный текст)',type:'text',semantic:'signature'},
};
export function fieldsFromLegacy(ids:string[]):JournalField[]{return journalFieldsSchema.parse(ids.map(id=>builtinJournalFields[id]));}
export interface LegacyDefinitionPreview {index:number;definition:LegacyDefinition|null;problem:string|null}
export function parseLegacyDefinitions(raw:string|null):LegacyDefinitionPreview[]{
 if(raw===null)return [];if(raw.length>500000)return [{index:0,definition:null,problem:'Локальные данные слишком велики для безопасного предпросмотра. Они не изменены.'}];
 let value:unknown;try{value=JSON.parse(raw);}catch{return [{index:0,definition:null,problem:'Локальные данные не удалось прочитать. Они не изменены.'}];}
 if(!Array.isArray(value)||value.length>250)return [{index:0,definition:null,problem:'Формат локального списка не поддерживается. Данные не изменены.'}];
 const ids=new Set<string>();return value.map((item,index)=>{const parsed=legacyDefinitionSchema.safeParse(item);
  if(!parsed.success)return {index,definition:null,problem:'Определение содержит неизвестные поля или неподдерживаемый формат. Исходная запись сохранена.'};
  if(ids.has(parsed.data.id))return {index,definition:null,problem:'Повторный локальный идентификатор. Нужна проверка конфликта; данные сохранены.'};
  ids.add(parsed.data.id);return {index,definition:parsed.data,problem:null};});
}
