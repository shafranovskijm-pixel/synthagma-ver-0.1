import { useState } from "react";
import { cn } from "@/lib/utils";
import { ChevronDown, ChevronUp, Variable } from "lucide-react";
import { Button } from "@/components/ui/button";
import { VARIABLE_CATEGORIES } from "./variableCategories";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ScrollArea } from "@/components/ui/scroll-area";

interface VariableInsertPanelProps {
  onInsert: (variable: string) => void;
  sidebarMode?: boolean;
}

export function VariableInsertPanel({ onInsert, sidebarMode }: VariableInsertPanelProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [expandedCats, setExpandedCats] = useState<Set<string>>(new Set(Object.keys(VARIABLE_CATEGORIES)));

  const toggleCat = (key: string) => {
    setExpandedCats(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const content = (
    <div className="space-y-2">
      {Object.entries(VARIABLE_CATEGORIES).map(([catKey, category]) => (
        <div key={catKey}>
          <button
            type="button"
            onClick={() => toggleCat(catKey)}
            className={cn(
              "w-full text-left text-xs font-semibold px-2 py-1.5 rounded-lg flex items-center justify-between border transition-colors",
              category.color, category.borderColor,
              "hover:opacity-80"
            )}
          >
            <span>{category.label}</span>
            {expandedCats.has(catKey) ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </button>
          {expandedCats.has(catKey) && (
            <div className="flex flex-wrap gap-1 mt-1.5 pl-1">
              {category.keys.map(({ key, label }) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => onInsert(`{{${key}}}`)}
                  className={cn(
                    "text-[11px] px-1.5 py-0.5 rounded border cursor-pointer transition-all",
                    "hover:scale-105 hover:shadow-sm active:scale-95",
                    category.color, category.borderColor
                  )}
                  title={label}
                >
                  {key}
                </button>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );

  // Desktop sidebar: always visible with scroll
  if (sidebarMode) {
    return (
      <>
        {/* Desktop: always visible sidebar */}
        <div className="hidden lg:block">
          <div className="rounded-xl border bg-muted/20 p-2.5">
            <div className="flex items-center gap-1.5 mb-2.5 px-1">
              <Variable className="w-3.5 h-3.5 text-muted-foreground" />
              <span className="text-xs font-semibold text-muted-foreground">Переменные</span>
            </div>
            <ScrollArea className="h-[460px]">
              {content}
            </ScrollArea>
          </div>
        </div>

        {/* Mobile: collapsible */}
        <div className="lg:hidden">
          <Collapsible open={isOpen} onOpenChange={setIsOpen}>
            <CollapsibleTrigger asChild>
              <Button variant="outline" size="sm" className="rounded-xl gap-2 w-full justify-between h-8 text-xs">
                <span className="flex items-center gap-2">
                  <Variable className="w-3.5 h-3.5" />
                  Переменные
                </span>
                {isOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="mt-2">
              <div className="p-2.5 rounded-xl border bg-muted/20">
                {content}
              </div>
            </CollapsibleContent>
          </Collapsible>
        </div>
      </>
    );
  }

  // Fallback: old collapsible style
  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <CollapsibleTrigger asChild>
        <Button variant="outline" size="sm" className="rounded-xl gap-2 w-full justify-between">
          <span className="flex items-center gap-2">
            <Variable className="w-4 h-4" />
            Вставить переменную
          </span>
          {isOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent className="mt-2">
        <div className="p-3 rounded-xl border bg-muted/30">
          {content}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
