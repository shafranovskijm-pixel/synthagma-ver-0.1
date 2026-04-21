import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { SigmaSpinner } from "@/components/ui/SigmaSpinner";
import { toast } from "sonner";
import { type EnrollmentField, validateField } from "@/lib/landing-enrollment";

interface Props {
  fields: EnrollmentField[];
  consentRequired: boolean;
  consentUrl?: string;
  submitLabel: string;
  onSubmit: (values: Record<string, string>) => Promise<void> | void;
  /** Внешние стили для Input'ов (для CTA-вариантов). */
  inputClassName?: string;
  /** Внешние стили для кнопки. */
  buttonClassName?: string;
  buttonStyle?: React.CSSProperties;
  labelClassName?: string;
  /** Скрывать подписи (использовать только placeholder). */
  hideLabels?: boolean;
}

/**
 * Универсальная форма онбординга. Рендерит произвольный набор полей из
 * `landing_content.enrollment.fields`, валидирует и сабмитит. Внешний вид
 * полностью настраивается через `inputClassName` / `buttonClassName`, чтобы
 * вписаться в любой CTA-вариант (terminal, beauty, editorial и т.д.).
 */
export function DynamicEnrollmentForm({
  fields, consentRequired, consentUrl, submitLabel, onSubmit,
  inputClassName, buttonClassName, buttonStyle, labelClassName, hideLabels,
}: Props) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [consent, setConsent] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const update = (key: string, v: string) => setValues((s) => ({ ...s, [key]: v }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    // Validate
    for (const f of fields) {
      const err = validateField(f, values[f.key] ?? "");
      if (err) { toast.error(err); return; }
    }
    if (consentRequired && !consent) {
      toast.error("Подтвердите согласие на обработку персональных данных");
      return;
    }
    setSubmitting(true);
    try { await onSubmit(values); }
    finally { setSubmitting(false); }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      {fields.map((f) => (
        <div key={f.key}>
          {!hideLabels && (
            <label className={labelClassName ?? "text-xs text-muted-foreground mb-1 block"}>
              {f.label}{f.required && " *"}
            </label>
          )}
          {f.type === "select" ? (
            <select
              className={inputClassName ?? "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"}
              value={values[f.key] ?? ""}
              onChange={(e) => update(f.key, e.target.value)}
              required={f.required}
            >
              <option value="">— выберите —</option>
              {(f.options ?? []).map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
          ) : f.type === "checkbox" ? (
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={values[f.key] === "true"}
                onCheckedChange={(c) => update(f.key, c ? "true" : "")}
              />
              <span>{f.label}</span>
            </label>
          ) : (
            <Input
              type={f.type === "email" ? "email" : "text"}
              inputMode={f.type === "phone" || f.type === "inn" ? "numeric" : undefined}
              placeholder={f.placeholder ?? f.label}
              value={values[f.key] ?? ""}
              onChange={(e) => update(f.key, e.target.value)}
              required={f.required}
              className={inputClassName}
            />
          )}
        </div>
      ))}

      {consentRequired && (
        <label className="flex items-start gap-2 text-xs text-muted-foreground cursor-pointer pt-1">
          <Checkbox checked={consent} onCheckedChange={(c) => setConsent(!!c)} className="mt-0.5" />
          <span>
            Я согласен(а) на{" "}
            <a href={consentUrl || "/personal-data"} target="_blank" rel="noopener noreferrer" className="underline">
              обработку персональных данных
            </a>
          </span>
        </label>
      )}

      <Button type="submit" size="lg" className={buttonClassName ?? "w-full"} style={buttonStyle} disabled={submitting}>
        {submitting ? <SigmaSpinner /> : submitLabel}
      </Button>
    </form>
  );
}
