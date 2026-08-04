import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  emptyFactualData,
  type AttestationFact,
  type GroupFactualData,
  type LessonCompletionFact,
  type RegistrationFact,
} from "@/lib/group-docs/factualData";

/**
 * Снимок ФАКТИЧЕСКИХ данных Синтагмы для документов группы.
 * Ничего не домысливает: нет строки в БД — нет значения в документе.
 */
export function useGroupFactualData(
  organizationId: string | null,
  courseId: string | null,
  userIds: string[],
) {
  const [data, setData] = useState<GroupFactualData>(emptyFactualData());
  const [loading, setLoading] = useState(false);

  const key = userIds.slice().sort().join(",");

  const load = useCallback(async () => {
    const ids = key ? key.split(",") : [];
    if (!organizationId || ids.length === 0) {
      setData(emptyFactualData());
      return;
    }
    setLoading(true);
    try {
      // Уроки курса — чтобы ограничить прогресс рамками программы группы
      let lessonIds: string[] = [];
      const lessonTitles = new Map<string, string>();
      if (courseId) {
        const { data: lessons } = await supabase
          .from("lessons")
          .select("id, title")
          .eq("course_id", courseId);
        (lessons || []).forEach((l: any) => {
          lessonIds.push(l.id);
          lessonTitles.set(l.id, l.title || "");
        });
      }

      const progressQuery = supabase
        .from("lesson_progress")
        .select("user_id, lesson_id, completed, completed_at")
        .in("user_id", ids)
        .eq("completed", true);
      const { data: progress } = lessonIds.length
        ? await progressQuery.in("lesson_id", lessonIds)
        : await progressQuery;

      const lessonCompletions: LessonCompletionFact[] = (progress || [])
        .filter((p: any) => p.completed_at)
        .map((p: any) => ({
          user_id: p.user_id,
          date: String(p.completed_at).slice(0, 10),
          lesson_title: lessonTitles.get(p.lesson_id) || undefined,
        }));

      // Итоговая аттестация: лучшая попытка по каждому ученику
      const attemptsQuery = supabase
        .from("test_attempts")
        .select("user_id, lesson_id, score, max_score, completed_at")
        .in("user_id", ids);
      const { data: attempts } = lessonIds.length
        ? await attemptsQuery.in("lesson_id", lessonIds)
        : await attemptsQuery;

      const best = new Map<string, AttestationFact>();
      (attempts || []).forEach((a: any) => {
        if (!a.max_score) return;
        const ratio = Number(a.score) / Number(a.max_score);
        const prev = best.get(a.user_id);
        const prevRatio = prev && prev.max_score ? prev.score / prev.max_score : -1;
        if (ratio > prevRatio) {
          best.set(a.user_id, {
            user_id: a.user_id,
            score: Number(a.score),
            max_score: Number(a.max_score),
            date: a.completed_at ? String(a.completed_at).slice(0, 10) : null,
          });
        }
      });

      // Книга регистрации: только реально выданные документы
      const { data: enrollments } = await supabase
        .from("enrollments")
        .select("id, user_id")
        .in("user_id", ids);
      const enrollmentIds = (enrollments || []).map((e: any) => e.id);
      const byEnrollment = new Map<string, string>();
      (enrollments || []).forEach((e: any) => byEnrollment.set(e.id, e.user_id));

      let registration: RegistrationFact[] = [];
      if (enrollmentIds.length) {
        const { data: records } = await supabase
          .from("education_document_records")
          .select(
            "enrollment_id, full_name, birth_date, document_type, document_series, document_number, issue_date, order_number, specialty_name",
          )
          .eq("organization_id", organizationId)
          .in("enrollment_id", enrollmentIds)
          .is("deleted_at", null);
        registration = (records || []).map((r: any) => ({
          user_id: r.enrollment_id ? byEnrollment.get(r.enrollment_id) || null : null,
          full_name: r.full_name || "",
          document_type: r.document_type || "",
          document_series: r.document_series || "",
          document_number: r.document_number || "",
          issue_date: r.issue_date || "",
          order_number: r.order_number || "",
          birth_date: r.birth_date || undefined,
          program: r.specialty_name || undefined,
        }));
      }

      setData({
        lessonCompletions,
        attestation: Array.from(best.values()),
        registration,
        // Структурированного расписания в Синтагме пока нет — ячейки остаются пустыми.
        schedule: [],
      });
    } catch {
      setData(emptyFactualData());
    } finally {
      setLoading(false);
    }
  }, [organizationId, courseId, key]);

  useEffect(() => {
    load();
  }, [load]);

  return { factual: data, loading, refresh: load };
}
