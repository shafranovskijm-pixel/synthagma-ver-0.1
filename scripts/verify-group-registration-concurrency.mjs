// Native PostgreSQL, independent psql sessions, synthetic data only. No service.
// Creates a NEW D:/CodexTmp/sintagma-registration-concurrency-20260904-* cluster,
// binds only 127.0.0.1, stops the server in finally, and retains data/logs.
// node scripts/verify-group-registration-concurrency.mjs [D:/path/to/pgsql/bin]
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { basename, join, resolve } from "node:path";

const bin = resolve(process.argv[2] || "D:/Codex/SINTAGMA/deps/postgresql-17.11/pgsql/bin");
const tempParent = "D:/CodexTmp";
const prefix = "sintagma-registration-concurrency-20260904-";
for (const name of ["initdb", "pg_ctl", "psql"]) assert.ok(existsSync(join(bin, `${name}.exe`)), `${name}.exe missing`);
const directory = mkdtempSync(join(tempParent, prefix));
assert.equal(resolve(directory, ".."), resolve(tempParent));
assert.ok(basename(directory).startsWith(prefix));
const data = join(directory, "data");
const events = [];
let port, serverStarted = false, stopped = false, passed = 0, serial = 100, counter = 0;
const clients = [];
const log = event => { events.push({ at: new Date().toISOString(), ...event }); console.log(JSON.stringify(event)); };
// Never inherit production libpq connection/service settings. Empty PGSERVICEFILE
// is not equivalent to absent: libpq attempts to open a file named "".
const cleanEnv = Object.fromEntries(Object.entries(process.env).filter(([key]) => !/^PG/i.test(key)));
const env = { ...cleanEnv, TEMP: directory, TMP: directory, PGHOST: "127.0.0.1", PGHOSTADDR: "127.0.0.1",
  PGDATABASE: "postgres", PGUSER: "fixture_owner", PGPASSWORD: "",
  PGPASSFILE: join(directory, "unused-password-file"), PGCLIENTENCODING: "UTF8",
  PGOPTIONS: "-c statement_timeout=15000 -c lock_timeout=12000" };
const fixtureFiles = ["20260412113747_4067e6e8-c9ad-4001-8c78-6e85bc7ecb10.sql",
  "20260729123226_b27fb233-4614-4833-a85d-c26ad0264354.sql", "20260806223000_group_lifecycle_integrity.sql",
  "20260822122951_3eaafed5-8e82-4df4-a45c-9df212ad3b48.sql", "20260904200000_group_registration_tenant_integrity.sql"];
const migrations = fixtureFiles.map(name => ({ name,
  sql: readFileSync(new URL(`../supabase/migrations/${name}`, import.meta.url), "utf8") }));
const migrationHashes = migrations.map(({ name, sql }) => ({ name, sha256: createHash("sha256").update(sql).digest("hex") }));

async function run(name, args, input = "") {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(join(bin, `${name}.exe`), args, { env, windowsHide: true, stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "", stderr = "";
    child.stdout.on("data", chunk => { stdout += chunk; });
    child.stderr.on("data", chunk => { stderr += chunk; });
    child.on("error", reject);
    // Windows postgres may inherit pg_ctl's pipe handles. pg_ctl -w exiting,
    // not inherited handles closing, is the bounded startup/shutdown result.
    child.on(name === "pg_ctl" ? "exit" : "close", code => {
      if (name === "pg_ctl") { child.stdout.destroy(); child.stderr.destroy(); }
      events.push({ command: name, args, code, stdout, stderr });
      if (code !== 0) reject(new Error(`${name} failed (${code}): ${stderr || stdout}`));
      else resolvePromise(stdout.trim());
    });
    child.stdin.end(input);
  });
}
const psqlArgs = () => ["-X", "-q", "-A", "-t", "-w", "-h", "127.0.0.1", "-p", String(port), "-U", "fixture_owner", "-d", "postgres"];

class Session {
  constructor(name) {
    this.name = name; this.buffer = ""; this.stderr = ""; this.pending = null;
    this.child = spawn(join(bin, "psql.exe"), [...psqlArgs(), "-v", "ON_ERROR_STOP=0"], {
      env: { ...env, PGAPPNAME: `registration-proof-${name}` }, windowsHide: true, stdio: ["pipe", "pipe", "pipe"],
    });
    this.closed = new Promise(done => this.child.on("close", done));
    this.child.on("error", error => this.pending?.reject(error));
    this.child.on("close", code => this.pending?.reject(new Error(`${name} psql exited (${code})`)));
    this.child.stderr.on("data", chunk => { this.stderr += chunk; });
    this.child.stdout.on("data", chunk => {
      this.buffer += chunk.toString();
      while (this.buffer.includes("\n")) {
        const end = this.buffer.indexOf("\n");
        const line = this.buffer.slice(0, end).replace(/\r$/, ""); this.buffer = this.buffer.slice(end + 1);
        const current = this.pending;
        if (!current) continue;
        if (line.startsWith(`${current.marker} `)) {
          const code = line.slice(current.marker.length + 1).trim();
          const result = current.lines.join("\n").trim();
          const stderr = this.stderr.slice(current.stderrAt);
          events.push({ session: name, pid: this.pid, sql: current.sql, sqlstate: code, result, stderr });
          this.pending = null;
          if (code === "00000") current.resolve(result);
          else current.reject(Object.assign(new Error(`${name}: ${code} ${stderr}`), { code }));
        } else current.lines.push(line);
      }
    });
    clients.push(this);
  }
  async query(sql) {
    assert.equal(this.pending, null, `${this.name} already has an in-flight query`);
    return new Promise((resolvePromise, reject) => {
      const marker = `proof_${++counter}`;
      this.pending = { marker, sql, lines: [], stderrAt: this.stderr.length, resolve: resolvePromise, reject };
      this.child.stdin.write(`${sql};\n\\echo ${marker} :SQLSTATE\n`);
    });
  }
  async json(sql) { return JSON.parse(await this.query(sql)); }
  async init(service = true) {
    this.pid = Number(await this.query("SELECT pg_backend_pid()"));
    if (service) {
      await this.query("SET ROLE service_role");
      await this.query("SET request.jwt.claim.role='service_role'");
    }
    return this;
  }
  async close() {
    if (this.child.exitCode !== null) return;
    // stdin EOF closes the connection and rolls back any unfinished transaction.
    this.child.stdin.end();
    await this.closed;
  }
}

const uuid = () => `00000000-0000-4000-8000-${String(++serial).padStart(12, "0")}`;
function registration(s) {
  return `SELECT public.create_student_profile_with_capacity('${s.org}','${s.user}',
    'Synthetic Learner','fixture@example.invalid',NULL,NULL,NULL,'${s.group}',NULL)`;
}
async function scenario(observer) {
  const s = Object.fromEntries(["org", "foreignOrg", "course", "nextCourse", "foreignCourse", "group", "user"].map(name => [name, uuid()]));
  await observer.query(`INSERT INTO public.organizations(id) VALUES ('${s.org}'),('${s.foreignOrg}')`);
  await observer.query(`INSERT INTO public.courses VALUES ('${s.course}','${s.org}'),('${s.nextCourse}','${s.org}'),('${s.foreignCourse}','${s.foreignOrg}')`);
  await observer.query(`INSERT INTO public.student_groups VALUES ('${s.group}','${s.org}','${s.course}')`);
  return s;
}
async function state(observer, s) {
  const result = await observer.json(`SELECT json_build_object(
    'profile',(SELECT to_jsonb(p) FROM public.profiles p WHERE user_id='${s.user}'),
    'group',(SELECT to_jsonb(g) FROM public.student_groups g WHERE id='${s.group}'),
    'enrollments',(SELECT COALESCE(jsonb_agg(course_id ORDER BY course_id),'[]') FROM public.enrollments WHERE user_id='${s.user}'),
    'usage',(SELECT COALESCE(sum(students_added_count),0) FROM public.organization_usage WHERE organization_id='${s.org}'),
    'usageRows',(SELECT count(*) FROM public.organization_usage WHERE organization_id='${s.org}'),
    'roles',(SELECT count(*) FROM public.user_roles WHERE user_id='${s.user}'),
    'badMemberships',(SELECT count(*) FROM public.profiles p JOIN public.student_groups g ON g.id=p.student_group_id WHERE p.organization_id IS DISTINCT FROM g.organization_id),
    'badGroupCourses',(SELECT count(*) FROM public.student_groups g JOIN public.courses c ON c.id=g.course_id WHERE g.organization_id IS DISTINCT FROM c.organization_id),
    'badEnrollments',(SELECT count(*) FROM public.enrollments e JOIN public.profiles p USING(user_id) JOIN public.courses c ON c.id=e.course_id WHERE p.organization_id IS DISTINCT FROM c.organization_id))`);
  assert.equal(result.badMemberships, 0); assert.equal(result.badGroupCourses, 0); assert.equal(result.badEnrollments, 0);
  return result;
}
const settled = promise => promise.then(value => ({ ok: true, value }), error => ({ ok: false, error }));
async function observeBlock(observer, waiter, blocker, label) {
  assert.notEqual(waiter.pid, blocker.pid);
  const deadline = Date.now() + 6000;
  while (Date.now() < deadline) {
    const evidence = await observer.json(`SELECT json_build_object('waiter',pid,'blockers',pg_blocking_pids(pid),
      'wait_event_type',wait_event_type,'wait_event',wait_event,'state',state)
      FROM pg_stat_activity WHERE pid=${waiter.pid}`);
    if (evidence?.wait_event_type === "Lock" && evidence.blockers.includes(blocker.pid)) {
      log({ observedBlock: label, ...evidence }); return;
    }
    await new Promise(done => setTimeout(done, 40));
  }
  throw new Error(`No actual pg_blocking_pids conflict observed: ${label}`);
}
function success(result) { assert.equal(result.ok, true, result.error?.message); return result.value; }
function sqlError(result, code = "23503") { assert.equal(result.ok, false); assert.equal(result.error.code, code); }
function pass(label) { passed++; log({ pass: label }); }
async function stop() {
  // A pg_ctl startup timeout can still leave a live server. This is always our
  // newly created, path-validated cluster, never an existing user's instance.
  if (!serverStarted && !existsSync(join(data,"postmaster.pid"))) return;
  if (!existsSync(join(data,"postmaster.pid"))) { stopped = true; serverStarted = false; return; }
  await run("pg_ctl", ["-D", data, "-m", "fast", "-w", "-t", "20", "stop"]);
  stopped = true; serverStarted = false;
}

try {
  port = await new Promise((resolvePromise, reject) => {
    const socket = createServer(); socket.once("error", reject);
    socket.listen(0, "127.0.0.1", () => { const value = socket.address().port; socket.close(() => resolvePromise(value)); });
  });
  env.PGPORT = String(port);
  log({ directory, port, listenAddress: "127.0.0.1", migrationHashes });
  await run("initdb", ["-D", data, "-U", "fixture_owner", "--auth=trust", "--encoding=UTF8", "--locale=C"]);
  await run("pg_ctl", ["-D", data, "-l", join(directory, "postgres.log"), "-w", "-t", "20", "-o",
    `-h 127.0.0.1 -p ${port} -c log_statement=all -c log_lock_waits=on -c deadlock_timeout=100ms`, "start"]);
  serverStarted = true;
  await run("psql", [...psqlArgs(), "-v", "ON_ERROR_STOP=1"], `
    BEGIN;
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role; CREATE SCHEMA auth;
    CREATE TYPE public.app_role AS ENUM ('admin','organization','student');
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT NULL::uuid $$;
    CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$ SELECT current_setting('request.jwt.claim.role',true) $$;
    CREATE FUNCTION public.has_role(public.app_role,uuid) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT false $$;
    CREATE FUNCTION public.can_access_organization(uuid,text) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT false $$;
    CREATE TABLE public.organizations(id uuid PRIMARY KEY,subscription_plan text NOT NULL DEFAULT 'free',custom_max_students integer);
    CREATE TABLE public.profiles(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid NOT NULL UNIQUE,
      organization_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL,
      company_id uuid,student_group_id uuid,full_name text,email text,login text,generated_password text,region text,archived_at timestamptz);
    CREATE TABLE public.courses(id uuid PRIMARY KEY,organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE);
    CREATE TABLE public.student_groups(id uuid PRIMARY KEY,organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
      course_id uuid REFERENCES public.courses(id) ON DELETE SET NULL);
    ALTER TABLE public.profiles ADD FOREIGN KEY(student_group_id) REFERENCES public.student_groups(id) ON DELETE SET NULL;
    CREATE TABLE public.enrollments(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid NOT NULL,
      course_id uuid NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,status text NOT NULL DEFAULT 'active',
      progress integer NOT NULL DEFAULT 0,time_spent integer NOT NULL DEFAULT 0,started_at timestamptz NOT NULL DEFAULT now(),
      completed_at timestamptz,UNIQUE(user_id,course_id));
    CREATE TABLE public.user_roles(user_id uuid PRIMARY KEY,role public.app_role NOT NULL);
    CREATE TABLE public.organization_usage(organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
      month_start date,students_added_count integer NOT NULL,PRIMARY KEY(organization_id,month_start));
    CREATE TABLE public.companies(id uuid PRIMARY KEY,organization_id uuid);
    CREATE TABLE public.student_frdo_data(id uuid PRIMARY KEY);
    GRANT USAGE ON SCHEMA public,auth TO anon,authenticated,service_role;
    GRANT SELECT,INSERT,UPDATE,DELETE ON public.profiles,public.student_groups,public.courses TO service_role;
    ${migrations.map(item => item.sql).join("\n")}
    COMMIT;
  `);
  const observer = await new Session("observer").init(false);
  const a = await new Session("A").init(); const b = await new Session("B").init();
  const version = await observer.query("SELECT version()");
  const isolation = await observer.query("SHOW default_transaction_isolation");
  assert.equal(isolation, "read committed"); assert.equal(new Set([observer.pid,a.pid,b.pid]).size, 3);
  log({ version, isolation, backendPids: { observer: observer.pid, A: a.pid, B: b.pid } });

  let s = await scenario(observer);
  await a.query("BEGIN"); assert.equal((await a.json(registration(s))).success, true);
  await b.query("BEGIN");
  let pending = settled(b.query(`UPDATE public.student_groups SET course_id='${s.nextCourse}' WHERE id='${s.group}'`));
  await observeBlock(observer,b,a,"registration -> group course change");
  await a.query("COMMIT"); success(await pending); await b.query("COMMIT");
  let result = await state(observer,s);
  assert.equal(result.group.course_id,s.nextCourse); assert.deepEqual(result.enrollments,[s.course,s.nextCourse].sort()); assert.equal(result.usage,1);
  pass("registration first: committed course change sees new member and enrolls current course");

  await observer.query(`DELETE FROM public.enrollments WHERE user_id='${s.user}' AND course_id='${s.nextCourse}'`);
  await a.query(`UPDATE public.student_groups SET course_id=course_id,organization_id=organization_id WHERE id='${s.group}'`);
  await a.query(`UPDATE public.profiles SET student_group_id=student_group_id,organization_id=organization_id,user_id=user_id,full_name='Rename' WHERE user_id='${s.user}'`);
  assert.deepEqual((await state(observer,s)).enrollments,[s.course]);
  pass("unchanged group/profile saves do not resurrect deliberately deleted enrollment");

  s = await scenario(observer);
  await a.query("BEGIN"); await a.query(`UPDATE public.student_groups SET course_id='${s.nextCourse}' WHERE id='${s.group}'`);
  await b.query("BEGIN"); pending = settled(b.json(registration(s)));
  await observeBlock(observer,b,a,"group course change -> registration");
  await a.query("COMMIT"); assert.equal(success(await pending).success,true); await b.query("COMMIT");
  result = await state(observer,s); assert.deepEqual(result.enrollments,[s.nextCourse]); assert.equal(result.usage,1);
  pass("course change first: waiting registration uses committed new course only");

  s = await scenario(observer);
  await a.query("BEGIN"); await a.json(registration(s)); await b.query("BEGIN");
  pending = settled(b.query(`UPDATE public.student_groups SET organization_id='${s.foreignOrg}',course_id='${s.foreignCourse}' WHERE id='${s.group}'`));
  await observeBlock(observer,b,a,"registration -> group tenant reparent");
  await a.query("COMMIT"); sqlError(await pending); await b.query("ROLLBACK");
  result = await state(observer,s); assert.equal(result.group.organization_id,s.org); assert.deepEqual(result.enrollments,[s.course]); assert.equal(result.usage,1);
  pass("registration first: group tenant/course reparent waits then rolls back with 23503");

  s = await scenario(observer);
  await a.query("BEGIN"); await a.query(`UPDATE public.student_groups SET organization_id='${s.foreignOrg}',course_id='${s.foreignCourse}' WHERE id='${s.group}'`);
  await b.query("BEGIN"); pending = settled(b.json(registration(s)));
  await observeBlock(observer,b,a,"group tenant reparent -> registration");
  await a.query("COMMIT"); sqlError(await pending); await b.query("ROLLBACK");
  result = await state(observer,s); assert.equal(result.group.organization_id,s.foreignOrg);
  assert.equal(result.profile,null); assert.deepEqual(result.enrollments,[]); assert.equal(result.usageRows,0); assert.equal(result.roles,0);
  pass("group reparent first: waiting registration rejects stale tenant and rolls back profile/role/quota");

  s = await scenario(observer);
  await a.query("BEGIN"); await a.json(registration(s)); await b.query("BEGIN");
  pending = settled(b.query(`UPDATE public.courses SET organization_id='${s.foreignOrg}' WHERE id='${s.course}'`));
  await observeBlock(observer,b,a,"registration -> course tenant reparent");
  await a.query("COMMIT"); sqlError(await pending); await b.query("ROLLBACK");
  result = await state(observer,s); assert.deepEqual(result.enrollments,[s.course]); assert.equal(result.usage,1);
  pass("registration first: referenced course tenant reparent waits then native FK rejects it");

  s = await scenario(observer);
  await a.query("BEGIN"); await a.query(`UPDATE public.student_groups SET course_id=NULL WHERE id='${s.group}'`);
  await a.query(`UPDATE public.courses SET organization_id='${s.foreignOrg}' WHERE id='${s.course}'`);
  await b.query("BEGIN"); pending = settled(b.json(registration(s)));
  await observeBlock(observer,b,a,"detach and course tenant reparent -> registration");
  await a.query("COMMIT"); assert.equal(success(await pending).success,true); await b.query("COMMIT");
  result = await state(observer,s); assert.equal(result.group.course_id,null); assert.deepEqual(result.enrollments,[]); assert.equal(result.usage,1);
  pass("legitimate detached course reparent first: registration never enrolls removed/foreign course");

  s = await scenario(observer);
  await a.query("BEGIN"); await a.json(registration(s)); await b.query("BEGIN");
  pending = settled(b.query(`UPDATE public.student_groups SET course_id='${s.nextCourse}' WHERE id='${s.group}'`));
  await observeBlock(observer,b,a,"rolled-back registration -> course change");
  await a.query("ROLLBACK"); success(await pending); await b.query("COMMIT");
  result = await state(observer,s); assert.equal(result.profile,null); assert.deepEqual(result.enrollments,[]); assert.equal(result.usageRows,0);
  assert.equal((await a.json(registration(s))).success,true);
  result = await state(observer,s); assert.deepEqual(result.enrollments,[s.nextCourse]); assert.equal(result.usage,1);
  pass("registration rollback releases waiter and leaves no profile/enrollment/quota residue");

  s = await scenario(observer);
  await a.query("BEGIN"); await a.query(`UPDATE public.student_groups SET course_id='${s.nextCourse}' WHERE id='${s.group}'`);
  await b.query("BEGIN"); pending = settled(b.json(registration(s)));
  await observeBlock(observer,b,a,"rolled-back course change -> registration");
  await a.query("ROLLBACK"); assert.equal(success(await pending).success,true); await b.query("COMMIT");
  result = await state(observer,s); assert.deepEqual(result.enrollments,[s.course]); assert.equal(result.usage,1);
  pass("course-change rollback: waiting registration uses original course");

  s = await scenario(observer);
  await a.query("BEGIN"); const first = await a.json(registration(s)); await b.query("BEGIN");
  pending = settled(b.json(registration(s)));
  await observeBlock(observer,b,a,"duplicate registration -> organization advisory lock");
  await a.query("COMMIT"); const repeated = success(await pending); await b.query("COMMIT");
  assert.equal(first.is_existing,false); assert.equal(repeated.is_existing,true);
  result = await state(observer,s); assert.deepEqual(result.enrollments,[s.course]); assert.equal(result.usage,1); assert.equal(result.roles,1);
  pass("real concurrent duplicate registrations produce one profile/enrollment/role and one monthly slot");
  log({ result: "passed", passed, observedBlocks: events.filter(event => event.observedBlock).length,
    version, isolation, productionVerified: false, fixtureHelpers: true });
} catch (error) {
  log({ result: "failed", passed, message: error.message, code: error.code, stack: error.stack });
  process.exitCode = 1;
} finally {
  // Server shutdown first cancels any blocked query if a test failed. No deletes.
  try { await stop(); } catch (error) { log({ shutdownError: error.message }); process.exitCode = 1; }
  await Promise.all(clients.map(client => client.close()));
  const report = { directory, port, passed, stopped, productionVerified: false, migrationHashes, events };
  writeFileSync(join(directory,"report.json"),JSON.stringify(report,null,2));
  console.log(JSON.stringify({ directory, report: join(directory,"report.json"), stopped, passed }));
}
