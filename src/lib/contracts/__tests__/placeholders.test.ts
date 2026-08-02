import { describe, it, expect } from "vitest";
import { findUnresolvedPlaceholders } from "../placeholders";
import { builtinTemplateFor, isBuiltinTemplateId, BUILTIN_TEMPLATE_PREFIX } from "../builtinTemplates";

describe("placeholders", () => {
  it("находит незаполненные переменные", () => {
    expect(findUnresolvedPlaceholders("<p>{{org_name}} и {{ &students_table }}</p>")).toEqual(["org_name", "students_table"]);
  });
  it("пустой список для готового документа", () => {
    expect(findUnresolvedPlaceholders("<p>ООО Синтагма</p>")).toEqual([]);
  });
});

describe("builtin templates", () => {
  it("есть шаблон для каждого сценария", () => {
    expect(builtinTemplateFor("individual").body_html).toContain("{{individual_name}}");
    expect(builtinTemplateFor("legal").body_html).toContain("{{company_name}}");
  });
  it("id встроенных шаблонов распознаются", () => {
    expect(isBuiltinTemplateId(builtinTemplateFor("legal").id)).toBe(true);
    expect(isBuiltinTemplateId("some-uuid")).toBe(false);
    expect(builtinTemplateFor("individual").id.startsWith(BUILTIN_TEMPLATE_PREFIX)).toBe(true);
  });
});
