import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface ModuleSchedule {
  id: string;
  module_id: string;
  course_id: string;
  unlock_at: string; // ISO
}

export interface ModuleOverride {
  id: string;
  module_id: string;
  user_id: string;
  unlock_at: string | null;
}

/**
 * Manages global module schedules and per-user overrides for a course.
 * Manager-side: load all schedules + overrides for course modules.
 */
export function useModuleAccessManager(courseId: string | undefined, moduleIds: string[]) {
  const [schedules, setSchedules] = useState<ModuleSchedule[]>([]);
  const [overrides, setOverrides] = useState<ModuleOverride[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const reload = useCallback(async () => {
    if (!courseId || moduleIds.length === 0) {
      setSchedules([]);
      setOverrides([]);
      return;
    }
    setLoading(true);
    try {
      const [sRes, oRes] = await Promise.all([
        supabase
          .from("module_access_schedules" as never)
          .select("id, module_id, course_id, unlock_at")
          .eq("course_id", courseId),
        supabase
          .from("module_access_overrides" as never)
          .select("id, module_id, user_id, unlock_at")
          .in("module_id", moduleIds),
      ]);
      if (sRes.error) throw sRes.error;
      if (oRes.error) throw oRes.error;
      setSchedules((sRes.data as unknown as ModuleSchedule[]) || []);
      setOverrides((oRes.data as unknown as ModuleOverride[]) || []);
    } catch (e) {
      console.error("[useModuleAccess] load error", e);
    } finally {
      setLoading(false);
    }
  }, [courseId, moduleIds.join(",")]);

  useEffect(() => { void reload(); }, [reload]);

  const setModuleSchedule = useCallback(async (moduleId: string, unlockAt: Date | null) => {
    if (!courseId) return;
    setSaving(true);
    try {
      if (unlockAt === null) {
        const { error } = await supabase
          .from("module_access_schedules" as never)
          .delete()
          .eq("module_id", moduleId);
        if (error) throw error;
        setSchedules(prev => prev.filter(s => s.module_id !== moduleId));
        toast.success("Расписание модуля сброшено");
      } else {
        const payload = { module_id: moduleId, course_id: courseId, unlock_at: unlockAt.toISOString() };
        const { data, error } = await supabase
          .from("module_access_schedules" as never)
          .upsert(payload as never, { onConflict: "module_id" })
          .select("id, module_id, course_id, unlock_at")
          .single();
        if (error) throw error;
        setSchedules(prev => {
          const next = prev.filter(s => s.module_id !== moduleId);
          next.push(data as unknown as ModuleSchedule);
          return next;
        });
        toast.success("Дата открытия модуля сохранена");
      }
    } catch (e) {
      console.error(e);
      toast.error("Ошибка сохранения");
    } finally {
      setSaving(false);
    }
  }, [courseId]);

  const upsertOverrides = useCallback(async (moduleId: string, userIds: string[], unlockAt: Date | null) => {
    if (userIds.length === 0) return;
    setSaving(true);
    try {
      const rows = userIds.map(uid => ({
        module_id: moduleId,
        user_id: uid,
        unlock_at: unlockAt ? unlockAt.toISOString() : null,
      }));
      const { data, error } = await supabase
        .from("module_access_overrides" as never)
        .upsert(rows as never, { onConflict: "module_id,user_id" })
        .select("id, module_id, user_id, unlock_at");
      if (error) throw error;
      const fresh = (data as unknown as ModuleOverride[]) || [];
      setOverrides(prev => {
        const filtered = prev.filter(o => !(o.module_id === moduleId && userIds.includes(o.user_id)));
        return [...filtered, ...fresh];
      });
      toast.success(`Применено к ${userIds.length} ученик(ам)`);
    } catch (e) {
      console.error(e);
      toast.error("Ошибка сохранения переопределений");
    } finally {
      setSaving(false);
    }
  }, []);

  const removeOverride = useCallback(async (overrideId: string) => {
    setSaving(true);
    try {
      const { error } = await supabase
        .from("module_access_overrides" as never)
        .delete()
        .eq("id", overrideId);
      if (error) throw error;
      setOverrides(prev => prev.filter(o => o.id !== overrideId));
      toast.success("Переопределение удалено");
    } catch (e) {
      console.error(e);
      toast.error("Ошибка удаления");
    } finally {
      setSaving(false);
    }
  }, []);

  return {
    schedules, overrides, loading, saving,
    setModuleSchedule, upsertOverrides, removeOverride, reload,
  };
}
