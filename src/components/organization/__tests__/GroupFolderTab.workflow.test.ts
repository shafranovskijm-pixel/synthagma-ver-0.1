import { describe, expect, it } from "vitest";
import {
  getVisibleGroupWorkflowItems,
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
});
