import { useMemo } from "react";
import { cn } from "@/lib/utils";
import { CheckCircle2, AlertTriangle, XCircle } from "lucide-react";
import { ALL_KNOWN_KEYS, REQUIRED_KEYS, COUNTERPARTY_KEYS } from "./variableCategories";

interface TemplateValidationProps {
  value: string;
}

interface ValidationResult {
  type: "error" | "warning" | "ok";
  message: string;
}

function extractVariables(text: string): string[] {
  const matches = text.match(/\{\{([a-zA-Z_]+)\}\}/g) || [];
  return matches.map(m => m.replace(/\{\{|\}\}/g, ""));
}

export function TemplateValidation({ value }: TemplateValidationProps) {
  const results = useMemo<ValidationResult[]>(() => {
    if (!value.trim()) return [];
    
    const usedVars = extractVariables(value);
    const uniqueVars = [...new Set(usedVars)];
    const items: ValidationResult[] = [];

    // Check required variables
    for (const key of REQUIRED_KEYS) {
      if (!uniqueVars.includes(key)) {
        items.push({ type: "error", message: `Обязательная переменная {{${key}}} отсутствует` });
      }
    }

    // Check counterparty
    const hasCounterparty = COUNTERPARTY_KEYS.some(k => uniqueVars.includes(k));
    if (!hasCounterparty) {
      items.push({ type: "warning", message: "Нет переменной контрагента ({{company_name}} или {{individual_name}})" });
    }

    // Check unknown variables
    for (const v of uniqueVars) {
      if (!ALL_KNOWN_KEYS.includes(v)) {
        items.push({ type: "warning", message: `Неизвестная переменная {{${v}}}` });
      }
    }

    // Check price consistency
    const hasPrice = uniqueVars.includes("price");
    const hasTotalPrice = uniqueVars.includes("total_price");
    if (hasPrice && !hasTotalPrice) {
      items.push({ type: "warning", message: "Есть {{price}}, но нет {{total_price}}" });
    }

    if (items.length === 0) {
      items.push({ type: "ok", message: `Шаблон корректен (${uniqueVars.length} переменных)` });
    }

    return items;
  }, [value]);

  if (results.length === 0) return null;

  const hasErrors = results.some(r => r.type === "error");
  const hasWarnings = results.some(r => r.type === "warning");

  return (
    <div className={cn(
      "rounded-xl border p-3 text-xs space-y-1.5",
      hasErrors ? "border-destructive/50 bg-destructive/5" :
      hasWarnings ? "border-amber-400/50 bg-amber-50 dark:bg-amber-900/10" :
      "border-emerald-400/50 bg-emerald-50 dark:bg-emerald-900/10"
    )}>
      <div className="font-medium text-foreground flex items-center gap-1.5">
        {hasErrors ? <XCircle className="w-3.5 h-3.5 text-destructive" /> :
         hasWarnings ? <AlertTriangle className="w-3.5 h-3.5 text-amber-500" /> :
         <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />}
        Валидация шаблона
      </div>
      {results.map((r, i) => (
        <div key={i} className={cn(
          "flex items-start gap-1.5",
          r.type === "error" ? "text-destructive" :
          r.type === "warning" ? "text-amber-600 dark:text-amber-400" :
          "text-emerald-600 dark:text-emerald-400"
        )}>
          <span className="mt-0.5">
            {r.type === "error" ? "✕" : r.type === "warning" ? "⚠" : "✓"}
          </span>
          <span>{r.message}</span>
        </div>
      ))}
    </div>
  );
}
