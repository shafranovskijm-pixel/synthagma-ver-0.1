import { useEffect, useMemo, useState, useRef } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, ChevronUp, ChevronDown, X } from "lucide-react";
import type { ContentBlock } from "@/components/course-builder/BlockEditor";

interface Props {
  open: boolean;
  onClose: () => void;
  blocks: ContentBlock[];
}

/** Strip HTML tags for plain-text matching. */
function plain(html: string | undefined): string {
  if (!html) return "";
  return html.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
}

function blockText(b: ContentBlock): string {
  const parts = [
    b.content,
    b.calloutTitle,
    b.accordionTitle,
    b.quizQuestion,
    b.quizExplanation,
    b.imageAlt,
    b.documentName,
    b.buttonLabel,
    ...(b.quizOptions?.map((o) => o.text) || []),
    ...(b.sliderSlides?.flatMap((s) => [s.title, s.content]) || []),
    ...(b.tableRows?.flat() || []),
  ].filter(Boolean) as string[];
  return parts.map(plain).join(" \n ").toLowerCase();
}

export function LessonSearchPanel({ open, onClose, blocks }: Props) {
  const [query, setQuery] = useState("");
  const [activeIdx, setActiveIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [] as { id: string; preview: string }[];
    return blocks
      .map((b) => {
        const text = blockText(b);
        if (!text.includes(q)) return null;
        const i = text.indexOf(q);
        const start = Math.max(0, i - 25);
        const end = Math.min(text.length, i + q.length + 25);
        return { id: b.id, preview: (start > 0 ? "…" : "") + text.slice(start, end) + (end < text.length ? "…" : "") };
      })
      .filter(Boolean) as { id: string; preview: string }[];
  }, [query, blocks]);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 50);
  }, [open]);

  useEffect(() => {
    setActiveIdx(0);
  }, [query]);

  // Highlight + scroll to active match
  useEffect(() => {
    // Clear previous highlights
    document.querySelectorAll('[data-block-id].lesson-search-hit').forEach((el) =>
      el.classList.remove('lesson-search-hit', 'lesson-search-active')
    );
    if (matches.length === 0) return;
    matches.forEach((m, idx) => {
      const el = document.querySelector(`[data-block-id="${m.id}"]`);
      if (el) {
        el.classList.add('lesson-search-hit');
        if (idx === activeIdx) {
          el.classList.add('lesson-search-active');
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }
    });
    return () => {
      document.querySelectorAll('[data-block-id].lesson-search-hit').forEach((el) =>
        el.classList.remove('lesson-search-hit', 'lesson-search-active')
      );
    };
  }, [matches, activeIdx]);

  if (!open) return null;

  const next = () => setActiveIdx((i) => (matches.length ? (i + 1) % matches.length : 0));
  const prev = () => setActiveIdx((i) => (matches.length ? (i - 1 + matches.length) % matches.length : 0));

  return (
    <div className="fixed top-20 right-6 z-50 w-[360px] rounded-xl border border-border bg-background/95 backdrop-blur shadow-2xl p-3 animate-in fade-in slide-in-from-top-2">
      <div className="flex items-center gap-2">
        <Search className="w-4 h-4 text-muted-foreground shrink-0" />
        <Input
          ref={inputRef}
          value={query}
          onChange={(ev) => setQuery(ev.target.value)}
          placeholder="Поиск по уроку…"
          className="h-8 text-sm"
          onKeyDown={(ev) => {
            if (ev.key === 'Enter') { ev.preventDefault(); ev.shiftKey ? prev() : next(); }
            if (ev.key === 'Escape') { ev.preventDefault(); onClose(); }
          }}
        />
        <span className="text-xs text-muted-foreground tabular-nums whitespace-nowrap">
          {matches.length ? `${activeIdx + 1}/${matches.length}` : '0/0'}
        </span>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={prev} disabled={!matches.length}>
          <ChevronUp className="w-4 h-4" />
        </Button>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={next} disabled={!matches.length}>
          <ChevronDown className="w-4 h-4" />
        </Button>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose}>
          <X className="w-4 h-4" />
        </Button>
      </div>
      {query && matches.length === 0 && (
        <p className="mt-2 text-xs text-muted-foreground">Ничего не найдено</p>
      )}
    </div>
  );
}
