import { useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon, Search } from "lucide-react";
import { format } from "date-fns";
import { ru } from "date-fns/locale";
import { cn } from "@/lib/utils";

export interface PickerStudent {
  user_id: string;
  name: string;
  email?: string;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  students: PickerStudent[];
  excludeUserIds?: string[];
  moduleTitle: string;
  onConfirm: (userIds: string[], unlockAt: Date | null) => Promise<void> | void;
}

export function ModuleAccessStudentPicker({
  open, onOpenChange, students, excludeUserIds = [], moduleTitle, onConfirm,
}: Props) {
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [date, setDate] = useState<Date | undefined>(undefined);
  const [openAt, setOpenAt] = useState<"date" | "immediate">("date");
  const [busy, setBusy] = useState(false);

  const available = useMemo(() => {
    const exclude = new Set(excludeUserIds);
    const q = search.trim().toLowerCase();
    return students
      .filter(s => !exclude.has(s.user_id))
      .filter(s => !q || s.name.toLowerCase().includes(q) || (s.email || "").toLowerCase().includes(q));
  }, [students, excludeUserIds, search]);

  const toggle = (id: string) => {
    setSelected(prev => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  };

  const toggleAll = () => {
    if (selected.size === available.length) setSelected(new Set());
    else setSelected(new Set(available.map(s => s.user_id)));
  };

  const handleConfirm = async () => {
    if (selected.size === 0) return;
    if (openAt === "date" && !date) return;
    setBusy(true);
    try {
      await onConfirm(Array.from(selected), openAt === "immediate" ? null : date!);
      setSelected(new Set());
      setSearch("");
      setDate(undefined);
      onOpenChange(false);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl rounded-2xl">
        <DialogHeader>
          <DialogTitle>Индивидуальный доступ к модулю</DialogTitle>
          <p className="text-sm text-muted-foreground">«{moduleTitle}»</p>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Дата открытия для выбранных учеников</label>
            <div className="flex gap-2">
              <Button
                type="button"
                variant={openAt === "immediate" ? "default" : "outline"}
                size="sm"
                onClick={() => setOpenAt("immediate")}
                className="rounded-lg"
              >
                Открыть сразу
              </Button>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    type="button"
                    variant={openAt === "date" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setOpenAt("date")}
                    className={cn("rounded-lg justify-start gap-2", !date && openAt === "date" && "text-muted-foreground")}
                  >
                    <CalendarIcon className="w-4 h-4" />
                    {date ? format(date, "dd.MM.yyyy", { locale: ru }) : "Выбрать дату"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={date}
                    onSelect={(d) => { setDate(d); setOpenAt("date"); }}
                    initialFocus
                    className={cn("p-3 pointer-events-auto")}
                  />
                </PopoverContent>
              </Popover>
            </div>
          </div>

          <div className="space-y-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Поиск по имени или email"
                className="pl-9 rounded-lg"
              />
            </div>

            <div className="flex items-center justify-between text-sm">
              <button
                type="button"
                onClick={toggleAll}
                className="text-primary hover:underline"
              >
                {selected.size === available.length && available.length > 0 ? "Снять все" : "Выбрать всех"}
              </button>
              <span className="text-muted-foreground">Выбрано: {selected.size}</span>
            </div>

            <ScrollArea className="h-72 rounded-lg border border-border">
              <div className="p-2 space-y-1">
                {available.length === 0 && (
                  <div className="text-sm text-muted-foreground text-center py-8">
                    Нет доступных учеников
                  </div>
                )}
                {available.map(s => {
                  const isOn = selected.has(s.user_id);
                  return (
                    <label
                      key={s.user_id}
                      className={cn(
                        "flex items-center gap-3 p-2 rounded-lg cursor-pointer hover:bg-muted/50",
                        isOn && "bg-primary/5"
                      )}
                    >
                      <Checkbox checked={isOn} onCheckedChange={() => toggle(s.user_id)} />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate">{s.name}</div>
                        {s.email && <div className="text-xs text-muted-foreground truncate">{s.email}</div>}
                      </div>
                    </label>
                  );
                })}
              </div>
            </ScrollArea>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} className="rounded-lg">
            Отмена
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={busy || selected.size === 0 || (openAt === "date" && !date)}
            className="rounded-lg"
          >
            Применить
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
