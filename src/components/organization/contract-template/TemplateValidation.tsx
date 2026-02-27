import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { CheckCircle2, AlertTriangle, XCircle, ChevronDown, ChevronUp } from "lucide-react";
import { ALL_KNOWN_KEYS, REQUIRED_KEYS, COUNTERPARTY_KEYS } from "./variableCategories";

interface TemplateValidationProps {
  value: string;
  compact?: boolean;
}

interface ValidationResult {
  type: "error" | "warning" | "ok";
  message: string;
}

function extractVariables(text: string): string[] {
  const matches = text.match(/\{\{([a-zA-Z_]+)\}\}/g) || [];
  return matches.map(m => m.replace(/\{\{|\}\}/g, ""));
}

export function TemplateValidation({ value, compact }: TemplateValidationProps) {
  const [expanded, setExpanded] = useState(false);

  const results = useMemo<ValidationResult[]>(() => {
    if (!value.trim()) return [];
    
    const usedVars = extractVariables(value);
    const uniqueVars = [...new Set(usedVars)];
    const items: ValidationResult[] = [];

    for (const key of REQUIRED_KEYS) {
      if (!uniqueVars.includes(key)) {
        items.push({ type: "error", message: `Обязательная переменная {{${key}}} отсутствует` });
      }
    }

    const hasCounterparty = COUNTERPARTY_KEYS.some(k => uniqueVars.includes(k));
    if (!hasCounterparty) {
      items.push({ type: "warning", message: "Нет переменной контрагента ({{company_name}} или {{individual_name}})" });
    }

    for (const v of uniqueVars) {
      if (!ALL_KNOWN_KEYS.includes(v)) {
        items.push({ type: "warning", message: `Неизвестная переменная {{${v}}}` });
      }
    }

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
  const errCount = results.filter(r => r.type === "error").length;
  const warnCount = results.filter(r => r.type === "warning").length;
  const uniqueVarsCount = [...new Set(extractVariables(value))].length;

  const StatusIcon = hasErrors ? XCircle : hasWarnings ? AlertTriangle : CheckCircle2;
  const statusColor = hasErrors ? "text-destructive" : hasWarnings ? "text-amber-500" : "text-emerald-500";

  // Compact mode: single clickable line
  if (compact) {
    const summaryText = hasErrors
      ? `${errCount} ошибок, ${warnCount} предупреждений`
      : hasWarnings
      ? `${warnCount} предупреждений`
      : `Корректен (${uniqueVarsCount} перем.)`;

    return (
      <div className={cn(
        "rounded-lg border text-xs transition-all",
        hasErrors ? "border-destructive/30 bg-destructive/5" :
        hasWarnings ? "border-amber-400/30 bg-amber-50/50 dark:bg-amber-900/5" :
        "border-emerald-400/30 bg-emerald-50/50 dark:bg-emerald-900/5"
      )}>
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className="w-full flex items-center gap-2 px-3 py-1.5 hover:opacity-80 transition-opacity"
        >
          <StatusIcon className={cn("w-3.5 h-3.5 flex-shrink-0", statusColor)} />
          <span className={cn("font-medium", statusColor)}>{summaryText}</span>
          <span className="flex-1" />
          {results.length > 1 && (
            expanded ? <ChevronUp className="w-3 h-3 text-muted-foreground" /> : <ChevronDown className="w-3 h-3 text-muted-foreground" />
          )}
        </button>
        {expanded && results.length > 1 && (
          <div className="px-3 pb-2 space-y-0.5 border-t border-border/50 pt-1.5">
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
        )}
      </div>
    );
  }

  // Full mode (legacy)
  return (
    <div className={cn(
      "rounded-xl border p-3 text-xs space-y-1.5",
      hasErrors ? "border-destructive/50 bg-destructive/5" :
      hasWarnings ? "border-amber-400/50 bg-amber-50 dark:bg-amber-900/10" :
      "border-emerald-400/50 bg-emerald-50 dark:bg-emerald-900/10"
    )}>
      <div className="font-medium text-foreground flex items-center gap-1.5">
        <StatusIcon className={cn("w-3.5 h-3.5", statusColor)} />
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
