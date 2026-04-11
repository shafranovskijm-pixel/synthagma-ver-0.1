import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Plus, Pencil, Trash2, Save, X, Sparkles, ExternalLink } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

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
  const { toast } = useToast();

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
      toast({ title: "Заполните заголовок и описание", variant: "destructive" });
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
      if (error) { toast({ title: "Ошибка", variant: "destructive" }); return; }
      toast({ title: "Обновлено" });
    } else {
      const { error } = await supabase.from("platform_updates").insert(payload);
      if (error) { toast({ title: "Ошибка", variant: "destructive" }); return; }
      toast({ title: "Создано" });
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
    if (error) { toast({ title: "Ошибка удаления", variant: "destructive" }); return; }
    toast({ title: "Удалено" });
    load();
  };

  const handleTogglePublish = async (id: string, current: boolean) => {
    await supabase.from("platform_updates").update({ is_published: !current }).eq("id", id);
    load();
  };

  return (
    <div className="space-y-6">
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

      {loading ? (
        <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>
      ) : (
        <div className="space-y-3">
          {updates.map((u) => (
            <Card key={u.id} className="hover:shadow-sm transition-shadow">
              <CardContent className="py-4 flex items-start gap-4">
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                  <Sparkles className="w-5 h-5 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="font-semibold truncate">{u.title}</h3>
                    <Badge variant={u.is_published ? "default" : "secondary"} className="shrink-0">
                      {u.is_published ? "Опубликовано" : "Черновик"}
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground line-clamp-2">{u.description}</p>
                  <span className="text-xs text-muted-foreground mt-1 block">
                    {new Date(u.published_at).toLocaleDateString("ru-RU")}
                  </span>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Button variant="ghost" size="icon" onClick={() => handleTogglePublish(u.id, u.is_published)} title={u.is_published ? "Скрыть" : "Опубликовать"}>
                    <Switch checked={u.is_published} className="pointer-events-none" />
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => handleEdit(u)}>
                    <Pencil className="w-4 h-4" />
                  </Button>
                  <Button variant="ghost" size="icon" className="text-destructive" onClick={() => handleDelete(u.id)}>
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
