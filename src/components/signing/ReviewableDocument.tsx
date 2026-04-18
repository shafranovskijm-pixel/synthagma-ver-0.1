import { useEffect, useRef, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MessageSquarePlus, X, Loader2, MessageCircle, CheckCheck, Scissors, Replace, MessageSquare, Plus, Check } from "lucide-react";
import { toast } from "sonner";

export interface ReviewComment {
  id: string;
  author_name: string;
  author_role: string;
  quoted_text: string | null;
  comment_text: string;
  position_anchor: any;
  resolved: boolean;
  created_at: string;
}

type SuggestionKind = "comment" | "delete" | "replace" | "insert";

interface Props {
  documentHtml: string;
  comments: ReviewComment[];
  authorName: string;
  canComment?: boolean;
  onAddComment: (params: { quotedText: string; commentText: string; positionAnchor: any }) => Promise<void>;
}

interface SelectionState {
  text: string;
  rect: DOMRect;
  startOffset: number;
  endOffset: number;
}

/** Сохранённый DOM-якорь для точки вставки. */
interface DomAnchor {
  path: number[];          // путь индексов childNodes от docRef до text-node
  offset: number;          // позиция внутри text-node
  affinity: "before" | "after";
  flatOffset: number;      // дублируем для fallback/highlight'ов
}

/** Активная точка вставки + draft-editor, который встраивается прямо в текст. */
interface InsertDraftState {
  anchor: DomAnchor;
  rect: DOMRect; // для позиционирования "Сохранить/Отмена" toolbar
}

/**
 * Документ-рецензент, как Google Docs:
 *   • выделение текста → комментарий / удалить / заменить;
 *   • клик в текст → inline-редактор прямо в DOM в точке клика, типа CE-каретка.
 */
export function ReviewableDocument({ documentHtml, comments, authorName, canComment = true, onAddComment }: Props) {
  const docRef = useRef<HTMLDivElement>(null);
  const draftEditorRef = useRef<HTMLSpanElement | null>(null);

  const [selection, setSelection] = useState<SelectionState | null>(null);
  const [insertDraft, setInsertDraft] = useState<InsertDraftState | null>(null);

  const [draftKind, setDraftKind] = useState<SuggestionKind | null>(null);
  const [draftText, setDraftText] = useState("");
  const [draftReplacement, setDraftReplacement] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [activeCommentId, setActiveCommentId] = useState<string | null>(null);

  /** Удаляет inline draft-editor из DOM (если он был встроен). */
  const removeInlineDraft = useCallback(() => {
    const el = draftEditorRef.current;
    if (el && el.parentNode) {
      el.parentNode.removeChild(el);
    }
    draftEditorRef.current = null;
  }, []);

  const resetAll = useCallback(() => {
    removeInlineDraft();
    setDraftKind(null);
    setDraftText("");
    setDraftReplacement("");
    setSelection(null);
    setInsertDraft(null);
    try { window.getSelection()?.removeAllRanges(); } catch {}
  }, [removeInlineDraft]);

  // Получает caret-позицию из координат клика (cross-browser)
  const getCaretFromPoint = (clientX: number, clientY: number): { node: Node; offset: number } | null => {
    const doc: any = document;
    if (typeof doc.caretPositionFromPoint === "function") {
      const pos = doc.caretPositionFromPoint(clientX, clientY);
      if (pos && pos.offsetNode) return { node: pos.offsetNode, offset: pos.offset };
    }
    if (typeof doc.caretRangeFromPoint === "function") {
      const range = doc.caretRangeFromPoint(clientX, clientY);
      if (range) return { node: range.startContainer, offset: range.startOffset };
    }
    return null;
  };

  // Слушаем выделение в документе (для selection-режима)
  useEffect(() => {
    const handler = (e: Event) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.closest("textarea, input, button, [contenteditable='true']"))) return;

      const sel = window.getSelection();
      if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return;
      const range = sel.getRangeAt(0);
      if (!docRef.current || !docRef.current.contains(range.commonAncestorContainer)) {
        if (!draftKind) { setSelection(null); }
        return;
      }
      const text = sel.toString().trim();
      if (text.length < 3 || text.length > 1000) { if (!draftKind) setSelection(null); return; }
      const offsets = computeOffsets(docRef.current, range);
      if (!offsets) { if (!draftKind) setSelection(null); return; }
      const rect = range.getBoundingClientRect();
      setSelection({ text, rect, startOffset: offsets.start, endOffset: offsets.end });
    };
    document.addEventListener("mouseup", handler);
    document.addEventListener("touchend", handler);
    return () => {
      document.removeEventListener("mouseup", handler);
      document.removeEventListener("touchend", handler);
    };
  }, [draftKind]);

  /** Встраивает contentEditable span ровно в точку клика и фокусирует его. */
  const mountInlineEditor = useCallback((node: Node, nodeOffset: number, affinity: "before" | "after") => {
    if (!docRef.current) return null;
    if (node.nodeType !== Node.TEXT_NODE) return null;
    const t = node as Text;
    const safeOffset = Math.max(0, Math.min(nodeOffset, t.data.length));

    // Удаляем предыдущий, если был
    removeInlineDraft();

    // Делим text-node, чтобы вставить span ровно в позицию
    let insertBeforeNode: Node;
    if (safeOffset === 0) {
      insertBeforeNode = t;
    } else if (safeOffset >= t.data.length) {
      insertBeforeNode = t.nextSibling || (() => {
        // вставка в конец родителя
        return null as any;
      })();
    } else {
      const right = t.splitText(safeOffset);
      insertBeforeNode = right;
    }

    const editor = document.createElement("span");
    editor.setAttribute("data-draft-editor", "true");
    editor.contentEditable = "true";
    editor.style.cssText = [
      "background: hsl(160 84% 39% / 0.12)",
      "border-left: 2px solid hsl(160 84% 39%)",
      "border-right: 2px solid hsl(160 84% 39%)",
      "padding: 0 4px",
      "margin: 0 1px",
      "border-radius: 2px",
      "outline: none",
      "white-space: pre-wrap",
      "min-width: 8px",
      "display: inline",
      "color: hsl(160 84% 25%)",
      "font-weight: 500",
    ].join(";");
    // placeholder через ::after не сработает на CE — добавим небольшой "_" через empty content
    editor.setAttribute("data-placeholder", "Введите текст…");

    if (insertBeforeNode && insertBeforeNode.parentNode) {
      insertBeforeNode.parentNode.insertBefore(editor, insertBeforeNode);
    } else {
      // Вставка в конец родителя текущего node
      t.parentNode?.appendChild(editor);
    }
    draftEditorRef.current = editor;

    // Фокус и установка курсора внутрь
    setTimeout(() => {
      editor.focus();
      const sel = window.getSelection();
      if (sel) {
        const r = document.createRange();
        r.selectNodeContents(editor);
        r.collapse(true);
        sel.removeAllRanges();
        sel.addRange(r);
      }
    }, 0);

    return editor;
  }, [removeInlineDraft]);

  // Обработчик клика по документу для caret-режима (точная позиция вставки)
  const handleDocClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;

    // Клик внутри уже открытого draft-editor — игнорируем
    if (target.closest("[data-draft-editor='true']")) return;

    // Если кликнули на mark/ins — переход к комментарию, не caret
    const mark = target.closest("mark[data-comment-id], ins[data-comment-id]");
    if (mark) {
      const id = mark.getAttribute("data-comment-id");
      if (id) setActiveCommentId(id);
      return;
    }

    // Если есть выделение — это selection, не caret
    const sel = window.getSelection();
    if (sel && !sel.isCollapsed && sel.toString().trim().length >= 3) return;

    // Если уже открыта форма правки (для selection) — не перехватываем
    if (draftKind && draftKind !== "insert") return;

    if (!canComment || !docRef.current) return;

    // Получаем caret из точки клика
    const caretPos = getCaretFromPoint(e.clientX, e.clientY);
    if (!caretPos) return;

    let node = caretPos.node;
    let nodeOffset = caretPos.offset;

    if (node.nodeType !== Node.TEXT_NODE) {
      // Эвристика: ищем ближайший text-node внутри (для границ блоков)
      const el = node as HTMLElement;
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, null);
      const first = walker.nextNode() as Text | null;
      if (first) {
        node = first;
        nodeOffset = 0;
      } else {
        return;
      }
    }

    if (!docRef.current.contains(node)) return;

    // Считаем flat-offset (для fallback и highlight'ов)
    const range = document.createRange();
    try {
      range.setStart(node, Math.min(nodeOffset, (node as Text).data.length));
      range.collapse(true);
    } catch {
      return;
    }
    const offsets = computeOffsets(docRef.current, range);
    if (!offsets) return;

    // affinity: если клик ближе к концу текущего text-node, ставим "after"
    const t = node as Text;
    const affinity: "before" | "after" = nodeOffset >= t.data.length ? "after" : "before";

    // path до text-node (от docRef.current)
    const path = computePath(docRef.current, t);

    const anchor: DomAnchor = {
      path,
      offset: nodeOffset,
      affinity,
      flatOffset: offsets.start,
    };

    // Очищаем браузерный selection
    try { window.getSelection()?.removeAllRanges(); } catch {}

    // Сразу встраиваем inline-editor в точку клика
    const editor = mountInlineEditor(node, nodeOffset, affinity);
    if (!editor) return;

    const editorRect = editor.getBoundingClientRect();

    setSelection(null);
    setInsertDraft({ anchor, rect: editorRect });
    setDraftKind("insert");
    setDraftReplacement(""); // живой контент берём из editor.innerText при сохранении
  }, [canComment, draftKind, mountInlineEditor]);

  // Подсветка фрагментов с учётом типа правки
  useEffect(() => {
    if (!docRef.current) return;
    // Сохраняем draft-editor от очистки highlight'ов
    const editor = draftEditorRef.current;
    let editorParent: Node | null = null;
    let editorNext: Node | null = null;
    if (editor && editor.parentNode) {
      editorParent = editor.parentNode;
      editorNext = editor.nextSibling;
      editorParent.removeChild(editor);
    }

    clearHighlights(docRef.current);
    comments.forEach((c) => {
      const kind: SuggestionKind = c.position_anchor?.kind || "comment";
      const replacement: string | undefined = c.position_anchor?.replacement;
      const startOffset: number | undefined = c.position_anchor?.startOffset;
      const endOffset: number | undefined = c.position_anchor?.endOffset;
      const path: number[] | undefined = c.position_anchor?.path;
      const nodeOffset: number | undefined = c.position_anchor?.nodeOffset;

      // Insert-only: рендерим зелёную вставку в позиции
      if (kind === "insert" && replacement) {
        // Сначала пробуем DOM-anchor
        if (path && typeof nodeOffset === "number") {
          if (insertAtDomAnchor(docRef.current!, path, nodeOffset, c.id, replacement)) return;
        }
        // Fallback: flat-offset
        if (typeof startOffset === "number") {
          insertAtOffset(docRef.current!, startOffset, c.id, replacement);
        }
        return;
      }

      if (typeof startOffset === "number" && typeof endOffset === "number" && endOffset > startOffset) {
        const ok = highlightByOffsets(docRef.current!, startOffset, endOffset, c.id, c.resolved, kind, replacement);
        if (ok) return;
      }
      if (c.quoted_text) {
        highlightByText(docRef.current!, c.quoted_text, c.id, c.resolved, kind, replacement);
      }
    });

    // Возвращаем draft-editor обратно
    if (editor && editorParent) {
      try { editorParent.insertBefore(editor, editorNext); } catch {
        editorParent.appendChild(editor);
      }
    }
  }, [comments, documentHtml]);

  // Обработка клавиш в draft-editor
  useEffect(() => {
    const editor = draftEditorRef.current;
    if (!editor || draftKind !== "insert") return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        resetAll();
        return;
      }
      if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        // submit через эффект-обработчик → используем кастомное событие
        editor.dispatchEvent(new CustomEvent("draft-submit", { bubbles: true }));
        return;
      }
      // Обычный Enter — пусть браузер вставит <br>/перенос. Никаких блокировок.
    };
    editor.addEventListener("keydown", onKeyDown);
    return () => editor.removeEventListener("keydown", onKeyDown);
  }, [insertDraft, draftKind, resetAll]);

  /** Сохранение правки. */
  const handleSubmit = useCallback(async () => {
    if (!draftKind) return;

    // Insert: текст берём из inline-editor
    if (draftKind === "insert") {
      const editor = draftEditorRef.current;
      if (!editor || !insertDraft) return;
      // innerText сохраняет переносы строк (\n) — это то, что нужно
      const replacement = (editor.innerText || "").replace(/\u00A0/g, " ").trimEnd();
      if (!replacement.trim()) {
        toast.error("Введите текст");
        return;
      }
      setSubmitting(true);
      try {
        const positionAnchor: any = {
          kind: "insert",
          path: insertDraft.anchor.path,
          nodeOffset: insertDraft.anchor.offset,
          affinity: insertDraft.anchor.affinity,
          // Дублируем flat-offset для legacy-fallback
          startOffset: insertDraft.anchor.flatOffset,
          endOffset: insertDraft.anchor.flatOffset,
          replacement,
        };
        await onAddComment({
          quotedText: "",
          commentText: draftText.trim() || "Предложено добавить текст",
          positionAnchor,
        });
        resetAll();
        toast.success("Новый текст добавлен");
      } catch (e: any) {
        toast.error(e.message || "Не удалось сохранить правку");
      } finally {
        setSubmitting(false);
      }
      return;
    }

    // Selection-based правки (comment / delete / replace)
    if (draftKind === "comment" && !draftText.trim()) return;
    if (draftKind === "replace" && !draftReplacement.trim()) return;
    if (!selection) return;

    setSubmitting(true);
    try {
      const commentBody =
        draftKind === "delete" ? (draftText.trim() || "Предложено удалить фрагмент") :
        draftKind === "replace" ? (draftText.trim() || "Предложена замена фрагмента") :
        draftText.trim();

      const positionAnchor: any = {
        text: selection.text,
        startOffset: selection.startOffset,
        endOffset: selection.endOffset,
        kind: draftKind,
        ...(draftKind === "replace" ? { replacement: draftReplacement.trim() } : {}),
      };

      await onAddComment({
        quotedText: selection.text,
        commentText: commentBody,
        positionAnchor,
      });
      resetAll();
      toast.success(
        draftKind === "delete" ? "Правка «удалить» добавлена" :
        draftKind === "replace" ? "Правка «заменить» добавлена" :
        "Комментарий добавлен"
      );
    } catch (e: any) {
      toast.error(e.message || "Не удалось сохранить правку");
    } finally {
      setSubmitting(false);
    }
  }, [draftKind, draftText, draftReplacement, selection, insertDraft, onAddComment, resetAll]);

  // Кастомное событие draft-submit → submit
  useEffect(() => {
    const editor = draftEditorRef.current;
    if (!editor) return;
    const onSubmit = () => { handleSubmit(); };
    editor.addEventListener("draft-submit", onSubmit as EventListener);
    return () => editor.removeEventListener("draft-submit", onSubmit as EventListener);
  }, [insertDraft, handleSubmit]);

  const scrollToHighlight = (commentId: string) => {
    const el = docRef.current?.querySelector(`mark[data-comment-id="${commentId}"], ins[data-comment-id="${commentId}"]`) as HTMLElement | null;
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.classList.add("ring-2", "ring-primary");
      setTimeout(() => el.classList.remove("ring-2", "ring-primary"), 1500);
    }
    setActiveCommentId(commentId);
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-4 relative">
      {/* Документ */}
      <div className="relative">
        {canComment && !selection && !draftKind && (
          <div className="mb-2 text-xs text-muted-foreground bg-emerald-50 border border-emerald-200 rounded-md px-3 py-1.5 flex items-center gap-2">
            <Plus className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
            <span>Выделите фрагмент для правки или <b>кликните в нужное место</b> текста, чтобы добавить новый пункт прямо там. <span className="text-emerald-700">Enter</span> — новый абзац, <span className="text-emerald-700">Esc</span> — отмена, <span className="text-emerald-700">Ctrl+Enter</span> — сохранить.</span>
          </div>
        )}
        <div
          ref={docRef}
          className={
            "rounded-lg border bg-white p-6 max-h-[600px] overflow-auto prose prose-sm max-w-none cursor-text " +
            // Comment (жёлтый)
            "[&_mark[data-kind='comment']]:bg-amber-200/60 [&_mark[data-kind='comment']]:cursor-pointer " +
            "[&_mark[data-kind='comment'][data-resolved='true']]:bg-emerald-200/40 " +
            // Delete (красный + перечёркнутый)
            "[&_mark[data-kind='delete']]:bg-red-200/70 [&_mark[data-kind='delete']]:line-through [&_mark[data-kind='delete']]:text-red-800 [&_mark[data-kind='delete']]:cursor-pointer " +
            // Replace
            "[&_mark[data-kind='replace']]:bg-red-200/70 [&_mark[data-kind='replace']]:line-through [&_mark[data-kind='replace']]:text-red-800 [&_mark[data-kind='replace']]:cursor-pointer " +
            // Insert / Replace-вставка (зелёная)
            "[&_ins[data-comment-id]]:bg-emerald-200/70 [&_ins[data-comment-id]]:no-underline [&_ins[data-comment-id]]:text-emerald-800 [&_ins[data-comment-id]]:px-1 [&_ins[data-comment-id]]:rounded [&_ins[data-comment-id]]:mx-0.5 [&_ins[data-comment-id]]:cursor-pointer " +
            "[&_ins[data-kind='insert-only']]:font-medium [&_ins[data-kind='insert-only']]:whitespace-pre-wrap " +
            // Draft editor placeholder
            "[&_span[data-draft-editor='true']:empty]:before:content-[attr(data-placeholder)] [&_span[data-draft-editor='true']:empty]:before:text-emerald-700/50 [&_span[data-draft-editor='true']:empty]:before:italic"
          }
          dangerouslySetInnerHTML={{ __html: documentHtml }}
          onClick={handleDocClick}
        />

        {/* Floating toolbar при выделении */}
        {selection && canComment && !draftKind && (
          <div
            className="fixed z-50 bg-foreground text-background rounded-lg shadow-xl px-1 py-1 flex items-center gap-0.5"
            style={{
              top: Math.max(selection.rect.top - 44, 8),
              left: Math.max(Math.min(selection.rect.left + selection.rect.width / 2 - 130, window.innerWidth - 280), 8),
            }}
          >
            <Button size="sm" variant="ghost" className="h-7 text-xs gap-1.5 hover:bg-background/20"
              onClick={() => setDraftKind("comment")}>
              <MessageSquarePlus className="w-3.5 h-3.5" />Комментарий
            </Button>
            <div className="w-px h-4 bg-background/20" />
            <Button size="sm" variant="ghost" className="h-7 text-xs gap-1.5 hover:bg-background/20 text-red-200"
              onClick={() => setDraftKind("delete")}>
              <Scissors className="w-3.5 h-3.5" />Удалить
            </Button>
            <div className="w-px h-4 bg-background/20" />
            <Button size="sm" variant="ghost" className="h-7 text-xs gap-1.5 hover:bg-background/20 text-amber-200"
              onClick={() => setDraftKind("replace")}>
              <Replace className="w-3.5 h-3.5" />Заменить
            </Button>
          </div>
        )}

        {/* Inline insert: компактный toolbar над встроенным редактором */}
        {insertDraft && draftKind === "insert" && (
          <div
            className="fixed z-50 bg-foreground text-background rounded-lg shadow-xl px-1.5 py-1 flex items-center gap-1"
            style={{
              top: Math.max(insertDraft.rect.top - 38, 8),
              left: Math.max(Math.min(insertDraft.rect.left, window.innerWidth - 220), 8),
            }}
          >
            <span className="text-[10px] text-background/70 px-1.5">Печатайте прямо в тексте</span>
            <div className="w-px h-4 bg-background/20" />
            <Button
              size="sm"
              variant="ghost"
              className="h-7 text-xs gap-1.5 hover:bg-background/20 text-emerald-200"
              onClick={handleSubmit}
              disabled={submitting}
            >
              {submitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <><Check className="w-3.5 h-3.5" />Сохранить</>}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 text-xs hover:bg-background/20"
              onClick={resetAll}
              disabled={submitting}
            >
              <X className="w-3.5 h-3.5" />
            </Button>
          </div>
        )}

        {/* Форма правки для selection-based (comment/delete/replace) */}
        {draftKind && draftKind !== "insert" && selection && (
          <Card className="fixed z-50 p-3 w-[360px] shadow-xl"
            style={{
              top: Math.min(selection.rect.bottom + 8, window.innerHeight - 340),
              left: Math.max(Math.min(selection.rect.left, window.innerWidth - 380), 8),
            }}>
            <div className="text-xs font-semibold mb-1.5 flex items-center gap-1.5">
              {draftKind === "comment" && <><MessageSquare className="w-3.5 h-3.5" /> Комментарий к фрагменту</>}
              {draftKind === "delete" && <><Scissors className="w-3.5 h-3.5 text-red-600" /> Предложить удалить</>}
              {draftKind === "replace" && <><Replace className="w-3.5 h-3.5 text-amber-600" /> Предложить замену</>}
            </div>
            <blockquote className={
              "text-xs italic border-l-2 pl-2 mb-2 line-clamp-3 " +
              (draftKind === "delete" || draftKind === "replace"
                ? "border-red-400 line-through text-red-700"
                : "border-primary")
            }>
              «{selection.text}»
            </blockquote>

            {draftKind === "replace" && (
              <Textarea
                autoFocus
                placeholder="Заменить на…"
                value={draftReplacement}
                onChange={(e) => setDraftReplacement(e.target.value)}
                className="text-sm min-h-[60px] mb-2 border-emerald-300 focus-visible:ring-emerald-400 bg-emerald-50/30"
              />
            )}

            <Textarea
              autoFocus={draftKind !== "replace"}
              placeholder={
                draftKind === "delete" ? "Причина удаления (опционально)…" :
                draftKind === "replace" ? "Комментарий к замене (опционально)…" :
                "Ваш комментарий…"
              }
              value={draftText}
              onChange={(e) => setDraftText(e.target.value)}
              className="text-sm min-h-[60px] mb-2"
            />
            <div className="flex justify-end gap-1.5">
              <Button size="sm" variant="ghost" onClick={resetAll} disabled={submitting}>
                <X className="w-3.5 h-3.5" />
              </Button>
              <Button
                size="sm"
                onClick={handleSubmit}
                disabled={
                  submitting ||
                  (draftKind === "replace" && !draftReplacement.trim()) ||
                  (draftKind === "comment" && !draftText.trim())
                }
              >
                {submitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Добавить"}
              </Button>
            </div>
          </Card>
        )}
      </div>

      {/* Панель комментариев */}
      <aside className="border rounded-lg p-3 bg-muted/20 space-y-2 max-h-[600px] overflow-auto">
        <div className="flex items-center gap-1.5 text-sm font-semibold mb-2">
          <MessageCircle className="w-4 h-4" />
          Комментарии и правки {comments.length > 0 && <Badge variant="secondary" className="ml-1">{comments.length}</Badge>}
        </div>
        {comments.length === 0 ? (
          <div className="text-xs text-muted-foreground py-6 text-center">
            {canComment
              ? "Выделите фрагмент текста или кликните в нужное место, чтобы добавить правку."
              : "Комментариев пока нет."}
          </div>
        ) : (
          comments.map((c) => {
            const kind: SuggestionKind = c.position_anchor?.kind || "comment";
            const replacement: string | undefined = c.position_anchor?.replacement;
            return (
              <div
                key={c.id}
                className={`rounded-md border bg-background p-2.5 text-sm cursor-pointer transition-colors ${activeCommentId === c.id ? "border-primary ring-1 ring-primary/30" : ""}`}
                onClick={() => scrollToHighlight(c.id)}
              >
                <div className="flex items-center justify-between mb-1 gap-2">
                  <div className="text-xs font-medium truncate">{c.author_name}</div>
                  <div className="flex items-center gap-1 shrink-0">
                    {kind === "delete" && (
                      <Badge variant="outline" className="h-5 text-[10px] gap-1 border-red-300 text-red-700 bg-red-50">
                        <Scissors className="w-2.5 h-2.5" />Удалить
                      </Badge>
                    )}
                    {kind === "replace" && (
                      <Badge variant="outline" className="h-5 text-[10px] gap-1 border-amber-300 text-amber-700 bg-amber-50">
                        <Replace className="w-2.5 h-2.5" />Заменить
                      </Badge>
                    )}
                    {kind === "insert" && (
                      <Badge variant="outline" className="h-5 text-[10px] gap-1 border-emerald-300 text-emerald-700 bg-emerald-50">
                        <Plus className="w-2.5 h-2.5" />Добавить
                      </Badge>
                    )}
                    {kind === "comment" && (
                      <Badge variant="outline" className="h-5 text-[10px] gap-1 border-muted-foreground/30 text-muted-foreground">
                        <MessageSquare className="w-2.5 h-2.5" />Комм.
                      </Badge>
                    )}
                    {c.resolved && <CheckCheck className="w-3.5 h-3.5 text-emerald-600" />}
                  </div>
                </div>
                {c.quoted_text && (
                  <blockquote className={
                    "text-[11px] italic border-l-2 pl-1.5 mb-1 line-clamp-2 " +
                    (kind === "delete" || kind === "replace"
                      ? "border-red-400 line-through text-red-700/70"
                      : "border-amber-400 text-muted-foreground")
                  }>
                    «{c.quoted_text}»
                  </blockquote>
                )}
                {(kind === "replace" || kind === "insert") && replacement && (
                  <div className="text-[11px] border-l-2 border-emerald-400 pl-1.5 mb-1 text-emerald-700 bg-emerald-50/50 py-0.5 rounded-r whitespace-pre-wrap">
                    {kind === "insert" ? "+ " : "→ "}«{replacement}»
                  </div>
                )}
                {c.comment_text && c.comment_text !== "Предложено удалить фрагмент" && c.comment_text !== "Предложена замена фрагмента" && c.comment_text !== "Предложено добавить текст" && (
                  <div className="text-xs whitespace-pre-wrap">{c.comment_text}</div>
                )}
                <div className="text-[10px] text-muted-foreground mt-1">
                  {new Date(c.created_at).toLocaleString("ru-RU")}
                </div>
              </div>
            );
          })
        )}
      </aside>
    </div>
  );
}

// ============== Helpers ==============

/** Путь индексов childNodes от root до целевого text-node. */
function computePath(root: HTMLElement, target: Node): number[] {
  const path: number[] = [];
  let cur: Node | null = target;
  while (cur && cur !== root) {
    const parent: Node | null = cur.parentNode;
    if (!parent) break;
    const idx = Array.prototype.indexOf.call(parent.childNodes, cur);
    path.unshift(idx);
    cur = parent;
  }
  return path;
}

/** Восстанавливает text-node по path от root. */
function nodeByPath(root: HTMLElement, path: number[]): Node | null {
  let cur: Node = root;
  for (const idx of path) {
    if (!cur.childNodes || idx < 0 || idx >= cur.childNodes.length) return null;
    cur = cur.childNodes[idx];
  }
  return cur;
}

/** Считает плоские offset'ы (без учёта тегов) для Range внутри корня. */
function computeOffsets(root: HTMLElement, range: Range): { start: number; end: number } | null {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
  let pos = 0;
  let start = -1;
  let end = -1;
  let n: Node | null;
  while ((n = walker.nextNode())) {
    const t = n as Text;
    // Игнорируем text внутри уже вставленных <ins>/<mark>/draft-editor — они не часть оригинала
    if (t.parentElement?.closest("ins[data-comment-id], mark[data-comment-id], [data-draft-editor='true']")) continue;
    const len = t.data.length;
    if (start === -1 && t === range.startContainer) {
      start = pos + range.startOffset;
    }
    if (t === range.endContainer) {
      end = pos + range.endOffset;
      break;
    }
    pos += len;
  }
  if (start === -1 || end === -1 || end < start) return null;
  return { start, end };
}

/** Рендерит сохранённый insert-блок (с поддержкой переносов строк). */
function buildInsElement(commentId: string, text: string): HTMLElement {
  const ins = document.createElement("ins");
  ins.setAttribute("data-comment-id", commentId);
  ins.setAttribute("data-kind", "insert-only");
  // Сохраняем переносы как реальные \n + CSS white-space:pre-wrap (см. classes на root)
  ins.textContent = "+ " + text;
  return ins;
}

/** Вставка по DOM-anchor (path + nodeOffset). */
function insertAtDomAnchor(root: HTMLElement, path: number[], nodeOffset: number, commentId: string, text: string): boolean {
  const node = nodeByPath(root, path);
  if (!node) return false;
  const ins = buildInsElement(commentId, text);
  try {
    if (node.nodeType === Node.TEXT_NODE) {
      const t = node as Text;
      const safe = Math.max(0, Math.min(nodeOffset, t.data.length));
      if (safe === 0) {
        t.parentNode?.insertBefore(ins, t);
      } else if (safe >= t.data.length) {
        if (t.nextSibling) t.parentNode?.insertBefore(ins, t.nextSibling);
        else t.parentNode?.appendChild(ins);
      } else {
        const right = t.splitText(safe);
        right.parentNode?.insertBefore(ins, right);
      }
      return true;
    } else {
      // Не text-node — append в конец
      node.appendChild(ins);
      return true;
    }
  } catch (e) {
    console.warn("[insertAtDomAnchor] failed", e);
    return false;
  }
}

/** Fallback: вставка по плоскому offset. */
function insertAtOffset(root: HTMLElement, offset: number, commentId: string, text: string): boolean {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
  let pos = 0;
  let n: Node | null;
  while ((n = walker.nextNode())) {
    const t = n as Text;
    if (t.parentElement?.closest("ins[data-comment-id], [data-draft-editor='true']")) continue;
    const len = t.data.length;
    if (pos + len >= offset) {
      const local = Math.max(0, Math.min(offset - pos, len));
      try {
        const ins = buildInsElement(commentId, text);
        if (local === 0) {
          t.parentNode?.insertBefore(ins, t);
        } else if (local >= len) {
          if (t.nextSibling) t.parentNode?.insertBefore(ins, t.nextSibling);
          else t.parentNode?.appendChild(ins);
        } else {
          const right = t.splitText(local);
          right.parentNode?.insertBefore(ins, right);
        }
        return true;
      } catch (e) {
        console.warn("[insertAtOffset] failed", e);
        return false;
      }
    }
    pos += len;
  }
  const ins = buildInsElement(commentId, text);
  root.appendChild(ins);
  return true;
}

/** Удаляет все mark/ins подсветки. */
function clearHighlights(root: HTMLElement) {
  root.querySelectorAll("ins[data-comment-id]").forEach((el) => el.parentNode?.removeChild(el));
  root.querySelectorAll("mark[data-comment-id]").forEach((el) => {
    const parent = el.parentNode;
    if (!parent) return;
    while (el.firstChild) parent.insertBefore(el.firstChild, el);
    parent.removeChild(el);
  });
  root.normalize();
}

/** Подсветка по плоским offset'ам. */
function highlightByOffsets(
  root: HTMLElement,
  startOffset: number,
  endOffset: number,
  commentId: string,
  resolved: boolean,
  kind: SuggestionKind,
  replacement?: string
): boolean {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
  let pos = 0;
  let startNode: Text | null = null;
  let startNodeOffset = 0;
  let endNode: Text | null = null;
  let endNodeOffset = 0;
  let n: Node | null;

  while ((n = walker.nextNode())) {
    const t = n as Text;
    if (t.parentElement?.closest("ins[data-comment-id], [data-draft-editor='true']")) continue;
    const len = t.data.length;
    if (!startNode && pos + len >= startOffset) {
      startNode = t;
      startNodeOffset = startOffset - pos;
    }
    if (!endNode && pos + len >= endOffset) {
      endNode = t;
      endNodeOffset = endOffset - pos;
      break;
    }
    pos += len;
  }
  if (!startNode || !endNode) return false;

  try {
    const range = document.createRange();
    range.setStart(startNode, Math.max(0, Math.min(startNodeOffset, startNode.data.length)));
    range.setEnd(endNode, Math.max(0, Math.min(endNodeOffset, endNode.data.length)));
    return wrapRange(range, commentId, resolved, kind, replacement);
  } catch (e) {
    console.warn("[highlightByOffsets] failed", e);
    return false;
  }
}

function wrapRange(
  range: Range,
  commentId: string,
  resolved: boolean,
  kind: SuggestionKind,
  replacement?: string
): boolean {
  const root = range.commonAncestorContainer;
  const rootEl: Node = root.nodeType === Node.TEXT_NODE ? root.parentNode! : root;
  const walker = document.createTreeWalker(rootEl, NodeFilter.SHOW_TEXT, null);
  const textNodes: Text[] = [];
  let n: Node | null;
  while ((n = walker.nextNode())) {
    const t = n as Text;
    if (range.intersectsNode(t)) textNodes.push(t);
  }
  if (textNodes.length === 0) return false;

  let lastMark: HTMLElement | null = null;

  for (const node of textNodes) {
    if (node.parentElement?.closest("mark[data-comment-id]")) continue;
    const isStart = node === range.startContainer;
    const isEnd = node === range.endContainer;
    const from = isStart ? range.startOffset : 0;
    const to = isEnd ? range.endOffset : node.data.length;
    if (to <= from) continue;

    let target = node;
    if (from > 0) {
      target = target.splitText(from);
    }
    if (to - from < target.data.length) {
      target.splitText(to - from);
    }
    const mark = document.createElement("mark");
    mark.setAttribute("data-comment-id", commentId);
    mark.setAttribute("data-kind", kind);
    mark.setAttribute("data-resolved", String(resolved));
    target.parentNode?.insertBefore(mark, target);
    mark.appendChild(target);
    lastMark = mark;
  }

  if (kind === "replace" && replacement && lastMark) {
    const ins = document.createElement("ins");
    ins.setAttribute("data-comment-id", commentId);
    ins.setAttribute("data-kind", "insert");
    ins.textContent = replacement;
    lastMark.parentNode?.insertBefore(ins, lastMark.nextSibling);
  }

  return lastMark !== null;
}

function highlightByText(
  root: HTMLElement,
  text: string,
  commentId: string,
  resolved: boolean,
  kind: SuggestionKind,
  replacement?: string
) {
  if (!text || text.length < 3) return;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
  const nodes: Text[] = [];
  let n: Node | null;
  while ((n = walker.nextNode())) nodes.push(n as Text);
  for (const node of nodes) {
    if (node.parentElement?.closest("mark[data-comment-id], ins[data-comment-id]")) continue;
    const idx = node.textContent?.indexOf(text) ?? -1;
    if (idx === -1) continue;
    try {
      const range = document.createRange();
      range.setStart(node, idx);
      range.setEnd(node, idx + text.length);
      wrapRange(range, commentId, resolved, kind, replacement);
    } catch {}
    return;
  }
}
