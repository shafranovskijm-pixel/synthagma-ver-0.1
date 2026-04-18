import { useEffect, useRef, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MessageSquarePlus, X, Loader2, MessageCircle, CheckCheck, Scissors, Replace, MessageSquare, Plus } from "lucide-react";
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

/**
 * Документ с возможностью выделять текст и оставлять комментарии/правки (как Google Docs).
 * Использует offset-якоря в плоском тексте, чтобы корректно подсвечивать фрагменты,
 * даже если они разбиты тегами (DOCX → HTML через mammoth).
 */
export function ReviewableDocument({ documentHtml, comments, authorName, canComment = true, onAddComment }: Props) {
  const docRef = useRef<HTMLDivElement>(null);
  const [selection, setSelection] = useState<SelectionState | null>(null);
  const [draftKind, setDraftKind] = useState<SuggestionKind | null>(null);
  const [draftText, setDraftText] = useState("");
  const [draftReplacement, setDraftReplacement] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [activeCommentId, setActiveCommentId] = useState<string | null>(null);

  const resetAll = useCallback(() => {
    setDraftKind(null);
    setDraftText("");
    setDraftReplacement("");
    setSelection(null);
    try { window.getSelection()?.removeAllRanges(); } catch {}
  }, []);

  // Слушаем выделение
  useEffect(() => {
    const handler = (e: Event) => {
      // Если идёт ввод в форме — не сбрасываем
      const target = e.target as HTMLElement | null;
      if (target && (target.closest("textarea, input, button"))) return;

      const sel = window.getSelection();
      if (!sel || sel.rangeCount === 0 || sel.isCollapsed) {
        // Не сбрасываем форму, если она открыта (пользователь печатает)
        if (!draftKind) setSelection(null);
        return;
      }
      const range = sel.getRangeAt(0);
      const text = sel.toString().trim();
      if (text.length < 3 || text.length > 1000) { if (!draftKind) setSelection(null); return; }
      if (!docRef.current || !docRef.current.contains(range.commonAncestorContainer)) {
        if (!draftKind) setSelection(null);
        return;
      }
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

  // Подсветка фрагментов с учётом типа правки
  useEffect(() => {
    if (!docRef.current) return;
    // Очищаем предыдущие подсветки
    clearHighlights(docRef.current);
    // Применяем подсветки
    comments.forEach((c) => {
      const kind: SuggestionKind = c.position_anchor?.kind || "comment";
      const replacement: string | undefined = c.position_anchor?.replacement;
      const startOffset: number | undefined = c.position_anchor?.startOffset;
      const endOffset: number | undefined = c.position_anchor?.endOffset;

      if (typeof startOffset === "number" && typeof endOffset === "number" && endOffset > startOffset) {
        const ok = highlightByOffsets(docRef.current!, startOffset, endOffset, c.id, c.resolved, kind, replacement);
        if (ok) return;
      }
      // Fallback: старый поиск по тексту (для legacy-комментариев)
      if (c.quoted_text) {
        highlightByText(docRef.current!, c.quoted_text, c.id, c.resolved, kind, replacement);
      }
    });
  }, [comments, documentHtml]);

  const handleSubmit = async () => {
    if (!selection || !draftKind) return;
    if (draftKind === "comment" && !draftText.trim()) return;
    if (draftKind === "replace" && !draftReplacement.trim()) return;

    setSubmitting(true);
    try {
      const commentBody =
        draftKind === "delete" ? (draftText.trim() || "Предложено удалить фрагмент") :
        draftKind === "replace" ? (draftText.trim() || "Предложена замена фрагмента") :
        draftText.trim();

      await onAddComment({
        quotedText: selection.text,
        commentText: commentBody,
        positionAnchor: {
          text: selection.text,
          startOffset: selection.startOffset,
          endOffset: selection.endOffset,
          kind: draftKind,
          ...(draftKind === "replace" ? { replacement: draftReplacement.trim() } : {}),
        },
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
  };

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
        <div
          ref={docRef}
          className={
            "rounded-lg border bg-white p-6 max-h-[600px] overflow-auto prose prose-sm max-w-none " +
            // Comment (жёлтый)
            "[&_mark[data-kind='comment']]:bg-amber-200/60 [&_mark[data-kind='comment']]:cursor-pointer " +
            "[&_mark[data-kind='comment'][data-resolved='true']]:bg-emerald-200/40 " +
            // Delete (красный + перечёркнутый)
            "[&_mark[data-kind='delete']]:bg-red-200/70 [&_mark[data-kind='delete']]:line-through [&_mark[data-kind='delete']]:text-red-800 [&_mark[data-kind='delete']]:cursor-pointer " +
            // Replace (красный перечёркнутый источник)
            "[&_mark[data-kind='replace']]:bg-red-200/70 [&_mark[data-kind='replace']]:line-through [&_mark[data-kind='replace']]:text-red-800 [&_mark[data-kind='replace']]:cursor-pointer " +
            // Insert (зелёная вставка)
            "[&_ins[data-comment-id]]:bg-emerald-200/70 [&_ins[data-comment-id]]:no-underline [&_ins[data-comment-id]]:text-emerald-800 [&_ins[data-comment-id]]:px-1 [&_ins[data-comment-id]]:rounded [&_ins[data-comment-id]]:mx-0.5"
          }
          dangerouslySetInnerHTML={{ __html: documentHtml }}
          onClick={(e) => {
            const target = e.target as HTMLElement;
            const mark = target.closest("mark[data-comment-id], ins[data-comment-id]");
            if (mark) {
              const id = mark.getAttribute("data-comment-id");
              if (id) setActiveCommentId(id);
            }
          }}
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
            <Button size="sm" variant="ghost" className="h-7 text-xs gap-1.5 hover:bg-background/20 text-emerald-200"
              onClick={() => setDraftKind("replace")}>
              <Replace className="w-3.5 h-3.5" />Заменить
            </Button>
          </div>
        )}

        {/* Форма правки */}
        {draftKind && selection && (
          <Card className="fixed z-50 p-3 w-[360px] shadow-xl"
            style={{
              top: Math.min(selection.rect.bottom + 8, window.innerHeight - 320),
              left: Math.max(Math.min(selection.rect.left, window.innerWidth - 380), 8),
            }}>
            <div className="text-xs font-semibold mb-1.5 flex items-center gap-1.5">
              {draftKind === "comment" && <><MessageSquare className="w-3.5 h-3.5" /> Комментарий к фрагменту</>}
              {draftKind === "delete" && <><Scissors className="w-3.5 h-3.5 text-red-600" /> Предложить удалить</>}
              {draftKind === "replace" && <><Replace className="w-3.5 h-3.5 text-emerald-600" /> Предложить замену</>}
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
                disabled={submitting || (draftKind === "replace" && !draftReplacement.trim()) || (draftKind === "comment" && !draftText.trim())}
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
              ? "Выделите фрагмент текста, чтобы оставить комментарий, предложить удаление или замену."
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
                {kind === "replace" && replacement && (
                  <div className="text-[11px] border-l-2 border-emerald-400 pl-1.5 mb-1 text-emerald-700 bg-emerald-50/50 py-0.5 rounded-r">
                    → «{replacement}»
                  </div>
                )}
                {c.comment_text && c.comment_text !== "Предложено удалить фрагмент" && c.comment_text !== "Предложена замена фрагмента" && (
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

/** Считает плоские offset'ы (без учёта тегов) для Range внутри корня. */
function computeOffsets(root: HTMLElement, range: Range): { start: number; end: number } | null {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
  let pos = 0;
  let start = -1;
  let end = -1;
  let n: Node | null;
  while ((n = walker.nextNode())) {
    const t = n as Text;
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
  if (start === -1 || end === -1 || end <= start) return null;
  return { start, end };
}

/** Удаляет все mark/ins подсветки, возвращая исходный текст. */
function clearHighlights(root: HTMLElement) {
  // Сначала удаляем вставленные <ins> (они не были частью оригинала)
  root.querySelectorAll("ins[data-comment-id]").forEach((el) => el.parentNode?.removeChild(el));
  // Затем разворачиваем mark
  root.querySelectorAll("mark[data-comment-id]").forEach((el) => {
    const parent = el.parentNode;
    if (!parent) return;
    while (el.firstChild) parent.insertBefore(el.firstChild, el);
    parent.removeChild(el);
  });
  // Объединяем соседние текстовые ноды
  root.normalize();
}

/** Подсветка по плоским offset'ам — поддерживает выделение, разбитое тегами. */
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

/** Оборачивает Range в <mark> (поддерживая многонодовые выделения). */
function wrapRange(
  range: Range,
  commentId: string,
  resolved: boolean,
  kind: SuggestionKind,
  replacement?: string
): boolean {
  // Собираем все text-ноды, попадающие в range
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
    // Пропускаем уже подсвеченные
    if (node.parentElement?.closest("mark[data-comment-id]")) continue;
    const isStart = node === range.startContainer;
    const isEnd = node === range.endContainer;
    const from = isStart ? range.startOffset : 0;
    const to = isEnd ? range.endOffset : node.data.length;
    if (to <= from) continue;

    // Делим ноду на части
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

  // Для replace — добавляем <ins> с заменой после последнего mark
  if (kind === "replace" && replacement && lastMark) {
    const ins = document.createElement("ins");
    ins.setAttribute("data-comment-id", commentId);
    ins.setAttribute("data-kind", "insert");
    ins.textContent = replacement;
    lastMark.parentNode?.insertBefore(ins, lastMark.nextSibling);
  }

  return lastMark !== null;
}

/** Fallback: подсветка по тексту (для legacy-комментариев без offsets). */
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
