import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// Source-level deployment contract only; not proof of a deployed gateway.
describe("ordinary mail worker gateway configuration", () => {
  const config = readFileSync(resolve(__dirname, "../../config.toml"), "utf8");
  it.each(["inbox-scanner", "notify-mailing-campaign-report"])("lets %s validate the existing cron credential in its handler", (name) => {
    const sections = config.split(`[functions.${name}]`);
    expect(sections).toHaveLength(2);
    expect(sections[1].split(/\n\[/)[0]).toMatch(/verify_jwt\s*=\s*false/);
  });
  it("preserves the Telegram relay gateway JWT gate", () => {
    expect(config.split("[functions.send-telegram-notification]")[1].split(/\n\[/)[0]).toMatch(/verify_jwt\s*=\s*true/);
  });
});
