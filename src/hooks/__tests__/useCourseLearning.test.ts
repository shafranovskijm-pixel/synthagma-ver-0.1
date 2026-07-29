import { describe, it, expect } from "vitest";
import { getOptionText, parseContentToBlocks } from "@/hooks/useCourseLearning";

describe("getOptionText", () => {
  it("extracts text from object with text property", () => {
    expect(getOptionText({ text: "Вариант A" })).toBe("Вариант A");
  });

  it("converts string option directly", () => {
    expect(getOptionText("Простой текст")).toBe("Простой текст");
  });

  it("converts number to string", () => {
    expect(getOptionText(42)).toBe("42");
  });

  it("handles null gracefully", () => {
    expect(getOptionText(null)).toBe("null");
  });

  it("handles object without text property", () => {
    expect(getOptionText({ value: 1 })).toBe("[object Object]");
  });
});

describe("parseContentToBlocks", () => {
  it("parses valid block JSON array", () => {
    const blocks = [
      { id: "1", type: "paragraph", content: "Hello" },
      { id: "2", type: "heading1", content: "Title" },
    ];
    const result = parseContentToBlocks(JSON.stringify(blocks));
    expect(result).toHaveLength(2);
    expect(result[0].type).toBe("paragraph");
    expect(result[1].type).toBe("heading1");
  });

  it("returns empty array for empty string", () => {
    expect(parseContentToBlocks("")).toEqual([]);
  });

  it("handles empty JSON array", () => {
    expect(parseContentToBlocks("[]")).toEqual([]);
  });

  // Backward-compatible: legacy plain-text / markdown content is preserved
  // by falling back to the markdown parser instead of being dropped.
  it("falls back to markdown parser for plain text (legacy content)", () => {
    const result = parseContentToBlocks("Just plain text");
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBeGreaterThan(0);
  });

  it("falls back to markdown parser for broken JSON (legacy content)", () => {
    const result = parseContentToBlocks("{broken json");
    expect(Array.isArray(result)).toBe(true);
  });

  it("falls back for JSON object (not array)", () => {
    const result = parseContentToBlocks('{"key": "value"}');
    expect(Array.isArray(result)).toBe(true);
  });

  // Malformed block arrays must not crash the UI — they pass through as an array.
  it("does not throw on array without valid block fields", () => {
    expect(() => parseContentToBlocks('[{"name": "test"}]')).not.toThrow();
    const result = parseContentToBlocks('[{"name": "test"}]');
    expect(Array.isArray(result)).toBe(true);
  });
});
