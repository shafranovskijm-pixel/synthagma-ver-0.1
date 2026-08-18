import { describe, expect, it } from "vitest";

import { builtinTemplateFor } from "@/lib/contracts/builtinTemplates";
import {
  buildOrgVariables,
  findMissingVariables,
  renderTemplate,
} from "@/lib/templateRenderer";

describe("builtin contract signatory authority", () => {
  it("не утверждает род и Устав за обычную организацию", () => {
    for (const scenario of ["legal", "individual"] as const) {
      const template = builtinTemplateFor(scenario).body_html;

      expect(template).toContain("{{org_director_authority}}");
      expect(template).not.toMatch(/действующ(?:его|ей)\s+на основании\s+Устава/i);
    }
  });

  it("оставляет юридическую формулировку пустой без явных данных", () => {
    const variables = buildOrgVariables({
      name: "ООО «Обычный учебный центр»",
      inn: "2536000000",
      legal_address: "Владивосток",
      director_name: "Мария Иванова",
      director_position: "Генеральный директор",
    });

    expect(variables.org_director_authority).toBe("");
    expect(variables.org_director_acting).toBe("");
    expect(findMissingVariables("{{org_director_authority}}", variables))
      .toEqual(["org_director_authority"]);
  });

  it("использует ручную формулировку без изменения и снимает блокировку", () => {
    const authority = "действующей на основании доверенности № 7 от 01.02.2026";
    const variables = buildOrgVariables({ director_authority: authority });

    expect(renderTemplate("{{org_director_authority}}", variables)).toBe(authority);
    expect(findMissingVariables("{{org_director_authority}}", variables)).toEqual([]);
  });
});
