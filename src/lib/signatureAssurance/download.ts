import type {FrozenManifest} from './types';
import {SignatureEvidenceError,verifyManifest} from './validation';

export type EvidenceDownloadFormat='json'|'html';
export interface PreparedEvidenceDownload {
  readonly filename:string;
  readonly format:EvidenceDownloadFormat;
  available():boolean;
  handoff():void;
  dispose():void;
}
/** Exact verified derivative bytes, held only in this captured workspace memory. */
export async function prepareEvidenceDownload(
  value:FrozenManifest,format:EvidenceDownloadFormat,
  expected:{organizationId:string;signatureId:string;sourceManifestId:string;current:()=>boolean},
):Promise<PreparedEvidenceDownload>{
  const requireCurrent=()=>{if(!expected.current())throw new SignatureEvidenceError('ACCESS_DENIED');};
  requireCurrent();await verifyManifest(value,expected.organizationId,expected.signatureId,expected.sourceManifestId,expected.current);requireCurrent();
  const text=format==='json'?value.body_json:value.receipt_html;
  const blob=new Blob([new TextEncoder().encode(text)],{type:format==='json'?'application/json;charset=utf-8':'text/html;charset=utf-8'});
  const filename='Подтверждения-документа-'+value.body.captured_at.slice(0,10)+'.'+format;
  const started=performance.now();let disposed=false;
  const active=new Map<string,ReturnType<typeof setTimeout>>();
  const available=()=>{const age=performance.now()-started;return!disposed&&age>=0&&age<300_000&&expected.current();};
  const release=(url:string)=>{const timer=active.get(url);if(timer!==undefined)clearTimeout(timer);active.delete(url);URL.revokeObjectURL(url);};
  return {filename,format,available,
    handoff(){
      if(!available())throw new SignatureEvidenceError(expected.current()?'EXPIRED':'ACCESS_DENIED');
      const url=URL.createObjectURL(blob),anchor=document.createElement('a');let handed=false;
      try{
        anchor.href=url;anchor.download=filename;anchor.rel='noopener';document.body.appendChild(anchor);
        if(!available())throw new SignatureEvidenceError('ACCESS_DENIED');
        anchor.click();handed=true;
      }finally{
        anchor.remove();
        if(handed)active.set(url,setTimeout(()=>release(url),1_000));else release(url);
      }
    },
    dispose(){disposed=true;for(const url of active.keys())release(url);},
  };
}
