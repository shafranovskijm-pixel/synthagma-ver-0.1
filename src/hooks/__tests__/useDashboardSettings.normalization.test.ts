import { describe, expect, it } from "vitest";
import { defaultMenuSettings, normalizeMenuSettings } from "@/hooks/useDashboardSettings";

describe("organization menu settings normalization", () => {
  it("shows Sales by default and preserves an explicit opt-out", () => {
    expect(defaultMenuSettings.showSales).toBe(true);
    expect(normalizeMenuSettings(null).showSales).toBe(true);
    expect(normalizeMenuSettings({}).showSales).toBe(true);
    expect(normalizeMenuSettings({ showSales: false }).showSales).toBe(false);
    expect(normalizeMenuSettings({ showSales: true }).showSales).toBe(true);
  });
});
