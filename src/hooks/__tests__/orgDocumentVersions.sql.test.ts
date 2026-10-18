// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
const id = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12,"0")}`;
const read = (p: string) => readFile(new URL(`../../../${p}`, import.meta.url), "utf8");
let db: PGlite;
const actor = async (n: number) => {
  await db.exec("RESET ROLE");
  await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)", [id(n)]);
  await db.exec("SET ROLE authenticated");
};
const path = (doc=900,request=901,org=100) => `${id(org)}/versions/${id(doc)}/${id(request)}.pdf`;
const upload = (doc=900,request=901,org=100) => ({ file_path: path(doc,request,org),
  file_url: "https://example.supabase.co/storage/v1/object/public/org-documents/"+path(doc,request,org),
  file_name: "document.pdf", file_size: 10, change_summary: null });
const save = (options: {doc?: number; request?: number; org?: number; revision?: number; restore?: string; patch?: unknown; file?: unknown}={}) => {
  const {doc=900,request=901,org=100,revision=0,restore,patch={}}=options;
  return db.query<{result:any}>("SELECT public.commit_org_document_version($1,$2,$3,$4,$5::jsonb,$6,$7::jsonb) AS result",
    [id(doc),id(org),id(request),revision,restore?null:JSON.stringify(options.file??upload(doc,request,org)),restore??null,JSON.stringify(patch)]);
};
const staged = async (doc=900,request=901,org=100) => {
  await db.exec("RESET ROLE");
  await db.query("INSERT INTO storage.objects(bucket_id,name) VALUES('org-documents',$1)",[path(doc,request,org)]);
  await actor(1);
};
beforeAll(async () => {
  db=new PGlite();
  await db.exec("BEGIN");
  await db.exec(await read("docs/releases/sintagma-production/staff-workspace-20261012/synthetic-fixture.sql"));
  await db.exec(`CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$ SELECT jsonb_build_object('iss','https://example.supabase.co/auth/v1') $$;`);
  for(const [file,name] of [
    ["20260422090402_7a17f4ca-e3ae-47cb-866e-670fd82dc4ec.sql","org_role_default_permissions"],
    ["20260422090332_1856ddfd-409c-45c8-8ee1-2acc959c793e.sql","get_org_staff_permissions"],
    ["20260728072432_172e4e18-e52e-495d-b1ff-d3e5d3c04b9d.sql","normalize_org_staff_permission"],
    ["20260728072432_172e4e18-e52e-495d-b1ff-d3e5d3c04b9d.sql","has_org_staff_permission"],
    ["20260822122025_6be7e00b-82ec-44a9-8476-fac0e09cdd0c.sql","can_access_organization"],
  ]) {
    const sql=await read("supabase/migrations/"+file);
    const fn=sql.match(new RegExp(`CREATE OR REPLACE FUNCTION public\\.${name}\\([\\s\\S]*?AS\\s+(\\$[^$]*\\$)[\\s\\S]*?\\1;`,"i"))?.[0];
    expect(fn,name).toBeTruthy(); await db.exec(fn!);
  }
  await db.exec(`
    ALTER TABLE profiles ADD COLUMN full_name text;
    CREATE TABLE org_documents(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),organization_id uuid REFERENCES organizations,
      name text NOT NULL,type text NOT NULL,file_url text,status text DEFAULT 'active',issue_date date,expires_at date,
      responsible_person text,reminder_sent_at timestamptz,deleted_at timestamptz,created_at timestamptz DEFAULT now(),updated_at timestamptz DEFAULT now());
    ALTER TABLE org_documents ENABLE ROW LEVEL SECURITY;
    CREATE POLICY docs_read ON org_documents FOR SELECT TO authenticated USING(can_access_organization(organization_id,'documents.read') AND account_deletion_access_allowed());
    CREATE POLICY docs_write ON org_documents FOR ALL TO authenticated USING(can_access_organization(organization_id,'documents.write') AND account_deletion_access_allowed()) WITH CHECK(can_access_organization(organization_id,'documents.write') AND account_deletion_access_allowed());
    CREATE SCHEMA storage;
    CREATE TABLE storage.objects(id uuid DEFAULT gen_random_uuid(),bucket_id text,name text,metadata jsonb DEFAULT '{"size":10,"eTag":"actual-etag","mimetype":"application/pdf"}',UNIQUE(bucket_id,name));
    ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
    CREATE POLICY storage_fixture_access ON storage.objects FOR ALL TO authenticated USING(true) WITH CHECK(true);
    GRANT USAGE ON SCHEMA storage TO authenticated;
    GRANT ALL ON storage.objects TO authenticated;
    GRANT SELECT,INSERT,UPDATE,DELETE ON org_documents TO authenticated;
  `);
  const original=await read("supabase/migrations/20260422083830_b410b491-9d30-48d4-9ccb-50b57ca03698.sql");
  await db.exec(original.slice(0,original.indexOf("-- Таблица публичных")));
  await db.exec("COMMIT");
  await db.exec(await read("supabase/migrations/20261018102000_uc_document_versions.sql"));
},30000);
beforeEach(async()=>{
  await db.exec("RESET ROLE; TRUNCATE org_documents CASCADE; TRUNCATE storage.objects; TRUNCATE org_document_write_tokens;");
  await db.exec("ALTER TABLE org_documents DISABLE TRIGGER uc_document_initial_snapshot");
  await db.query("INSERT INTO org_documents(id,organization_id,name,type,file_url) VALUES($1,$2,'Legacy','license','https://example.supabase.co/storage/v1/object/public/org-documents/old.pdf')",[id(900),id(100)]);
  await db.exec("ALTER TABLE org_documents ENABLE TRIGGER uc_document_initial_snapshot");
  await staged();
});
afterAll(async()=>{await db?.close();});

describe("UC006 actual SQL version transactions",()=>{
  it("saves a truthful baseline and new version atomically, with current pointer",async()=>{
    const result=(await save()).rows[0].result;
    expect(result).toMatchObject({revision:1,version_number:2,replayed:false});
    const rows=await db.query<any>("SELECT event_kind,file_url,uploaded_by,created_at FROM org_document_versions ORDER BY version_number");
    expect(rows.rows.map(r=>r.event_kind)).toEqual(["baseline","upload"]);
    expect(rows.rows[0].file_url).toContain("old.pdf");
    expect(rows.rows[0].uploaded_by).toBe(id(1));
    expect((await db.query<any>("SELECT document_revision,current_version_id,file_url FROM org_documents")).rows[0]).toMatchObject({document_revision:1,current_version_id:result.version_id,file_url:upload().file_url});
  });
  it("replays an uncertain completed request once without another upload or revision",async()=>{
    const first=(await save()).rows[0].result;
    expect((await save()).rows[0].result).toEqual({...first,replayed:true});
    expect((await db.query<any>("SELECT count(*)::int AS count FROM org_document_versions")).rows[0].count).toBe(2);
    await expect(save({patch:{name:"different"}})).rejects.toMatchObject({code:"22023"});
  });
  it("canonicalizes the URL from verified issuer and records actual storage metadata",async()=>{
    await save({file:{...upload(),file_url:'https://attacker.example/storage/v1/object/public/org-documents/'+path()}});
    const row=(await db.query<any>("SELECT file_url,file_size,storage_object_id,storage_metadata FROM org_document_versions WHERE event_kind='upload'")).rows[0];
    expect(row.file_url).toBe(upload().file_url);
    expect(row.file_size).toBe(10);
    expect(row.storage_object_id).toBeTruthy();
    expect(row.storage_metadata).toEqual({size:10,etag:'actual-etag',mimetype:'application/pdf'});
  });
  it("rejects mismatched size without modifying the document",async()=>{
    await expect(save({file:{...upload(),file_size:999}})).rejects.toMatchObject({code:'22023'});
    expect((await db.query<any>("SELECT count(*)::int AS count FROM org_document_versions")).rows[0].count).toBe(0);
  });
  it("rejects a stale concurrent writer while retaining the winner and both staged blobs",async()=>{
    await staged(900,902);
    const outcomes=await Promise.allSettled([save(),save({request:902})]);
    expect(outcomes.filter(r=>r.status==="fulfilled")).toHaveLength(1);
    expect(outcomes.filter(r=>r.status==="rejected")).toHaveLength(1);
    expect((outcomes.find(r=>r.status==="rejected") as PromiseRejectedResult).reason.code).toBe("40001");
    expect((await db.query<any>("SELECT count(*)::int AS count FROM storage.objects")).rows[0].count).toBe(2);
  });
  it("restoring creates a new immutable event and preserves previous versions",async()=>{
    await save();
    const baseline=(await db.query<any>("SELECT id FROM org_document_versions WHERE event_kind='baseline'")).rows[0].id;
    const restored=(await save({request:903,revision:1,restore:baseline})).rows[0].result;
    expect(restored).toMatchObject({revision:2,version_number:3});
    expect((await db.query<any>("SELECT file_url FROM org_documents")).rows[0].file_url).toContain("old.pdf");
    expect((await db.query<any>("SELECT event_kind,restored_from_version_id FROM org_document_versions WHERE id=$1",[restored.version_id])).rows[0]).toEqual({event_kind:"restore",restored_from_version_id:baseline});
  });
  it("missing staged file and invalid metadata leave prior file and version history unchanged",async()=>{
    await expect(save({request:999})).rejects.toMatchObject({code:"22023"});
    await expect(save({patch:{issue_date:"2026-10-18",expires_at:"2026-10-01"}})).rejects.toMatchObject({code:"22023"});
    expect((await db.query<any>("SELECT count(*)::int AS count FROM org_document_versions")).rows[0].count).toBe(0);
    expect((await db.query<any>("SELECT file_url FROM org_documents")).rows[0].file_url).toContain("old.pdf");
  });
  it("a failure after version insert rolls the entire pointer/version transaction back",async()=>{
    await db.exec("RESET ROLE");
    await db.exec("ALTER TABLE org_documents ADD CONSTRAINT simulated_failure CHECK (name<>'reject')");
    await actor(1);
    await expect(save({patch:{name:"reject"}})).rejects.toMatchObject({code:"23514"});
    expect((await db.query<any>("SELECT count(*)::int AS count FROM org_document_versions")).rows[0].count).toBe(0);
    expect((await db.query<any>("SELECT file_url FROM org_documents")).rows[0].file_url).toContain("old.pdf");
    await db.exec("RESET ROLE; ALTER TABLE org_documents DROP CONSTRAINT simulated_failure");
  });
  it("preserves null metadata edits and refuses deleted records",async()=>{
    await db.query("UPDATE org_documents SET expires_at='2027-01-01',responsible_person='Old' WHERE id=$1",[id(900)]);
    await save({patch:{expires_at:null,responsible_person:null}});
    expect((await db.query<any>("SELECT expires_at,responsible_person FROM org_documents")).rows[0]).toEqual({expires_at:null,responsible_person:null});
    await db.query("UPDATE org_documents SET deleted_at=now() WHERE id=$1",[id(900)]);
    await staged(900,902);
    await expect(save({request:902,revision:1})).rejects.toMatchObject({code:"22023"});
  });
  it.each([4,5,6,7,8,9,10,11])("denies unauthorized/expired/revoked actor %s",async(n)=>{
    await actor(n); await expect(save()).rejects.toMatchObject({code:"42501"});
  });
  it("allows an explicitly permitted staff member despite a different profile organization",async()=>{
    await db.exec("RESET ROLE");
    await db.query("UPDATE org_staff SET sections_access='[\"documents.read\",\"documents.write\"]' WHERE user_id=$1",[id(3)]);
    await actor(3);
    await save();
    expect((await db.query<any>("SELECT count(*)::int AS count FROM org_document_versions")).rows[0].count).toBe(2);
    await expect(save({org:200,request:904})).rejects.toMatchObject({code:"42501"});
  });
  it("allows read-only history but not mutations",async()=>{
    await save();
    await db.exec("RESET ROLE");
    await db.query("UPDATE org_staff SET sections_access='[\"documents.read\"]' WHERE user_id=$1",[id(10)]);
    await actor(10);
    expect((await db.query("SELECT * FROM org_document_versions")).rows).toHaveLength(2);
    await expect(save({request:902,revision:1})).rejects.toMatchObject({code:"42501"});
    await expect(db.query("UPDATE org_document_versions SET file_url='changed'")).rejects.toMatchObject({code:"42501"});
    await actor(8);
    expect((await db.query("SELECT * FROM org_document_versions")).rows).toEqual([]);
  });
  it("denies direct pointer mutation and internal-token spoofing, even for the app admin",async()=>{
    await actor(2);
    await expect(db.query("UPDATE org_documents SET file_url='changed' WHERE id=$1",[id(900)])).rejects.toMatchObject({code:"42501"});
    await expect(db.query("INSERT INTO org_document_write_tokens VALUES($1,txid_current())",[id(900)])).rejects.toMatchObject({code:"42501"});
    await db.query("SELECT set_config('app.document_write','true',false)");
    await expect(db.query("UPDATE org_documents SET document_revision=100 WHERE id=$1",[id(900)])).rejects.toMatchObject({code:"42501"});
  });
  it("committed blobs cannot be overwritten/deleted and versioned rows cannot be hard-deleted",async()=>{
    await save();
    expect((await db.query("DELETE FROM storage.objects WHERE name=$1 RETURNING *",[path()])).rows).toHaveLength(0);
    expect((await db.query("UPDATE storage.objects SET name='other' WHERE name=$1 RETURNING *",[path()])).rows).toHaveLength(0);
    await expect(db.query("DELETE FROM org_documents WHERE id=$1",[id(900)])).rejects.toMatchObject({code:"42501"});
  });
  it("staging paths are append-only before commit, closing the storage-delete race",async()=>{
    expect((await db.query("SELECT * FROM org_document_versions")).rows).toHaveLength(0);
    expect((await db.query("DELETE FROM storage.objects WHERE name=$1 RETURNING *",[path()])).rows).toHaveLength(0);
    expect((await db.query("UPDATE storage.objects SET metadata='{}' WHERE name=$1 RETURNING *",[path()])).rows).toHaveLength(0);
    const result=(await save()).rows[0].result;
    expect(result).toMatchObject({revision:1,replayed:false});
  });
  it("new legacy insert gets an operation-time snapshot; failed new creation leaves no row",async()=>{
    await db.query("INSERT INTO org_documents(id,organization_id,name,type,file_url) VALUES($1,$2,'Generated','enrollment_order','https://example.com/file.pdf')",[id(910),id(100)]);
    expect((await db.query<any>("SELECT event_kind FROM org_document_versions WHERE document_id=$1",[id(910)])).rows[0].event_kind).toBe("baseline");
    await expect(save({doc:911,request:912,patch:{name:"New",type:"other"}})).rejects.toMatchObject({code:"22023"});
    expect((await db.query("SELECT id FROM org_documents WHERE id=$1",[id(911)])).rows).toEqual([]);
  });
  it("new catalogue entries cannot race to create a second current row",async()=>{
    await staged(920,921);await staged(922,923);
    const outcomes=await Promise.allSettled([
      save({doc:920,request:921,patch:{name:"Charter",type:"charter"}}),
      save({doc:922,request:923,patch:{name:"Charter 2",type:"charter"}}),
    ]);
    expect(outcomes.filter(r=>r.status==="fulfilled")).toHaveLength(1);
    expect((outcomes.find(r=>r.status==="rejected") as PromiseRejectedResult).reason.code).toBe("40001");
  });
  it("anonymous and service roles cannot invoke the user-auth version RPC",async()=>{
    await db.exec("RESET ROLE; SET ROLE anon");
    await expect(save()).rejects.toMatchObject({code:"42501"});
    await db.exec("RESET ROLE; SET ROLE service_role");
    await expect(save()).rejects.toMatchObject({code:"42501"});
  });
});

