/**
 * Импорт Word-документа как HTML-шаблона договора:
 *  - .docx → mammoth
 *  - .doc  → отклоняем с понятным сообщением
 *  - поиск «дыр» (___, «», [ФИО] и т.п.) → массив слотов с контекстом
 *  - применение маппинга: замена оригинального токена на {{key}}
 */

export interface TemplateSlot {
  id: string;
  /** оригинальный текст-заглушка, как он есть в HTML */
  token: string;
  /** позиция первого символа токена в исходном HTML */
  start: number;
  /** контекст ~120 символов вокруг для показа пользователю */
  context: string;
  /** локальная эвристика: что это скорее всего */
  hint?: string;
}

export type SlotAction = "map" | "skip";

export interface SlotMapping {
  action: SlotAction;
  /** каноническая переменная без {{ }} */
  key?: string;
}

const HINT_RULES: Array<{ re: RegExp; hint: string }> = [
  { re: /№\s*$/i, hint: "contract_number" },
  { re: /от\s*«?\s*$/i, hint: "contract_date" },
  { re: /действующ(?:его|ей)\s+на\s+основании\s*$/i, hint: "company_director_basis" },
  { re: /на\s+основании\s*$/i, hint: "company_director_basis" },
  { re: /в\s+лице\s*$/i, hint: "company_director" },
  { re: /(заказчик|именуем(?:ое|ый|ая)\s+в\s+дальнейшем\s+«?заказчик)/i, hint: "company_name" },
  { re: /(инн|огрн|кпп)\s*[:№]?\s*$/i, hint: "company_inn" },
  { re: /программе?\s*«?\s*$/i, hint: "course_title" },
  { re: /(стоимост|сумм|цен)/i, hint: "total_price" },
  { re: /(кол(?:ичество|-?во)|человек|обучающ)/i, hint: "students_count" },
  { re: /(часов|объ[её]м|продолжительность)/i, hint: "course_hours" },
];

/** Загрузить Word-файл и получить HTML. */
export async function importWordAsHtml(file: File): Promise<{ html: string; warnings: string[] }> {
  const name = file.name.toLowerCase();
  if (name.endsWith(".doc") && !name.endsWith(".docx")) {
    throw new Error(
      "Формат .doc не поддерживается в браузере. Откройте файл в Word и сохраните как .docx (Файл → Сохранить как → Документ Word .docx).",
    );
  }
  if (!name.endsWith(".docx")) {
    throw new Error("Поддерживаются только файлы .docx");
  }
  const { default: mammoth } = await import("mammoth");
  const arrayBuffer = await file.arrayBuffer();
  const result = await mammoth.convertToHtml(
    { arrayBuffer },
    {
      styleMap: [
        "p[style-name='Title'] => h1",
        "p[style-name='Heading 1'] => h1",
        "p[style-name='Heading 2'] => h2",
        "p[style-name='Heading 3'] => h3",
      ],
      includeDefaultStyleMap: true,
    },
  );
  return {
    html: result.value || "",
    warnings: (result.messages || []).map((m: any) => m.message).filter(Boolean),
  };
}

// Регэкспы «дыр». Порядок важен: более специфичные — первыми.
const SLOT_REGEXPS: RegExp[] = [
  /_{3,}/g, // ______
  /\[[^\]\n<>]{2,60}\]/g, // [ФИО заказчика]
  /«\s{2,}»/g, // «    »
  /«___+»/g, // «___»
];

// Empty table cells (пустые <td></td> / <td> </td>) — часто это места под ФИО, программу и т.п.
const EMPTY_TD_RE = /<td[^>]*>\s*(?:&nbsp;|\u00A0|\s)*\s*<\/td>/gi;

/** Найти слоты-заглушки. Возвращаются в порядке возникновения. */
export function detectSlots(html: string): TemplateSlot[] {
  const found: Array<{ start: number; end: number; token: string; kind?: string }> = [];
  for (const re of SLOT_REGEXPS) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(html)) !== null) {
      found.push({ start: m.index, end: m.index + m[0].length, token: m[0] });
    }
  }
  // Пустые ячейки таблицы: даём отдельный вид слота, у него hint будет по заголовку колонки.
  EMPTY_TD_RE.lastIndex = 0;
  let tm: RegExpExecArray | null;
  while ((tm = EMPTY_TD_RE.exec(html)) !== null) {
    found.push({ start: tm.index, end: tm.index + tm[0].length, token: tm[0], kind: "td" });
  }
  // Удалить пересечения (оставляем первый по позиции)
  found.sort((a, b) => a.start - b.start);
  const unique: typeof found = [];
  let lastEnd = -1;
  for (const f of found) {
    if (f.start >= lastEnd) {
      unique.push(f);
      lastEnd = f.end;
    }
  }
  return unique.map((f, i) => {
    const before = stripTags(html.slice(Math.max(0, f.start - 200), f.start));
    const after = stripTags(html.slice(f.end, Math.min(html.length, f.end + 120)));
    const tokenLabel = f.kind === "td" ? "◻ пустая ячейка" : f.token;
    const context = `${before.slice(-140)} ⟦${tokenLabel}⟧ ${after.slice(0, 80)}`.replace(/\s+/g, " ").trim();
    let hint = HINT_RULES.find(r => r.re.test(before))?.hint;
    // Хинты для табличных слотов по колонкам
    if (!hint && f.kind === "td") {
      const tail = before.slice(-260).toLowerCase();
      if (/ф\.?и\.?о\.?|фамилия|обучающ/.test(tail)) hint = "students_table";
      else if (/программ|курс|обучени/.test(tail)) hint = "programs_table";
    }
    return { id: `slot_${i}`, token: f.token, start: f.start, context, hint };
  });
}

function stripTags(s: string): string {
  return s.replace(/<[^>]+>/g, " ");
}

/** Применить маппинги к HTML: заменяет токены на {{key}} в обратном порядке позиций. */
export function applyMappings(html: string, slots: TemplateSlot[], mappings: Record<string, SlotMapping>): string {
  const ordered = [...slots].sort((a, b) => b.start - a.start);
  let out = html;
  for (const s of ordered) {
    const m = mappings[s.id];
    if (!m || m.action !== "map" || !m.key) continue;
    const key = m.key.replace(/[^a-zA-Z0-9_]/g, "");
    if (!key) continue;
    out = out.slice(0, s.start) + `{{${key}}}` + out.slice(s.start + s.token.length);
  }
  return out;
}
