import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("student login email credential URL regression", () => {
  const source = readFileSync(resolve(process.cwd(), "supabase/functions/send-student-login-link/index.ts"), "utf8");
  it("uses a plain login URL while retaining separate manual login instructions", () => {
    expect(source).toContain('? `${BASE_URL}/login`');
    expect(source).not.toMatch(/\/login\?u=|&p=/);
    expect(source).toContain('<b>Логин:</b> ${profile.login}<br><b>Пароль:</b> ${password}');
    expect(source).toContain('to: profile.email');
    expect(source).toContain('sendPlatformEmail({');
  });
});
