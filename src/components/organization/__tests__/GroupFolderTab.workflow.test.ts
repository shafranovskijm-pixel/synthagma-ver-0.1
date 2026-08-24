import { describe, expect, it } from "vitest";
import {
  getVisibleGroupWorkflowItems,
  GROUP_WORKFLOW_LAYOUT_CLASSES,
  GROUP_WORKFLOW_ITEMS,
} from "@/components/organization/tabs/GroupFolderTab";

describe("GroupFolderTab workflow", () => {
  it("keeps the approved five-step order and maps every step to an existing workspace", () => {
    expect(GROUP_WORKFLOW_ITEMS.map(item => [item.label, item.destination])).toEqual([
      ["Участники", "members"],
      ["Обучение", "journals"],
      ["Личные дела", "explorer"],
      ["Документы группы", "docs"],
      ["ФИС ФРДО", "frdo"],
    ]);
  });

  it("marks only the mixed group-document package as Beta", () => {
    expect(GROUP_WORKFLOW_ITEMS.filter(item => item.beta).map(item => item.id)).toEqual([
      "group-documents",
    ]);
  });

  it("uses only existing section permissions and hides inaccessible steps", () => {
    expect(GROUP_WORKFLOW_ITEMS.map(item => item.permission)).toEqual([
      "students.read",
      "courses.read",
      "documents.read",
      "documents.read",
      "frdo.read",
    ]);

    const allowed = new Set(["students.read", "documents.read"]);
    expect(
      getVisibleGroupWorkflowItems((permission) => allowed.has(permission)).map(item => item.id),
    ).toEqual(["participants", "personal-files", "group-documents"]);
  });

  it("uses a container-driven workflow grid and keeps the readiness counter on one line", () => {
    expect(GROUP_WORKFLOW_LAYOUT_CLASSES.navigation).toContain("auto-fit");
    expect(GROUP_WORKFLOW_LAYOUT_CLASSES.navigation).not.toContain("min-w-max");
    expect(GROUP_WORKFLOW_LAYOUT_CLASSES.item).toContain("w-full");
    expect(GROUP_WORKFLOW_LAYOUT_CLASSES.item).toContain("min-w-0");
    expect(GROUP_WORKFLOW_LAYOUT_CLASSES.item).not.toContain("w-[210px]");
    expect(GROUP_WORKFLOW_LAYOUT_CLASSES.headerActions).toContain("grid w-full");
    expect(GROUP_WORKFLOW_LAYOUT_CLASSES.headerActions).toContain("sm:flex");
    expect(GROUP_WORKFLOW_LAYOUT_CLASSES.breadcrumbs).toContain("min-w-0");
    expect(GROUP_WORKFLOW_LAYOUT_CLASSES.breadcrumbCurrent).toContain("truncate");
    expect(GROUP_WORKFLOW_LAYOUT_CLASSES.readinessBadge).toContain("shrink-0");
    expect(GROUP_WORKFLOW_LAYOUT_CLASSES.readinessBadge).toContain("whitespace-nowrap");
  });
});
