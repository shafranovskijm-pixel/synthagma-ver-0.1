import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { EDGE_FUNCTIONS } from "../devToolsData";

describe("Admin API monitor security boundary", () => {
  it("marks the Telegram relay as server-only", () => {
    expect(EDGE_FUNCTIONS.find((item) => item.name === "send-telegram-notification")).toMatchObject({
      browserHealthCheck: false,
    });
  });

  it("filters server-only functions before browser invocation", () => {
    const source = readFileSync(
      resolve(process.cwd(), "src/components/admin/devtools/ApiMonitorTab.tsx"),
      "utf8",
    );
    expect(source).toContain("EDGE_FUNCTIONS.filter((fn) => fn.browserHealthCheck !== false)");
  });
});
