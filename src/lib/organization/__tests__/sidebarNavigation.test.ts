import { describe, expect, it } from "vitest";
import { splitPinnedNavigation } from "@/lib/organization/sidebarNavigation";

type Section = "people" | "learning" | "documents" | "management";

const items = [
  { id: "students", section: "people" as const },
  { id: "courses", section: "learning" as const },
  { id: "documents", section: "documents" as const },
  { id: "settings", section: "management" as const },
];

const sectionOrder: Section[] = [
  "people",
  "learning",
  "documents",
  "management",
];

describe("splitPinnedNavigation", () => {
  it("keeps pinned order and removes pinned items from regular sections", () => {
    const result = splitPinnedNavigation(
      items,
      ["documents", "courses"],
      sectionOrder,
    );

    expect(result.pinnedItems.map((item) => item.id)).toEqual([
      "documents",
      "courses",
    ]);
    expect(
      result.groupedItems.flatMap((group) =>
        group.items.map((item) => item.id),
      ),
    ).toEqual(["students", "settings"]);
  });

  it("ignores stale and repeated pinned ids without dropping visible items", () => {
    const result = splitPinnedNavigation(
      items,
      ["missing", "courses", "courses"],
      sectionOrder,
    );

    expect(result.pinnedItems.map((item) => item.id)).toEqual(["courses"]);
    expect(
      result.groupedItems.flatMap((group) =>
        group.items.map((item) => item.id),
      ),
    ).toEqual(["students", "documents", "settings"]);
  });

  it("preserves the explicit section order", () => {
    const result = splitPinnedNavigation(items, [], sectionOrder);

    expect(result.groupedItems.map((group) => group.section)).toEqual(
      sectionOrder,
    );
  });
});
