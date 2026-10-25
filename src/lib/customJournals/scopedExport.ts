import {scopedExportDetailSchema,scopedExportManifestSchema,sameScopedJournalContext,type ScopedJournalContext,type ScopedJournalExport} from './scopedContract.ts';
export class JournalExportVerificationError extends Error {constructor(readonly code:'ACCESS_DENIED'|'SOURCE_UNAVAILABLE'|'DEPENDENCY_UNAVAILABLE'='DEPENDENCY_UNAVAILABLE'){super(code);this.name='JournalExportVerificationError';}}
export interface JournalExportExpectation {organizationId:string;journalId:string;context:ScopedJournalContext;exportId:string}
const encoder=new TextEncoder(),maximumBytes=8*1024*1024;
const same=(a:unknown,b:unknown):boolean=>a===b||!!a&&!!b&&typeof a==='object'&&typeof b==='object'&&(Array.isArray(a)||Array.isArray(b)?Array.isArray(a)&&Array.isArray(b)&&a.length===b.length&&a.every((v,i)=>same(v,b[i])):Object.keys(a).length===Object.keys(b).length&&Object.keys(a).every(k=>Object.prototype.hasOwnProperty.call(b,k)&&same((a as Record<string,unknown>)[k],(b as Record<string,unknown>)[k])));
async function sha256(bytes:Uint8Array){const hash=await crypto.subtle.digest('SHA-256',bytes.slice().buffer as ArrayBuffer);return [...new Uint8Array(hash)].map(v=>v.toString(16).padStart(2,'0')).join('');}
function neutralHtml(html:string){
 for(const token of html.match(/<[^>]+>/g)??[]){if(/^<\/?(?:script|iframe|object|embed|form|input|button|link|svg|math|audio|video|frameset|frame|base|img)\b/i.test(token)||/\s(?:on[a-z]+|src|href|action|formaction|poster|srcdoc|data)\s*=/i.test(token)||/^<meta\b[^>]*http-equiv/i.test(token))return false;}
 for(const style of html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi))if(/url\s*\(|@import/i.test(style[1]))return false;
 return true;
}
/** Verify the stored UTF-8 bytes. Never re-render or re-serialize a saved export. */
export async function verifyScopedJournalExport(raw:ScopedJournalExport,expected:JournalExportExpectation,isCurrent:()=>boolean){
 const current=()=>{if(!isCurrent())throw new JournalExportVerificationError('ACCESS_DENIED');};current();
 const parsed=scopedExportDetailSchema.safeParse(raw);if(!parsed.success)throw new JournalExportVerificationError();const value=parsed.data;
 if(value.redacted)throw new JournalExportVerificationError('SOURCE_UNAVAILABLE');
 if(value.id!==expected.exportId||value.journal_id!==expected.journalId)throw new JournalExportVerificationError();
 const manifestBytes=encoder.encode(value.manifest_text),htmlBytes=encoder.encode(value.html_text);
 if(manifestBytes.length+htmlBytes.length>maximumBytes)throw new JournalExportVerificationError();
 const hashes=await Promise.all([sha256(manifestBytes),sha256(htmlBytes)]);current();
 if(hashes[0]!==value.manifest_hash||hashes[1]!==value.html_hash||!neutralHtml(value.html_text))throw new JournalExportVerificationError();
 let decoded:unknown;try{decoded=JSON.parse(value.manifest_text);}catch{throw new JournalExportVerificationError();}
 const manifestResult=scopedExportManifestSchema.safeParse(decoded);if(!manifestResult.success)throw new JournalExportVerificationError();const manifest=manifestResult.data;
 if(manifest.export_id!==value.id||manifest.organization_id!==expected.organizationId||manifest.journal.id!==expected.journalId||!sameScopedJournalContext(manifest.context,expected.context)||manifest.record_count!==value.record_count||manifest.records.length!==value.record_count)throw new JournalExportVerificationError();
 let previous='',historyCount=0;
 for(const record of manifest.records){
  historyCount+=record.history.length;if(historyCount>10000)throw new JournalExportVerificationError();
  if(record.id<=previous||record.journal_id!==expected.journalId||record.redacted||record.schema.redacted||record.history.length!==record.revision)throw new JournalExportVerificationError();previous=record.id;
  for(const [index,h] of record.history.entries())if(h.record_id!==record.id||h.revision!==index+1||h.schema.journal_id!==expected.journalId||h.redacted||h.schema.redacted||!same(h.subject,record.subject)||!same(h.source,record.source))throw new JournalExportVerificationError();
  const latest=record.history[record.history.length-1];if(!latest||latest.schema.id!==record.schema_version_id||!same(latest.subject,record.subject)||!same(latest.source,record.source)||!same(latest.values,record.values)||latest.archived!==record.archived)throw new JournalExportVerificationError();
 }
 current();return {manifest,manifestText:value.manifest_text,htmlText:value.html_text,manifestBytes,htmlBytes,manifestHash:value.manifest_hash,htmlHash:value.html_hash};
}
export function downloadVerifiedJournalExport(value:{manifestText:string;htmlText:string},exportId:string,format:'json'|'html',isCurrent:()=>boolean){
 if(!isCurrent())throw new JournalExportVerificationError('ACCESS_DENIED');
 const blob=new Blob([format==='json'?value.manifestText:value.htmlText],{type:format==='json'?'application/json;charset=utf-8':'text/html;charset=utf-8'}),url=URL.createObjectURL(blob);
 let link:HTMLAnchorElement|null=null,activated=false;
 try{
  if(!isCurrent())throw new JournalExportVerificationError('ACCESS_DENIED');
  link=document.createElement('a');link.href=url;link.download='journal_'+exportId+'.'+format;
  document.body.appendChild(link);link.click();activated=true;
 }finally{
  link?.remove();
  // Keep the object URL alive while the browser starts consuming the download.
  if(activated)setTimeout(()=>URL.revokeObjectURL(url),1000);else URL.revokeObjectURL(url);
 }
}
