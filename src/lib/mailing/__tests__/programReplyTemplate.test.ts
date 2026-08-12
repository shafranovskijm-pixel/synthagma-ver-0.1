import { describe, expect, it } from "vitest";
import { buildProgramReplyTemplate } from "../programReplyTemplate";

describe("program reply draft", () => {
  it("uses the approved August course facts and complete price ladder", () => {
    const draft = buildProgramReplyTemplate({});

    expect(draft).toContain("17–21 августа");
    expect(draft).toContain("09:00–18:00");
    expect(draft).toContain("50 часов — 17 300 ₽");
    expect(draft).toContain("150 часов — 31 000 ₽");
    expect(draft).toContain("250 часов — 43 900 ₽");
    expect(draft).toContain("500 часов — 63 200 ₽");
    expect(draft).toContain("1000 часов — 99 300 ₽");
    expect(draft).toContain("дополнительная скидка 15%");
  });

  it("highlights a duration detected in the incoming reply", () => {
    const draft = buildProgramReplyTemplate({ remoteName: "Анна", interestHours: 150 });

    expect(draft.startsWith("Анна, добрый день.")).toBe(true);
    expect(draft).toContain("Вы указали программу 150 часов: 31 000 ₽");
    expect(draft).toContain("для постоянных клиентов — 27 900 ₽");
  });

  it("removes header-like characters from a display name", () => {
    const draft = buildProgramReplyTemplate({ remoteName: "Анна\r\n<Bcc: test@example.com>" });

    expect(draft).not.toContain("\r");
    expect(draft).not.toContain("\nBcc:");
  });
});
