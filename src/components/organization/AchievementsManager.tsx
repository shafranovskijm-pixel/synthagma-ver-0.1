import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Plus, Sparkles, LayoutGrid, Wand2, Loader2, Trash2,
  ChevronDown, ChevronUp, HardHat, Stethoscope, Monitor, Star,
  Trophy, BookOpen, Award,
} from "lucide-react";

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

const RARITY_STYLES: Record<string, { bg: string; border: string; badge: string; label: string; glow: string }> = {
  common:    { bg: "bg-muted/40",       border: "border-border",           badge: "bg-muted text-muted-foreground",   label: "Обычное",     glow: "" },
  rare:      { bg: "bg-blue-500/5",     border: "border-blue-400/40",      badge: "bg-blue-500/15 text-blue-400",     label: "Редкое",      glow: "shadow-blue-500/10 shadow-md" },
  epic:      { bg: "bg-purple-500/5",   border: "border-purple-400/40",    badge: "bg-purple-500/15 text-purple-400", label: "Эпичное",     glow: "shadow-purple-500/15 shadow-lg" },
  legendary: { bg: "bg-amber-500/5",    border: "border-amber-400/50",     badge: "bg-amber-500/15 text-amber-500",   label: "Легендарное", glow: "shadow-amber-500/20 shadow-lg" },
};

const getRarity = (r: string) => RARITY_STYLES[r] || RARITY_STYLES.common;

const TEMPLATE_CATEGORIES = [
  {
    id: "construction", name: "Строительство", description: "Достижения для строительных курсов и охраны труда",
    icon: HardHat, gradient: "from-orange-500/20 to-amber-500/10", borderColor: "border-orange-400/30",
    items: [
      { name: "Прораб", description: "Завершил первый курс по строительству", icon: "🏗️", rarity: "common", code: "construction_start", category: "learning", color: "#f97316" },
      { name: "Каменщик знаний", description: "Изучил 10 уроков подряд", icon: "🧱", rarity: "rare", code: "brick_learner", category: "streak", color: "#3b82f6" },
      { name: "Архитектор", description: "Прошёл все курсы в категории", icon: "🏛️", rarity: "epic", code: "architect", category: "completion", color: "#8b5cf6" },
      { name: "Мастер безопасности", description: "Сдал экзамен по ОТ на 100%", icon: "🦺", rarity: "legendary", code: "safety_master", category: "excellence", color: "#f59e0b" },
      { name: "Высотник", description: "Завершил курс по работам на высоте", icon: "🏔️", rarity: "rare", code: "height_worker", category: "learning", color: "#06b6d4" },
    ],
  },
  {
    id: "medicine", name: "Медицина", description: "Достижения для медицинских и санитарных курсов",
    icon: Stethoscope, gradient: "from-emerald-500/20 to-teal-500/10", borderColor: "border-emerald-400/30",
    items: [
      { name: "Первая помощь", description: "Прошёл курс по первой помощи", icon: "🩺", rarity: "common", code: "first_aid", category: "learning", color: "#10b981" },
      { name: "Исследователь", description: "Изучил 20 уроков", icon: "🔬", rarity: "rare", code: "researcher", category: "streak", color: "#3b82f6" },
      { name: "Доктор наук", description: "Прошёл 5 медицинских курсов", icon: "💊", rarity: "epic", code: "doctor", category: "completion", color: "#8b5cf6" },
      { name: "Светило медицины", description: "Идеальный результат по всем тестам", icon: "⚕️", rarity: "legendary", code: "medical_star", category: "excellence", color: "#f59e0b" },
    ],
  },
  {
    id: "it", name: "IT и технологии", description: "Достижения для IT-курсов и цифровых навыков",
    icon: Monitor, gradient: "from-cyan-500/20 to-blue-500/10", borderColor: "border-cyan-400/30",
    items: [
      { name: "Кодер", description: "Начал обучение по программированию", icon: "💻", rarity: "common", code: "coder_start", category: "learning", color: "#06b6d4" },
      { name: "Баг-хантер", description: "Сдал 10 тестов без ошибок", icon: "🐛", rarity: "rare", code: "bug_hunter", category: "streak", color: "#3b82f6" },
      { name: "Деплой мастер", description: "Завершил продвинутый курс", icon: "🚀", rarity: "epic", code: "deploy_master", category: "completion", color: "#8b5cf6" },
      { name: "Full Stack", description: "Прошёл все IT-курсы организации", icon: "🧠", rarity: "legendary", code: "full_stack", category: "excellence", color: "#f59e0b" },
    ],
  },
  {
    id: "general", name: "Общие", description: "Универсальные достижения для любых курсов",
    icon: Star, gradient: "from-violet-500/20 to-pink-500/10", borderColor: "border-violet-400/30",
    items: [
      { name: "Первый шаг", description: "Начал обучение на платформе", icon: "👣", rarity: "common", code: "first_step", category: "learning", color: "#6366f1" },
      { name: "Книжный червь", description: "Провёл 10 часов за обучением", icon: "📖", rarity: "rare", code: "bookworm", category: "streak", color: "#3b82f6" },
      { name: "Звезда курса", description: "Лучший результат на курсе", icon: "🌟", rarity: "epic", code: "course_star", category: "excellence", color: "#8b5cf6" },
      { name: "Чемпион", description: "Прошёл все курсы с отличием", icon: "🏆", rarity: "legendary", code: "champion", category: "excellence", color: "#f59e0b" },
      { name: "Марафонец", description: "30 дней подряд обучения", icon: "🏃", rarity: "epic", code: "marathoner", category: "streak", color: "#ec4899" },
    ],
  },
];

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
      color: "#6366f1", condition_type: "manual", organization_id: organizationId, is_template: false,
    });
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
      condition_type: "manual", organization_id: organizationId, is_template: false,
    }));
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
      color: "#6366f1", condition_type: "manual", organization_id: organizationId, is_template: false,
    }));
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
                    <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
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
                                  ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
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
                      {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
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
                    {aiLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />}
                    Сгенерировать
                  </Button>
                </div>
                {aiLoading && (
                  <div className="flex flex-col items-center justify-center py-16 gap-3">
                    <Loader2 className="w-8 h-8 animate-spin text-primary" />
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
                      {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
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
