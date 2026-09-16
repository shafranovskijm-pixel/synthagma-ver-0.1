import { describe, expect, it } from "vitest";
import { platformSenderId, platformSmtp, reservePlatformSender, type PlatformSenderRow, type PlatformSenderStore } from "./platform-sender";

const id = "00000000-0000-4000-8000-000000000001";
const base: PlatformSenderRow = {
  id, email: "sender@example.com", app_password: "fixture-secret", host: "smtp.example.com", port: 465,
  encryption: "ssl", from_name: "Saved name", is_active: true, daily_limit: 1, sends_today: 0,
  sends_reset_at: "2026-09-07", total_sent: 2, updated_at: "2026-09-07T12:00:00Z",
};
const now = new Date("2026-09-07T13:00:00Z");

describe("explicit platform sender", () => {
  it("selects only a server-stored pool id for platform; rejects org spoofing", () => {
    expect(platformSenderId("platform", { platform_sender_pool_id: id })).toBe(id);
    expect(platformSenderId("platform", null)).toBeNull();
    expect(() => platformSenderId("org", { platform_sender_pool_id: id })).toThrow();
    expect(() => platformSenderId("platform", { platform_sender_pool_id: "sender@example.com" })).toThrow();
  });
  it("uses the saved pool address for both SMTP login and From, not Reply-To or client input", () => {
    expect(platformSmtp(base, "Display name")).toMatchObject({ username: base.email, from_email: base.email, from_name: "Display name" });
  });
  it.each(["School <other@example.com>", "School\r\nBcc: other@example.com", "School\u0000"])("rejects envelope/header injection in the display name", name => {
    expect(() => platformSmtp(base, name)).toThrow("имени отправителя");
    expect(() => platformSmtp({ ...base, from_name: name })).toThrow("имени отправителя");
  });
  it.each([null, { ...base, is_active: false }, { ...base, app_password: null }, { ...base, encryption: "none" }, { ...base, email: "a@example.com\r\nBcc: b@c.ru" }])("fails closed for unavailable/config-invalid sender", row => {
    expect(() => platformSmtp(row)).toThrow();
  });
  it("reserves one final slot under concurrent workers", async () => {
    let row = { ...base };
    let successful = 0;
    const store: PlatformSenderStore = {
      read: async () => ({ ...row }),
      reserve: async (old, next) => {
        if (old.sends_today !== row.sends_today || old.total_sent !== row.total_sent) return false;
        row = { ...row, ...next }; successful++; return true;
      },
    };
    const results = await Promise.allSettled([reservePlatformSender(store, id, null, now), reservePlatformSender(store, id, null, now)]);
    expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1);
    expect(successful).toBe(1);
    expect(row.sends_today).toBe(1);
  });
  it("resets yesterday's quota, never tomorrow's", async () => {
    let next: unknown;
    const store: PlatformSenderStore = { read: async () => ({ ...base, sends_today: 1, sends_reset_at: "2026-09-06" }), reserve: async (_, value) => { next = value; return true; } };
    await reservePlatformSender(store, id, null, now);
    expect(next).toMatchObject({ sends_today: 1, sends_reset_at: "2026-09-07", total_sent: 3 });
    store.read = async () => ({ ...base, sends_reset_at: "2026-09-08" });
    await expect(reservePlatformSender(store, id, null, now)).rejects.toThrow("дату");
  });
  it("propagates storage failure before transport and never falls back to another sender", async () => {
    await expect(reservePlatformSender({ read: async () => { throw new Error("db unavailable"); }, reserve: async () => true }, id, null, now)).rejects.toThrow("db unavailable");
    await expect(reservePlatformSender({ read: async () => ({ ...base }), reserve: async () => false }, id, null, now)).rejects.toThrow("отправка не выполнялась");
  });
});
