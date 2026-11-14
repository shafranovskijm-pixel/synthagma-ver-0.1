import {beforeEach,describe,expect,it,vi} from 'vitest';
const mock=vi.hoisted(()=>({bucket:vi.fn(),upload:vi.fn(),sign:vi.fn()}));
vi.mock('@/integrations/supabase/client',()=>({supabase:{storage:{from:mock.bucket}}}));
import {HOMEWORK_FILE_LIMIT,uploadHomeworkFile,resolveHomeworkFileUrl} from '../homeworkFiles';
const c={userId:'11111111-1111-4111-8111-111111111111',courseId:'22222222-2222-4222-8222-222222222222',lessonId:'33333333-3333-4333-8333-333333333333',epoch:'1'};
const tail='44444444-4444-4444-8444-444444444444';
const path=`${c.userId}/${c.courseId}/${c.lessonId}/${c.epoch}/${tail}`;
const attachment={bucket:'homework-files',path,url:`homework-file:${path}`,name:'answer.jpg',type:'image/jpeg'};
beforeEach(()=>{vi.clearAllMocks();mock.bucket.mockReturnValue({upload:mock.upload,createSignedUrl:mock.sign});mock.upload.mockImplementation(async p=>({data:{path:p},error:null}));mock.sign.mockResolvedValue({data:{signedUrl:'https://synthetic.test/signed'},error:null});});
describe('private homework file transport',()=>{
 it('uses private immutable storage with exact student/course/lesson/run scope',async()=>{
  const file=new File(['synthetic'],'answer.jpg',{type:'image/jpeg'});const result=await uploadHomeworkFile(file,c);
  expect(mock.bucket).toHaveBeenCalledExactlyOnceWith('homework-files');
  expect(mock.upload).toHaveBeenCalledWith(expect.stringMatching(new RegExp(`^${c.userId}/${c.courseId}/${c.lessonId}/1/`)),file,{upsert:false,cacheControl:'0',contentType:'image/jpeg'});
  expect(result.url).toBe(`homework-file:${result.path}`);expect(result).toMatchObject({bucket:'homework-files',name:'answer.jpg'});
 });
 it.each([0,HOMEWORK_FILE_LIMIT+1])('refuses invalid size %s before storage',async size=>{await expect(uploadHomeworkFile({size} as File,c)).rejects.toThrow();expect(mock.bucket).not.toHaveBeenCalled();});
 it('rejects stale/invalid run context before storage',async()=>{await expect(uploadHomeworkFile(new File(['x'],'x'),{...c,epoch:'1.0'})).rejects.toThrow();expect(mock.bucket).not.toHaveBeenCalled();});
 it('requires the server to confirm the exact path',async()=>{mock.upload.mockResolvedValue({data:{path:'foreign'},error:null});await expect(uploadHomeworkFile(new File(['x'],'x'),c)).rejects.toThrow('Файл не загружен');});
 it('creates short-lived download links without persisting signatures',async()=>{expect(await resolveHomeworkFileUrl(attachment)).toBe('https://synthetic.test/signed');expect(mock.sign).toHaveBeenCalledWith(path,300,{download:'answer.jpg'});expect(attachment.url).toBe(`homework-file:${path}`);});
 it('fails closed when private access is denied',async()=>{mock.sign.mockResolvedValue({data:null,error:{message:'denied'}});await expect(resolveHomeworkFileUrl(attachment)).rejects.toThrow();});
 it.each([{...attachment,url:'https://foreign.test'}, {...attachment,bucket:'course-files'}, {...attachment,path:'../foreign'}])('refuses inconsistent private references',async a=>{await expect(resolveHomeworkFileUrl(a)).rejects.toThrow();expect(mock.sign).not.toHaveBeenCalled();});
 it('preserves existing HTTP attachments and rejects executable URLs',async()=>{expect(await resolveHomeworkFileUrl({url:'https://legacy.test/answer.jpg'})).toBe('https://legacy.test/answer.jpg');await expect(resolveHomeworkFileUrl({url:'javascript:alert(1)'})).rejects.toThrow();expect(mock.sign).not.toHaveBeenCalled();});
});
