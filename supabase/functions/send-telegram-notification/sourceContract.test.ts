import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

function read(relativeUrl: string): string {
  return readFileSync(fileURLToPath(new URL(relativeUrl, import.meta.url)), "utf8");
}

const config = read("../../config.toml");
const indexSource = read("./index.ts");
const handlerSource = read("./handler.ts");
const contractSource = read("./contract.ts");

describe("send-telegram-notification deployment contract", () => {
  it("keeps the Supabase gateway JWT verification enabled for the relay", () => {
    const relaySection = config.match(
      /\[functions\.send-telegram-notification\]\s*\r?\nverify_jwt\s*=\s*(true|false)/,
    );
    expect(relaySection?.[1]).toBe("true");
  });

  it("serves only the hardened handler and does not add a browser CORS path", () => {
    expect(indexSource).toContain('import { createTelegramRelayHandler } from "./handler.ts"');
    expect(indexSource).toContain("Deno.serve(createTelegramRelayHandler({");
    expect(indexSource).not.toContain("Access-Control-Allow-Origin");
    expect(handlerSource).not.toContain('request.method === "OPTIONS"');
  });

  it("contains no console logging or secret and payload interpolation", () => {
    for (const source of [indexSource, handlerSource, contractSource]) {
      expect(source).not.toMatch(/console\.(?:log|info|warn|error|debug)/);
    }
    expect(handlerSource).not.toMatch(/JSON\.stringify\([^)]*(?:error|config|dependencies)/);
  });
});
