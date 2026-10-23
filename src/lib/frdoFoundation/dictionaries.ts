import nativeData from './nativeData';
import {OFFICIAL_TEMPLATES} from './officialMetadata';
import {canonicalJson,deepFreeze,ensureCurrent,refuse,sha256} from './hash';
import type {CurrentGuard,Stream} from './types';
deepFreeze(nativeData);deepFreeze(OFFICIAL_TEMPLATES);
const memo=new Map<string,readonly string[]>();
export function nativeValues(stream:Stream,name:string):readonly string[]{
 const key=stream+':'+name,known=memo.get(key);if(known)return known;
 const data=nativeData[stream].dictionaries as unknown as Record<string,{values:readonly(string|number)[]}>;
 const dictionary=data[name];if(!dictionary)return refuse('TEMPLATE_CHANGED');
 const values=dictionary.values.map(value=>{if(typeof value!=='string'&&typeof value!=='number')return refuse('TEMPLATE_CHANGED');const text=String(value);return /[Гг]ражданство/.test(name)?text.padStart(3,'0'):text;});
 const result=Object.freeze(values);memo.set(key,result);return result;
}
const members=new Map<string,ReadonlySet<string>>();
export function nativeMember(stream:Stream,name:string,value:string):boolean{const key=stream+':'+name;let known=members.get(key);if(!known){known=new Set(nativeValues(stream,name));members.set(key,known);}return known.has(value);}
export function nativeDefinition(stream:Stream){return nativeData[stream];}
export async function verifyNativeDictionaries(stream:Stream,guard:CurrentGuard):Promise<void>{ensureCurrent(guard);const actual=await sha256(canonicalJson(nativeData[stream],2_000_000));ensureCurrent(guard);if(actual!==OFFICIAL_TEMPLATES[stream].dictionary_sha256)return refuse('TEMPLATE_CHANGED');}
export function officialTemplateRef(stream:Stream){const value=OFFICIAL_TEMPLATES[stream];return {template_id:value.id,byte_sha256:value.donor_sha256,mapping_revision:'uc020-v2' as const,dictionary_sha256:value.dictionary_sha256,column_count:value.column_count};}
