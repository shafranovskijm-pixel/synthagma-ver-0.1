import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Search } from "lucide-react";
import { icons } from "lucide-react";
import React from "react";

const POPULAR_ICONS = [
  "book-open", "graduation-cap", "lightbulb", "target", "trophy", "star",
  "heart", "shield", "clock", "users", "award", "check-circle",
  "zap", "brain", "rocket", "globe", "monitor", "smartphone",
  "camera", "mic", "music", "palette", "pen-tool", "code",
  "database", "server", "wifi", "cloud", "lock", "key",
  "mail", "message-circle", "phone", "video", "image", "file-text",
  "folder", "search", "settings", "tool", "wrench", "compass",
  "map", "navigation", "flag", "bookmark", "tag", "gift",
  "dollar-sign", "credit-card", "briefcase", "building", "home", "truck",
  "plane", "anchor", "coffee", "sun", "moon", "thermometer",
  "umbrella", "feather", "leaf", "tree-pine", "mountain", "waves",
];

function toIconComponentName(kebab: string): string {
  return kebab
    .split("-")
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
    .join("");
}

interface Props {
  open: boolean;
  onClose: () => void;
  onSelect: (iconName: string) => void;
}

export function IconPickerDialog({ open, onClose, onSelect }: Props) {
  const [search, setSearch] = useState("");

  const filtered = POPULAR_ICONS.filter((name) =>
    name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Выберите иконку</DialogTitle>
        </DialogHeader>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Поиск иконок..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>

        <div className="grid grid-cols-8 gap-1 overflow-y-auto flex-1 py-2">
          {filtered.map((name) => {
            const componentName = toIconComponentName(name);
            const IconComp = (icons as any)[componentName];
            if (!IconComp) return null;
            return (
              <button
                key={name}
                onClick={() => {
                  onSelect(name);
                  onClose();
                }}
                className="flex items-center justify-center p-2.5 rounded-lg hover:bg-accent transition-colors"
                title={name}
              >
                {React.createElement(IconComp, { className: "w-5 h-5" })}
              </button>
            );
          })}
          {filtered.length === 0 && (
            <p className="col-span-8 text-center text-sm text-muted-foreground py-8">
              Ничего не найдено
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
