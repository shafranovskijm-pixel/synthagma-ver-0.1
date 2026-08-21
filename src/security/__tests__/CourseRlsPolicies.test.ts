import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationsDirectory = resolve(process.cwd(), "supabase", "migrations");

function lastStatementFor(policyName: string) {
  const matchingStatements = readdirSync(migrationsDirectory)
    .filter((fileName) => fileName.endsWith(".sql"))
    .sort()
    .flatMap((fileName) => {
      const sql = readFileSync(join(migrationsDirectory, fileName), "utf8");
      return sql
        .split(/\r?\n/)
        .filter((line) => /^(CREATE|DROP) POLICY/i.test(line.trim()) && line.includes(policyName))
        .map((line) => ({ fileName, line: line.trim() }));
    });

  expect(matchingStatements.length).toBeGreaterThanOrEqual(2);
  return matchingStatements[matchingStatements.length - 1];
}

describe("course RLS migration history", () => {
  it("ends both legacy broad course policies with explicit drops", () => {
    expect(lastStatementFor("Org users can manage their courses")).toEqual({
      fileName: "20260822120000_drop_legacy_courses_manage_policy.sql",
      line: 'DROP POLICY IF EXISTS "Org users can manage their courses" ON public.courses;',
    });

    expect(lastStatementFor("Org users can view own courses")).toEqual({
      fileName: "20260822120000_drop_legacy_courses_manage_policy.sql",
      line: 'DROP POLICY IF EXISTS "Org users can view own courses" ON public.courses;',
    });
  });

  it("keeps course updates gated by courses.write", () => {
    const permissionsMigration = readFileSync(
      join(migrationsDirectory, "20260728072432_172e4e18-e52e-495d-b1ff-d3e5d3c04b9d.sql"),
      "utf8",
    );

    expect(permissionsMigration).toMatch(
      /CREATE POLICY "Org staff can update courses"[\s\S]*?USING \(public\.can_access_organization\(organization_id, 'courses\.write'\)\)[\s\S]*?WITH CHECK \(public\.can_access_organization\(organization_id, 'courses\.write'\)\)/,
    );
  });

  it("keeps staff out of the implicit owner branch", () => {
    const tightenedHelperMigration = readFileSync(
      join(migrationsDirectory, "20260822120000_drop_legacy_courses_manage_policy.sql"),
      "utf8",
    );

    expect(tightenedHelperMigration).toContain("ur.role = 'organization'::public.app_role");
    expect(tightenedHelperMigration).toContain(
      "public.has_org_staff_permission(auth.uid(), _organization_id, _permission)",
    );
    expect(tightenedHelperMigration).toMatch(
      /ur\.role = 'organization'::public\.app_role[\s\S]*?AND NOT EXISTS \([\s\S]*?FROM public\.org_staff os[\s\S]*?os\.user_id = auth\.uid\(\)/,
    );
  });

  it("does not mint implicit owner identity for directly created staff", () => {
    const createStaffFunction = readFileSync(
      resolve(process.cwd(), "supabase", "functions", "create-org-staff", "index.ts"),
      "utf8",
    );
    const transferOwnershipFunction = readFileSync(
      resolve(process.cwd(), "supabase", "functions", "transfer-org-ownership", "index.ts"),
      "utf8",
    );

    expect(createStaffFunction).toContain('"can_access_organization"');
    expect(createStaffFunction).toContain('_permission: "staff.write"');
    expect(createStaffFunction).not.toMatch(/from\("user_roles"\)\.(insert|upsert)/);
    const allowedRoles = createStaffFunction.match(
      /const allowedStaffRoles = new Set\(\[([\s\S]*?)\]\);/,
    )?.[1] || "";
    expect(allowedRoles).not.toContain('"owner"');
    expect(createStaffFunction).toContain("auth.admin.deleteUser(userId)");
    expect(transferOwnershipFunction).toContain('"transfer_org_ownership_atomic"');
  });

  it("keeps staff removal and ownership transfer fail-closed and atomic", () => {
    const staffSecurityMigration = readFileSync(
      join(migrationsDirectory, "20260822120000_drop_legacy_courses_manage_policy.sql"),
      "utf8",
    );
    const ownershipMigration = readFileSync(
      join(migrationsDirectory, "20260822121000_atomic_org_ownership_transfer.sql"),
      "utf8",
    );
    const staffManager = readFileSync(
      resolve(process.cwd(), "src", "components", "organization", "StaffManager.tsx"),
      "utf8",
    );

    expect(staffSecurityMigration).toContain("role <> 'owner'");
    expect(staffSecurityMigration).toContain(
      "CREATE OR REPLACE FUNCTION public.has_org_ownership_identity",
    );
    expect(staffSecurityMigration).toContain(
      "CREATE TRIGGER prevent_org_staff_owner_overlap",
    );
    expect(staffSecurityMigration).toContain(
      "BEFORE INSERT OR UPDATE OF organization_id, user_id, role",
    );
    expect(staffSecurityMigration).toContain(
      "Organization owner cannot also be organization staff",
    );
    expect(staffSecurityMigration).toMatch(
      /CREATE POLICY "org_staff_insert"[\s\S]*?NOT public\.has_org_ownership_identity\(user_id, organization_id\)/,
    );
    expect(staffSecurityMigration).toMatch(
      /CREATE POLICY "org_staff_update"[\s\S]*?NOT public\.has_org_ownership_identity\(user_id, organization_id\)/,
    );
    expect(staffSecurityMigration).toContain(
      "CREATE OR REPLACE FUNCTION public.remove_org_staff_member",
    );
    expect(staffSecurityMigration).toContain("resolve ownership first");
    expect(staffManager).toContain('"remove_org_staff_member"');
    expect(staffManager).not.toContain('from("org_staff").delete()');

    expect(ownershipMigration).toContain("FOR UPDATE");
    expect(ownershipMigration).toContain("ON CONFLICT (user_id) DO UPDATE");
    expect(ownershipMigration).toContain(
      "IF NOT public.is_org_owner(v_caller, p_organization_id)",
    );
    expect(ownershipMigration).toContain("os.role IN ('admin', 'school_editor')");
    expect(ownershipMigration).toContain("v_owner_count <> 1");
    expect(ownershipMigration).toContain("v_target_global_role <> 'student'::public.app_role");
    expect(ownershipMigration).toContain("JOIN auth.users au ON au.id = os.user_id");
  });
});
