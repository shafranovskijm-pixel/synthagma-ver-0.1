import { useState } from "react";
import { cn } from "@/lib/utils";
import { ChevronDown, ChevronUp, Variable } from "lucide-react";
import { Button } from "@/components/ui/button";
import { VARIABLE_CATEGORIES } from "./variableCategories";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

interface VariableInsertPanelProps {
  onInsert: (variable: string) => void;
}

export function VariableInsertPanel({ onInsert }: VariableInsertPanelProps) {
  const [isOpen, setIsOpen] = useState(false);

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
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 p-3 rounded-xl border bg-muted/30">
          {Object.entries(VARIABLE_CATEGORIES).map(([catKey, category]) => (
            <div key={catKey} className="space-y-1.5">
              <div className={cn(
                "text-xs font-semibold px-2 py-1 rounded-md inline-block border",
                category.color, category.borderColor
              )}>
                {category.label}
              </div>
              <div className="flex flex-wrap gap-1">
                {category.keys.map(({ key, label }) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => onInsert(`{{${key}}}`)}
                    className={cn(
                      "text-xs px-2 py-1 rounded-md border cursor-pointer transition-all",
                      "hover:scale-105 hover:shadow-sm active:scale-95",
                      category.color, category.borderColor
                    )}
                    title={label}
                  >
                    {key}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
