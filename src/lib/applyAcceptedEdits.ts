/**
 * Накладывает принятые правки клиента (signature_comments с resolution_status="accepted")
 * на исходный HTML-договор:
 *  • insert  → вставляет <ins>...</ins> по DOM-якорю (path/nodeOffset) или по flat-offset.
 *  • replace → заменяет диапазон [startOffset; endOffset] на <ins>replacement</ins>.
 *  • delete  → физически удаляет диапазон.
 *  • comment → игнорируется.
 *
 * Возвращает merged HTML без зависимости от внешних стилей (inline-стили на <ins>).
 *
 * Работает только в браузере (использует DOMParser + TreeWalker).
 */

export type AcceptedEditKind = "insert" | "replace" | "delete" | "comment";

export interface AcceptedEditComment {
  id: string;
  resolution_status?: string | null;
  quoted_text?: string | null;
  comment_text?: string | null;
  position_anchor?: any;
}

export interface AppliedEdit {
  id: string;
  kind: "insert" | "replace" | "delete";
  before?: string;        // что было (для replace/delete)
  after?: string;         // что стало (для insert/replace)
}

const INS_STYLE =
  "background:#dcfce7;color:#14532d;padding:0 2px;border-radius:2px;text-decoration:none;";

/** Безопасное экранирование текста при вставке как HTML. */
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Преобразует innerText-подобный «replacement» с переносами строк в HTML. */
function replacementToHtml(text: string): string {
  // \n → <br>, табы оставляем, экранируем остальное
  return escapeHtml(text).replace(/\r?\n/g, "<br>");
}

/** Считает плоский offset для (node, offset) внутри root, с учётом всех TEXT_NODE. */
function flatOffsetOf(root: Node, node: Node, offset: number): number {
  const walker = (root.ownerDocument || document).createTreeWalker(
    root,
    NodeFilter.SHOW_TEXT,
    null,
  );
  let pos = 0;
  let cur: Node | null = walker.nextNode();
  while (cur) {
    if (cur === node) return pos + Math.min(offset, (cur as Text).data.length);
    pos += (cur as Text).data.length;
    cur = walker.nextNode();
  }
  return pos;
}

/** Возвращает { node, offset } для заданного flat-offset. */
function nodeAtFlatOffset(
  root: Node,
  flatOffset: number,
): { node: Text; offset: number } | null {
  const walker = (root.ownerDocument || document).createTreeWalker(
    root,
    NodeFilter.SHOW_TEXT,
    null,
  );
  let pos = 0;
  let cur: Node | null = walker.nextNode();
  let last: Text | null = null;
  while (cur) {
    const t = cur as Text;
    const len = t.data.length;
    if (flatOffset <= pos + len) {
      return { node: t, offset: Math.max(0, flatOffset - pos) };
    }
    last = t;
    pos += len;
    cur = walker.nextNode();
  }
  if (last) return { node: last, offset: last.data.length };
  return null;
}

/** Идёт по path indexов childNodes до text-node; null, если путь невалиден. */
function nodeByPath(root: Node, path: number[]): Node | null {
  let cur: Node | null = root;
  for (const idx of path) {
    if (!cur || !cur.childNodes || idx >= cur.childNodes.length) return null;
    cur = cur.childNodes[idx];
  }
  return cur;
}

/** Применяет одну insert-правку. */
function applyInsert(
  root: HTMLElement,
  anchor: any,
  c: AcceptedEditComment,
  applied: AppliedEdit[],
): void {
  const replacement: string = anchor?.replacement ?? "";
  if (!replacement) return;

  const doc = root.ownerDocument || document;
  const ins = doc.createElement("ins");
  ins.setAttribute("data-edit", "insert");
  ins.setAttribute("data-comment-id", c.id);
  ins.setAttribute("style", INS_STYLE);
  // вставляем как HTML, чтобы корректно отрисовать переносы
  ins.innerHTML = replacementToHtml(replacement);

  // 1) пробуем DOM-anchor
  const path: number[] | undefined = anchor?.path;
  const nodeOffset: number | undefined = anchor?.nodeOffset;
  if (path && Array.isArray(path) && typeof nodeOffset === "number") {
    const target = nodeByPath(root, path);
    if (target && target.nodeType === Node.TEXT_NODE) {
      const t = target as Text;
      const safe = Math.max(0, Math.min(nodeOffset, t.data.length));
      try {
        if (safe === 0) {
          t.parentNode?.insertBefore(ins, t);
        } else if (safe >= t.data.length) {
          if (t.nextSibling) t.parentNode?.insertBefore(ins, t.nextSibling);
          else t.parentNode?.appendChild(ins);
        } else {
          const right = t.splitText(safe);
          right.parentNode?.insertBefore(ins, right);
        }
        applied.push({ id: c.id, kind: "insert", after: replacement });
        return;
      } catch (e) {
        console.warn("[applyAcceptedEdits] DOM-anchor insert failed", e);
      }
    }
  }

  // 2) fallback по flat-offset
  const startOffset: number | undefined = anchor?.startOffset;
  if (typeof startOffset === "number") {
    const target = nodeAtFlatOffset(root, startOffset);
    if (target) {
      const { node: t, offset } = target;
      try {
        if (offset === 0) {
          t.parentNode?.insertBefore(ins, t);
        } else if (offset >= t.data.length) {
          if (t.nextSibling) t.parentNode?.insertBefore(ins, t.nextSibling);
          else t.parentNode?.appendChild(ins);
        } else {
          const right = t.splitText(offset);
          right.parentNode?.insertBefore(ins, right);
        }
        applied.push({ id: c.id, kind: "insert", after: replacement });
      } catch (e) {
        console.warn("[applyAcceptedEdits] flat-offset insert failed", e);
      }
    }
  }
}

/** Возвращает Range по плоским offsets. */
function rangeByOffsets(
  root: HTMLElement,
  startOffset: number,
  endOffset: number,
): Range | null {
  const start = nodeAtFlatOffset(root, startOffset);
  const end = nodeAtFlatOffset(root, endOffset);
  if (!start || !end) return null;
  const r = (root.ownerDocument || document).createRange();
  try {
    r.setStart(start.node, start.offset);
    r.setEnd(end.node, end.offset);
    return r;
  } catch {
    return null;
  }
}

/** Возвращает Range по quoted_text (берём первое вхождение в общем тексте). */
function rangeByText(root: HTMLElement, needle: string): Range | null {
  if (!needle) return null;
  const text = (root.textContent || "");
  const idx = text.indexOf(needle);
  if (idx < 0) return null;
  return rangeByOffsets(root, idx, idx + needle.length);
}

/** Применяет одну delete-правку. */
function applyDelete(
  root: HTMLElement,
  anchor: any,
  c: AcceptedEditComment,
  applied: AppliedEdit[],
): void {
  const startOffset: number | undefined = anchor?.startOffset;
  const endOffset: number | undefined = anchor?.endOffset;
  let range: Range | null = null;
  if (
    typeof startOffset === "number" &&
    typeof endOffset === "number" &&
    endOffset > startOffset
  ) {
    range = rangeByOffsets(root, startOffset, endOffset);
  }
  if (!range && c.quoted_text) {
    range = rangeByText(root, c.quoted_text);
  }
  if (!range) return;
  const before = range.toString();
  try {
    range.deleteContents();
    applied.push({ id: c.id, kind: "delete", before });
  } catch (e) {
    console.warn("[applyAcceptedEdits] delete failed", e);
  }
}

/** Применяет одну replace-правку. */
function applyReplace(
  root: HTMLElement,
  anchor: any,
  c: AcceptedEditComment,
  applied: AppliedEdit[],
): void {
  const replacement: string = anchor?.replacement ?? "";
  if (!replacement) return;

  const startOffset: number | undefined = anchor?.startOffset;
  const endOffset: number | undefined = anchor?.endOffset;
  let range: Range | null = null;
  if (
    typeof startOffset === "number" &&
    typeof endOffset === "number" &&
    endOffset > startOffset
  ) {
    range = rangeByOffsets(root, startOffset, endOffset);
  }
  if (!range && c.quoted_text) {
    range = rangeByText(root, c.quoted_text);
  }
  if (!range) return;

  const before = range.toString();
  const doc = root.ownerDocument || document;
  const ins = doc.createElement("ins");
  ins.setAttribute("data-edit", "replace");
  ins.setAttribute("data-comment-id", c.id);
  ins.setAttribute("style", INS_STYLE);
  ins.innerHTML = replacementToHtml(replacement);

  try {
    range.deleteContents();
    range.insertNode(ins);
    applied.push({ id: c.id, kind: "replace", before, after: replacement });
  } catch (e) {
    console.warn("[applyAcceptedEdits] replace failed", e);
  }
}

/**
 * Главная функция. Возвращает merged HTML.
 * Если environment без DOM (SSR) — возвращает исходный html.
 */
export function applyAcceptedEdits(
  html: string,
  comments: AcceptedEditComment[] | null | undefined,
): { html: string; applied: AppliedEdit[] } {
  if (typeof window === "undefined" || typeof DOMParser === "undefined") {
    return { html, applied: [] };
  }
  const accepted = (comments || []).filter(
    (c) => (c.resolution_status || "").toLowerCase() === "accepted",
  );
  if (accepted.length === 0) return { html, applied: [] };

  // Сортировка: сначала более поздние (по startOffset desc), чтобы при изменениях
  // не сбивались offset'ы более ранних. Insert-only без endOffset используем startOffset.
  const sorted = [...accepted].sort((a, b) => {
    const aOff =
      a.position_anchor?.startOffset ??
      a.position_anchor?.endOffset ??
      0;
    const bOff =
      b.position_anchor?.startOffset ??
      b.position_anchor?.endOffset ??
      0;
    return bOff - aOff;
  });

  const parser = new DOMParser();
  const wrapped = `<!doctype html><html><body><div id="__root__">${html}</div></body></html>`;
  const doc = parser.parseFromString(wrapped, "text/html");
  const root = doc.getElementById("__root__") as HTMLElement | null;
  if (!root) return { html, applied: [] };

  const applied: AppliedEdit[] = [];
  for (const c of sorted) {
    const anchor = c.position_anchor || {};
    const kind: AcceptedEditKind = (anchor.kind as AcceptedEditKind) || "comment";
    if (kind === "comment") continue;
    if (kind === "insert") {
      applyInsert(root, anchor, c, applied);
    } else if (kind === "delete") {
      applyDelete(root, anchor, c, applied);
    } else if (kind === "replace") {
      applyReplace(root, anchor, c, applied);
    }
  }

  return { html: root.innerHTML, applied: applied.reverse() /* в естественном порядке */ };
}
