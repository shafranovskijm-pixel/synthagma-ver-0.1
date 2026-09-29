// Executes the real migration against a synthetic PostgreSQL fixture. No network or client data.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
const repo = fileURLToPath(new URL('../', import.meta.url));
const modulePath = process.env.PGLITE_MODULE_PATH || 'D:/Codex/workspaces/2026-09-28/new-chat/work/crm-lovable-documents-api/node_modules/@electric-sql/pglite/dist/index.js';
const { PGlite } = await import(pathToFileURL(modulePath).href);
const db = new PGlite();
let assertions = 0;
const check = (actual, expected, message) => { assert.deepEqual(actual, expected, message); assertions++; };
const uid = n => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
const read = file => readFile(path.join(repo, file), 'utf8');
const one = async sql => (await db.query(sql)).rows[0];
const invoke = (actor = 1, student = 10, org = 100, department = null, snils = null, birth = null, confirm = false) =>
  db.query('SELECT public.save_student_registration_details($1,$2,$3,$4,$5,$6,$7) AS result', [uid(org), uid(student), actor == null ? null : uid(actor), department, snils, birth, confirm]);
const denied = async (fn, code) => { await assert.rejects(fn, error => error.code === code); assertions++; };
try {
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE SCHEMA auth;
    CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql AS $$ SELECT COALESCE(NULLIF(current_setting('request.jwt.claims',true),''),'{}')::jsonb $$;
    CREATE TYPE public.app_role AS ENUM ('admin','organization','company','sales_manager','student');
    CREATE TABLE public.profiles(user_id uuid PRIMARY KEY, organization_id uuid, archived_at timestamptz);
    CREATE TABLE public.user_roles(user_id uuid, role public.app_role);
    CREATE TABLE public.org_staff(user_id uuid,organization_id uuid,expires_at timestamptz,can_write boolean);
    CREATE FUNCTION public.has_role(u uuid,r public.app_role) RETURNS boolean LANGUAGE sql AS $$ SELECT EXISTS(SELECT 1 FROM user_roles WHERE user_id=u AND role=r) $$;
    -- Deliberately does NOT enforce expiry: the new RPC must enforce it itself.
    CREATE FUNCTION public.has_org_staff_permission(u uuid,o uuid,p text) RETURNS boolean LANGUAGE sql AS $$ SELECT EXISTS(SELECT 1 FROM org_staff WHERE user_id=u AND organization_id=o AND can_write) $$;
    CREATE TABLE public.student_frdo_data(user_id uuid,organization_id uuid,snils text,birth_date date,profession_name text,passport_number text,UNIQUE(user_id,organization_id));
    CREATE TABLE public.video_identifications(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid,organization_id uuid,status text,verified_by uuid,verified_at timestamptz,created_at timestamptz DEFAULT now(),rejection_reason text,photo_url text,video_url text);
    GRANT USAGE ON SCHEMA public, auth TO authenticated, anon, service_role;
  `);
  await db.exec(await read('supabase/migrations/20260729092507_1963e085-8e9c-4a15-8b5f-69b86e0f6bf8.sql'));
  const ownerSource = await read('supabase/migrations/20260822122025_6be7e00b-82ec-44a9-8476-fac0e09cdd0c.sql');
  const owner = ownerSource.match(/CREATE OR REPLACE FUNCTION public\.is_org_owner\([\s\S]*?\$function\$;/)?.[0];
  assert.ok(owner, 'real owner helper');
  await db.exec(owner);
  await db.exec(await read('supabase/migrations/20260929140000_student_registration_details.sql'));
  await db.exec(`
    INSERT INTO profiles(user_id,organization_id) VALUES ('${uid(1)}','${uid(100)}'),('${uid(2)}','${uid(100)}'),('${uid(3)}','${uid(100)}'),('${uid(4)}','${uid(100)}'),('${uid(5)}','${uid(100)}'),('${uid(6)}','${uid(100)}'),('${uid(10)}','${uid(100)}'),('${uid(11)}','${uid(200)}'),('${uid(12)}','${uid(100)}'),('${uid(13)}','${uid(100)}');
    INSERT INTO user_roles VALUES ('${uid(1)}','organization'),('${uid(2)}','admin'),('${uid(3)}','student'),('${uid(4)}','student'),('${uid(5)}','student'),('${uid(6)}','company'),('${uid(10)}','student'),('${uid(12)}','student');
    INSERT INTO org_staff VALUES ('${uid(3)}','${uid(100)}',NULL,true),('${uid(4)}','${uid(100)}',now()-interval '1 day',true),('${uid(5)}','${uid(100)}',NULL,false);
    UPDATE profiles SET archived_at=now() WHERE user_id='${uid(12)}';
    INSERT INTO student_frdo_data VALUES ('${uid(10)}','${uid(100)}','111-111-111 11','1980-01-01','Original profession','Original passport');
    SET request.jwt.claims='{"role":"service_role"}';
  `);
  check((await one(`SELECT has_function_privilege('authenticated','public.save_student_registration_details(uuid,uuid,uuid,text,text,date,boolean)','EXECUTE') AS allowed`)).allowed, false, 'authenticated cannot spoof actor');
  check((await one(`SELECT has_function_privilege('anon','public.save_student_registration_details(uuid,uuid,uuid,text,text,date,boolean)','EXECUTE') AS allowed`)).allowed, false, 'anon denied');
  check((await one(`SELECT has_function_privilege('service_role','public.save_student_registration_details(uuid,uuid,uuid,text,text,date,boolean)','EXECUTE') AS allowed`)).allowed, true, 'service permitted');
  await db.exec("SET request.jwt.claims='{}'");
  await denied(() => invoke(), '42501');
  await db.exec("SET request.jwt.claims='{\"role\":\"authenticated\"}'");
  await denied(() => invoke(), '42501');
  await db.exec("SET request.jwt.claims='{\"role\":\"service_role\"}'");
  for (const actor of [null, 4, 5, 6, 10, 99]) await denied(() => invoke(actor), '42501');
  await denied(() => invoke(1, 11), '42501');
  await denied(() => invoke(1, 99), '42501');
  await denied(() => invoke(1, 12), '22023');
  await denied(() => invoke(1, 3), '42501');
  await denied(() => invoke(1, 10, 200), '42501');
  for (const args of [[1,10,100,'x'.repeat(201)],[1,10,100,'a\nb'],[1,10,100,null,'123'],[1,10,100,null,'001-001-998 ab'],[1,10,100,null,null,'9999-01-01']]) {
    await denied(() => invoke(...args), '22023');
  }
  const result = (await invoke(1,10,100,' Участок 2 ','00100199832','1990-06-15',true)).rows[0].result;
  check(result.success, true, 'owner saves details');
  const details = await one(`SELECT department,snils,birth_date::text,profession_name,passport_number FROM profiles p JOIN student_frdo_data f USING(user_id,organization_id) WHERE p.user_id='${uid(10)}'`);
  check(details, { department:'Участок 2',snils:'001-001-998 32',birth_date:'1990-06-15',profession_name:'Original profession',passport_number:'Original passport' }, 'targeted merge leaves other FRDO fields');
  const identity = await one(`SELECT * FROM video_identifications WHERE user_id='${uid(10)}'`);
  check(identity.verified_by, uid(1), 'server records actor');
  check(identity.photo_url, null, 'manual confirmation does not fabricate photo');
  await invoke(2,10,100,'',null,null,true);
  check(await one(`SELECT * FROM video_identifications WHERE user_id='${uid(10)}'`), identity, 'repeated confirmation preserves id, actor and time');
  await invoke(3,10,100,'',null,null,false);
  check(await one(`SELECT department,snils,birth_date::text,profession_name,passport_number FROM profiles p JOIN student_frdo_data f USING(user_id,organization_id) WHERE p.user_id='${uid(10)}'`), details, 'blank repeated import preserves details');
  check((await one(`SELECT count(*)::int AS count FROM video_identifications WHERE user_id='${uid(10)}'`)).count, 1, 'no duplicate identification');
  await invoke(3,10,100,'Участок 3');
  check((await one(`SELECT department FROM profiles WHERE user_id='${uid(10)}'`)).department, 'Участок 3', 'active staff permitted');
  await db.exec(`INSERT INTO video_identifications(user_id,organization_id,status,created_at,photo_url,rejection_reason) VALUES('${uid(10)}','${uid(100)}','rejected',now()+interval '1 hour','photo-retained','old reason')`);
  await invoke(2,10,100,null,null,null,true);
  check(await one(`SELECT status,verified_by,photo_url,rejection_reason FROM video_identifications WHERE photo_url='photo-retained'`), {status:'verified',verified_by:uid(2),photo_url:'photo-retained',rejection_reason:null}, 'latest record approved and media retained');
  await invoke(1,13,100,null,'00100199832');
  check((await one(`SELECT snils,birth_date::text FROM student_frdo_data WHERE user_id='${uid(13)}'`)), {snils:'001-001-998 32',birth_date:null}, 'missing FRDO row created narrowly');
  await db.exec(`CREATE FUNCTION fail_identity() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic failure'; END $$;
    CREATE TRIGGER fail_identity BEFORE INSERT ON video_identifications FOR EACH ROW EXECUTE FUNCTION fail_identity();`);
  await denied(() => invoke(1,13,100,'Must roll back','11111111111','2000-01-01',true), 'P0001');
  check((await one(`SELECT department FROM profiles WHERE user_id='${uid(13)}'`)).department, null, 'department rolled back with failed approval');
  check((await one(`SELECT snils,birth_date::text FROM student_frdo_data WHERE user_id='${uid(13)}'`)), {snils:'001-001-998 32',birth_date:null}, 'FRDO rolled back with failed approval');
  console.log(JSON.stringify({ passed: true, assertions, limitation: 'Synthetic PostgreSQL; no hosted Edge/Storage, real client data, or multi-connection concurrency exercised.' }));
} finally { await db.close(); }
