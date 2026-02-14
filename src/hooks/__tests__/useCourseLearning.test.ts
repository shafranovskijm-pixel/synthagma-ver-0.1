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

  it("returns empty array for plain text", () => {
    expect(parseContentToBlocks("Just plain text")).toEqual([]);
  });

  it("returns empty array for invalid JSON", () => {
    expect(parseContentToBlocks("{broken json")).toEqual([]);
  });

  it("returns empty array for JSON object (not array)", () => {
    expect(parseContentToBlocks('{"key": "value"}')).toEqual([]);
  });

  it("returns empty array for array without type/id fields", () => {
    expect(parseContentToBlocks('[{"name": "test"}]')).toEqual([]);
  });

  it("returns empty array for empty string", () => {
    expect(parseContentToBlocks("")).toEqual([]);
  });

  it("handles empty JSON array", () => {
    expect(parseContentToBlocks("[]")).toEqual([]);
  });
});
