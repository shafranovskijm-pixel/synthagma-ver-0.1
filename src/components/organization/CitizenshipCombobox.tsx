import { useState, useMemo } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { OKSM_COUNTRIES, OKSM_BY_CODE } from "@/constants/oksm";

interface CitizenshipComboboxProps {
  value: string;
  onChange: (code: string) => void;
  placeholder?: string;
  disabled?: boolean;
}

export function CitizenshipCombobox({
  value,
  onChange,
  placeholder = "Выберите страну",
  disabled,
}: CitizenshipComboboxProps) {
  const [open, setOpen] = useState(false);
  const normalized = value ? String(value).padStart(3, "0") : "";
  const selected = normalized ? OKSM_BY_CODE[normalized] : undefined;

  // Move Russia to the top for convenience
  const items = useMemo(() => {
    const russia = OKSM_COUNTRIES.find((c) => c.code === "643");
    const rest = OKSM_COUNTRIES.filter((c) => c.code !== "643");
    return russia ? [russia, ...rest] : rest;
  }, []);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className="w-full justify-between font-normal"
        >
          {selected ? (
            <span className="truncate">
              {selected.name}{" "}
              <span className="text-muted-foreground">({selected.code})</span>
            </span>
          ) : (
            <span className="text-muted-foreground">{placeholder}</span>
          )}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <Command
          filter={(itemValue, search) => {
            const s = search.toLowerCase().trim();
            if (!s) return 1;
            return itemValue.toLowerCase().includes(s) ? 1 : 0;
          }}
        >
          <CommandInput placeholder="Поиск по названию или коду..." />
          <CommandList>
            <CommandEmpty>Страна не найдена</CommandEmpty>
            <CommandGroup>
              {items.map((c) => {
                const searchValue = `${c.name} ${c.code} ${c.alpha2} ${c.alpha3}`;
                return (
                  <CommandItem
                    key={c.code}
                    value={searchValue}
                    onSelect={() => {
                      onChange(c.code);
                      setOpen(false);
                    }}
                  >
                    <Check
                      className={cn(
                        "mr-2 h-4 w-4",
                        normalized === c.code ? "opacity-100" : "opacity-0"
                      )}
                    />
                    <span className="flex-1 truncate">{c.name}</span>
                    <span className="ml-2 text-xs text-muted-foreground">{c.code}</span>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
