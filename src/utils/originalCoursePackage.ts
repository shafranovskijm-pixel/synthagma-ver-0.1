import { z } from "zod";

const label = z.string().trim().min(1).max(600);
const hours = z.number().finite().min(0).max(3000);
const key = z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/);
const question = z.object({
  key, question: label,
  options: z.array(z.object({ text: label }).strict()).min(2).max(8),
  correct_answer: z.number().int().min(0),
  explanation: z.string().trim().min(1).max(12000),
  source_ref: label,
}).strict().superRefine((q, ctx) => {
  if (q.correct_answer >= q.options.length) ctx.addIssue({ code: "custom", message: "Ключ вне вариантов" });
  if (new Set(q.options.map(o => o.text)).size !== q.options.length) ctx.addIssue({ code: "custom", message: "Варианты повторяются" });
});
const source = z.object({ id: key, title: label, url: z.string().url().regex(/^https:\/\//).optional(), locator: label }).strict();
const lesson = z.object({
  key, module_key: key, title: label,
  type: z.enum(["text", "homework", "test"]),
  hours, content: z.string().max(500000),
  final_assessment: z.boolean(),
  questions: z.array(question).max(300),
}).strict();
export const originalCourseSchema = z.object({
  schema_version: z.literal(1), source_kind: z.literal("original-private-course"),
  package_id: z.string().uuid(), title: label,
  description: z.string().trim().min(1).max(12000),
  code: label, version: label, hours: hours.refine(h => h > 0),
  approval_status: z.literal("unconfirmed"),
  sources: z.array(source).min(1).max(100),
  modules: z.array(z.object({ key, title: label, hours }).strict()).min(1).max(100),
  lessons: z.array(lesson).min(1).max(500),
}).strict();
export type OriginalCoursePackage = z.infer<typeof originalCourseSchema>;

// This format deliberately permits no HTML attributes or active elements. The
// server enforces the same restricted subset for direct RPC callers as well.
export function hasOnlyPassiveCourseMarkup(content: string): boolean {
  const withoutTags = content.replace(/<\/?(?:h[1-6]|p|ul|ol|li|strong|b|em|i|u|s|table|thead|tbody|tfoot|tr|th|td|caption|blockquote|pre|code|br|hr)\s*\/?>/gi, "");
  return !/[<>]/.test(withoutTags);
}

export function parseOriginalCoursePackage(raw: string): OriginalCoursePackage {
  if (new TextEncoder().encode(raw).byteLength > 10 * 1024 * 1024) throw new Error("Пакет курса превышает 10 МБ");
  let payload: OriginalCoursePackage;
  try { payload = originalCourseSchema.parse(JSON.parse(raw)); }
  catch { throw new Error("Некорректный пакет курса: проверьте структуру, источники и явные ключи тестов"); }
  const modules = new Map(payload.modules.map(m => [m.key, m]));
  const lessonKeys = new Set(payload.lessons.map(l => l.key));
  const sourceIds = new Set(payload.sources.map(s => s.id));
  if (modules.size !== payload.modules.length || lessonKeys.size !== payload.lessons.length || sourceIds.size !== payload.sources.length) throw new Error("В пакете повторяются идентификаторы");
  const questionKeys = new Set<string>();
  for (const l of payload.lessons) {
    if (!modules.has(l.module_key)) throw new Error("Занятие ссылается на отсутствующий модуль");
    if (l.type === "test") {
      if (!l.questions.length || l.content !== "") throw new Error("Тест должен содержать закрытые вопросы отдельно от текста");
    } else {
      if (l.questions.length || !l.content.trim()) throw new Error("Некорректное содержимое занятия");
      if (l.type === "homework" && /[<>]/.test(l.content)) throw new Error("Практическое задание должно быть обычным текстом");
      if (l.type === "text" && !hasOnlyPassiveCourseMarkup(l.content)) throw new Error("В лекции есть неподдерживаемая разметка");
    }
    for (const q of l.questions) {
      if (questionKeys.has(q.key)) throw new Error("Вопросы имеют одинаковые идентификаторы");
      questionKeys.add(q.key);
      if (!sourceIds.has(q.source_ref.split(" :: ")[0])) throw new Error("У вопроса отсутствует источник");
    }
  }
  for (const m of payload.modules) {
    const items = payload.lessons.filter(l => l.module_key === m.key);
    if (!items.length || Math.abs(items.reduce((s, l) => s + l.hours, 0) - m.hours) > 0.000001) throw new Error("Часы модуля не совпадают с занятиями");
  }
  if (Math.abs(payload.modules.reduce((s, m) => s + m.hours, 0) - payload.hours) > 0.000001) throw new Error("Не совпадает общий объём курса");
  return payload;
}
