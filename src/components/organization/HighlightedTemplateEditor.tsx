import { useRef, useEffect, useState, useCallback } from "react";
import { cn } from "@/lib/utils";

interface HighlightedTemplateEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}

// Variable categories with colors
const VARIABLE_CATEGORIES = {
  contract: {
    color: "bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-300",
    borderColor: "border-blue-400",
    label: "Договор",
    keys: ["contract_number", "contract_date", "additional_terms"],
  },
  organization: {
    color: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-300",
    borderColor: "border-emerald-400",
    label: "Организация",
    keys: [
      "org_name",
      "org_director_position",
      "org_director_name",
      "org_inn",
      "org_kpp",
      "org_ogrn",
      "org_address",
      "org_bank_name",
      "org_bank_bik",
      "org_bank_account",
      "org_bank_corr_account",
    ],
  },
  company: {
    color: "bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-300",
    borderColor: "border-amber-400",
    label: "Заказчик",
    keys: [
      "company_name",
      "company_director",
      "company_inn",
      "company_kpp",
      "company_ogrn",
      "company_address",
    ],
  },
  course: {
    color: "bg-purple-100 text-purple-800 dark:bg-purple-900/50 dark:text-purple-300",
    borderColor: "border-purple-400",
    label: "Курс",
    keys: ["course_title", "course_duration", "course_hours"],
  },
  individual: {
    color: "bg-cyan-100 text-cyan-800 dark:bg-cyan-900/50 dark:text-cyan-300",
    borderColor: "border-cyan-400",
    label: "Физ. лицо",
    keys: ["individual_name", "individual_passport", "individual_address", "individual_phone", "individual_email"],
  },
  payment: {
    color: "bg-rose-100 text-rose-800 dark:bg-rose-900/50 dark:text-rose-300",
    borderColor: "border-rose-400",
    label: "Оплата",
    keys: ["students_count", "price", "total_price", "total_price_words", "programs_table", "programs_list"],
  },
};

function getVariableCategory(variableName: string): {
  color: string;
  borderColor: string;
  label: string;
} | null {
  for (const [, category] of Object.entries(VARIABLE_CATEGORIES)) {
    if (category.keys.includes(variableName)) {
      return category;
    }
  }
  return null;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function highlightVariables(text: string): string {
  return escapeHtml(text).replace(
    /\{\{([a-zA-Z_]+)\}\}/g,
    (match, variableName) => {
      const category = getVariableCategory(variableName);
      if (category) {
        return `<span class="inline-block px-1.5 py-0.5 rounded-md font-medium text-xs ${category.color} border ${category.borderColor}" title="${category.label}: ${variableName}">{{${variableName}}}</span>`;
      }
      // Unknown variable - gray
      return `<span class="inline-block px-1.5 py-0.5 rounded-md font-medium text-xs bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300 border border-gray-400" title="Переменная: ${variableName}">{{${variableName}}}</span>`;
    }
  );
}

export function HighlightedTemplateEditor({
  value,
  onChange,
  placeholder,
  className,
}: HighlightedTemplateEditorProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const highlightRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isFocused, setIsFocused] = useState(false);

  const syncScroll = useCallback(() => {
    if (textareaRef.current && highlightRef.current) {
      highlightRef.current.scrollTop = textareaRef.current.scrollTop;
      highlightRef.current.scrollLeft = textareaRef.current.scrollLeft;
    }
  }, []);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.addEventListener("scroll", syncScroll);
      return () => textarea.removeEventListener("scroll", syncScroll);
    }
  }, [syncScroll]);

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    onChange(e.target.value);
  };

  const highlightedHtml = highlightVariables(value);

  return (
    <div className="space-y-3">
      {/* Legend */}
      <div className="flex flex-wrap gap-2 text-xs">
        <span className="text-muted-foreground font-medium">Категории:</span>
        {Object.entries(VARIABLE_CATEGORIES).map(([key, category]) => (
          <span
            key={key}
            className={cn(
              "inline-flex items-center px-2 py-0.5 rounded-md font-medium border",
              category.color,
              category.borderColor
            )}
          >
            {category.label}
          </span>
        ))}
        <span className="inline-flex items-center px-2 py-0.5 rounded-md font-medium bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300 border border-gray-400">
          Другие
        </span>
      </div>

      {/* Editor container */}
      <div
        ref={containerRef}
        className={cn(
          "relative min-h-[400px] rounded-xl border bg-background transition-all",
          isFocused && "ring-2 ring-ring ring-offset-2 ring-offset-background",
          className
        )}
      >
        {/* Highlighted layer (background) */}
        <div
          ref={highlightRef}
          className="absolute inset-0 overflow-auto pointer-events-none p-3 font-mono text-sm leading-relaxed whitespace-pre-wrap break-words"
          style={{ wordBreak: "break-word" }}
          dangerouslySetInnerHTML={{ __html: highlightedHtml || `<span class="text-muted-foreground">${placeholder || ""}</span>` }}
        />
        
        {/* Textarea layer (transparent, on top for editing) */}
        <textarea
          ref={textareaRef}
          value={value}
          onChange={handleChange}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          onScroll={syncScroll}
          className={cn(
            "absolute inset-0 w-full h-full resize-none bg-transparent p-3 font-mono text-sm leading-relaxed",
            "focus:outline-none",
            "text-transparent caret-foreground selection:bg-primary/20"
          )}
          placeholder=""
          spellCheck={false}
        />
      </div>

      {/* Statistics */}
      <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
        {Object.entries(VARIABLE_CATEGORIES).map(([key, category]) => {
          const count = category.keys.reduce((acc, varKey) => {
            const regex = new RegExp(`\\{\\{${varKey}\\}\\}`, "g");
            return acc + (value.match(regex)?.length || 0);
          }, 0);
          if (count === 0) return null;
          return (
            <span key={key} className="flex items-center gap-1">
              <span
                className={cn(
                  "w-2.5 h-2.5 rounded-full",
                  category.color.split(" ")[0]
                )}
              />
              {category.label}: {count}
            </span>
          );
        })}
      </div>
    </div>
  );
}
