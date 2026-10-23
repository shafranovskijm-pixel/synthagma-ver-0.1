import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {webcrypto} from 'node:crypto';
import {prepareEvidenceDownload} from '../download';
import {id,manifest,org,signature} from './fixtures';

const urls:Blob[]=[],revoked:string[]=[];
beforeEach(()=>{vi.stubGlobal('crypto',webcrypto);urls.length=0;revoked.length=0;vi.stubGlobal('URL',class extends URL{static createObjectURL(blob:Blob){urls.push(blob);return'blob:synthetic-'+urls.length;}static revokeObjectURL(url:string){revoked.push(url);}});});
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllGlobals();vi.useRealTimers();document.body.innerHTML='';});
describe('captured exact evidence download',()=>{
  it.each(['json','html']as const)('hands off exact verified %s bytes through a connected anchor and delays URL cleanup',async(format)=>{
    const value=await manifest(),ready=await prepareEvidenceDownload(value,format,{organizationId:org,signatureId:signature,sourceManifestId:id(35),current:()=>true});
    const click=vi.spyOn(HTMLAnchorElement.prototype,'click').mockImplementation(function(){expect(this.isConnected).toBe(true);expect(this.download).toBe(ready.filename);});
    const originalTimer=globalThis.setTimeout.bind(globalThis);let cleanup!:(()=>void);
    vi.spyOn(globalThis,'setTimeout').mockImplementationOnce((handler,delay)=>{expect(delay).toBe(1_000);if(typeof handler!=='function')throw new Error('Expected cleanup callback');cleanup=()=>handler();return originalTimer(()=>{},60_000);});
    ready.handoff();expect(click).toHaveBeenCalledOnce();expect(revoked).toEqual([]);
    const bytes=await new Promise<Uint8Array>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(new Uint8Array(reader.result as ArrayBuffer));reader.onerror=reject;reader.readAsArrayBuffer(urls[0]);});
    const expectedBytes=new TextEncoder().encode(format==='json'?value.body_json:value.receipt_html);expect(bytes.byteLength).toBe(expectedBytes.byteLength);expect(Array.from(bytes)).toEqual(Array.from(expectedBytes));expect(document.querySelector('a')).toBeNull();
    cleanup();expect(revoked).toEqual(['blob:synthetic-1']);ready.dispose();
  });
  it('invalidates a previously prepared file after an observed account/context ABA and never hands it to the browser',async()=>{
    const value=await manifest();let epoch=1;const captured=epoch;
    const ready=await prepareEvidenceDownload(value,'json',{organizationId:org,signatureId:signature,sourceManifestId:id(35),current:()=>epoch===captured});
    const click=vi.spyOn(HTMLAnchorElement.prototype,'click').mockImplementation(()=>{});epoch++;epoch++;
    expect(ready.available()).toBe(false);expect(()=>ready.handoff()).toThrow();expect(click).not.toHaveBeenCalled();expect(urls).toHaveLength(0);ready.dispose();
  });
  it('refuses a late hash result after access changes and clears a failed synchronous browser handoff immediately',async()=>{
    const value=await manifest();let current=true;const waiting=prepareEvidenceDownload(value,'html',{organizationId:org,signatureId:signature,sourceManifestId:id(35),current:()=>current});current=false;
    await expect(waiting).rejects.toMatchObject({code:'ACCESS_DENIED'});expect(urls).toHaveLength(0);
    const ready=await prepareEvidenceDownload(value,'html',{organizationId:org,signatureId:signature,sourceManifestId:id(35),current:()=>true});
    vi.spyOn(HTMLAnchorElement.prototype,'click').mockImplementation(()=>{throw new Error('SYNTHETIC_BROWSER_FAILURE');});expect(()=>ready.handoff()).toThrow();expect(revoked).toEqual(['blob:synthetic-1']);expect(document.querySelector('a')).toBeNull();ready.dispose();
  });
  it('expires prepared bytes after five minutes and disposes all outstanding URLs on workspace close',async()=>{
    const value=await manifest(),now=vi.spyOn(performance,'now').mockReturnValue(10),ready=await prepareEvidenceDownload(value,'json',{organizationId:org,signatureId:signature,sourceManifestId:id(35),current:()=>true});
    vi.spyOn(HTMLAnchorElement.prototype,'click').mockImplementation(()=>{});ready.handoff();ready.dispose();expect(revoked).toEqual(['blob:synthetic-1']);expect(()=>ready.handoff()).toThrow();
    const next=await prepareEvidenceDownload(value,'json',{organizationId:org,signatureId:signature,sourceManifestId:id(35),current:()=>true});now.mockReturnValue(300_010);expect(next.available()).toBe(false);expect(()=>next.handoff()).toThrow();next.dispose();
  });
});
