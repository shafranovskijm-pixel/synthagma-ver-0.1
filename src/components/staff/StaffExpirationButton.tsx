import { useState } from "react";
import { format } from "date-fns";
import { ru } from "date-fns/locale";
import { Calendar as CalendarIcon, Clock, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface Props {
  /** Имя таблицы: org_staff или admin_staff */
  table: "org_staff" | "admin_staff";
  staffId: string;
  expiresAt: string | null;
  onChange?: () => void;
}

/**
 * Кнопка-индикатор временной роли с DatePicker.
 * - Если expires_at = null → роль постоянная, кнопка «Сделать временной».
 * - Если expires_at установлен → показывает дату + кнопку очистки.
 */
export function StaffExpirationButton({ table, staffId, expiresAt, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const date = expiresAt ? new Date(expiresAt) : undefined;
  const isExpired = date && date < new Date();

  const handleSelect = async (newDate: Date | undefined) => {
    setSaving(true);
    const { error } = await supabase
      .from(table)
      .update({ expires_at: newDate ? newDate.toISOString() : null })
      .eq("id", staffId);
    setSaving(false);
    if (error) {
      toast.error("Не удалось обновить срок: " + error.message);
      return;
    }
    toast.success(newDate ? `Роль действует до ${format(newDate, "d MMMM yyyy", { locale: ru })}` : "Роль сделана постоянной");
    setOpen(false);
    onChange?.();
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          disabled={saving}
          className={cn(
            "h-7 px-2 text-xs gap-1",
            !date && "text-muted-foreground",
            isExpired && "border-destructive text-destructive",
          )}
        >
          {date ? <Clock className="w-3 h-3" /> : <CalendarIcon className="w-3 h-3" />}
          {date ? format(date, "d MMM yyyy", { locale: ru }) : "Постоянная"}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={date}
          onSelect={handleSelect}
          disabled={(d) => d < new Date()}
          initialFocus
          className={cn("p-3 pointer-events-auto")}
          locale={ru}
        />
        {date && (
          <div className="border-t p-2">
            <Button
              variant="ghost"
              size="sm"
              className="w-full gap-2 text-muted-foreground"
              onClick={() => handleSelect(undefined)}
            >
              <X className="w-3.5 h-3.5" /> Сделать постоянной
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
