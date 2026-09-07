/** Real PostgreSQL behavior and concurrency checks. Requires a dedicated local test cluster.
 * node scripts/test-test-attempts.mjs <path-to-psql> [port=55439]
 * Creates a new test_attempts_check_* database; never connects to a remote host.
 */
import { spawn } from 'node:child_process';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import assert from 'node:assert/strict';
const repo = fileURLToPath(new URL('../', import.meta.url));
const psql = process.argv[2] || 'psql';
const port = process.argv[3] || '55439';
if (!/^\d+$/.test(port)) throw new Error('Invalid local port');
const db = `test_attempts_check_${Date.now()}`;
const out = path.join(repo,'work','test-attempt-checks',db);
await mkdir(out,{recursive:true});
function command(args) {
  return new Promise((resolve,reject) => {
    const child=spawn(psql,['-X','-h','127.0.0.1','-p',port,'-U','postgres','-v','ON_ERROR_STOP=1',...args],{cwd:repo,windowsHide:true});
    let stdout='',stderr='';
    child.stdout.on('data',b=>stdout+=b); child.stderr.on('data',b=>stderr+=b);
    child.on('error',reject);
    child.on('close',code=>code===0?resolve({stdout,stderr}):reject(Object.assign(new Error(stderr||stdout),{code,stdout,stderr})));
  });
}
const sql = text => command(['-d',db,'-Atq','-c',text]);
const auth = (text,user='20000000-0000-0000-0000-000000000001') => sql(`SET ROLE authenticated; SET request.jwt.claim.sub='${user}'; ${text}`);
await command(['-d','postgres','-c',`CREATE DATABASE ${db}`]);
const install=await command(['-d',db,'-f','supabase/tests/test_attempts_fixture.sql']);
await writeFile(path.join(out,'fixture.log'),install.stdout+install.stderr);
// Exercise the repository's real access helpers, not only equivalent fixture helpers.
const library=await readFile(path.join(repo,'supabase/migrations/20260903100000_csz_electronic_library_schema.sql'),'utf8');
const learner=library.match(/CREATE OR REPLACE FUNCTION public\.can_access_course_as_learner\([\s\S]*?\$function\$;/)?.[0];
const permissions=await readFile(path.join(repo,'supabase/migrations/20260728072432_172e4e18-e52e-495d-b1ff-d3e5d3c04b9d.sql'),'utf8');
const course=permissions.match(/CREATE OR REPLACE FUNCTION public\.can_access_course\([\s\S]*?\$\$;/)?.[0];
const lesson=permissions.match(/CREATE OR REPLACE FUNCTION public\.can_access_lesson\([\s\S]*?\$\$;/)?.[0];
if (!learner||!course||!lesson) throw new Error('Authoritative access helpers not found');
// Existing fixture signatures use different argument names; replace in dependency order.
await sql('DROP FUNCTION public.can_access_course_as_learner(uuid); DROP FUNCTION public.can_access_lesson(uuid,text); DROP FUNCTION public.can_access_course(uuid,text);');
await sql([learner,course,lesson].join('\n'));
const migrations=await command(['-d',db,
  '-f','supabase/migrations/20260907120000_test_attempt_sessions.sql',
  '-f','supabase/migrations/20260907120001_course_manual_credits.sql']);
await writeFile(path.join(out,'migrations.log'),migrations.stdout+migrations.stderr);
const checks=await command(['-d',db,'-f','supabase/tests/test_attempt_sessions.test.sql']);
await writeFile(path.join(out,'behavior.log'),checks.stdout+checks.stderr);
const passed=(checks.stderr.match(/PASS:/g)||[]).length;
console.log(`PASS: ${passed} PostgreSQL behavior assertions (${db})`);
const options=await command(['-d',db,'-f','supabase/tests/test_question_options.test.sql']);
await writeFile(path.join(out,'question-options.log'),options.stdout+options.stderr);
const questionOptionsAssertions=(options.stderr.match(/PASS:/g)||[]).length;
console.log(`PASS: ${questionOptionsAssertions} legacy/malformed question-options assertions`);
const manual=await command(['-d',db,'-f','supabase/tests/course_manual_credits.test.sql']);
await writeFile(path.join(out,'manual-credit.log'),manual.stdout+manual.stderr);
console.log('PASS: manual-credit PostgreSQL behavior tests');
await sql("UPDATE public.lessons SET test_max_attempts_per_day=2 WHERE id='40000000-0000-0000-0000-000000000001';");
// Hold the server inside INSERT long enough that separate client processes overlap.
await sql(`CREATE FUNCTION public.test_slow_start() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN PERFORM pg_sleep(0.3); RETURN NEW; END $$;
 CREATE TRIGGER test_slow_start BEFORE INSERT ON public.test_attempt_sessions FOR EACH ROW EXECUTE FUNCTION public.test_slow_start();`);
const starts=await Promise.all(Array.from({length:8},(_,i)=>auth(`SELECT public.start_test_attempt('40000000-0000-0000-0000-000000000001','60000000-0000-0000-0000-${String(i+1).padStart(12,'0')}');`)));
const sessions=starts.map(r=>JSON.parse(r.stdout.trim()).attemptId);
assert.equal(new Set(sessions).size,1,'parallel starts must share one session');
assert.equal((await sql('SELECT count(*) FROM public.test_attempt_sessions')).stdout.trim(),'1');
await sql('DROP TRIGGER test_slow_start ON public.test_attempt_sessions;');
console.log('PASS: 8 overlapping starts reserve one attempt');
await sql(`CREATE FUNCTION public.test_slow_grade() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN PERFORM pg_sleep(0.3); RETURN NEW; END $$;
 CREATE TRIGGER test_slow_grade BEFORE INSERT ON public.test_attempts FOR EACH ROW EXECUTE FUNCTION public.test_slow_grade();`);
const answer='{"50000000-0000-0000-0000-000000000001":0,"50000000-0000-0000-0000-000000000002":1}';
const submissions=await Promise.all(Array.from({length:8},()=>auth(`SELECT public.submit_test_attempt('${sessions[0]}','${answer}');`)));
for (const result of submissions) assert.equal(JSON.parse(result.stdout.trim()).score,2);
assert.equal((await sql('SELECT count(*) FROM public.test_attempts')).stdout.trim(),'1');
assert.equal((await sql('SELECT count(*) FROM public.lesson_progress WHERE completed=true')).stdout.trim(),'1');
await sql('DROP TRIGGER test_slow_grade ON public.test_attempts;');
console.log('PASS: 8 overlapping submissions produce one completed result and progress update');
// Every request that resumed the first attempt stays idempotent after its completion.
for (let i=0;i<8;i++) {
 const replay=await auth(`SELECT public.start_test_attempt('40000000-0000-0000-0000-000000000001','60000000-0000-0000-0000-${String(i+1).padStart(12,'0')}');`);
 assert.equal(JSON.parse(replay.stdout.trim()).attemptId,sessions[0]);
}
const second=JSON.parse((await auth("SELECT public.start_test_attempt('40000000-0000-0000-0000-000000000001',gen_random_uuid());")).stdout.trim()).attemptId;
await auth(`SELECT public.submit_test_attempt('${second}','{}');`);
const denials=await Promise.allSettled(Array.from({length:6},()=>auth("SELECT public.start_test_attempt('40000000-0000-0000-0000-000000000001',gen_random_uuid());")));
assert(denials.every(r=>r.status==='rejected' && r.reason.message.includes('Daily attempts exhausted')));
assert.equal((await sql('SELECT count(*) FROM public.test_attempt_sessions')).stdout.trim(),'2');
console.log('PASS: 6 overlapping starts after daily cap are all rejected');
// Revoke enrollment while start waits for the same row lock. It must recheck access.
const revoke=sql(`BEGIN; SET application_name='test_attempt_revoke_lock';
 UPDATE public.enrollments SET status='revoked' WHERE user_id='20000000-0000-0000-0000-000000000002';
 SELECT pg_sleep(1.2); COMMIT;`);
let lockReady=false;
for (let i=0;i<25;i++) {
 const waiting=await sql("SELECT count(*) FROM pg_stat_activity WHERE application_name='test_attempt_revoke_lock' AND wait_event='PgSleep';");
 if (waiting.stdout.trim()==='1') { lockReady=true; break; }
 await new Promise(resolve=>setTimeout(resolve,20));
}
assert(lockReady,'revocation fixture must hold enrollment lock before start');
const racedStart=await Promise.allSettled([auth("SELECT public.start_test_attempt('40000000-0000-0000-0000-000000000002',gen_random_uuid());",'20000000-0000-0000-0000-000000000002')]);
await revoke;
assert.equal(racedStart[0].status,'rejected');
assert(racedStart[0].reason.message.includes('Test is not available'));
assert.equal((await sql("SELECT count(*) FROM public.test_attempt_sessions WHERE user_id='20000000-0000-0000-0000-000000000002'")).stdout.trim(),'0');
console.log('PASS: enrollment revocation while start waits cannot authorize a new session');
await writeFile(path.join(out,'summary.json'),JSON.stringify({database:db,behaviorAssertions:passed,questionOptionsAssertions,manualCreditSuite:true,parallelStarts:8,parallelSubmissions:8,parallelQuotaDenials:6,concurrentEnrollmentRevocationDenied:true,passed:true},null,2));
console.log(`Evidence: ${out}`);