import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const modulePath = process.env.PGLITE_MODULE_PATH || require.resolve("@electric-sql/pglite");
const { PGlite } = await import(pathToFileURL(modulePath).href);
const db = new PGlite();
const exec = async sql => {
  try { return await db.exec(sql); }
  catch (error) {
    const at = Number(error.position || 1) - 1;
    console.error("Local fixture SQL near:", sql.slice(Math.max(0, at - 160), at + 160));
    throw error;
  }
};
const migration = name => readFile(path.join(root, "supabase/migrations", name), "utf8");
const statement = (text, expression) => {
  const found = text.match(expression)?.[0];
  if (!found) throw new Error(`Source SQL statement not found: ${expression}`);
  return found;
};

try {
  const base = await migration("20260110234906_159335d2-99b0-4002-b8c0-e8dc0e87993b.sql");
  const deletion = await migration("20261007160000_self_account_deletion.sql");
  // Use actual schema, role helpers, RLS and conversation triggers. Minimal
  // local auth shell deliberately does not represent genuine Cloud OAuth.
  await exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE SCHEMA auth;
    CREATE TABLE auth.users(id uuid PRIMARY KEY,email text);
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
      SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    GRANT USAGE ON SCHEMA public,auth TO authenticated,anon;
    ${statement(base,/CREATE TYPE public\.app_role[\s\S]*?;/)}
    ${statement(base,/CREATE TABLE public\.organizations[\s\S]*?\n\);/)}
    ${statement(base,/CREATE TABLE public\.profiles[\s\S]*?\n\);/)}
    ${statement(base,/CREATE TABLE public\.user_roles[\s\S]*?\n\);/)}
    ${statement(base,/CREATE OR REPLACE FUNCTION public\.has_role[\s\S]*?\$\$;/)}
    ${statement(base,/CREATE OR REPLACE FUNCTION public\.update_updated_at_column[\s\S]*?\$\$ LANGUAGE plpgsql SET search_path = public;/)}
    ALTER TABLE public.profiles ADD COLUMN blocked_at timestamptz;
    ${statement(deletion,/CREATE TABLE public\.account_deletion_revocations[\s\S]*?\n\);/)}
    ${statement(deletion,/CREATE FUNCTION public\.account_deletion_access_allowed\(\)[\s\S]*?\$fn\$;/)}
  `);
  const overload = await migration("20260429060323_9023b604-40d6-4551-bf02-4fc5315bdf0e.sql");
  const blocking = await migration("20260723083929_7b85b186-c8cb-49ec-b162-6862ae5f550e.sql");
  await exec(statement(overload,/CREATE OR REPLACE FUNCTION public\.has_role[\s\S]*?\$\$;/));
  await exec(statement(blocking,/CREATE OR REPLACE FUNCTION public\.is_user_blocked[\s\S]*?\$\$;/));
  const conversations = await migration("20260420033452_059e5755-2e2d-4e8d-b0b0-f8289adde19d.sql");
  await exec(conversations.split("-- 5. Realtime")[0]);
  await exec(await migration("20260216020239_ff0f91aa-1546-4360-962b-53a889b7a071.sql"));
  await exec(await migration("20260216021143_83934c02-dcfd-48ca-8ae5-7b39eaa7bec3.sql"));
  for (const table of ["support_conversations", "support_messages", "support_requests"]) {
    const escaped = table.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    await exec(statement(deletion, new RegExp(`CREATE POLICY account_deletion_no_revoked_access ON public\\."${escaped}"[\\s\\S]*?;`)));
  }
  await exec(`GRANT SELECT ON ALL TABLES IN SCHEMA public TO authenticated;
    REVOKE ALL ON public.account_deletion_revocations FROM authenticated,anon;`);
  await exec(await migration("20261102020000_support_read_api.sql"));
  await exec(await readFile(path.join(root,"supabase/tests/support_read_api.sql"),"utf8"));
  console.log("PASS: support read-only SQL migration and rolled-back integration assertions in PostgreSQL/PGlite.");
  console.log("Scope: admin/blocked/revoked gates, caller RLS, literal search, stable cursors, safe fields, unchanged rows.");
  console.log("Not exercised: genuine Cloud OAuth, production deployment, concurrent updates, Telegram or screenshot delivery.");
} catch (error) {
  console.error(error.code || "", error.message, error.where || "");
  process.exitCode = 1;
} finally { await db.close(); }
