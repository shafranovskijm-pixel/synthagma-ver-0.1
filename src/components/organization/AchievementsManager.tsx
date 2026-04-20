import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { SigmaSpinner } from "@/components/ui/SigmaSpinner";
import {
  Plus, Sparkles, LayoutGrid, Wand2, Trash2,
  ChevronDown, ChevronUp,
  Trophy, BookOpen, Award } from "lucide-react";
import { TEMPLATE_CATEGORIES, RARITY_STYLES, getRarity } from "@/constants/achievementTemplates";

interface Achievement {
  id: string;
  name: string;
  description: string;
  icon: string;
  rarity: string;
  category: string;
  code: string;
  color: string;
  condition_type: string;
  condition_value: number | null;
  organization_id: string | null;
  is_template: boolean;
}

interface Props {
  organizationId: string;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
}


type View = "gallery" | "templates" | "create" | "ai";

function AchievementCard({ a, onDelete }: { a: Achievement; onDelete?: (id: string) => void }) {
  const r = getRarity(a.rarity);
  return (
    <div className={`relative group rounded-2xl border ${r.border} ${r.bg} ${r.glow} p-4 transition-all hover:scale-[1.02]`}>
      {onDelete && (
        <button onClick={() => onDelete(a.id)} className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity p-1.5 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive">
          <Trash2 className="w-4 h-4" />
        </button>
      )}
      <div className="text-4xl mb-3">{a.icon}</div>
      <h4 className="font-semibold text-sm leading-tight mb-1">{a.name}</h4>
      <p className="text-xs text-muted-foreground leading-snug mb-3 line-clamp-2">{a.description}</p>
      <Badge className={`${r.badge} text-[10px] px-2 py-0.5 rounded-full border-0`}>{r.label}</Badge>
    </div>
  );
}

function PreviewCard({ name, description, icon, rarity }: { name: string; description: string; icon: string; rarity: string }) {
  const r = getRarity(rarity);
  return (
    <div className={`rounded-2xl border ${r.border} ${r.bg} ${r.glow} p-5 text-center transition-all`}>
      <div className="text-5xl mb-3">{icon || "🎯"}</div>
      <h4 className="font-semibold text-sm mb-1">{name || "Название"}</h4>
      <p className="text-xs text-muted-foreground mb-3">{description || "Описание достижения"}</p>
      <Badge className={`${r.badge} text-[10px] px-2 py-0.5 rounded-full border-0`}>{r.label}</Badge>
    </div>
  );
}

export function AchievementsManager({ organizationId, isOpen, onOpenChange }: Props) {
  const [view, setView] = useState<View>("gallery");
  const [achievements, setAchievements] = useState<Achievement[]>([]);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({ name: "", description: "", icon: "🎯", rarity: "common", category: "learning", code: "" });
  const [saving, setSaving] = useState(false);
  const [aiTheme, setAiTheme] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiResults, setAiResults] = useState<any[]>([]);
  const [expandedTemplate, setExpandedTemplate] = useState<string | null>(null);
  const [applyingTemplate, setApplyingTemplate] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase.from("achievements").select("*").eq("organization_id", organizationId).eq("is_template", false);
    setAchievements((data as Achievement[]) || []);
    setLoading(false);
  };

  useEffect(() => { if (isOpen) { load(); setView("gallery"); } }, [isOpen, organizationId]);

  const handleDelete = async (id: string) => {
    await supabase.from("achievements").delete().eq("id", id);
    setAchievements(prev => prev.filter(a => a.id !== id));
    toast.success("Достижение удалено");
  };

  const handleCreate = async () => {
    if (!form.name.trim()) { toast.error("Введите название"); return; }
    setSaving(true);
    const { error } = await supabase.from("achievements").insert({
      ...form, code: form.code || `org_${organizationId.slice(0, 8)}_${Date.now()}`,
      color: "#6366f1", condition_type: "manual", organization_id: organizationId, is_template: false });
    if (error) toast.error("Ошибка создания");
    else { toast.success("Достижение создано"); setForm({ name: "", description: "", icon: "🎯", rarity: "common", category: "learning", code: "" }); load(); setView("gallery"); }
    setSaving(false);
  };

  const handleApplyTemplate = async (catId: string) => {
    const cat = TEMPLATE_CATEGORIES.find(c => c.id === catId);
    if (!cat) return;
    setApplyingTemplate(catId);
    const inserts = cat.items.map(i => ({
      ...i, code: `org_${organizationId.slice(0, 8)}_${i.code}_${Date.now()}`,
      condition_type: "manual", organization_id: organizationId, is_template: false }));
    const { error } = await supabase.from("achievements").insert(inserts);
    if (error) toast.error("Ошибка применения шаблона");
    else { toast.success(`Шаблон «${cat.name}» применён`); load(); }
    setApplyingTemplate(null);
  };

  const handleAiGenerate = async () => {
    if (!aiTheme.trim()) { toast.error("Введите тему"); return; }
    setAiLoading(true); setAiResults([]);
    try {
      const { data, error } = await supabase.functions.invoke("generate-achievements", { body: { theme: aiTheme, organizationId, count: 6 } });
      if (error) throw error;
      setAiResults(data?.achievements || []);
    } catch { toast.error("Ошибка генерации"); }
    setAiLoading(false);
  };

  const handleSaveAiResults = async () => {
    if (!aiResults.length) return;
    setSaving(true);
    const inserts = aiResults.map((a: any) => ({
      name: a.name, description: a.description, icon: a.icon, rarity: a.rarity,
      category: a.category || "learning", code: `org_${organizationId.slice(0, 8)}_ai_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      color: "#6366f1", condition_type: "manual", organization_id: organizationId, is_template: false }));
    const { error } = await supabase.from("achievements").insert(inserts);
    if (error) toast.error("Ошибка сохранения");
    else { toast.success("Достижения сохранены"); setAiResults([]); setAiTheme(""); load(); setView("gallery"); }
    setSaving(false);
  };

  const NAV: { id: View; icon: any; label: string }[] = [
    { id: "gallery", icon: LayoutGrid, label: "Мои достижения" },
    { id: "templates", icon: BookOpen, label: "Шаблоны" },
    { id: "create", icon: Plus, label: "Создать" },
    { id: "ai", icon: Wand2, label: "Генерация ИИ" },
  ];

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl h-[80vh] p-0 gap-0 overflow-hidden rounded-2xl">
        <div className="flex h-full">
          {/* Sidebar */}
          <div className="w-52 shrink-0 border-r border-border bg-muted/30 flex flex-col">
            <DialogHeader className="p-5 pb-4">
              <DialogTitle className="text-base flex items-center gap-2">
                <Trophy className="w-5 h-5 text-primary" /> Достижения
              </DialogTitle>
              <DialogDescription className="text-xs">
                Управление наградами учеников
              </DialogDescription>
            </DialogHeader>
            <nav className="flex-1 px-3 space-y-1">
              {NAV.map(n => (
                <button key={n.id} onClick={() => setView(n.id)}
                  className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
                    view === n.id
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  }`}>
                  <n.icon className="w-4 h-4" /> {n.label}
                </button>
              ))}
            </nav>
            <div className="p-4 border-t border-border">
              <div className="text-xs text-muted-foreground text-center">
                {achievements.length} достижен{achievements.length === 1 ? "ие" : achievements.length < 5 && achievements.length > 1 ? "ия" : "ий"}
              </div>
            </div>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-6">
            {/* Gallery */}
            {view === "gallery" && (
              <div>
                <h3 className="text-lg font-semibold mb-1">Ваши достижения</h3>
                <p className="text-sm text-muted-foreground mb-5">Достижения, доступные вашим ученикам</p>
                {loading ? (
                  <div className="flex items-center justify-center py-20">
                    <SigmaSpinner />
                  </div>
                ) : achievements.length === 0 ? (
                  <div className="text-center py-16">
                    <Award className="w-12 h-12 text-muted-foreground/40 mx-auto mb-4" />
                    <h4 className="font-medium text-foreground mb-1">Пока нет достижений</h4>
                    <p className="text-sm text-muted-foreground mb-5">Создайте свои или выберите из готовых шаблонов</p>
                    <div className="flex gap-2 justify-center">
                      <Button variant="outline" className="rounded-xl gap-2" onClick={() => setView("templates")}>
                        <BookOpen className="w-4 h-4" /> Шаблоны
                      </Button>
                      <Button className="rounded-xl gap-2 btn-gradient" onClick={() => setView("create")}>
                        <Plus className="w-4 h-4" /> Создать
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
                    {achievements.map(a => (
                      <AchievementCard key={a.id} a={a} onDelete={handleDelete} />
                    ))}
                    <button onClick={() => setView("create")}
                      className="rounded-2xl border-2 border-dashed border-border hover:border-primary/40 p-4 flex flex-col items-center justify-center gap-2 text-muted-foreground hover:text-primary transition-all min-h-[140px]">
                      <Plus className="w-6 h-6" />
                      <span className="text-xs font-medium">Добавить</span>
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Templates */}
            {view === "templates" && (
              <div>
                <h3 className="text-lg font-semibold mb-1">Шаблоны достижений</h3>
                <p className="text-sm text-muted-foreground mb-5">Выберите тематический набор и добавьте все достижения одним кликом</p>
                <div className="space-y-4">
                  {TEMPLATE_CATEGORIES.map(cat => {
                    const isExpanded = expandedTemplate === cat.id;
                    return (
                      <div key={cat.id} className={`rounded-2xl border ${cat.borderColor} overflow-hidden transition-all`}>
                        <div className={`bg-gradient-to-r ${cat.gradient} p-5`}>
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <div className="w-11 h-11 rounded-xl bg-background/80 backdrop-blur flex items-center justify-center">
                                <cat.icon className="w-6 h-6 text-foreground" />
                              </div>
                              <div>
                                <h4 className="font-semibold text-foreground">{cat.name}</h4>
                                <p className="text-xs text-muted-foreground">{cat.description} · {cat.items.length} шт.</p>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <Button size="sm" variant="outline" className="rounded-xl gap-1.5 text-xs"
                                onClick={() => setExpandedTemplate(isExpanded ? null : cat.id)}>
                                {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                                {isExpanded ? "Свернуть" : "Посмотреть"}
                              </Button>
                              <Button size="sm" className="rounded-xl gap-1.5 text-xs btn-gradient"
                                disabled={applyingTemplate === cat.id} onClick={() => handleApplyTemplate(cat.id)}>
                                {applyingTemplate === cat.id
                                  ? <SigmaSpinner size="xs" className=".5 .5" />
                                  : <Plus className="w-3.5 h-3.5" />}
                                Применить
                              </Button>
                            </div>
                          </div>
                          {!isExpanded && (
                            <div className="flex gap-2 mt-3">
                              {cat.items.slice(0, 5).map((item, i) => (
                                <div key={i} className="w-9 h-9 rounded-lg bg-background/60 backdrop-blur flex items-center justify-center text-lg" title={item.name}>
                                  {item.icon}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                        {isExpanded && (
                          <div className="p-4 grid grid-cols-2 lg:grid-cols-3 gap-3 bg-background/50">
                            {cat.items.map((item, i) => {
                              const r = getRarity(item.rarity);
                              return (
                                <div key={i} className={`rounded-xl border ${r.border} ${r.bg} ${r.glow} p-3`}>
                                  <div className="text-3xl mb-2">{item.icon}</div>
                                  <h5 className="font-medium text-sm mb-0.5">{item.name}</h5>
                                  <p className="text-xs text-muted-foreground mb-2 line-clamp-2">{item.description}</p>
                                  <Badge className={`${r.badge} text-[10px] px-2 py-0.5 rounded-full border-0`}>{r.label}</Badge>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Create */}
            {view === "create" && (
              <div>
                <h3 className="text-lg font-semibold mb-1">Создать достижение</h3>
                <p className="text-sm text-muted-foreground mb-5">Заполните форму — превью обновляется в реальном времени</p>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <div className="space-y-4">
                    <div>
                      <label className="text-sm font-medium mb-1.5 block">Название</label>
                      <Input className="rounded-xl" placeholder="Мастер курса" value={form.name}
                        onChange={e => setForm(p => ({ ...p, name: e.target.value }))} />
                    </div>
                    <div>
                      <label className="text-sm font-medium mb-1.5 block">Описание</label>
                      <Input className="rounded-xl" placeholder="За что выдаётся это достижение" value={form.description}
                        onChange={e => setForm(p => ({ ...p, description: e.target.value }))} />
                    </div>
                    <div>
                      <label className="text-sm font-medium mb-1.5 block">Эмодзи-иконка</label>
                      <Input className="rounded-xl w-24 text-center text-2xl" value={form.icon}
                        onChange={e => setForm(p => ({ ...p, icon: e.target.value }))} />
                    </div>
                    <div>
                      <label className="text-sm font-medium mb-2 block">Редкость</label>
                      <div className="grid grid-cols-2 gap-2">
                        {Object.entries(RARITY_STYLES).map(([key, s]) => (
                          <button key={key} onClick={() => setForm(p => ({ ...p, rarity: key }))}
                            className={`rounded-xl border px-3 py-2.5 text-sm font-medium transition-all ${
                              form.rarity === key
                                ? `${s.border} ${s.bg} ring-2 ring-primary/30`
                                : "border-border hover:border-primary/30"
                            }`}>
                            {s.label}
                          </button>
                        ))}
                      </div>
                    </div>
                    <Button className="w-full rounded-xl gap-2 btn-gradient" onClick={handleCreate} disabled={saving}>
                      {saving ? <SigmaSpinner size="sm" /> : <Plus className="w-4 h-4" />}
                      Создать достижение
                    </Button>
                  </div>
                  <div className="flex items-start justify-center pt-4">
                    <div className="w-full max-w-[200px]">
                      <p className="text-xs text-muted-foreground text-center mb-3">Превью</p>
                      <PreviewCard name={form.name} description={form.description} icon={form.icon} rarity={form.rarity} />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* AI */}
            {view === "ai" && (
              <div>
                <h3 className="text-lg font-semibold mb-1 flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-primary" /> Генерация с ИИ
                </h3>
                <p className="text-sm text-muted-foreground mb-5">Опишите тематику — ИИ создаст набор достижений для ваших учеников</p>
                <div className="flex gap-2 mb-6">
                  <Input className="rounded-xl flex-1" placeholder="Например: охрана труда в нефтегазовой отрасли"
                    value={aiTheme} onChange={e => setAiTheme(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && handleAiGenerate()} />
                  <Button className="rounded-xl gap-2 btn-gradient" onClick={handleAiGenerate} disabled={aiLoading}>
                    {aiLoading ? <SigmaSpinner size="sm" /> : <Wand2 className="w-4 h-4" />}
                    Сгенерировать
                  </Button>
                </div>
                {aiLoading && (
                  <div className="flex flex-col items-center justify-center py-16 gap-3">
                    <SigmaSpinner size="lg" />
                    <p className="text-sm text-muted-foreground">Генерируем достижения...</p>
                  </div>
                )}
                {aiResults.length > 0 && (
                  <>
                    <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 mb-5">
                      {aiResults.map((a: any, i: number) => {
                        const r = getRarity(a.rarity);
                        return (
                          <div key={i} className={`rounded-2xl border ${r.border} ${r.bg} ${r.glow} p-4`}>
                            <div className="text-4xl mb-3">{a.icon}</div>
                            <h4 className="font-semibold text-sm mb-1">{a.name}</h4>
                            <p className="text-xs text-muted-foreground mb-3 line-clamp-2">{a.description}</p>
                            <Badge className={`${r.badge} text-[10px] px-2 py-0.5 rounded-full border-0`}>{r.label}</Badge>
                          </div>
                        );
                      })}
                    </div>
                    <Button className="w-full rounded-xl gap-2 btn-gradient" onClick={handleSaveAiResults} disabled={saving}>
                      {saving ? <SigmaSpinner size="sm" /> : <Plus className="w-4 h-4" />}
                      Сохранить все ({aiResults.length})
                    </Button>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
