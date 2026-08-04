import { describe, it, expect } from "vitest";
import { resolveFrdoReadiness, frdoReadinessLabel, FRDO_REQUIRED_FIELDS } from "@/lib/frdo/readiness";
import { filterByGroupMembers, groupContextPath, groupFolderPath } from "@/lib/groups/groupContext";

describe("resolveFrdoReadiness", () => {
  it("три заполненных поля не дают complete", () => {
    const res = resolveFrdoReadiness({ birth_date: "1990-01-01", snils: "123-456-789 00", gender: "М" });
    expect(res.status).toBe("incomplete");
    expect(res.missingFields).toEqual(["Фамилия", "Имя"]);
  });

  it("нет записи → empty со всеми полями", () => {
    const res = resolveFrdoReadiness(null);
    expect(res.status).toBe("empty");
    expect(res.missingFields).toHaveLength(FRDO_REQUIRED_FIELDS.length);
  });

  it("ФИО из профиля закрывает фамилию/имя, но не СНИЛС", () => {
    const res = resolveFrdoReadiness(
      { birth_date: "1990-01-01", gender: "М", snils: "" },
      "Иванов Иван Иванович",
    );
    expect(res.status).toBe("incomplete");
    expect(res.missingFields).toEqual(["СНИЛС"]);
  });

  it("все поля заполнены → complete", () => {
    const res = resolveFrdoReadiness({
      last_name: "Иванов", first_name: "Иван",
      birth_date: "1990-01-01", gender: "М", snils: "123-456-789 00",
    });
    expect(res).toEqual({ status: "complete", missingFields: [] });
    expect(frdoReadinessLabel(res.status)).toBe("Готово");
  });

  it("пробелы не считаются заполненным значением", () => {
    const res = resolveFrdoReadiness({ last_name: "  ", first_name: "Иван", birth_date: "1990-01-01", gender: "М", snils: "1" });
    expect(res.missingFields).toEqual(["Фамилия"]);
  });
});

describe("контекст группы в журналах", () => {
  const rows = [
    { user_id: "a", course_id: "c1" },
    { user_id: "b", course_id: "c1" },
    { user_id: "c", course_id: "c1" },
  ];

  it("две группы на одном курсе не смешиваются", () => {
    const group1 = filterByGroupMembers(rows, ["a", "b"]);
    const group2 = filterByGroupMembers(rows, ["c"]);
    expect(group1.map((r) => r.user_id)).toEqual(["a", "b"]);
    expect(group2.map((r) => r.user_id)).toEqual(["c"]);
  });

  it("без контекста группы фильтр не применяется", () => {
    expect(filterByGroupMembers(rows, null)).toHaveLength(3);
  });

  it("ссылка в журналы содержит возврат в группу", () => {
    const url = groupContextPath("journals", { groupId: "g1", courseId: "c1" });
    expect(url).toContain("tab=journals");
    expect(url).toContain("groupId=g1");
    expect(url).toContain("returnToGroupId=g1");
    expect(groupFolderPath("g1")).toContain("groupId=g1");
  });
});
