import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
let pglitePath = process.env.PGLITE_MODULE_PATH;
if (!pglitePath) {
  try { pglitePath = require.resolve("@electric-sql/pglite"); }
  catch { pglitePath = path.resolve(root, "../crm-lovable-documents-api/node_modules/@electric-sql/pglite/dist/index.js"); }
}
const { PGlite } = await import(pathToFileURL(pglitePath).href);
const db = new PGlite();
const migration = name => readFile(path.join(root, "supabase/migrations", name), "utf8");
const statement = (text, expression) => {
  const found = text.match(expression)?.[0];
  if (!found) throw new Error(`Source SQL statement not found: ${expression}`);
  return found;
};
try {
  // Actual source schema/function definitions plus minimal auth/storage shells.
  // This does not emulate Supabase storage file delivery or live authorization.
  const base = await migration("20260110234906_159335d2-99b0-4002-b8c0-e8dc0e87993b.sql");
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated;
    CREATE SCHEMA auth; CREATE SCHEMA storage;
    CREATE TABLE auth.users(id uuid PRIMARY KEY,email text);
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
      SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    CREATE TABLE storage.objects(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),bucket_id text,name text);
    GRANT USAGE ON SCHEMA public,auth,storage TO authenticated,anon;
    ${statement(base,/CREATE TYPE public\.app_role[\s\S]*?;/)}
    ${statement(base,/CREATE TABLE public\.organizations[\s\S]*?\n\);/)}
    ${statement(base,/CREATE TABLE public\.profiles[\s\S]*?\n\);/)}
    ${statement(base,/CREATE TABLE public\.user_roles[\s\S]*?\n\);/)}
    ${statement(base,/CREATE OR REPLACE FUNCTION public\.has_role[\s\S]*?\$\$;/)}
    ALTER TABLE public.organizations ADD COLUMN kpp text, ADD COLUMN director_name text, ADD COLUMN director_position text;
    ALTER TABLE public.profiles ADD COLUMN blocked_at timestamptz;
  `);
  const roleOverload = await migration("20260429060323_9023b604-40d6-4551-bf02-4fc5315bdf0e.sql");
  await db.exec(statement(roleOverload,/CREATE OR REPLACE FUNCTION public\.has_role[\s\S]*?\$\$;/));
  const blocking = await migration("20260723083929_7b85b186-c8cb-49ec-b162-6862ae5f550e.sql");
  await db.exec(statement(blocking,/CREATE OR REPLACE FUNCTION public\.is_user_blocked[\s\S]*?\$\$;/));
  const invoices = await migration("20260412120036_4f806437-e269-46d9-ac69-86f32e6a05dc.sql");
  const docs = await migration("20260215140526_34d37b78-7039-47a0-8f2a-832208f0eab6.sql");
  await db.exec(`${statement(invoices,/CREATE TABLE public\.subscription_invoices[\s\S]*?\n\);/)}
    ${statement(docs,/CREATE TABLE public\.org_billing_documents[\s\S]*?\n\);/)}
    ALTER TABLE public.subscription_invoices ADD COLUMN buyer_name text, ADD COLUMN buyer_inn text, ADD COLUMN buyer_kpp text,
      ADD COLUMN paid_at timestamptz;
    ALTER TABLE public.org_billing_documents ADD COLUMN deleted_at timestamptz;
    GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated;
  `);
  await db.exec(await migration("20260929003000_platform_invoice_acts_api.sql"));
  await db.exec(await readFile(path.join(root,"supabase/tests/platform_invoice_acts_api.sql"),"utf8"));
  console.log("PASS: platform act migration and SQL assertions in PostgreSQL/PGlite; all synthetic rows rolled back.");
  console.log("Not exercised: multi-session concurrency, production Auth/RLS, storage bytes/HTTP delivery.");
} catch (error) {
  console.error(error.code || "", error.message, error.where || "");
  process.exitCode = 1;
} finally { await db.close(); }
