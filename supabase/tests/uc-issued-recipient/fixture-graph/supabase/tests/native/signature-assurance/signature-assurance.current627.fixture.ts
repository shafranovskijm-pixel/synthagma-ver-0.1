/**
 * Source-only native composition adapter: genuine K/ER624 -> exact S3H ->
 * exact AD04 -> exact SA RAW COMMIT. Its consumer must execute a meaningful
 * native case; this file is not a new test result, production dump or ledger stamp.
 */
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fixture as genuine624S3Fixture, dataDigests, metadata, one } from '../frdo-packets/frdo-packets.fixture';
import { installActualLegacy623 } from './signature-assurance.actual623';
import { installActualFullAuthRoles } from './signature-assurance.auth-roles-full';

export const CURRENT627_AD04_SHA256 = 'ee576263d36af214593ed2d2f51da762c6f5f8bc8003d8915ebf41c125f75c77';
export const CURRENT627_SA_RAW_COMMIT_SHA256 = 'e60d036966a657ae61a3563daa513d41d0ff8af207fbe2419785f7ebcbeadf44';
const AD04_SIGNATURE = 'public.uc_observe_admission_sealed_object(uuid,uuid,uuid,bigint,uuid)';
const digest = (raw: Uint8Array): string => createHash('sha256').update(raw).digest('hex');
const source = (value: unknown, expected: string, expectedBytes: number): { path: string; raw: Buffer } => {
  const ref = value as { path?: unknown; sha256?: unknown } | null;
  if (!ref || typeof ref.path !== 'string' || ref.sha256 !== expected) throw new Error('Exact held native dependency reference is required');
  const raw = readFileSync(ref.path);
  if (raw.length !== expectedBytes || digest(raw) !== expected) throw new Error('Native dependency raw bytes differ');
  return { path: ref.path, raw };
};

export async function installedCurrent627SignatureAssuranceFixture() {
  const profile = process.env.UC116_NATIVE_PROFILE, output = process.env.UC116_NATIVE_OUTPUT;
  if (!profile || !output) throw new Error('Owned native profile and output paths are required');
  const contract = JSON.parse(readFileSync(join(profile, 'profile-contract.json'), 'utf8'));
  const ad04 = source(contract.committedAD04Observation, CURRENT627_AD04_SHA256, 5830);
  const assurance = source(contract.committedAssuranceSource, CURRENT627_SA_RAW_COMMIT_SHA256, 558258);
  const c = await genuine624S3Fixture();
  try {
    const db = c.db;
    await db.exec('RESET ROLE');
    await installActualLegacy623(db);
    await installActualFullAuthRoles(db);
    if ((await one<any>(db, 'SELECT to_regprocedure($1) IS NOT NULL AS present', [AD04_SIGNATURE])).present) throw new Error('AD04 must be a new native dependency, never overwrite an existing helper');
    const beforeRows = await dataDigests(db), beforeMeta = await metadata(db);
    // Exact 5830 bytes, including their own transaction. No newline normalization or SQL replacement.
    await db.exec(ad04.raw.toString('utf8'));
    const afterRows = await dataDigests(db), afterMeta = await metadata(db);
    if (JSON.stringify(beforeRows) !== JSON.stringify(afterRows)) throw new Error('AD04 changed existing native rowsets');
    for (const old of beforeMeta.functions) {
      const fresh = afterMeta.functions.find((row: any) => row.signature === old.signature);
      if (!fresh || JSON.stringify(old.metadata) !== JSON.stringify(fresh.metadata) || old.source_md5 !== fresh.source_md5) throw new Error('AD04 changed an existing function or its authority');
    }
    for (const field of ['roles', 'defaults', 'memberships', 'settings']) if (JSON.stringify(beforeMeta[field]) !== JSON.stringify(afterMeta[field])) throw new Error('AD04 changed native authority settings');
    const newFunctions = afterMeta.functions.filter((row: any) => !beforeMeta.functions.some((old: any) => old.signature === row.signature));
    if (newFunctions.length !== 1) throw new Error('AD04 must add exactly one private helper');
    const ad04Authority = await one<any>(db, `SELECT md5(p.prosrc) body_md5,p.prosecdef,
      (SELECT array_agg(DISTINCT CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END ORDER BY CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END)
       FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner)))a)direct_grantees,
      has_function_privilege('anon',p.oid,'EXECUTE')anon_execute,
      has_function_privilege('authenticated',p.oid,'EXECUTE')authenticated_execute,
      has_function_privilege('service_role',p.oid,'EXECUTE')service_execute
      FROM pg_proc p WHERE p.oid=$1::regprocedure`, [AD04_SIGNATURE]);
    if (ad04Authority.body_md5 !== 'fb8ccb916499ee1bd25e8f88a263a6ac' || ad04Authority.prosecdef !== true
      || JSON.stringify(ad04Authority.direct_grantees) !== JSON.stringify(['postgres', 'service_role'])
      || ad04Authority.anon_execute !== false || ad04Authority.authenticated_execute !== false || ad04Authority.service_execute !== true) throw new Error('AD04 exact body or private service authority differs');
    // Exact 558258 native-tested COMMIT bytes, not the Git LF derivative or a runtime rewritten statement.
    await db.exec(assurance.raw.toString('utf8'));
    const pins = await one<any>(db, `SELECT jsonb_object_agg(proname,md5(prosrc)) hashes FROM pg_proc WHERE oid=ANY(ARRAY[
      'public.uc_scoped_journal_personal_counts(uuid)'::regprocedure,'public.uc_scoped_journal_erase_user(uuid)'::regprocedure,
      'public.account_deletion_snapshot(uuid)'::regprocedure,'public.account_deletion_files(uuid)'::regprocedure,
      'public.uc_observe_admission_sealed_object(uuid,uuid,uuid,bigint,uuid)'::regprocedure])`);
    const expected = { uc_scoped_journal_personal_counts: 'f872b733e7d0a250f3e515ff79674954',
      uc_scoped_journal_erase_user: '63f8f5ae9532646019c90426cb82f5bf', account_deletion_snapshot: '815ae5f75348649363ff405e1747ba79',
      account_deletion_files: '4122f51e3c2349b643a9c024e9ff96e0', uc_observe_admission_sealed_object: 'fb8ccb916499ee1bd25e8f88a263a6ac' };
    if (Object.keys(pins.hashes ?? {}).length !== 5 || Object.entries(expected).some(([name, md5]) => pins.hashes[name] !== md5)) throw new Error('Current627 privacy/AD04 body postimages differ');
    const installed = { scope: 'Genuine K/ER624+S3H -> exact AD04 -> exact SA RAW COMMIT; no cloud Auth/StorageHTTP or production dump claim',
      ad04: { path: ad04.path, sha256: CURRENT627_AD04_SHA256, bytes: 5830, allOldRowsPreserved: true, allOldFunctionAuthorityPreserved: true, authority: ad04Authority },
      assurance: { path: assurance.path, sha256: CURRENT627_SA_RAW_COMMIT_SHA256, bytes: 558258, crlfPairs: assurance.raw.toString('utf8').split('\r\n').length - 1 },
      currentPrivacyBodies: pins.hashes, migrationLedgerStamped: false, actualNativeAcceptanceFromThisAdapter: false };
    writeFileSync(join(output, 'current627-composed-foundation-' + db.native.name + '.json'), JSON.stringify(installed, null, 2) + '\n');
    return Object.assign(c, { current627Installed: installed });
  } catch (error) { await c.db.close(); throw error; }
}
