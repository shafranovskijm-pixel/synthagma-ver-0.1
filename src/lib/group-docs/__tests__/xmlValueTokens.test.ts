import { describe, expect, it } from "vitest";
import { findUnresolvedTokens, replaceTokens, xmlTextValue } from "../../../../supabase/functions/_shared/docx-ooxml/xml";

const visibleText = (xml: string) => new DOMParser().parseFromString(
  `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">${xml}</w:document>`,
  "application/xml",
).documentElement.textContent;

describe("OOXML inserted values remain literal data", () => {
  it.each(["<w:t>[[TOPIC]]</w:t>", "<w:t>Тема: [[TOPIC]]</w:t>"])("preserves literal tokens in %s", template => {
    const topic = "Урок [[ORG_NAME]] и [[UNKNOWN]] [раздел 2]";
    const xml = replaceTokens(template, { TOPIC: topic, ORG_NAME: "Не подставлять" });
    expect(visibleText(xml)).toBe((template.includes("Тема:") ? "Тема: " : "") + topic);
    expect(findUnresolvedTokens(xml)).toEqual([]);
    expect(xml).not.toContain("Не подставлять");
  });

  it("does not reinterpret row values during the scalar replacement pass", () => {
    const row = replaceTokens("<w:t>[[NAME]]</w:t><w:t>[[GROUP]]</w:t>", { NAME: "[[GROUP]]" });
    expect(findUnresolvedTokens(row)).toEqual(["[[GROUP]]"]);
    const document = replaceTokens(row, { GROUP: "Группа 1" });
    expect(visibleText(document)).toBe("[[GROUP]]Группа 1");
    expect(findUnresolvedTokens(document)).toEqual([]);
  });

  it("still detects genuine unresolved template placeholders", () => {
    const xml = replaceTokens("<w:t>[[TOPIC]]</w:t><w:t>[[MISSING]]</w:t>", { TOPIC: "[[MISSING]]" });
    expect(findUnresolvedTokens(xml)).toEqual(["[[MISSING]]"]);
  });

  it("preserves XML metacharacters, bracket entities, Cyrillic and emoji", () => {
    const value = 'А & <Б> "В" &#91; [[КОД]] 🚀';
    expect(visibleText(`<w:t>${xmlTextValue(value)}</w:t>`)).toBe(value);
  });

  it("retains Word line-break structure and empty-value handling", () => {
    expect(xmlTextValue("[[A]]\r\n[[B]]")).toContain('</w:t><w:br/><w:t xml:space="preserve">');
    expect(replaceTokens("<w:t>[[A]]</w:t>", { A: "" })).toBe("<w:t/>");
  });
});
