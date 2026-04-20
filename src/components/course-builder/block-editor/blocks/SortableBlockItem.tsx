import { useState, useRef } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator,
  DropdownMenuTrigger, DropdownMenuSub, DropdownMenuSubTrigger, DropdownMenuSubContent,
  DropdownMenuPortal } from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  GripVertical, Trash2, Wand2, Pencil, AlignLeft, AlignCenter, AlignRight,
  Bold, Italic, Strikethrough, Underline, CaseSensitive, Star, X, Eraser,
  Highlighter, Plus, Link2, Headphones, Volume2, MoreHorizontal, ArrowUp, ArrowDown, Search, ChevronRight } from "lucide-react";
import { SALUTE_VOICES } from "@/components/student/TTSSettingsDialog";
import type { BlockType, ContentBlock, StylePreset } from "../types";
import {
  convertibleTypes, textStyleableTypes, bgColorPresets, bgColorDotStyles,
  textColorPresets, quickStyles, wrapCalloutTargets, wrapOtherTargets,
  blockCategories, calloutItems } from "../types";
import { extractStyle, describeStyle } from "../utils";
import { BlockContent } from "./BlockContent";
import { BlockCategoryGrid, InlineAddBlockButton } from "./AddBlockButton";
import { SigmaSpinner } from "@/components/ui/SigmaSpinner";

interface SortableBlockItemProps {
  block: ContentBlock;
  isFocused: boolean;
  onFocus: () => void;
  onUpdate: (updates: Partial<ContentBlock>) => void;
  onDelete: () => void;
  onAddAfter: (type: BlockType) => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  courseTitle?: string;
  lessonTitle?: string;
  organizationId?: string;
  courseId?: string;
  lessonId?: string;
  existingContent?: string;
  presets: { name: string; style: StylePreset }[];
  onPresetsChange: (presets: { name: string; style: StylePreset }[]) => void;
}

export function SortableBlockItem({ block, isFocused, onFocus, onUpdate, onDelete, onAddAfter, onMoveUp, onMoveDown, courseTitle, lessonTitle, organizationId, courseId, lessonId, existingContent, presets, onPresetsChange }: SortableBlockItemProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: block.id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1, zIndex: isDragging ? 1000 : 'auto' as any };
  const canConvert = convertibleTypes.includes(block.type);
  const canStyle = textStyleableTypes.includes(block.type);

  const [ttsVoiceDialogOpen, setTtsVoiceDialogOpen] = useState(false);
  const [ttsVoice, setTtsVoice] = useState(() => localStorage.getItem('block-editor-tts-voice') || 'Natalya_24000');
  const [ttsGenerating, setTtsGenerating] = useState(false);
  const [linkPopoverOpen, setLinkPopoverOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");
  const [linkText, setLinkText] = useState("");
  const [linkHasSelection, setLinkHasSelection] = useState(false);
  const savedLinkRange = useRef<Range | null>(null);

  const handleTtsGenerate = async () => {
    const plainText = (block.content || "").replace(/<[^>]+>/g, "").trim();
    if (!plainText) { const { toast } = await import("sonner"); toast.error("Нет текста для озвучивания"); return; }
    setTtsGenerating(true);
    localStorage.setItem('block-editor-tts-voice', ttsVoice);
    const { toast } = await import("sonner");
    toast.info("Генерация аудио из текста... Длинные тексты могут занять до 2 минут.");
    try {
      const ttsController = new AbortController();
      const ttsTimeout = setTimeout(() => ttsController.abort(), 180000);
      const voiceName = ttsVoice.replace(/_\d+$/, '').toLowerCase();
      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/salutespeech-tts`, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY, Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}` },
        body: JSON.stringify({ text: plainText, voice: voiceName }),
        signal: ttsController.signal });
      clearTimeout(ttsTimeout);
      if (!response.ok) { const errData = await response.json().catch(() => null); throw new Error(errData?.error || `Ошибка: ${response.status}`); }
      const audioBlob = await response.blob();
      const { supabase } = await import("@/integrations/supabase/client");
      const fileName = `tts_${crypto.randomUUID()}.mp3`;
      const { error } = await supabase.storage.from("course-files").upload(fileName, audioBlob, { contentType: "audio/mpeg", upsert: true });
      if (error) throw error;
      const audioUrl = `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/public/course-files/${fileName}`;
      onUpdate({ type: "audio", audioUrl });
      toast.success("Аудио сгенерировано!");
      setTtsVoiceDialogOpen(false);
    } catch (e: any) {
      console.error("TTS convert error:", e);
      toast.error(e.message || "Ошибка генерации аудио");
    } finally { setTtsGenerating(false); }
  };

  const handleConvert = async (newType: BlockType) => {
    if (newType === "audio") { setTtsVoiceDialogOpen(true); return; }
    const updates: Partial<ContentBlock> = { type: newType };
    if (newType === "accordion" && !block.accordionTitle) { updates.accordionTitle = "Заголовок секции"; updates.accordionOpen = true; }
    onUpdate(updates);
  };

  return (
    <div ref={setNodeRef} style={style} data-block-id={block.id} className={cn("group relative rounded-lg transition-all pl-14", isFocused && "bg-secondary/30")} onClick={onFocus}>
      {/* Left gutter: "+" add-block button, vertically aligned with floating formatting toolbar */}
      <div className="absolute left-2 top-1 opacity-0 group-hover:opacity-100 transition-opacity z-20">
        <InlineAddBlockButton onAdd={(type) => onAddAfter(type)} />
      </div>
      <div className="min-w-0">
        <BlockContent block={block} onUpdate={onUpdate} courseTitle={courseTitle} lessonTitle={lessonTitle} existingContent={existingContent} organizationId={organizationId} courseId={courseId} lessonId={lessonId} />
      </div>
      <div className="flex items-center justify-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity py-1">
        <div className="flex items-center gap-0.5 bg-foreground/80 backdrop-blur-sm text-background rounded-full px-2 py-1 shadow-lg">
          <div {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing hover:bg-white/20 rounded-full h-8 w-8 flex items-center justify-center touch-none transition-colors">
            <GripVertical className="w-4 h-4" />
          </div>
          {canConvert && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="h-8 w-8 flex items-center justify-center hover:bg-white/20 rounded-full transition-colors" title="Обернуть / Преобразовать"><Wand2 className="w-4 h-4" /></button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="center" className="w-52">
                {wrapOtherTargets.filter(t => t.type !== block.type).map((t) => (
                  <DropdownMenuItem key={t.type} onClick={() => handleConvert(t.type)}><t.icon className={cn("w-4 h-4 mr-2", t.color)} />{t.label}</DropdownMenuItem>
                ))}
                <DropdownMenuSeparator />
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger><Highlighter className="w-4 h-4 mr-2 text-yellow-500" />Выделение</DropdownMenuSubTrigger>
                  <DropdownMenuPortal>
                    <DropdownMenuSubContent className="w-48">
                      {wrapCalloutTargets.filter(t => t.type !== block.type).map((t) => (
                        <DropdownMenuItem key={t.type} onClick={() => handleConvert(t.type)}><t.icon className={cn("w-4 h-4 mr-2", t.color)} />{t.label}</DropdownMenuItem>
                      ))}
                    </DropdownMenuSubContent>
                  </DropdownMenuPortal>
                </DropdownMenuSub>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          {canStyle && (
            <Popover>
              <PopoverTrigger asChild>
                <button className="h-8 w-8 flex items-center justify-center hover:bg-white/20 rounded-full transition-colors" title="Стиль блока"><Pencil className="w-4 h-4" /></button>
              </PopoverTrigger>
              <PopoverContent className="w-72 p-3" align="center">
                <Tabs defaultValue="style">
                  <TabsList className="w-full h-8 p-0.5">
                    <TabsTrigger value="style" className="text-xs px-2 py-1 h-7">Стиль</TabsTrigger>
                    <TabsTrigger value="font" className="text-xs px-2 py-1 h-7">Шрифт</TabsTrigger>
                    <TabsTrigger value="border" className="text-xs px-2 py-1 h-7">Рамка</TabsTrigger>
                    <TabsTrigger value="presets" className="text-xs px-2 py-1 h-7">Шаблоны</TabsTrigger>
                  </TabsList>
                  <TabsContent value="style" className="mt-2 space-y-3">
                    <div>
                      <p className="text-xs font-medium text-muted-foreground mb-1.5">Выравнивание</p>
                      <div className="flex gap-1">
                        <Button variant={(!block.textAlign || block.textAlign === 'left') ? "default" : "outline"} size="icon" className="h-7 w-7" onClick={() => onUpdate({ textAlign: undefined })}><AlignLeft className="w-3.5 h-3.5" /></Button>
                        <Button variant={block.textAlign === 'center' ? "default" : "outline"} size="icon" className="h-7 w-7" onClick={() => onUpdate({ textAlign: 'center' })}><AlignCenter className="w-3.5 h-3.5" /></Button>
                        <Button variant={block.textAlign === 'right' ? "default" : "outline"} size="icon" className="h-7 w-7" onClick={() => onUpdate({ textAlign: 'right' })}><AlignRight className="w-3.5 h-3.5" /></Button>
                      </div>
                    </div>
                    <div>
                      <p className="text-xs font-medium text-muted-foreground mb-1.5">Форматирование</p>
                      <div className="flex gap-1">
                        <Button variant={block.bold ? "default" : "outline"} size="icon" className="h-7 w-7" onClick={() => onUpdate({ bold: !block.bold })} title="Жирный"><Bold className="w-3.5 h-3.5" /></Button>
                        <Button variant={block.italic ? "default" : "outline"} size="icon" className="h-7 w-7" onClick={() => onUpdate({ italic: !block.italic })} title="Курсив"><Italic className="w-3.5 h-3.5" /></Button>
                        <Button variant={block.strikethrough ? "default" : "outline"} size="icon" className="h-7 w-7" onClick={() => onUpdate({ strikethrough: !block.strikethrough })} title="Зачёркнутый"><Strikethrough className="w-3.5 h-3.5" /></Button>
                        <Button variant={block.underline ? "default" : "outline"} size="icon" className="h-7 w-7" onClick={() => onUpdate({ underline: !block.underline })} title="Подчёркнутый"><Underline className="w-3.5 h-3.5" /></Button>
                        <Button variant={block.uppercase ? "default" : "outline"} size="icon" className="h-7 w-7" onClick={() => onUpdate({ uppercase: !block.uppercase })} title="UPPERCASE"><CaseSensitive className="w-3.5 h-3.5" /></Button>
                      </div>
                    </div>
                    <div>
                      <p className="text-xs font-medium text-muted-foreground mb-1.5">Цвет текста</p>
                      <div className="flex gap-1.5">
                        {textColorPresets.map((preset) => <button key={preset.value} onClick={() => onUpdate({ textColor: preset.value || undefined })} className={cn("w-6 h-6 rounded-full transition-all", preset.dot, (block.textColor || "") === preset.value && "ring-2 ring-primary ring-offset-1")} title={preset.label} />)}
                      </div>
                    </div>
                    <div>
                      <p className="text-xs font-medium text-muted-foreground mb-1.5">Фон блока</p>
                      <div className="flex gap-1.5">
                        {bgColorPresets.map((preset) => <button key={preset.value} onClick={() => onUpdate({ bgColor: preset.value || undefined })} className={cn("w-6 h-6 rounded-full transition-all", bgColorDotStyles[preset.value], (block.bgColor || "") === preset.value && "ring-2 ring-primary ring-offset-1")} title={preset.label} />)}
                      </div>
                    </div>
                  </TabsContent>
                  <TabsContent value="font" className="mt-2 space-y-3">
                    <div>
                      <p className="text-xs font-medium text-muted-foreground mb-1.5">Шрифт</p>
                      <div className="flex gap-1">
                        {([['sans', 'Обычный'], ['mono', 'Моно']] as const).map(([ff, label]) => <Button key={ff} variant={(block.fontFamily || 'sans') === ff ? "default" : "outline"} size="sm" className="h-7 px-2.5 text-xs" onClick={() => onUpdate({ fontFamily: ff === 'sans' ? undefined : ff })}>{label}</Button>)}
                      </div>
                    </div>
                    <div>
                      <p className="text-xs font-medium text-muted-foreground mb-1.5">Размер текста</p>
                      <div className="flex gap-1">
                        {([['sm', 'A-'], ['base', 'A'], ['lg', 'A+']] as const).map(([size, label]) => <Button key={size} variant={(block.textSize || 'base') === size ? "default" : "outline"} size="sm" className="h-7 px-2.5 text-xs" onClick={() => onUpdate({ textSize: size === 'base' ? undefined : size })}>{label}</Button>)}
                      </div>
                    </div>
                    <div>
                      <p className="text-xs font-medium text-muted-foreground mb-1.5">Межстрочный интервал</p>
                      <div className="flex gap-1">
                        {([['tight', 'Плотный'], ['normal', 'Обычный'], ['relaxed', 'Свободный']] as const).map(([lh, label]) => <Button key={lh} variant={(block.lineHeight || 'normal') === lh ? "default" : "outline"} size="sm" className="h-7 px-2.5 text-xs" onClick={() => onUpdate({ lineHeight: lh === 'normal' ? undefined : lh })}>{label}</Button>)}
                      </div>
                    </div>
                  </TabsContent>
                  <TabsContent value="border" className="mt-2 space-y-3">
                    <div>
                      <p className="text-xs font-medium text-muted-foreground mb-1.5">Рамка</p>
                      <div className="flex gap-1">
                        {([['none', 'Нет'], ['thin', 'Тонкая'], ['bold', 'Жирная'], ['dashed', 'Пунктир']] as const).map(([bs, label]) => <Button key={bs} variant={(block.borderStyle || 'none') === bs ? "default" : "outline"} size="sm" className="h-7 px-2.5 text-xs" onClick={() => onUpdate({ borderStyle: bs === 'none' ? undefined : bs })}>{label}</Button>)}
                      </div>
                    </div>
                    <div>
                      <p className="text-xs font-medium text-muted-foreground mb-1.5">Скругление</p>
                      <div className="flex gap-1">
                        {([['none', '⬜'], ['md', '◻️'], ['xl', '⭕']] as const).map(([br, label]) => <Button key={br} variant={(block.borderRadius || 'none') === br ? "default" : "outline"} size="sm" className="h-7 px-2.5 text-xs" onClick={() => onUpdate({ borderRadius: br === 'none' ? undefined : br })}>{label}</Button>)}
                      </div>
                    </div>
                  </TabsContent>
                  <TabsContent value="presets" className="mt-2 space-y-3">
                    <div>
                      <p className="text-xs font-medium text-muted-foreground mb-1.5">Готовые стили</p>
                      <div className="grid grid-cols-3 gap-1">
                        {quickStyles.map((qs) => <button key={qs.name} onClick={() => onUpdate(qs.style)} className="flex flex-col items-center gap-0.5 p-1.5 rounded-md border border-border hover:border-primary/50 hover:bg-primary/5 transition-all text-xs"><span>{qs.icon}</span><span className="truncate w-full text-center">{qs.name}</span></button>)}
                      </div>
                    </div>
                  </TabsContent>
                </Tabs>
              </PopoverContent>
            </Popover>
          )}
          {canStyle && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className={cn("h-8 w-8 flex items-center justify-center hover:bg-white/20 rounded-full transition-colors", presets.length > 0 && "text-yellow-400")} title="Пресеты стиля"><Star className="w-4 h-4" /></button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="center" className="w-56">
                <DropdownMenuItem onClick={() => { const s = extractStyle(block); const name = describeStyle(s); const np = [...presets, { name, style: s }]; onPresetsChange(np); import("sonner").then(({ toast }) => toast.success(`Пресет сохранён: ${name}`)); }}>
                  <Star className="w-4 h-4 mr-2 text-yellow-500" />Сохранить текущий стиль
                </DropdownMenuItem>
                {presets.length > 0 && <DropdownMenuSeparator />}
                {presets.map((p, i) => (
                  <DropdownMenuItem key={i} className="flex items-center justify-between group/preset" onClick={() => { const applied = { ...p.style, textSize: p.style.textSize === 'base' ? undefined : p.style.textSize, lineHeight: p.style.lineHeight === 'normal' ? undefined : p.style.lineHeight }; onUpdate(applied); }}>
                    <span className="flex-1 truncate text-xs">{p.name}</span>
                    <button className="ml-2 opacity-0 group-hover/preset:opacity-100 h-5 w-5 flex items-center justify-center hover:bg-destructive/20 rounded transition-all" onClick={(e) => { e.preventDefault(); e.stopPropagation(); onPresetsChange(presets.filter((_, j) => j !== i)); }}>
                      <X className="w-3 h-3" />
                    </button>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          {canStyle && <button className="h-8 w-8 flex items-center justify-center hover:bg-white/20 rounded-full transition-colors" title="Сбросить стиль" onClick={() => onUpdate({ textAlign: undefined, bgColor: undefined, textColor: undefined, textSize: undefined, bold: undefined, italic: undefined, strikethrough: undefined, underline: undefined, uppercase: undefined, lineHeight: undefined, fontFamily: undefined, borderStyle: undefined, borderRadius: undefined })}><Eraser className="w-4 h-4" /></button>}
          {canStyle && (
            <>
              <button className="h-8 w-8 flex items-center justify-center hover:bg-white/20 rounded-full transition-colors" title="Вставить ссылку" onMouseDown={(e) => {
                e.preventDefault(); e.stopPropagation();
                const sel = window.getSelection();
                const hasSelection = !!(sel && !sel.isCollapsed && sel.rangeCount > 0);
                if (hasSelection) savedLinkRange.current = sel!.getRangeAt(0).cloneRange();
                else savedLinkRange.current = null;
                setLinkHasSelection(hasSelection); setLinkUrl(""); setLinkText(""); setLinkPopoverOpen(true);
              }}><Link2 className="w-4 h-4" /></button>
              <Dialog open={linkPopoverOpen} onOpenChange={(open) => { if (!open) { setLinkPopoverOpen(false); setLinkUrl(""); setLinkText(""); savedLinkRange.current = null; } }}>
                <DialogContent className="sm:max-w-sm" onOpenAutoFocus={(e) => e.preventDefault()}>
                  <DialogHeader><DialogTitle className="text-sm">{linkHasSelection ? "Обернуть выделенный текст в ссылку" : "Вставить ссылку"}</DialogTitle></DialogHeader>
                  <div className="space-y-2">
                    {!linkHasSelection && <Input placeholder="Текст ссылки" value={linkText} onChange={(e) => setLinkText(e.target.value)} className="h-8 text-sm" autoFocus />}
                    <Input placeholder="https://example.com" value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} className="h-8 text-sm" autoFocus={linkHasSelection} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); (e.currentTarget.closest('[role="dialog"]')?.querySelector('[data-link-apply]') as HTMLButtonElement)?.click(); } }} />
                    <Button size="sm" className="w-full h-8 text-xs" data-link-apply disabled={!linkUrl.trim()} onClick={() => {
                      const url = linkUrl.trim(); if (!url) return;
                      const blockId = block.id; const hadSelection = linkHasSelection; const rangeClone = savedLinkRange.current?.cloneRange() || null; const text = linkText.trim() || url;
                      setLinkPopoverOpen(false); setLinkUrl(""); setLinkText(""); savedLinkRange.current = null;
                      setTimeout(() => {
                        const blockEl = document.querySelector(`[data-block-id="${blockId}"] [contenteditable]`) as HTMLElement;
                        if (!blockEl) return; blockEl.focus();
                        if (hadSelection && rangeClone) {
                          const anchor = document.createElement('a'); anchor.href = url; anchor.target = '_blank'; anchor.rel = 'noopener noreferrer';
                          try { rangeClone.surroundContents(anchor); } catch { const fragment = rangeClone.extractContents(); anchor.appendChild(fragment); rangeClone.insertNode(anchor); }
                        } else {
                          const anchor = document.createElement('a'); anchor.href = url; anchor.target = '_blank'; anchor.rel = 'noopener noreferrer'; anchor.textContent = text;
                          const range = document.createRange(); range.selectNodeContents(blockEl); range.collapse(false); range.insertNode(anchor);
                          const space = document.createTextNode('\u00A0'); anchor.after(space);
                        }
                        blockEl.dispatchEvent(new Event('input', { bubbles: true }));
                      }, 150);
                    }}>{linkHasSelection ? "Применить" : "Вставить ссылку"}</Button>
                  </div>
                </DialogContent>
              </Dialog>
            </>
          )}
          <button className="h-8 w-8 flex items-center justify-center hover:bg-red-500/30 rounded-full transition-colors" onClick={(e) => { e.stopPropagation(); onDelete(); }} title="Удалить блок"><Trash2 className="w-4 h-4" /></button>
        </div>
      </div>
      <Dialog open={ttsVoiceDialogOpen} onOpenChange={setTtsVoiceDialogOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><Headphones className="w-5 h-5" />Выбор голоса для озвучивания</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Голос SaluteSpeech</Label>
              <Select value={ttsVoice} onValueChange={setTtsVoice}>
                <SelectTrigger><SelectValue placeholder="Выберите голос" /></SelectTrigger>
                <SelectContent>
                  {SALUTE_VOICES.map((voice) => <SelectItem key={voice.id} value={voice.id}><div className="flex items-center gap-2"><Volume2 className="w-3.5 h-3.5 text-muted-foreground" />{voice.name}</div></SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <Button onClick={handleTtsGenerate} disabled={ttsGenerating} className="w-full gap-2">
              {ttsGenerating ? <SigmaSpinner size="sm" /> : <Headphones className="w-4 h-4" />}
              {ttsGenerating ? "Генерация..." : "Озвучить текст"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
