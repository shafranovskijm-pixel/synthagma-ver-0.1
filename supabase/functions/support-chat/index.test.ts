// @vitest-environment node
import { readFileSync } from "node:fs";
import ts from "typescript";
import { describe, expect, it, vi } from "vitest";
import * as contacts from "../_shared/platform-support-contacts.ts";

function actualHandler(options: { aiText?: string; omitCurrent?: boolean; human?: boolean } = {}) {
  const inserted: any[] = [], delivered: any[] = [], orders: any[] = [];
  const history = Array.from({ length: 30 }, (_, i) => ({ id: "old-" + i, role: i % 2 ? "ai" : "user", content: i === 27 ? "Old incorrect phone: 8 (800) 555-35-35" : "turn " + i, created_at: new Date(1000 + i).toISOString() }));
  const callAI = vi.fn(async (_messages: any[], ..._rest: any[]) => ({ text: options.aiText ?? "Откройте раздел Курсы.", model: "synthetic" }));
  const client = {
    auth: { getUser: vi.fn(async () => ({ data: { user: null } })) },
    from(table: string) {
      const q: any = { select: () => q, eq: () => q, in: () => q,
        maybeSingle: async () => ({ data: { id: "conversation", status: options.human ? "human" : "ai", telegram_topic_id: 55, ai_failures_count: 0 } }),
        update: async () => ({ error: null }),
        insert: async (value: any) => { inserted.push(value); if (table === "support_messages" && value.role === "user") history.push({ ...value, created_at: new Date(100000).toISOString() }); return { error: null }; },
        order: (key: string, value?: any) => { orders.push([key, value]); return q; },
        limit: async (count: number) => {
          const selected = [...history].filter(row => !options.omitCurrent || row.id.startsWith("old-"));
          selected.sort((a, b) => orders[0]?.[1]?.ascending === false ? b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id) : a.created_at.localeCompare(b.created_at));
          return { data: selected.slice(0, count), error: null };
        },
      };
      // Existing update chains return the same thenable query shape.
      q.update = () => q;
      q.then = (resolve: any) => Promise.resolve({ error: null }).then(resolve);
      return q;
    },
  };
  const fetch = vi.fn(async (_url: string, init: any) => { delivered.push(JSON.parse(init.body)); return new Response(JSON.stringify({ ok: true, result: { message_id: 1 } }), { headers: { "Content-Type": "application/json" } }); });
  let handler!: (req: Request) => Promise<Response>;
  const source = readFileSync("supabase/functions/support-chat/index.ts", "utf8");
  const ast = ts.createSourceFile("index.ts", source, ts.ScriptTarget.Latest, true);
  const stripped = [...ast.statements.filter(ts.isImportDeclaration)].reverse().reduce((text, statement) => text.slice(0, statement.getFullStart()) + text.slice(statement.end), source);
  const executable = ts.transpileModule(stripped, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText;
  const dependencies = { ...contacts, serve: (fn: typeof handler) => { handler = fn; }, createClient: () => client, callAI, fetch,
    Deno: { env: { get: (key: string) => ({ SUPABASE_URL: "https://synthetic.invalid", SUPABASE_SERVICE_ROLE_KEY: "SYNTHETIC", TELEGRAM_BOT_TOKEN: "SYNTHETIC", TELEGRAM_SUPPORT_CHAT_ID: "55" } as Record<string, string>)[key] } },
    console: { log() {}, warn() {}, error() {} },
  };
  new Function(...Object.keys(dependencies), executable)(...Object.values(dependencies));
  return { inserted, delivered, orders, callAI, request: (message: string) => handler(new Request("https://synthetic.invalid/support-chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ conversationId: "conversation", message, guestPhone: "+7 999 123-45-67" }) })) };
}

describe("support-chat actual handler contact pipeline", () => {
  it("answers owner contacts without a model or visitor/old invented contact contamination", async () => {
    const f = actualHandler(); const result = await (await f.request("Как связаться с Максимом Шафрановским?")).json();
    expect(f.callAI).not.toHaveBeenCalled();
    expect(result.aiResponse).toContain(contacts.PLATFORM_CONTACTS.ownerEmail);
    expect(result.aiResponse).toContain(contacts.PLATFORM_CONTACTS.primaryPhone.display);
    expect(result.aiResponse).not.toMatch(/999|800/);
    expect(f.inserted.find(row => row.role === "ai").content).toBe(result.aiResponse);
    expect(f.delivered.at(-1).text).toBe("🤖 " + result.aiResponse);
  });
  it.each(["Телефон: (495) 123-45-67", "Напишите https://t.me/fake_support", "Почта: fake@example.org", "[9991234567](tel:89147213424)"])("guards the AI output before storage/Telegram/HTTP: %s", aiText => actualGuard(aiText));
  async function actualGuard(aiText: string) {
    const f = actualHandler({ aiText }); const result = await (await f.request("Как добавить курс?")).json();
    expect(f.callAI).toHaveBeenCalledOnce();
    expect(result.aiResponse).toBe(contacts.officialSupportContactReply("Контакты"));
    expect(f.inserted.filter(row => row.role === "ai").map(row => row.content)).toEqual([result.aiResponse]);
    expect(f.delivered.at(-1).text).toBe("🤖 " + result.aiResponse);
    expect(f.delivered.at(-1).text).not.toContain(aiText);
  }
  it.each([false, true])("uses latest chronological turns and current input even when absent=%s", async omitCurrent => {
    const f = actualHandler({ omitCurrent }); await f.request("Как добавить новый курс сейчас?");
    const messages = f.callAI.mock.calls[0][0];
    expect(messages[0].content).toContain(contacts.PLATFORM_CONTACTS.primaryPhone.display);
    expect(messages[0].content).toContain(contacts.PLATFORM_CONTACTS.secondaryPhone.display);
    expect(messages.at(-1)).toEqual({ role: "user", content: "Как добавить новый курс сейчас?" });
    expect(messages.filter((m: any) => m.content === "Как добавить новый курс сейчас?")).toHaveLength(1);
    expect(messages.some((m: any) => m.content === "turn 29")).toBe(true);
    expect(messages.some((m: any) => m.content === "turn 0")).toBe(false);
    expect(f.orders).toEqual([["created_at", { ascending: false }], ["id", { ascending: false }]]);
  });
  it("keeps normal mobile help and external documentation on the AI path", async () => {
    const answer = "Откройте инструкцию https://docs.example.org/mobile/35. Курс: 72 часа, дата 19.10.2026.";
    const f = actualHandler({ aiText: answer }); const result = await (await f.request("Почему курс не открывается с телефона?")).json();
    expect(f.callAI).toHaveBeenCalledOnce(); expect(result.aiResponse).toBe(answer);
  });
  it("preserves human handoff behavior without calling AI", async () => {
    const f = actualHandler({ human: true }); const result = await (await f.request("Какой телефон?")).json();
    expect(result).toMatchObject({ aiResponse: null, status: "human" }); expect(f.callAI).not.toHaveBeenCalled();
  });
});
