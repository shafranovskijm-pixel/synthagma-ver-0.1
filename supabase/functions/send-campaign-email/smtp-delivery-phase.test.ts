import { afterEach, describe, expect, it, vi } from "vitest";
import { sendSmtpEmail, SmtpDeliveryError, type SmtpConfig } from "../_shared/smtp-sender";

vi.mock("../_shared/rate-limiter.ts", () => ({ checkRateLimit: vi.fn() }));

const cfg: SmtpConfig = { host: "smtp.fixture.invalid", port: 465, username: "sender@example.com", password: "fixture-only", encryption: "ssl", from_email: "sender@example.com" };
const options = { to: "recipient@example.com", subject: "Fixture", html: "<p>Fixture</p>", messageId: "<fixed-fixture@example.com>" };
const prefix = ["220 ready\r\n", "250 hello\r\n", "334 user\r\n", "334 pass\r\n", "235 authenticated\r\n", "250 sender\r\n", "250 recipient\r\n", "354 data\r\n"];

function mockConnection(replies: Array<string | Error | null>, writeBodyError?: Error, maxWriteBytes?: number) {
  const writes: string[] = [];
  const accepted: Uint8Array[] = [];
  const connection = {
    read: vi.fn(async (buffer: Uint8Array) => {
      const next = replies.shift();
      if (next instanceof Error) throw next;
      if (next == null) return null;
      const bytes = new TextEncoder().encode(next);
      buffer.set(bytes); return bytes.length;
    }),
    write: vi.fn(async (buffer: Uint8Array) => {
      const text = new TextDecoder().decode(buffer);
      writes.push(text);
      if (writeBodyError && text.includes("Message-ID:")) throw writeBodyError;
      const written = Math.min(maxWriteBytes ?? buffer.length, buffer.length);
      accepted.push(buffer.slice(0, written));
      return written;
    }),
    close: vi.fn(),
  };
  const connect = vi.fn(async () => connection);
  vi.stubGlobal("Deno", { connect, connectTls: connect, startTls: connect });
  return { connection, writes, connect, accepted };
}
afterEach(() => { vi.unstubAllGlobals(); });

describe("SMTP delivery knowledge without live transport", () => {
  it("invalid address is definitely not sent and never opens a connection", async () => {
    const mock = mockConnection([]);
    await expect(sendSmtpEmail(cfg, { ...options, to: "not-an-address" })).rejects.toMatchObject({ delivery: "not_sent", name: "SmtpDeliveryError" });
    expect(mock.connect).not.toHaveBeenCalled();
  });

  it("connection failure is definitely not sent", async () => {
    vi.stubGlobal("Deno", { connectTls: vi.fn(async () => { throw new Error("connect refused"); }) });
    await expect(sendSmtpEmail(cfg, options)).rejects.toMatchObject({ delivery: "not_sent" });
  });

  it("explicit RCPT rejection before DATA is definitely not sent", async () => {
    const mock = mockConnection([...prefix.slice(0, 6), "550 recipient denied\r\n"]);
    await expect(sendSmtpEmail(cfg, options)).rejects.toMatchObject({ delivery: "not_sent" });
    expect(mock.writes.some(text => text.includes("Message-ID:"))).toBe(false);
  });

  it("a partial/error DATA-body write is uncertain", async () => {
    mockConnection([...prefix], new Error("write interrupted"));
    await expect(sendSmtpEmail(cfg, options)).rejects.toMatchObject({ delivery: "unknown" });
  });

  it.each([null, new Error("socket reset")])("lost DATA acknowledgement is uncertain", async response => {
    mockConnection([...prefix, response]);
    await expect(sendSmtpEmail(cfg, options)).rejects.toMatchObject({ delivery: "unknown" });
  });

  it("a complete explicit 550 after DATA proves rejection", async () => {
    mockConnection([...prefix, "550 message rejected\r\n"]);
    try {
      await sendSmtpEmail(cfg, options);
      throw new Error("expected failure");
    } catch (error) {
      expect(error).toBeInstanceOf(SmtpDeliveryError);
      expect(error).toMatchObject({ delivery: "not_sent" });
    }
  });

  it("mixed response codes after DATA do not prove rejection or acceptance", async () => {
    mockConnection([...prefix, "250-accepted\r\n550 rejected\r\n"]);
    await expect(sendSmtpEmail(cfg, options)).rejects.toMatchObject({ delivery: "unknown" });
  });

  it("250 acceptance is preserved when QUIT fails and keeps the fixed Message-ID", async () => {
    const mock = mockConnection([...prefix, "250 accepted\r\n", new Error("QUIT disconnected")]);
    expect(await sendSmtpEmail(cfg, options)).toEqual({ messageId: options.messageId });
    expect(mock.writes.find(text => text.includes("Message-ID:"))).toContain(`Message-ID: ${options.messageId}`);
  });

  it("partial writes preserve every command and the entire DATA payload exactly once", async () => {
    const mock = mockConnection([...prefix, "250 accepted\r\n", "221 bye\r\n"], undefined, 7);
    expect(await sendSmtpEmail(cfg, options)).toEqual({ messageId: options.messageId });
    const wire = new TextDecoder().decode(Uint8Array.from(mock.accepted.flatMap(part => Array.from(part))));
    const fullBodyAttempt = mock.writes.find(text => text.includes("Message-ID:"));
    expect(fullBodyAttempt).toBeDefined();
    expect(wire).toBe([
      "EHLO localhost", "AUTH LOGIN", btoa(cfg.username), btoa(cfg.password),
      `MAIL FROM:<${cfg.from_email}>`, `RCPT TO:<${options.to}>`, "DATA",
    ].join("\r\n") + "\r\n" + fullBodyAttempt + "QUIT\r\n");
    expect(wire.match(/Message-ID:/g)).toHaveLength(1);
    expect(wire.match(/\r\n\.\r\n/g)).toHaveLength(1);
    expect(mock.connection.write.mock.calls.length).toBeGreaterThan(10);
  });

  it.each([0, null, -1, 0.5, 1_000_000])("invalid command write progress %s fails before DATA", async result => {
    const mock = mockConnection([...prefix]);
    mock.connection.write.mockResolvedValueOnce(result as number);
    await expect(sendSmtpEmail(cfg, options)).rejects.toMatchObject({ delivery: "not_sent" });
    expect(mock.connection.write).toHaveBeenCalledTimes(1);
  });

  it.each([0, null])("zero/EOF DATA write progress %s stays uncertain", async result => {
    const mock = mockConnection([...prefix]);
    const normalWrite = mock.connection.write.getMockImplementation()!;
    mock.connection.write.mockImplementation(async buffer => {
      if (new TextDecoder().decode(buffer).includes("Message-ID:")) return result as number;
      return normalWrite(buffer);
    });
    await expect(sendSmtpEmail(cfg, options)).rejects.toMatchObject({ delivery: "unknown" });
  });
});
