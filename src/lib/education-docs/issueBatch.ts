import { supabase } from "@/integrations/supabase/client";
import { localDateIso } from "@/lib/date/localDate";

/**
 * Выдача документов об образовании (ФИС ФРДО).
 *
 * Номера документа и регистрационного номера выдаёт ТОЛЬКО транзакционный RPC
 * `issue_education_document_batch`: он проверяет права организации, состав
 * группы и точный курс, берёт advisory-lock и атомарно резервирует оба номера.
 * Клиентские подсчёты (`records.length + 1`) и любые fallback-номера запрещены —
 * при ошибке ничего не вставляется.
 */

export interface EducationDocumentItemInput {
  user_id: string;
  enrollment_id?: string | null;
  document_type: string;
  full_name: string;
  birth_date?: string | null;
  specialty_name: string;
  qualification_name?: string | null;
  /** Локальная бизнес-дата выдачи (localDateIso). */
  issue_date?: string | null;
  document_status?: string | null;
  delivery_method?: string | null;
  /** Итог обучения (оценка/решение комиссии), как есть, без выдумывания. */
  education_result?: string | null;
  notes?: string | null;
}

export interface IssueEducationDocumentsArgs {
  organizationId: string;
  /** Строгая привязка партии: группа и курс. */
  groupId?: string | null;
  courseId?: string | null;
  items: EducationDocumentItemInput[];
}

export interface IssueBatchPayload {
  p_organization_id: string;
  p_group_id: string | null;
  p_course_id: string | null;
  p_items: Array<Record<string, string | null>>;
}

/** Pure: нормализация payload (даты — локальные, пустые значения — null). */
export function buildIssueBatchPayload({
  organizationId,
  groupId,
  courseId,
  items,
}: IssueEducationDocumentsArgs): IssueBatchPayload {
  if (!organizationId) throw new Error("organizationId обязателен");
  if (!items.length) throw new Error("Нет выпускников для выдачи документов");
  if (!courseId) throw new Error("Точный courseId обязателен для выдачи документа");
  if (items.length > 500) throw new Error("За один раз можно выдать не более 500 документов");

  const today = localDateIso();
  return {
    p_organization_id: organizationId,
    p_group_id: groupId || null,
    p_course_id: courseId || null,
    p_items: items.map((it) => {
      if (!it.user_id) throw new Error("У записи отсутствует user_id — выдача отменена");
      if (!it.enrollment_id) throw new Error("У записи отсутствует enrollment_id — выдача отменена");
      return {
        user_id: it.user_id,
        enrollment_id: it.enrollment_id || null,
        document_type: it.document_type || "certificate",
        full_name: (it.full_name || "").trim(),
        birth_date: it.birth_date || null,
        specialty_name: (it.specialty_name || "").trim(),
        qualification_name: it.qualification_name || null,
        issue_date: it.issue_date || today,
        document_status: it.document_status || "original",
        delivery_method: it.delivery_method || "personal",
        education_result: it.education_result || null,
        notes: it.notes || null,
      };
    }),
  };
}

/**
 * Выполняет транзакционную выдачу. Возвращает вставленные строки.
 * При ошибке бросает — вызывающий код не должен вставлять ничего сам.
 */
export async function issueEducationDocumentBatch(
  args: IssueEducationDocumentsArgs,
  client: { rpc: (fn: string, params: unknown) => Promise<{ data: unknown; error: unknown }> } = supabase as any,
): Promise<any[]> {
  const payload = buildIssueBatchPayload(args);
  const { data, error } = await client.rpc("issue_education_document_batch", payload);
  if (error) {
    const message = (error as { message?: string })?.message || "Не удалось выдать номера документов";
    throw new Error(message);
  }
  return (data as any[]) || [];
}

/**
 * Ключ сопоставления выданной записи с исходным элементом.
 * enrollment_id глобально идентифицирует зачисление и работает также для
 * legacy-строк, где новые user_id/course_id ещё не были заполнены.
 */
export function issuedRowKey(row: { user_id?: string | null; enrollment_id?: string | null }): string {
  if (row.enrollment_id) return `enrollment:${row.enrollment_id}`;
  return `user:${row.user_id || ""}`;
}

export interface CourseScopedItem extends EducationDocumentItemInput {
  /** Точный курс записи (course_id зачисления). */
  course_id?: string | null;
}

/**
 * Выдаёт документы, группируя по точному course_id: каждая партия — отдельная
 * атомарная транзакция с правильным course_id/group_id. При ошибке любой партии
 * бросает, сообщая, сколько партий уже выдано (partial-состояние прозрачно).
 */
export async function issueEducationDocumentsByCourse(
  args: {
    organizationId: string;
    groupId?: string | null;
    items: CourseScopedItem[];
  },
  client?: { rpc: (fn: string, params: unknown) => Promise<{ data: unknown; error: unknown }> },
): Promise<any[]> {
  const byCourse = new Map<string, CourseScopedItem[]>();
  for (const item of args.items) {
    const key = String(item.course_id || "").trim();
    if (!key) {
      throw new Error("У записи отсутствует точный course_id — выдача документов отменена");
    }
    if (!item.enrollment_id) {
      throw new Error("У записи отсутствует enrollment_id — выдача документов отменена");
    }
    const list = byCourse.get(key) || [];
    list.push(item);
    byCourse.set(key, list);
  }

  const issued: any[] = [];
  let done = 0;
  for (const [courseId, items] of byCourse) {
    try {
      const rows = await issueEducationDocumentBatch(
        {
          organizationId: args.organizationId,
          groupId: args.groupId || null,
          courseId,
          items,
        },
        client as any,
      );
      issued.push(...rows);
      done += 1;
    } catch (e: any) {
      throw new Error(
        `${e?.message || "Ошибка выдачи документов"} (выдано партий: ${done} из ${byCourse.size})`,
      );
    }
  }
  return issued;
}
