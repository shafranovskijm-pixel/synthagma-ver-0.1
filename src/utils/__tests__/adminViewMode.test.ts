import { describe, it, expect, beforeEach } from "vitest";
import { getAdminViewData, isAdminViewActive, clearAdminView } from "@/utils/adminViewMode";

describe("adminViewMode", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("returns null when nothing stored", () => {
    expect(getAdminViewData()).toBeNull();
    expect(isAdminViewActive()).toBe(false);
  });

  it("parses valid JSON payload", () => {
    localStorage.setItem(
      "adminViewAsStudent",
      JSON.stringify({ userId: "u-1", name: "Иванов И.", orgReturn: "/admin" }),
    );
    const data = getAdminViewData();
    expect(data).toEqual({
      userId: "u-1",
      name: "Иванов И.",
      orgReturn: "/admin",
      orgName: undefined,
    });
    expect(isAdminViewActive()).toBe(true);
  });

  it("clears malformed JSON and returns null", () => {
    localStorage.setItem("adminViewAsStudent", "{not json");
    expect(getAdminViewData()).toBeNull();
    expect(localStorage.getItem("adminViewAsStudent")).toBeNull();
  });

  it("clears payload missing userId", () => {
    localStorage.setItem("adminViewAsStudent", JSON.stringify({ name: "X" }));
    expect(getAdminViewData()).toBeNull();
    expect(localStorage.getItem("adminViewAsStudent")).toBeNull();
  });

  it("clearAdminView removes the entry", () => {
    localStorage.setItem("adminViewAsStudent", JSON.stringify({ userId: "u-2", name: "A" }));
    clearAdminView();
    expect(localStorage.getItem("adminViewAsStudent")).toBeNull();
    expect(isAdminViewActive()).toBe(false);
  });
});
