import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Plus, Pencil, Trash2, Save, X, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { getErrorMessage } from "@/utils/handleSupabaseError";
import { motion } from "framer-motion";

interface PlatformUpdate {
  id: string;
  title: string;
  description: string;
  image_url: string | null;
  published_at: string;
  is_published: boolean;
  created_at: string;
}

export function PlatformUpdatesManager() {
  const [updates, setUpdates] = useState<PlatformUpdate[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ title: "", description: "", image_url: "", is_published: true });
  const [showForm, setShowForm] = useState(false);

  const load = async () => {
    const { data } = await supabase
      .from("platform_updates")
      .select("*")
      .order("published_at", { ascending: false });
    setUpdates((data as PlatformUpdate[]) || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const resetForm = () => {
    setForm({ title: "", description: "", image_url: "", is_published: true });
    setEditingId(null);
    setShowForm(false);
  };

  const handleSave = async () => {
    if (!form.title.trim() || !form.description.trim()) {
      toast.error("Заполните заголовок и описание");
      return;
    }
    const payload = {
      title: form.title.trim(),
      description: form.description.trim(),
      image_url: form.image_url.trim() || null,
      is_published: form.is_published,
      published_at: new Date().toISOString(),
    };
    if (editingId) {
      const { error } = await supabase.from("platform_updates").update(payload).eq("id", editingId);
      if (error) { toast.error(getErrorMessage(error)); return; }
      toast.success("Обновлено");
    } else {
      const { error } = await supabase.from("platform_updates").insert(payload);
      if (error) { toast.error(getErrorMessage(error)); return; }
      toast.success("Создано");
    }
    resetForm();
    load();
  };

  const handleEdit = (u: PlatformUpdate) => {
    setForm({ title: u.title, description: u.description, image_url: u.image_url || "", is_published: u.is_published });
    setEditingId(u.id);
    setShowForm(true);
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from("platform_updates").delete().eq("id", id);
    if (error) { toast.error("Ошибка удаления"); return; }
    toast.success("Удалено");
    load();
  };

  const handleTogglePublish = async (id: string, current: boolean) => {
    await supabase.from("platform_updates").update({ is_published: !current }).eq("id", id);
    load();
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold">Обновления платформы</h2>
          <p className="text-sm text-muted-foreground">Управление страницей «Что нового»</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" asChild>
            <a href="/whats-new" target="_blank"><ExternalLink className="w-4 h-4 mr-1" />Посмотреть</a>
          </Button>
          <Button onClick={() => { resetForm(); setShowForm(true); }}>
            <Plus className="w-4 h-4 mr-1" /> Добавить
          </Button>
        </div>
      </div>

      {/* Form */}
      {showForm && (
        <Card className="border-primary/30">
          <CardHeader>
            <CardTitle className="text-lg">{editingId ? "Редактировать" : "Новое обновление"}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>Заголовок</Label>
              <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Название обновления" />
            </div>
            <div>
              <Label>Описание</Label>
              <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={4} placeholder="Подробное описание..." />
            </div>
            <div>
              <Label>URL изображения (опционально)</Label>
              <Input value={form.image_url} onChange={(e) => setForm({ ...form, image_url: e.target.value })} placeholder="https://..." />
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={form.is_published} onCheckedChange={(v) => setForm({ ...form, is_published: v })} />
              <Label>Опубликовано</Label>
            </div>
            <div className="flex gap-2">
              <Button onClick={handleSave}><Save className="w-4 h-4 mr-1" /> Сохранить</Button>
              <Button variant="ghost" onClick={resetForm}><X className="w-4 h-4 mr-1" /> Отмена</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Timeline */}
      {loading ? (
        <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>
      ) : updates.length === 0 ? (
        <p className="text-center text-muted-foreground py-20">Пока нет обновлений</p>
      ) : (
        <div className="max-w-3xl mx-auto">
          <div className="relative">
            <div className="absolute left-6 top-0 bottom-0 w-px bg-border hidden sm:block" />
            <div className="space-y-6">
              {updates.map((u, i) => (
                <motion.article
                  key={u.id}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.07 }}
                  className="relative flex gap-4 sm:gap-6"
                >
                  <div className="hidden sm:flex flex-col items-center shrink-0">
                    <div className={`w-3 h-3 rounded-full ring-4 ring-background z-10 ${u.is_published ? 'bg-primary' : 'bg-muted-foreground/40'}`} />
                  </div>
                  <div className={`flex-1 bg-card border rounded-xl p-5 hover:shadow-md transition-shadow ${!u.is_published ? 'border-dashed border-muted-foreground/30 opacity-70' : 'border-border'}`}>
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-medium text-primary bg-primary/10 px-2 py-0.5 rounded-full">
                          {new Date(u.published_at).toLocaleDateString("ru-RU", { day: "numeric", month: "long" })}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {new Date(u.published_at).getFullYear()}
                        </span>
                        {!u.is_published && (
                          <Badge variant="secondary" className="text-[10px] px-1.5 py-0">Черновик</Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-1">
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleTogglePublish(u.id, u.is_published)} title={u.is_published ? "Скрыть" : "Опубликовать"}>
                          <Switch checked={u.is_published} className="pointer-events-none scale-75" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleEdit(u)}>
                          <Pencil className="w-3.5 h-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => handleDelete(u.id)}>
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </div>
                    <h3 className="font-semibold text-base mb-1.5">{u.title}</h3>
                    <p className="text-muted-foreground text-sm leading-relaxed">{u.description}</p>
                    {u.image_url && (
                      <img src={u.image_url} alt={u.title} className="mt-4 rounded-lg max-h-56 object-cover w-full" loading="lazy" />
                    )}
                  </div>
                </motion.article>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
