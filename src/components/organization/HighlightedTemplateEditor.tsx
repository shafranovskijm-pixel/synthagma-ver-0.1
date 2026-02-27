import { useRef, useEffect, useState, useCallback } from "react";
import { cn } from "@/lib/utils";
import { VARIABLE_CATEGORIES, getVariableCategoryByKey } from "./contract-template/variableCategories";
import { VariableInsertPanel } from "./contract-template/VariableInsertPanel";
import { TemplateValidation } from "./contract-template/TemplateValidation";

interface HighlightedTemplateEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  showValidation?: boolean;
  showInsertPanel?: boolean;
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
      const category = getVariableCategoryByKey(variableName);
      if (category) {
        return `<span class="inline-block px-1.5 py-0.5 rounded-md font-medium text-xs ${category.color} border ${category.borderColor}" title="${category.label}: ${variableName}">{{${variableName}}}</span>`;
      }
      return `<span class="inline-block px-1.5 py-0.5 rounded-md font-medium text-xs bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300 border border-gray-400" title="Переменная: ${variableName}">{{${variableName}}}</span>`;
    }
  );
}

export function HighlightedTemplateEditor({
  value,
  onChange,
  placeholder,
  className,
  showValidation = true,
  showInsertPanel = true,
}: HighlightedTemplateEditorProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const highlightRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isFocused, setIsFocused] = useState(false);
  const cursorPosRef = useRef<number>(0);

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
    cursorPosRef.current = e.target.selectionStart;
    onChange(e.target.value);
  };

  const handleSelect = () => {
    if (textareaRef.current) {
      cursorPosRef.current = textareaRef.current.selectionStart;
    }
  };

  const insertVariable = useCallback((variable: string) => {
    const pos = cursorPosRef.current;
    const newValue = value.slice(0, pos) + variable + value.slice(pos);
    onChange(newValue);
    // Set cursor after inserted variable
    const newPos = pos + variable.length;
    cursorPosRef.current = newPos;
    requestAnimationFrame(() => {
      if (textareaRef.current) {
        textareaRef.current.focus();
        textareaRef.current.setSelectionRange(newPos, newPos);
      }
    });
  }, [value, onChange]);

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

      {/* Variable Insert Panel */}
      {showInsertPanel && (
        <VariableInsertPanel onInsert={insertVariable} />
      )}

      {/* Editor container */}
      <div
        ref={containerRef}
        className={cn(
          "relative min-h-[400px] rounded-xl border bg-background transition-all",
          isFocused && "ring-2 ring-ring ring-offset-2 ring-offset-background",
          className
        )}
      >
        {/* Highlighted layer */}
        <div
          ref={highlightRef}
          className="absolute inset-0 overflow-auto pointer-events-none p-3 font-mono text-sm leading-relaxed whitespace-pre-wrap break-words"
          style={{ wordBreak: "break-word" }}
          dangerouslySetInnerHTML={{ __html: highlightedHtml || `<span class="text-muted-foreground">${placeholder || ""}</span>` }}
        />
        
        {/* Textarea layer */}
        <textarea
          ref={textareaRef}
          value={value}
          onChange={handleChange}
          onSelect={handleSelect}
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

      {/* Validation */}
      {showValidation && <TemplateValidation value={value} />}

      {/* Statistics */}
      <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
        {Object.entries(VARIABLE_CATEGORIES).map(([key, category]) => {
          const count = category.keys.reduce((acc, { key: varKey }) => {
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
