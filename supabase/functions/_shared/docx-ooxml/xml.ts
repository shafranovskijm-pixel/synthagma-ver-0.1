/**
 * Минимальные строковые утилиты для работы с OOXML без DOM.
 * Используются и сервером (Deno), и юнит-тестами (vitest).
 *
 * Принцип: исходный DOCX не превращается в HTML. Мы правим только word/document.xml
 * готового клиентского файла, сохраняя стили, секции, колонтитулы и таблицы.
 */

export const TOKEN_RE = /\[\[[A-Z0-9_]+\]\]/g;

export function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Многострочное значение внутри одного <w:t> превращаем в набор строк с <w:br/>. */
export function xmlTextValue(value: string): string {
  const parts = String(value ?? "").split(/\r?\n/);
  // Values are data, not another template. Numeric XML entities preserve the
  // visible brackets in Word while preventing a later replacement pass or
  // unresolved-token check from interpreting literal [[CODE]] as a directive.
  return parts.map(part => escapeXml(part).replace(/\[/g, "&#91;"))
    .join('</w:t><w:br/><w:t xml:space="preserve">');
}

/** Заменяет токены [[KEY]] значениями. Отсутствующие ключи остаются нетронутыми. */
export function replaceTokens(xml: string, values: Record<string, string | number | null | undefined>): string {
  // Пустое значение в отдельном w:t должно стать самозакрывающимся
  // элементом. Word открывает <w:t></w:t>, но на некоторых таблицах
  // зависает при PDF-экспорте клонированных строк.
  const wholeTextToken = /<w:t(?:\s[^>]*)?>(\[\[[A-Z0-9_]+\]\])<\/w:t>/g;
  const normalized = xml.replace(wholeTextToken, (node, token) => {
    const key = token.slice(2, -2);
    if (!(key in values)) return node;
    const raw = values[key];
    if (raw === null || raw === undefined) return node;
    if (String(raw) === "") return "<w:t/>";
    const open = node.slice(0, node.indexOf(">") + 1);
    return `${open}${xmlTextValue(String(raw))}</w:t>`;
  });

  return normalized.replace(TOKEN_RE, (token) => {
    const key = token.slice(2, -2);
    if (!(key in values)) return token;
    const raw = values[key];
    if (raw === null || raw === undefined) return token;
    return xmlTextValue(String(raw));
  });
}

export function findUnresolvedTokens(xml: string): string[] {
  return Array.from(new Set(xml.match(TOKEN_RE) || []));
}

/**
 * Разбивает XML-фрагмент на элементы верхнего уровня с указанными именами тегов.
 * Учитывает вложенность одноимённых тегов (например, таблица внутри строки).
 */
export function splitTopLevel(xml: string, tags: string[]): Array<{ tag: string; xml: string; start: number; end: number }> {
  const out: Array<{ tag: string; xml: string; start: number; end: number }> = [];
  const open = new RegExp(`<(${tags.join("|")})(\\s[^>]*?)?(/?)>`, "g");
  let m: RegExpExecArray | null;
  let cursor = 0;
  while ((m = open.exec(xml))) {
    if (m.index < cursor) continue;
    const tag = m[1];
    if (m[3] === "/") {
      out.push({ tag, xml: m[0], start: m.index, end: m.index + m[0].length });
      cursor = m.index + m[0].length;
      open.lastIndex = cursor;
      continue;
    }
    // Ищем парный закрывающий тег с учётом вложенности.
    const nested = new RegExp(`<${tag}(\\s[^>]*?)?>|</${tag}>`, "g");
    nested.lastIndex = m.index + m[0].length;
    let depth = 1;
    let endIdx = -1;
    let n: RegExpExecArray | null;
    while ((n = nested.exec(xml))) {
      if (n[0].startsWith("</")) {
        depth -= 1;
        if (depth === 0) { endIdx = n.index + n[0].length; break; }
      } else {
        depth += 1;
      }
    }
    if (endIdx === -1) break;
    out.push({ tag, xml: xml.slice(m.index, endIdx), start: m.index, end: endIdx });
    cursor = endIdx;
    open.lastIndex = cursor;
  }
  return out;
}

export function getBody(documentXml: string): { prefix: string; body: string; suffix: string } {
  const s = documentXml.indexOf("<w:body>");
  const e = documentXml.lastIndexOf("</w:body>");
  if (s === -1 || e === -1) throw new Error("word/document.xml: не найден <w:body>");
  return {
    prefix: documentXml.slice(0, s + "<w:body>".length),
    body: documentXml.slice(s + "<w:body>".length, e),
    suffix: documentXml.slice(e),
  };
}

/** Текст элемента без разметки — для сопоставления заголовков приложений. */
export function elementText(xml: string): string {
  return (xml.match(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g) || [])
    .map((t) => t.replace(/<[^>]+>/g, ""))
    .join("")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}
