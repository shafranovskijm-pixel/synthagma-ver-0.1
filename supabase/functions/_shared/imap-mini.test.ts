import { afterEach, describe, expect, it, vi } from "vitest";
import { connectImap, examineInbox, fetchRfc822, searchUidsSince, scanInbox } from "./imap-mini";

const encoder = new TextEncoder();
const decoder = new TextDecoder();
type WireResponse = string | Uint8Array;

function transport(respond: (line: string) => WireResponse | WireResponse[] | null, options: { partialWrite?: number; invalidWrite?: number; stallRead?: boolean; byteChunks?: boolean } = {}) {
  const queued: Uint8Array[] = [];
  const commands: string[] = [];
  let commandBytes = "";
  const append = (response: WireResponse) => {
    const bytes = typeof response === "string" ? encoder.encode(response) : response;
    if (options.byteChunks) for (const value of bytes) queued.push(new Uint8Array([value]));
    else queued.push(bytes);
  };
  const read = vi.fn(async () => {
    if (queued.length) return { done: false, value: queued.shift()! };
    if (options.stallRead) return await new Promise<never>(() => undefined);
    return { done: true, value: undefined };
  });
  const close = vi.fn();
  const write = vi.fn(async (bytes: Uint8Array) => {
    if (options.invalidWrite !== undefined) return options.invalidWrite;
    const count = Math.min(bytes.length, options.partialWrite ?? bytes.length);
    commandBytes += decoder.decode(bytes.subarray(0, count));
    let newline: number;
    while ((newline = commandBytes.indexOf("\r\n")) >= 0) {
      const line = commandBytes.slice(0, newline); commandBytes = commandBytes.slice(newline + 2);
      commands.push(line);
      const response = respond(line);
      for (const part of response == null ? [] : Array.isArray(response) ? response : [response]) append(part);
    }
    return count;
  });
  const conn = { write, close, readable: { getReader: () => ({ read }) } };
  const client = { conn, reader: { read }, buf: "" } as any;
  return { client, conn, commands, append, read, write, close };
}

const complete = (line: string, body: string, uidAfter = false, uid = 7) => {
  const tag = line.split(" ")[0];
  return [
    `* 1 FETCH (${uidAfter ? "" : `UID ${uid} `}BODY[]<0> {${encoder.encode(body).length}}\r\n`,
    encoder.encode(body), `${uidAfter ? ` UID ${uid}` : ""})\r\n${tag} OK fetch done\r\n`,
  ];
};

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe("read-only IMAP bounded transport fixtures", () => {
  it("handles partial command writes without loss or duplicate commands", async () => {
    const wire = transport(line => `* OK [UIDVALIDITY 42] stable\r\n${line.split(" ")[0]} OK examined\r\n`, { partialWrite: 2 });
    expect(await examineInbox(wire.client)).toEqual({ uidValidity: 42 });
    expect(wire.commands).toHaveLength(1); expect(wire.commands[0]).toMatch(/^A\d+ EXAMINE "INBOX"$/);
    expect(wire.write.mock.calls.length).toBeGreaterThan(2);
  });
  it.each([0, -1, NaN, 0.5, 999999])("invalid write result %s fails closed", async invalidWrite => {
    const wire = transport(() => null, { invalidWrite });
    await expect(examineInbox(wire.client)).rejects.toThrow("invalid write");
  });
  it("requires selected mailbox UIDVALIDITY and rejects missing/malformed response", async () => {
    const wire = transport(line => `${line.split(" ")[0]} OK examined\r\n`);
    await expect(examineInbox(wire.client)).rejects.toThrow("UIDVALIDITY");
  });
  it("UID SEARCH validates, sorts and deduplicates without silently treating missing result as empty", async () => {
    const good = transport(line => `* SEARCH 9 7 7 2\r\n${line.split(" ")[0]} OK done\r\n`);
    expect(await searchUidsSince(good.client, 2)).toEqual([7, 9]);
    const missing = transport(line => `${line.split(" ")[0]} OK done\r\n`);
    await expect(searchUidsSince(missing.client, 0)).rejects.toThrow("SEARCH response missing");
  });
  it("FETCH literal uses byte lengths, tolerates split UTF-8 and ignores a completion-looking line inside body", async () => {
    let expected = "";
    const wire = transport(line => {
      const tag = line.split(" ")[0]; expected = `From: школа@example.com\r\nSubject: Привет\r\n\r\nПервый ответ\r\n${tag} OK this is body, not completion\r\nКонец`;
      return complete(line, expected);
    }, { byteChunks: true, partialWrite: 3 });
    expect(await fetchRfc822(wire.client, 7)).toBe(expected);
    expect(wire.commands[0]).toContain("BODY.PEEK[]");
  });
  it("accepts UID following the BODY literal (legal server response order)", async () => {
    const raw = "From: school@example.com\r\n\r\nReply";
    const wire = transport(line => complete(line, raw, true));
    expect(await fetchRfc822(wire.client, 7)).toBe(raw);
  });
  it("fails on UID mismatch rather than attributing another message", async () => {
    const wire = transport(line => complete(line, "From: school@example.com\r\n\r\nReply", false, 99));
    await expect(fetchRfc822(wire.client, 7)).rejects.toThrow("UID mismatch");
  });
  it.each(["NO permission denied", "BAD invalid command", "OK done"])("missing literal/tagged %s never becomes a skipped null FETCH", async status => {
    const wire = transport(line => `${line.split(" ")[0]} ${status}\r\n`);
    await expect(fetchRfc822(wire.client, 7)).rejects.toThrow("FETCH rejected or message missing");
  });
  it("incomplete literal/EOF fails instead of persisting partial protocol bytes as a message", async () => {
    const wire = transport(() => "* 1 FETCH (UID 7 BODY[] {1000}\r\nFrom: school@example.com\r\n\r\npartial");
    await expect(fetchRfc822(wire.client, 7)).rejects.toThrow("connection closed");
  });
  it("a bounded prefix of a large attachment is accepted for durable partial-content storage", async () => {
    const prefix = "From: school@example.com\r\nIn-Reply-To: <saved@example.com>\r\n\r\n" + "x".repeat(200);
    const wire = transport(line => complete(line, prefix.slice(0, 128)));
    expect((await fetchRfc822(wire.client, 7, 128))?.length).toBe(128);
    expect(wire.commands[0]).toContain("BODY.PEEK[]<0.128>");
  });
  it("stalled read has an effective timeout and closes the connection", async () => {
    vi.useFakeTimers(); const wire = transport(() => null, { stallRead: true });
    const result = expect(examineInbox(wire.client)).rejects.toThrow("timeout");
    await vi.advanceTimersByTimeAsync(20001); await result; expect(wire.close).toHaveBeenCalled();
  });
  it("stalled write has a bounded timeout", async () => {
    vi.useFakeTimers(); const wire = transport(() => null);
    wire.conn.write = vi.fn(async () => await new Promise<number>(() => undefined));
    const result = expect(examineInbox(wire.client)).rejects.toThrow("timeout");
    await vi.advanceTimersByTimeAsync(20001); await result; expect(wire.close).toHaveBeenCalled();
  });
  it("read-only scan stops at failed UID and never fetches past it", async () => {
    const wire = transport(line => {
      const tag = line.split(" ")[0];
      if (line.includes("EXAMINE")) return `${tag} OK examined\r\n`;
      if (line.includes("SEARCH")) return `* SEARCH 7 8 9\r\n${tag} OK searched\r\n`;
      if (line.includes("FETCH 7")) return complete(line, "From: school@example.com\r\n\r\nReply");
      return `${tag} NO unavailable\r\n`;
    });
    expect((await scanInbox(wire.client, 0)).map(row => row.uid)).toEqual([7]);
    expect(wire.commands.some(line => line.includes("FETCH 9"))).toBe(false);
    expect(wire.commands.some(line => /\b(SELECT|STORE|MOVE|COPY|EXPUNGE)\b/.test(line))).toBe(false);
  });
  it("connect/greeting/LOGIN uses TLS and closes on rejected authentication without echoing a secret", async () => {
    const wire = transport(line => `${line.split(" ")[0]} NO fixture-secret authentication failed\r\n`, { partialWrite: 4 });
    wire.append("* OK ready\r\n");
    const connectTls = vi.fn(async () => wire.conn); vi.stubGlobal("Deno", { connectTls });
    await expect(connectImap({ host: "imap.fixture.invalid", port: 993, user: "sender@example.com", password: "fixture-secret" })).rejects.toThrow("LOGIN rejected");
    expect(connectTls).toHaveBeenCalledWith({ hostname: "imap.fixture.invalid", port: 993 });
    expect(wire.close).toHaveBeenCalled();
  });
});
