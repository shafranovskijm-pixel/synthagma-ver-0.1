import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createClient } from "@supabase/supabase-js";
import type { ToolContext } from "@lovable.dev/mcp-js";
import profileTool from "./tools/get-my-profile";

vi.mock("@supabase/supabase-js", () => ({ createClient: vi.fn() }));

const userId = "10000000-0000-4000-8000-000000000001";
const caller = (authenticated = true, token = "test-user-jwt", id = userId) => ({
  isAuthenticated: () => authenticated,
  getToken: () => token,
  getUserId: () => id,
} as unknown as ToolContext);

function fakeProfiles(error: { message: string } | null = null) {
  const record: Record<string, unknown> = {
    id: "profile-id", user_id: userId, email: "test@example.invalid",
    full_name: "Test User", organization_id: "test-org",
    generated_password: "secret-generated-password", login: "private-login",
  };
  let columns: string[] = [];
  const query = {
    select: vi.fn((value: string) => { columns = value.split(","); return query; }),
    eq: vi.fn(() => query),
    maybeSingle: vi.fn(async () => ({
      data: error ? null : Object.fromEntries(columns.map((column) => [column, record[column]])),
      error,
    })),
  };
  const from = vi.fn(() => query);
  vi.mocked(createClient).mockReturnValue({ from } as unknown as ReturnType<typeof createClient>);
  return { from, query };
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("SUPABASE_URL", "https://example.invalid");
  vi.stubEnv("SUPABASE_PUBLISHABLE_KEY", "test-public-key");
});
afterEach(() => { vi.unstubAllEnvs(); });

describe("get_my_profile privacy boundary", () => {
  it("reads only the verified caller's allowlisted profile fields using their JWT", async () => {
    const db = fakeProfiles();
    const result = await profileTool.handler({}, caller());
    expect(createClient).toHaveBeenCalledWith("https://example.invalid", "test-public-key", {
      global: { headers: { Authorization: "Bearer test-user-jwt" } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    expect(db.from).toHaveBeenCalledWith("profiles");
    expect(db.query.select).toHaveBeenCalledWith("id,user_id,email,full_name,organization_id");
    expect(db.query.eq).toHaveBeenCalledWith("user_id", userId);
    const serialized = JSON.stringify(result);
    expect(serialized).toContain("test@example.invalid");
    expect(serialized).not.toMatch(/generated_password|secret-generated-password|private-login/);
  });

  it("falls back to the public anon key and keeps the caller JWT and profile scope", async () => {
    vi.stubEnv("SUPABASE_PUBLISHABLE_KEY", undefined);
    vi.stubEnv("SUPABASE_ANON_KEY", "legacy-public-anon-key");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "must-never-use");
    const db = fakeProfiles();
    const result = await profileTool.handler({}, caller());
    expect(result.isError).not.toBe(true);
    expect(createClient).toHaveBeenCalledWith("https://example.invalid", "legacy-public-anon-key", {
      global: { headers: { Authorization: "Bearer test-user-jwt" } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    expect(db.query.eq).toHaveBeenCalledWith("user_id", userId);
  });

  it.each([
    { name: "unauthenticated", authenticated: false, token: "test-user-jwt", id: userId },
    { name: "missing JWT", authenticated: true, token: "", id: userId },
    { name: "missing identity", authenticated: true, token: "test-user-jwt", id: "" },
  ])("does not query a profile for $name", async ({ authenticated, token, id }) => {
    const result = await profileTool.handler({}, caller(authenticated, token, id));
    expect(result.isError).toBe(true);
    expect(createClient).not.toHaveBeenCalled();
  });

  it("does not expose raw database errors", async () => {
    fakeProfiles({ message: "private database detail generated_password=secret" });
    const result = await profileTool.handler({}, caller());
    expect(result.isError).toBe(true);
    expect(JSON.stringify(result)).toContain("Не удалось прочитать профиль");
    expect(JSON.stringify(result)).not.toMatch(/private database|generated_password|secret/);
  });
});
