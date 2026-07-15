import { useState, useEffect } from "react";
import { Plus, Trash2, Pencil, Sparkles, Save, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { SigmaSpinner } from "@/components/ui/SigmaSpinner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface LandingPopup {
  id: string;
  name: string;
  enabled: boolean;
  title: string;
  subtitle: string;
  description: string;
  badge_text: string;
  cta_text: string;
  image_url: string | null;
  delay_seconds: number;
  storage_key: string;
  show_for_authenticated: boolean;
  sort_order: number;
  source_tag: string;
  updated_at: string;
}

const empty: Omit<LandingPopup, "id" | "updated_at"> = {
  name: "",
  enabled: true,
  title: "",
  subtitle: "",
  description: "",
  badge_text: "",
  cta_text: "Отправить",
  image_url: "",
  delay_seconds: 300,
  storage_key: "",
  show_for_authenticated: false,
  sort_order: 0,
  source_tag: "popup",
};

export function LandingPopupsManager() {
  const [items, setItems] = useState<LandingPopup[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<LandingPopup | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<typeof empty>(empty);
  const [saving, setSaving] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  useEffect(() => { fetchItems(); }, []);

  const fetchItems = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("landing_popups")
      .select("*")
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: false });
    if (error) toast.error("Ошибка загрузки попапов");
    else setItems((data as LandingPopup[]) || []);
    setLoading(false);
  };

  const openCreate = () => {
    setEditing(null);
    setCreating(true);
    setForm({ ...empty, storage_key: `popup_${Date.now()}_dismissed` });
  };

  const openEdit = (p: LandingPopup) => {
    setCreating(false);
    setEditing(p);
    setForm({
      name: p.name, enabled: p.enabled, title: p.title, subtitle: p.subtitle,
      description: p.description, badge_text: p.badge_text, cta_text: p.cta_text,
      image_url: p.image_url || "", delay_seconds: p.delay_seconds,
      storage_key: p.storage_key, show_for_authenticated: p.show_for_authenticated,
      sort_order: p.sort_order, source_tag: p.source_tag,
    });
  };

  const closeDialog = () => { setEditing(null); setCreating(false); };

  const toggleEnabled = async (p: LandingPopup) => {
    const { error } = await supabase.from("landing_popups").update({ enabled: !p.enabled }).eq("id", p.id);
    if (error) toast.error("Ошибка"); else { toast.success(p.enabled ? "Попап отключён" : "Попап включён"); fetchItems(); }
  };

  const save = async () => {
    if (!form.name.trim() || !form.title.trim()) {
      toast.error("Заполните название и заголовок"); return;
    }
    if (!form.storage_key.trim()) {
      toast.error("Укажите ключ хранения (storage_key)"); return;
    }
    setSaving(true);
    const payload = { ...form, image_url: form.image_url?.trim() || null };
    const { error } = editing
      ? await supabase.from("landing_popups").update(payload).eq("id", editing.id)
      : await supabase.from("landing_popups").insert(payload);
    setSaving(false);
    if (error) { toast.error("Не удалось сохранить", { description: error.message }); return; }
    toast.success(editing ? "Обновлено" : "Создано");
    closeDialog();
    fetchItems();
  };

  const remove = async () => {
    if (!deleteId) return;
    const { error } = await supabase.from("landing_popups").delete().eq("id", deleteId);
    setDeleteId(null);
    if (error) toast.error("Ошибка удаления"); else { toast.success("Удалено"); fetchItems(); }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-serif font-bold flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-primary" /> Всплывающие окна лендинга
          </h3>
          <p className="text-xs text-muted-foreground mt-1">
            Управление попапами со спецпредложениями. Отключайте, редактируйте, добавляйте новые.
          </p>
        </div>
        <Button onClick={openCreate} className="btn-gradient rounded-xl gap-2">
          <Plus className="w-4 h-4" /> Добавить
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><SigmaSpinner /></div>
      ) : items.length === 0 ? (
        <div className="text-center py-12 text-sm text-muted-foreground border border-dashed rounded-2xl">
          Попапов пока нет. Нажмите «Добавить», чтобы создать первый.
        </div>
      ) : (
        <div className="space-y-2">
          {items.map(p => (
            <div key={p.id} className="flex items-center gap-3 p-4 rounded-2xl border border-border bg-card">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium truncate">{p.name}</span>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full ${p.enabled ? "bg-emerald-500/10 text-emerald-600" : "bg-muted text-muted-foreground"}`}>
                    {p.enabled ? "Включён" : "Отключён"}
                  </span>
                  {p.badge_text && (
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-primary/10 text-primary">{p.badge_text}</span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-1 truncate">
                  {p.title} · задержка {p.delay_seconds}с · порядок {p.sort_order}
                </p>
              </div>
              <Switch checked={p.enabled} onCheckedChange={() => toggleEnabled(p)} />
              <Button variant="ghost" size="icon" onClick={() => openEdit(p)}>
                <Pencil className="w-4 h-4" />
              </Button>
              <Button variant="ghost" size="icon" onClick={() => setDeleteId(p.id)}>
                <Trash2 className="w-4 h-4 text-destructive" />
              </Button>
            </div>
          ))}
        </div>
      )}

      <Dialog open={creating || !!editing} onOpenChange={(o) => !o && closeDialog()}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Редактировать попап" : "Новый попап"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Название (внутреннее)</Label>
                <Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Спецпредложение 30%" />
              </div>
              <div className="flex items-center justify-between rounded-xl border px-3">
                <Label className="text-xs">Включён</Label>
                <Switch checked={form.enabled} onCheckedChange={v => setForm({ ...form, enabled: v })} />
              </div>
            </div>
            <div>
              <Label>Заголовок</Label>
              <Input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="Специальные условия" />
            </div>
            <div>
              <Label>Подзаголовок</Label>
              <Input value={form.subtitle} onChange={e => setForm({ ...form, subtitle: e.target.value })} placeholder="Только для новых клиентов" />
            </div>
            <div>
              <Label>Описание</Label>
              <Textarea rows={2} value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Текст бейджа</Label>
                <Input value={form.badge_text} onChange={e => setForm({ ...form, badge_text: e.target.value })} placeholder="до 30% выгода" />
              </div>
              <div>
                <Label>Текст кнопки</Label>
                <Input value={form.cta_text} onChange={e => setForm({ ...form, cta_text: e.target.value })} />
              </div>
            </div>
            <div>
              <Label>URL картинки (опционально)</Label>
              <Input value={form.image_url || ""} onChange={e => setForm({ ...form, image_url: e.target.value })} placeholder="https://... (по умолчанию — стандартная)" />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label>Задержка (сек)</Label>
                <Input type="number" min={0} value={form.delay_seconds} onChange={e => setForm({ ...form, delay_seconds: Number(e.target.value) || 0 })} />
              </div>
              <div>
                <Label>Порядок</Label>
                <Input type="number" value={form.sort_order} onChange={e => setForm({ ...form, sort_order: Number(e.target.value) || 0 })} />
              </div>
              <div>
                <Label>Тег источника</Label>
                <Input value={form.source_tag} onChange={e => setForm({ ...form, source_tag: e.target.value })} />
              </div>
            </div>
            <div>
              <Label>Ключ хранения (уникальный)</Label>
              <Input value={form.storage_key} onChange={e => setForm({ ...form, storage_key: e.target.value })} placeholder="special_offer_dismissed" />
              <p className="text-[10px] text-muted-foreground mt-1">
                По этому ключу браузер запоминает, что пользователь закрыл попап. Измените, чтобы показать заново.
              </p>
            </div>
            <div className="flex items-center justify-between rounded-xl border px-3 py-2">
              <div>
                <Label className="text-xs">Показывать авторизованным</Label>
                <p className="text-[10px] text-muted-foreground">По умолчанию попап скрыт для залогиненных.</p>
              </div>
              <Switch checked={form.show_for_authenticated} onCheckedChange={v => setForm({ ...form, show_for_authenticated: v })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={closeDialog}><X className="w-4 h-4 mr-1" /> Отмена</Button>
            <Button onClick={save} disabled={saving} className="btn-gradient">
              {saving ? <><SigmaSpinner size="sm" /> Сохранение...</> : <><Save className="w-4 h-4 mr-1" /> Сохранить</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Удалить попап?</AlertDialogTitle>
            <AlertDialogDescription>Это действие нельзя отменить.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Отмена</AlertDialogCancel>
            <AlertDialogAction onClick={remove} className="bg-destructive text-destructive-foreground">Удалить</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
