// @vitest-environment node
// Source only until held execution. Reduced engine is not native concurrency proof.
import {afterEach,beforeEach,describe,expect,it} from 'vitest';
import type {PGlite} from '@electric-sql/pglite';
import {actor,create,createCustomJournalLab,read,releasePath,result} from './helpers/customJournalLab';
let db:PGlite;
const ledger=()=>result(db,"SELECT coalesce(jsonb_agg(to_jsonb(m)ORDER BY version),'[]')AS result FROM supabase_migrations.schema_migrations m");
beforeEach(async()=>{db=await createCustomJournalLab(false);},30000);
afterEach(async()=>{await db?.exec('ROLLBACK; RESET ROLE');await db?.close();});
describe('UC015 atomic ledger wrapper and empty-only rollback',()=>{
 it('installs one exact ledger row, preserves every older column/RPC and restores empty foundation exactly',async()=>{
  const before=await ledger();const fixture=JSON.parse(await read('supabase/tests/fixtures/uc-custom-journals-source-baseline.json'));
  await db.exec(await read(releasePath+'release-atomic.sql'));
  const after=await ledger();expect(after).toHaveLength(before.length+1);expect(after.filter((r:any)=>r.version!=='20261020150000')).toEqual(before);
  await db.exec(await read(releasePath+'rollback-empty-foundation.sql'));
  expect(await ledger()).toEqual(before);
  expect((await db.query("SELECT proname FROM pg_proc WHERE proname LIKE 'uc_custom_journal_%'OR proname IN('read_custom_journals','apply_custom_journal_action')")).rows).toEqual([]);
  expect((await db.query("SELECT relname FROM pg_class WHERE relname IN('uc_custom_journals','uc_custom_journal_schemas','uc_custom_journal_records','uc_custom_journal_history','uc_custom_journal_requests')")).rows).toEqual([]);
  for(const f of fixture.erasure){const actual=(await db.query<{md5:string}>('SELECT md5(pg_get_functiondef($1::regprocedure))',[f.signature])).rows[0].md5;expect(actual).toBe(f.definition_md5);}
  expect((await db.query<{md5:string}>("SELECT md5(pg_get_functiondef('public.get_organization_students_page(uuid,integer,integer,text,uuid,text,text,text,text)'::regprocedure))")).rows[0].md5).toBe('f38189a9960f714e43a3ebcbc60f336e');
 });
 it('refuses populated rollback without deleting or rewriting a fact',async()=>{
  await db.exec(await read(releasePath+'release-atomic.sql'));await actor(db,1);const made=await create(db);
  await db.exec('RESET ROLE');const before=await ledger();
  await expect(db.exec(await read(releasePath+'rollback-empty-foundation.sql'))).rejects.toThrow('ROLLBACK_NONEMPTY');await db.exec('ROLLBACK');
  expect(await ledger()).toEqual(before);expect((await db.query('SELECT id FROM uc_custom_journals')).rows).toEqual([{id:made.journal.id}]);
 });
 it('refuses an absent exact015 ledger row and preserves the empty foundation/catalog and every older ledger column',async()=>{
  await db.exec(await read(releasePath+'release-atomic.sql'));
  const inventory=()=>result(db,"SELECT jsonb_build_object('functions',(SELECT jsonb_agg(jsonb_build_object('signature',p.oid::regprocedure::text,'metadata',to_jsonb(p),'definition',pg_get_functiondef(p.oid))ORDER BY p.oid::regprocedure::text)FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public'AND p.prokind<>'a'),'tables',(SELECT jsonb_agg(jsonb_build_object('oid',c.oid,'name',c.relname,'owner',c.relowner,'acl',c.relacl,'rls',c.relrowsecurity)ORDER BY c.relname)FROM pg_class c WHERE c.oid IN('uc_custom_journals'::regclass,'uc_custom_journal_schemas'::regclass,'uc_custom_journal_records'::regclass,'uc_custom_journal_history'::regclass,'uc_custom_journal_requests'::regclass)),'triggers',(SELECT jsonb_agg(jsonb_build_object('name',tgname,'table',tgrelid::regclass::text,'definition',pg_get_triggerdef(oid),'enabled',tgenabled)ORDER BY tgrelid,tgname)FROM pg_trigger WHERE tgrelid IN('uc_custom_journals'::regclass,'uc_custom_journal_schemas'::regclass,'uc_custom_journal_records'::regclass,'uc_custom_journal_history'::regclass,'uc_custom_journal_requests'::regclass)))AS result");
  const oldRows=(await ledger()).filter((row:any)=>row.version!=='20261020150000');
  const beforeCatalog=await inventory();
  // Deliberate synthetic drift outside the failing rollback transaction.
  await db.query("DELETE FROM supabase_migrations.schema_migrations WHERE version='20261020150000'");
  expect((await db.query<{n:number}>("SELECT((SELECT count(*)FROM uc_custom_journals)+(SELECT count(*)FROM uc_custom_journal_schemas)+(SELECT count(*)FROM uc_custom_journal_records)+(SELECT count(*)FROM uc_custom_journal_history)+(SELECT count(*)FROM uc_custom_journal_requests))::integer n")).rows[0].n).toBe(0);
  await expect(db.exec(await read(releasePath+'rollback-empty-foundation.sql'))).rejects.toThrow('ROLLBACK_LEDGER_CHANGED');await db.exec('ROLLBACK');
  expect(await inventory()).toEqual(beforeCatalog);expect(await ledger()).toEqual(oldRows);
  expect((await db.query("SELECT to_regprocedure('public.read_custom_journals(uuid,jsonb)')IS NOT NULL AS present")).rows[0]).toEqual({present:true});
 });
 it('rejects source/name overload collisions atomically before exposing any RPC',async()=>{
  await db.exec('CREATE FUNCTION public.uc_custom_journal_unreviewed(text)RETURNS text LANGUAGE sql AS $$SELECT $1$$');
  const before=await ledger();await expect(db.exec(await read(releasePath+'release-atomic.sql'))).rejects.toThrow('DEPENDENCY_UNAVAILABLE');await db.exec('ROLLBACK');
  expect(await ledger()).toEqual(before);expect((await db.query("SELECT to_regprocedure('public.read_custom_journals(uuid,jsonb)')AS rpc")).rows[0]).toEqual({rpc:null});
 });
 it('rejects a changed exact post014 erase body and preserves the old catalog and ledger',async()=>{
  await db.exec("CREATE OR REPLACE FUNCTION public.account_deletion_personal_row_counts(p_user_id uuid)RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$BEGIN RAISE EXCEPTION 'Deliberate synthetic drift';END;$$");
  const before=await ledger();await expect(db.exec(await read(releasePath+'release-atomic.sql'))).rejects.toThrow('DEPENDENCY_UNAVAILABLE');await db.exec('ROLLBACK');expect(await ledger()).toEqual(before);
  expect((await db.query("SELECT to_regclass('public.uc_custom_journals')AS relation")).rows[0]).toEqual({relation:null});
 });
 it('refuses urgent ledger tampering rather than legitimizing it as a new baseline',async()=>{
  await db.query("UPDATE supabase_migrations.schema_migrations SET statements=ARRAY['Drift']WHERE version='20261020050000'");
  const before=await ledger();await expect(db.exec(await read(releasePath+'release-atomic.sql'))).rejects.toThrow('URGENT_RPC_CHANGED');await db.exec('ROLLBACK');expect(await ledger()).toEqual(before);
 });
 it('refuses rollback if a new private function or inherited ACL has drifted',async()=>{
  await db.exec(await read(releasePath+'release-atomic.sql'));
  await db.exec('GRANT EXECUTE ON FUNCTION public.uc_custom_journal_personal_counts(uuid)TO uc015_default_bystander');
  const before=await ledger();await expect(db.exec(await read(releasePath+'rollback-empty-foundation.sql'))).rejects.toThrow('ACL_CHANGED');await db.exec('ROLLBACK');expect(await ledger()).toEqual(before);
  expect((await db.query("SELECT to_regprocedure('public.read_custom_journals(uuid,jsonb)')IS NOT NULL exists")).rows[0]).toEqual({exists:true});
 });
});
