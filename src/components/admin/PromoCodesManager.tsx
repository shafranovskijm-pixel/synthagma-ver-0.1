import { useState, useEffect } from "react";
import { Plus, Trash2, Calendar, Tag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { format, differenceInDays, isPast } from "date-fns";
import { ru } from "date-fns/locale";

interface PromoCode {
  id: string;
  code: string;
  discount_percent: number;
  is_active: boolean;
  max_uses: number | null;
  used_count: number;
  valid_until: string | null;
  created_at: string;
}

export function PromoCodesManager() {
  const [promoCodes, setPromoCodes] = useState<PromoCode[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [newCode, setNewCode] = useState("");
  const [newDiscount, setNewDiscount] = useState(10);
  const [newMaxUses, setNewMaxUses] = useState("");
  const [newValidUntil, setNewValidUntil] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    fetchPromoCodes();
  }, []);

  const fetchPromoCodes = async () => {
    setIsLoading(true);
    const { data, error } = await supabase
      .from("promo_codes")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) {
      toast.error("Ошибка загрузки промокодов");
    } else {
      setPromoCodes((data as PromoCode[]) || []);
    }
    setIsLoading(false);
  };

  const handleAdd = async () => {
    if (!newCode.trim() || newDiscount < 1 || newDiscount > 100) {
      toast.error("Заполните код и скидку (1-100%)");
      return;
    }
    setIsSaving(true);
    const { error } = await supabase.from("promo_codes").insert({
      code: newCode.trim().toUpperCase(),
      discount_percent: newDiscount,
      max_uses: newMaxUses ? parseInt(newMaxUses) : null,
      valid_until: newValidUntil || null } as any);
    if (error) {
      toast.error(error.message.includes("duplicate") ? "Такой код уже существует" : "Ошибка создания");
    } else {
      toast.success("Промокод добавлен");
      setNewCode("");
      setNewDiscount(10);
      setNewMaxUses("");
      setNewValidUntil("");
      setShowForm(false);
      fetchPromoCodes();
    }
    setIsSaving(false);
  };

  const toggleActive = async (id: string, current: boolean) => {
    const { error } = await supabase
      .from("promo_codes")
      .update({ is_active: !current } as any)
      .eq("id", id);
    if (error) toast.error("Ошибка обновления");
    else fetchPromoCodes();
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from("promo_codes").delete().eq("id", id);
    if (error) toast.error("Ошибка удаления");
    else {
      toast.success("Промокод удалён");
      fetchPromoCodes();
    }
  };

  const getStatusBadge = (promo: PromoCode) => {
    if (!promo.is_active) {
      return <span className="text-xs bg-muted text-muted-foreground px-2 py-0.5 rounded-full">Отключён</span>;
    }
    if (promo.valid_until && isPast(new Date(promo.valid_until))) {
      return <span className="text-xs bg-destructive/10 text-destructive px-2 py-0.5 rounded-full">Истёк</span>;
    }
    if (promo.valid_until) {
      const days = differenceInDays(new Date(promo.valid_until), new Date());
      if (days <= 7) {
        return <span className="text-xs bg-yellow-500/10 text-yellow-600 px-2 py-0.5 rounded-full">Осталось {days} дн.</span>;
      }
    }
    return <span className="text-xs bg-green-500/10 text-green-600 px-2 py-0.5 rounded-full">Активен</span>;
  };

  if (isLoading) {
    return <div className="flex justify-center py-8"><SigmaSpinner /></div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">Управление промокодами и скидками</p>
        <Button size="sm" className="rounded-xl gap-2" onClick={() => setShowForm(!showForm)}>
          <Plus className="w-4 h-4" />
          Добавить
        </Button>
      </div>

      {showForm && (
        <div className="p-4 bg-secondary/50 rounded-xl space-y-3 border border-border">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Код *</Label>
              <Input
                placeholder="PROMO2026"
                value={newCode}
                onChange={(e) => setNewCode(e.target.value.toUpperCase())}
                className="rounded-xl mt-1"
              />
            </div>
            <div>
              <Label className="text-xs">Скидка (%) *</Label>
              <Input
                type="number"
                min={1}
                max={100}
                value={newDiscount}
                onChange={(e) => setNewDiscount(parseInt(e.target.value) || 0)}
                className="rounded-xl mt-1"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Макс. использований</Label>
              <Input
                type="number"
                placeholder="Без ограничений"
                value={newMaxUses}
                onChange={(e) => setNewMaxUses(e.target.value)}
                className="rounded-xl mt-1"
              />
            </div>
            <div>
              <Label className="text-xs">Действует до</Label>
              <Input
                type="date"
                value={newValidUntil}
                onChange={(e) => setNewValidUntil(e.target.value)}
                className="rounded-xl mt-1"
              />
            </div>
          </div>
          <div className="flex gap-2">
            <Button size="sm" className="rounded-xl gap-2" onClick={handleAdd} disabled={isSaving}>
              {isSaving ? <SigmaSpinner size="sm" /> : <Plus className="w-4 h-4" />}
              Создать
            </Button>
            <Button size="sm" variant="outline" className="rounded-xl" onClick={() => setShowForm(false)}>
              Отмена
            </Button>
          </div>
        </div>
      )}

      {promoCodes.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-6">Промокодов пока нет</p>
      ) : (
        <div className="space-y-2">
          {promoCodes.map((promo) => (
            <div key={promo.id} className="flex items-center justify-between p-3 bg-secondary/30 rounded-xl border border-border">
              <div className="flex items-center gap-3 min-w-0">
                <Tag className="w-4 h-4 text-primary shrink-0" />
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono font-semibold text-sm">{promo.code}</span>
                    <span className="text-xs text-primary font-medium">−{promo.discount_percent}%</span>
                    {getStatusBadge(promo)}
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-2 flex-wrap">
                    <span>Использований: {promo.used_count}{promo.max_uses ? `/${promo.max_uses}` : ""}</span>
                    {promo.valid_until && (
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        До {format(new Date(promo.valid_until), "dd.MM.yyyy", { locale: ru })}
                      </span>
                    )}
                    {!promo.valid_until && <span>Бессрочно</span>}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => toggleActive(promo.id, promo.is_active)}
                  className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${promo.is_active ? "bg-primary" : "bg-muted"}`}
                >
                  <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${promo.is_active ? "translate-x-4" : "translate-x-0.5"}`} />
                </button>
                <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => handleDelete(promo.id)}>
                  <Trash2 className="w-4 h-4 text-destructive" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
