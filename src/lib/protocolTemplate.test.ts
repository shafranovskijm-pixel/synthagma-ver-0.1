import { describe, expect, it } from "vitest";
import { DEFAULT_PROTOCOL_TEMPLATE, PROTOCOL_KNOWN_KEYS, renderProtocolTemplate } from "./protocolTemplate";
import { validateTemplateVariables } from "../components/organization/contract-template/templateValidationRules";

describe("protocol template substitution and scoped technical validation", () => {
  it("accepts the existing default without contract number, counterparty or price errors", () => {
    const result = validateTemplateVariables(DEFAULT_PROTOCOL_TEMPLATE, "protocol");
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe("ok");
    expect(PROTOCOL_KNOWN_KEYS).toHaveLength(10);
  });

  it("detects a missing protocol field and a contract-only variable in protocol scope", () => {
    const result = validateTemplateVariables(DEFAULT_PROTOCOL_TEMPLATE.replace("{{protocol_date}}", "") + " {{company_name}}", "protocol");
    expect(result.some(item => item.type === "error" && item.message.includes("{{protocol_date}}"))).toBe(true);
    expect(result.some(item => item.type === "warning" && item.message.includes("{{company_name}}"))).toBe(true);
    expect(result.some(item => item.message.includes("contract_number"))).toBe(false);
  });

  it("keeps the original contract validation as the default", () => {
    const missing = validateTemplateVariables("{{org_name}} {{price}} {{unknown_key}}");
    expect(missing.filter(item => item.type === "error").map(item => item.message)).toEqual([
      "Обязательная переменная {{contract_number}} отсутствует",
      "Обязательная переменная {{contract_date}} отсутствует",
    ]);
    expect(missing.some(item => item.message.includes("переменной контрагента"))).toBe(true);
    expect(missing.some(item => item.message.includes("нет {{total_price}}"))).toBe(true);
    expect(validateTemplateVariables("{{contract_number}} {{contract_date}} {{org_name}} {{company_name}}")[0].type).toBe("ok");
    expect(validateTemplateVariables("  ")).toEqual([]);
  });

  it("substitutes the edited text and commission roles without interpreting dollars", () => {
    const result = renderProtocolTemplate("Мой текст: {{chairman_name}}\n{{commission_members}}\n{{chairman_name}}", {
      commissionMembers: [{ name: "$& Иванов", position: "Методист", role: "chairman" }, { name: "Петров", position: "", role: "secretary" }],
    });
    expect(result).toContain("Мой текст: $& Иванов");
    expect(result).toContain("Председатель: $& Иванов — Методист");
    expect(result).toContain("Секретарь: Петров");
    expect(result.endsWith("$& Иванов")).toBe(true);
  });

  it("does not invent commission members when none are configured", () => {
    const result = renderProtocolTemplate("{{commission_members}} / {{chairman_name}}", { commissionMembers: [] });
    expect(result).toBe("Состав комиссии не заполнен / Не указан");
    expect(result).not.toContain("Петров");
  });

  it("leaves unknown variables visible and never recursively substitutes member text", () => {
    const result = renderProtocolTemplate("{{unknown_key}} {{chairman_name}}", {
      commissionMembers: [{ name: "{{org_name}} <script>sample</script>", position: "", role: "chairman" }],
    });
    expect(result).toBe("{{unknown_key}} {{org_name}} <script>sample</script>");
  });
});
