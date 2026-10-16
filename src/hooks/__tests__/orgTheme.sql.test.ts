// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

const id = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
const read = (path: string) => readFile(new URL(`../../../${path}`, import.meta.url), "utf8");
let db: PGlite;
const patch = (value: unknown, org = id(100)) => db.query("SELECT public.update_organization_theme($1,$2::jsonb) AS theme", [org, JSON.stringify(value)]);
const actor = async (n: number) => {
  await db.exec("RESET ROLE");
  await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)", [id(n)]);
  await db.exec("SET ROLE authenticated");
};
beforeAll(async () => {
  db = new PGlite(); // isolated memory only; no hosted database connection
  await db.exec("BEGIN");
  await db.exec(await read("docs/releases/sintagma-production/staff-workspace-20261012/synthetic-fixture.sql"));
  for (const [file, name] of [
    ["20260422090402_7a17f4ca-e3ae-47cb-866e-670fd82dc4ec.sql", "org_role_default_permissions"],
    ["20260422090332_1856ddfd-409c-45c8-8ee1-2acc959c793e.sql", "get_org_staff_permissions"],
    ["20260728072432_172e4e18-e52e-495d-b1ff-d3e5d3c04b9d.sql", "normalize_org_staff_permission"],
    ["20260728072432_172e4e18-e52e-495d-b1ff-d3e5d3c04b9d.sql", "has_org_staff_permission"],
    ["20260822122025_6be7e00b-82ec-44a9-8476-fac0e09cdd0c.sql", "can_access_organization"],
  ]) {
    const source = await read(`supabase/migrations/${file}`);
    const fn = source.match(new RegExp(`CREATE OR REPLACE FUNCTION public\\.${name}\\([\\s\\S]*?AS\\s+(\\$[^$]*\\$)[\\s\\S]*?\\1;`, "i"))?.[0];
    expect(fn, name).toBeTruthy();
    await db.exec(fn!);
  }
  const revocations = await read("supabase/migrations/20261007160000_self_account_deletion.sql");
  await db.exec(revocations.match(/CREATE FUNCTION public\.account_deletion_access_allowed\(\)[\s\S]*?\$fn\$;/)![0].replace("CREATE FUNCTION", "CREATE OR REPLACE FUNCTION"));
  await db.exec("COMMIT");
  await db.exec(await read("supabase/migrations/20261016024000_org_theme_patch.sql"));
}, 30000);
beforeEach(async () => {
  await db.exec("RESET ROLE");
  await db.query("UPDATE organizations SET branding=$1::jsonb WHERE id=$2", [JSON.stringify({ logoUrl: "logo.png", coverUrl: "cover.jpg", orgTheme: { enforce: true, themeMode: "dark", radius: "soft" } }), id(100)]);
  await db.query("UPDATE org_staff SET sections_access='[]' WHERE user_id=$1", [id(3)]);
  await actor(1);
});
afterAll(async () => { await db?.close(); });

describe("atomic org theme patch and server permissions", () => {
  it("merges independent theme changes without losing branding or existing preferences", async () => {
    await patch({ density: "compact", accentHsl: "217 91% 60%" });
    expect((await patch({ animLevel: "none" })).rows).toEqual([{ theme: { enforce: true, themeMode: "dark", radius: "soft", density: "compact", accentHsl: "217 91% 60%", animLevel: "none" } }]);
    await db.exec("RESET ROLE");
    expect((await db.query("SELECT branding->>'logoUrl' AS logo,branding->>'coverUrl' AS cover FROM organizations WHERE id=$1", [id(100)])).rows).toEqual([{ logo: "logo.png", cover: "cover.jpg" }]);
  });
  it("retains legacy org_theme values when adding the canonical theme subtree", async () => {
    await db.exec("RESET ROLE");
    await db.query("UPDATE organizations SET branding=$1::jsonb WHERE id=$2", [JSON.stringify({ org_theme: { themeMode: "dark" }, logoUrl: "retained.png" }), id(100)]);
    await actor(1);
    expect((await patch({ animLevel: "none" })).rows).toEqual([{ theme: { themeMode: "dark", animLevel: "none" } }]);
  });
  it.each([3, 4, 5, 6, 7, 8, 9])("denies actor %s without active settings.write, including expired/revoked accounts", async n => {
    await actor(n);
    await expect(patch({ enforce: false })).rejects.toMatchObject({ code: "42501" });
  });
  it("allows an active staff override for settings.write only in its own organization", async () => {
    await db.exec("RESET ROLE");
    await db.query("UPDATE org_staff SET sections_access='[\"settings.write\"]' WHERE user_id=$1", [id(3)]);
    await actor(3);
    expect((await patch({ enforce: false })).rows[0]).toMatchObject({ theme: { enforce: false } });
    await expect(patch({ enforce: false }, id(200))).rejects.toMatchObject({ code: "42501" });
  });
  it("rejects a missing organization even for the platform administrator", async () => {
    await actor(2);
    await expect(patch({ enforce: true }, id(999))).rejects.toMatchObject({ code: "P0002" });
  });
  it.each([{}, [], { logoUrl: "injected.png" }, { enforce: "true" }, { themeMode: null }, { animLevel: "invalid" }, { accentHsl: "url(invalid)" }, { density: "large" }])("rejects malformed or out-of-scope patch %j", async value => {
    await expect(patch(value)).rejects.toMatchObject({ code: "22023" });
  });
  it("denies anonymous execution", async () => {
    await db.exec("RESET ROLE; SET ROLE anon");
    await expect(patch({ enforce: true })).rejects.toMatchObject({ code: "42501" });
  });
});
