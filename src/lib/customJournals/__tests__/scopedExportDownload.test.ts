import {afterEach,beforeEach,describe,it,expect,vi} from 'vitest';
import {downloadVerifiedJournalExport} from '../scopedExport';
import {si} from './scopedFixtures';
let blobs:Blob[],links:HTMLAnchorElement[],connectedAtClick:boolean[],click:ReturnType<typeof vi.spyOn>,create:ReturnType<typeof vi.fn>,revoke:ReturnType<typeof vi.fn>;
beforeEach(()=>{
 vi.useFakeTimers({toFake:['setTimeout','clearTimeout']});
 blobs=[];links=[];connectedAtClick=[];
 create=vi.fn((blob:Blob)=>{blobs.push(blob);return 'blob:SYN_SAVED';});revoke=vi.fn();
 vi.stubGlobal('URL',Object.assign(class extends URL {},{createObjectURL:create,revokeObjectURL:revoke}));
 click=vi.spyOn(HTMLAnchorElement.prototype,'click').mockImplementation(function(this:HTMLAnchorElement){links.push(this);connectedAtClick.push(this.isConnected);expect(revoke).not.toHaveBeenCalled();});
});
afterEach(()=>{vi.runOnlyPendingTimers();vi.useRealTimers();vi.restoreAllMocks();vi.unstubAllGlobals();});
const text=(blob:Blob)=>new Promise<string>((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(String(r.result));r.onerror=reject;r.readAsText(blob,'UTF-8');});
describe('actual saved export Blob downloads',()=>{
 it.each(['json','html'] as const)('preserves exact UTF8 %s bytes and lets the connected browser anchor consume its URL before cleanup',async format=>{
  const saved={manifestText:' {"номер":"0007", "строка":"Яна\n"}\n',htmlText:'<!doctype html>\n<p>0007 — журнал &lt;x&gt;</p>\r\n'};
  downloadVerifiedJournalExport(saved,si.export,format,()=>true);
  expect(click).toHaveBeenCalledTimes(1);expect(connectedAtClick).toEqual([true]);
  expect(links[0].href).toBe('blob:SYN_SAVED');expect(links[0].download).toBe('journal_'+si.export+'.'+format);
  expect(links[0].isConnected).toBe(false);expect(document.body.contains(links[0])).toBe(false);
  expect(await text(blobs[0])).toBe(format==='json'?saved.manifestText:saved.htmlText);
  expect(blobs[0].type).toBe(format==='json'?'application/json;charset=utf-8':'text/html;charset=utf-8');
  expect(revoke).not.toHaveBeenCalled();expect(vi.getTimerCount()).toBe(1);
  vi.advanceTimersByTime(999);expect(revoke).not.toHaveBeenCalled();
  vi.advanceTimersByTime(1);expect(revoke).toHaveBeenCalledTimes(1);expect(revoke).toHaveBeenCalledWith('blob:SYN_SAVED');
 });
 it('does not create or download any file without current authority',()=>{
  expect(()=>downloadVerifiedJournalExport({manifestText:'SYN',htmlText:'SYN'},si.export,'json',()=>false)).toThrow('ACCESS_DENIED');
  expect(create).not.toHaveBeenCalled();expect(click).not.toHaveBeenCalled();expect(vi.getTimerCount()).toBe(0);
 });
 it('revokes a prepared object URL immediately but never clicks if scope expires before download',()=>{
  let n=0;expect(()=>downloadVerifiedJournalExport({manifestText:'SYN',htmlText:'SYN'},si.export,'html',()=>++n===1)).toThrow('ACCESS_DENIED');
  expect(click).not.toHaveBeenCalled();expect(revoke).toHaveBeenCalledTimes(1);expect(revoke).toHaveBeenCalledWith('blob:SYN_SAVED');expect(vi.getTimerCount()).toBe(0);
 });
 it('removes the temporary anchor and revokes immediately if browser activation throws',()=>{
  let attempted:HTMLAnchorElement|null=null;
  click.mockImplementation(function(this:HTMLAnchorElement){attempted=this;expect(this.isConnected).toBe(true);throw new Error('SYN_ACTIVATION_FAILED');});
  expect(()=>downloadVerifiedJournalExport({manifestText:'SYN',htmlText:'SYN'},si.export,'html',()=>true)).toThrow('SYN_ACTIVATION_FAILED');
  expect(attempted).not.toBeNull();expect(attempted!.isConnected).toBe(false);
  expect(revoke).toHaveBeenCalledTimes(1);expect(revoke).toHaveBeenCalledWith('blob:SYN_SAVED');expect(vi.getTimerCount()).toBe(0);
 });
});
