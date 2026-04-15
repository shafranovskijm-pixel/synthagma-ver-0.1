import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { Plus, ChevronRight, Highlighter, Sparkles } from "lucide-react";
import type { BlockType } from "../types";
import { blockCategories, calloutItems } from "../types";
import { SigmaSpinner } from "@/components/ui/SigmaSpinner";

function BlockCategoryGrid({ items, onSelect, calloutItems: cItems, calloutLabel }: { items: { type: BlockType; icon: any; label: string; color?: string }[]; onSelect: (type: BlockType) => void; calloutItems?: typeof calloutItems; calloutLabel?: string }) {
  const [showCallouts, setShowCallouts] = useState(false);
  return (
    <div className="grid grid-cols-2 gap-1">
      {items.map((item) => (
        <button key={item.type} onClick={() => onSelect(item.type)} className="flex items-center gap-2 px-2 py-1.5 rounded-md text-sm hover:bg-accent transition-colors text-left">
          <item.icon className={cn("w-4 h-4 shrink-0", item.color || "text-foreground")} />
          <span className="truncate">{item.label}</span>
        </button>
      ))}
      {cItems && cItems.length > 0 && (
        <>
          <button onClick={() => setShowCallouts(!showCallouts)} className="flex items-center gap-2 px-2 py-1.5 rounded-md text-sm hover:bg-accent transition-colors text-left col-span-2">
            <Highlighter className="w-4 h-4 shrink-0 text-yellow-500" />
            <span className="truncate">{calloutLabel || "Выделение"}</span>
            <ChevronRight className={cn("w-3 h-3 ml-auto transition-transform", showCallouts && "rotate-90")} />
          </button>
          {showCallouts && cItems.map((item) => (
            <button key={item.type} onClick={() => onSelect(item.type)} className="flex items-center gap-2 px-2 py-1.5 rounded-md text-sm hover:bg-accent transition-colors text-left pl-6">
              <item.icon className={cn("w-4 h-4 shrink-0", item.color || "text-foreground")} />
              <span className="truncate">{item.label}</span>
            </button>
          ))}
        </>
      )}
    </div>
  );
}

export { BlockCategoryGrid };

export function AddBlockButton({ onAdd }: { onAdd: (type: BlockType) => void }) {
  const [open, setOpen] = useState(false);
  const handleSelect = (type: BlockType) => { setOpen(false); onAdd(type); };
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="rounded-lg gap-2"><Plus className="w-4 h-4" />Добавить блок</Button>
      </PopoverTrigger>
      <PopoverContent align="center" className="w-72 p-2">
        <Tabs defaultValue="text">
          <TabsList className="w-full h-8 p-0.5">
            {Object.entries(blockCategories).map(([key, cat]) => (
              <TabsTrigger key={key} value={key} className="text-xs px-2 py-1 h-7">{cat.label}</TabsTrigger>
            ))}
          </TabsList>
          {Object.entries(blockCategories).map(([key, cat]) => (
            <TabsContent key={key} value={key} className="mt-2">
              <BlockCategoryGrid items={cat.items} onSelect={handleSelect} calloutItems={key === "other" ? calloutItems : undefined} />
            </TabsContent>
          ))}
        </Tabs>
      </PopoverContent>
    </Popover>
  );
}

export function AIGenerateButton({ isGenerating, onClick }: { isGenerating: boolean; onClick: () => void }) {
  return (
    <Button variant="outline" size="sm" onClick={onClick} disabled={isGenerating} className="gap-2 text-xs">
      {isGenerating ? <SigmaSpinner size="xs" /> : <Sparkles className="w-3 h-3" />}
      {isGenerating ? "Генерация..." : "Сгенерировать с ИИ"}
    </Button>
  );
}
