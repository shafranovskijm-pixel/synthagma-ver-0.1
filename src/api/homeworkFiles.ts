import { supabase } from '@/integrations/supabase/client';
import { isLearningProgressEpoch } from '@/lib/learningProgress';
import { proxiedAssetUrl } from '@/utils/proxyFetch';

export const HOMEWORK_FILE_BUCKET = 'homework-files';
export const HOMEWORK_FILE_LIMIT = 20 * 1024 * 1024;
export interface HomeworkFile { url: string; name: string; type: string; bucket: 'homework-files'; path: string }
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const pathPattern = /^[0-9a-f-]{36}\/[0-9a-f-]{36}\/[0-9a-f-]{36}\/[0-9]{1,19}\/[0-9a-f-]{36}$/;
export async function uploadHomeworkFile(file: File, context: { userId: string; courseId: string; lessonId: string; epoch: string }): Promise<HomeworkFile> {
  if (![context.userId,context.courseId,context.lessonId].every(x=>uuid.test(x)) || !isLearningProgressEpoch(context.epoch)) throw new Error('Контекст задания не подтверждён');
  if (!file.size || file.size > HOMEWORK_FILE_LIMIT) throw new Error('Выберите непустой файл размером до 20 МБ');
  const path = `${context.userId}/${context.courseId}/${context.lessonId}/${context.epoch}/${crypto.randomUUID()}`;
  const { data, error } = await supabase.storage.from(HOMEWORK_FILE_BUCKET).upload(path,file,{upsert:false,cacheControl:'0',contentType:file.type || 'application/octet-stream'});
  if (error || data?.path !== path) throw new Error('Файл не загружен. Повторите прикрепление; ответ не отправлен.');
  return {bucket:HOMEWORK_FILE_BUCKET,path,url:`homework-file:${path}`,name:file.name,type:file.type || 'application/octet-stream'};
}
export async function resolveHomeworkFileUrl(value: unknown): Promise<string> {
  if (!value || typeof value !== 'object') throw new Error('Файл не подтверждён');
  const a=value as Record<string,unknown>;
  if (a.bucket===HOMEWORK_FILE_BUCKET || (typeof a.url==='string' && a.url.startsWith('homework-file:'))) {
    if (a.bucket!==HOMEWORK_FILE_BUCKET || typeof a.path!=='string' || !pathPattern.test(a.path) || a.url!==`homework-file:${a.path}`) throw new Error('Файл не подтверждён');
    const name=typeof a.name==='string' ? a.name.replace(/[\r\n/\\]/g,'_') : 'homework';
    const {data,error}=await supabase.storage.from(HOMEWORK_FILE_BUCKET).createSignedUrl(a.path,300,{download:name});
    if (error || !data?.signedUrl) throw new Error('Не удалось открыть файл');
    return proxiedAssetUrl(data.signedUrl);
  }
  if (typeof a.url!=='string') throw new Error('Файл не подтверждён');
  const url=new URL(a.url,window.location.origin);
  if (!['https:','http:'].includes(url.protocol)) throw new Error('Недопустимая ссылка на файл');
  return proxiedAssetUrl(url.href);
}
