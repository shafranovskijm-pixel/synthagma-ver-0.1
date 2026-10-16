// @vitest-environment node
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { afterEach, describe, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { createReleaseBatchFixture } from './release-batch.fixture';

const release = new URL('../../../docs/releases/sintagma-production/payment-access-ui-20261016/', import.meta.url);
const read = (name: string) => readFile(new URL(name, release), 'utf8');
let db: PGlite;
afterEach(async () => { await db?.close(); });
const scalar = async (sql: string) => (await db.query<any>(sql)).rows[0].value;
const ledgerCount = () => scalar('SELECT count(*)::int AS value FROM supabase_migrations.schema_migrations');
async function assertRolledBack() {
  await db.exec('ROLLBACK');
  expect(await ledgerCount()).toBe(0);
  expect(await scalar("SELECT to_regprocedure('public.apply_tbank_balance_credit(uuid,numeric,text,text,text)') IS NULL AS value")).toBe(true);
  expect(await scalar("SELECT to_regprocedure('public.finalize_created_org_user(uuid,uuid,text)') IS NULL AS value")).toBe(true);
  expect(await scalar("SELECT to_regclass('public.tbank_payment_settlements') IS NULL AS value")).toBe(true);
  expect(await scalar("SELECT count(*)::int AS value FROM information_schema.columns WHERE table_schema='public' AND column_name IN('idempotency_key','tbank_order_id','authorization_verified_at')")).toBe(0);
  expect(await scalar("SELECT EXISTS(SELECT 1 FROM pg_policies WHERE tablename='sales_leads' AND policyname='sales_leads_sm_all') AS value")).toBe(true);
  expect(await scalar("SELECT balance::int AS value FROM organizations")).toBe(1234);
  expect(await scalar("SELECT to_regclass('public.organization_billing_agreements') IS NULL AS value")).toBe(true);
  expect(await scalar("SELECT to_regclass('public.manual_invoice_settlements') IS NULL AS value")).toBe(true);
  expect(await scalar("SELECT to_regprocedure('public.verify_billing_cron_secret(text)') IS NULL AS value")).toBe(true);
  expect(await scalar("SELECT count(*)::int AS value FROM vault.secrets WHERE name='sintagma_billing_cron_secret'")).toBe(0);
  expect(await scalar("SELECT command LIKE '%x-billing-cron-secret%' AS value FROM cron.job WHERE jobname='check-subscription-expiry-daily'")).toBe(false);
  expect(await scalar("SELECT md5(prosrc) AS value FROM pg_proc WHERE oid='public.get_organization_student_capacity(uuid,integer)'::regprocedure")).toBe('8a35465f4c53c02ac5417d1d2d13e257');
}
describe('eleven-migration single-request release transaction', () => {
  it('applies the actual batch, preserves records, records exact sources and refuses replay', async () => {
    db = await createReleaseBatchFixture();
    const manifest = JSON.parse(await read('release-manifest.json'));
    const batch = await read('release-transaction.sql');
    expect(createHash('sha256').update(batch.replaceAll('\r\n','\n')).digest('hex')).toBe(manifest.batchSha256);
    expect(manifest.migrationCount).toBe(11);
    expect(manifest.edgeEntrypoints.some((entry:any)=>entry.name==='check-subscription-expiry')).toBe(true);
    expect(manifest.edgeDependencies.some((entry:any)=>entry.path.endsWith('/tbank-webhook/handler.ts'))).toBe(true);
    expect(manifest.edgeDependencies.some((entry:any)=>entry.path.endsWith('/_shared/privileged-access.ts'))).toBe(true);
    const config=await readFile(new URL('../../../supabase/config.toml',import.meta.url),'utf8');
    expect(createHash('sha256').update(config.replaceAll('\r\n','\n')).digest('hex')).toBe(manifest.configSha256);
    for (const entry of manifest.edgeDependencies) {
      const source=await readFile(new URL(`../../../${entry.path}`,import.meta.url),'utf8');
      expect(createHash('sha256').update(source.replaceAll('\r\n','\n')).digest('hex')).toBe(entry.sourceSha256);
    }
    await db.exec(batch);
    expect(await ledgerCount()).toBe(11);
    for (const migration of manifest.migrations) {
      const source = await readFile(new URL(`../../migrations/${migration.file}`, import.meta.url),'utf8');
      const normalized=source.replaceAll('\r\n','\n');
      expect(createHash('sha256').update(normalized).digest('hex')).toBe(migration.sourceSha256);
      expect(createHash('md5').update(normalized).digest('hex')).toBe(migration.sourceMd5);
      const executable=migration.stripOuterTransaction ? normalized.replace(/^BEGIN;$/m,'').replace(/^COMMIT;$/m,'') : normalized;
      expect(createHash('md5').update(executable).digest('hex')).toBe(migration.executableMd5);
      const stored = (await db.query<any>('SELECT statements[1] AS source FROM supabase_migrations.schema_migrations WHERE version=$1',[migration.version])).rows[0].source;
      expect(stored).toBe(source);
    }
    expect(await scalar('SELECT balance::int AS value FROM organizations')).toBe(1234);
    expect(await scalar('SELECT count(*)::int AS value FROM skillspace_import_jobs WHERE authorization_verified_at IS NULL')).toBe(1);
    expect(await scalar('SELECT count(*)::int AS value FROM balance_transactions WHERE idempotency_key IS NULL')).toBe(1);
    expect(await scalar('SELECT tbank_order_id AS value FROM subscription_invoices')).toBe('sub_3000000000000000000000000000');
    expect(await scalar('SELECT count(*)::int AS value FROM organization_billing_agreements')).toBe(0);
    expect(await scalar('SELECT count(*)::int AS value FROM postpaid_billing_statements')).toBe(0);
    expect(await scalar('SELECT count(*)::int AS value FROM manual_invoice_settlements')).toBe(0);
    expect(await scalar("SELECT count(*)::int AS value FROM vault.secrets WHERE name='sintagma_billing_cron_secret'")).toBe(1);
    expect(await scalar("SELECT command LIKE '%x-billing-cron-secret%' AS value FROM cron.job WHERE jobname='check-subscription-expiry-daily'")).toBe(true);
    expect(await scalar("SELECT secret AS value FROM vault.secrets WHERE name='unrelated_fixture_secret'")).toBe('synthetic-not-live');
    expect(await scalar("SELECT command AS value FROM cron.job WHERE jobname='unrelated-fixture-job'")).toBe('SELECT 1');
    await expect(db.exec(batch)).rejects.toThrow('release replay refused');
    await db.exec('ROLLBACK'); expect(await ledgerCount()).toBe(11);
  }, 30000);
  it('rolls back ALL eleven changes, Vault secret and cron rewrite when the last migration ledger insert fails', async () => {
    db = await createReleaseBatchFixture();
    await db.exec("ALTER TABLE supabase_migrations.schema_migrations ADD CONSTRAINT fixture_refuse_last CHECK(version<>'20261016164000')");
    await expect(db.exec(await read('release-transaction.sql'))).rejects.toThrow('fixture_refuse_last');
    await assertRolledBack();
  }, 30000);
  it('rolls back an earlier payment/provisioning/theme change when a late import preflight rejects drift', async () => {
    db = await createReleaseBatchFixture();
    await db.exec('CREATE POLICY unreviewed_import_write ON skillspace_import_jobs FOR UPDATE USING(true)');
    await expect(db.exec(await read('release-transaction.sql'))).rejects.toThrow('unexpected permissive policies');
    await assertRolledBack();
  }, 30000);
  it('rejects modified embedded source before applying DDL', async () => {
    db = await createReleaseBatchFixture();
    const batch = (await read('release-transaction.sql')).replace('Stable external event identity.', 'Tampered external event identity.');
    await expect(db.exec(batch)).rejects.toThrow('Source hash mismatch');
    await assertRolledBack();
  }, 30000);
  it('rolls back postpaid and earlier migrations when the tenth scheduler migration detects command drift',async()=>{
    db=await createReleaseBatchFixture();
    await db.exec("UPDATE cron.job SET command=replace(command,'Bearer eyJ.fixture.signature','Bearer changed') WHERE jobname='check-subscription-expiry-daily'");
    await expect(db.exec(await read('release-transaction.sql'))).rejects.toThrow('Unexpected billing scheduler headers');
    await assertRolledBack();
  },30000);
  it('rejects a missing canonical access helper before applying DDL', async () => {
    db = await createReleaseBatchFixture();
    await db.exec('DROP FUNCTION public.can_access_organization(uuid,text)');
    await expect(db.exec(await read('release-transaction.sql'))).rejects.toThrow('prerequisite functions missing');
    await assertRolledBack();
  }, 30000);
});
