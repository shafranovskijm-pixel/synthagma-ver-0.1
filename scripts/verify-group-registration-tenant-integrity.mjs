// Executes exact repository SQL in local PostgreSQL/PGlite. No production data.
// Schema/identity helpers are fixtures; PGlite has only one database session.
// node scripts/verify-group-registration-tenant-integrity.mjs /D/path/to/pglite/dist/index.js
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const { PGlite } = await import(process.argv[2]
  ? pathToFileURL(resolve(process.argv[2])).href : "@electric-sql/pglite");
const db = new PGlite();
const names = ["org", "foreignOrg", "freshOrg", "group", "otherGroup", "emptyGroup", "foreignGroup",
  "legacyCourseGroup", "legacyProfileGroup", "course", "otherCourse", "foreignCourse",
  "learner", "completed", "expired", "ungrouped", "invalid", "legacyLearner", "deleteOrg",
  "deleteGroup", "deleteCourse", "deleteLearner", "lateGroup", "lateLearner", "noCourseLearner"];
const ids = Object.fromEntries(names.map((key, index) => [key, `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`]));
const sqlFile = file => readFileSync(new URL(`../supabase/migrations/${file}`, import.meta.url), "utf8");
const signature = "public.create_student_profile_with_capacity(uuid,uuid,text,text,text,text,uuid,uuid,text)";
let passed = 0;
const pass = label => { passed++; console.log(`PASS ${label}`); };
async function role(name) {
  await db.exec(`RESET ROLE; SET ROLE ${name}`);
  await db.query("SELECT set_config('request.jwt.claim.role', $1, false)", [name]);
}
async function owner(sql, params = []) {
  await db.exec("RESET ROLE");
  try { return await db.query(sql, params); } finally { await db.exec("SET ROLE service_role"); }
}
async function register(user = "learner", group = "group", org = "org") {
  return (await db.query(`SELECT public.create_student_profile_with_capacity(
    $1::uuid,$2::uuid,'Fixture Name','fixture@example.invalid',NULL,NULL,NULL,$3::uuid,NULL) AS result`,
  [ids[org], ids[user], group ? ids[group] : null])).rows[0].result;
}
async function snapshot() {
  return (await owner(`SELECT
    (SELECT COALESCE(jsonb_agg(to_jsonb(p) ORDER BY user_id),'[]') FROM public.profiles p) AS profiles,
    (SELECT COALESCE(jsonb_agg(to_jsonb(e) ORDER BY user_id,course_id),'[]') FROM public.enrollments e) AS enrollments,
    (SELECT COALESCE(jsonb_agg(to_jsonb(u) ORDER BY organization_id,month_start),'[]') FROM public.organization_usage u) AS usage,
    (SELECT COALESCE(jsonb_agg(to_jsonb(r) ORDER BY user_id),'[]') FROM public.user_roles r) AS roles,
    (SELECT COALESCE(jsonb_agg(to_jsonb(g) ORDER BY id),'[]') FROM public.student_groups g) AS groups,
    (SELECT COALESCE(jsonb_agg(to_jsonb(c) ORDER BY id),'[]') FROM public.courses c) AS courses`)).rows[0];
}
async function rejectsUnchanged(label, action, code = "23503") {
  const before = await snapshot();
  await assert.rejects(action, error => error.code === code);
  assert.deepEqual(await snapshot(), before);
  pass(label);
}

try {
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role; CREATE SCHEMA auth;
    CREATE TYPE public.app_role AS ENUM ('admin','organization','student');
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT NULL::uuid $$;
    CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$
      SELECT current_setting('request.jwt.claim.role',true) $$;
    CREATE FUNCTION public.has_role(public.app_role,uuid) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT false $$;
    CREATE FUNCTION public.can_access_organization(uuid,text) RETURNS boolean LANGUAGE sql STABLE AS $$
      SELECT current_setting('test.manager',true) = 'true' $$;
    CREATE TABLE public.organizations(id uuid PRIMARY KEY, subscription_plan text NOT NULL DEFAULT 'free', custom_max_students integer);
    CREATE TABLE public.profiles(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL UNIQUE,
      organization_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL,
      company_id uuid, student_group_id uuid, full_name text, email text, login text, generated_password text,
      region text, archived_at timestamptz);
    CREATE TABLE public.courses(id uuid PRIMARY KEY, organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE);
    CREATE TABLE public.student_groups(id uuid PRIMARY KEY, organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
      course_id uuid REFERENCES public.courses(id) ON DELETE SET NULL);
    ALTER TABLE public.profiles ADD FOREIGN KEY(student_group_id) REFERENCES public.student_groups(id) ON DELETE SET NULL;
    CREATE TABLE public.enrollments(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL,
      course_id uuid NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
      status text NOT NULL DEFAULT 'active', progress integer NOT NULL DEFAULT 0, time_spent integer NOT NULL DEFAULT 0,
      started_at timestamptz NOT NULL DEFAULT now(), completed_at timestamptz, UNIQUE(user_id,course_id));
    CREATE TABLE public.user_roles(user_id uuid PRIMARY KEY, role public.app_role NOT NULL);
    CREATE TABLE public.organization_usage(organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
      month_start date, students_added_count integer NOT NULL, PRIMARY KEY(organization_id,month_start));
    CREATE TABLE public.companies(id uuid PRIMARY KEY, organization_id uuid);
    CREATE TABLE public.student_frdo_data(id uuid PRIMARY KEY);
    GRANT USAGE ON SCHEMA public,auth TO anon,authenticated,service_role;
    GRANT SELECT,INSERT,UPDATE,DELETE ON public.profiles,public.student_groups,public.courses TO authenticated,service_role;
    INSERT INTO public.organizations(id) VALUES ('${ids.org}'),('${ids.foreignOrg}'),('${ids.freshOrg}'),('${ids.deleteOrg}');
    INSERT INTO public.courses VALUES ('${ids.course}','${ids.org}'),('${ids.otherCourse}','${ids.org}'),
      ('${ids.foreignCourse}','${ids.foreignOrg}'),('${ids.deleteCourse}','${ids.deleteOrg}');
    INSERT INTO public.student_groups VALUES ('${ids.group}','${ids.org}','${ids.course}'),
      ('${ids.otherGroup}','${ids.org}','${ids.otherCourse}'),('${ids.emptyGroup}','${ids.org}',NULL),
      ('${ids.foreignGroup}','${ids.foreignOrg}','${ids.foreignCourse}'),
      ('${ids.legacyCourseGroup}','${ids.org}','${ids.foreignCourse}'),
      ('${ids.legacyProfileGroup}','${ids.org}',NULL),
      ('${ids.deleteGroup}','${ids.deleteOrg}','${ids.deleteCourse}');
    INSERT INTO public.profiles(user_id,organization_id,student_group_id) VALUES
      ('${ids.legacyLearner}','${ids.foreignOrg}','${ids.legacyProfileGroup}');
  `);
  await db.exec(sqlFile("20260412113747_4067e6e8-c9ad-4001-8c78-6e85bc7ecb10.sql"));
  await db.exec(sqlFile("20260729123226_b27fb233-4614-4833-a85d-c26ad0264354.sql"));
  await db.exec(sqlFile("20260806223000_group_lifecycle_integrity.sql"));
  await db.exec(sqlFile("20260822122951_3eaafed5-8e82-4df4-a45c-9df212ad3b48.sql"));
  const beforeMigration = await snapshot();
  await db.exec("RESET ROLE");
  const originalRpc = (await db.query("SELECT pg_get_functiondef($1::regprocedure) AS definition", [signature])).rows[0].definition;
  await db.exec(`BEGIN; ${sqlFile("20260904200000_group_registration_tenant_integrity.sql")} COMMIT;`);
  assert.deepEqual(await snapshot(), beforeMigration); pass("migration performs no legacy rewrite or enrollment backfill");
  const currentRpc = (await owner("SELECT pg_get_functiondef($1::regprocedure) AS definition", [signature])).rows[0].definition;
  assert.equal(currentRpc, originalRpc); pass("capacity RPC implementation is byte-for-byte unchanged");
  const constraints = (await owner(`SELECT conname,convalidated,confdeltype,confupdtype,confmatchtype,
    array_length(confdelsetcols,1) AS cleared_columns FROM pg_constraint
    WHERE conname IN ('student_groups_course_organization_registration_fkey','profiles_group_organization_registration_fkey')
    ORDER BY conname`)).rows;
  assert.equal(constraints.length, 2);
  for (const constraint of constraints) assert.deepEqual({ valid: constraint.convalidated, del: constraint.confdeltype,
    update: constraint.confupdtype, match: constraint.confmatchtype, cleared: constraint.cleared_columns },
  { valid: false, del: 'n', update: 'a', match: 's', cleared: 1 });
  pass("native NOT VALID composite FKs retain single-column SET NULL actions");
  for (const name of ["anon", "authenticated", "service_role"]) {
    const privileges = (await owner(`SELECT has_function_privilege($1,$2,'EXECUTE') AS rpc,
      has_function_privilege($1,'public.sync_profile_group_course_enrollment()','EXECUTE') AS profile_trigger,
      has_function_privilege($1,'public.sync_group_course_enrollments()','EXECUTE') AS group_trigger`, [name, signature])).rows[0];
    assert.deepEqual(privileges, { rpc: name === "service_role", profile_trigger: false, group_trigger: false });
    pass(`${name} RPC and trigger execution permissions`);
  }
  for (const name of ["anon", "authenticated"]) {
    await role(name);
    await assert.rejects(() => register(), error => error.code === "42501");
    pass(`${name} cannot call profile provisioning RPC`);
  }
  await role("service_role");
  await db.query("SELECT set_config('request.jwt.claim.role','authenticated',false)");
  await rejectsUnchanged("service RPC still requires service-role claim", () => register(), "42501");
  await role("service_role");
  for (const group of ["foreignGroup", "legacyCourseGroup", "invalid"]) {
    await rejectsUnchanged(`RPC rejects ${group} and rolls back profile, role and monthly ledger`, () => register("invalid", group));
  }
  await rejectsUnchanged("first registration in new tenant rolls back newly created usage row on group rejection",
    () => register("invalid", "group", "freshOrg"));
  const first = await register();
  assert.equal(first.success, true); assert.equal(first.is_existing, false); assert.equal(first.current_students, 1);
  assert.equal((await snapshot()).enrollments.filter(row => row.user_id === ids.learner).length, 1);
  pass("valid group registration atomically creates profile/enrollment and consumes one monthly slot");
  const repeat = await register();
  assert.equal(repeat.is_existing, true); assert.equal(repeat.current_students, 1);
  pass("idempotent existing registration consumes no additional slot");
  await rejectsUnchanged("existing registration cannot switch to foreign group", () => register("learner", "foreignGroup"));
  assert.equal((await register("ungrouped", null)).success, true);
  assert.equal((await register("noCourseLearner", "emptyGroup")).success, true);
  assert.equal((await snapshot()).enrollments.filter(row => [ids.ungrouped,ids.noCourseLearner].includes(row.user_id)).length, 0);
  pass("no-group and no-course-group registration remain valid without invented enrollments");
  for (const [user, status, progress] of [["completed", "completed", 100], ["expired", "active", 37]]) {
    await register(user, null);
    await owner(`INSERT INTO public.enrollments(user_id,course_id,status,progress,time_spent,access_days,started_at,completed_at)
      VALUES ($1,$2,$3,$4,1234,30,'2000-01-01',$5)`, [ids[user],ids.course,status,progress,status === "completed" ? "2000-01-20" : null]);
    const original = (await snapshot()).enrollments.find(row => row.user_id === ids[user]);
    assert.ok(Date.parse(original.expires_at) < Date.now());
    await register(user);
    assert.deepEqual((await snapshot()).enrollments.find(row => row.user_id === ids[user]), original);
    pass(`${user} enrollment retains exact progress, completion, start and expiry without revival`);
  }
  await owner(`UPDATE public.organizations SET custom_max_students=0 WHERE id='${ids.org}'`);
  const limitSnapshot = await snapshot();
  assert.equal((await register("invalid", null)).code, "STUDENT_LIMIT_EXCEEDED");
  assert.deepEqual(await snapshot(), limitSnapshot); pass("monthly limit rejection remains unchanged");
  assert.equal((await register()).is_existing, true); pass("existing student still succeeds at monthly quota");
  await owner(`UPDATE public.organizations SET custom_max_students=NULL WHERE id='${ids.org}';`);
  await owner(`UPDATE public.profiles SET archived_at=now() WHERE user_id='${ids.learner}'`);
  const archived = await snapshot(); assert.equal((await register()).code, "STUDENT_ARCHIVED");
  assert.deepEqual(await snapshot(), archived); pass("archived profile is not revived");
  await owner(`UPDATE public.profiles SET archived_at=NULL WHERE user_id='${ids.learner}'`);

  await rejectsUnchanged("direct profile write cannot attach a foreign group", () => db.exec(
    `UPDATE public.profiles SET student_group_id='${ids.foreignGroup}' WHERE user_id='${ids.learner}'`));
  await rejectsUnchanged("profile organization-only change cannot retain old group", () => db.exec(
    `UPDATE public.profiles SET organization_id='${ids.foreignOrg}' WHERE user_id='${ids.learner}'`));
  await rejectsUnchanged("null profile tenant cannot bypass MATCH SIMPLE", () => db.exec(
    `UPDATE public.profiles SET organization_id=NULL WHERE user_id='${ids.learner}'`));
  await rejectsUnchanged("direct grouped null-tenant profile insert is rejected", () => db.exec(
    `INSERT INTO public.profiles(user_id,student_group_id) VALUES ('${ids.invalid}','${ids.group}')`));
  await rejectsUnchanged("legacy mismatched profile touched with unchanged group is rejected", () => db.exec(
    `UPDATE public.profiles SET student_group_id=student_group_id WHERE user_id='${ids.legacyLearner}'`));
  await rejectsUnchanged("legacy group with foreign course touched unchanged is rejected", () => db.exec(
    `UPDATE public.student_groups SET course_id=course_id WHERE id='${ids.legacyCourseGroup}'`));
  await rejectsUnchanged("group with legacy foreign-tenant membership cannot assign course", () => db.exec(
    `UPDATE public.student_groups SET course_id='${ids.course}' WHERE id='${ids.legacyProfileGroup}'`));
  await rejectsUnchanged("direct group insertion rejects foreign course", () => db.exec(
    `INSERT INTO public.student_groups VALUES ('${ids.invalid}','${ids.org}','${ids.foreignCourse}')`));
  await rejectsUnchanged("group course-only switch to foreign tenant is rejected", () => db.exec(
    `UPDATE public.student_groups SET course_id='${ids.foreignCourse}' WHERE id='${ids.group}'`));
  await rejectsUnchanged("group reparent with matching new course cannot strand existing profiles", () => db.exec(
    `UPDATE public.student_groups SET organization_id='${ids.foreignOrg}',course_id='${ids.foreignCourse}' WHERE id='${ids.group}'`));
  await rejectsUnchanged("native parent FK rejects referenced course tenant reassignment", () => db.exec(
    `UPDATE public.courses SET organization_id='${ids.foreignOrg}' WHERE id='${ids.course}'`));

  await role("authenticated");
  await db.query("SELECT set_config('test.manager','false',false)");
  await assert.rejects(() => db.exec(`UPDATE public.profiles SET student_group_id='${ids.otherGroup}' WHERE user_id='${ids.learner}'`),
    error => error.code === "42501"); pass("existing identity guard still denies unprivileged profile assignment");
  await db.query("SELECT set_config('test.manager','true',false)");
  await db.exec(`UPDATE public.profiles SET student_group_id='${ids.otherGroup}' WHERE user_id='${ids.learner}'`);
  pass("existing students.write helper can assign same-tenant group through trigger without EXECUTE grant");
  await role("service_role");
  const historicalEnrollments = (await snapshot()).enrollments;
  await db.exec(`UPDATE public.student_groups SET course_id='${ids.otherCourse}' WHERE id='${ids.group}'`);
  const changed = await snapshot();
  for (const original of historicalEnrollments) assert.deepEqual(changed.enrollments.find(row => row.id === original.id), original);
  for (const user of ["completed", "expired"]) assert.ok(changed.enrollments.some(row => row.user_id === ids[user] && row.course_id === ids.otherCourse));
  pass("same-tenant group course change creates missing enrollment only and preserves historical enrollment rows");

  await register("deleteLearner", "deleteGroup", "deleteOrg");
  await owner(`DELETE FROM public.courses WHERE id='${ids.deleteCourse}'`);
  let deletion = await snapshot();
  assert.equal(deletion.groups.find(row => row.id === ids.deleteGroup).course_id, null);
  assert.equal(deletion.groups.find(row => row.id === ids.deleteGroup).organization_id, ids.deleteOrg);
  pass("course deletion clears only group course, preserving tenant");
  await owner(`DELETE FROM public.student_groups WHERE id='${ids.deleteGroup}'`);
  deletion = await snapshot();
  assert.equal(deletion.profiles.find(row => row.user_id === ids.deleteLearner).student_group_id, null);
  assert.equal(deletion.profiles.find(row => row.user_id === ids.deleteLearner).organization_id, ids.deleteOrg);
  pass("group deletion clears only profile group, preserving tenant");
  await owner(`INSERT INTO public.courses VALUES ('${ids.deleteCourse}','${ids.deleteOrg}');`);
  await db.exec(`INSERT INTO public.student_groups VALUES ('${ids.deleteGroup}','${ids.deleteOrg}','${ids.deleteCourse}')`);
  await register("deleteLearner", "deleteGroup", "deleteOrg");
  await owner(`DELETE FROM public.organizations WHERE id='${ids.deleteOrg}'`);
  deletion = await snapshot();
  assert.equal(deletion.profiles.find(row => row.user_id === ids.deleteLearner).organization_id, null);
  assert.equal(deletion.profiles.find(row => row.user_id === ids.deleteLearner).student_group_id, null);
  pass("original organization deletion cascade remains supported");

  // Sequential interleavings, not real parallel sessions: cover both orderings.
  await db.exec(`INSERT INTO public.student_groups VALUES ('${ids.lateGroup}','${ids.org}',NULL)`);
  await register("lateLearner", "lateGroup");
  await db.exec(`UPDATE public.student_groups SET course_id='${ids.course}' WHERE id='${ids.lateGroup}'`);
  assert.ok((await snapshot()).enrollments.some(row => row.user_id === ids.lateLearner && row.course_id === ids.course));
  pass("registration before course assignment is enrolled by group update");
  await owner(`DELETE FROM public.enrollments WHERE user_id='${ids.lateLearner}' AND course_id='${ids.course}'`);
  const deliberatelyRemoved = (await snapshot()).enrollments;
  await db.exec(`UPDATE public.student_groups SET course_id=course_id,organization_id=organization_id WHERE id='${ids.lateGroup}'`);
  assert.deepEqual((await snapshot()).enrollments, deliberatelyRemoved);
  pass("unchanged group association save does not recreate a deliberately deleted enrollment");
  await db.exec(`UPDATE public.profiles SET student_group_id=student_group_id,organization_id=organization_id,
    user_id=user_id,full_name='Changed display name' WHERE user_id='${ids.lateLearner}'`);
  assert.deepEqual((await snapshot()).enrollments, deliberatelyRemoved);
  pass("unchanged profile association save does not recreate a deliberately deleted enrollment");
  await db.exec(`UPDATE public.student_groups SET course_id='${ids.otherCourse}' WHERE id='${ids.lateGroup}'`);
  assert.ok((await snapshot()).enrollments.some(row => row.user_id === ids.lateLearner && row.course_id === ids.otherCourse));
  pass("actual group course change still creates its missing enrollment");
  await owner(`DELETE FROM public.enrollments WHERE user_id='${ids.lateLearner}' AND course_id='${ids.otherCourse}'`);
  await db.exec(`UPDATE public.profiles SET student_group_id='${ids.otherGroup}' WHERE user_id='${ids.lateLearner}'`);
  assert.ok((await snapshot()).enrollments.some(row => row.user_id === ids.lateLearner && row.course_id === ids.otherCourse));
  pass("actual profile group reassignment still creates its missing enrollment");
  const finalVersion = (await owner("SELECT version() AS version")).rows[0].version;
  console.log(JSON.stringify({ passed, postgresVersion: finalVersion, productionVerified: false,
    realConcurrentSessions: "not tested: PGlite serializes one connection", fixtureHelpers: true,
    migration: "20260904200000_group_registration_tenant_integrity.sql" }));
} catch (error) {
  console.error(JSON.stringify({ failure: error.message, code: error.code, where: error.where }));
  process.exitCode = 1;
} finally { await db.close(); }
