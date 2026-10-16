// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

const user = "00000000-0000-4000-8000-000000000001";
const organization = "00000000-0000-4000-8000-000000000002";
const missing = "00000000-0000-4000-8000-000000000003";
let db: PGlite;
const query = () => db.query("SELECT public.finalize_created_org_user($1,$2,$3) AS result", [user, organization, "Администратор"]);
const profile = async () => (await db.query("SELECT email,full_name,organization_id FROM public.profiles WHERE user_id=$1", [user])).rows[0];

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE SCHEMA auth;
    CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql AS $$ SELECT current_setting('request.jwt.claim.role',true) $$;
    CREATE TABLE auth.users(id uuid PRIMARY KEY,email text,raw_user_meta_data jsonb DEFAULT '{}');
  `);
  const base = await readFile(new URL("../../migrations/20260110234906_159335d2-99b0-4002-b8c0-e8dc0e87993b.sql", import.meta.url), "utf8");
  // Use the actual schema and signup trigger that caused the original conflict.
  await db.exec(base.match(/CREATE TYPE public\.app_role[\s\S]*?;/)![0]);
  for (const name of ["organizations", "profiles", "user_roles"]) {
    await db.exec(base.match(new RegExp(`CREATE TABLE public\\.${name} \\([\\s\\S]*?\\n\\);`))![0]);
  }
  await db.exec(base.match(/CREATE OR REPLACE FUNCTION public\.handle_new_user\(\)[\s\S]*?SET search_path = public;/)![0]);
  await db.exec(base.match(/CREATE TRIGGER on_auth_user_created[\s\S]*?;/)![0]);
  await db.exec(await readFile(new URL("../../migrations/20261016023000_create_org_user.sql", import.meta.url), "utf8"));
}, 30000);

beforeEach(async () => {
  await db.exec("RESET ROLE; SET request.jwt.claim.role='service_role'; TRUNCATE public.user_roles,public.profiles,public.organizations,auth.users CASCADE;");
  await db.query("INSERT INTO public.organizations(id,name,email) VALUES($1,'Synthetic organization','org@example.test')", [organization]);
  await db.query("INSERT INTO auth.users(id,email) VALUES($1,'new@example.test')", [user]);
});
afterAll(async () => { await db?.close(); });

describe("create-org-user atomic database finalization", () => {
  it("reproduces both old INSERT conflicts, then updates the signup rows into one usable org account", async () => {
    await expect(db.query("INSERT INTO public.profiles(user_id) VALUES($1)", [user])).rejects.toMatchObject({ code: "23505" });
    await expect(db.query("INSERT INTO public.user_roles(user_id,role) VALUES($1,'organization')", [user])).rejects.toMatchObject({ code: "23505" });
    expect((await db.query("SELECT role FROM public.user_roles WHERE user_id=$1", [user])).rows).toEqual([{ role: "student" }]);
    expect((await query()).rows).toEqual([{ result: { userId: user, organizationId: organization, role: "organization" } }]);
    expect(await profile()).toEqual({ email: "new@example.test", full_name: "Администратор", organization_id: organization });
    expect((await db.query("SELECT role FROM public.user_roles WHERE user_id=$1", [user])).rows).toEqual([{ role: "organization" }]);
    expect((await db.query("SELECT count(*)::int AS count FROM public.profiles WHERE user_id=$1", [user])).rows).toEqual([{ count: 1 }]);
  });

  it("rolls the profile update back when the signup role is missing", async () => {
    await db.query("DELETE FROM public.user_roles WHERE user_id=$1", [user]);
    const before = await profile();
    await expect(query()).rejects.toMatchObject({ code: "P0002" });
    expect(await profile()).toEqual(before);
  });

  it("fails when the signup profile is missing without changing the student role", async () => {
    await db.query("DELETE FROM public.profiles WHERE user_id=$1", [user]);
    await expect(query()).rejects.toMatchObject({ code: "P0002" });
    expect((await db.query("SELECT role FROM public.user_roles WHERE user_id=$1", [user])).rows).toEqual([{ role: "student" }]);
  });

  it("does not claim success if a trigger keeps the old role despite a one-row UPDATE", async () => {
    await db.exec(`CREATE FUNCTION public.keep_student_role() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN NEW.role='student'; RETURN NEW; END $$;
      CREATE TRIGGER keep_student_role BEFORE UPDATE ON public.user_roles FOR EACH ROW EXECUTE FUNCTION public.keep_student_role();`);
    const before = await profile();
    try {
      await expect(query()).rejects.toMatchObject({ code: "P0001" });
      expect(await profile()).toEqual(before);
    } finally {
      await db.exec("DROP TRIGGER keep_student_role ON public.user_roles; DROP FUNCTION public.keep_student_role();");
    }
  });

  it("fails for an absent organization and preserves the signup state", async () => {
    const before = await profile();
    await expect(db.query("SELECT public.finalize_created_org_user($1,$2,'Admin')", [user, missing])).rejects.toMatchObject({ code: "P0002" });
    expect(await profile()).toEqual(before);
  });

  it.each(["anon", "authenticated"])("does not expose provisioning to %s", async role => {
    await db.exec(`SET ROLE ${role}`);
    try { await expect(query()).rejects.toMatchObject({ code: "42501" }); }
    finally { await db.exec("RESET ROLE"); }
  });

  it("also checks service-role identity inside the security-definer function", async () => {
    await db.exec("SET request.jwt.claim.role='authenticated'");
    await expect(query()).rejects.toMatchObject({ code: "42501" });
    expect((await db.query("SELECT has_function_privilege('service_role','public.finalize_created_org_user(uuid,uuid,text)','EXECUTE') AS allowed")).rows).toEqual([{ allowed: true }]);
  });
});
