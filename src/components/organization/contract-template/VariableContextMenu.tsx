import { useEffect, useRef, useState } from "react";
import { VARIABLE_CATEGORIES } from "./variableCategories";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface VariableContextMenuProps {
  x: number;
  y: number;
  onInsert: (variable: string) => void;
  onClose: () => void;
}

const CATEGORY_ICONS: Record<string, string> = {
  contract: "📋",
  organization: "🏢",
  company: "🏭",
  course: "📚",
  individual: "👤",
  payment: "💰",
};

export function VariableContextMenu({ x, y, onInsert, onClose }: VariableContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [openCategory, setOpenCategory] = useState<string | null>(null);
  const [adjustedPos, setAdjustedPos] = useState({ x, y });

  // Adjust position so menu doesn't overflow viewport
  useEffect(() => {
    if (menuRef.current) {
      const rect = menuRef.current.getBoundingClientRect();
      const newX = x + rect.width > window.innerWidth ? window.innerWidth - rect.width - 8 : x;
      const newY = y + rect.height > window.innerHeight ? window.innerHeight - rect.height - 8 : y;
      setAdjustedPos({ x: Math.max(8, newX), y: Math.max(8, newY) });
    }
  }, [x, y]);

  // Close on Escape or click outside
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener("keydown", handleKey);
    document.addEventListener("mousedown", handleClick);
    return () => {
      document.removeEventListener("keydown", handleKey);
      document.removeEventListener("mousedown", handleClick);
    };
  }, [onClose]);

  const handleInsert = (key: string) => {
    onInsert(`{{${key}}}`);
    onClose();
  };

  return (
    <div
      ref={menuRef}
      className="fixed z-[100] min-w-[220px] rounded-lg border bg-popover text-popover-foreground shadow-xl animate-in fade-in-0 zoom-in-95"
      style={{ left: adjustedPos.x, top: adjustedPos.y }}
    >
      {/* Header */}
      <div className="px-3 py-2 text-xs font-semibold text-muted-foreground border-b">
        Вставить переменную
      </div>

      {/* Categories */}
      <div className="py-1">
        {Object.entries(VARIABLE_CATEGORIES).map(([catKey, category]) => (
          <div
            key={catKey}
            className="relative"
            onMouseEnter={() => setOpenCategory(catKey)}
          >
            <button
              className={cn(
                "w-full flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground transition-colors",
                openCategory === catKey && "bg-accent text-accent-foreground"
              )}
              onClick={() => setOpenCategory(openCategory === catKey ? null : catKey)}
            >
              <span className="text-base">{CATEGORY_ICONS[catKey] || "📌"}</span>
              <span className="flex-1 text-left">{category.label}</span>
              <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
            </button>

            {/* Submenu */}
            {openCategory === catKey && (
              <div className="absolute left-full top-0 ml-0.5 min-w-[240px] rounded-lg border bg-popover shadow-xl py-1 animate-in fade-in-0 slide-in-from-left-1">
                {category.keys.map(({ key, label }) => (
                  <button
                    key={key}
                    className="w-full flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground transition-colors"
                    onClick={() => handleInsert(key)}
                  >
                    <span
                      className={cn(
                        "inline-block w-2 h-2 rounded-full flex-shrink-0",
                        category.color.split(" ")[0]
                      )}
                    />
                    <span className="flex-1 text-left">{label}</span>
                    <span className="text-[10px] text-muted-foreground font-mono">
                      {`{{${key}}}`}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
