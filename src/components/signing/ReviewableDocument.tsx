import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MessageSquarePlus, X, Loader2, MessageCircle, CheckCheck } from "lucide-react";
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

interface Props {
  documentHtml: string;
  comments: ReviewComment[];
  authorName: string;
  canComment?: boolean;
  onAddComment: (params: { quotedText: string; commentText: string; positionAnchor: any }) => Promise<void>;
}

/**
 * Документ с возможностью выделять текст и оставлять комментарии (как Google Docs).
 * Подсвечивает уже прокомментированные фрагменты.
 */
export function ReviewableDocument({ documentHtml, comments, authorName, canComment = true, onAddComment }: Props) {
  const docRef = useRef<HTMLDivElement>(null);
  const [selection, setSelection] = useState<{ text: string; rect: DOMRect } | null>(null);
  const [draftOpen, setDraftOpen] = useState(false);
  const [draftText, setDraftText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [activeCommentId, setActiveCommentId] = useState<string | null>(null);

  useEffect(() => {
    const handler = () => {
      const sel = window.getSelection();
      if (!sel || sel.rangeCount === 0 || sel.isCollapsed) {
        setSelection(null);
        return;
      }
      const range = sel.getRangeAt(0);
      const text = sel.toString().trim();
      if (text.length < 3 || text.length > 500) { setSelection(null); return; }
      // Только если выделение внутри документа
      if (!docRef.current?.contains(range.commonAncestorContainer)) {
        setSelection(null);
        return;
      }
      const rect = range.getBoundingClientRect();
      setSelection({ text, rect });
    };
    document.addEventListener("mouseup", handler);
    document.addEventListener("touchend", handler);
    return () => {
      document.removeEventListener("mouseup", handler);
      document.removeEventListener("touchend", handler);
    };
  }, []);

  // Подсветка уже прокомментированных фрагментов
  useEffect(() => {
    if (!docRef.current) return;
    // Очищаем предыдущие подсветки
    docRef.current.querySelectorAll("mark[data-comment-id]").forEach((el) => {
      const parent = el.parentNode;
      if (parent) {
        while (el.firstChild) parent.insertBefore(el.firstChild, el);
        parent.removeChild(el);
      }
    });
    // Применяем подсветки
    comments.forEach((c) => {
      if (!c.quoted_text) return;
      highlightTextInElement(docRef.current!, c.quoted_text, c.id, c.resolved);
    });
  }, [comments, documentHtml]);

  const handleSubmit = async () => {
    if (!selection || !draftText.trim()) return;
    setSubmitting(true);
    try {
      await onAddComment({
        quotedText: selection.text,
        commentText: draftText.trim(),
        positionAnchor: { text: selection.text },
      });
      setDraftOpen(false);
      setDraftText("");
      setSelection(null);
      window.getSelection()?.removeAllRanges();
      toast.success("Комментарий добавлен");
    } catch (e: any) {
      toast.error(e.message || "Не удалось добавить комментарий");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4 relative">
      {/* Документ */}
      <div className="relative">
        <div
          ref={docRef}
          className="rounded-lg border bg-white p-6 max-h-[600px] overflow-auto prose prose-sm max-w-none [&_mark[data-comment-id]]:bg-amber-200/60 [&_mark[data-comment-id]]:cursor-pointer [&_mark[data-comment-id][data-resolved='true']]:bg-emerald-200/40"
          dangerouslySetInnerHTML={{ __html: documentHtml }}
          onClick={(e) => {
            const target = e.target as HTMLElement;
            const mark = target.closest("mark[data-comment-id]");
            if (mark) {
              const id = mark.getAttribute("data-comment-id");
              setActiveCommentId(id);
            }
          }}
        />

        {/* Floating toolbar при выделении */}
        {selection && canComment && !draftOpen && (
          <div
            className="fixed z-50 bg-foreground text-background rounded-lg shadow-xl px-1 py-1 flex items-center gap-1"
            style={{
              top: Math.max(selection.rect.top - 44, 8),
              left: Math.max(Math.min(selection.rect.left + selection.rect.width / 2 - 80, window.innerWidth - 180), 8),
            }}
          >
            <Button size="sm" variant="ghost" className="h-7 text-xs gap-1.5 hover:bg-background/20"
              onClick={() => setDraftOpen(true)}>
              <MessageSquarePlus className="w-3.5 h-3.5" />Комментировать
            </Button>
          </div>
        )}

        {/* Форма комментария */}
        {draftOpen && selection && (
          <Card className="fixed z-50 p-3 w-[320px] shadow-xl"
            style={{
              top: Math.min(selection.rect.bottom + 8, window.innerHeight - 200),
              left: Math.max(Math.min(selection.rect.left, window.innerWidth - 340), 8),
            }}>
            <div className="text-xs text-muted-foreground mb-1.5">К фрагменту:</div>
            <blockquote className="text-xs italic border-l-2 border-primary pl-2 mb-2 line-clamp-3">
              «{selection.text}»
            </blockquote>
            <Textarea
              autoFocus
              placeholder="Ваш комментарий или правка…"
              value={draftText}
              onChange={(e) => setDraftText(e.target.value)}
              className="text-sm min-h-[80px] mb-2"
            />
            <div className="flex justify-end gap-1.5">
              <Button size="sm" variant="ghost" onClick={() => { setDraftOpen(false); setDraftText(""); }} disabled={submitting}>
                <X className="w-3.5 h-3.5" />
              </Button>
              <Button size="sm" onClick={handleSubmit} disabled={!draftText.trim() || submitting}>
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
          Комментарии {comments.length > 0 && <Badge variant="secondary" className="ml-1">{comments.length}</Badge>}
        </div>
        {comments.length === 0 ? (
          <div className="text-xs text-muted-foreground py-6 text-center">
            {canComment
              ? "Выделите фрагмент текста, чтобы оставить комментарий или предложить правку."
              : "Комментариев пока нет."}
          </div>
        ) : (
          comments.map((c) => (
            <div
              key={c.id}
              className={`rounded-md border bg-background p-2.5 text-sm cursor-pointer transition-colors ${activeCommentId === c.id ? "border-primary ring-1 ring-primary/30" : ""}`}
              onClick={() => setActiveCommentId(c.id)}
            >
              <div className="flex items-center justify-between mb-1">
                <div className="text-xs font-medium">{c.author_name}</div>
                {c.resolved && <CheckCheck className="w-3.5 h-3.5 text-emerald-600" />}
              </div>
              {c.quoted_text && (
                <blockquote className="text-[11px] italic border-l-2 border-amber-400 pl-1.5 mb-1 text-muted-foreground line-clamp-2">
                  «{c.quoted_text}»
                </blockquote>
              )}
              <div className="text-xs whitespace-pre-wrap">{c.comment_text}</div>
              <div className="text-[10px] text-muted-foreground mt-1">
                {new Date(c.created_at).toLocaleString("ru-RU")}
              </div>
            </div>
          ))
        )}
      </aside>
    </div>
  );
}

/** Подсветка текстового фрагмента внутри HTML-элемента (без затрагивания тегов) */
function highlightTextInElement(root: HTMLElement, text: string, commentId: string, resolved: boolean) {
  if (!text || text.length < 3) return;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
  const nodes: Text[] = [];
  let n: Node | null;
  while ((n = walker.nextNode())) nodes.push(n as Text);
  for (const node of nodes) {
    const idx = node.textContent?.indexOf(text) ?? -1;
    if (idx === -1) continue;
    const range = document.createRange();
    range.setStart(node, idx);
    range.setEnd(node, idx + text.length);
    const mark = document.createElement("mark");
    mark.setAttribute("data-comment-id", commentId);
    mark.setAttribute("data-resolved", String(resolved));
    try {
      range.surroundContents(mark);
    } catch {
      // если range пересекает теги — пропускаем
    }
    return; // подсвечиваем только первое вхождение
  }
}
