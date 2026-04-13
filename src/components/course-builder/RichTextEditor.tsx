import { useRef, useEffect, useState, useCallback } from "react";
import { Bold, Italic, Underline, Strikethrough, Link2 } from "lucide-react";
import { cn } from "@/lib/utils";
import DOMPurify from "dompurify";

interface RichTextEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  minHeight?: string;
}

const ALLOWED_TAGS = ['strong', 'b', 'em', 'i', 'u', 's', 'br', 'p', 'span', 'div', 'a'];
const ALLOWED_ATTR = ['style', 'href', 'target', 'rel'];

function sanitize(html: string): string {
  return DOMPurify.sanitize(html, { ALLOWED_TAGS, ALLOWED_ATTR, ALLOW_DATA_ATTR: false });
}

export function RichTextEditor({ value, onChange, placeholder, className, minHeight = "60px" }: RichTextEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const [showToolbar, setShowToolbar] = useState(false);
  const [toolbarPos, setToolbarPos] = useState({ top: 0, left: 0 });
  const isInternalChange = useRef(false);
  const lastEmittedHtml = useRef(value || "");

  // Set initial content on mount
  useEffect(() => {
    const el = editorRef.current;
    if (el) {
      el.innerHTML = value || "";
      lastEmittedHtml.current = value || "";
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync only truly external value changes (not our own emissions)
  useEffect(() => {
    if (isInternalChange.current) {
      isInternalChange.current = false;
      return;
    }
    const el = editorRef.current;
    if (el && value !== lastEmittedHtml.current) {
      el.innerHTML = value || "";
      lastEmittedHtml.current = value || "";
    }
  }, [value]);

  const handleInput = useCallback(() => {
    const el = editorRef.current;
    if (!el) return;
    isInternalChange.current = true;
    const raw = el.innerHTML;
    lastEmittedHtml.current = raw;
    onChange(raw);
  }, [onChange]);

  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    e.preventDefault();
    const text = e.clipboardData.getData('text/plain');
    document.execCommand('insertText', false, text);
    handleInput();
  }, [handleInput]);

  const handleBlur = useCallback(() => {
    setTimeout(() => setShowToolbar(false), 200);
    // Sanitize on blur to avoid cursor issues during typing
    const el = editorRef.current;
    if (!el) return;
    const cleaned = sanitize(el.innerHTML);
    if (cleaned !== el.innerHTML) {
      el.innerHTML = cleaned;
    }
    lastEmittedHtml.current = cleaned;
    isInternalChange.current = true;
    onChange(cleaned);
  }, [onChange]);

  const handleSelectionChange = useCallback(() => {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !sel.rangeCount) {
      setShowToolbar(false);
      return;
    }
    const range = sel.getRangeAt(0);
    const editor = editorRef.current;
    if (!editor || !editor.contains(range.commonAncestorContainer)) {
      setShowToolbar(false);
      return;
    }
    const rect = range.getBoundingClientRect();
    const editorRect = editor.getBoundingClientRect();
    setToolbarPos({
      top: rect.top - editorRect.top - 40,
      left: rect.left - editorRect.left + rect.width / 2,
    });
    setShowToolbar(true);
  }, []);

  useEffect(() => {
    document.addEventListener("selectionchange", handleSelectionChange);
    return () => document.removeEventListener("selectionchange", handleSelectionChange);
  }, [handleSelectionChange]);

  const execFormat = (command: string) => {
    document.execCommand(command, false);
    handleInput();
    editorRef.current?.focus();
  };

  const getParentAnchor = (): HTMLAnchorElement | null => {
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount) return null;
    let node: Node | null = sel.anchorNode;
    while (node && node !== editorRef.current) {
      if (node.nodeType === 1 && (node as Element).tagName === 'A') {
        return node as HTMLAnchorElement;
      }
      node = node.parentNode;
    }
    return null;
  };

  const handleLink = () => {
    const existingLink = getParentAnchor();
    if (existingLink) {
      document.execCommand('unlink', false);
      handleInput();
      editorRef.current?.focus();
      return;
    }
    // Link creation is handled by BlockEditor's popover — do nothing here
  };

  const toolbarButtons = [
    { command: "bold", icon: Bold, title: "Жирный (Ctrl+B)" },
    { command: "italic", icon: Italic, title: "Курсив (Ctrl+I)" },
    { command: "underline", icon: Underline, title: "Подчёркнутый (Ctrl+U)" },
    { command: "strikethrough", icon: Strikethrough, title: "Зачёркнутый" },
  ];

  return (
    <div className="relative">
      {/* Floating inline toolbar */}
      {showToolbar && (
        <div
          className="absolute z-50 flex items-center gap-0.5 bg-foreground/90 backdrop-blur-sm text-background rounded-lg px-1 py-0.5 shadow-lg pointer-events-auto"
          style={{ top: toolbarPos.top, left: toolbarPos.left, transform: "translateX(-50%)" }}
          onMouseDown={(e) => e.preventDefault()}
        >
          {toolbarButtons.map(({ command, icon: Icon, title }) => (
            <button
              key={command}
              onMouseDown={(e) => { e.preventDefault(); execFormat(command); }}
              className="h-7 w-7 flex items-center justify-center hover:bg-white/20 rounded transition-colors"
              title={title}
            >
              <Icon className="w-3.5 h-3.5" />
            </button>
          ))}
          <button
            onMouseDown={(e) => { e.preventDefault(); handleLink(); }}
            className="h-7 w-7 flex items-center justify-center hover:bg-white/20 rounded transition-colors"
            title="Ссылка"
          >
            <Link2 className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Editable area */}
      <div
        ref={editorRef}
        contentEditable
        suppressContentEditableWarning
        onInput={handleInput}
        onPaste={handlePaste}
        onBlur={handleBlur}
        data-placeholder={placeholder}
        className={cn(
          "outline-none prose prose-sm dark:prose-invert max-w-none [&]:!font-[inherit] [&]:!tracking-[inherit]",
          "[&_a]:text-primary [&_a]:underline [&_a]:cursor-pointer",
          "empty:before:content-[attr(data-placeholder)] empty:before:text-muted-foreground empty:before:pointer-events-none",
          className
        )}
        style={{ minHeight, fontStyle: className?.includes('italic') ? 'italic' : undefined, fontWeight: className?.includes('font-bold') ? 'bold' : undefined, textDecoration: [className?.includes('underline') ? 'underline' : '', className?.includes('line-through') ? 'line-through' : ''].filter(Boolean).join(' ') || undefined }}
      />
    </div>
  );
}
