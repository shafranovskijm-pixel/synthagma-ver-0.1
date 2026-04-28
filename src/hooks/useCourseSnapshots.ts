import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export type SnapshotReason =
  | "manual"
  | "before_ai_review"
  | "before_ai_generate"
  | "before_import"
  | "before_restore";

export interface CourseSnapshot {
  id: string;
  course_id: string;
  organization_id: string;
  created_by: string | null;
  reason: SnapshotReason | string;
  label: string | null;
  created_at: string;
  payload?: any;
}

const REASON_LABEL: Record<string, string> = {
  manual: "Ручное сохранение",
  before_ai_review: "Перед AI-проверкой",
  before_ai_generate: "Перед AI-генерацией",
  before_import: "Перед импортом",
  before_restore: "Перед восстановлением",
};

export function getSnapshotReasonLabel(reason: string): string {
  return REASON_LABEL[reason] ?? reason;
}

interface BuildPayloadResult {
  payload: any;
  lessonsCount: number;
  questionsCount: number;
}

async function buildSnapshotPayload(courseId: string): Promise<BuildPayloadResult | null> {
  const [{ data: course }, { data: lessons }, { data: documents }] = await Promise.all([
    supabase.from("courses").select("*").eq("id", courseId).maybeSingle(),
    supabase.from("lessons").select("*").eq("course_id", courseId).order("order_index"),
    supabase.from("course_documents").select("*").eq("course_id", courseId),
  ]);

  if (!course) return null;
  const lessonIds = (lessons ?? []).map((l: any) => l.id);
  let questions: any[] = [];
  if (lessonIds.length > 0) {
    const { data: qs } = await supabase
      .from("test_questions")
      .select("*")
      .in("lesson_id", lessonIds);
    questions = qs ?? [];
  }

  return {
    payload: {
      course,
      lessons: lessons ?? [],
      test_questions: questions,
      course_documents: documents ?? [],
    },
    lessonsCount: lessons?.length ?? 0,
    questionsCount: questions.length,
  };
}

export function useCourseSnapshots(courseId: string | null, organizationId: string | null) {
  const [snapshots, setSnapshots] = useState<CourseSnapshot[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);

  const refresh = useCallback(async () => {
    if (!courseId) return;
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from("course_snapshots")
        .select("id, course_id, organization_id, created_by, reason, label, created_at")
        .eq("course_id", courseId)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      setSnapshots((data ?? []) as CourseSnapshot[]);
    } catch (err: any) {
      console.error("[useCourseSnapshots] refresh error", err);
    } finally {
      setIsLoading(false);
    }
  }, [courseId]);

  useEffect(() => {
    if (courseId) refresh();
  }, [courseId, refresh]);

  const createSnapshot = useCallback(
    async (reason: SnapshotReason, label?: string): Promise<CourseSnapshot | null> => {
      if (!courseId || !organizationId) return null;
      setIsCreating(true);
      try {
        const built = await buildSnapshotPayload(courseId);
        if (!built) {
          toast.error("Не удалось подготовить снимок курса");
          return null;
        }
        const { data, error } = await supabase
          .from("course_snapshots")
          .insert({
            course_id: courseId,
            organization_id: organizationId,
            reason,
            label: label ?? null,
            payload: built.payload,
          })
          .select("id, course_id, organization_id, created_by, reason, label, created_at")
          .single();
        if (error) throw error;
        setSnapshots((prev) => [data as CourseSnapshot, ...prev]);
        return data as CourseSnapshot;
      } catch (err: any) {
        console.error("[useCourseSnapshots] createSnapshot error", err);
        toast.error("Не удалось сохранить версию курса", {
          description: err?.message || undefined,
        });
        return null;
      } finally {
        setIsCreating(false);
      }
    },
    [courseId, organizationId]
  );

  const restoreSnapshot = useCallback(
    async (snapshotId: string): Promise<boolean> => {
      setIsRestoring(true);
      try {
        const { data, error } = await supabase.rpc("restore_course_snapshot", {
          _snapshot_id: snapshotId,
        });
        if (error) throw error;
        const result = (data ?? {}) as { success?: boolean; restored_lessons?: number };
        if (!result.success) throw new Error("Восстановление не выполнено");
        toast.success("Версия восстановлена", {
          description: `Уроков: ${result.restored_lessons ?? 0}. Текущее состояние сохранено как «Перед восстановлением».`,
        });
        await refresh();
        return true;
      } catch (err: any) {
        console.error("[useCourseSnapshots] restoreSnapshot error", err);
        toast.error("Не удалось восстановить версию", {
          description: err?.message || undefined,
        });
        return false;
      } finally {
        setIsRestoring(false);
      }
    },
    [refresh]
  );

  const deleteSnapshot = useCallback(
    async (snapshotId: string) => {
      try {
        const { error } = await supabase.from("course_snapshots").delete().eq("id", snapshotId);
        if (error) throw error;
        setSnapshots((prev) => prev.filter((s) => s.id !== snapshotId));
        toast.success("Версия удалена");
      } catch (err: any) {
        toast.error("Не удалось удалить версию", { description: err?.message });
      }
    },
    []
  );

  return {
    snapshots,
    isLoading,
    isCreating,
    isRestoring,
    refresh,
    createSnapshot,
    restoreSnapshot,
    deleteSnapshot,
  };
}
