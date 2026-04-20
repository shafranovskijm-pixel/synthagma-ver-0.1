import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { Plus, Search, Sparkles } from "lucide-react";
import type { BlockType } from "../types";
import { blockCategories, calloutItems } from "../types";
import { SigmaSpinner } from "@/components/ui/SigmaSpinner";

type GridItem = { type: BlockType; icon: any; label: string; color?: string; group: string };

const allItems: GridItem[] = [
  ...blockCategories.text.items.map((i) => ({ ...i, group: blockCategories.text.label })),
  ...blockCategories.media.items.map((i) => ({ ...i, group: blockCategories.media.label })),
  ...blockCategories.other.items.map((i) => ({ ...i, group: blockCategories.other.label })),
  ...calloutItems.map((i) => ({ ...i, group: "Выделения" })),
];

function BlockGrid({ items, onSelect }: { items: GridItem[]; onSelect: (type: BlockType) => void }) {
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

function BlockPicker({ onSelect }: { onSelect: (type: BlockType) => void }) {
  const [search, setSearch] = useState("");
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return allItems;
    return allItems.filter((i) => i.label.toLowerCase().includes(q));
  }, [search]);

  // Group while preserving order
  const grouped = useMemo(() => {
    const groups: Record<string, GridItem[]> = {};
    const order: string[] = [];
    for (const item of filtered) {
      if (!groups[item.group]) { groups[item.group] = []; order.push(item.group); }
      groups[item.group].push(item);
    }
    return order.map((g) => ({ group: g, items: groups[g] }));
  }, [filtered]);

  return (
    <div className="space-y-2">
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
        <Input
          autoFocus
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Поиск блока"
          className="h-8 text-sm pl-8"
        />
      </div>
      <div className="max-h-[420px] overflow-y-auto space-y-3 pr-0.5">
        {grouped.map(({ group, items }) => (
          <div key={group}>
            <p className="text-[10px] uppercase tracking-wide font-semibold text-muted-foreground px-1 mb-1.5">{group}</p>
            <BlockGrid items={items} onSelect={onSelect} />
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
  return <BlockGrid items={items.map((i) => ({ ...i, group: "" }))} onSelect={onSelect} />;
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
      <PopoverContent align="center" className="w-80 p-3">
        <BlockPicker onSelect={handleSelect} />
      </PopoverContent>
    </Popover>
  );
}

// Compact "+" trigger used between blocks (left of block on hover)
export function InlineAddBlockButton({ onAdd }: { onAdd: (type: BlockType) => void }) {
  const [open, setOpen] = useState(false);
  const handleSelect = (type: BlockType) => { setOpen(false); onAdd(type); };
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
      <PopoverContent align="start" side="right" className="w-80 p-3">
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
