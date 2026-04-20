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
  const [actionsMenuOpen, setActionsMenuOpen] = useState(false);
  const [actionsQuery, setActionsQuery] = useState("");
  const [styleDialogOpen, setStyleDialogOpen] = useState(false);
  const [convertOpen, setConvertOpen] = useState(false);
  const [presetsOpen, setPresetsOpen] = useState(false);

  const baseActions = [
    { key: 'up', label: 'Вверх', icon: ArrowUp, onClick: () => onMoveUp?.(), disabled: !onMoveUp },
    { key: 'down', label: 'Вниз', icon: ArrowDown, onClick: () => onMoveDown?.(), disabled: !onMoveDown },
    ...(canConvert ? [{ key: 'convert', label: 'Преобразовать в…', icon: Wand2, onClick: () => setConvertOpen(true), disabled: false }] : []),
    ...(canStyle ? [{ key: 'style', label: 'Стиль блока…', icon: Pencil, onClick: () => setStyleDialogOpen(true), disabled: false }] : []),
    ...(canStyle ? [{ key: 'presets', label: 'Пресеты стиля', icon: Star, onClick: () => setPresetsOpen(true), disabled: false }] : []),
    ...(canStyle ? [{ key: 'reset', label: 'Сбросить стиль', icon: Eraser, onClick: () => onUpdate({ textAlign: undefined, bgColor: undefined, textColor: undefined, textSize: undefined, bold: undefined, italic: undefined, strikethrough: undefined, underline: undefined, uppercase: undefined, lineHeight: undefined, fontFamily: undefined, borderStyle: undefined, borderRadius: undefined }), disabled: false }] : []),
    { key: 'delete', label: 'Удалить', icon: Trash2, onClick: () => onDelete(), disabled: false, danger: true },
  ];
  const filteredActions = baseActions.filter(a => a.label.toLowerCase().includes(actionsQuery.toLowerCase()));

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
    <div ref={setNodeRef} style={style} data-block-id={block.id} className={cn("group relative rounded-lg transition-all pl-14 pr-14", isFocused && "bg-secondary/30")} onClick={onFocus}>
      {/* Left gutter: "+" add-block button, vertically aligned with floating formatting toolbar */}
      <div className="absolute left-2 top-1 opacity-0 group-hover:opacity-100 transition-opacity z-20">
        <InlineAddBlockButton onAdd={(type) => onAddAfter(type)} />
      </div>
      <div className="min-w-0">
        <BlockContent block={block} onUpdate={onUpdate} courseTitle={courseTitle} lessonTitle={lessonTitle} existingContent={existingContent} organizationId={organizationId} courseId={courseId} lessonId={lessonId} />
      </div>
      {/* Right gutter: drag handle + "..." actions menu */}
      <div className="absolute right-2 top-1 opacity-0 group-hover:opacity-100 transition-opacity z-20 flex items-center gap-1">
        <button
          {...attributes}
          {...listeners}
          className="cursor-grab active:cursor-grabbing w-7 h-9 rounded-md flex items-center justify-center text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors touch-none"
          title="Перетащить"
          onClick={(e) => e.stopPropagation()}
        >
          <GripVertical className="w-4 h-4" />
        </button>
        <Popover open={actionsMenuOpen} onOpenChange={(o) => { setActionsMenuOpen(o); if (!o) setActionsQuery(""); }}>
          <PopoverTrigger asChild>
            <button
              className="w-9 h-9 rounded-full bg-muted/60 hover:bg-primary/15 text-muted-foreground hover:text-primary flex items-center justify-center transition-colors"
              title="Действия с блоком"
              onClick={(e) => e.stopPropagation()}
            >
              <MoreHorizontal className="w-4 h-4" />
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-60 p-2" align="end" onOpenAutoFocus={(e) => e.preventDefault()}>
            <div className="relative mb-1.5">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <Input
                value={actionsQuery}
                onChange={(e) => setActionsQuery(e.target.value)}
                placeholder="Поиск"
                className="h-8 pl-7 text-sm"
                autoFocus
              />
            </div>
            <div className="flex flex-col">
              {filteredActions.map((a) => (
                <button
                  key={a.key}
                  disabled={a.disabled}
                  onClick={() => { a.onClick(); if (a.key !== 'convert' && a.key !== 'style' && a.key !== 'presets') setActionsMenuOpen(false); }}
                  className={cn(
                    "flex items-center gap-2 px-2 py-1.5 rounded-md text-sm text-left transition-colors",
                    "hover:bg-accent disabled:opacity-40 disabled:pointer-events-none",
                    (a as any).danger && "text-destructive hover:bg-destructive/10"
                  )}
                >
                  <a.icon className="w-4 h-4 shrink-0" />
                  <span className="flex-1 truncate">{a.label}</span>
                  {(a.key === 'convert' || a.key === 'presets') && <ChevronRight className="w-3.5 h-3.5 opacity-60" />}
                </button>
              ))}
              {filteredActions.length === 0 && (
                <p className="text-xs text-muted-foreground text-center py-3">Ничего не найдено</p>
              )}
            </div>
          </PopoverContent>
        </Popover>
      </div>

      {/* Convert dialog */}
      {canConvert && (
        <Dialog open={convertOpen} onOpenChange={setConvertOpen}>
          <DialogContent className="sm:max-w-sm">
            <DialogHeader><DialogTitle className="text-sm flex items-center gap-2"><Wand2 className="w-4 h-4" />Преобразовать в…</DialogTitle></DialogHeader>
            <div className="space-y-1 max-h-[60vh] overflow-y-auto">
              {wrapOtherTargets.filter(t => t.type !== block.type).map((t) => (
                <button key={t.type} onClick={() => { handleConvert(t.type); setConvertOpen(false); setActionsMenuOpen(false); }} className="w-full flex items-center gap-2 px-2 py-2 rounded-md hover:bg-accent text-sm text-left">
                  <t.icon className={cn("w-4 h-4", t.color)} />{t.label}
                </button>
              ))}
              <div className="border-t my-1" />
              <p className="text-xs font-medium text-muted-foreground px-2 py-1">Выделение</p>
              {wrapCalloutTargets.filter(t => t.type !== block.type).map((t) => (
                <button key={t.type} onClick={() => { handleConvert(t.type); setConvertOpen(false); setActionsMenuOpen(false); }} className="w-full flex items-center gap-2 px-2 py-2 rounded-md hover:bg-accent text-sm text-left">
                  <t.icon className={cn("w-4 h-4", t.color)} />{t.label}
                </button>
              ))}
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* Block style dialog */}
      {canStyle && (
        <Dialog open={styleDialogOpen} onOpenChange={setStyleDialogOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader><DialogTitle className="text-sm flex items-center gap-2"><Pencil className="w-4 h-4" />Стиль блока</DialogTitle></DialogHeader>
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
          </DialogContent>
        </Dialog>
      )}

      {/* Style presets dialog */}
      {canStyle && (
        <Dialog open={presetsOpen} onOpenChange={setPresetsOpen}>
          <DialogContent className="sm:max-w-sm">
            <DialogHeader><DialogTitle className="text-sm flex items-center gap-2"><Star className="w-4 h-4" />Пресеты стиля</DialogTitle></DialogHeader>
            <div className="space-y-1">
              <button
                onClick={() => { const s = extractStyle(block); const name = describeStyle(s); const np = [...presets, { name, style: s }]; onPresetsChange(np); import("sonner").then(({ toast }) => toast.success(`Пресет сохранён: ${name}`)); }}
                className="w-full flex items-center gap-2 px-2 py-2 rounded-md hover:bg-accent text-sm text-left"
              >
                <Star className="w-4 h-4 text-yellow-500" />Сохранить текущий стиль
              </button>
              {presets.length > 0 && <div className="border-t my-1" />}
              {presets.map((p, i) => (
                <div key={i} className="flex items-center justify-between gap-2 px-2 py-1.5 rounded-md hover:bg-accent group/preset">
                  <button className="flex-1 truncate text-sm text-left" onClick={() => { const applied = { ...p.style, textSize: p.style.textSize === 'base' ? undefined : p.style.textSize, lineHeight: p.style.lineHeight === 'normal' ? undefined : p.style.lineHeight }; onUpdate(applied); setPresetsOpen(false); setActionsMenuOpen(false); }}>
                    {p.name}
                  </button>
                  <button className="opacity-0 group-hover/preset:opacity-100 h-5 w-5 flex items-center justify-center hover:bg-destructive/20 rounded transition-all" onClick={(e) => { e.stopPropagation(); onPresetsChange(presets.filter((_, j) => j !== i)); }}>
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
              {presets.length === 0 && <p className="text-xs text-muted-foreground text-center py-2">Пока нет сохранённых пресетов</p>}
            </div>
          </DialogContent>
        </Dialog>
      )}
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
