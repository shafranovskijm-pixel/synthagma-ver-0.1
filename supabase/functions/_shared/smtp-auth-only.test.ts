import { smtpAuthOnly, type AuthConnection, type AuthConnector } from "./smtp-auth-only.ts";
const cfg = { host: "smtp.example.test", port: 465, security: "ssl", username: "synthetic-user", password: "synthetic-password" };
function fixture(chunks: string[]) {
  let output = ""; let closed = false; let upgraded = 0;
  const connection: AuthConnection = {
    read(bytes) { const next = chunks.shift(); if (next === undefined) return Promise.resolve(null); const b = new TextEncoder().encode(next); bytes.set(b); return Promise.resolve(b.length); },
    write(bytes) { const size = Math.min(3, bytes.length); output += new TextDecoder().decode(bytes.subarray(0, size)); return Promise.resolve(size); },
    close() { closed = true; },
  };
  const connector: AuthConnector = { connect: () => Promise.resolve(connection), startTls: () => { upgraded++; return Promise.resolve(connection); } };
  return { connector, output: () => output, closed: () => closed, upgraded: () => upgraded };
}
Deno.test("auth-only handles fragmented multiline SMTP replies and partial writes without sending mail", async () => {
  const f = fixture(["220 rea", "dy\r\n", "250-host\r\n250-PIPE", "LINING\r\n250 AUTH LOGIN\r\n", "334 user\r\n", "334 pass\r\n", "235 ok\r\n"]);
  await smtpAuthOnly(cfg, f.connector);
  if (!f.closed() || !f.output().includes("AUTH LOGIN\r\n") || !f.output().endsWith("QUIT\r\n")) throw new Error("Incomplete handshake");
  if (/MAIL FROM|RCPT TO|DATA\r\n/.test(f.output())) throw new Error("Auth-only test attempted delivery");
});
Deno.test("auth-only upgrades STARTTLS and repeats EHLO", async () => {
  const f = fixture(["220 ready\r\n", "250 STARTTLS\r\n", "220 upgrade\r\n", "250 AUTH LOGIN\r\n", "334 user\r\n", "334 pass\r\n", "235 ok\r\n"]);
  await smtpAuthOnly({ ...cfg, security: "starttls" }, f.connector);
  if (f.upgraded() !== 1 || f.output().split("EHLO ").length !== 3) throw new Error("Invalid STARTTLS handshake");
});
Deno.test("auth failure never includes server text or credentials and closes connection", async () => {
  const f = fixture(["220 ready\r\n", "250 AUTH LOGIN\r\n", "334 user\r\n", "334 pass\r\n", "535 synthetic-password private-server-message\r\n"]);
  let message = ""; try { await smtpAuthOnly(cfg, f.connector); } catch (error) { message = String(error); }
  if (!message.includes("535") || /synthetic-password|private-server-message/.test(message) || !f.closed()) throw new Error("Unsafe auth failure");
});
