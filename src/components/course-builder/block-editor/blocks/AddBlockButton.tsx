import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { Plus, Search, Sparkles } from "lucide-react";
import type { BlockType, AIShortcutType } from "../types";
import { blockCategories, blockDescriptions, blockIconBg, aiShortcuts } from "../types";
import { SigmaSpinner } from "@/components/ui/SigmaSpinner";

type GridItem = {
  type: BlockType | AIShortcutType;
  icon: any;
  label: string;
  group: string;
  isAI?: boolean;
  description?: string;
};

const allItems: GridItem[] = [
  ...blockCategories.basic.items.map((i) => ({ ...i, group: blockCategories.basic.label })),
  ...blockCategories.interactive.items.map((i) => ({ ...i, group: blockCategories.interactive.label })),
  ...aiShortcuts.map((s) => ({ type: s.type, icon: s.icon, label: s.label, group: "ИИ", isAI: true, description: s.description })),
];

function BlockGrid({ items, onPick }: { items: GridItem[]; onPick: (item: GridItem) => void }) {
  return (
    <TooltipProvider delayDuration={400}>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {items.map((item) => {
          const iconClass = blockIconBg[item.type as BlockType] || "text-primary bg-primary/10";
          const description = item.description || blockDescriptions[item.type as BlockType] || "";
          return (
            <Tooltip key={item.type}>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={() => onPick(item)}
                  title={description}
                  className={cn(
                    "group flex flex-col items-center justify-center gap-2 rounded-xl border-2 p-4 text-center transition-all relative",
                    "border-border/60 bg-card hover:border-primary hover:bg-primary/10 hover:shadow-sm hover:scale-[1.02]",
                  )}
                >
                  {item.isAI && (
                    <span className="absolute top-1.5 right-1.5 text-[9px] font-semibold uppercase tracking-wide bg-gradient-to-r from-primary to-purple-500 text-primary-foreground rounded-full px-1.5 py-0.5 leading-none">
                      AI
                    </span>
                  )}
                  <div className={cn("w-11 h-11 rounded-xl flex items-center justify-center", iconClass)}>
                    <item.icon className="w-5 h-5" />
                  </div>
                  <span className="text-sm font-medium leading-tight text-foreground group-hover:text-primary">
                    {item.label}
                  </span>
                </button>
              </TooltipTrigger>
              {description && (
                <TooltipContent side="top" className="max-w-[240px] text-xs leading-relaxed">
                  {description}
                </TooltipContent>
              )}
            </Tooltip>
          );
        })}
      </div>
    </TooltipProvider>
  );
}

function BlockPicker({ onSelect }: { onSelect: (item: GridItem) => void }) {
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return allItems;
    return allItems.filter((i) => i.label.toLowerCase().includes(q));
  }, [search]);

  const grouped = useMemo(() => {
    const groups: Record<string, GridItem[]> = {};
    const order: string[] = [];
    for (const item of filtered) {
      if (!groups[item.group]) { groups[item.group] = []; order.push(item.group); }
      groups[item.group].push(item);
    }
    return order.map((g) => ({ group: g, items: groups[g] }));
  }, [filtered]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && filtered.length === 1) {
      e.preventDefault();
      onSelect(filtered[0]);
    }
  };

  return (
    <div className="flex flex-col gap-3 max-h-[calc(100vh-6rem)] sm:max-h-[calc(100vh-4rem)]">
      <div className="flex items-center justify-between gap-3 shrink-0">
        <h3 className="text-base font-semibold text-foreground">Выберите блок</h3>
        <span className="text-[11px] text-muted-foreground hidden sm:inline">Один клик — добавить</span>
      </div>

      <div className="relative shrink-0">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
        <Input
          autoFocus
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Поиск блока"
          className="h-8 text-sm pl-8"
        />
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto space-y-4 pr-1 -mr-1">
        {grouped.map(({ group, items }) => (
          <div key={group}>
            <p className="text-[10px] uppercase tracking-wide font-semibold text-muted-foreground px-1 mb-2 flex items-center gap-1.5">
              {group === "ИИ" && <Sparkles className="w-3 h-3 text-primary" />}
              {group}
            </p>
            <BlockGrid items={items} onPick={onSelect} />
          </div>
        ))}
        {grouped.length === 0 && (
          <p className="text-xs text-muted-foreground text-center py-6">Ничего не найдено</p>
        )}
      </div>
    </div>
  );
}

// Backward-compat export — used by SortableBlockItem
function BlockCategoryGrid({ items, onSelect }: { items: { type: BlockType; icon: any; label: string; color?: string }[]; onSelect: (type: BlockType) => void }) {
  return (
    <div className="grid grid-cols-3 gap-1.5">
      {items.map((item) => (
        <button
          key={item.type}
          onClick={() => onSelect(item.type)}
          className="flex flex-col items-center justify-center gap-1.5 p-2.5 rounded-xl bg-muted/40 hover:bg-primary/10 border border-transparent hover:border-primary/30 transition-all aspect-square"
        >
          <item.icon className={cn("w-5 h-5 shrink-0", item.color || "text-primary")} />
          <span className="text-[11px] font-medium text-foreground text-center leading-tight line-clamp-2">{item.label}</span>
        </button>
      ))}
    </div>
  );
}

export { BlockCategoryGrid };

// Resolve picked item → BlockType + optional pendingAI flag for the new block.
function resolvePick(item: GridItem): { type: BlockType; pendingAI?: AIShortcutType } {
  if (item.isAI) {
    const shortcut = aiShortcuts.find((s) => s.type === item.type);
    if (shortcut) return { type: shortcut.realType, pendingAI: shortcut.type };
  }
  return { type: item.type as BlockType };
}

export function AddBlockButton({ onAdd }: { onAdd: (type: BlockType, pendingAI?: AIShortcutType) => void }) {
  const [open, setOpen] = useState(false);
  const handleSelect = (item: GridItem) => {
    setOpen(false);
    const { type, pendingAI } = resolvePick(item);
    onAdd(type, pendingAI);
  };
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="rounded-lg gap-2"><Plus className="w-4 h-4" />Добавить блок</Button>
      </PopoverTrigger>
      <PopoverContent align="center" sideOffset={8} collisionPadding={16} avoidCollisions className="w-[560px] max-w-[calc(100vw-1rem)] max-h-[var(--radix-popover-content-available-height)] p-3 sm:p-4 overflow-hidden">
        <BlockPicker onSelect={handleSelect} />
      </PopoverContent>
    </Popover>
  );
}

// Compact "+" trigger used between blocks (left of block on hover)
export function InlineAddBlockButton({ onAdd }: { onAdd: (type: BlockType, pendingAI?: AIShortcutType) => void }) {
  const [open, setOpen] = useState(false);
  const handleSelect = (item: GridItem) => {
    setOpen(false);
    const { type, pendingAI } = resolvePick(item);
    onAdd(type, pendingAI);
  };
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          className="h-10 w-10 rounded-full bg-primary text-primary-foreground hover:bg-primary/90 hover:scale-110 flex items-center justify-center transition-all shadow-lg shadow-primary/30 ring-2 ring-primary/20 hover:ring-primary/40"
          title="Добавить блок"
        >
          <Plus className="w-5 h-5" strokeWidth={2.5} />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" side="right" collisionPadding={16} className="w-[560px] max-w-[calc(100vw-2rem)] p-4">
        <BlockPicker onSelect={handleSelect} />
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
