import {
  createSenderPoolCheckHandler,
  type SenderPoolCheckRow,
  type SenderPoolCheckUpdate,
} from "./handler.ts";

function assertEquals(actual: unknown, expected: unknown): void {
  const left = JSON.stringify(actual);
  const right = JSON.stringify(expected);
  if (left !== right) {
    throw new Error(`Assertion failed: ${left} !== ${right}`);
  }
}

const sender: SenderPoolCheckRow = {
  id: "sender-1",
  email: "sender@example.com",
  app_password: "secret",
  host: "smtp.example.com",
  port: 465,
  encryption: "ssl",
  from_name: "Синтагма",
};

Deno.test("sender-pool check rejects non-admin callers before reading senders", async () => {
  let listed = false;
  const handler = createSenderPoolCheckHandler({
    authorize: async () => ({ ok: false, status: 403 }),
    listActiveSenders: async () => {
      listed = true;
      return [sender];
    },
    sendCheck: async () => {},
    updateSender: async () => {},
  });

  const response = await handler(new Request("https://example.test", { method: "POST" }));
  assertEquals(response.status, 403);
  assertEquals(listed, false);
});

Deno.test("sender-pool check works for configured senders without domain assumptions", async () => {
  const updates: Array<{ id: string; update: SenderPoolCheckUpdate }> = [];
  const handler = createSenderPoolCheckHandler({
    authorize: async () => ({ ok: true }),
    listActiveSenders: async () => [sender],
    sendCheck: async () => {},
    updateSender: async (id, update) => {
      updates.push({ id, update });
    },
  });

  const response = await handler(new Request("https://example.test", { method: "POST" }));
  assertEquals(response.status, 200);
  assertEquals(await response.json(), {
    results: [{ email: "sender@example.com", ok: true, error: null }],
    checked_count: 1,
    ok_count: 1,
  });
  assertEquals(updates[0].id, sender.id);
  assertEquals(updates[0].update.is_active, true);
});

Deno.test("sender-pool check marks an SMTP failure without exposing other senders", async () => {
  const updates: SenderPoolCheckUpdate[] = [];
  const handler = createSenderPoolCheckHandler({
    authorize: async () => ({ ok: true }),
    listActiveSenders: async () => [sender],
    sendCheck: async () => {
      throw new Error("connection failed");
    },
    updateSender: async (_id, next) => {
      updates.push(next);
    },
  });

  const response = await handler(new Request("https://example.test", { method: "POST" }));
  assertEquals(response.status, 200);
  assertEquals((await response.json()).ok_count, 0);
  assertEquals(updates[0]?.is_active, false);
  assertEquals(updates[0]?.last_error, "connection failed");
});
