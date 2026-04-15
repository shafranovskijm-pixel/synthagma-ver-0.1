import React, { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Checkbox } from "@/components/ui/checkbox";
import { Trophy } from "lucide-react";
import { toast } from "sonner";
import { SigmaSpinner } from "@/components/ui/SigmaSpinner";

const RARITY_STYLES: Record<string, { bg: string; border: string; text: string }> = {
  common: { bg: "bg-muted/50", border: "border-muted-foreground/20", text: "text-muted-foreground" },
  rare: { bg: "bg-blue-500/10", border: "border-blue-500/30", text: "text-blue-500" },
  epic: { bg: "bg-violet-500/10", border: "border-violet-500/30", text: "text-violet-500" },
  legendary: { bg: "bg-amber-500/10", border: "border-amber-500/30", text: "text-amber-500" } };

const RARITY_LABELS: Record<string, string> = {
  common: "Обычное",
  rare: "Редкое",
  epic: "Эпичное",
  legendary: "Легендарное" };

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

export function CourseAchievementsTab({ courseId, organizationId }: CourseAchievementsTabProps) {
  const [achievements, setAchievements] = useState<Achievement[]>([]);
  const [linkedIds, setLinkedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState<string | null>(null);

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

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <SigmaSpinner />
      </div>
    );
  }

  if (achievements.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <Trophy className="w-12 h-12 mx-auto mb-3 opacity-30" />
        <p className="font-medium">Нет достижений</p>
        <p className="text-sm mt-1">Создайте достижения в общих настройках организации</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">Достижения курса</h3>
        <span className="text-sm text-muted-foreground">{linkedIds.size} из {achievements.length} выбрано</span>
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
              <Checkbox
                checked={isLinked}
                disabled={toggling === ach.id}
                className="shrink-0"
              />
              <div className="text-2xl shrink-0">{ach.icon}</div>
              <div className="flex-1 min-w-0">
                <div className="font-medium truncate">{ach.name}</div>
                <div className="text-sm text-muted-foreground truncate">{ach.description}</div>
              </div>
              <span className={`text-xs font-medium px-2 py-1 rounded-full ${style.bg} ${style.text}`}>
                {RARITY_LABELS[ach.rarity] || ach.rarity}
              </span>
              {toggling === ach.id && <SigmaSpinner size="sm" className="shrink-0" />}
            </div>
          );
        })}
      </div>
    </div>
  );
}
