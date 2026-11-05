import { webcrypto } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ from: vi.fn(), upload: vi.fn(), download: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { storage: { from: mocks.from } } }));
import { maxSupportScreenshotBytes, supportScreenshotBytes, uploadVideoReportScreenshot } from './videoReportScreenshotUpload';
const user = '10000000-0000-4000-8000-000000000001';
const request = '20000000-0000-4000-8000-000000000001';
const png = [137,80,78,71,13,10,26,10,0,1,2,3];
function image(bytes = png, type = 'image/png', overrides = {}) {
  const buffer = Uint8Array.from(bytes).buffer;
  return {name:'private-original-name.png',type,size:buffer.byteLength,arrayBuffer:async()=>buffer,...overrides} as File;
}
beforeEach(()=>{
  vi.clearAllMocks(); vi.stubGlobal('crypto', webcrypto);
  mocks.from.mockReturnValue({upload:mocks.upload,download:mocks.download});
  mocks.upload.mockResolvedValue({error:null});
});
afterEach(()=>vi.unstubAllGlobals());
describe('private optional support screenshot',()=>{
  it.each([
    [png,'image/png'],[[255,216,255,224,0,1],'image/jpeg'],
    [[82,73,70,70,0,0,0,0,87,69,66,80,0],'image/webp'],
  ])('recognizes image bytes and calculates a content hash',async(bytes,mime)=>{
    const result=await supportScreenshotBytes(image(bytes as number[],mime as string));
    expect(result.mime).toBe(mime);expect(result.sha256).toMatch(/^[0-9a-f]{64}$/);
  });
  it.each([
    image([], 'image/png'),image(png,'text/html'),image([60,104,116,109,108],'image/png'),
    image(png,'image/png',{size:maxSupportScreenshotBytes+1}),image(png,'image/png',{size:99}),
  ])('refuses empty, oversized, forged or inconsistent files before upload',async file=>{
    await expect(uploadVideoReportScreenshot(user,request,file,()=>true)).rejects.toThrow('support_screenshot_unavailable');
    expect(mocks.from).not.toHaveBeenCalled();
  });
  it('writes immutable private bytes with a generated name; no original name, public or signed URL',async()=>{
    const reference=await uploadVideoReportScreenshot(user,request,image(),()=>true);
    expect(mocks.from).toHaveBeenCalledWith('student-documents');
    expect(mocks.upload).toHaveBeenCalledWith(expect.stringMatching(new RegExp(`^support/${user}/${request}-[a-f0-9]{64}\\.png$`)),expect.any(ArrayBuffer),{contentType:'image/png',upsert:false});
    expect(reference).toMatch(/^storage:\/\/student-documents\/support\//);
    expect(reference).not.toMatch(/private-original|token|https|\?/);expect(mocks.download).not.toHaveBeenCalled();
  });
  it('recovers a lost upload response only by reading identical existing bytes',async()=>{
    mocks.upload.mockResolvedValue({error:{statusCode:'409'}});
    mocks.download.mockResolvedValue({data:image(),error:null});
    const reference=await uploadVideoReportScreenshot(user,request,image(),()=>true);
    expect(mocks.download).toHaveBeenCalledWith(reference.replace('storage://student-documents/',''));
    expect(mocks.upload).toHaveBeenCalledTimes(1);
  });
  it.each([
    {data:image([...png,99]),error:null},{data:null,error:{message:'denied'}},
    {data:image(png,'image/png',{size:maxSupportScreenshotBytes+1}),error:null},
  ])('does not trust an existing object with other bytes or unreadable storage',async read=>{
    mocks.upload.mockResolvedValue({error:{status:409}});mocks.download.mockResolvedValue(read);
    await expect(uploadVideoReportScreenshot(user,request,image(),()=>true)).rejects.toThrow('support_screenshot_unavailable');
  });
  it('does not overwrite or read through a permission failure',async()=>{
    mocks.upload.mockResolvedValue({error:{statusCode:403}});
    await expect(uploadVideoReportScreenshot(user,request,image(),()=>true)).rejects.toThrow('support_screenshot_unavailable');
    expect(mocks.download).not.toHaveBeenCalled();
  });
  it('stops a stale lesson before and after upload',async()=>{
    await expect(uploadVideoReportScreenshot(user,request,image(),()=>false)).rejects.toThrow();
    expect(mocks.upload).not.toHaveBeenCalled();
    let current=true;mocks.upload.mockImplementation(async()=>{current=false;return{error:null};});
    await expect(uploadVideoReportScreenshot(user,request,image(),()=>current)).rejects.toThrow();
  });
});
