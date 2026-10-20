// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

const id = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12,"0")}`;
const read = (path: string) => readFile(new URL(`../../../${path}`,import.meta.url),"utf8");
const release = "docs/releases/sintagma-production/sgt-unlimited-perf-20261020/";
const migrationPath = "supabase/migrations/20261020050000_students_page_scope_evaluation.sql";
const signature = "public.get_organization_students_page(uuid,integer,integer,text,uuid,text,text,text,text)";
type Definition = { signature: string; definition: string; source_md5: string };
type Capture = { functions: Definition[]; effective_membership_view: string };
type Filter = { org?: number; limit?: number|null; offset?: number|null; search?: string|null; course?: number|null; group?: string|null; status?: string|null; docs?: string|null; archive?: string|null };
type Scenario = { name: string; actor: number|null; filter: Filter };
type Outcome = { rows: any[] } | { code: string; message: string };
let db: PGlite;
let capture: Capture;
let original: Definition;
let migration: string;
let baseline: Outcome[];
let candidate: Outcome[];
let beforeCatalog: unknown;
let afterCatalog: unknown;
let beforeRows: unknown;
let afterRows: unknown;

const filters: Array<{ name: string; filter: Filter }> = [
  {name:"active",filter:{}}, {name:"archive",filter:{archive:"archive"}},
  {name:"first page",filter:{limit:2}}, {name:"second page",filter:{limit:2,offset:2}},
  {name:"empty later page",filter:{offset:10000}}, {name:"minimum clamp",filter:{limit:0,offset:-5}},
  {name:"maximum clamp",filter:{limit:1000}}, {name:"search name",filter:{search:"learner 1"}},
  {name:"search login",filter:{search:"learner2"}}, {name:"search email",filter:{search:"learner3@example.invalid"}},
  {name:"search case and spaces",filter:{search:"  SYNTHETIC LEARNER  "}},
  {name:"search absent",filter:{search:"no such learner"}},
  {name:"primary or additional group",filter:{group:id(401)}},
  {name:"second group",filter:{group:id(402)}}, {name:"foreign group",filter:{group:id(403)}},
  {name:"no group",filter:{group:"no_group"}}, {name:"all group",filter:{group:"all"}},
  {name:"first course",filter:{course:301}}, {name:"second course",filter:{course:302}},
  {name:"foreign course",filter:{course:303}}, {name:"active enrollment",filter:{status:"active"}},
  {name:"completed enrollment",filter:{status:"completed"}}, {name:"no enrollment",filter:{status:"not_enrolled"}},
  {name:"complete documents",filter:{docs:"complete"}}, {name:"incomplete documents",filter:{docs:"incomplete"}},
  {name:"missing passport",filter:{docs:"no_passport"}}, {name:"missing snils",filter:{docs:"no_snils"}},
  {name:"missing education",filter:{docs:"no_education"}},
  {name:"combined filters",filter:{group:id(401),course:301,docs:"complete",limit:1}},
  {name:"all optional filters",filter:{status:"all",docs:"all",group:"all",search:"  "}},
  {name:"unknown archive",filter:{archive:"unknown"}},
];
const actors: Array<{id:number|null; name:string}> = [
  {id:1,name:"owner"},{id:2,name:"global admin"},{id:3,name:"active staff admin"},
  {id:4,name:"assigned teacher"},{id:5,name:"expired staff admin"},{id:6,name:"sales staff with students.read"},
  {id:7,name:"foreign owner"},{id:8,name:"ordinary student"},{id:9,name:"revoked account"},
  {id:10,name:"expired teacher"},{id:11,name:"staff without students.read"},{id:12,name:"foreign teacher"},
  {id:13,name:"teacher A and admin B"},{id:14,name:"teacher without assigned groups"},
  {id:15,name:"admin A and expired teacher B"},{id:null,name:"anonymous"},
];
const scenarios: Scenario[] = actors.flatMap(actor => filters.map(filter => ({
  name:`${actor.name}: ${filter.name}`,actor:actor.id,filter:filter.filter,
})));
scenarios.push({name:"foreign owner own tenant",actor:7,filter:{org:200}},
 {name:"global admin foreign tenant",actor:2,filter:{org:200}},
 {name:"global admin absent tenant",actor:2,filter:{org:999}});

async function actor(value:number|null) {
  await db.exec("RESET ROLE");
  await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)",[value===null?"":id(value)]);
  await db.exec(value===null?"SET ROLE anon":"SET ROLE authenticated");
}
async function run(scenario:Scenario):Promise<Outcome> {
  await actor(scenario.actor);
  const p=scenario.filter;
  try {
    return {rows:(await db.query(`SELECT * FROM public.get_organization_students_page($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [id(p.org??100),p.limit??10,p.offset??0,p.search??null,p.course==null?null:id(p.course),
       p.group??null,p.status??null,p.docs??null,p.archive??"active"])).rows};
  } catch(error:any) { return {code:String(error.code),message:String(error.message)}; }
}
async function catalog() {
  await db.exec("RESET ROLE");
  return (await db.query(`SELECT p.oid::text,p.proname,p.proowner::text,p.proacl::text,p.prolang::text,
    p.prosecdef,p.provolatile::text,p.proparallel::text,p.proisstrict,p.proleakproof,p.procost,p.prorows,
    p.proconfig,pg_get_function_arguments(p.oid) AS arguments,pg_get_function_result(p.oid) AS result,
    CASE WHEN p.oid=$1::regprocedure THEN NULL ELSE md5(pg_get_functiondef(p.oid)) END AS unchanged_definition
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' ORDER BY p.oid`,[signature])).rows;
}
async function tableRows() {
  await db.exec("RESET ROLE");
  const tables=["organizations","profiles","user_roles","org_staff","account_deletion_revocations","courses",
    "enrollments","student_groups","student_group_memberships","org_staff_document_groups","student_roster_removals",
    "student_identity_documents","student_frdo_data"];
  const out:Record<string,unknown>={};
  for(const table of tables) out[table]=(await db.query<{rows:unknown}>(`SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text),'[]') AS rows FROM public.${table} t`)).rows[0].rows;
  return out;
}

beforeAll(async()=>{
  // Empty in-memory PostgreSQL only. This test never connects to a hosted DB.
  db=new PGlite();
  capture=JSON.parse(await read(release+"students-page-baseline-functions.json"));
  original=capture.functions.find(fn=>fn.signature.startsWith("get_organization_students_page("))!;
  migration=await read(migrationPath);
  await db.exec(await read(release+"students-page-synthetic-fixture.sql"));
  await db.exec("CREATE VIEW public.student_group_memberships_effective AS "+capture.effective_membership_view);
  const order=["org_role_default_permissions","normalize_org_staff_permission","get_org_staff_permissions","has_org_staff_permission","has_role",
    "is_org_owner","can_access_organization","account_deletion_access_allowed","uc_document_teacher_limited",
    "uc_document_scope_allowed","uc_document_student_scope_allowed","get_organization_students_page"];
  for(const name of order) for(const fn of capture.functions.filter(fn=>fn.signature.startsWith(name+"("))) await db.exec(fn.definition);
  await db.exec(`REVOKE ALL ON FUNCTION ${signature} FROM PUBLIC,anon; GRANT EXECUTE ON FUNCTION ${signature} TO authenticated,service_role;`);
  // Source pins are checked by PostgreSQL itself; a rewritten test helper or
  // different server representation fails before any equivalence result.
  for(const fn of capture.functions) {
    const qualified="public."+fn.signature.split("app_role").join("public.app_role");
    expect((await db.query<{hash:string}>("SELECT md5(pg_get_functiondef($1::regprocedure)) AS hash",[qualified])).rows[0].hash,qualified).toBe(fn.source_md5);
  }
  beforeCatalog=await catalog(); beforeRows=await tableRows();
  baseline=[];
  for(const scenario of scenarios) baseline.push(await run(scenario));
  await db.exec("RESET ROLE");
  await db.exec(migration);
  candidate=[];
  for(const scenario of scenarios) candidate.push(await run(scenario));
  afterCatalog=await catalog(); afterRows=await tableRows();
},60000);
afterAll(async()=>{await db?.close();});

describe("students page: exact live baseline versus one-time organization authorization",()=>{
  for(let index=0;index<scenarios.length;index++) it(scenarios[index].name,()=>{
    expect(candidate[index]).toEqual(baseline[index]);
  });
  const result=(name:string)=>{
    const index=scenarios.findIndex(s=>s.name===name);
    if(index<0) throw new Error("missing scenario: "+name);
    return candidate[index];
  };
  const rows=(name:string)=>{
    const value=result(name);
    if(!("rows"in value)) throw new Error(name+": "+value.message);
    return value.rows;
  };
  it("checks actual authorization outcomes instead of accepting two empty implementations",()=>{
    expect(rows("owner: active").length).toBeGreaterThan(0);
    expect(rows("active staff admin: active")).toEqual(rows("global admin: active"));
    expect(rows("sales staff with students.read: active")).toEqual(rows("owner: active"));
    expect(result("expired staff admin: active")).toMatchObject({code:"42501",message:"forbidden"});
    expect(result("foreign owner: active")).toMatchObject({code:"42501",message:"forbidden"});
    expect(result("ordinary student: active")).toMatchObject({code:"42501",message:"forbidden"});
    expect(result("staff without students.read: active")).toMatchObject({code:"42501",message:"forbidden"});
    expect(result("anonymous: active")).toMatchObject({code:"42501"});
    expect(rows("revoked account: active")).toEqual([]);
    expect(rows("teacher without assigned groups: active")).toEqual([]);
  });
  it("keeps assigned-teacher primary/additional membership and enrollment masking",()=>{
    const teacher=rows("assigned teacher: active");
    expect(teacher.some(r=>r.user_id===id(1001))).toBe(true);
    expect(teacher.some(r=>r.user_id===id(1004))).toBe(true);
    expect(teacher.some(r=>r.user_id===id(1003))).toBe(false);
    expect(teacher.some(r=>r.user_id===id(1011))).toBe(false);
    const second=teacher.find(r=>r.user_id===id(1002));
    expect(second.enrollments.map((e:any)=>e.course_id)).toEqual([id(301)]);
    expect(rows("teacher A and admin B: active")).toEqual(teacher);
    expect(rows("admin A and expired teacher B: active")).toEqual(rows("owner: active"));
  });
  it("keeps tenant/document isolation and truthful nonempty counters",()=>{
    const complete=rows("owner: complete documents");
    expect(complete.map(r=>r.user_id)).toEqual([id(1001)]);
    expect(complete[0]).toMatchObject({has_passport:true,has_snils:true,has_education:true,frdo_complete:true});
    expect(rows("owner: foreign group")).toEqual([]);
    expect(rows("owner: foreign course")).toEqual([]);
    const all=rows("owner: active");
    expect(all.some(r=>r.user_id===id(1009))).toBe(false);
    expect(all.flatMap(r=>r.enrollments).some((e:any)=>e.course_id===id(303))).toBe(false);
    expect(Number(all[0].active_count)).toBeGreaterThan(0);
    expect(Number(all[0].archived_count)).toBe(2);
  });
  it("keeps all function identities, owners, ACLs, other definitions and all source rows",()=>{
    expect(afterCatalog).toEqual(beforeCatalog);
    expect(afterRows).toEqual(beforeRows);
  });
  it("refuses to replace the RPC after any pinned helper changes",async()=>{
    await db.exec("RESET ROLE");
    await db.exec(original.definition);
    const helper=capture.functions.find(fn=>fn.signature==="uc_document_teacher_limited(uuid)")!;
    await db.exec(helper.definition.replace(" SELECT NOT public.has_role"," -- Deliberate isolated drift\n SELECT NOT public.has_role"));
    try {
      await expect(db.exec(migration)).rejects.toThrow("students_page_performance_source_changed");
      expect((await db.query<{hash:string}>("SELECT md5(pg_get_functiondef($1::regprocedure)) AS hash",[signature])).rows[0].hash).toBe(original.source_md5);
    } finally {await db.exec(helper.definition);}
  });
});
