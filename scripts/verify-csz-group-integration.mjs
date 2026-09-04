// Combined execution of exact CSZ + group migrations, using the repository's
// synthetic CSZ base/RLS contract. Supplemental schema and auth helpers below
// are FIXTURES, not production migrations or Supabase JWT/RLS verification.
// No network/native server. PGlite is closed; report is retained in a new D: dir.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
const { PGlite } = await import(pathToFileURL(resolve(process.argv[2] ||
  "D:/CodexTmp/sintagma-schedule-sql-20260904/node_modules/@electric-sql/pglite/dist/index.js")).href);
const directory = mkdtempSync("D:/CodexTmp/sintagma-csz-group-integration-20260904-");
const db = new PGlite();
const evidence = [], inputs = [];
let passed = 0;
const pass = label => { passed++; evidence.push({ pass: label }); console.log(`PASS ${label}`); };
function source(path, fixture = false) {
  const sql = readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
  inputs.push({ path, fixture, sha256: createHash("sha256").update(sql).digest("hex") });
  // The retained fixtures contain one psql client directive, not SQL.
  return fixture ? sql.replace(/^\\set ON_ERROR_STOP on\r?\n/gm, "") : sql;
}
async function migration(name) { await db.exec(source(`supabase/migrations/${name}`)); }
async function who(role, actor = "") {
  await db.exec(`RESET ROLE; SET ROLE ${role}`);
  await db.query("SELECT set_config('request.jwt.claim.role',$1,false),set_config('request.jwt.claim.sub',$2,false),set_config('request.jwt.claim.org_id',$3,false)", [role,actor,org]);
}
const org = "11111111-1111-1111-1111-111111111111", foreignOrg = "22222222-2222-2222-2222-222222222222";
const staff = "ffffffff-ffff-ffff-ffff-ffffffffffff", teacher = "77777777-7777-7777-7777-777777777777";
const learner = "00000000-0000-4000-8000-000000000001", group = "00000000-0000-4000-8000-000000000002";
const foreignCourse = "00000000-0000-4000-8000-000000000003", foreignGroup = "00000000-0000-4000-8000-000000000004";
const courseTitle = "Деятельность по монтажу, техническому обслуживанию и ремонту средств обеспечения пожарной безопасности зданий и сооружений";
const titles = [
  "Модуль 1. Общепрофессиональный модуль",
  "Модуль 2. Монтаж, техническое обслуживание и ремонт систем пожаротушения и их элементов, включая диспетчеризацию и проведение пусконаладочных работ",
  "Модуль 3. Монтаж, техническое обслуживание и ремонт систем пожарной и охранно-пожарной сигнализации и их элементов, включая диспетчеризацию и проведение пусконаладочных работ",
  "Модуль 4. Монтаж, техническое обслуживание и ремонт систем противопожарного водоснабжения и их элементов, включая диспетчеризацию и проведение пусконаладочных работ",
  "Модуль 5. Монтаж, техническое обслуживание и ремонт автоматических систем (элементов автоматических систем) противодымной вентиляции, включая диспетчеризацию и проведение пусконаладочных работ",
  "Модуль 6. Монтаж, техническое обслуживание и ремонт систем оповещения и эвакуации при пожаре и их элементов, включая диспетчеризацию и проведение пусконаладочных работ, в том числе фотолюминесцентных эвакуационных систем и их элементов",
  "Модуль 7. Монтаж, техническое обслуживание и ремонт автоматических систем (элементов автоматических систем) передачи извещений о пожаре, включая диспетчеризацию и проведение пусконаладочных работ",
  "Модуль 8. Монтаж, техническое обслуживание и ремонт противопожарных занавесов и завес, включая диспетчеризацию и проведение пусконаладочных работ",
  "Модуль 9. Монтаж, техническое обслуживание и ремонт заполнений проемов в противопожарных преградах",
  "Модуль 10. Выполнение работ по огнезащите материалов, изделий и конструкций",
  "Модуль 11. Монтаж, техническое обслуживание и ремонт первичных средств пожаротушения",
];
function payload() {
  // Equivalent synthetic structure to src/api/structuredCourseImport.test.ts;
  // no actual course materials, external research, files, or personal data.
  const modules = titles.map((title,index) => ({ key:`module-${index+1}`, title, order_index:index }));
  const lessons = [];
  const questions = (moduleNumber,final=false) => Array.from({length:final?12:5},(_,i) => ({
    key:final?`F-Q${String(i+1).padStart(2,"0")}`:`M${String(moduleNumber).padStart(2,"0")}-Q${String(i+1).padStart(2,"0")}`,
    question:`Synthetic question ${i+1}`,options:["A","B","C","D"].map(text=>({text})),
    correct_answer:0,correct_option:"A",order_index:i,explanation:null,
  }));
  const lesson = (key,module_key,title,type,module_number,final=false) => ({key,module_key,title,type,
    content:type==="test"?"":"[]",order_index:lessons.length,test_passing_score:70,
    metadata:{module_number,final_assessment:final},questions:type==="test"?questions(module_number,final):[]});
  for (const [i,module] of modules.entries()) {
    lessons.push(lesson(`${module.key}-theory`,module.key,module.title,"text",i+1));
    lessons.push(lesson(`${module.key}-practice`,module.key,`Практическое задание ${i+1}. Synthetic`,"homework",i+1));
    lessons.push(lesson(`${module.key}-test`,module.key,`Промежуточная аттестация. Модуль ${i+1}`,"test",i+1));
  }
  lessons.push(lesson("final-practice","module-11","Итоговая практико-ориентированная задача","homework",11,true));
  lessons.push(lesson("final-test","module-11","Итоговый тест","test",11,true));
  return {schema_version:2,source_kind:"csz-178h-html-with-closed-keys",title:courseTitle,description:"Synthetic integration only",modules,lessons,
    documents:Array.from({length:8},(_,i)=>({name:`Synthetic reference ${i+1}`,type:"link",description:"Not a real research source",
      file_url:`https://fixture.example/${i+1}`,source_name:"Synthetic fixture",source_kind:"official",source_module_number:null,
      library_category:"legal_acts",usage_basis:"official_open_source",library_status:"needs_review"}))};
}
async function importCourse(data=payload()) {
  return (await db.query("SELECT public.import_csz_course_draft_v2($1::uuid,$2::jsonb) AS result",[org,JSON.stringify(data)])).rows[0].result;
}
async function register(selectedGroup=group) {
  return (await db.query(`SELECT public.create_student_profile_with_capacity($1::uuid,$2::uuid,'Synthetic Student',
    'fixture@example.invalid',NULL,NULL,NULL,$3::uuid,NULL) AS result`,[org,learner,selectedGroup])).rows[0].result;
}
async function reject(label,action,code) { await assert.rejects(action,error=>error.code===code); pass(label); }
async function libraryCatalog() {
  return (await db.query(`SELECT schemaname,tablename,policyname,permissive,roles,cmd,qual,with_check FROM pg_policies
    WHERE tablename IN ('courses','course_modules','library_documents','library_folders','course_documents','objects')
    ORDER BY schemaname,tablename,policyname`)).rows;
}
try {
  await db.exec(source("supabase/tests/fixtures/course_library_local_base.sql",true));
  // Supplemental CURRENT-schema columns absent from the intentionally minimal
  // library fixture. No production function body or migration is rewritten.
  await db.exec(`
    ALTER TABLE public.organizations ADD COLUMN custom_max_students integer;
    ALTER TABLE public.student_groups ADD COLUMN course_id uuid REFERENCES public.courses(id) ON DELETE SET NULL;
    ALTER TABLE public.profiles ADD COLUMN student_group_id uuid REFERENCES public.student_groups(id) ON DELETE SET NULL,
      ADD COLUMN company_id uuid,ADD COLUMN email text,ADD COLUMN login text,ADD COLUMN generated_password text,
      ADD COLUMN region text,ADD COLUMN archived_at timestamptz;
    ALTER TABLE public.enrollments ADD COLUMN started_at timestamptz NOT NULL DEFAULT now(),ADD COLUMN completed_at timestamptz,
      ADD CONSTRAINT fixture_enrollments_user_course_unique UNIQUE(user_id,course_id);
    ALTER TABLE public.lessons ADD COLUMN module_id uuid REFERENCES public.course_modules(id),ADD COLUMN type text,
      ADD COLUMN content text,ADD COLUMN order_index integer DEFAULT 0,ADD COLUMN test_passing_score integer,
      ADD COLUMN test_questions_count integer,ADD COLUMN test_questions_to_show integer,ADD COLUMN test_show_answers boolean,
      ADD COLUMN is_locked boolean;
    ALTER TABLE public.test_questions ADD COLUMN options jsonb,ADD COLUMN correct_answer integer,ADD COLUMN order_index integer,
      ADD COLUMN explanation text,ADD COLUMN is_bank_question boolean;
    CREATE TABLE public.user_roles(user_id uuid PRIMARY KEY,role public.app_role NOT NULL);
    CREATE TABLE public.organization_usage(organization_id uuid REFERENCES public.organizations(id),month_start date,
      students_added_count integer NOT NULL,PRIMARY KEY(organization_id,month_start));
    CREATE TABLE public.companies(id uuid PRIMARY KEY,organization_id uuid);
    CREATE TABLE public.student_frdo_data(id uuid PRIMARY KEY);
    CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$ SELECT current_setting('request.jwt.claim.role',true) $$;
    -- Same fixture identities/library permissions; writer additionally receives
    -- courses.write because the genuine importer checks this prerequisite.
    CREATE OR REPLACE FUNCTION public.can_access_organization(organization_id uuid,permission_name text)
    RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
      SELECT organization_id='${org}'::uuid AND (
        (auth.uid()='${staff}'::uuid AND permission_name IN ('library.read','library.write','courses.write')) OR
        (auth.uid()='${teacher}'::uuid AND permission_name='library.read')) $$;
  `);
  for (const table of ["courses","course_modules","lessons","test_questions","library_documents","course_documents","profiles","enrollments"])
    await db.exec(`ALTER TABLE public.${table} ALTER COLUMN id SET DEFAULT gen_random_uuid()`);
  await migration("20260412113747_4067e6e8-c9ad-4001-8c78-6e85bc7ecb10.sql");
  await migration("20260729123226_b27fb233-4614-4833-a85d-c26ad0264354.sql");
  await migration("20260806223000_group_lifecycle_integrity.sql");
  await migration("20260822122951_3eaafed5-8e82-4df4-a45c-9df212ad3b48.sql");
  await migration("20260903100000_csz_electronic_library_schema.sql");
  await migration("20260903110000_import_csz_course_draft_v2.sql");
  const beforeGroupPolicies = await libraryCatalog();
  const libraryFunctionBefore = (await db.query("SELECT pg_get_functiondef('public.can_access_course_as_learner(uuid)'::regprocedure) AS definition")).rows[0].definition;
  await migration("20260904200000_group_registration_tenant_integrity.sql");
  assert.deepEqual(await libraryCatalog(),beforeGroupPolicies);
  assert.equal((await db.query("SELECT pg_get_functiondef('public.can_access_course_as_learner(uuid)'::regprocedure) AS definition")).rows[0].definition,libraryFunctionBefore);
  pass("all exact CSZ/group migrations execute together; group migration leaves CSZ RLS and learner helper unchanged");
  // psql commits the initial fixture INSERTs before the first explicit BEGIN.
  // Sending the entire file as one simple-query batch would instead include
  // that prefix in the first ROLLBACK. Preserve its transaction boundaries
  // without rewriting any SQL or weakening any retained contract assertion.
  const contract=[];
  for (const block of source("supabase/tests/course_library_local_rls_contract.sql",true).split(/(?=^BEGIN;[ \t]*\r?$)/m))
    contract.push(...await db.exec(block));
  const markers = contract.flatMap(result=>result.rows || []).flatMap(row=>Object.values(row)).filter(value=>typeof value==="string" && value.startsWith("PASS -"));
  assert.equal(markers.length,2); evidence.push({retainedContractMarkers:markers});
  pass("entire retained CSZ admin/teacher/learner/foreign-tenant RLS contract passes after group migration");
  assert.equal((await db.query("SELECT public FROM storage.buckets WHERE id='library-files'")).rows[0].public,false);
  pass("existing library-files bucket remains private");
  await who("authenticated",teacher);
  await reject("read-only teacher cannot invoke actual CSZ import successfully",()=>importCourse(),"42501");
  await who("authenticated",staff);
  const invalid = payload(); invalid.lessons.pop();
  await reject("actual CSZ importer rejects malformed structural payload",()=>importCourse(invalid),"23514");
  const imported = await importCourse(); const course = imported.course_id;
  assert.deepEqual({...imported,course_id:"uuid"},{course_id:"uuid",is_published:false,module_count:11,lesson_count:35,question_count:67,document_count:8});
  pass("actual import RPC creates unpublished 11-module/35-lesson/67-question/8-resource course after both feature migrations");
  await db.exec("RESET ROLE");
  const resources = (await db.query(`SELECT cd.id,cd.library_document_id,cd.visible_to_students,ld.library_status
    FROM public.course_documents cd JOIN public.library_documents ld ON ld.id=cd.library_document_id WHERE cd.course_id=$1 ORDER BY cd.sort_order`,[course])).rows;
  assert.equal(resources.length,8); assert.ok(resources.every(row=>row.visible_to_students===false && row.library_status==="needs_review"));
  pass("imported library resources remain needs_review and hidden, not implicitly activated by group integrity");
  await db.query("INSERT INTO public.student_groups(id,organization_id,name,course_id) VALUES($1,$2,'Synthetic integration group',$3)",[group,org,course]);
  await db.query("INSERT INTO public.courses(id,organization_id,title) VALUES($1,$2,'Foreign synthetic course')",[foreignCourse,foreignOrg]);
  await db.query("INSERT INTO public.student_groups(id,organization_id,name,course_id) VALUES($1,$2,'Foreign synthetic group',$3)",[foreignGroup,foreignOrg,foreignCourse]);
  await who("service_role"); assert.equal((await register()).success,true);
  pass("actual capacity RPC registers a same-tenant student into the imported CSZ group/course");
  await who("authenticated",learner);
  const shell = (await db.query("SELECT public.get_course_electronic_library_shell($1) AS shell",[course])).rows[0].shell;
  assert.equal(shell.library_only,true); assert.equal(shell.modules.length,11); assert.equal(shell.title,courseTitle);
  assert.deepEqual(Object.keys(shell).sort(),["course_id","library_only","modules","title"]);
  for (const table of ["courses","course_modules","lessons","course_documents"]) {
    const key = table==="courses"?"id":"course_id";
    assert.equal((await db.query(`SELECT count(*)::int AS count FROM public.${table} WHERE ${key}=$1`,[course])).rows[0].count,0);
  }
  pass("newly group-enrolled learner gets only actual CSZ shell, no unpublished rows or unverified library resources");
  await who("authenticated",staff);
  await db.query("UPDATE public.library_documents SET edition_label='Synthetic edition',last_checked_at=now(),library_status='active' WHERE id=$1",[resources[0].library_document_id]);
  await db.query("UPDATE public.course_documents SET visible_to_students=true WHERE id=$1",[resources[0].id]);
  await who("authenticated",learner);
  assert.equal((await db.query("SELECT count(*)::int AS count FROM public.course_documents WHERE course_id=$1",[course])).rows[0].count,1);
  assert.equal((await db.query("SELECT count(*)::int AS count FROM public.library_documents WHERE id=$1",[resources[0].library_document_id])).rows[0].count,1);
  pass("only explicit staff activation/visibility opens the linked resource to the group-enrolled learner");
  await who("service_role");
  await reject("actual registration rejects foreign group and leaves imported-course enrollment unchanged",()=>register(foreignGroup),"23503");
  await reject("group cannot switch to foreign CSZ/library course",()=>db.query("UPDATE public.student_groups SET course_id=$1 WHERE id=$2",[foreignCourse,group]),"23503");
  await reject("imported course cannot be reparented while referenced by group",()=>db.query("UPDATE public.courses SET organization_id=$1 WHERE id=$2",[foreignOrg,course]),"23503");
  await db.exec("RESET ROLE");
  const enrollment = (await db.query("UPDATE public.enrollments SET expires_at=now()-interval '1 day',progress=37 WHERE user_id=$1 AND course_id=$2 RETURNING *",[learner,course])).rows[0];
  await who("service_role"); await register();
  await db.exec("RESET ROLE");
  assert.deepEqual((await db.query("SELECT * FROM public.enrollments WHERE id=$1",[enrollment.id])).rows[0],enrollment);
  await who("authenticated",learner);
  await reject("expired active group enrollment does not gain CSZ shell access",()=>db.query("SELECT public.get_course_electronic_library_shell($1)",[course]),"42501");
  await db.exec("RESET ROLE"); await db.query("UPDATE public.enrollments SET status='completed' WHERE id=$1",[enrollment.id]);
  await who("authenticated",learner);
  assert.equal((await db.query("SELECT public.can_access_course_as_learner($1) AS allowed",[course])).rows[0].allowed,true);
  pass("CSZ completed-with-elapsed-expiry access contract is preserved without resetting expiry/progress");
  await db.exec("RESET ROLE"); await db.query("DELETE FROM public.enrollments WHERE id=$1",[enrollment.id]);
  await who("service_role");
  await db.query("UPDATE public.student_groups SET course_id=course_id WHERE id=$1",[group]);
  await db.query("UPDATE public.profiles SET student_group_id=student_group_id WHERE user_id=$1",[learner]);
  await db.exec("RESET ROLE");
  assert.equal((await db.query("SELECT count(*)::int AS count FROM public.enrollments WHERE user_id=$1",[learner])).rows[0].count,0);
  pass("unchanged CSZ group/profile saves do not recreate a deliberately deleted enrollment");
  const invariant = (await db.query(`SELECT
    (SELECT count(*)::int FROM public.profiles p JOIN public.student_groups g ON g.id=p.student_group_id WHERE p.organization_id IS DISTINCT FROM g.organization_id) AS bad_memberships,
    (SELECT count(*)::int FROM public.student_groups g JOIN public.courses c ON c.id=g.course_id WHERE g.organization_id IS DISTINCT FROM c.organization_id) AS bad_group_courses,
    (SELECT students_added_count FROM public.organization_usage WHERE organization_id=$1) AS quota`,[org])).rows[0];
  assert.deepEqual(invariant,{bad_memberships:0,bad_group_courses:0,quota:1});
  pass("combined fixture retains group/course tenant invariants and exactly one registration quota charge");
  evidence.push({version:(await db.query("SELECT version() AS version")).rows[0].version,importResult:imported,invariant});
} catch (error) {
  evidence.push({failure:error.message,code:error.code,where:error.where});
  console.error(JSON.stringify(evidence.at(-1))); process.exitCode=1;
  try {
    await db.exec("ROLLBACK; RESET ROLE");
    const docs=(await db.query("SELECT id,library_status FROM public.library_documents ORDER BY id")).rows;
    await who("authenticated",teacher);
    const checks=(await db.query(`SELECT auth.uid() AS actor,
      public.can_access_course('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb','courses.read') AS course_read,
      public.can_read_electronic_library_document('12121212-1212-1212-1212-121212121212') AS resource_read,
      (SELECT count(*) FROM public.library_documents WHERE id='12121212-1212-1212-1212-121212121212') AS visible`)).rows;
    evidence.push({failureDiagnostic:{docs,checks}}); console.error(JSON.stringify(evidence.at(-1)));
  } catch { /* Preserve original failure if diagnosis is unavailable. */ }
} finally {
  await db.close();
  const report={passed,status:process.exitCode?"FAILED":"PASS",productionVerified:false,nativeServerStarted:false,
    limitations:["Synthetic schema supplemental columns and permission helpers","Not Supabase JWT/PostgREST/Storage API or live RLS proof","No concurrency claim; separate native proof already exists"],inputs,evidence};
  writeFileSync(join(directory,"report.json"),JSON.stringify(report,null,2));
  console.log(JSON.stringify({passed,status:report.status,report:join(directory,"report.json")}));
}
