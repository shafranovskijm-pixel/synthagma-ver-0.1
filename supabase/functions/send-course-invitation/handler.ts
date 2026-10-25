import { AccessError, checked, requireUuid, type AccessDb } from '../_shared/privileged-access.ts';
import { readProviderOperationObject, requireProviderOperationActor, providerOperationError, providerOperationJSON, requireProviderRate, type ProviderRateResult } from '../_shared/provider-operation-access.ts';
export interface InvitationDependencies { admin: AccessDb; caller: (header: string) => AccessDb; apiKey: () => string | undefined; network: typeof fetch; rate: (key: string) => ProviderRateResult; log: (event: 'course_invitation_failed') => void }
export const invitationCors = {'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'};
function escapeHTML(value: unknown): string { const entities: Record<string,string> = {'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}; return String(value ?? '').replace(/[&<>"']/g, c => entities[c]); }
export function createCourseInvitationHandler(deps: InvitationDependencies) {
 return async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') return new Response(null, {headers: invitationCors});
  try {
   const actor = await requireProviderOperationActor(req, deps.admin, deps.caller);
   const body = await readProviderOperationObject(req);
   if (Object.keys(body).some(k => !['email', 'courseId', 'courseName', 'organizationName', 'registrationToken'].includes(k)) || typeof body.email !== 'string' || body.email.length > 320 || !/^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(body.email) || (body.registrationToken != null && body.registrationToken !== '')) throw new AccessError(400, 'Выберите существующего ученика с назначенным курсом.');
   const courseId = requireUuid(body.courseId, 'курс'), email = body.email.toLowerCase();
   const courseRef = checked<any>(await deps.admin.from('courses').select('id,organization_id').eq('id', courseId).maybeSingle());
   if (!courseRef?.organization_id) throw new AccessError(404, 'Курс не найден.');
   const organizationId = requireUuid(courseRef.organization_id, 'организация');
   if (checked(await actor.caller.rpc('can_access_organization', {_organization_id: organizationId, _permission: 'students.write'})) !== true) throw new AccessError(403, 'Нет прав приглашать учеников этой организации.');
   const course = checked<any>(await deps.admin.from('courses').select('id,title,organization_id').eq('id', courseId).maybeSingle());
   if (!course || course.organization_id !== organizationId) throw new AccessError(409, 'Курс изменился. Повторите проверку назначения.');
   // Only authorized organizational recipient data, never caller-supplied display names or Origin.
   const student = checked<any>(await deps.admin.from('profiles').select('user_id,email,organization_id,blocked_at').eq('organization_id', organizationId).eq('email', email).maybeSingle());
   if (!student || student.blocked_at || student.organization_id !== organizationId || typeof student.email !== 'string' || student.email.toLowerCase() !== email) throw new AccessError(404, 'Назначение курса не найдено.');
   const revoked = checked(await deps.admin.from('account_deletion_revocations').select('user_id').eq('user_id', student.user_id).maybeSingle());
   if (revoked) throw new AccessError(403, 'Доступ ученика отозван.');
   const enrollment = checked<any>(await deps.admin.from('enrollments').select('id,user_id,course_id,status').eq('course_id', courseId).eq('user_id', student.user_id).maybeSingle());
   if (!enrollment || enrollment.course_id !== courseId || enrollment.user_id !== student.user_id || ['cancelled', 'canceled', 'revoked'].includes(enrollment.status)) throw new AccessError(404, 'Назначение курса не найдено.');
   const organization = checked<any>(await deps.admin.from('organizations').select('name').eq('id', organizationId).maybeSingle());
   if (!organization || typeof course.title !== 'string' || typeof organization.name !== 'string') throw new AccessError(503, 'Не удалось подтвердить данные курса.');
   requireProviderRate(deps.rate('course-invitation:' + actor.userId));
   const key = deps.apiKey(); if (!key) throw new AccessError(503, 'Отправка приглашений временно недоступна.');
   const courseName = escapeHTML(course.title), organizationName = escapeHTML(organization.name);
   const inviteLink = 'https://xn--80aaiswd0ak.xn--p1ai/login?redirect=/course/' + courseId;
   const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>body{font-family:Arial,sans-serif;line-height:1.6;color:#333}.container{max-width:600px;margin:0 auto;padding:20px}.header{background:linear-gradient(135deg,#6366f1,#8b5cf6);color:white;padding:30px;border-radius:12px 12px 0 0;text-align:center}.content{background:#f9fafb;padding:30px;border-radius:0 0 12px 12px}.button{display:inline-block;background:#6366f1;color:white;padding:14px 28px;text-decoration:none;border-radius:8px;font-weight:bold;margin:20px 0}.footer{text-align:center;margin-top:20px;color:#666;font-size:14px}</style></head><body><div class="container"><div class="header"><h1>📚 Приглашение на курс</h1></div><div class="content"><p>Здравствуйте!</p><p>Вас приглашают на курс <strong>"${courseName}"</strong> от компании <strong>${organizationName}</strong>.</p><p>Чтобы начать обучение, нажмите на кнопку ниже:</p><p style="text-align:center"><a href="${inviteLink}" class="button">Перейти к курсу</a></p><p>Или скопируйте эту ссылку в браузер:</p><p style="word-break:break-all;background:#e5e7eb;padding:10px;border-radius:4px;font-size:12px">${inviteLink}</p></div><div class="footer"><p>Это автоматическое сообщение. Пожалуйста, не отвечайте на него.</p></div></div></body></html>`;
   const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 12000);
   let response: Response;
   try { response = await deps.network('https://api.resend.com/emails', {method: 'POST', headers: {Authorization: 'Bearer ' + key, 'Content-Type': 'application/json'}, body: JSON.stringify({from: 'Обучение <onboarding@resend.dev>', to: [student.email], subject: 'Приглашение на курс: ' + course.title.replace(/[\r\n\u0000]/g, ' '), html}), signal: controller.signal}); }
   finally { clearTimeout(timer); }
   try { void response.body?.cancel().catch(() => undefined); } catch { /* no provider payload needed */ }
   if (!response.ok) throw new AccessError(502, 'Не удалось отправить приглашение. Повторите позже.');
   return providerOperationJSON({success: true}, invitationCors);
  } catch (error: unknown) { try { deps.log('course_invitation_failed'); } catch { /* logging cannot replace the closed response */ } return providerOperationError(error, invitationCors); }
 };
}
