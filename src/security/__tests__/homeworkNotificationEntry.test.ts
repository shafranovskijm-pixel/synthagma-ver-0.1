import { beforeEach, describe, expect, it, vi } from 'vitest';
const ports = vi.hoisted(() => {
  const id=(n:number)=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
  return { actor:id(1), student:id(2), submission:id(3), lesson:id(4), course:id(5), org:id(6),
    handler: async (_request:Request):Promise<Response> => { throw new Error('ENTRY_NOT_LOADED'); },
    actorExists:true, reviewerBlocked:false, studentWrongOrg:false, permission:true, emailEnabled:false, wrongRecipient:false,
    courseTitle:'<TEST course>', lessonTitle:'<TEST lesson>', events:[] as string[], envReads:[] as string[],
    notify:vi.fn(async (_value:unknown)=>{}), pref:vi.fn(async (_user:string,_kind:string,_channel:string)=>false),
    smtp:vi.fn(async (_value:unknown)=>({ok:true})),
    readEmail:vi.fn(async (_id:string)=>({data:{user:{id:id(2),email:'qa-only@example.invalid'}},error:null})),
    clientFactory:vi.fn(),
  };
});
vi.mock('https://deno.land/std@0.168.0/http/server.ts',()=>({serve:(handler:(req:Request)=>Promise<Response>)=>{ports.handler=handler;}}));
vi.mock('https://esm.sh/@supabase/supabase-js@2',()=>({createClient:(...args:unknown[])=>ports.clientFactory(...args)}));
vi.mock('../../../supabase/functions/_shared/notification-prefs.ts',()=>({
  notifyStudent:(value:unknown)=>ports.notify(value),
  isPrefEnabled:(user:string,kind:string,channel:string)=>ports.pref(user,kind,channel),
}));
vi.mock('../../../supabase/functions/_shared/smtp-sender.ts',()=>({sendPlatformEmail:(value:unknown)=>ports.smtp(value)}));
function query(table:string) {
  const filters:Record<string,unknown>={};
  return {
    select(_fields:string){return this;},
    eq(key:string,value:unknown){filters[key]=value;return this;},
    async maybeSingle(){
      ports.events.push('read:'+table);
      if(table==='homework_submissions'&&filters.id===ports.submission) return {data:{id:ports.submission,student_id:ports.student,lesson_id:ports.lesson,course_id:ports.course,organization_id:ports.org,
        reviewer_id:ports.actor,status:'revision',score:null,reviewer_comment:'[TEST] Add <proof> & retry.',reviewed_at:'2026-10-29T00:00:00.000Z'},error:null};
      if(table==='lessons'&&filters.id===ports.lesson&&filters.course_id===ports.course)return {data:{id:ports.lesson,course_id:ports.course,title:ports.lessonTitle},error:null};
      if(table==='courses'&&filters.id===ports.course)return {data:{id:ports.course,organization_id:ports.org,title:ports.courseTitle},error:null};
      if(table==='profiles'&&filters.user_id===ports.actor)return {data:{user_id:ports.actor,organization_id:ports.org,blocked_at:ports.reviewerBlocked?'2026-10-28T00:00:00Z':null,archived_at:null},error:null};
      if(table==='profiles'&&filters.user_id===ports.student)return {data:{user_id:ports.student,organization_id:ports.studentWrongOrg?'00000000-0000-4000-8000-000000000099':ports.org,blocked_at:null,archived_at:null},error:null};
      if(table==='enrollments'&&filters.user_id===ports.student&&filters.course_id===ports.course)return {data:{id:'00000000-0000-4000-8000-000000000007',user_id:ports.student,course_id:ports.course,status:'active',expires_at:null},error:null};
      throw new Error('UNEXPECTED_ORDINARY_QUERY:'+table);
    },
  };
}
beforeEach(async()=>{
  vi.resetModules();vi.clearAllMocks();ports.events=[];ports.envReads=[];
  ports.actorExists=true;ports.reviewerBlocked=false;ports.studentWrongOrg=false;ports.permission=true;ports.emailEnabled=false;ports.wrongRecipient=false;
  ports.courseTitle='<TEST course>';ports.lessonTitle='<TEST lesson>';
  ports.notify.mockImplementation(async()=>{ports.events.push('in-app');});
  ports.pref.mockImplementation(async(user,kind,channel)=>{expect([user,kind,channel]).toEqual([ports.student,'homework','email']);return ports.emailEnabled;});
  ports.smtp.mockImplementation(async()=>{ports.events.push('smtp');return {ok:true};});
  ports.readEmail.mockImplementation(async(user)=>{expect(user).toBe(ports.student);ports.events.push('read-email');return {data:{user:{id:ports.wrongRecipient?ports.actor:ports.student,email:'qa-only@example.invalid'}},error:null};});
  ports.clientFactory.mockImplementation((url:string,key:string,options:unknown)=>{
    expect(url).toBe('https://unit.invalid');
    if(key==='unit-anon'){
      expect(options).toMatchObject({global:{headers:{Authorization:'Bearer unit-ordinary-token'}},auth:{persistSession:false,autoRefreshToken:false}});
      return {from:query,auth:{getUser:vi.fn(async(token:string)=>{expect(token).toBe('unit-ordinary-token');ports.events.push('auth');return {data:{user:ports.actorExists?{id:ports.actor,is_anonymous:false}:null},error:null};})},
        rpc:vi.fn(async(name:string,args:unknown)=>{expect(name).toBe('can_access_course');expect(args).toEqual({_course_id:ports.course,_permission:'homework.write'});ports.events.push('permission');return {data:ports.permission,error:null};})};
    }
    if(key==='unit-service'){ports.events.push('service-client');return {auth:{admin:{getUserById:ports.readEmail}}};}
    throw new Error('UNEXPECTED_CLIENT_KEY');
  });
  vi.stubGlobal('Deno',{env:{get:(key:string)=>{ports.envReads.push(key);return ({SUPABASE_URL:'https://unit.invalid',SUPABASE_ANON_KEY:'unit-anon',SUPABASE_SERVICE_ROLE_KEY:'unit-service'} as Record<string,string>)[key];}}});
  // Variable import executes the actual entry module in Vitest; no remote module is fetched.
  const entry='../../../supabase/functions/notify-homework-graded/index.ts';
  await import(entry);
});
const request=()=>new Request('https://unit.invalid/notify-homework-graded',{method:'POST',headers:{Authorization:'Bearer unit-ordinary-token','Content-Type':'application/json'},body:JSON.stringify({submission_id:ports.submission})});
describe('actual notification entry with mocked remote/SMTP ports',()=>{
  it('NE01 honors email OFF without constructing a service recipient client',async()=>{const r=await ports.handler(request());expect(r.status).toBe(200);expect(await r.json()).toEqual({success:true,emailSent:false});expect(ports.notify).toHaveBeenCalledExactlyOnceWith({userId:ports.student,type:'homework',title:'Проверено ДЗ: <TEST lesson>',message:'Статус: На доработку 🔄',relatedId:ports.course});expect(ports.smtp).not.toHaveBeenCalled();expect(ports.readEmail).not.toHaveBeenCalled();expect(ports.envReads).not.toContain('SUPABASE_SERVICE_ROLE_KEY');expect(ports.events.filter(x=>x==='permission')).toHaveLength(2);});
  it('NE02 email ON renders verified course href and escaped dynamic text',async()=>{ports.emailEnabled=true;const r=await ports.handler(request());expect(r.status).toBe(200);expect(await r.json()).toEqual({success:true,emailSent:true});expect(ports.smtp).toHaveBeenCalledTimes(1);expect(ports.readEmail).toHaveBeenCalledExactlyOnceWith(ports.student);const sent=ports.smtp.mock.calls[0][0];expect(sent).toMatchObject({to:'qa-only@example.invalid',subject:'ДЗ проверено: <TEST lesson>',skipRateLimit:true});expect(sent).toHaveProperty('html',expect.stringContaining('https://xn--80aaiswd0ak.xn--p1ai/course/'+ports.course+'/learn'));expect(sent).toHaveProperty('html',expect.stringContaining('&lt;TEST course&gt;'));expect(sent).toHaveProperty('html',expect.stringContaining('&lt;TEST lesson&gt;'));expect(sent).toHaveProperty('html',expect.stringContaining('&lt;proof&gt; &amp; retry.'));expect(ports.events.lastIndexOf('permission')).toBeLessThan(ports.events.indexOf('in-app'));});
  it('NE03 genuine-user verification failure reaches no privileged helpers',async()=>{ports.actorExists=false;expect((await ports.handler(request())).status).toBe(401);expect(ports.notify).not.toHaveBeenCalled();expect(ports.pref).not.toHaveBeenCalled();expect(ports.smtp).not.toHaveBeenCalled();expect(ports.envReads).not.toContain('SUPABASE_SERVICE_ROLE_KEY');});
  it('NE04 actual entry blocks the archived or blocked reviewer profile',async()=>{ports.reviewerBlocked=true;expect((await ports.handler(request())).status).toBe(403);expect(ports.notify).not.toHaveBeenCalled();expect(ports.smtp).not.toHaveBeenCalled();});
  it('NE05 actual entry rejects a recipient profile in another organization',async()=>{ports.studentWrongOrg=true;expect((await ports.handler(request())).status).toBe(403);expect(ports.notify).not.toHaveBeenCalled();expect(ports.smtp).not.toHaveBeenCalled();});
  it('NE06 actual permission RPC denial sends neither channel',async()=>{ports.permission=false;expect((await ports.handler(request())).status).toBe(403);expect(ports.notify).not.toHaveBeenCalled();expect(ports.smtp).not.toHaveBeenCalled();});
  it('NE07 service recipient mismatch cannot send email after authorized in-app delivery',async()=>{ports.emailEnabled=true;ports.wrongRecipient=true;const r=await ports.handler(request());expect(r.status).toBe(500);expect(await r.json()).toEqual({error:'notification_delivery_failed'});expect(ports.notify).toHaveBeenCalledTimes(1);expect(ports.smtp).not.toHaveBeenCalled();});
});
