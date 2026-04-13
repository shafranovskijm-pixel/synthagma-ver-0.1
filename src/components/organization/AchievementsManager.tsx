import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import {
  Plus, Sparkles, Copy, Trash2, Loader2, Pencil, LayoutTemplate,
  HardHat, Stethoscope, Monitor, Star,
} from "lucide-react";

interface Achievement {
  id: string;
  code: string;
  name: string;
  description: string;
  icon: string;
  color: string;
  rarity: string;
  category: string;
  condition_type: string;
  organization_id: string | null;
  is_template: boolean;
  is_secret: boolean | null;
}

interface Props {
  organizationId: string;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
}

const TEMPLATE_CATEGORIES = [
  { id: "construction", label: "Строительство", icon: HardHat, prefix: "tpl_" },
  { id: "medicine", label: "Медицина", icon: Stethoscope, prefix: "tpl_" },
  { id: "it", label: "IT", icon: Monitor, prefix: "tpl_" },
  { id: "general", label: "Общие", icon: Star, prefix: "tpl_" },
];

const TEMPLATE_MAPPING: Record<string, string[]> = {
  construction: ["tpl_foreman", "tpl_mason", "tpl_architect", "tpl_safety_hat", "tpl_builder"],
  medicine: ["tpl_doctor", "tpl_first_aid", "tpl_researcher", "tpl_healer", "tpl_hygiene"],
  it: ["tpl_coder", "tpl_bug_hunter", "tpl_deploy_master", "tpl_hacker"],
  general: ["tpl_star", "tpl_bookworm", "tpl_champion", "tpl_lightning", "tpl_team_player"],
};

const rarityLabels: Record<string, string> = {
  common: "Обычное",
  rare: "Редкое",
  epic: "Эпичное",
  legendary: "Легендарное",
};

const categoryOptions = [
  { value: "start", label: "Старт обучения" },
  { value: "progress", label: "Прогресс" },
  { value: "activity", label: "Активность" },
  { value: "assessment", label: "Аттестация" },
  { value: "return", label: "Возвращение" },
  { value: "secret", label: "Секретные" },
  { value: "custom", label: "Пользовательская" },
];

export function AchievementsManager({ organizationId, isOpen, onOpenChange }: Props) {
  const [achievements, setAchievements] = useState<Achievement[]>([]);
  const [templates, setTemplates] = useState<Achievement[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<"list" | "add" | "templates" | "ai">("list");
  const [editingId, setEditingId] = useState<string | null>(null);

  // Form state
  const [form, setForm] = useState({ name: "", description: "", icon: "🏆", rarity: "common", category: "custom", condition_type: "manual", is_secret: false });
  const [saving, setSaving] = useState(false);

  // AI state
  const [aiTheme, setAiTheme] = useState("");
  const [aiGenerating, setAiGenerating] = useState(false);
  const [aiResults, setAiResults] = useState<any[]>([]);

  useEffect(() => {
    if (isOpen) loadData();
  }, [isOpen, organizationId]);

  const loadData = async () => {
    setLoading(true);
    const [{ data: orgAch }, { data: tplAch }] = await Promise.all([
      supabase.from("achievements").select("*").eq("organization_id", organizationId).order("name"),
      supabase.from("achievements").select("*").eq("is_template", true).is("organization_id", null),
    ]);
    setAchievements((orgAch as Achievement[]) || []);
    setTemplates((tplAch as Achievement[]) || []);
    setLoading(false);
  };

  const handleSave = async () => {
    if (!form.name.trim()) { toast.error("Введите название"); return; }
    setSaving(true);
    const code = editingId ? undefined : `org_${organizationId.slice(0, 8)}_${Date.now()}`;
    const payload = {
      ...(code ? { code } : {}),
      name: form.name,
      description: form.description,
      icon: form.icon,
      color: "#6366f1",
      rarity: form.rarity,
      category: form.category,
      condition_type: form.condition_type,
      is_secret: form.is_secret,
      organization_id: organizationId,
      is_template: false,
    };

    let error;
    if (editingId) {
      ({ error } = await supabase.from("achievements").update(payload).eq("id", editingId));
    } else {
      ({ error } = await supabase.from("achievements").insert(payload as any));
    }

    if (error) { toast.error("Ошибка сохранения"); console.error(error); }
    else {
      toast.success(editingId ? "Достижение обновлено" : "Достижение создано");
      resetForm();
      setView("list");
      loadData();
    }
    setSaving(false);
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from("achievements").delete().eq("id", id);
    if (error) toast.error("Ошибка удаления");
    else { toast.success("Достижение удалено"); loadData(); }
  };

  const applyTemplate = async (categoryId: string) => {
    const codes = TEMPLATE_MAPPING[categoryId] || [];
    const tpls = templates.filter(t => codes.includes(t.code));
    if (!tpls.length) { toast.error("Шаблоны не найдены"); return; }

    const inserts = tpls.map(t => ({
      code: `org_${organizationId.slice(0, 8)}_${t.code}_${Date.now()}`,
      name: t.name,
      description: t.description,
      icon: t.icon,
      color: t.color,
      rarity: t.rarity,
      category: t.category,
      condition_type: t.condition_type,
      organization_id: organizationId,
      is_template: false,
      is_secret: false,
    }));

    const { error } = await supabase.from("achievements").insert(inserts as any);
    if (error) { toast.error("Ошибка применения шаблона"); console.error(error); }
    else { toast.success(`Добавлено ${inserts.length} достижений`); loadData(); setView("list"); }
  };

  const generateWithAI = async () => {
    if (!aiTheme.trim()) { toast.error("Введите тему"); return; }
    setAiGenerating(true);
    setAiResults([]);
    try {
      const { data, error } = await supabase.functions.invoke("generate-achievements", {
        body: { theme: aiTheme, organizationId, count: 6 },
      });
      if (error) throw error;
      setAiResults(data?.achievements || []);
    } catch (e) {
      console.error(e);
      toast.error("Ошибка генерации");
    }
    setAiGenerating(false);
  };

  const saveAiResults = async () => {
    if (!aiResults.length) return;
    const inserts = aiResults.map((a: any) => ({
      code: `org_${organizationId.slice(0, 8)}_ai_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      name: a.name,
      description: a.description,
      icon: a.icon,
      color: a.color || "#6366f1",
      rarity: a.rarity || "common",
      category: a.category || "custom",
      condition_type: "manual",
      organization_id: organizationId,
      is_template: false,
      is_secret: false,
    }));
    const { error } = await supabase.from("achievements").insert(inserts as any);
    if (error) { toast.error("Ошибка сохранения"); console.error(error); }
    else { toast.success(`Добавлено ${inserts.length} достижений`); setAiResults([]); setAiTheme(""); setView("list"); loadData(); }
  };

  const resetForm = () => {
    setForm({ name: "", description: "", icon: "🏆", rarity: "common", category: "custom", condition_type: "manual", is_secret: false });
    setEditingId(null);
  };

  const startEdit = (a: Achievement) => {
    setForm({ name: a.name, description: a.description, icon: a.icon, rarity: a.rarity, category: a.category, condition_type: a.condition_type, is_secret: a.is_secret ?? false });
    setEditingId(a.id);
    setView("add");
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">🏆 Управление достижениями</DialogTitle>
        </DialogHeader>

        {/* Navigation */}
        <div className="flex flex-wrap gap-2 mb-4">
          <Button variant={view === "list" ? "default" : "outline"} size="sm" className="rounded-xl gap-1.5" onClick={() => { setView("list"); resetForm(); }}>
            Список ({achievements.length})
          </Button>
          <Button variant={view === "add" ? "default" : "outline"} size="sm" className="rounded-xl gap-1.5" onClick={() => { setView("add"); resetForm(); }}>
            <Plus className="w-3.5 h-3.5" /> Добавить
          </Button>
          <Button variant={view === "templates" ? "default" : "outline"} size="sm" className="rounded-xl gap-1.5" onClick={() => setView("templates")}>
            <LayoutTemplate className="w-3.5 h-3.5" /> Шаблоны
          </Button>
          <Button variant={view === "ai" ? "default" : "outline"} size="sm" className="rounded-xl gap-1.5" onClick={() => setView("ai")}>
            <Sparkles className="w-3.5 h-3.5" /> Генерация ИИ
          </Button>
        </div>

        {loading ? (
          <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
        ) : (
          <>
            {/* LIST */}
            {view === "list" && (
              <div className="space-y-2">
                {achievements.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <p className="text-sm">Нет достижений. Создайте вручную, выберите шаблон или сгенерируйте с ИИ.</p>
                  </div>
                ) : (
                  achievements.map(a => (
                    <div key={a.id} className="flex items-center gap-3 p-3 rounded-xl border border-border hover:bg-accent/5 transition-colors">
                      <span className="text-2xl">{a.icon}</span>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm truncate">{a.name}</p>
                        <p className="text-xs text-muted-foreground truncate">{a.description}</p>
                      </div>
                      <Badge variant="secondary" className="text-xs shrink-0">{rarityLabels[a.rarity] || a.rarity}</Badge>
                      <div className="flex gap-1 shrink-0">
                        <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg" onClick={() => startEdit(a)}>
                          <Pencil className="w-3.5 h-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg text-destructive hover:text-destructive" onClick={() => handleDelete(a.id)}>
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}

            {/* ADD / EDIT */}
            {view === "add" && (
              <div className="space-y-4">
                <div className="grid grid-cols-[80px_1fr] gap-4 items-start">
                  <div>
                    <Label className="text-xs">Иконка</Label>
                    <Input value={form.icon} onChange={e => setForm(p => ({ ...p, icon: e.target.value }))} className="text-center text-2xl h-12 rounded-xl" maxLength={4} />
                  </div>
                  <div>
                    <Label className="text-xs">Название</Label>
                    <Input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="Мастер курсов" className="rounded-xl" />
                  </div>
                </div>
                <div>
                  <Label className="text-xs">Описание</Label>
                  <Input value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} placeholder="За выдающиеся успехи в обучении" className="rounded-xl" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-xs">Редкость</Label>
                    <Select value={form.rarity} onValueChange={v => setForm(p => ({ ...p, rarity: v }))}>
                      <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="common">Обычное</SelectItem>
                        <SelectItem value="rare">Редкое</SelectItem>
                        <SelectItem value="epic">Эпичное</SelectItem>
                        <SelectItem value="legendary">Легендарное</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs">Категория</Label>
                    <Select value={form.category} onValueChange={v => setForm(p => ({ ...p, category: v }))}>
                      <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {categoryOptions.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setForm(p => ({ ...p, is_secret: !p.is_secret }))}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${form.is_secret ? 'bg-primary' : 'bg-muted'}`}
                  >
                    <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${form.is_secret ? 'translate-x-6' : 'translate-x-1'}`} />
                  </button>
                  <span className="text-sm">Секретное достижение</span>
                </div>
                <Button className="btn-gradient rounded-xl gap-2 w-full" onClick={handleSave} disabled={saving}>
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                  {editingId ? "Сохранить изменения" : "Создать достижение"}
                </Button>
              </div>
            )}

            {/* TEMPLATES */}
            {view === "templates" && (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">Выберите набор шаблонов для вашей тематики. Достижения будут скопированы и станут редактируемыми.</p>
                {TEMPLATE_CATEGORIES.map(cat => {
                  const Icon = cat.icon;
                  const count = TEMPLATE_MAPPING[cat.id]?.length || 0;
                  const tpls = templates.filter(t => TEMPLATE_MAPPING[cat.id]?.includes(t.code));
                  return (
                    <div key={cat.id} className="rounded-xl border border-border p-4 hover:bg-accent/5 transition-colors">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <Icon className="w-5 h-5 text-primary" />
                          <span className="font-medium">{cat.label}</span>
                          <Badge variant="secondary" className="text-xs">{count} шт.</Badge>
                        </div>
                        <Button size="sm" variant="outline" className="rounded-xl gap-1.5" onClick={() => applyTemplate(cat.id)}>
                          <Copy className="w-3.5 h-3.5" /> Применить
                        </Button>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {tpls.map(t => (
                          <span key={t.id} className="text-xs bg-muted rounded-lg px-2 py-1">
                            {t.icon} {t.name}
                          </span>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* AI GENERATION */}
            {view === "ai" && (
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">Опишите тематику вашей организации — ИИ сгенерирует подходящие достижения.</p>
                <div className="flex gap-2">
                  <Input
                    value={aiTheme}
                    onChange={e => setAiTheme(e.target.value)}
                    placeholder="Например: строительство и охрана труда"
                    className="rounded-xl"
                    onKeyDown={e => e.key === "Enter" && generateWithAI()}
                  />
                  <Button className="btn-gradient rounded-xl gap-2 shrink-0" onClick={generateWithAI} disabled={aiGenerating}>
                    {aiGenerating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                    Генерировать
                  </Button>
                </div>
                {aiResults.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-sm font-medium">Результат ({aiResults.length} достижений):</p>
                    {aiResults.map((a, i) => (
                      <div key={i} className="flex items-center gap-3 p-3 rounded-xl border border-border bg-accent/5">
                        <span className="text-2xl">{a.icon}</span>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm">{a.name}</p>
                          <p className="text-xs text-muted-foreground">{a.description}</p>
                        </div>
                        <Badge variant="secondary" className="text-xs">{rarityLabels[a.rarity] || a.rarity}</Badge>
                      </div>
                    ))}
                    <Button className="btn-gradient rounded-xl gap-2 w-full" onClick={saveAiResults}>
                      <Plus className="w-4 h-4" /> Добавить все
                    </Button>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
