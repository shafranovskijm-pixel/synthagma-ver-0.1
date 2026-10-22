// Historical baseline construction only: called BEFORE actual105 DML guards exist.
// No guard/trigger/authority function is disabled, dropped or replaced.
import{readFileSync}from'node:fs';import{createHash}from'node:crypto';
const id=(n:number)=>'d0180000-0000-4000-8000-'+n.toString(16).padStart(12,'0');
export const LEGACY={org:id(1),owner:id(2),teacher:id(3),student:id(4),otherStudent:id(5),course:id(6),group:id(7),otherGroup:id(8),enrollment:id(9),otherEnrollment:id(10),staff:id(11),claims:Array.from({length:8},(_,i)=>id(100+i))};
const one=async(db:any,s:string,a:any[]=[])=>((await db.query(s,a)).rows[0]);const q=(s:string)=>'"'+s.replaceAll('"','""')+'"';
export async function restoreHistoricalRegistrationBaselineBefore105(db:any){
 await db.exec('RESET ROLE');if((await one(db,"SELECT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='public.document_issuance_log'::regclass AND tgname='uc_document_action_guard')present")).present)throw Error('Historical restore must occur before original105 guard installation');
 if((await one(db,'SELECT count(*)::int n FROM document_issuance_log')).n!==0)throw Error('Historical restore requires empty predecessor relation');
 const raw=readFileSync('supabase/tests/fixtures/uc018-actual-dependencies.json');if(createHash('sha256').update(raw).digest('hex')!=='f435cb0b16077452144c1186cce2cf0c848ee0671625db7f4c97323df8c19911')throw Error('Actual legacy schema pin changed');
 for(const c of JSON.parse(raw.toString('utf8')).legacyColumns){const old=await one(db,"SELECT format_type(atttypid,atttypmod)t FROM pg_attribute WHERE attrelid='document_issuance_log'::regclass AND attname=$1 AND NOT attisdropped",[c.column_name]);if(old&&old.t!==c.data_type)throw Error('Actual legacy pre105 type differs '+c.column_name);if(!old)await db.exec('ALTER TABLE document_issuance_log ADD COLUMN '+q(c.column_name)+' '+c.data_type+(c.column_default?' DEFAULT '+c.column_default:'')+(c.is_nullable==='NO'?' NOT NULL':''));}
 // Exact accepted uc-admission-cases.fixture prerequisite, installed earlier only. Its later IF NOT EXISTS is unchanged.
 await db.exec('CREATE TABLE IF NOT EXISTS auth.users(id uuid PRIMARY KEY,deleted_at timestamptz,banned_until timestamptz)');
 const old=await one(db,"SELECT current_setting('request.jwt.claim.sub',true)sub,current_setting('request.jwt.claim.role',true)role");
 try{
  await db.query("INSERT INTO organizations(id,name)VALUES($1,'Synthetic historical UC018 organization')",[LEGACY.org]);
  for(const [person,name]of[[LEGACY.owner,'Synthetic historical owner'],[LEGACY.teacher,'Synthetic historical teacher'],[LEGACY.student,'Synthetic historical pupil'],[LEGACY.otherStudent,'Synthetic other historical pupil']]){await db.query('INSERT INTO auth.users(id)VALUES($1)',[person]);await db.query('INSERT INTO profiles(user_id,organization_id,full_name)VALUES($1,$2,$3)',[person,LEGACY.org,name]);}
  await db.query("INSERT INTO user_roles(user_id,role)VALUES($1,'organization'),($2,'student'),($3,'student')",[LEGACY.owner,LEGACY.student,LEGACY.otherStudent]);
  await db.query("INSERT INTO courses(id,organization_id,title)VALUES($1,$2,'Synthetic historical course')",[LEGACY.course,LEGACY.org]);
  await db.query("INSERT INTO student_groups(id,organization_id,course_id,name)VALUES($1,$2,$3,'Synthetic historical assigned group'),($4,$2,$3,'Synthetic historical other group')",[LEGACY.group,LEGACY.org,LEGACY.course,LEGACY.otherGroup]);
  await db.query("INSERT INTO org_staff(id,user_id,organization_id,role,sections_access)VALUES($1,$2,$3,'teacher','[\"documents.read\",\"journals.read\"]')",[LEGACY.staff,LEGACY.teacher,LEGACY.org]);
  await db.query('INSERT INTO student_group_memberships(organization_id,group_id,user_id)VALUES($1,$2,$3),($1,$4,$5)',[LEGACY.org,LEGACY.group,LEGACY.student,LEGACY.otherGroup,LEGACY.otherStudent]);
  await db.query("INSERT INTO enrollments(id,user_id,course_id,status,progress)VALUES($1,$2,$3,'active',0),($4,$5,$3,'active',0)",[LEGACY.enrollment,LEGACY.student,LEGACY.course,LEGACY.otherEnrollment,LEGACY.otherStudent]);
  await db.query("SELECT set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claim.role','authenticated',false)",[LEGACY.owner]);await db.query('SELECT set_org_staff_document_groups($1,$2,$3,0)',[LEGACY.org,LEGACY.staff,[LEGACY.group]]);
  for(let i=0;i<8;i++)await db.query("INSERT INTO document_issuance_log(id,organization_id,user_id,user_name,enrollment_id,document_type,document_name,reg_number,issued_at,send_method)VALUES($1,$2,$3,$4,$5,'enrollment_order',$6,$7,'2026-10-01','none')",[LEGACY.claims[i],LEGACY.org,i===0||i===1?LEGACY.teacher:LEGACY.owner,i%2?'Synthetic other historical pupil':'Synthetic historical pupil',i%2?LEGACY.otherEnrollment:LEGACY.enrollment,'Synthetic pre105 mixed historical claim '+i,'HISTORIC-'+i]);
 }finally{await db.exec('RESET ROLE');await db.query("SELECT set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claim.role',$2,false)",[old.sub??'',old.role??'']);}
}
