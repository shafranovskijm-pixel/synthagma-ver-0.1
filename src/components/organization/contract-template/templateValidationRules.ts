import { ALL_KNOWN_KEYS, REQUIRED_KEYS, COUNTERPARTY_KEYS } from "./variableCategories";
import { PROTOCOL_KNOWN_KEYS, REQUIRED_PROTOCOL_KEYS } from "@/lib/protocolTemplate";

export type TemplateKind = "contract" | "protocol";
export interface ValidationResult { type: "error" | "warning" | "ok"; message: string; }

export function extractVariables(text: string): string[] {
  const matches = text.match(/\{\{([a-zA-Z_]+)\}\}/g) || [];
  return matches.map(m => m.replace(/\{\{|\}\}/g, ""));
}


export function validateTemplateVariables(value: string, templateKind: TemplateKind = "contract"): ValidationResult[] {
    if (!value.trim()) return [];
    
    const usedVars = extractVariables(value);
    const uniqueVars = [...new Set(usedVars)];
    const items: ValidationResult[] = [];

    for (const key of (templateKind === "protocol" ? REQUIRED_PROTOCOL_KEYS : REQUIRED_KEYS)) {
      if (!uniqueVars.includes(key)) {
        items.push({ type: "error", message: templateKind === "protocol" ? `Для автоподстановки протокола отсутствует {{${key}}}` : `Обязательная переменная {{${key}}} отсутствует` });
      }
    }

    const hasCounterparty = COUNTERPARTY_KEYS.some(k => uniqueVars.includes(k));
    if (templateKind === "contract" && !hasCounterparty) {
      items.push({ type: "warning", message: "Нет переменной контрагента ({{company_name}} или {{individual_name}})" });
    }

    for (const v of uniqueVars) {
      if (!(templateKind === "protocol" ? PROTOCOL_KNOWN_KEYS : ALL_KNOWN_KEYS).includes(v)) {
        items.push({ type: "warning", message: `Неизвестная переменная {{${v}}}` });
      }
    }

    const hasPrice = uniqueVars.includes("price");
    const hasTotalPrice = uniqueVars.includes("total_price");
    if (templateKind === "contract" && hasPrice && !hasTotalPrice) {
      items.push({ type: "warning", message: "Есть {{price}}, но нет {{total_price}}" });
    }

    if (items.length === 0) {
      items.push({ type: "ok", message: templateKind === "protocol" ? `Переменные протокола проверены (${uniqueVars.length})` : `Шаблон корректен (${uniqueVars.length} переменных)` });
    }

    return items;
}
