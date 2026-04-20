import { useRef, useEffect, useState, useCallback } from "react";
import {
  Bold, Italic, Underline, Code, Link2, Type, ChevronDown, Check,
  AlignLeft, AlignCenter, AlignRight, List, ListOrdered, Palette, Minus, Plus,
  Wand2, Sliders, Star, X, Eraser
} from "lucide-react";
import { cn } from "@/lib/utils";
import DOMPurify from "dompurify";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { textColorPresets, bgColorPresets, bgColorDotStyles, wrapCalloutTargets, wrapOtherTargets, quickStyles } from "./block-editor/types";
import type { BlockType, ContentBlock, StylePreset } from "./block-editor/types";
import { extractStyle, describeStyle } from "./block-editor/utils";

interface RichTextEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  minHeight?: string;
  // Optional block-level controls — when provided, toolbar exposes block style controls
  onConvertType?: (type: BlockType) => void;
  onStyleUpdate?: (updates: Partial<ContentBlock>) => void;
  currentBlockType?: BlockType;
  currentTextAlign?: 'left' | 'center' | 'right';
  currentTextColor?: string;
  currentBgColor?: string;
  currentTextSize?: 'sm' | 'base' | 'lg';
  // Block conversion (separate from list/heading switcher)
  onConvertBlockType?: (type: BlockType) => void;
  canConvert?: boolean;
  canStyle?: boolean;
  currentBlock?: ContentBlock;
  presets?: { name: string; style: StylePreset }[];
  onPresetsChange?: (p: { name: string; style: StylePreset }[]) => void;
}

const ALLOWED_TAGS = ['strong', 'b', 'em', 'i', 'u', 's', 'br', 'p', 'span', 'div', 'a', 'code'];
const ALLOWED_ATTR = ['style', 'href', 'target', 'rel'];

function sanitize(html: string): string {
  return DOMPurify.sanitize(html, { ALLOWED_TAGS, ALLOWED_ATTR, ALLOW_DATA_ATTR: false });
}

function linkify(html: string): string {
  const parts = html.split(/(<a\s[^>]*>.*?<\/a>)/gi);
  return parts.map((part) => {
    if (/^<a\s/i.test(part)) return part;
    return part.replace(
      /(?:https?:\/\/|www\.)[^\s<>"']+/gi,
      (url) => {
        const href = url.startsWith('www.') ? `https://${url}` : url;
        return `<a href="${href}" target="_blank" rel="noopener noreferrer">${url}</a>`;
      }
    );
  }).join('');
}

export function RichTextEditor({
  value, onChange, placeholder, className, minHeight = "60px",
  onConvertType, onStyleUpdate, currentBlockType, currentTextAlign,
  currentTextColor, currentBgColor, currentTextSize,
  onConvertBlockType, canConvert, canStyle, currentBlock, presets, onPresetsChange,
}: RichTextEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const [showToolbar, setShowToolbar] = useState(false);
  const [toolbarPos, setToolbarPos] = useState({ top: 0, left: 0 });
  const [styleMenuOpen, setStyleMenuOpen] = useState(false);
  const [listMenuOpen, setListMenuOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const [convertOpen, setConvertOpen] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [linkInput, setLinkInput] = useState("");
  const [activeFormats, setActiveFormats] = useState({ bold: false, italic: false, underline: false, code: false });
  const isInternalChange = useRef(false);
  const lastEmittedHtml = useRef(value || "");
  const savedRange = useRef<Range | null>(null);

  useEffect(() => {
    const el = editorRef.current;
    if (el) {
      el.innerHTML = value || "";
      lastEmittedHtml.current = value || "";
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    const escaped = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const linked = linkify(escaped);
    if (linked !== escaped) {
      document.execCommand('insertHTML', false, linked);
    } else {
      document.execCommand('insertText', false, text);
    }
    handleInput();
  }, [handleInput]);

  const handleBlur = useCallback(() => {
    setTimeout(() => {
      // Only hide if no popover is open
      if (!styleMenuOpen && !listMenuOpen && !paletteOpen && !linkOpen && !convertOpen && !advancedOpen) {
        setShowToolbar(false);
      }
    }, 200);
    const el = editorRef.current;
    if (!el) return;

    const before = el.innerHTML;
    const afterLinkify = linkify(before);
    const cleaned = sanitize(afterLinkify);

    const normalized = cleaned.replace(
      /<a\s+([^>]*?)>/gi,
      (_match, attrs: string) => {
        let href = '';
        const hrefMatch = attrs.match(/href="([^"]*)"/);
        if (hrefMatch) href = hrefMatch[1];
        if (!href) return _match;
        return `<a href="${href}" target="_blank" rel="noopener noreferrer">`;
      }
    );

    if (normalized !== before) {
      const sel = window.getSelection();
      const hadFocus = document.activeElement === el;
      el.innerHTML = normalized;
      if (hadFocus && sel) {
        const range = document.createRange();
        range.selectNodeContents(el);
        range.collapse(false);
        sel.removeAllRanges();
        sel.addRange(range);
      }
    }
    lastEmittedHtml.current = el.innerHTML;
    isInternalChange.current = true;
    onChange(el.innerHTML);
  }, [onChange, styleMenuOpen, listMenuOpen, paletteOpen, linkOpen]);

  const updateActiveFormats = useCallback(() => {
    try {
      setActiveFormats({
        bold: document.queryCommandState('bold'),
        italic: document.queryCommandState('italic'),
        underline: document.queryCommandState('underline'),
        code: !!getParentTag('CODE'),
      });
    } catch { /* noop */ }
  }, []);

  const handleSelectionChange = useCallback(() => {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !sel.rangeCount) {
      // Don't auto-hide while a popover is open
      if (!styleMenuOpen && !listMenuOpen && !paletteOpen && !linkOpen) {
        setShowToolbar(false);
      }
      return;
    }
    const range = sel.getRangeAt(0);
    const editor = editorRef.current;
    if (!editor || !editor.contains(range.commonAncestorContainer)) {
      if (!styleMenuOpen && !listMenuOpen && !paletteOpen && !linkOpen) {
        setShowToolbar(false);
      }
      return;
    }
    savedRange.current = range.cloneRange();
    const rect = range.getBoundingClientRect();
    const editorRect = editor.getBoundingClientRect();
    // Centered above the text selection. Flip below when too close to the viewport top.
    const TOOLBAR_HEIGHT = 48;
    const GAP = 10;
    const flipBelow = rect.top < TOOLBAR_HEIGHT + GAP + 8;
    const top = flipBelow
      ? rect.bottom - editorRect.top + GAP
      : rect.top - editorRect.top - TOOLBAR_HEIGHT - GAP;
    const left = rect.left + rect.width / 2 - editorRect.left;
    setToolbarPos({ top, left });
    setShowToolbar(true);
    updateActiveFormats();
  }, [styleMenuOpen, listMenuOpen, paletteOpen, linkOpen, updateActiveFormats]);

  useEffect(() => {
    document.addEventListener("selectionchange", handleSelectionChange);
    return () => document.removeEventListener("selectionchange", handleSelectionChange);
  }, [handleSelectionChange]);

  const restoreSelection = () => {
    const sel = window.getSelection();
    if (sel && savedRange.current) {
      sel.removeAllRanges();
      sel.addRange(savedRange.current);
    }
    editorRef.current?.focus();
  };

  const execFormat = (command: string) => {
    restoreSelection();
    document.execCommand(command, false);
    handleInput();
    updateActiveFormats();
  };

  const getParentTag = (tag: string): HTMLElement | null => {
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount) return null;
    let node: Node | null = sel.anchorNode;
    while (node && node !== editorRef.current) {
      if (node.nodeType === 1 && (node as Element).tagName === tag) {
        return node as HTMLElement;
      }
      node = node.parentNode;
    }
    return null;
  };

  const toggleCode = () => {
    restoreSelection();
    const existing = getParentTag('CODE');
    if (existing) {
      // unwrap
      const parent = existing.parentNode;
      while (existing.firstChild) parent?.insertBefore(existing.firstChild, existing);
      parent?.removeChild(existing);
      handleInput();
    } else {
      document.execCommand('insertHTML', false, `<code>${window.getSelection()?.toString() || ''}</code>`);
      handleInput();
    }
    updateActiveFormats();
  };

  const handleUnlink = () => {
    restoreSelection();
    document.execCommand('unlink', false);
    handleInput();
  };

  const handleApplyLink = () => {
    if (!linkInput.trim()) return;
    let href = linkInput.trim();
    if (!/^https?:\/\//i.test(href) && !href.startsWith('www.')) href = `https://${href}`;
    if (href.startsWith('www.')) href = `https://${href}`;
    restoreSelection();
    document.execCommand('createLink', false, href);
    // Set target/rel on the newly created anchor
    const anchor = getParentTag('A') as HTMLAnchorElement | null;
    if (anchor) {
      anchor.setAttribute('target', '_blank');
      anchor.setAttribute('rel', 'noopener noreferrer');
    }
    handleInput();
    setLinkInput("");
    setLinkOpen(false);
  };

  // Inline font-size cycling on the current selection via <span style="font-size">.
  const FONT_SIZES = [12, 14, 16, 18, 20, 24, 28, 32];
  const cycleSize = (dir: 1 | -1) => {
    restoreSelection();
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;

    // Detect current font-size on selection (anchor element).
    let cur = 16;
    const anchorEl = (sel.anchorNode?.nodeType === 1
      ? (sel.anchorNode as HTMLElement)
      : (sel.anchorNode?.parentElement as HTMLElement | null)) || null;
    if (anchorEl) {
      const cs = window.getComputedStyle(anchorEl).fontSize;
      const parsed = parseInt(cs, 10);
      if (!Number.isNaN(parsed)) cur = parsed;
    }
    // Snap to nearest size in our scale, then move by dir.
    let idx = FONT_SIZES.findIndex((s) => s >= cur);
    if (idx === -1) idx = FONT_SIZES.length - 1;
    if (FONT_SIZES[idx] !== cur) idx = Math.max(0, idx - (dir === 1 ? 0 : 1));
    const nextIdx = Math.max(0, Math.min(FONT_SIZES.length - 1, idx + dir));
    const nextSize = FONT_SIZES[nextIdx];

    // Apply via execCommand fontSize then convert <font size> → <span style="font-size">.
    document.execCommand('fontSize', false, '7');
    const editor = editorRef.current;
    if (editor) {
      editor.querySelectorAll('font[size="7"]').forEach((node) => {
        const span = document.createElement('span');
        span.style.fontSize = `${nextSize}px`;
        while (node.firstChild) span.appendChild(node.firstChild);
        node.parentNode?.replaceChild(span, node);
      });
    }
    handleInput();
  };

  const setBlockType = (type: BlockType) => {
    onConvertType?.(type);
    setStyleMenuOpen(false);
  };

  const styleMenuItems: Array<{ type: BlockType; label: string; preview: string }> = [
    { type: "heading1", label: "Заголовок 1", preview: "text-3xl font-bold" },
    { type: "heading2", label: "Заголовок 2", preview: "text-2xl font-bold" },
    { type: "heading3", label: "Заголовок 3", preview: "text-xl font-semibold" },
    { type: "heading4", label: "Заголовок 4", preview: "text-lg font-semibold" },
    { type: "paragraph", label: "Текст", preview: "text-sm" },
  ];

  const hasBlockControls = !!(onConvertType || onStyleUpdate);

  return (
    <div className="relative">
      {showToolbar && (
        <div
          className="absolute z-50 flex items-center gap-0.5 bg-slate-800/95 backdrop-blur-md text-white rounded-2xl shadow-2xl border border-white/10 px-2 py-1.5 h-12 pointer-events-auto -translate-x-1/2"
          style={{ top: toolbarPos.top, left: toolbarPos.left }}
          onMouseDown={(e) => e.preventDefault()}
        >
          {/* Size − / Style T / Size + */}
          <button
            onMouseDown={(e) => { e.preventDefault(); cycleSize(-1); }}
            className="h-9 w-9 flex items-center justify-center hover:bg-white/10 rounded-lg transition-colors"
            title="Уменьшить"
          >
            <Minus className="w-[18px] h-[18px]" />
          </button>
          {onConvertType && (
            <Popover open={styleMenuOpen} onOpenChange={setStyleMenuOpen}>
              <PopoverTrigger asChild>
                <button
                  onMouseDown={(e) => e.preventDefault()}
                  className="h-9 px-2 flex items-center gap-1 hover:bg-white/10 rounded-lg transition-colors"
                  title="Стиль текста"
                >
                  <Type className="w-[18px] h-[18px]" />
                  <ChevronDown className="w-3 h-3 opacity-70" />
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-48 p-1 bg-slate-800 border-white/10 text-white" align="center" onOpenAutoFocus={(e) => e.preventDefault()}>
                {styleMenuItems.map((item) => (
                  <button
                    key={item.type}
                    onMouseDown={(e) => { e.preventDefault(); setBlockType(item.type); }}
                    className="w-full flex items-center justify-between gap-2 px-2 py-1.5 rounded-md hover:bg-white/10 transition-colors text-left"
                  >
                    <span className={cn(item.preview)}>{item.label}</span>
                    {currentBlockType === item.type && <Check className="w-4 h-4 text-primary" />}
                  </button>
                ))}
              </PopoverContent>
            </Popover>
          )}
          <button
            onMouseDown={(e) => { e.preventDefault(); cycleSize(1); }}
            className="h-9 w-9 flex items-center justify-center hover:bg-white/10 rounded-lg transition-colors"
            title="Увеличить"
          >
            <Plus className="w-[18px] h-[18px]" />
          </button>
          <div className="w-px h-7 bg-white/15 mx-1" />

          {/* Inline formatting */}
          <button
            onMouseDown={(e) => { e.preventDefault(); execFormat('bold'); }}
            className={cn("h-9 w-9 flex items-center justify-center rounded-lg transition-colors", activeFormats.bold ? "bg-primary text-primary-foreground" : "hover:bg-white/10")}
            title="Жирный (Ctrl+B)"
          >
            <Bold className="w-[18px] h-[18px]" />
          </button>
          <button
            onMouseDown={(e) => { e.preventDefault(); execFormat('italic'); }}
            className={cn("h-9 w-9 flex items-center justify-center rounded-lg transition-colors", activeFormats.italic ? "bg-primary text-primary-foreground" : "hover:bg-white/10")}
            title="Курсив (Ctrl+I)"
          >
            <Italic className="w-[18px] h-[18px]" />
          </button>
          <button
            onMouseDown={(e) => { e.preventDefault(); toggleCode(); }}
            className={cn("h-9 w-9 flex items-center justify-center rounded-lg transition-colors", activeFormats.code ? "bg-primary text-primary-foreground" : "hover:bg-white/10")}
            title="Код"
          >
            <Code className="w-[18px] h-[18px]" />
          </button>
          <button
            onMouseDown={(e) => { e.preventDefault(); execFormat('underline'); }}
            className={cn("h-9 w-9 flex items-center justify-center rounded-lg transition-colors", activeFormats.underline ? "bg-primary text-primary-foreground" : "hover:bg-white/10")}
            title="Подчёркнутый (Ctrl+U)"
          >
            <Underline className="w-[18px] h-[18px]" />
          </button>

          {hasBlockControls && onConvertType && (
            <>
              <div className="w-px h-7 bg-white/15 mx-1" />
              {/* Lists */}
              <Popover open={listMenuOpen} onOpenChange={setListMenuOpen}>
                <PopoverTrigger asChild>
                  <button
                    onMouseDown={(e) => e.preventDefault()}
                    className="h-9 w-9 flex items-center justify-center hover:bg-white/10 rounded-lg transition-colors"
                    title="Список"
                  >
                    <List className="w-[18px] h-[18px]" />
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-44 p-1" align="start" onOpenAutoFocus={(e) => e.preventDefault()}>
                  <button
                    onMouseDown={(e) => { e.preventDefault(); onConvertType("bulletList"); setListMenuOpen(false); }}
                    className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-accent transition-colors text-sm text-left"
                  >
                    <List className="w-4 h-4" />Маркированный
                    {currentBlockType === "bulletList" && <Check className="w-4 h-4 text-primary ml-auto" />}
                  </button>
                  <button
                    onMouseDown={(e) => { e.preventDefault(); onConvertType("numberedList"); setListMenuOpen(false); }}
                    className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-accent transition-colors text-sm text-left"
                  >
                    <ListOrdered className="w-4 h-4" />Нумерованный
                    {currentBlockType === "numberedList" && <Check className="w-4 h-4 text-primary ml-auto" />}
                  </button>
                </PopoverContent>
              </Popover>
            </>
          )}

          {hasBlockControls && onStyleUpdate && (
            <>
              <div className="w-px h-7 bg-white/15 mx-1" />
              {/* Alignment */}
              {([
                { v: undefined, icon: AlignLeft, key: 'left', title: 'По левому краю' },
                { v: 'center' as const, icon: AlignCenter, key: 'center', title: 'По центру' },
                { v: 'right' as const, icon: AlignRight, key: 'right', title: 'По правому краю' },
              ]).map(({ v, icon: Icon, key, title }) => {
                const cur = currentTextAlign || 'left';
                const isActive = cur === key;
                return (
                  <button
                    key={key}
                    onMouseDown={(e) => { e.preventDefault(); onStyleUpdate({ textAlign: v }); }}
                    className={cn("h-9 w-9 flex items-center justify-center rounded-lg transition-colors", isActive ? "bg-primary text-primary-foreground" : "hover:bg-white/10")}
                    title={title}
                  >
                    <Icon className="w-[18px] h-[18px]" />
                  </button>
                );
              })}

              <div className="w-px h-6 bg-white/15 mx-0.5" />
              {/* Palette */}
              <Popover open={paletteOpen} onOpenChange={setPaletteOpen}>
                <PopoverTrigger asChild>
                  <button
                    onMouseDown={(e) => e.preventDefault()}
                    className="h-9 w-9 flex items-center justify-center hover:bg-white/10 rounded-lg transition-colors"
                    title="Цвет"
                  >
                    <Palette className="w-[18px] h-[18px]" />
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-60 p-3" align="start" onOpenAutoFocus={(e) => e.preventDefault()}>
                  <div className="space-y-3">
                    <div>
                      <p className="text-xs font-medium text-muted-foreground mb-1.5">Цвет текста</p>
                      <div className="flex gap-1.5 flex-wrap">
                        {textColorPresets.map((preset) => (
                          <button
                            key={preset.value || 'default'}
                            onMouseDown={(e) => { e.preventDefault(); onStyleUpdate({ textColor: preset.value || undefined }); }}
                            className={cn("w-6 h-6 rounded-full transition-all", preset.dot, (currentTextColor || "") === preset.value && "ring-2 ring-primary ring-offset-1")}
                            title={preset.label}
                          />
                        ))}
                      </div>
                    </div>
                    <div>
                      <p className="text-xs font-medium text-muted-foreground mb-1.5">Фон / выделение</p>
                      <div className="flex gap-1.5 flex-wrap">
                        {bgColorPresets.map((preset) => (
                          <button
                            key={preset.value || 'none'}
                            onMouseDown={(e) => { e.preventDefault(); onStyleUpdate({ bgColor: preset.value || undefined }); }}
                            className={cn("w-6 h-6 rounded-full transition-all", bgColorDotStyles[preset.value], (currentBgColor || "") === preset.value && "ring-2 ring-primary ring-offset-1")}
                            title={preset.label}
                          />
                        ))}
                      </div>
                    </div>
                    {(currentTextColor || currentBgColor) && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="w-full h-7 text-xs"
                        onMouseDown={(e) => { e.preventDefault(); onStyleUpdate({ textColor: undefined, bgColor: undefined }); }}
                      >
                        Сбросить
                      </Button>
                    )}
                  </div>
                </PopoverContent>
              </Popover>
            </>
          )}

          <Popover open={linkOpen} onOpenChange={(o) => { setLinkOpen(o); if (o) setLinkInput(getParentTag('A')?.getAttribute('href') || ''); }}>
            <PopoverTrigger asChild>
              <button
                onMouseDown={(e) => e.preventDefault()}
                className="h-9 w-9 flex items-center justify-center hover:bg-white/10 rounded-lg transition-colors"
                title="Ссылка"
              >
                <Link2 className="w-[18px] h-[18px]" />
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-72 p-2" align="start" onOpenAutoFocus={(e) => e.preventDefault()}>
              <div className="flex flex-col gap-2">
                <Input
                  value={linkInput}
                  onChange={(e) => setLinkInput(e.target.value)}
                  placeholder="https://..."
                  className="h-8 text-sm"
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleApplyLink(); } }}
                />
                <div className="flex gap-2">
                  <Button size="sm" className="h-7 text-xs flex-1" onMouseDown={(e) => { e.preventDefault(); handleApplyLink(); }}>Применить</Button>
                  {getParentTag('A') && (
                    <Button size="sm" variant="outline" className="h-7 text-xs" onMouseDown={(e) => { e.preventDefault(); handleUnlink(); setLinkOpen(false); }}>Удалить</Button>
                  )}
                </div>
              </div>
            </PopoverContent>
          </Popover>
        </div>
      )}

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
          "[&_a]:!text-primary [&_a]:!underline [&_a]:!underline-offset-2 [&_a]:cursor-pointer [&_a]:break-all [&_a]:hover:opacity-80 [&_a]:transition-opacity",
          "[&_code]:bg-muted [&_code]:px-1 [&_code]:py-0.5 [&_code]:rounded [&_code]:text-[0.9em] [&_code]:font-mono",
          "empty:before:content-[attr(data-placeholder)] empty:before:text-muted-foreground empty:before:pointer-events-none",
          className
        )}
        style={{ minHeight, fontStyle: className?.includes('italic') ? 'italic' : undefined, fontWeight: className?.includes('font-bold') ? 'bold' : undefined, textDecoration: [className?.includes('underline') ? 'underline' : '', className?.includes('line-through') ? 'line-through' : ''].filter(Boolean).join(' ') || undefined }}
        onClick={(e) => {
          const target = e.target as HTMLElement;
          const anchor = target.closest('a');
          if (anchor && anchor.href) {
            const sel = window.getSelection();
            if (sel && !sel.isCollapsed) return;
            e.preventDefault();
            window.open(anchor.href, '_blank', 'noopener,noreferrer');
          }
        }}
      />
    </div>
  );
}
