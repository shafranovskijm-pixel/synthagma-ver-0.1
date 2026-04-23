import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { getErrorMessage } from "@/utils/handleSupabaseError";
import { format, isAfter, isBefore } from "date-fns";
import { ru } from "date-fns/locale";
import { Plus, Pencil, Trash2, UserCheck, Calendar, ShieldCheck, Star, AlertTriangle } from "lucide-react";
import { SigmaSpinner } from "@/components/ui/SigmaSpinner";

interface Signatory {
  id: string;
  organization_id: string;
  full_name: string;
  position: string | null;
  basis: string | null;
  valid_from: string | null;
  valid_to: string | null;
  is_default: boolean;
  signature_url: string | null;
  stamp_url: string | null;
  notes: string | null;
  created_at: string;
}

interface Props {
  organizationId: string;
}

const empty = {
  full_name: "",
  position: "",
  basis: "Устав",
  valid_from: "",
  valid_to: "",
  is_default: false,
  notes: "",
};

export function OrgSignatoriesManager({ organizationId }: Props) {
  const [items, setItems] = useState<Signatory[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Signatory | null>(null);
  const [form, setForm] = useState({ ...empty });
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data, error } = await (supabase as any)
      .from("org_signatories")
      .select("*")
      .eq("organization_id", organizationId)
      .order("is_default", { ascending: false })
      .order("created_at", { ascending: false });
    if (error) toast.error("Ошибка загрузки подписантов");
    setItems((data as Signatory[]) || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, [organizationId]);

  const openCreate = () => {
    setEditing(null);
    setForm({ ...empty });
    setOpen(true);
  };

  const openEdit = (s: Signatory) => {
    setEditing(s);
    setForm({
      full_name: s.full_name,
      position: s.position || "",
      basis: s.basis || "",
      valid_from: s.valid_from || "",
      valid_to: s.valid_to || "",
      is_default: s.is_default,
      notes: s.notes || "",
    });
    setOpen(true);
  };

  const save = async () => {
    if (!form.full_name.trim()) {
      toast.error("Укажите ФИО");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        organization_id: organizationId,
        full_name: form.full_name.trim(),
        position: form.position.trim() || null,
        basis: form.basis.trim() || null,
        valid_from: form.valid_from || null,
        valid_to: form.valid_to || null,
        is_default: form.is_default,
        notes: form.notes.trim() || null,
      };
      if (editing) {
        const { error } = await (supabase as any)
          .from("org_signatories")
          .update(payload)
          .eq("id", editing.id);
        if (error) throw error;
        toast.success("Подписант обновлён");
      } else {
        const { error } = await (supabase as any)
          .from("org_signatories")
          .insert(payload);
        if (error) throw error;
        toast.success("Подписант добавлен");
      }
      setOpen(false);
      await load();
    } catch (e) {
      toast.error("Ошибка сохранения", { description: getErrorMessage(e) });
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string) => {
    if (!confirm("Удалить подписанта?")) return;
    const { error } = await (supabase as any).from("org_signatories").delete().eq("id", id);
    if (error) {
      toast.error("Ошибка удаления");
      return;
    }
    toast.success("Удалено");
    await load();
  };

  const setDefault = async (s: Signatory) => {
    const { error } = await (supabase as any)
      .from("org_signatories")
      .update({ is_default: true })
      .eq("id", s.id);
    if (error) {
      toast.error("Не удалось установить по умолчанию");
      return;
    }
    toast.success("Установлен по умолчанию");
    await load();
  };

  const validityStatus = (s: Signatory) => {
    const now = new Date();
    if (s.valid_to && isBefore(new Date(s.valid_to), now)) {
      return { label: "Истёк", variant: "destructive" as const, icon: AlertTriangle };
    }
    if (s.valid_from && isAfter(new Date(s.valid_from), now)) {
      return { label: "Не вступил", variant: "secondary" as const, icon: Calendar };
    }
    return { label: "Действует", variant: "default" as const, icon: ShieldCheck };
  };

  if (loading) {
    return <div className="flex justify-center py-12"><SigmaSpinner size="lg" /></div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-semibold flex items-center gap-2">
            <UserCheck className="w-4 h-4 text-primary" />
            Подписанты организации
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Лица, имеющие право подписи документов от имени организации (директор, уполномоченные по доверенности)
          </p>
        </div>
        <Button onClick={openCreate} size="sm" className="gap-2 rounded-xl">
          <Plus className="w-4 h-4" />Добавить
        </Button>
      </div>

      {items.length === 0 ? (
        <Card className="rounded-2xl border-dashed">
          <CardContent className="py-12 text-center">
            <UserCheck className="w-10 h-10 mx-auto text-muted-foreground/40 mb-3" />
            <p className="text-sm text-muted-foreground mb-4">Подписанты ещё не добавлены</p>
            <Button onClick={openCreate} size="sm" variant="outline" className="rounded-xl gap-2">
              <Plus className="w-4 h-4" />Добавить первого подписанта
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {items.map((s) => {
            const v = validityStatus(s);
            const VIcon = v.icon;
            return (
              <Card key={s.id} className="rounded-2xl">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h4 className="font-semibold">{s.full_name}</h4>
                        {s.is_default && (
                          <Badge variant="outline" className="bg-primary/10 text-primary border-primary/30 gap-1">
                            <Star className="w-3 h-3 fill-current" />По умолчанию
                          </Badge>
                        )}
                        <Badge variant={v.variant} className="gap-1">
                          <VIcon className="w-3 h-3" />{v.label}
                        </Badge>
                      </div>
                      {s.position && <p className="text-sm text-muted-foreground mt-1">{s.position}</p>}
                      <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-xs text-muted-foreground">
                        {s.basis && <span>Основание: <span className="text-foreground">{s.basis}</span></span>}
                        {s.valid_from && (
                          <span>С {format(new Date(s.valid_from), "d MMM yyyy", { locale: ru })}</span>
                        )}
                        {s.valid_to && (
                          <span>По {format(new Date(s.valid_to), "d MMM yyyy", { locale: ru })}</span>
                        )}
                      </div>
                      {s.notes && <p className="text-xs text-muted-foreground mt-2 italic">{s.notes}</p>}
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {!s.is_default && (
                        <Button variant="ghost" size="icon" title="Сделать по умолчанию" onClick={() => setDefault(s)}>
                          <Star className="w-4 h-4" />
                        </Button>
                      )}
                      <Button variant="ghost" size="icon" title="Редактировать" onClick={() => openEdit(s)}>
                        <Pencil className="w-4 h-4" />
                      </Button>
                      <Button variant="ghost" size="icon" title="Удалить" className="text-destructive" onClick={() => remove(s.id)}>
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg rounded-2xl">
          <DialogHeader>
            <DialogTitle>{editing ? "Редактировать подписанта" : "Новый подписант"}</DialogTitle>
            <DialogDescription>
              Подписант будет доступен для выбора при отправке документов на подписание
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2">
            <div>
              <Label>ФИО *</Label>
              <Input
                value={form.full_name}
                onChange={(e) => setForm({ ...form, full_name: e.target.value })}
                placeholder="Иванов Иван Иванович"
              />
            </div>
            <div>
              <Label>Должность</Label>
              <Input
                value={form.position}
                onChange={(e) => setForm({ ...form, position: e.target.value })}
                placeholder="Директор"
              />
            </div>
            <div>
              <Label>Основание полномочий</Label>
              <Input
                value={form.basis}
                onChange={(e) => setForm({ ...form, basis: e.target.value })}
                placeholder="Устав / Доверенность №… от…"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Действует с</Label>
                <Input type="date" value={form.valid_from} onChange={(e) => setForm({ ...form, valid_from: e.target.value })} />
              </div>
              <div>
                <Label>Действует по</Label>
                <Input type="date" value={form.valid_to} onChange={(e) => setForm({ ...form, valid_to: e.target.value })} />
              </div>
            </div>
            <div>
              <Label>Заметки</Label>
              <Input
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                placeholder="Дополнительная информация"
              />
            </div>
            <div className="flex items-center justify-between rounded-xl border p-3">
              <div>
                <Label className="cursor-pointer">Использовать по умолчанию</Label>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Будет автоматически выбран при формировании документов
                </p>
              </div>
              <Switch
                checked={form.is_default}
                onCheckedChange={(v) => setForm({ ...form, is_default: v })}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>Отмена</Button>
            <Button onClick={save} disabled={saving} className="gap-2">
              {saving ? <SigmaSpinner size="sm" /> : null}
              {editing ? "Сохранить" : "Добавить"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
