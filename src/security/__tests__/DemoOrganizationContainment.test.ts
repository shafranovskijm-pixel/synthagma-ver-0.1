import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

const demoOrgEdge = read("supabase/functions/create-demo-org/index.ts");
const demoJoin = read("src/pages/DemoJoin.tsx");
const demoDashboard = read("src/components/demo/DemoDashboard.tsx");
const publicRoutes = read("src/routes/publicRoutes.tsx");
const appBootstrap = read("src/main.tsx");

describe("legacy public demo organization containment", () => {
  it("fails the edge function closed before service-role access or data writes", () => {
    expect(demoOrgEdge).toMatch(/status:\s*410/);
    expect(demoOrgEdge).toContain("Cache-Control");
    expect(demoOrgEdge).toContain("no-store");
    expect(demoOrgEdge).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
    expect(demoOrgEdge).not.toContain("createClient");
    expect(demoOrgEdge).not.toContain("auth.admin");
    expect(demoOrgEdge).not.toContain("createUser");
    expect(demoOrgEdge).not.toContain(".from('organizations')");
    expect(demoOrgEdge).not.toContain("sales_demo_sessions");
  });

  it("keeps the saved join URL as a static unavailable page without provisioning or sign-in", () => {
    expect(demoJoin).toContain("DemoOrganizationUnavailable");
    expect(demoJoin).not.toContain("create-demo-org");
    expect(demoJoin).not.toContain("functions.invoke");
    expect(demoJoin).not.toContain("signInWithPassword");
    expect(demoJoin).not.toContain("public_get_sales_demo_link");
    expect(demoJoin).not.toContain("useParams");
  });

  it("keeps the saved dashboard URL fail-closed without embeds or demo claims", () => {
    expect(demoDashboard).toContain("DemoOrganizationUnavailable");
    expect(demoDashboard).not.toContain("kinescope");
    expect(demoDashboard).not.toContain("iframe");
    expect(demoDashboard).not.toContain("DEMO_FEATURES");
    expect(demoDashboard).not.toContain("useSearchParams");
  });

  it("routes both legacy URLs only to their contained pages", () => {
    expect(publicRoutes).toContain('<Route path="/demo/:token" element={<DemoJoin />} />');
    expect(publicRoutes).toContain(
      '<Route path="/demo/:token/dashboard" element={<DemoDashboard />} />',
    );
  });

  it("clears the known legacy return payload during application bootstrap", () => {
    expect(appBootstrap).toContain('localStorage.removeItem("demoStudentReturn")');
    expect(appBootstrap.indexOf('localStorage.removeItem("demoStudentReturn")')).toBeLessThan(
      appBootstrap.indexOf("bootstrapApp()"),
    );
  });
});
