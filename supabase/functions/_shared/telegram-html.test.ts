import { describe, expect, it } from "vitest";
import {
  capCodePoints,
  escapeTelegramHtml,
  formatTelegramUtm,
  telegramHtmlValue,
} from "./telegram-html";

describe("Telegram HTML values", () => {
  it("escapes all Telegram HTML metacharacters after applying a code-point cap", () => {
    expect(escapeTelegramHtml(`<b>A&B</b> "x" 'y'`, 12)).toBe(
      `&lt;b&gt;A&amp;B&lt;/b&gt; &quot;`,
    );
    expect(capCodePoints("🙂🙂🙂", 2)).toBe("🙂🙂");
    expect(escapeTelegramHtml("O'Reilly", 20)).toBe("O'Reilly");
  });

  it("uses a stable fallback for missing values", () => {
    expect(telegramHtmlValue(undefined, 20)).toBe("—");
    expect(telegramHtmlValue("   ", 20, "нет")).toBe("нет");
  });

  it("caps and escapes UTM keys and values and ignores structured values", () => {
    expect(formatTelegramUtm({
      "<source>": "ads&promo",
      nested: { secret: true },
      empty: "",
    })).toBe("&lt;source&gt;=ads&amp;promo");
  });
});
