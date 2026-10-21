import {afterEach,beforeEach,describe,it,expect,vi} from 'vitest';
import {downloadVerifiedJournalExport} from '../scopedExport';
import {si} from './scopedFixtures';
let blobs:Blob[],click:ReturnType<typeof vi.spyOn>,create:ReturnType<typeof vi.fn>,revoke:ReturnType<typeof vi.fn>;
beforeEach(()=>{blobs=[];create=vi.fn((blob:Blob)=>{blobs.push(blob);return 'blob:SYN_SAVED';});revoke=vi.fn();vi.stubGlobal('URL',Object.assign(class extends URL {},{createObjectURL:create,revokeObjectURL:revoke}));click=vi.spyOn(HTMLAnchorElement.prototype,'click').mockImplementation(()=>{});});afterEach(()=>{vi.restoreAllMocks();vi.unstubAllGlobals();});
const text=(blob:Blob)=>new Promise<string>((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(String(r.result));r.onerror=reject;r.readAsText(blob,'UTF-8');});
describe('actual saved export Blob downloads',()=>{
 it.each(['json','html'] as const)('preserves exact UTF8 %s text, including whitespace, Cyrillic and leading zeroes',async format=>{const saved={manifestText:' {"номер":"0007", "строка":"Яна\n"}\n',htmlText:'<!doctype html>\n<p>0007 — журнал &lt;x&gt;</p>\r\n'};downloadVerifiedJournalExport(saved,si.export,format,()=>true);expect(click).toHaveBeenCalledTimes(1);expect(await text(blobs[0])).toBe(format==='json'?saved.manifestText:saved.htmlText);expect(blobs[0].type).toBe(format==='json'?'application/json;charset=utf-8':'text/html;charset=utf-8');expect(revoke).toHaveBeenCalledWith('blob:SYN_SAVED');});
 it('does not create or download any file without current authority',()=>{expect(()=>downloadVerifiedJournalExport({manifestText:'SYN',htmlText:'SYN'},si.export,'json',()=>false)).toThrow('ACCESS_DENIED');expect(create).not.toHaveBeenCalled();expect(click).not.toHaveBeenCalled();});
 it('revokes a prepared object URL but never clicks if scope expires before download',()=>{let n=0;expect(()=>downloadVerifiedJournalExport({manifestText:'SYN',htmlText:'SYN'},si.export,'html',()=>++n===1)).toThrow('ACCESS_DENIED');expect(click).not.toHaveBeenCalled();expect(revoke).toHaveBeenCalledWith('blob:SYN_SAVED');});
});
