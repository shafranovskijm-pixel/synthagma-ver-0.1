import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

const demoEdge = read("supabase/functions/demo-student-login/index.ts");
const demoPage = read("src/pages/DemoStudentLogin.tsx");
const studentDashboard = read("src/pages/StudentDashboard.tsx");
const studentsEmptyState = read("src/components/organization/tabs/students/StudentsEmptyState.tsx");
const loginPage = read("src/pages/Login.tsx");
const containmentMigrationPath = resolve(
  process.cwd(),
  "supabase/migrations/20260827090000_disable_legacy_demo_accounts.sql",
);
const containmentMigration = existsSync(containmentMigrationPath)
  ? readFileSync(containmentMigrationPath, "utf8")
  : "";

describe("legacy shared demo student containment", () => {
  it("fails closed before service-role access or production data writes", () => {
    expect(demoEdge).toMatch(/status:\s*410/);
    expect(demoEdge).toContain("Cache-Control");
    expect(demoEdge).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
    expect(demoEdge).not.toContain("auth.admin");
    expect(demoEdge).not.toContain("DEMO_STUDENT_PASSWORD");
    expect(demoEdge).not.toContain(".from('enrollments')");
    expect(demoEdge).not.toContain("student_identity_documents");
  });

  it("never swaps sessions or stores reusable admin and organization tokens", () => {
    expect(demoPage).not.toContain("demoStudentReturn");
    expect(demoPage).not.toContain("getSession");
    expect(demoPage).not.toContain("signInWithPassword");
    expect(demoPage).not.toContain('functions.invoke("demo-student-login")');

    expect(studentDashboard).not.toContain("access_token: data.access_token");
    expect(studentDashboard).not.toContain("refresh_token: data.refresh_token");
    expect(studentDashboard).not.toContain("auth.setSession");
  });

  it("does not advertise the disabled shared account from the organization UI", () => {
    expect(studentsEmptyState).not.toContain("/demo-student-login");
  });

  it("does not ship fixed demo credentials or client-side demo provisioning", () => {
    expect(loginPage).not.toContain("DEMO_ACCOUNTS");
    expect(loginPage).not.toContain("handleDemoLogin");
    expect(loginPage).not.toContain("demoLoading");
    expect(loginPage).not.toMatch(/(?:admin|org|student)@demo\.sigma/);
    expect(loginPage).not.toContain("demo123456");
  });

  it("drops the auth trigger and removes or neutralizes its role-granting function", () => {
    expect(containmentMigration).toContain(
      "DROP TRIGGER IF EXISTS on_demo_account_created ON auth.users",
    );
    expect(containmentMigration).toContain(
      "CREATE OR REPLACE FUNCTION public.assign_demo_role()",
    );
    expect(containmentMigration).toMatch(/BEGIN\s+RETURN NEW;\s+END/);
    expect(containmentMigration).toContain(
      "DROP FUNCTION IF EXISTS public.assign_demo_role()",
    );
    expect(containmentMigration).toContain("dependent_objects_still_exist");
    expect(containmentMigration).not.toContain("CASCADE");
    expect(containmentMigration).not.toMatch(/(?:admin|org|student)@demo\.sigma/);
  });
});
