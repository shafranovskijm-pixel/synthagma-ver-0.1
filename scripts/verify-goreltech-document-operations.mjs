// Actual PostgreSQL/PGlite execution of the new migration and the retained batch
// RPC. Schema/identity helpers are isolated fixtures, NOT production auth proof.
// node scripts/verify-goreltech-document-operations.mjs D:/.../@electric-sql/pglite/dist/index.js
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const modulePath = process.argv[2] ? resolve(process.argv[2]) : null;
const { PGlite } = await import(modulePath ? pathToFileURL(modulePath).href : "@electric-sql/pglite");
const packageVersion = modulePath
  ? JSON.parse(readFileSync(resolve(modulePath, "../../package.json"), "utf8")).version : "see installed package";
const db = new PGlite();
const ids = Object.fromEntries([
  "owner", "writer", "reader", "outsider", "admin", "nullHelper", "group", "otherGroup", "foreignGroup",
  "foreignOrg", "operation", "secondOperation", "transactionOperation", "failingOperation", "invalidOperation", "ownerOperation",
].map((key, i) => [key, `00000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`]));
ids.org = "7237f9d4-3670-4a19-8946-a43c68fd3473";
const getSignature = "public.get_goreltech_document_operation(uuid,uuid,uuid,uuid)";
const saveSignature = "public.create_goreltech_group_document_batch_once(uuid,uuid,uuid,uuid,jsonb,text[])";
let passed = 0;
const pass = label => { passed++; console.log(`PASS ${label}`); };
async function rejects(label, action, code) {
  await assert.rejects(action, error => error.code === code);
  pass(label);
}
async function service() {
  await db.exec("RESET ROLE; SET ROLE service_role; SELECT set_config('request.jwt.claim.role', 'service_role', false)");
}
async function ownerSql(sql) {
  await db.exec("RESET ROLE");
  try { return await db.exec(sql); } finally { await db.exec("SET ROLE service_role"); }
}
async function counts() {
  await db.exec("RESET ROLE");
  try {
    return (await db.query(`SELECT
      (SELECT count(*)::int FROM public.group_documents) AS documents,
      (SELECT count(*)::int FROM public.group_documents WHERE is_current) AS current,
      (SELECT count(*)::int FROM public.goreltech_document_operations) AS receipts`)).rows[0];
  } finally { await db.exec("SET ROLE service_role"); }
}
function docs(group = ids.group, marker = "original") {
  return ["enrollment_order", "expulsion_order", "student_list", "class_journal", "schedule",
    "attestation_sheet", "registration_book", "title_page", "pass"].map(type => ({
    doc_type: type, name: `${marker}:${type}`, document_date: "2026-09-04",
    doc_status: "draft", fill_mode: "data", layout_format: "docx_ooxml",
    file_path: `organizations/${ids.org}/group-documents/${group}/${marker}-${type}.docx`,
    docx_sha256: `${marker}-${type}-hash`, template_version_label: "1.2.0-client-source",
    variables: {}, variables_snapshot: { source: "test_fixture" },
  }));
}
async function save(overrides = {}) {
  const p = { actor: ids.writer, org: ids.org, group: ids.group, operation: ids.operation,
    docs: docs(), warnings: ["Исходное предупреждение"], ...overrides };
  const result = await db.query(`SELECT public.create_goreltech_group_document_batch_once(
    $1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::jsonb,$6::text[]) AS receipt`,
    [p.actor, p.org, p.group, p.operation, p.docs === null ? null : JSON.stringify(p.docs), p.warnings]);
  return result.rows[0].receipt;
}
async function get(overrides = {}) {
  const p = { actor: ids.writer, org: ids.org, group: ids.group, operation: ids.operation, ...overrides };
  return (await db.query(`SELECT public.get_goreltech_document_operation($1::uuid,$2::uuid,$3::uuid,$4::uuid) AS receipt`,
    [p.actor, p.org, p.group, p.operation])).rows[0].receipt;
}

try {
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role; CREATE SCHEMA auth;
    CREATE TYPE public.app_role AS ENUM ('admin','user');
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT NULL::uuid $$;
    CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$
      SELECT jsonb_build_object('role', current_setting('request.jwt.claim.role', true))
    $$;
    CREATE TABLE public.fixture_permissions(actor uuid, organization uuid, permission text);
    CREATE FUNCTION public.has_role(actor uuid, requested public.app_role) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
      SELECT CASE WHEN actor='${ids.nullHelper}'::uuid THEN NULL
        ELSE actor='${ids.admin}'::uuid AND requested='admin'::public.app_role END
    $$;
    CREATE FUNCTION public.is_org_owner(actor uuid, organization uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
      SELECT CASE WHEN actor='${ids.nullHelper}'::uuid THEN NULL
        ELSE actor='${ids.owner}'::uuid AND organization='${ids.org}'::uuid END
    $$;
    CREATE FUNCTION public.has_org_staff_permission(who uuid, org uuid, requested text) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
      SELECT CASE WHEN who='${ids.nullHelper}'::uuid THEN NULL ELSE EXISTS (
        SELECT 1 FROM public.fixture_permissions p
        WHERE p.actor=who AND p.organization=org AND p.permission=requested
      ) END
    $$;
    CREATE TABLE public.organizations(id uuid PRIMARY KEY, inn text, name text);
    CREATE TABLE public.org_staff (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL,
      user_id uuid NOT NULL, expires_at timestamptz,
      UNIQUE (organization_id, user_id)
    );
    CREATE TABLE public.student_groups(id uuid PRIMARY KEY, organization_id uuid NOT NULL);
    CREATE TABLE public.group_documents (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL,
      group_id uuid NOT NULL REFERENCES public.student_groups(id) ON DELETE CASCADE,
      doc_type text NOT NULL, name text NOT NULL, document_number text, document_date date,
      variables jsonb, html text, file_path text, status text, doc_status text, fill_mode text,
      layout_format text, source_note text, student_user_id uuid, company_id uuid,
      package_batch_id uuid, package_version integer, is_current boolean, created_by uuid,
      template_registry_key text, template_version_label text, template_sha256 text,
      variables_snapshot jsonb, docx_sha256 text, pdf_status text, generation_status text,
      created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now()
    );
    INSERT INTO public.organizations VALUES ('${ids.org}','7806541216','ООО ИЦ ГОРЭЛТЕХ'),
      ('${ids.foreignOrg}','7806541216','ГОРЭЛТЕХ foreign UUID');
    INSERT INTO public.student_groups VALUES ('${ids.group}','${ids.org}'),
      ('${ids.otherGroup}','${ids.org}'), ('${ids.foreignGroup}','${ids.foreignOrg}');
    INSERT INTO public.fixture_permissions VALUES ('${ids.writer}','${ids.org}','documents.manage'),
      ('${ids.reader}','${ids.org}','documents.read');
    INSERT INTO public.org_staff (organization_id,user_id,expires_at) VALUES
      ('${ids.org}','${ids.writer}',NULL), ('${ids.org}','${ids.reader}',NULL);
    GRANT USAGE ON SCHEMA public,auth TO anon,authenticated,service_role;
  `);
  // Execute the real existing RPC, triggers, and current-version unique index;
  // the new wrapper is not tested against a fake batch implementation.
  const existing = readFileSync(new URL("../supabase/migrations/20260902141149_f6ca4d7b-d95c-4a00-ad7c-b29e85b40e46.sql", import.meta.url), "utf8");
  const migration = readFileSync(new URL("../supabase/migrations/20260904160000_goreltech_document_operations.sql", import.meta.url), "utf8");
  await db.exec(`BEGIN; ${existing} ${migration} COMMIT;`);
  const version = (await db.query("SELECT version() AS version")).rows[0].version;
  const rls = (await db.query(`SELECT relrowsecurity AS enabled,
    (SELECT count(*)::int FROM pg_policies WHERE schemaname='public' AND tablename='goreltech_document_operations') AS policies
    FROM pg_class WHERE oid='public.goreltech_document_operations'::regclass`)).rows[0];
  assert.deepEqual(rls, { enabled: true, policies: 0 }); pass("receipt RLS enabled with no direct-access policies");
  for (const role of ["anon", "authenticated", "service_role"]) {
    const p = (await db.query(`SELECT has_function_privilege($1,$2,'EXECUTE') AS get,
      has_function_privilege($1,$3,'EXECUTE') AS save,
      has_table_privilege($1,'public.goreltech_document_operations','SELECT') AS read,
      has_table_privilege($1,'public.goreltech_document_operations','INSERT,UPDATE,DELETE') AS write`,
      [role, getSignature, saveSignature])).rows[0];
    assert.deepEqual(p, { get: role === "service_role", save: role === "service_role", read: false, write: false });
    pass(`${role} exact RPC/table privileges`);
  }
  await service();
  assert.equal(await get(), null); pass("unknown receipt is null before any save");
  assert.deepEqual(await counts(), { documents: 0, current: 0, receipts: 0 });
  const first = await save();
  assert.deepEqual(Object.keys(first).sort(), ["batch", "document", "operationId", "warnings"]);
  assert.equal(first.operationId, ids.operation); assert.ok(first.batch.batch_id);
  assert.deepEqual({ version: first.batch.batch_version, count: first.batch.inserted_count }, { version: 1, count: 9 });
  assert.deepEqual(first.document, {
    doc_type: "class_journal", name: "original:class_journal",
    file_path: `organizations/${ids.org}/group-documents/${ids.group}/original-class_journal.docx`,
    docx_sha256: "original-class_journal-hash", pdf_status: "unavailable", template_version_label: "1.2.0-client-source",
  });
  assert.deepEqual(first.warnings, ["Исходное предупреждение"]);
  assert.deepEqual(await counts(), { documents: 9, current: 9, receipts: 1 });
  pass("first save commits actual nine-document batch and persisted canonical receipt");
  assert.deepEqual(await get(), first); pass("get returns the committed original receipt");
  pass("staff with null expiry can create and retrieve an operation");
  await ownerSql(`UPDATE public.org_staff SET expires_at=now()+interval '1 day' WHERE user_id='${ids.writer}'`);
  assert.deepEqual(await get(), first); assert.deepEqual(await save(), first);
  pass("staff with future expiry can retrieve and replay an existing operation");
  await db.exec("BEGIN");
  try {
    const future = await save({ operation: ids.transactionOperation });
    assert.equal(future.batch.batch_version, 2);
    assert.deepEqual(await get({ operation: ids.transactionOperation }), future);
  } finally { await db.exec("ROLLBACK"); }
  pass("staff with future expiry can create a fresh batch and receipt");
  await ownerSql(`UPDATE public.org_staff SET expires_at='2000-01-01' WHERE user_id='${ids.writer}'`);
  await rejects("expired staff cannot retrieve existing receipt despite helper permission", () => get(), "42501");
  await rejects("expired staff cannot replay existing receipt despite helper permission", () => save(), "42501");
  await rejects("expired staff cannot lookup a new operation", () => get({ operation: ids.transactionOperation }), "42501");
  await rejects("expired staff cannot create a new operation", () => save({ operation: ids.transactionOperation }), "42501");
  await ownerSql(`DELETE FROM public.org_staff WHERE user_id='${ids.writer}'`);
  await rejects("permission helper alone without staff row cannot retrieve receipt", () => get(), "42501");
  await rejects("permission helper alone without staff row cannot replay receipt", () => save(), "42501");
  await rejects("permission helper alone without staff row cannot create batch", () => save({ operation: ids.transactionOperation }), "42501");
  await ownerSql(`INSERT INTO public.org_staff(organization_id,user_id,expires_at) VALUES ('${ids.foreignOrg}','${ids.writer}',NULL)`);
  await rejects("staff row in another organization cannot retrieve receipt", () => get(), "42501");
  await rejects("staff row in another organization cannot create batch", () => save({ operation: ids.transactionOperation }), "42501");
  await ownerSql(`UPDATE public.org_staff SET organization_id='${ids.org}' WHERE user_id='${ids.writer}'`);
  assert.deepEqual(await counts(), { documents: 9, current: 9, receipts: 1 });
  assert.deepEqual(await get(), first);
  pass("expiry/no-row denials caused no document or receipt mutations; active staff restored");
  assert.deepEqual(await save({ docs: docs(ids.group, "changed"), warnings: ["Новое предупреждение"] }), first);
  assert.deepEqual(await counts(), { documents: 9, current: 9, receipts: 1 });
  pass("replay ignores changed document body/warnings without a second batch");
  assert.deepEqual(await save({ docs: null, warnings: [null] }), first);
  pass("replay does not revalidate later invalid body instead of returning original receipt");
  await rejects("same operation cannot be read by a different permitted actor", () => get({ actor: ids.owner }), "42501");
  await rejects("same operation cannot be replayed by a different permitted actor", () => save({ actor: ids.owner }), "42501");
  assert.deepEqual(await counts(), { documents: 9, current: 9, receipts: 1 });
  for (const actor of [null, ids.reader, ids.outsider, ids.nullHelper]) {
    await rejects(`get unauthorized/null-helper actor ${actor}`, () => get({ actor }), "42501");
    await rejects(`save unauthorized/null-helper actor ${actor}`, () => save({ actor }), "42501");
  }
  await ownerSql(`DELETE FROM public.fixture_permissions WHERE actor='${ids.writer}'`);
  await rejects("revoked permission checked again before get", () => get(), "42501");
  await rejects("revoked permission checked again before replay", () => save(), "42501");
  await ownerSql(`INSERT INTO public.fixture_permissions VALUES ('${ids.writer}','${ids.org}','documents.manage')`);
  for (const change of [
    { actor: ids.admin, org: ids.foreignOrg, group: ids.foreignGroup },
    { actor: ids.admin, org: null }, { actor: ids.admin, group: ids.foreignGroup },
    { actor: ids.admin, group: null },
  ]) {
    await rejects(`get rejects tenant/group ${JSON.stringify(change)}`, () => get(change), "42501");
    await rejects(`save rejects tenant/group ${JSON.stringify(change)}`, () => save(change), "42501");
  }
  for (const column of ["inn", "name"]) {
    await ownerSql(`UPDATE public.organizations SET ${column}='incorrect' WHERE id='${ids.org}'`);
    await rejects(`get rechecks exact organization ${column}`, () => get({ actor: ids.admin }), "42501");
    await rejects(`save rechecks exact organization ${column}`, () => save({ actor: ids.admin }), "42501");
    await ownerSql(`UPDATE public.organizations SET inn='7806541216',name='ООО ИЦ ГОРЭЛТЕХ' WHERE id='${ids.org}'`);
  }
  await rejects("get requires operation UUID", () => get({ operation: null }), "22023");
  await rejects("save requires operation UUID", () => save({ operation: null }), "22023");
  for (const role of ["anon", "authenticated", "service_role"]) {
    await db.exec(`RESET ROLE; SET ROLE ${role}`);
    for (const action of ["SELECT * FROM public.goreltech_document_operations", "INSERT INTO public.goreltech_document_operations DEFAULT VALUES",
      "UPDATE public.goreltech_document_operations SET created_at=now()", "DELETE FROM public.goreltech_document_operations"])
      await rejects(`${role} direct ${action.split(" ")[0]} denied`, () => db.exec(action), "42501");
    if (role !== "service_role") {
      // A spoofed claim must not replace the SQL EXECUTE privilege boundary.
      await db.exec("SELECT set_config('request.jwt.claim.role','service_role',false)");
      await rejects(`${role} cannot invoke get with spoofed service claim`, () => get(), "42501");
      await rejects(`${role} cannot invoke save with spoofed service claim`, () => save(), "42501");
    }
  }
  await service();
  await db.exec("SELECT set_config('request.jwt.claim.role','authenticated',false)");
  await rejects("get checks runtime service JWT", () => get(), "42501");
  await rejects("save checks runtime service JWT", () => save(), "42501");
  await service();
  const before = await counts();
  await db.exec("BEGIN");
  try {
    const pending = await save({ operation: ids.transactionOperation, docs: docs(ids.group, "rolled-back") });
    assert.deepEqual(await get({ operation: ids.transactionOperation }), pending);
    assert.equal(pending.batch.batch_version, 2);
  } finally { await db.exec("ROLLBACK"); }
  assert.deepEqual(await counts(), before);
  assert.equal(await get({ operation: ids.transactionOperation }), null);
  pass("explicit transaction rollback removes batch and receipt and restores prior-current flags");
  await ownerSql(`
    CREATE FUNCTION public.fixture_receipt_failure() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN IF NEW.operation_id='${ids.failingOperation}'::uuid THEN
      RAISE EXCEPTION 'fixture receipt write failure' USING ERRCODE='P0001'; END IF; RETURN NEW; END $$;
    CREATE TRIGGER fixture_receipt_failure BEFORE INSERT ON public.goreltech_document_operations
    FOR EACH ROW EXECUTE FUNCTION public.fixture_receipt_failure();
  `);
  await rejects("receipt insert failure propagates instead of reporting success", () => save({ operation: ids.failingOperation }), "P0001");
  assert.deepEqual(await counts(), before); assert.equal(await get({ operation: ids.failingOperation }), null);
  assert.deepEqual(await get(), first);
  pass("receipt failure rolls back actual batch inserts AND previous-version UPDATE atomically");
  await ownerSql("DROP TRIGGER fixture_receipt_failure ON public.goreltech_document_operations; DROP FUNCTION public.fixture_receipt_failure()");
  const invalidDocs = docs(); invalidDocs[4].document_date = "not-a-date";
  await rejects("underlying real batch error rolls back without receipt", () => save({ operation: ids.invalidOperation, docs: invalidDocs }), "22007");
  assert.deepEqual(await counts(), before); assert.equal(await get({ operation: ids.invalidOperation }), null);
  pass("failed nested batch leaves no new documents, receipt, or superseded current flags");
  await rejects("new-operation null warning rejected", () => save({ operation: ids.secondOperation, warnings: [null] }), "22023");
  const second = await save({ operation: ids.secondOperation, docs: docs(ids.group, "second"), warnings: null });
  assert.equal(second.batch.batch_version, 2); assert.deepEqual(second.warnings, []);
  assert.notEqual(second.batch.batch_id, first.batch.batch_id);
  assert.deepEqual(await counts(), { documents: 18, current: 9, receipts: 2 });
  assert.deepEqual(await save(), first); assert.deepEqual(await get(), first);
  pass("distinct operation makes next version; old receipt remains original after superseding package");
  const otherGroup = await save({ group: ids.otherGroup, docs: docs(ids.otherGroup), warnings: [] });
  assert.equal(otherGroup.operationId, first.operationId); assert.equal(otherGroup.batch.batch_version, 1);
  assert.notEqual(otherGroup.batch.batch_id, first.batch.batch_id);
  assert.deepEqual(await get({ group: ids.otherGroup }), otherGroup);
  pass("same UUID in another authorized group is a separate scoped operation");
  const ownerReceipt = await save({ actor: ids.owner, operation: ids.ownerOperation });
  assert.equal(ownerReceipt.batch.batch_version, 3);
  pass("organization owner can initiate their own operation without staff permission fixture");
  await db.exec("BEGIN");
  try {
    const adminReceipt = await save({ actor: ids.admin, operation: ids.transactionOperation });
    assert.equal(adminReceipt.batch.batch_version, 4);
    assert.deepEqual(await get({ actor: ids.admin, operation: ids.transactionOperation }), adminReceipt);
  } finally { await db.exec("ROLLBACK"); }
  pass("administrator can create and retrieve their own operation without staff row");
  // PGlite serializes calls on one connection. This checks replay for multiple
  // queued invocations, not simultaneous lock waiting across PG sessions.
  const beforeQueued = await counts();
  const queued = await Promise.all(Array.from({ length: 5 }, () => save()));
  assert.ok(queued.every(value => JSON.stringify(value) === JSON.stringify(first)));
  assert.deepEqual(await counts(), beforeQueued);
  pass("five queued same-intent retries return original receipt without additional writes");
  await ownerSql(`UPDATE public.goreltech_document_operations SET created_at='2000-01-01' WHERE operation_id='${ids.operation}'`);
  assert.deepEqual(await get(), first); pass("old receipt is not expired or regenerated");
  await ownerSql(`DELETE FROM public.student_groups WHERE id='${ids.otherGroup}'`);
  await rejects("get denies access after group no longer exists", () => get({ group: ids.otherGroup }), "42501");
  await db.exec("RESET ROLE");
  assert.equal((await db.query("SELECT count(*)::int AS count FROM public.goreltech_document_operations WHERE group_id=$1", [ids.otherGroup])).rows[0].count, 1);
  pass("group deletion preserves durable receipt evidence without cascading deletion");
  console.log(JSON.stringify({ passed, pgliteVersion: packageVersion, postgresVersion: version,
    existingBatchRpc: "executed unmodified migration 20260902141149", identityHelpers: "isolated fixtures",
    parallelDatabaseSessions: "not tested: PGlite single connection", productionVerified: false }));
} finally { await db.close(); }
