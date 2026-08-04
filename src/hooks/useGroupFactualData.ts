import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  emptyFactualData,
  NO_COURSE_WARNING,
  type GroupFactualData,
  type LessonCompletionFact,
  type RegistrationFact,
} from "@/lib/group-docs/factualData";
import {
  normalizeRegistrationFact,
  resolveFinalAttestationFacts,
  resolveFinalTestLessonId,
} from "@/lib/group-docs/factualResolvers";

/**
 * Снимок ФАКТИЧЕСКИХ данных Синтагмы для документов группы.
 *
 * Ничего не домысливает и никогда не расширяет выборку:
 * без courseId запросы не выполняются вообще (иначе смешались бы данные
 * других курсов того же ученика). При наличии courseId все источники
 * ограничены этим course_id и точным списком user_id группы.
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
    // Курс не привязан — честно пустой snapshot с предупреждением.
    if (!courseId) {
      setData(emptyFactualData([NO_COURSE_WARNING]));
      return;
    }
    setLoading(true);
    try {
      const warnings: string[] = [];

      // Уроки строго этого курса
      const { data: lessons } = await supabase
        .from("lessons")
        .select("id, course_id, title, type, order_index")
        .eq("course_id", courseId);
      const lessonRows = (lessons || []) as any[];
      const lessonIds = lessonRows.map((l) => l.id);
      const lessonTitles = new Map<string, string>(
        lessonRows.map((l) => [l.id, l.title || ""]),
      );

      if (lessonIds.length === 0) {
        setData({
          ...emptyFactualData(["В курсе группы нет уроков — собирать нечего."]),
          courseLinked: true,
        });
        return;
      }

      // Прохождение уроков: только уроки этого курса и только участники группы
      const { data: progress } = await supabase
        .from("lesson_progress")
        .select("user_id, lesson_id, completed, completed_at")
        .in("user_id", ids)
        .in("lesson_id", lessonIds)
        .eq("completed", true);

      const lessonCompletions: LessonCompletionFact[] = (progress || [])
        .filter((p: any) => p.completed_at)
        .map((p: any) => ({
          user_id: p.user_id,
          date: String(p.completed_at).slice(0, 10),
          lesson_title: lessonTitles.get(p.lesson_id) || undefined,
        }));

      // Итоговая аттестация: только финальный тест курса (как в журнале аттестации)
      const finalLessonId = resolveFinalTestLessonId(lessonRows, courseId);
      if (!finalLessonId) {
        warnings.push("В курсе нет урока с итоговым тестом — оценки не подставляются.");
      }
      let attestation = [] as ReturnType<typeof resolveFinalAttestationFacts>;
      if (finalLessonId) {
        const { data: attempts } = await supabase
          .from("test_attempts")
          .select("user_id, lesson_id, score, max_score, completed_at")
          .eq("lesson_id", finalLessonId)
          .in("user_id", ids);
        attestation = resolveFinalAttestationFacts(
          (attempts || []) as any[],
          finalLessonId,
          ids,
        );
      }

      // Книга регистрации: зачисления строго этого курса и этих учеников
      const { data: enrollments } = await supabase
        .from("enrollments")
        .select("id, user_id, course_id")
        .eq("course_id", courseId)
        .in("user_id", ids);
      const enrollmentRows = (enrollments || []) as any[];
      const enrollmentIds = enrollmentRows.map((e) => e.id);
      const byEnrollment = new Map<string, string>(
        enrollmentRows.map((e) => [e.id, e.user_id]),
      );

      let registration: RegistrationFact[] = [];
      if (enrollmentIds.length === 0) {
        warnings.push("Ученики группы не зачислены на привязанный курс.");
      } else {
        const [recordsRes, frdoRes, identityRes] = await Promise.all([
          supabase
            .from("education_document_records")
            .select(
              "enrollment_id, full_name, birth_date, document_type, document_series, document_number, issue_date, order_number, specialty_name",
            )
            .eq("organization_id", organizationId)
            .in("enrollment_id", enrollmentIds)
            .is("deleted_at", null),
          supabase
            .from("student_frdo_data")
            .select(
              "user_id, last_name, first_name, middle_name, birth_date, gender, citizenship, passport_series, passport_number",
            )
            .in("user_id", ids),
          supabase
            .from("student_identity_documents")
            .select("user_id, document_type, series, number")
            .in("user_id", ids),
        ]);

        const frdoByUser = new Map<string, any>(
          ((frdoRes.data as any[]) || []).map((r) => [r.user_id, r]),
        );
        const identityByUser = new Map<string, any>(
          ((identityRes.data as any[]) || []).map((r) => [r.user_id, r]),
        );

        registration = ((recordsRes.data as any[]) || []).map((r) => {
          const userId = r.enrollment_id ? byEnrollment.get(r.enrollment_id) || null : null;
          return normalizeRegistrationFact(
            { ...r, user_id: userId },
            userId ? frdoByUser.get(userId) : null,
            userId ? identityByUser.get(userId) : null,
          );
        });
      }

      setData({
        lessonCompletions,
        attestation,
        registration,
        // Структурированного расписания в Синтагме пока нет — ячейки остаются пустыми.
        schedule: [],
        courseLinked: true,
        warnings,
      });
    } catch {
      setData(emptyFactualData(["Не удалось загрузить фактические данные."]));
    } finally {
      setLoading(false);
    }
  }, [organizationId, courseId, key]);

  useEffect(() => {
    load();
  }, [load]);

  return { factual: data, loading, refresh: load };
}
