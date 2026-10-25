import {webcrypto} from 'node:crypto';
import {beforeEach,describe,expect,it,vi} from 'vitest';
import {actor,org,issuedRecord} from './fixtures.ts';
const mock=vi.hoisted(()=>({current:true,read:vi.fn(),session:vi.fn(),from:vi.fn(),download:vi.fn(),save:vi.fn(),versions:[] as any[]}));
vi.mock('@/utils/courseCache',()=>({captureOfflineContext:()=>({actorId:'00000000-0000-4000-8000-000000000001',revision:1}),isOfflineActorCurrent:()=>mock.current}));
vi.mock('@/integrations/supabase/client',()=>({supabase:{auth:{getSession:mock.session},from:mock.from,storage:{from:()=>({download:mock.download})}}}));
vi.mock('../client',async original=>({...await original<typeof import('../client.ts')>(),readEducationIssuance:mock.read}));
vi.mock('../export',()=>({downloadIssuanceBlob:mock.save}));
import {captureIssuanceScope} from '../client.ts';
import {downloadIssuedPdf} from '../artifactDownload.ts';
const scope=()=>captureIssuanceScope(org,{kind:'organization'},()=>true);
const bytes=new TextEncoder().encode('%PDF-1.7\nSynthetic immutable test bytes');
async function setup(){const record=issuedRecord(),proof=record.artifact.artifact!;proof.byte_size=bytes.length;proof.byte_sha256=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),n=>n.toString(16).padStart(2,'0')).join('');
 mock.read.mockResolvedValue({kind:'record',record});const version={id:proof.source.version_id,document_id:proof.source.document_id,organization_id:org,file_path:org+'/versions/test.pdf',file_size:bytes.length,file_name:'Документ.pdf'};mock.versions=[version,structuredClone(version)];return record;}
beforeEach(()=>{vi.clearAllMocks();vi.stubGlobal('crypto',webcrypto);mock.current=true;mock.session.mockResolvedValue({data:{session:{user:{id:actor},access_token:'synthetic'}},error:null});mock.download.mockResolvedValue({data:{arrayBuffer:async()=>bytes.slice().buffer},error:null});mock.from.mockImplementation(()=>{const q:any={};for(const method of ['select','eq','single'])q[method]=()=>q;q.setHeader=async()=>({data:mock.versions.shift(),error:null});return q;});});
describe('immutable issued artifact download',()=>{
 it('downloads the saved exact bytes after rechecking the immutable version, never regenerating',async()=>{const record=await setup();await expect(downloadIssuedPdf(scope(),record.official.id)).resolves.toEqual(record);expect(mock.download).toHaveBeenCalledWith(org+'/versions/test.pdf');expect(mock.save).toHaveBeenCalledTimes(1);expect(mock.from).toHaveBeenCalledTimes(2);});
 it('rejects tampered bytes even when their size and PDF magic look valid',async()=>{const record=await setup(),changed=bytes.slice();changed[changed.length-1]^=1;mock.download.mockResolvedValue({data:{arrayBuffer:async()=>changed.buffer},error:null});await expect(downloadIssuedPdf(scope(),record.official.id)).rejects.toMatchObject({code:'SOURCE_CHANGED'});expect(mock.save).not.toHaveBeenCalled();});
 it('rejects a version path changed during download',async()=>{const record=await setup();mock.versions[1].file_path=org+'/versions/replaced.pdf';await expect(downloadIssuedPdf(scope(),record.official.id)).rejects.toMatchObject({code:'SOURCE_CHANGED'});expect(mock.save).not.toHaveBeenCalled();});
 it('does not manufacture a PDF for legacy or currently unreadable artifacts',async()=>{const record=await setup();record.artifact={availability:'legacy_unverified',artifact:null};await expect(downloadIssuedPdf(scope(),record.official.id)).rejects.toMatchObject({code:'ARTIFACT_UNAVAILABLE'});expect(mock.download).not.toHaveBeenCalled();expect(mock.save).not.toHaveBeenCalled();});
 it('discards bytes after actor access changed',async()=>{const record=await setup();mock.download.mockImplementationOnce(async()=>{mock.current=false;return {data:{arrayBuffer:async()=>bytes.slice().buffer},error:null};});await expect(downloadIssuedPdf(scope(),record.official.id)).rejects.toMatchObject({code:'ACCESS_DENIED'});expect(mock.save).not.toHaveBeenCalled();});
});
