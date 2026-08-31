import { describe, expect, it } from "vitest";
import { defaultMenuSettings, normalizeMenuSettings } from "@/hooks/useDashboardSettings";

describe("organization menu settings normalization", () => {
  it("keeps the unfinished Sales workspace disabled by default but preserves rollback data", () => {
    expect(defaultMenuSettings.showSales).toBe(false);
    expect(normalizeMenuSettings(null).showSales).toBe(false);
    expect(normalizeMenuSettings({}).showSales).toBe(false);
    expect(normalizeMenuSettings({ showSales: false }).showSales).toBe(false);
    expect(normalizeMenuSettings({ showSales: true }).showSales).toBe(true);
  });
});
