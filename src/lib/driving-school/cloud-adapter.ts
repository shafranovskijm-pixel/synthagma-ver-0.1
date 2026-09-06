import { z } from 'zod';
import { supabase } from '@/integrations/supabase/client';
import type { DrivingAdapter, State, Row, Entry } from './types';

const id = z.string().min(1);
const date = z.string().refine(v => Number.isFinite(Date.parse(v)), 'Некорректная временная отметка');
const base = z.object({ id, name: z.string(), active: z.boolean().optional() });
const question = z.object({ text: z.string(), options: z.array(z.string()), correct: z.number().int().optional() });
const stateSchema = z.object({
 connected: z.literal(true), can_manage: z.boolean(),
 viewer: z.object({ role: z.enum(['owner','student','instructor']), student_id: id.nullable(), instructor_id: id.nullable() }),
 school: z.object({ organization_id: id, name: z.string(), timezone: z.string(), horizon_days: z.number(), cancel_hours: z.number() }),
 programs: z.array(base.extend({ version:z.string(), transmission:z.string(), practice_minutes:z.number(), category:z.string() })),
 cars: z.array(base.extend({ number:z.string(), transmission:z.string(), category:z.string() })),
 groups: z.array(base.extend({ program_id:id })),
 students: z.array(base.extend({ email:z.string().nullable().optional(), phone:z.string().nullable().optional(), program_id:id, group_id:id.nullable(), instructor_id:id.nullable(), practice_minutes:z.number(), transmission:z.string() })),
 instructors: z.array(base.extend({ email:z.string().nullable().optional(), car_id:id.nullable(), shifts:z.array(z.object({id,starts_at:date,ends_at:date})) })),
 courses: z.array(base.extend({ program_id:id, material:z.string(), pass_percent:z.number(), questions:z.array(question), lms_course_id:id.nullable().optional() })),
 lessons:z.array(z.object({id,student_id:id,instructor_id:id,car_id:id,starts_at:date,ends_at:date,status:z.enum(['booked','completed','cancelled','no_show']),actual_minutes:z.number(),topic:z.string(),note:z.string()})),
 entries:z.array(z.object({id,student_id:id,kind:z.enum(['charge','payment','exam','attempt']),created_at:date,data:z.record(z.unknown()),reversal:z.object({reason:z.string(),created_at:date}).nullable()})),
 balances:z.array(z.object({id,completed:z.number(),reserved:z.number(),planned:z.number()})),
 busy:z.array(z.object({starts_at:date,ends_at:date})),
 audit:z.array(z.object({action:z.string(),target:z.string(),created_at:date,detail:z.unknown()})),
});
export class DrivingUnavailable extends Error {
 constructor(message = 'Модуль автошкол пока закрыт для пилота. Рабочий доступ появится после отдельной проверки и выпуска.') { super(message); this.name='DrivingUnavailable'; }
}
export function drivingError(error: { code?: string; message?: string } | null): Error {
 if (['PGRST301','PGRST302','401'].includes(error?.code || '')) return new Error('Сессия истекла. Войдите заново через общий вход СИНТАГМЫ.');
 if (['42501','403'].includes(error?.code || '')) return new DrivingUnavailable('Доступ не разрешён: модуль закрыт для пилота или прав текущего аккаунта недостаточно.');
 if (['PGRST202','42883','42P01'].includes(error?.code || '')) return new DrivingUnavailable('Модуль ещё не подключён на сервере: необходимые объекты или RPC недоступны.');
 if (/fetch|network|connection/i.test(error?.message || '')) return new Error('Нет связи с сервером. Проверьте соединение и повторите запрос.');
 return new Error(error?.message || 'Не удалось выполнить запрос. Проверьте соединение и повторите.');
}
// Only this exact RPC set is called here. The shared proxy/Auth client remains the transport.
const rpc = supabase.rpc.bind(supabase) as unknown as (name:string,args?:Record<string,unknown>) => Promise<{data:unknown;error:{code?:string;message?:string}|null}>;
export async function drivingRpc<T>(name:string,args?:Record<string,unknown>):Promise<T> {
 const {data,error}=await rpc(name,args); if(error) throw drivingError(error); return data as T;
}
export function adaptCloudState(raw:unknown, organizationId:string):State {
 const parsed=stateSchema.safeParse(raw);
 if(!parsed.success) throw new Error('Backend вернул неполные данные автошколы. Обновите страницу; при повторении передайте ошибку администратору.');
 const s=parsed.data;
 if(s.school.organization_id !== organizationId) throw new Error('Ответ относится к другой организации. Данные не открыты.');
 new Intl.DateTimeFormat('ru-RU',{timeZone:s.school.timezone}).format();
 const resources:Row[] = [
  ...s.programs.map(r => ({id:r.id,kind:'program' as const,name:r.name,active:Number(r.active!==false),data:{version:r.version,transmission:r.transmission,practiceMinutes:r.practice_minutes,category:r.category}})),
  ...s.cars.map(r => ({id:r.id,kind:'car' as const,name:r.name,active:Number(r.active!==false),data:{number:r.number,transmission:r.transmission,category:r.category}})),
  ...s.groups.map(r => ({id:r.id,kind:'group' as const,name:r.name,active:1,data:{programId:r.program_id}})),
  ...s.students.map(r => ({id:r.id,kind:'student' as const,name:r.name,active:Number(r.active!==false),data:{email:r.email||'',phone:r.phone||'',programId:r.program_id,groupId:r.group_id,instructorId:r.instructor_id,practiceMinutes:r.practice_minutes,transmission:r.transmission}})),
  ...s.instructors.map(r => ({id:r.id,kind:'instructor' as const,name:r.name,active:Number(r.active!==false),data:{email:r.email||'',carId:r.car_id||'',windows:r.shifts.map(w=>({id:w.id,start:w.starts_at,end:w.ends_at}))}})),
  ...s.courses.map(r=>({id:r.id,kind:'course' as const,name:r.name,active:1,data:{programId:r.program_id,material:r.material,passPercent:r.pass_percent,questions:r.questions.map(q=>({text:q.text,options:q.options,correct:q.correct}))}})),
 ];
 const entries:Entry[]=s.entries.map(e=>{
  const common={id:e.id,student_id:e.student_id,created:Date.parse(e.created_at),reversal:e.reversal?{reason:e.reversal.reason,created:Date.parse(e.reversal.created_at)}:null};
  if(e.kind==='charge'||e.kind==='payment') {const d=z.object({kopecks:z.number().int(),note:z.string(),date:z.string()}).parse(e.data);return {...common,kind:e.kind,data:{kopecks:d.kopecks,note:d.note,date:d.date}};}
  if(e.kind==='exam') {const d=z.object({exam_type:z.string(),result:z.string(),protocol:z.string(),note:z.string(),date:z.string()}).parse(e.data);return {...common,kind:'exam',data:{date:d.date,note:d.note,result:d.result,protocol:d.protocol,examType:d.exam_type}};}
  const d=z.object({course_id:id,course_name:z.string(),score:z.number(),passed:z.boolean()}).parse(e.data);
  return {...common,kind:'attempt',data:{courseId:d.course_id,courseName:d.course_name,score:d.score,passed:d.passed,answers:[]}};
 });
 if(s.can_manage !== (s.viewer.role==='owner')) throw new Error('Несогласованные права доступа в ответе backend');
 const resourceId=s.viewer.role==='student'?s.viewer.student_id:s.viewer.instructor_id;
 if(s.viewer.role!=='owner'&&!resourceId) throw new Error('Не подтверждена привязка аккаунта автошколы');
 if(s.students.some(student=>!s.balances.some(b=>b.id===student.id))) throw new Error('В ответе нет остатка практики ученика');
 return {user:{id:'',name:resources.find(r=>r.id===resourceId)?.name||'Администратор',email:'',role:s.viewer.role,resource_id:resourceId||''},school:{id:organizationId,name:s.school.name,settings:JSON.stringify({timezone:s.school.timezone,horizonDays:s.school.horizon_days,cancelHours:s.school.cancel_hours})},resources,entries,lessons:s.lessons.map(l=>({id:l.id,student_id:l.student_id,instructor_id:l.instructor_id,car_id:l.car_id,start:Date.parse(l.starts_at),end:Date.parse(l.ends_at),status:l.status,actual_minutes:l.actual_minutes,topic:l.topic,note:l.note})),balances:s.balances.map(b=>({id:b.id,completed:b.completed,reserved:b.reserved,planned:b.planned})),busy:s.busy.map(b=>({start:Date.parse(b.starts_at),end:Date.parse(b.ends_at)})),audit:s.audit.map(a=>({action:a.action,target:a.target,created:Date.parse(a.created_at),detail:JSON.stringify(a.detail)}))};
}
export function createCloudAdapter(organizationId:string, canCreateStudents=false):DrivingAdapter {
 const call=<T>(name:string,args:Record<string,unknown>={})=>drivingRpc<T>(name,{_organization_id:organizationId,...args});
 const text=(value:unknown)=>String(value??'').trim();
 const nullable=(value:unknown)=>text(value)||null;
 return {
  canCreateStudents,
  async load(){return adaptCloudState(await call('driving_get_state'),organizationId);},
  async mutate(path,b,state){
   const finish=async(name:string,args:Record<string,unknown>)=>{const value=await call<unknown>(name,args);return value && typeof value==='object'?value as Record<string,unknown>:{id:value};};
   if(path==='resources') {
    if(state.user.role!=='owner') throw new Error('Управление доступно только владельцу или администратору');
    if(b.kind==='program') return finish('driving_save_program',{_name:text(b.name),_version:text(b.version),_transmission:b.transmission,_practice_minutes:Number(b.practiceMinutes)});
    if(b.kind==='car') return finish('driving_save_car',{_name:text(b.name),_number:text(b.number),_transmission:b.transmission});
    if(b.kind==='group') return finish('driving_save_group',{_name:text(b.name),_program_id:b.programId});
    if(b.kind==='instructor') return finish('driving_save_instructor',{_name:text(b.name),_email:text(b.email),_car_id:b.carId});
    if(b.kind==='course') return finish('driving_save_course',{_name:text(b.name),_program_id:b.programId,_material:text(b.material),_pass_percent:Number(b.passPercent),_questions:b.questions,_lms_course_id:null});
    if(b.kind==='student') {
     if(!canCreateStudents)throw new Error('В первом пилоте новых учеников добавляет владелец организации');
     // Existing handler resolves authoritative user_id, capacity and organization. profiles.id is never an Auth id.
     const {data,error}=await supabase.functions.invoke('register-student',{body:{email:text(b.email),full_name:text(b.name),password:text(b.password),organization_id:organizationId}});
     if(error||!data?.success||typeof data.user_id!=='string') {
      let detail=typeof data?.error==='string'?data.error:'';
      const context=(error as {context?:Response}|null)?.context;
      if(!detail&&context&&typeof context.json==='function') {try {const body=await context.json();if(typeof body?.error==='string')detail=body.error;}catch { /* Preserve the transport error if the body is not JSON. */ }}
      throw new Error(detail||error?.message||'Не подтверждено создание ученика в СИНТАГМЕ');
     }
     const account={login:typeof data.login==='string'&&data.login.trim()?data.login.trim():null,isExisting:data.is_existing===true};
     if(!account.isExisting&&!account.login)throw new Error('Аккаунт создан в СИНТАГМЕ, но сервер не вернул его логин. Привязка к автошколе не выполнялась; проверьте ученика в общем кабинете.');
     try {const saved=await finish('driving_save_student',{_name:text(b.name),_email:text(b.email),_phone:text(b.phone),_program_id:b.programId,_group_id:nullable(b.groupId),_instructor_id:nullable(b.instructorId),_user_id:data.user_id});return {...saved,account};}
     catch(error){throw new Error(`Аккаунт ученика подтверждён в СИНТАГМЕ, но привязка к автошколе не подтверждена. Проверьте список учеников перед повторением. ${account.login?`Подтверждённый логин: ${account.login}.`:``} ${error instanceof Error?error.message:''}`);}
    }
   }
   if(path==='lessons') return finish('driving_book_lesson',{_student_id:b.studentId,_instructor_id:b.instructorId,_car_id:b.carId,_starts_at:b.start,_ends_at:b.end,_lesson_id:null});
   if(path==='lesson-action') {
    if(b.action==='reschedule') {const l=state.lessons.find(l=>l.id===b.id);if(!l)throw new Error('Занятие не найдено');return finish('driving_book_lesson',{_student_id:l.student_id,_instructor_id:l.instructor_id,_car_id:l.car_id,_starts_at:b.start,_ends_at:b.end,_lesson_id:l.id});}
    return finish('driving_lesson_action',{_lesson_id:b.id,_action:b.action,_actual_minutes:b.actualMinutes===undefined?null:Number(b.actualMinutes),_topic:text(b.topic),_reason:text(b.reason)});
   }
   if(path==='shifts') return finish('driving_add_shift',{_instructor_id:b.instructorId,_starts_at:b.start,_ends_at:b.end});
   if(path==='assign-student') return finish('driving_assign_student',{_student_id:b.id,_instructor_id:nullable(b.instructorId),_group_id:nullable(b.groupId)});
   if(path==='resource-status') {const resource=state.resources.find(r=>r.id===b.id);if(!resource)throw new Error('Ресурс не найден');return finish('driving_set_resource_status',{_kind:resource.kind,_id:b.id,_active:b.active,_reason:text(b.reason)});}
   if(path==='entries') return finish('driving_add_entry',{_operation_id:b.operationId,_student_id:b.studentId,_kind:b.kind,_payload:b.kind==='exam'?{date:b.date,exam_type:b.examType,result:b.result,protocol:text(b.protocol),note:text(b.note)}:{date:b.date,kopecks:b.kopecks,note:text(b.note)}});
   if(path==='reverse-entry') return finish('driving_reverse_entry',{_entry_id:b.id,_reason:text(b.reason)});
   if(path==='settings') return finish('driving_save_settings',{_name:text(b.name),_timezone:text(b.timezone),_horizon_days:Number(b.horizonDays),_cancel_hours:Number(b.cancelHours)});
   if(path==='attempts') return finish('driving_submit_attempt',{_course_id:b.courseId,_answers:b.answers});
   if(path==='invites') {const target=state.resources.find(r=>r.id===b.resourceId);if(!target||!['student','instructor'].includes(target.kind))throw new Error('Получатель не найден');const result=await call<{token:string}>('driving_create_invite',{_role:target.kind,_target_id:target.id});if(!result?.token)throw new Error('Ссылка не подтверждена');return {url:`${window.location.origin}/driving-school?invite=${encodeURIComponent(result.token)}`};}
   throw new Error('Это действие ещё не подключено');
  },
 };
}




