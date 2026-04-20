import React, { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Trophy, Plus, BookOpen, ChevronDown, ChevronUp, Sparkles, X } from "lucide-react";
import { toast } from "sonner";
import { SigmaSpinner } from "@/components/ui/SigmaSpinner";
import { TEMPLATE_CATEGORIES, RARITY_STYLES } from "@/constants/achievementTemplates";

interface Achievement {
  id: string;
  name: string;
  description: string;
  icon: string;
  rarity: string;
  category: string;
}

interface CourseAchievementsTabProps {
  courseId: string;
  organizationId: string;
}

type Mode = "list" | "create" | "templates";

export function CourseAchievementsTab({ courseId, organizationId }: CourseAchievementsTabProps) {
  const [achievements, setAchievements] = useState<Achievement[]>([]);
  const [linkedIds, setLinkedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>("list");
  const [form, setForm] = useState({ name: "", description: "", icon: "🎯", rarity: "common" });
  const [saving, setSaving] = useState(false);
  const [expandedTemplate, setExpandedTemplate] = useState<string | null>(null);
  const [applyingTemplate, setApplyingTemplate] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [{ data: allAch }, { data: linked }] = await Promise.all([
        supabase
          .from("achievements")
          .select("id, name, description, icon, rarity, category")
          .eq("organization_id", organizationId),
        supabase
          .from("course_achievements")
          .select("achievement_id")
          .eq("course_id", courseId),
      ]);
      setAchievements((allAch || []) as Achievement[]);
      setLinkedIds(new Set((linked || []).map((l: any) => l.achievement_id)));
    } catch (e) {
      console.error("Error loading achievements:", e);
    } finally {
      setLoading(false);
    }
  }, [courseId, organizationId]);

  useEffect(() => { loadData(); }, [loadData]);

  const handleToggle = async (achievementId: string) => {
    setToggling(achievementId);
    try {
      if (linkedIds.has(achievementId)) {
        const { error } = await supabase
          .from("course_achievements")
          .delete()
          .eq("course_id", courseId)
          .eq("achievement_id", achievementId);
        if (error) throw error;
        setLinkedIds(prev => { const n = new Set(prev); n.delete(achievementId); return n; });
        toast.success("Достижение убрано из курса");
      } else {
        const { error } = await supabase
          .from("course_achievements")
          .insert({ course_id: courseId, achievement_id: achievementId });
        if (error) throw error;
        setLinkedIds(prev => new Set(prev).add(achievementId));
        toast.success("Достижение добавлено к курсу");
      }
    } catch (e) {
      console.error("Error toggling achievement:", e);
      toast.error("Ошибка сохранения");
    } finally {
      setToggling(null);
    }
  };

  const linkAchievementsToCourse = async (achievementIds: string[]) => {
    if (!achievementIds.length) return;
    const rows = achievementIds.map(id => ({ course_id: courseId, achievement_id: id }));
    await supabase.from("course_achievements").upsert(rows, { onConflict: "course_id,achievement_id" } as any);
  };

  const handleCreate = async () => {
    if (!form.name.trim()) { toast.error("Введите название"); return; }
    setSaving(true);
    try {
      const code = `org_${organizationId.slice(0, 8)}_${Date.now()}`;
      const { data, error } = await supabase.from("achievements").insert({
        name: form.name,
        description: form.description,
        icon: form.icon,
        rarity: form.rarity,
        category: "learning",
        code,
        color: "#6366f1",
        condition_type: "manual",
        organization_id: organizationId,
        is_template: false,
      }).select("id").single();
      if (error) throw error;
      if (data?.id) await linkAchievementsToCourse([data.id]);
      toast.success("Достижение создано и добавлено к курсу");
      setForm({ name: "", description: "", icon: "🎯", rarity: "common" });
      setMode("list");
      loadData();
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message || "Ошибка создания");
    } finally {
      setSaving(false);
    }
  };

  const handleApplyTemplate = async (catId: string) => {
    const cat = TEMPLATE_CATEGORIES.find(c => c.id === catId);
    if (!cat) return;
    setApplyingTemplate(catId);
    try {
      const inserts = cat.items.map(i => ({
        ...i,
        code: `org_${organizationId.slice(0, 8)}_${i.code}_${Date.now()}`,
        condition_type: "manual",
        organization_id: organizationId,
        is_template: false,
      }));
      const { data, error } = await supabase.from("achievements").insert(inserts).select("id");
      if (error) throw error;
      const ids = (data || []).map((d: any) => d.id);
      await linkAchievementsToCourse(ids);
      toast.success(`Шаблон «${cat.name}» применён к курсу`);
      setMode("list");
      loadData();
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message || "Ошибка применения шаблона");
    } finally {
      setApplyingTemplate(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <SigmaSpinner />
      </div>
    );
  }

  // Render: Create form
  if (mode === "create") {
    return (
      <div className="space-y-4 max-w-xl">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold flex items-center gap-2"><Plus className="w-4 h-4 text-primary" />Создать достижение</h3>
          <Button variant="ghost" size="icon" onClick={() => setMode("list")}><X className="w-4 h-4" /></Button>
        </div>
        <div className="space-y-3 p-5 rounded-2xl border border-border bg-card">
          <div>
            <label className="text-sm font-medium mb-1.5 block">Название</label>
            <Input className="rounded-xl" placeholder="Мастер курса" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} />
          </div>
          <div>
            <label className="text-sm font-medium mb-1.5 block">Описание</label>
            <Input className="rounded-xl" placeholder="За что выдаётся это достижение" value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} />
          </div>
          <div>
            <label className="text-sm font-medium mb-1.5 block">Эмодзи</label>
            <Input className="rounded-xl w-24 text-center text-2xl" value={form.icon} onChange={e => setForm(p => ({ ...p, icon: e.target.value }))} />
          </div>
          <div>
            <label className="text-sm font-medium mb-2 block">Редкость</label>
            <div className="grid grid-cols-2 gap-2">
              {Object.entries(RARITY_STYLES).map(([key, s]) => (
                <button key={key} type="button" onClick={() => setForm(p => ({ ...p, rarity: key }))}
                  className={`rounded-xl border px-3 py-2.5 text-sm font-medium transition-all ${
                    form.rarity === key ? `${s.border} ${s.bg} ring-2 ring-primary/30` : "border-border hover:border-primary/30"
                  }`}>
                  {s.label}
                </button>
              ))}
            </div>
          </div>
          <Button className="w-full rounded-xl gap-2 btn-gradient" onClick={handleCreate} disabled={saving}>
            {saving ? <SigmaSpinner size="sm" /> : <Plus className="w-4 h-4" />}
            Создать и добавить к курсу
          </Button>
        </div>
      </div>
    );
  }

  // Render: Templates picker
  if (mode === "templates") {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold flex items-center gap-2"><BookOpen className="w-4 h-4 text-primary" />Шаблоны достижений</h3>
          <Button variant="ghost" size="icon" onClick={() => setMode("list")}><X className="w-4 h-4" /></Button>
        </div>
        <p className="text-sm text-muted-foreground">Выберите тематический набор — все достижения будут созданы и сразу привязаны к этому курсу.</p>
        <div className="space-y-3">
          {TEMPLATE_CATEGORIES.map(cat => {
            const isExpanded = expandedTemplate === cat.id;
            const Icon = cat.icon;
            return (
              <div key={cat.id} className={`rounded-2xl border ${cat.borderColor} overflow-hidden`}>
                <div className={`bg-gradient-to-r ${cat.gradient} p-4`}>
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-10 h-10 rounded-xl bg-background/80 backdrop-blur flex items-center justify-center shrink-0">
                        <Icon className="w-5 h-5 text-foreground" />
                      </div>
                      <div className="min-w-0">
                        <h4 className="font-semibold text-sm truncate">{cat.name}</h4>
                        <p className="text-xs text-muted-foreground truncate">{cat.description} · {cat.items.length} шт.</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Button size="sm" variant="outline" className="rounded-xl gap-1.5 text-xs" onClick={() => setExpandedTemplate(isExpanded ? null : cat.id)}>
                        {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                        {isExpanded ? "Свернуть" : "Посмотреть"}
                      </Button>
                      <Button size="sm" className="rounded-xl gap-1.5 text-xs btn-gradient" disabled={applyingTemplate === cat.id} onClick={() => handleApplyTemplate(cat.id)}>
                        {applyingTemplate === cat.id ? <SigmaSpinner size="xs" /> : <Sparkles className="w-3.5 h-3.5" />}
                        Применить
                      </Button>
                    </div>
                  </div>
                  {!isExpanded && (
                    <div className="flex gap-2 mt-3">
                      {cat.items.slice(0, 5).map((item, i) => (
                        <div key={i} className="w-9 h-9 rounded-lg bg-background/60 backdrop-blur flex items-center justify-center text-lg" title={item.name}>{item.icon}</div>
                      ))}
                    </div>
                  )}
                </div>
                {isExpanded && (
                  <div className="p-3 grid grid-cols-2 lg:grid-cols-3 gap-2 bg-background/50">
                    {cat.items.map((item, i) => {
                      const r = RARITY_STYLES[item.rarity] || RARITY_STYLES.common;
                      return (
                        <div key={i} className={`rounded-xl border ${r.border} ${r.bg} p-3`}>
                          <div className="text-2xl mb-1">{item.icon}</div>
                          <h5 className="font-medium text-sm leading-tight mb-0.5">{item.name}</h5>
                          <p className="text-xs text-muted-foreground line-clamp-2">{item.description}</p>
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
    );
  }

  // Render: List (default)
  const ActionButtons = (
    <div className="flex gap-2">
      <Button variant="outline" className="rounded-xl gap-2" onClick={() => setMode("templates")}>
        <BookOpen className="w-4 h-4" />Из шаблона
      </Button>
      <Button className="btn-gradient rounded-xl gap-2" onClick={() => setMode("create")}>
        <Plus className="w-4 h-4" />Создать достижение
      </Button>
    </div>
  );

  if (achievements.length === 0) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold">Достижения курса</h3>
        </div>
        <div className="text-center py-12 px-4 rounded-2xl border border-dashed border-border bg-card/50">
          <Trophy className="w-12 h-12 mx-auto mb-3 text-muted-foreground/40" />
          <p className="font-medium mb-1">В организации пока нет достижений</p>
          <p className="text-sm text-muted-foreground mb-5">Создайте своё или примените готовый набор — оно сразу будет привязано к этому курсу</p>
          <div className="flex gap-2 justify-center">{ActionButtons}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h3 className="font-semibold">Достижения курса</h3>
          <p className="text-xs text-muted-foreground mt-0.5">{linkedIds.size} из {achievements.length} выбрано</p>
        </div>
        {ActionButtons}
      </div>
      <div className="grid gap-3">
        {achievements.map(ach => {
          const style = RARITY_STYLES[ach.rarity] || RARITY_STYLES.common;
          const isLinked = linkedIds.has(ach.id);
          return (
            <div
              key={ach.id}
              className={`flex items-center gap-4 p-4 rounded-xl border transition-all cursor-pointer hover:shadow-sm ${
                isLinked ? `${style.bg} ${style.border}` : "bg-card border-border"
              }`}
              onClick={() => !toggling && handleToggle(ach.id)}
            >
              <Checkbox checked={isLinked} disabled={toggling === ach.id} className="shrink-0" />
              <div className="text-2xl shrink-0">{ach.icon}</div>
              <div className="flex-1 min-w-0">
                <div className="font-medium truncate">{ach.name}</div>
                <div className="text-sm text-muted-foreground truncate">{ach.description}</div>
              </div>
              <span className={`text-xs font-medium px-2 py-1 rounded-full ${style.badge}`}>{style.label}</span>
              {toggling === ach.id && <SigmaSpinner size="sm" className="shrink-0" />}
            </div>
          );
        })}
      </div>
    </div>
  );
}
