import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { Plus, Search, Sparkles } from "lucide-react";
import type { BlockType } from "../types";
import { blockCategories, calloutItems, blockDescriptions, blockIconBg } from "../types";
import { SigmaSpinner } from "@/components/ui/SigmaSpinner";

type GridItem = { type: BlockType; icon: any; label: string; color?: string; group: string };

const allItems: GridItem[] = [
  ...blockCategories.text.items.map((i) => ({ ...i, group: blockCategories.text.label })),
  ...blockCategories.media.items.map((i) => ({ ...i, group: blockCategories.media.label })),
  ...blockCategories.other.items.map((i) => ({ ...i, group: blockCategories.other.label })),
  ...calloutItems.map((i) => ({ ...i, group: "Выделения" })),
];

function BlockGrid({ items, selected, onPick }: { items: GridItem[]; selected: BlockType | null; onPick: (type: BlockType) => void }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      {items.map((item) => {
        const isActive = item.type === selected;
        const iconClass = blockIconBg[item.type] || "text-primary bg-primary/10";
        return (
          <button
            key={item.type}
            type="button"
            onClick={() => onPick(item.type)}
            className={cn(
              "group flex flex-col items-center justify-center gap-2 rounded-xl border-2 p-4 text-center transition-all",
              "hover:border-primary/40 hover:bg-primary/5",
              isActive ? "border-primary bg-primary/10 shadow-sm" : "border-border/60 bg-card",
            )}
          >
            <div className={cn("w-11 h-11 rounded-xl flex items-center justify-center", iconClass)}>
              <item.icon className="w-5 h-5" />
            </div>
            <span className={cn("text-sm font-medium leading-tight", isActive ? "text-primary" : "text-foreground")}>
              {item.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function BlockPicker({ onSelect, onCancel }: { onSelect: (type: BlockType) => void; onCancel: () => void }) {
  const [search, setSearch] = useState("");
  const [selectedType, setSelectedType] = useState<BlockType | null>(null);

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

  const selectedMeta = selectedType
    ? allItems.find((i) => i.type === selectedType)
    : null;

  const handleConfirm = () => {
    if (selectedType) onSelect(selectedType);
  };

  return (
    <div className="space-y-3">
      <div>
        <h3 className="text-base font-semibold text-foreground">Выберите тип блока</h3>
        <p className="text-xs text-muted-foreground mt-0.5">
          Каждый блок подходит для своих задач — выберите подходящий формат.
        </p>
      </div>

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

      <div className="max-h-[380px] overflow-y-auto space-y-4 pr-1">
        {grouped.map(({ group, items }) => (
          <div key={group}>
            <p className="text-[10px] uppercase tracking-wide font-semibold text-muted-foreground px-1 mb-2">{group}</p>
            <BlockGrid items={items} selected={selectedType} onPick={setSelectedType} />
          </div>
        ))}
        {grouped.length === 0 && (
          <p className="text-xs text-muted-foreground text-center py-6">Ничего не найдено</p>
        )}
      </div>

      <div className="rounded-xl border border-border/60 bg-muted/30 p-3 min-h-[68px]">
        {selectedMeta ? (
          <>
            <p className="text-sm font-semibold text-foreground mb-1">{selectedMeta.label}</p>
            <p className="text-xs text-muted-foreground leading-relaxed">{blockDescriptions[selectedMeta.type]}</p>
          </>
        ) : (
          <p className="text-xs text-muted-foreground leading-relaxed">
            Выберите блок выше, чтобы увидеть описание и продолжить.
          </p>
        )}
      </div>

      <div className="flex justify-end gap-2 pt-1">
        <Button variant="outline" size="sm" onClick={onCancel}>Отмена</Button>
        <Button size="sm" className="btn-gradient" onClick={handleConfirm} disabled={!selectedType}>Далее</Button>
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

export function AddBlockButton({ onAdd }: { onAdd: (type: BlockType) => void }) {
  const [open, setOpen] = useState(false);
  const handleSelect = (type: BlockType) => { setOpen(false); onAdd(type); };
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="rounded-lg gap-2"><Plus className="w-4 h-4" />Добавить блок</Button>
      </PopoverTrigger>
      <PopoverContent align="center" className="w-[560px] max-w-[calc(100vw-2rem)] p-4">
        <BlockPicker onSelect={handleSelect} onCancel={() => setOpen(false)} />
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
      <PopoverContent align="start" side="right" className="w-[560px] max-w-[calc(100vw-2rem)] p-4">
        <BlockPicker onSelect={handleSelect} onCancel={() => setOpen(false)} />
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
