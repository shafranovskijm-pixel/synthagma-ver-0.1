import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

const registrationEdge = read("supabase/functions/register-organization/index.ts");
const welcomeSeedEdge = read("supabase/functions/seed-welcome-course/index.ts");

describe("organization registration tariff security contract", () => {
  it("accepts only canonical tariff identifiers and always provisions free access", () => {
    expect(registrationEdge).toMatch(
      /subscription_plan:\s*z\.enum\(\['free', 'start', 'standard', 'professional', 'maximum'\]\)\.optional\(\)\.nullable\(\)/,
    );
    expect(registrationEdge).toMatch(
      /\.from\('organizations'\)[\s\S]*?\.insert\(\{[\s\S]*?subscription_plan:\s*'free',[\s\S]*?tariff_type:\s*'free',[\s\S]*?is_paid:\s*false/,
    );
    expect(registrationEdge).not.toContain(".update({ subscription_plan: normalizedPlan }");
  });

  it("records a paid selection as a pending request without making registration depend on it", () => {
    const requestStart = registrationEdge.indexOf("let subscriptionRequestCreated = false");
    const profileStart = registrationEdge.indexOf("const { error: profileErr }");
    const requestBlock = registrationEdge.slice(requestStart, profileStart);

    expect(requestStart).toBeGreaterThanOrEqual(0);
    expect(profileStart).toBeGreaterThan(requestStart);
    expect(requestBlock).toContain(".from('subscription_requests')");
    expect(requestBlock).toMatch(/current_plan:\s*'free'/);
    expect(requestBlock).toMatch(/requested_plan:\s*normalizedPlan/);
    expect(requestBlock).toMatch(/status:\s*'pending'/);
    expect(requestBlock).toMatch(/message:\s*'[^']+'/);
    expect(requestBlock).toContain("console.warn(");
    expect(requestBlock).not.toMatch(/\bthrow\b/);
    expect(registrationEdge).toContain(
      "subscription_request_created: subscriptionRequestCreated",
    );
  });
});

describe("welcome course seed authorization contract", () => {
  it("authenticates through a caller-scoped anon client before any service-role access", () => {
    const authHeaderAt = welcomeSeedEdge.indexOf('req.headers.get("Authorization")');
    const getUserAt = welcomeSeedEdge.indexOf("userClient.auth.getUser()");
    const adminGateAt = welcomeSeedEdge.indexOf('userClient.rpc("has_role"');
    const orgGateAt = welcomeSeedEdge.indexOf('"can_access_organization"');
    const serviceRoleAt = welcomeSeedEdge.indexOf('Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")');

    expect(welcomeSeedEdge).toContain('Deno.env.get("SUPABASE_ANON_KEY")');
    expect(welcomeSeedEdge).toContain(
      "global: { headers: { Authorization: authHeader } }",
    );
    expect(authHeaderAt).toBeGreaterThanOrEqual(0);
    expect(getUserAt).toBeGreaterThan(authHeaderAt);
    expect(adminGateAt).toBeGreaterThan(getUserAt);
    expect(orgGateAt).toBeGreaterThan(adminGateAt);
    expect(serviceRoleAt).toBeGreaterThan(orgGateAt);
    expect(welcomeSeedEdge).toMatch(/status:\s*401/);
  });

  it("requires courses.write for one organization and the exact admin RPC for seedAll", () => {
    expect(welcomeSeedEdge).toMatch(
      /userClient\.rpc\(\s*"can_access_organization",\s*\{\s*_organization_id:\s*organizationId,\s*_permission:\s*"courses\.write",\s*\}/,
    );
    expect(welcomeSeedEdge).toMatch(
      /userClient\.rpc\("has_role",\s*\{\s*_role:\s*"admin",\s*_user_id:\s*authData\.user\.id,\s*\}/,
    );
    expect(welcomeSeedEdge).toContain("canWriteCourses !== true");
    expect(welcomeSeedEdge).toContain("isAdmin !== true");
    expect(welcomeSeedEdge).toMatch(/status:\s*403/g);
  });
});
