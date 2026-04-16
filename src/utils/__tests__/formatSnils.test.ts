import { describe, it, expect } from "vitest";
import { formatSnils, isValidSnils } from "../formatSnils";

describe("formatSnils", () => {
  it("formats 3 digits without separator", () => {
    expect(formatSnils("123")).toBe("123");
  });
  it("formats 6 digits with one dash", () => {
    expect(formatSnils("123456")).toBe("123-456");
  });
  it("formats 9 digits with two dashes", () => {
    expect(formatSnils("123456789")).toBe("123-456-789");
  });
  it("formats full 11 digits", () => {
    expect(formatSnils("12345678901")).toBe("123-456-789 01");
  });
  it("strips non-digit characters", () => {
    expect(formatSnils("123-456-789 01")).toBe("123-456-789 01");
  });
  it("truncates to 11 digits", () => {
    expect(formatSnils("123456789012345")).toBe("123-456-789 01");
  });
  it("returns empty for empty input", () => {
    expect(formatSnils("")).toBe("");
  });
});

describe("isValidSnils", () => {
  it("returns true for 11-digit string", () => {
    expect(isValidSnils("12345678901")).toBe(true);
  });
  it("returns true for formatted SNILS", () => {
    expect(isValidSnils("123-456-789 01")).toBe(true);
  });
  it("returns false for short input", () => {
    expect(isValidSnils("12345")).toBe(false);
  });
  it("returns false for empty input", () => {
    expect(isValidSnils("")).toBe(false);
  });
});
