import { useRef, useEffect, useLayoutEffect, useState, useCallback } from "react";
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
import { sanitizeRichHtml as sanitize, linkifyHtml as linkify, normalizeRichLineBreaks, finalizeRichHtml } from "./rich-text/htmlSanitize";
import { toast } from "sonner";

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

// sanitize/linkify imported from ./rich-text/htmlSanitize

export function RichTextEditor({
  value, onChange, placeholder, className, minHeight = "60px",
  onConvertType, onStyleUpdate, currentBlockType, currentTextAlign,
  currentTextColor, currentBgColor, currentTextSize,
  onConvertBlockType, canConvert, canStyle, currentBlock, presets, onPresetsChange,
}: RichTextEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const toolbarRef = useRef<HTMLDivElement>(null);
  const [showToolbar, setShowToolbar] = useState(false);
  // left here is the desired CENTER of the toolbar relative to the editor.
  // The clamp logic in the effect below adjusts it so the toolbar stays fully visible in the viewport.
  const [toolbarPos, setToolbarPos] = useState({ top: 0, left: 0 });
  const [styleMenuOpen, setStyleMenuOpen] = useState(false);
  const [listMenuOpen, setListMenuOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const [convertOpen, setConvertOpen] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [linkInput, setLinkInput] = useState("");
  const [presetNameOpen, setPresetNameOpen] = useState(false);
  const [presetNameInput, setPresetNameInput] = useState("");
  const [activeFormats, setActiveFormats] = useState({ bold: false, italic: false, underline: false, code: false });
  const isInternalChange = useRef(false);
  const lastEmittedHtml = useRef(value || "");
  const savedRange = useRef<Range | null>(null);

  // Унифицированный sync value → DOM. Защищён от рекурсии (внутренний ввод не триггерит перезапись)
  // и корректно подхватывает поздно прилетевший value (например, после загрузки урока с медленной сетью).
  useEffect(() => {
    const el = editorRef.current;
    if (!el) return;
    if (isInternalChange.current) {
      isInternalChange.current = false;
      return;
    }
    const incoming = value || "";
    const currentDom = el.innerHTML;
    // Перезаписываем DOM, только если внешнее значение действительно отличается
    // от того, что мы последний раз отправили наружу И от того, что в DOM сейчас.
    if (incoming !== lastEmittedHtml.current || incoming !== currentDom) {
      // Не трогаем DOM, если редактор сейчас в фокусе и пользователь печатает
      // (иначе курсор прыгнет). Но при первой загрузке (DOM пустой) — обязательно ставим.
      const isFocused = document.activeElement === el;
      const domEmpty = !currentDom || currentDom === "<br>" || currentDom === "";
      if (!isFocused || domEmpty) {
        el.innerHTML = incoming;
        lastEmittedHtml.current = incoming;
      }
    }
  }, [value]);

  const normalizeLineBreaks = useCallback((html: string): string => {
    if (!html) return html;
    let out = html;
    // Boundaries between block containers → <br>
    out = out.replace(/<\/(?:div|p)>\s*<(?:div|p)(?:\s[^>]*)?>/gi, '<br>');
    // Strip remaining opening/closing div & p tags (keep inner text)
    out = out.replace(/<(?:div|p)(?:\s[^>]*)?>/gi, '');
    out = out.replace(/<\/(?:div|p)>/gi, '');
    // Collapse 3+ consecutive <br> into 2
    out = out.replace(/(?:<br\s*\/?>\s*){3,}/gi, '<br><br>');
    return out;
  }, []);

  const handleInput = useCallback(() => {
    const el = editorRef.current;
    if (!el) return;
    isInternalChange.current = true;
    const raw = el.innerHTML;
    const normalized = normalizeLineBreaks(raw);
    lastEmittedHtml.current = normalized;
    onChange(normalized);
  }, [onChange, normalizeLineBreaks]);

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

    const normalized = normalizeLineBreaks(cleaned.replace(
      /<a\s+([^>]*?)>/gi,
      (_match, attrs: string) => {
        let href = '';
        const hrefMatch = attrs.match(/href="([^"]*)"/);
        if (hrefMatch) href = hrefMatch[1];
        if (!href) return _match;
        return `<a href="${href}" target="_blank" rel="noopener noreferrer">`;
      }
    ));

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
  }, [onChange, styleMenuOpen, listMenuOpen, paletteOpen, linkOpen, convertOpen, advancedOpen, normalizeLineBreaks]);

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
      if (!styleMenuOpen && !listMenuOpen && !paletteOpen && !linkOpen && !convertOpen && !advancedOpen) {
        setShowToolbar(false);
      }
      return;
    }
    const range = sel.getRangeAt(0);
    const editor = editorRef.current;
    if (!editor || !editor.contains(range.commonAncestorContainer)) {
      if (!styleMenuOpen && !listMenuOpen && !paletteOpen && !linkOpen && !convertOpen && !advancedOpen) {
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
  }, [styleMenuOpen, listMenuOpen, paletteOpen, linkOpen, convertOpen, advancedOpen, updateActiveFormats]);

  useEffect(() => {
    document.addEventListener("selectionchange", handleSelectionChange);
    return () => document.removeEventListener("selectionchange", handleSelectionChange);
  }, [handleSelectionChange]);

  // Clamp toolbar horizontally so it always stays fully visible in the viewport.
  // Runs after the toolbar mounts/updates so we can measure its actual width.
  useLayoutEffect(() => {
    if (!showToolbar) return;
    const tb = toolbarRef.current;
    const editor = editorRef.current;
    if (!tb || !editor) return;

    const editorRect = editor.getBoundingClientRect();
    const tbWidth = tb.offsetWidth || 320;
    const tbHeight = tb.offsetHeight || 48;
    const MARGIN = 8;

    // Desired center in viewport coords
    const desiredCenterViewport = editorRect.left + toolbarPos.left;
    // Clamp so toolbar's left/right edges stay within viewport with MARGIN
    const minCenter = MARGIN + tbWidth / 2;
    const maxCenter = window.innerWidth - MARGIN - tbWidth / 2;
    const clampedCenterViewport = Math.min(Math.max(desiredCenterViewport, minCenter), maxCenter);
    const clampedLeftRelative = clampedCenterViewport - editorRect.left;

    // Vertical: if toolbar would go above the viewport, push it below the selection
    let newTop = toolbarPos.top;
    const topInViewport = editorRect.top + newTop;
    if (topInViewport < MARGIN) {
      newTop = MARGIN - editorRect.top + tbHeight + 10;
    }

    if (Math.abs(clampedLeftRelative - toolbarPos.left) > 0.5 || Math.abs(newTop - toolbarPos.top) > 0.5) {
      setToolbarPos({ top: newTop, left: clampedLeftRelative });
    }
  }, [showToolbar, toolbarPos.left, toolbarPos.top]);

  const restoreSelection = () => {
    const sel = window.getSelection();
    if (sel && savedRange.current) {
      sel.removeAllRanges();
      sel.addRange(savedRange.current);
    }
    editorRef.current?.focus();
  };

  const hasUsableSelection = (): boolean => {
    if (savedRange.current && !savedRange.current.collapsed) return true;
    const sel = window.getSelection();
    return !!sel && !sel.isCollapsed && sel.rangeCount > 0;
  };

  const execFormat = (command: string) => {
    if (!hasUsableSelection()) {
      toast.message("Выделите текст", { description: "Чтобы применить стиль, сначала выделите фрагмент текста." });
      return;
    }
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
    if (!hasUsableSelection() && !getParentTag('CODE')) {
      toast.message("Выделите текст", { description: "Чтобы вставить код, сначала выделите фрагмент текста." });
      return;
    }
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
    if (!hasUsableSelection()) {
      toast.message("Выделите текст", { description: "Сначала выделите фрагмент, к которому нужно прикрепить ссылку." });
      return;
    }
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
    if (!hasUsableSelection()) {
      toast.message("Выделите текст", { description: "Чтобы изменить размер, сначала выделите фрагмент текста." });
      return;
    }
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
                    onMouseDown={(e) => {
                      e.preventDefault();
                      const isActive = currentBlockType === item.type;
                      setBlockType(isActive && item.type !== "paragraph" ? "paragraph" : item.type);
                    }}
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
                    onMouseDown={(e) => {
                      e.preventDefault();
                      onConvertType(currentBlockType === "bulletList" ? "paragraph" : "bulletList");
                      setListMenuOpen(false);
                    }}
                    className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-accent transition-colors text-sm text-left"
                  >
                    <List className="w-4 h-4" />Маркированный
                    {currentBlockType === "bulletList" && <Check className="w-4 h-4 text-primary ml-auto" />}
                  </button>
                  <button
                    onMouseDown={(e) => {
                      e.preventDefault();
                      onConvertType(currentBlockType === "numberedList" ? "paragraph" : "numberedList");
                      setListMenuOpen(false);
                    }}
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

          {/* Convert block to another type */}
          {canConvert && onConvertBlockType && (
            <>
              <div className="w-px h-7 bg-white/15 mx-1" />
              <Popover open={convertOpen} onOpenChange={setConvertOpen}>
                <PopoverTrigger asChild>
                  <button
                    onMouseDown={(e) => e.preventDefault()}
                    className="h-9 w-9 flex items-center justify-center hover:bg-white/10 rounded-lg transition-colors"
                    title="Преобразовать в…"
                  >
                    <Wand2 className="w-[18px] h-[18px]" />
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-60 p-1.5 max-h-[60vh] overflow-y-auto" align="start" onOpenAutoFocus={(e) => e.preventDefault()}>
                  <p className="text-[10px] uppercase font-semibold text-muted-foreground px-2 py-1">Преобразовать в…</p>
                  {wrapOtherTargets.filter(t => t.type !== currentBlockType).map((t) => (
                    <button
                      key={t.type}
                      onMouseDown={(e) => { e.preventDefault(); onConvertBlockType(t.type); setConvertOpen(false); }}
                      className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-accent text-sm text-left"
                    >
                      <t.icon className={cn("w-4 h-4", t.color)} />{t.label}
                    </button>
                  ))}
                  <div className="border-t my-1" />
                  <p className="text-[10px] uppercase font-semibold text-muted-foreground px-2 py-1">Выделение</p>
                  {wrapCalloutTargets.filter(t => t.type !== currentBlockType).map((t) => (
                    <button
                      key={t.type}
                      onMouseDown={(e) => { e.preventDefault(); onConvertBlockType(t.type); setConvertOpen(false); }}
                      className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-accent text-sm text-left"
                    >
                      <t.icon className={cn("w-4 h-4", t.color)} />{t.label}
                    </button>
                  ))}
                </PopoverContent>
              </Popover>
            </>
          )}

          {/* Advanced styling */}
          {canStyle && onStyleUpdate && (
            <Popover open={advancedOpen} onOpenChange={setAdvancedOpen}>
              <PopoverTrigger asChild>
                <button
                  onMouseDown={(e) => e.preventDefault()}
                  className="h-9 w-9 flex items-center justify-center hover:bg-white/10 rounded-lg transition-colors"
                  title="Доп. оформление"
                >
                  <Sliders className="w-[18px] h-[18px]" />
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-72 p-3 max-h-[70vh] overflow-y-auto" align="end" onOpenAutoFocus={(e) => e.preventDefault()}>
                <div className="space-y-3">
                  <div>
                    <p className="text-[10px] uppercase font-semibold text-muted-foreground mb-1.5">Доп. форматирование</p>
                    <div className="flex gap-1">
                      <Button variant={currentBlock?.strikethrough ? "default" : "outline"} size="sm" className="h-7 px-2.5 text-xs" onMouseDown={(e) => { e.preventDefault(); onStyleUpdate({ strikethrough: !currentBlock?.strikethrough }); }}>Зачёркнутый</Button>
                      <Button variant={currentBlock?.uppercase ? "default" : "outline"} size="sm" className="h-7 px-2.5 text-xs" onMouseDown={(e) => { e.preventDefault(); onStyleUpdate({ uppercase: !currentBlock?.uppercase }); }}>UPPERCASE</Button>
                    </div>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase font-semibold text-muted-foreground mb-1.5">Шрифт</p>
                    <div className="flex gap-1">
                      {([['sans', 'Обычный'], ['mono', 'Моно']] as const).map(([ff, label]) => (
                        <Button key={ff} variant={(currentBlock?.fontFamily || 'sans') === ff ? "default" : "outline"} size="sm" className="h-7 px-2.5 text-xs" onMouseDown={(e) => { e.preventDefault(); onStyleUpdate({ fontFamily: ff === 'sans' ? undefined : ff }); }}>{label}</Button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase font-semibold text-muted-foreground mb-1.5">Межстрочный интервал</p>
                    <div className="flex gap-1">
                      {([['tight', 'Плотный'], ['normal', 'Обычный'], ['relaxed', 'Свободный']] as const).map(([lh, label]) => (
                        <Button key={lh} variant={(currentBlock?.lineHeight || 'normal') === lh ? "default" : "outline"} size="sm" className="h-7 px-2.5 text-xs" onMouseDown={(e) => { e.preventDefault(); onStyleUpdate({ lineHeight: lh === 'normal' ? undefined : lh }); }}>{label}</Button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase font-semibold text-muted-foreground mb-1.5">Рамка</p>
                    <div className="flex gap-1 flex-wrap">
                      {([['none', 'Нет'], ['thin', 'Тонкая'], ['bold', 'Жирная'], ['dashed', 'Пунктир']] as const).map(([bs, label]) => (
                        <Button key={bs} variant={(currentBlock?.borderStyle || 'none') === bs ? "default" : "outline"} size="sm" className="h-7 px-2.5 text-xs" onMouseDown={(e) => { e.preventDefault(); onStyleUpdate({ borderStyle: bs === 'none' ? undefined : bs }); }}>{label}</Button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase font-semibold text-muted-foreground mb-1.5">Скругление</p>
                    <div className="flex gap-1">
                      {([['none', 'Нет'], ['md', 'Md'], ['xl', 'Xl']] as const).map(([br, label]) => (
                        <Button key={br} variant={(currentBlock?.borderRadius || 'none') === br ? "default" : "outline"} size="sm" className="h-7 px-2.5 text-xs" onMouseDown={(e) => { e.preventDefault(); onStyleUpdate({ borderRadius: br === 'none' ? undefined : br }); }}>{label}</Button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase font-semibold text-muted-foreground mb-1.5">Готовые стили</p>
                    <div className="grid grid-cols-3 gap-1">
                      {quickStyles.map((qs) => (
                        <button
                          key={qs.name}
                          onMouseDown={(e) => { e.preventDefault(); onStyleUpdate(qs.style); }}
                          className="flex flex-col items-center gap-0.5 p-1.5 rounded-md border border-border hover:border-primary/50 hover:bg-primary/5 transition-all text-xs"
                        >
                          <span>{qs.icon}</span>
                          <span className="truncate w-full text-center">{qs.name}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                  {presets && onPresetsChange && currentBlock && (
                    <div>
                      <p className="text-[10px] uppercase font-semibold text-muted-foreground mb-1.5">Пресеты</p>
                      {presetNameOpen ? (
                        <div className="flex gap-1 mb-1">
                          <Input
                            autoFocus
                            value={presetNameInput}
                            onChange={(e) => setPresetNameInput(e.target.value)}
                            placeholder="Название пресета"
                            className="h-7 text-xs"
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                const name = presetNameInput.trim() || describeStyle(extractStyle(currentBlock));
                                onPresetsChange([...presets, { name, style: extractStyle(currentBlock) }]);
                                toast.success(`Пресет сохранён: ${name}`);
                                setPresetNameInput("");
                                setPresetNameOpen(false);
                              } else if (e.key === 'Escape') {
                                setPresetNameOpen(false);
                                setPresetNameInput("");
                              }
                            }}
                          />
                          <Button
                            size="sm"
                            className="h-7 px-2 text-xs"
                            onMouseDown={(e) => {
                              e.preventDefault();
                              const name = presetNameInput.trim() || describeStyle(extractStyle(currentBlock));
                              onPresetsChange([...presets, { name, style: extractStyle(currentBlock) }]);
                              toast.success(`Пресет сохранён: ${name}`);
                              setPresetNameInput("");
                              setPresetNameOpen(false);
                            }}
                          >
                            ОК
                          </Button>
                        </div>
                      ) : (
                        <button
                          onMouseDown={(e) => {
                            e.preventDefault();
                            setPresetNameInput(describeStyle(extractStyle(currentBlock)));
                            setPresetNameOpen(true);
                          }}
                          className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-accent text-sm text-left"
                        >
                          <Star className="w-4 h-4 text-yellow-500" />Сохранить текущий стиль
                        </button>
                      )}
                      {presets.length > 0 && (
                        <div className="mt-1 space-y-0.5">
                          {presets.map((p, i) => (
                            <div key={i} className="flex items-center justify-between gap-2 px-2 py-1 rounded-md hover:bg-accent group/preset">
                              <button
                                className="flex-1 truncate text-xs text-left"
                                onMouseDown={(e) => {
                                  e.preventDefault();
                                  const applied = { ...p.style, textSize: p.style.textSize === 'base' ? undefined : p.style.textSize, lineHeight: p.style.lineHeight === 'normal' ? undefined : p.style.lineHeight };
                                  onStyleUpdate(applied);
                                  setAdvancedOpen(false);
                                }}
                              >
                                {p.name}
                              </button>
                              <button
                                className="opacity-0 group-hover/preset:opacity-100 h-5 w-5 flex items-center justify-center hover:bg-destructive/20 rounded transition-all"
                                onMouseDown={(e) => { e.preventDefault(); onPresetsChange(presets.filter((_, j) => j !== i)); }}
                              >
                                <X className="w-3 h-3" />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                  <div className="border-t border-border pt-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="w-full h-7 text-xs gap-1.5"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        onStyleUpdate({ textAlign: undefined, bgColor: undefined, textColor: undefined, textSize: undefined, bold: undefined, italic: undefined, strikethrough: undefined, underline: undefined, uppercase: undefined, lineHeight: undefined, fontFamily: undefined, borderStyle: undefined, borderRadius: undefined });
                      }}
                    >
                      <Eraser className="w-3.5 h-3.5" />Сбросить стиль
                    </Button>
                  </div>
                </div>
              </PopoverContent>
            </Popover>
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
