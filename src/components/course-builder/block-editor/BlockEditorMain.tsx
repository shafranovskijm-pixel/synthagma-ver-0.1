import { useState, useCallback, useEffect, useRef } from "react";
import DOMPurify from "dompurify";
import { Link2 } from "lucide-react";
import { checkAiLimitGlobal, incrementAiLimitGlobal } from "@/hooks/useAiGenerationLimit";
import { safeInvoke } from "@/utils/safeInvoke";
import { LazyMediaPreview } from "@/components/course-builder/LazyMediaPreview";
import {
  Plus, GripVertical, Trash2, Type, Heading1, Heading2, List, ListOrdered, Quote,
  AlertCircle, Lightbulb, HelpCircle, ChevronDown, ChevronRight, ChevronLeft,
  BookOpen, Image as ImageIcon, Video, Upload, Presentation, Headphones, Loader2,
  Sparkles, Wand2, Info, AlertTriangle, Pencil, AlignLeft, AlignCenter, AlignRight,
  Bold, Italic, Minus, Strikethrough, Underline, CaseSensitive, Star, Check, X,
  Eraser, CheckCircle, XCircle, Highlighter, Square, RectangleHorizontal,
  Undo2, Redo2, FolderOpen, Play,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { RichTextEditor } from "../RichTextEditor";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator,
  DropdownMenuTrigger, DropdownMenuSub, DropdownMenuSubTrigger, DropdownMenuSubContent,
  DropdownMenuPortal,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { MediaLibraryDialog } from "../MediaLibraryDialog";
import {
  DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { SALUTE_VOICES } from "@/components/student/TTSSettingsDialog";
import { Volume2 } from "lucide-react";

import type { BlockType, ContentBlock, SliderSlide, StylePreset, BlockEditorProps } from "./types";
import {
  createBlock, calloutItems, blockCategories, convertibleTypes, textStyleableTypes,
  bgColorPresets, bgColorDotStyles, textColorPresets, quickStyles,
  wrapCalloutTargets, wrapOtherTargets,
} from "./types";
import {
  renderHtml, summarizeExistingContent, loadPresets, savePresets, extractStyle, describeStyle,
} from "./utils";
import { BlockRenderer } from "./BlockRenderer";

// ─── DirectVideoBlock (edit-mode) ───────────────────────────────────────────
function DirectVideoBlockInner({ url }: { url: string }) {
  const [error, setError] = useState(false);
  if (error) {
    return (
      <div className="aspect-video not-prose rounded-lg bg-muted flex flex-col items-center justify-center gap-3">
        <Video className="w-12 h-12 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">Браузер не может воспроизвести это видео</p>
        <a href={url} target="_blank" rel="noopener noreferrer"
          className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors">
          <Play className="w-4 h-4" /> Открыть видео
        </a>
      </div>
    );
  }
  return (
    <div className="aspect-video not-prose">
      <video src={url} controls preload="none" className="w-full h-full rounded-lg bg-black" controlsList="nodownload"
        onError={() => setError(true)} />
    </div>
  );
}

function DirectVideoBlock({ url, lazy = true }: { url: string; lazy?: boolean }) {
  if (!lazy) return <DirectVideoBlockInner url={url} />;
  return (
    <LazyMediaPreview type="video">
      <DirectVideoBlockInner url={url} />
    </LazyMediaPreview>
  );
}

// ─── BlockCategoryGrid ──────────────────────────────────────────────────────
function BlockCategoryGrid({ items, onSelect, calloutItems: cItems, calloutLabel }: { items: { type: BlockType; icon: any; label: string; color?: string }[]; onSelect: (type: BlockType) => void; calloutItems?: typeof calloutItems; calloutLabel?: string }) {
  const [showCallouts, setShowCallouts] = useState(false);
  return (
    <div className="grid grid-cols-2 gap-1">
      {items.map((item) => (
        <button key={item.type} onClick={() => onSelect(item.type)} className="flex items-center gap-2 px-2 py-1.5 rounded-md text-sm hover:bg-accent transition-colors text-left">
          <item.icon className={cn("w-4 h-4 shrink-0", item.color || "text-foreground")} />
          <span className="truncate">{item.label}</span>
        </button>
      ))}
      {cItems && cItems.length > 0 && (
        <>
          <button onClick={() => setShowCallouts(!showCallouts)} className="flex items-center gap-2 px-2 py-1.5 rounded-md text-sm hover:bg-accent transition-colors text-left col-span-2">
            <Highlighter className="w-4 h-4 shrink-0 text-yellow-500" />
            <span className="truncate">{calloutLabel || "Выделение"}</span>
            <ChevronRight className={cn("w-3 h-3 ml-auto transition-transform", showCallouts && "rotate-90")} />
          </button>
          {showCallouts && cItems.map((item) => (
            <button key={item.type} onClick={() => onSelect(item.type)} className="flex items-center gap-2 px-2 py-1.5 rounded-md text-sm hover:bg-accent transition-colors text-left pl-6">
              <item.icon className={cn("w-4 h-4 shrink-0", item.color || "text-foreground")} />
              <span className="truncate">{item.label}</span>
            </button>
          ))}
        </>
      )}
    </div>
  );
}

// ─── AddBlockButton ─────────────────────────────────────────────────────────
function AddBlockButton({ onAdd }: { onAdd: (type: BlockType) => void }) {
  const [open, setOpen] = useState(false);
  const handleSelect = (type: BlockType) => { setOpen(false); onAdd(type); };
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="rounded-lg gap-2"><Plus className="w-4 h-4" />Добавить блок</Button>
      </PopoverTrigger>
      <PopoverContent align="center" className="w-72 p-2">
        <Tabs defaultValue="text">
          <TabsList className="w-full h-8 p-0.5">
            {Object.entries(blockCategories).map(([key, cat]) => (
              <TabsTrigger key={key} value={key} className="text-xs px-2 py-1 h-7">{cat.label}</TabsTrigger>
            ))}
          </TabsList>
          {Object.entries(blockCategories).map(([key, cat]) => (
            <TabsContent key={key} value={key} className="mt-2">
              <BlockCategoryGrid items={cat.items} onSelect={handleSelect} calloutItems={key === "other" ? calloutItems : undefined} />
            </TabsContent>
          ))}
        </Tabs>
      </PopoverContent>
    </Popover>
  );
}

// ─── AIGenerateButton ───────────────────────────────────────────────────────
function AIGenerateButton({ isGenerating, onClick }: { isGenerating: boolean; onClick: () => void }) {
  return (
    <Button variant="outline" size="sm" onClick={onClick} disabled={isGenerating} className="gap-2 text-xs">
      {isGenerating ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
      {isGenerating ? "Генерация..." : "Сгенерировать с ИИ"}
    </Button>
  );
}

// ─── ParagraphBlock ─────────────────────────────────────────────────────────
function ParagraphBlock({ block, onUpdate, courseTitle, lessonTitle, existingContent, editorStyleClasses }: { block: ContentBlock; onUpdate: (updates: Partial<ContentBlock>) => void; courseTitle?: string; lessonTitle?: string; existingContent?: string; editorStyleClasses: string }) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [showPrompt, setShowPrompt] = useState(false);
  const [customPrompt, setCustomPrompt] = useState("");

  const handleGenerate = async (prompt?: string) => {
    if (!(await checkAiLimitGlobal())) return;
    setIsGenerating(true);
    try {
      const { supabase } = await import("@/integrations/supabase/client");
      const { data, error } = await supabase.functions.invoke("generate-course-content", {
        body: { contentType: "paragraph_text", lessonTitle: lessonTitle || "Общая тема", courseTitle: courseTitle || "Курс", existingContent, customPrompt: prompt || "" },
      });
      if (error) throw error;
      if (data?.content) { onUpdate({ content: data.content }); await incrementAiLimitGlobal(); }
      setShowPrompt(false);
      setCustomPrompt("");
    } catch (e) {
      console.error("Paragraph AI error:", e);
      const { toast } = await import("sonner");
      toast.error("Ошибка генерации текста");
    } finally { setIsGenerating(false); }
  };

  return (
    <div className={cn("py-2 min-h-[40px] space-y-2", editorStyleClasses)}>
      {!block.content && !isGenerating && (
        <div className="flex items-center gap-2 justify-end">
          <AIGenerateButton isGenerating={isGenerating} onClick={() => handleGenerate()} />
          <Button variant="ghost" size="sm" onClick={() => setShowPrompt(!showPrompt)} className="gap-1 text-xs h-7">
            <Pencil className="w-3 h-3" />С промптом
          </Button>
        </div>
      )}
      {showPrompt && (
        <div className="flex gap-2 items-end">
          <Textarea value={customPrompt} onChange={(e) => setCustomPrompt(e.target.value)} placeholder="Напишите, о чём сгенерировать текст..." className="text-sm min-h-[60px] resize-none flex-1" />
          <Button size="sm" onClick={() => handleGenerate(customPrompt)} disabled={isGenerating || !customPrompt.trim()} className="gap-1">
            {isGenerating ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}Создать
          </Button>
        </div>
      )}
      {isGenerating && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground py-4 justify-center">
          <Loader2 className="w-4 h-4 animate-spin" />Генерация текста...
        </div>
      )}
      <RichTextEditor value={block.content} onChange={(val) => onUpdate({ content: val })} placeholder="Введите текст..." className={editorStyleClasses} />
    </div>
  );
}

// ─── QuoteBlock ─────────────────────────────────────────────────────────────
function QuoteBlock({ block, onUpdate, courseTitle, lessonTitle, existingContent }: { block: ContentBlock; onUpdate: (updates: Partial<ContentBlock>) => void; courseTitle?: string; lessonTitle?: string; existingContent?: string }) {
  const [isGenerating, setIsGenerating] = useState(false);
  const handleGenerate = async () => {
    if (!(await checkAiLimitGlobal())) return;
    setIsGenerating(true);
    try {
      const { supabase } = await import("@/integrations/supabase/client");
      const { data, error } = await supabase.functions.invoke("generate-course-content", {
        body: { contentType: "quote", lessonTitle: lessonTitle || "Общая тема", courseTitle: courseTitle || "Курс", existingContent },
      });
      if (error) throw error;
      if (data?.content) { onUpdate({ content: data.content }); await incrementAiLimitGlobal(); }
    } catch (e) {
      console.error("Quote AI error:", e);
      const { toast } = await import("sonner");
      toast.error("Ошибка генерации цитаты");
    } finally { setIsGenerating(false); }
  };
  return (
    <div className="border-l-4 border-muted-foreground/30 pl-4 py-2 space-y-2">
      <div className="flex justify-end"><AIGenerateButton isGenerating={isGenerating} onClick={handleGenerate} /></div>
      <RichTextEditor value={block.content} onChange={(val) => onUpdate({ content: val })} placeholder="Введите цитату..." className="italic text-muted-foreground" />
    </div>
  );
}

// ─── CalloutBlock ───────────────────────────────────────────────────────────
function CalloutBlock({ block, onUpdate, courseTitle, lessonTitle, existingContent }: { block: ContentBlock; onUpdate: (updates: Partial<ContentBlock>) => void; courseTitle?: string; lessonTitle?: string; existingContent?: string }) {
  const [isGenerating, setIsGenerating] = useState(false);
  const styles = {
    "callout-info": { bg: "bg-blue-500/10", border: "border-blue-500/30", icon: AlertCircle, iconColor: "text-blue-500" },
    "callout-warning": { bg: "bg-amber-500/10", border: "border-amber-500/30", icon: AlertCircle, iconColor: "text-amber-500" },
    "callout-tip": { bg: "bg-green-500/10", border: "border-green-500/30", icon: Lightbulb, iconColor: "text-green-500" },
    "callout-success": { bg: "bg-emerald-500/10", border: "border-emerald-500/30", icon: CheckCircle, iconColor: "text-emerald-500" },
    "callout-danger": { bg: "bg-red-500/10", border: "border-red-500/30", icon: XCircle, iconColor: "text-red-500" },
  };
  const style = styles[block.type as keyof typeof styles];
  const Icon = style.icon;

  const handleGenerate = async () => {
    if (!(await checkAiLimitGlobal())) return;
    setIsGenerating(true);
    try {
      const { supabase } = await import("@/integrations/supabase/client");
      const { data, error } = await supabase.functions.invoke("generate-course-content", {
        body: { contentType: "callout", calloutType: block.type, lessonTitle: lessonTitle || "Общая тема", courseTitle: courseTitle || "Курс", existingContent },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      if (data?.content) { onUpdate({ content: data.content }); await incrementAiLimitGlobal(); }
      else throw new Error("Пустой ответ от сервера");
    } catch (e: any) {
      console.error("Callout AI error:", e);
      const { toast } = await import("sonner");
      const msg = e?.message || "Неизвестная ошибка";
      toast.error(msg.includes("429") ? "Лимит запросов, попробуйте позже" : `Ошибка генерации: ${msg.slice(0, 100)}`);
    } finally { setIsGenerating(false); }
  };

  return (
    <div className={cn("rounded-xl p-4 border", style.bg, style.border)}>
      <div className="flex items-center justify-between mb-2">
        <Icon className={cn("w-5 h-5 flex-shrink-0", style.iconColor)} />
        <AIGenerateButton isGenerating={isGenerating} onClick={handleGenerate} />
      </div>
      <RichTextEditor value={block.content} onChange={(val) => onUpdate({ content: val })} placeholder="Введите текст..." minHeight="40px" />
    </div>
  );
}

// ─── HighlightBlock ─────────────────────────────────────────────────────────
function HighlightBlock({ block, onUpdate, courseTitle, lessonTitle, existingContent }: { block: ContentBlock; onUpdate: (updates: Partial<ContentBlock>) => void; courseTitle?: string; lessonTitle?: string; existingContent?: string }) {
  const [isGenerating, setIsGenerating] = useState(false);
  const handleGenerate = async () => {
    if (!(await checkAiLimitGlobal())) return;
    setIsGenerating(true);
    try {
      const { supabase } = await import("@/integrations/supabase/client");
      const { data, error } = await supabase.functions.invoke("generate-course-content", {
        body: { contentType: "callout", calloutType: "highlight", lessonTitle: lessonTitle || "Общая тема", courseTitle: courseTitle || "Курс", existingContent },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      if (data?.content) { onUpdate({ content: data.content }); await incrementAiLimitGlobal(); }
      else throw new Error("Пустой ответ от сервера");
    } catch (e: any) {
      console.error("Highlight AI error:", e);
      const { toast } = await import("sonner");
      const msg = e?.message || "Неизвестная ошибка";
      toast.error(msg.includes("429") ? "Лимит запросов, попробуйте позже" : `Ошибка генерации: ${msg.slice(0, 100)}`);
    } finally { setIsGenerating(false); }
  };
  return (
    <div className="rounded-xl p-4 border border-yellow-400/40 bg-gradient-to-r from-yellow-400/10 via-amber-400/5 to-transparent relative overflow-hidden">
      <div className="absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-yellow-400 via-amber-500 to-orange-500" />
      <div className="pl-3">
        <div className="flex items-center justify-between mb-2">
          <Highlighter className="w-5 h-5 text-yellow-500 flex-shrink-0" />
          <AIGenerateButton isGenerating={isGenerating} onClick={handleGenerate} />
        </div>
        <RichTextEditor value={block.content} onChange={(val) => onUpdate({ content: val })} placeholder="Введите текст выделения..." minHeight="40px" />
      </div>
    </div>
  );
}

// ─── AccordionBlock ─────────────────────────────────────────────────────────
function AccordionBlock({ block, onUpdate, courseTitle, lessonTitle, existingContent }: { block: ContentBlock; onUpdate: (updates: Partial<ContentBlock>) => void; courseTitle?: string; lessonTitle?: string; existingContent?: string }) {
  const [isGenerating, setIsGenerating] = useState(false);
  const isOpen = block.accordionOpen ?? true;

  const handleGenerate = async () => {
    if (!(await checkAiLimitGlobal())) return;
    setIsGenerating(true);
    try {
      const { supabase } = await import("@/integrations/supabase/client");
      const { data, error } = await supabase.functions.invoke("generate-course-content", {
        body: { contentType: "accordion", lessonTitle: lessonTitle || "Общая тема", courseTitle: courseTitle || "Курс", existingContent },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      if (data?.accordion) {
        onUpdate({ accordionTitle: data.accordion.title || block.accordionTitle, content: data.accordion.content || "" });
        await incrementAiLimitGlobal();
      } else throw new Error("Пустой ответ от сервера");
    } catch (e: any) {
      console.error("Accordion AI error:", e);
      const { toast } = await import("sonner");
      const msg = e?.message || "Неизвестная ошибка";
      toast.error(msg.includes("429") ? "Лимит запросов, попробуйте позже" : `Ошибка генерации: ${msg.slice(0, 100)}`);
    } finally { setIsGenerating(false); }
  };

  return (
    <div className="rounded-xl border border-purple-500/30 bg-purple-500/5 overflow-hidden">
      <div className="flex items-center gap-2 p-3">
        <button className="flex-shrink-0" onClick={() => onUpdate({ accordionOpen: !isOpen })}>
          {isOpen ? <ChevronDown className="w-4 h-4 text-purple-500" /> : <ChevronRight className="w-4 h-4 text-purple-500" />}
        </button>
        <Input value={block.accordionTitle || ""} onChange={(e) => onUpdate({ accordionTitle: e.target.value })} placeholder="Заголовок секции" className="font-medium border-0 bg-transparent p-0 h-auto focus-visible:ring-0" />
        <AIGenerateButton isGenerating={isGenerating} onClick={handleGenerate} />
      </div>
      {isOpen && (
        <div className="p-3 pt-0 border-t border-purple-500/20">
          <RichTextEditor value={block.content} onChange={(val) => onUpdate({ content: val })} placeholder="Содержимое секции..." minHeight="60px" />
        </div>
      )}
    </div>
  );
}

// ─── QuizBlock ──────────────────────────────────────────────────────────────
function QuizBlock({ block, onUpdate, courseTitle, lessonTitle, existingContent }: { block: ContentBlock; onUpdate: (updates: Partial<ContentBlock>) => void; courseTitle?: string; lessonTitle?: string; existingContent?: string }) {
  const [isGenerating, setIsGenerating] = useState(false);
  const options = block.quizOptions || [{ text: "", isCorrect: true }, { text: "", isCorrect: false }];

  const updateOption = (index: number, updates: Partial<{ text: string; isCorrect: boolean }>) => {
    const newOptions = options.map((o, i) => {
      if (i === index) {
        const updated = { ...o, ...updates };
        if (updates.isCorrect) return { ...updated, isCorrect: true };
        return updated;
      }
      if (updates.isCorrect) return { ...o, isCorrect: false };
      return o;
    });
    onUpdate({ quizOptions: newOptions });
  };

  const addOption = () => onUpdate({ quizOptions: [...options, { text: "", isCorrect: false }] });
  const removeOption = (index: number) => {
    const newOptions = options.filter((_, i) => i !== index);
    if (!newOptions.some(o => o.isCorrect) && newOptions.length > 0) newOptions[0].isCorrect = true;
    onUpdate({ quizOptions: newOptions });
  };

  const handleGenerateWithAI = async () => {
    if (!(await checkAiLimitGlobal())) return;
    setIsGenerating(true);
    try {
      const { supabase } = await import("@/integrations/supabase/client");
      const { data, error } = await supabase.functions.invoke("generate-course-content", {
        body: { contentType: "quiz", lessonTitle: lessonTitle || "Общая тема", courseTitle: courseTitle || "Курс", existingContent },
      });
      if (error) throw error;
      if (data?.quiz) {
        onUpdate({
          quizQuestion: data.quiz.question,
          quizOptions: data.quiz.options.map((o: any, i: number) => ({ text: o, isCorrect: i === data.quiz.correctIndex })),
          quizExplanation: data.quiz.explanation || "",
        });
        await incrementAiLimitGlobal();
      }
    } catch (e) {
      console.error("Quiz AI generation error:", e);
      const { toast } = await import("sonner");
      toast.error("Ошибка генерации квиза");
    } finally { setIsGenerating(false); }
  };

  return (
    <div className="rounded-xl border border-primary/30 bg-primary/5 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-primary"><HelpCircle className="w-5 h-5" /><span className="font-medium">Мини-квиз</span></div>
        <Button variant="outline" size="sm" onClick={handleGenerateWithAI} disabled={isGenerating} className="gap-2 text-xs">
          {isGenerating ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
          {isGenerating ? "Генерация..." : "Сгенерировать с ИИ"}
        </Button>
      </div>
      <Input value={block.quizQuestion || ""} onChange={(e) => onUpdate({ quizQuestion: e.target.value })} placeholder="Введите вопрос..." className="font-medium" />
      <div className="space-y-2">
        {options.map((option, i) => (
          <div key={i} className="flex items-center gap-2">
            <input type="radio" checked={option.isCorrect} onChange={() => updateOption(i, { isCorrect: true })} className="w-4 h-4 text-primary" />
            <Input value={option.text} onChange={(e) => updateOption(i, { text: e.target.value })} placeholder={`Вариант ${i + 1}`} className="flex-1" />
            {options.length > 2 && (
              <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => removeOption(i)}><Trash2 className="w-4 h-4" /></Button>
            )}
          </div>
        ))}
      </div>
      <Button variant="outline" size="sm" onClick={addOption} className="gap-2"><Plus className="w-4 h-4" />Добавить вариант</Button>
      <Textarea value={block.quizExplanation || ""} onChange={(e) => onUpdate({ quizExplanation: e.target.value })} placeholder="Пояснение к правильному ответу (опционально)" className="min-h-[40px] text-sm bg-white/50 dark:bg-black/20" />
    </div>
  );
}

// ─── ImageBlock ─────────────────────────────────────────────────────────────
function ImageBlock({ block, onUpdate }: { block: ContentBlock; onUpdate: (updates: Partial<ContentBlock>) => void }) {
  const [isUploading, setIsUploading] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [aiPrompt, setAiPrompt] = useState("");
  const [editPrompt, setEditPrompt] = useState("");
  const [showAiInput, setShowAiInput] = useState(false);
  const [showEditInput, setShowEditInput] = useState(false);

  const handleFileUpload = async (file: File) => {
    if (!file.type.startsWith("image/")) return;
    if (file.size > 10 * 1024 * 1024) return;
    setIsUploading(true);
    try {
      const { supabase } = await import("@/integrations/supabase/client");
      const fileExt = file.name.split(".").pop()?.toLowerCase() || "png";
      const fileName = `block-images/${block.id}-${Date.now()}.${fileExt}`;
      let externalConfig: { configured: boolean; url: string | null; key: string | null } | null = null;
      try { const { data } = await supabase.functions.invoke('get-external-storage-config'); externalConfig = data; } catch {}
      const useExternal = externalConfig?.configured && externalConfig?.url && externalConfig?.key;
      const bucket = 'course-files';
      const baseUrl = useExternal ? externalConfig!.url : import.meta.env.VITE_SUPABASE_URL;
      const apiKey = useExternal ? externalConfig!.key : import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
      let authToken = apiKey;
      if (!useExternal) {
        const { data: session } = await supabase.auth.getSession();
        authToken = session?.session?.access_token || apiKey;
      }
      let uploadedViaInternal = false;
      const { error } = await supabase.storage.from(bucket).upload(fileName, file, { cacheControl: '3600', upsert: true });
      if (error) {
        const uploadUrl = `${baseUrl}/storage/v1/object/${bucket}/${fileName}`;
        const resp = await fetch(uploadUrl, { method: 'POST', headers: { 'Authorization': `Bearer ${authToken}`, 'apikey': apiKey!, 'x-upsert': 'true' }, body: file });
        if (!resp.ok) throw new Error('Upload failed');
      } else { uploadedViaInternal = true; }
      const actualBaseUrl = uploadedViaInternal ? import.meta.env.VITE_SUPABASE_URL : baseUrl;
      const publicUrl = `${actualBaseUrl}/storage/v1/object/public/${bucket}/${fileName}`;
      onUpdate({ imageSrc: publicUrl, imageAlt: block.imageAlt || file.name.replace(/\.[^.]+$/, '') });
    } catch (err) {
      console.error("Image upload error:", err);
    } finally { setIsUploading(false); }
  };

  const handleAiGenerate = async () => {
    if (!aiPrompt.trim()) return;
    if (!(await checkAiLimitGlobal())) return;
    setIsGenerating(true);
    try {
      const { data, error } = await safeInvoke<any>("generate-image", { body: { prompt: aiPrompt.trim(), provider: "gigachat", slotIndex: Date.now() } });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      if (!data?.url) throw new Error("Изображение не было сгенерировано");
      onUpdate({ imageSrc: data.url, imageAlt: aiPrompt.trim() });
      await incrementAiLimitGlobal();
      setAiPrompt(""); setShowAiInput(false);
    } catch (err) {
      console.error("AI image generation error:", err);
      const { toast } = await import("sonner");
      const message = err instanceof Error ? err.message : "Ошибка генерации изображения";
      if (message.includes("429")) toast.error("GigaChat перегружен, повторите попытку через 10–20 секунд");
      else if (message.includes("402")) toast.error("Лимит генерации исчерпан, повторите попытку позже");
      else toast.error(message);
    } finally { setIsGenerating(false); }
  };

  const handleAiEdit = async () => {
    if (!editPrompt.trim() || !block.imageSrc) return;
    setIsEditing(true);
    try {
      const { data, error } = await safeInvoke<any>("generate-image", { body: { prompt: editPrompt.trim(), imageUrl: block.imageSrc, provider: "gigachat", slotIndex: Date.now() } });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      if (!data?.url) throw new Error("Изображение не было отредактировано");
      onUpdate({ imageSrc: data.url });
      setEditPrompt(""); setShowEditInput(false);
      const { toast } = await import("sonner");
      toast.success("Изображение отредактировано");
    } catch (err) {
      console.error("AI image edit error:", err);
      const { toast } = await import("sonner");
      const message = err instanceof Error ? err.message : "Ошибка редактирования изображения";
      if (message.includes("429")) toast.error("GigaChat перегружен, повторите попытку через 10–20 секунд");
      else if (message.includes("402")) toast.error("Лимит генерации исчерпан, повторите попытку позже");
      else toast.error(message);
    } finally { setIsEditing(false); }
  };

  return (
    <div className="py-2">
      {block.imageSrc ? (
        <div className="space-y-2">
          <div className="relative group/img">
            <img src={block.imageSrc} alt={block.imageAlt || ""} className="rounded-lg max-w-full h-auto max-h-[400px] object-contain" />
            <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover/img:opacity-100 transition-opacity">
              <Button variant="secondary" size="sm" onClick={() => setShowEditInput(!showEditInput)} className={showEditInput ? "border-primary" : ""} disabled={isEditing}>
                <Wand2 className="w-3.5 h-3.5 mr-1" />Редактировать ИИ
              </Button>
              <Button variant="secondary" size="sm" onClick={() => onUpdate({ imageSrc: "", imageAlt: "" })}>Удалить</Button>
            </div>
          </div>
          {showEditInput && (
            <div className="flex gap-2">
              <Input value={editPrompt} onChange={(e) => setEditPrompt(e.target.value)} placeholder="Опишите что исправить..." className="text-sm flex-1" onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleAiEdit(); } }} disabled={isEditing} />
              <Button size="sm" disabled={!editPrompt.trim() || isEditing} onClick={handleAiEdit}>
                {isEditing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />}
              </Button>
            </div>
          )}
          <Input value={block.imageAlt || ""} onChange={(e) => onUpdate({ imageAlt: e.target.value })} placeholder="Подпись к изображению..." className="text-sm border-0 bg-secondary/30 focus-visible:ring-1 rounded-lg" />
        </div>
      ) : (
        <div className="bg-muted rounded-xl p-6 space-y-4">
          <div className="text-center">
            <ImageIcon className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
            <p className="text-sm text-muted-foreground mb-3">Загрузите изображение или вставьте ссылку</p>
            <div className="flex gap-2 justify-center">
              <Button variant="outline" size="sm" disabled={isUploading || isGenerating} onClick={() => { const input = document.createElement('input'); input.type = 'file'; input.accept = 'image/*'; input.onchange = (e) => { const f = (e.target as HTMLInputElement).files?.[0]; if (f) handleFileUpload(f); }; input.click(); }}>
                {isUploading ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Upload className="w-4 h-4 mr-1" />}
                {isUploading ? "Загрузка..." : "Загрузить файл"}
              </Button>
              <Button variant="outline" size="sm" disabled={isUploading || isGenerating} onClick={() => setShowAiInput(!showAiInput)} className={showAiInput ? "border-primary text-primary" : ""}>
                <Sparkles className="w-4 h-4 mr-1" />ИИ генерация
              </Button>
            </div>
          </div>
          {showAiInput && (
            <div className="space-y-2">
              <Input value={aiPrompt} onChange={(e) => setAiPrompt(e.target.value)} placeholder="Опишите изображение..." className="text-sm" onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleAiGenerate(); } }} disabled={isGenerating} />
              <Button size="sm" disabled={!aiPrompt.trim() || isGenerating} onClick={handleAiGenerate} className="w-full">
                {isGenerating ? <><Loader2 className="w-4 h-4 mr-1 animate-spin" /> Генерация...</> : <><Wand2 className="w-4 h-4 mr-1" /> Сгенерировать</>}
              </Button>
            </div>
          )}
          <Input value={block.imageSrc || ""} onChange={(e) => onUpdate({ imageSrc: e.target.value })} placeholder="https://example.com/image.jpg" className="text-sm" />
        </div>
      )}
    </div>
  );
}

// ─── VideoBlock ─────────────────────────────────────────────────────────────
function VideoBlock({ block, onUpdate }: { block: ContentBlock; onUpdate: (updates: Partial<ContentBlock>) => void }) {
  const [showLibrary, setShowLibrary] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const videoInputRef = useRef<HTMLInputElement>(null);

  const handleVideoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !file.type.startsWith("video/")) return;
    setIsUploading(true);
    try {
      const ext = file.name.split('.').pop() || 'mp4';
      const fileName = `video_${crypto.randomUUID()}.${ext}`;
      const supabaseClient = (await import("@/integrations/supabase/client")).supabase;
      const { data: configData } = await supabaseClient.functions.invoke('get-external-storage-config');
      const useExternal = configData?.configured && configData?.url && configData?.key;
      const bucket = useExternal ? 'course-videos' : 'course-files';
      const { error } = await supabaseClient.storage.from(bucket).upload(fileName, file, { upsert: true });
      if (error) throw error;
      const baseUrl = import.meta.env.VITE_SUPABASE_URL;
      const publicUrl = `${baseUrl}/storage/v1/object/public/${bucket}/${fileName}`;
      onUpdate({ videoUrl: publicUrl });
    } catch (err) {
      console.error("Video upload error:", err);
    } finally {
      setIsUploading(false);
      if (videoInputRef.current) videoInputRef.current.value = '';
    }
  };

  const isIframeEmbed = (content: string): boolean => content.trim().startsWith('<iframe') && content.includes('</iframe>');

  const getEmbedFromContent = (content: string): { type: 'iframe' | 'url' | 'direct' | null; value: string | null } => {
    if (!content) return { type: null, value: null };
    if (isIframeEmbed(content)) return { type: 'iframe', value: content };
    if (content.match(/\.(mp4|webm|ogg|mov|mkv|m4v)(\?.*)?$/i) || content.includes("selcdn.ru") || content.includes("selstorage")) return { type: 'direct', value: content };
    if (content.startsWith("kinescope:")) return { type: 'direct', value: content };
    const ytMatch = content.match(/(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([a-zA-Z0-9_-]+)/);
    if (ytMatch) return { type: 'url', value: `https://www.youtube.com/embed/${ytMatch[1]}` };
    const vimeoMatch = content.match(/vimeo\.com\/(\d+)/);
    if (vimeoMatch) return { type: 'url', value: `https://player.vimeo.com/video/${vimeoMatch[1]}` };
    const rutubeMatch = content.match(/rutube\.ru\/video\/([a-zA-Z0-9]+)/);
    if (rutubeMatch) return { type: 'url', value: `https://rutube.ru/play/embed/${rutubeMatch[1]}` };
    const vkMatch = content.match(/(?:vk\.com|vkvideo\.ru)\/video(-?\d+)_(\d+)/);
    if (vkMatch) return { type: 'url', value: `https://vk.com/video_ext.php?oid=${vkMatch[1]}&id=${vkMatch[2]}&hd=2` };
    const ktalkMatch = content.match(/([a-zA-Z0-9]+)\.ktalk\.ru\/recordings\/([a-zA-Z0-9_-]+)/);
    if (ktalkMatch) return { type: 'url', value: `https://${ktalkMatch[1]}.ktalk.ru/recordings/${ktalkMatch[2]}` };
    const dzenMatch = content.match(/dzen\.ru\/(?:video\/watch|embed)\/([a-zA-Z0-9_-]+)/);
    if (dzenMatch) return { type: 'url', value: `https://dzen.ru/embed/${dzenMatch[1]}` };
    const okMatch = content.match(/ok\.ru\/video\/(\d+)/);
    if (okMatch) return { type: 'url', value: `https://ok.ru/videoembed/${okMatch[1]}` };
    const mailMatch = content.match(/my\.mail\.ru\/(?:mail|bk|inbox|list)\/([^\/]+)\/video\/([^\/]+)\/(\d+)/);
    if (mailMatch) return { type: 'url', value: `https://my.mail.ru/video/embed/${mailMatch[3]}` };
    const yandexMatch = content.match(/yandex\.ru\/video\/preview\/(\d+)/);
    if (yandexMatch) return { type: 'url', value: `https://yandex.ru/video/preview/${yandexMatch[1]}` };
    if (content.match(/^https?:\/\/.*\/recordings?\//i) || content.match(/^https?:\/\/.*\/video\//i)) return { type: 'url', value: content };
    return { type: null, value: null };
  };

  const embedResult = getEmbedFromContent(block.videoUrl || "");
  const hasValidEmbed = embedResult.type !== null;

  return (
    <div className="py-2">
      {hasValidEmbed ? (
        <div className="space-y-2">
          {embedResult.type === 'direct' ? (
            <div className="relative group/video">
              <DirectVideoBlock url={embedResult.value || ''} />
              <Button variant="secondary" size="sm" className="absolute top-2 right-2 opacity-0 group-hover/video:opacity-100 z-10" onClick={() => onUpdate({ videoUrl: "" })}>Удалить</Button>
            </div>
          ) : (
            <LazyMediaPreview type="iframe">
              <div className="relative group/video aspect-video bg-black rounded-lg overflow-hidden">
                {embedResult.type === 'iframe' ? (
                  <div className="w-full h-full [&>iframe]:w-full [&>iframe]:h-full [&>iframe]:border-0"
                    dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(embedResult.value || '', { ALLOWED_TAGS: ['iframe'], ALLOWED_ATTR: ['src', 'width', 'height', 'frameborder', 'allow', 'allowfullscreen', 'title', 'referrerpolicy'] }) }} />
                ) : (
                  <iframe src={embedResult.value || ""} className="w-full h-full border-0" allowFullScreen allow="autoplay; fullscreen; picture-in-picture; encrypted-media" referrerPolicy="no-referrer-when-downgrade" />
                )}
                <Button variant="secondary" size="sm" className="absolute top-2 right-2 opacity-0 group-hover/video:opacity-100" onClick={() => onUpdate({ videoUrl: "" })}>Удалить</Button>
              </div>
            </LazyMediaPreview>
          )}
        </div>
      ) : (
        <div className="bg-muted rounded-xl p-6 space-y-4">
          <div className="text-center">
            <Video className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
            <p className="text-sm text-muted-foreground mb-2">Добавьте видео по ссылке или вставьте embed код</p>
            <p className="text-xs text-muted-foreground/70">YouTube, Vimeo, Rutube, VK, Дзен, OK.ru, Mail.ru или &lt;iframe&gt;</p>
            <div className="flex items-center justify-center gap-2 mt-2">
              <Button variant="outline" size="sm" onClick={() => setShowLibrary(true)}><FolderOpen className="w-4 h-4 mr-1" />Выбрать из загруженных</Button>
              <Button variant="outline" size="sm" disabled={isUploading} onClick={() => videoInputRef.current?.click()}>
                {isUploading ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Upload className="w-4 h-4 mr-1" />}
                {isUploading ? "Загрузка..." : "Загрузить видео"}
              </Button>
              <input ref={videoInputRef} type="file" accept="video/*" className="hidden" onChange={handleVideoUpload} />
            </div>
          </div>
          <Textarea value={block.videoUrl || ""} onChange={(e) => onUpdate({ videoUrl: e.target.value })} placeholder="https://youtube.com/watch?v=... или <iframe>...</iframe>" className="text-sm min-h-[80px] resize-none" />
        </div>
      )}
      <MediaLibraryDialog open={showLibrary} onClose={() => setShowLibrary(false)} onSelect={(url) => onUpdate({ videoUrl: url })} filter="video" />
    </div>
  );
}

// ─── AudioBlock ─────────────────────────────────────────────────────────────
function AudioBlock({ block, onUpdate }: { block: ContentBlock; onUpdate: (updates: Partial<ContentBlock>) => void }) {
  const [isUploading, setIsUploading] = useState(false);
  const audioUrl = block.audioUrl || "";

  const handleFileUpload = async (file: File) => {
    if (!file.type.startsWith("audio/") || file.size > 50 * 1024 * 1024) return;
    setIsUploading(true);
    try {
      const fileName = `audio_${crypto.randomUUID()}.${file.name.split('.').pop() || 'mp3'}`;
      const { data: configData } = await (await import("@/integrations/supabase/client")).supabase.functions.invoke('get-external-storage-config');
      const useExternal = configData?.configured && configData?.url && configData?.key;
      const bucket = useExternal ? 'course-videos' : 'course-files';
      const supabaseClient = (await import("@/integrations/supabase/client")).supabase;
      let uploadedViaInternal = false;
      const { error } = await supabaseClient.storage.from(bucket).upload(fileName, file, { upsert: true });
      if (!error) uploadedViaInternal = true;
      const baseUrl = uploadedViaInternal ? import.meta.env.VITE_SUPABASE_URL : configData?.url;
      const publicUrl = `${baseUrl}/storage/v1/object/public/${bucket}/${fileName}`;
      onUpdate({ audioUrl: publicUrl });
    } catch (e) {
      console.error("Audio upload error:", e);
    } finally { setIsUploading(false); }
  };

  return (
    <div className="py-2">
      {audioUrl ? (
        <div className="space-y-2">
          <LazyMediaPreview type="audio"><audio controls preload="none" src={audioUrl} className="w-full rounded-lg" /></LazyMediaPreview>
          <div className="flex gap-2">
            <Input value={audioUrl} onChange={(e) => onUpdate({ audioUrl: e.target.value })} className="text-xs flex-1" />
            <Button variant="ghost" size="sm" onClick={() => onUpdate({ audioUrl: "" })}><Trash2 className="w-4 h-4" /></Button>
          </div>
        </div>
      ) : (
        <div className="bg-muted rounded-xl p-6 space-y-4">
          <div className="text-center">
            <Headphones className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
            <p className="text-sm text-muted-foreground mb-2">Добавьте аудио</p>
          </div>
          <div className="flex flex-col gap-2">
            <Button variant="outline" size="sm" className="mx-auto" onClick={() => document.getElementById(`audio-upload-${block.id}`)?.click()} disabled={isUploading}>
              {isUploading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Upload className="w-4 h-4 mr-2" />}Загрузить файл
            </Button>
            <input id={`audio-upload-${block.id}`} type="file" accept="audio/*" className="hidden" onChange={(e) => { if (e.target.files?.[0]) handleFileUpload(e.target.files[0]); }} />
            <div className="text-center text-xs text-muted-foreground">или</div>
            <Input value={audioUrl} onChange={(e) => onUpdate({ audioUrl: e.target.value })} placeholder="https://example.com/audio.mp3" className="text-sm" />
          </div>
        </div>
      )}
    </div>
  );
}

// ─── DocumentBlock ──────────────────────────────────────────────────────────
function DocumentBlock({ block, onUpdate }: { block: ContentBlock; onUpdate: (updates: Partial<ContentBlock>) => void }) {
  const [isUploading, setIsUploading] = useState(false);
  const documentUrl = block.documentUrl || "";
  const documentName = block.documentName || "";

  const handleFileUpload = async (file: File) => {
    const allowedTypes = ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
    const ext = file.name.split('.').pop()?.toLowerCase();
    if (!allowedTypes.includes(file.type) && !['pdf', 'doc', 'docx'].includes(ext || '')) {
      const { toast } = await import("sonner"); toast.error("Поддерживаются только PDF и Word файлы"); return;
    }
    if (file.size > 50 * 1024 * 1024) { const { toast } = await import("sonner"); toast.error("Максимальный размер файла — 50 МБ"); return; }
    setIsUploading(true);
    try {
      const fileName = `doc_${crypto.randomUUID()}.${ext || 'pdf'}`;
      const supabaseClient = (await import("@/integrations/supabase/client")).supabase;
      const { error } = await supabaseClient.storage.from('course-files').upload(fileName, file, { upsert: true });
      if (error) throw error;
      const publicUrl = `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/public/course-files/${fileName}`;
      onUpdate({ documentUrl: publicUrl, documentName: file.name });
    } catch (e) {
      console.error("Document upload error:", e);
      const { toast } = await import("sonner"); toast.error("Ошибка загрузки документа");
    } finally { setIsUploading(false); }
  };

  const docExt = documentName.split('.').pop()?.toLowerCase();
  const isPdf = docExt === 'pdf';

  return (
    <div className="py-2">
      {documentUrl ? (
        <div className="rounded-xl border border-indigo-500/30 bg-indigo-500/5 overflow-hidden">
          <div className="flex items-center gap-3 p-3 border-b border-indigo-500/20">
            <div className="w-8 h-8 rounded-lg bg-indigo-500/10 flex items-center justify-center"><BookOpen className="w-4 h-4 text-indigo-500" /></div>
            <span className="font-medium text-sm truncate flex-1">{documentName || 'Документ'}</span>
            <div className="flex gap-1">
              <a href={documentUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-indigo-500 hover:underline px-2 py-1">Скачать</a>
              <Button variant="ghost" size="sm" className="h-7 text-destructive" onClick={() => onUpdate({ documentUrl: "", documentName: "" })}><Trash2 className="w-4 h-4" /></Button>
            </div>
          </div>
          <LazyMediaPreview type="document" className="aspect-[4/3]">
            <div className="aspect-[4/3]">
              <iframe src={isPdf ? `https://docs.google.com/gview?url=${encodeURIComponent(documentUrl)}&embedded=true` : `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(documentUrl)}`} className="w-full h-full border-0" />
            </div>
          </LazyMediaPreview>
        </div>
      ) : (
        <div className="bg-muted rounded-xl p-6 space-y-4">
          <div className="text-center">
            <BookOpen className="w-8 h-8 mx-auto mb-2 text-indigo-500" />
            <p className="text-sm text-muted-foreground mb-2">Загрузите документ PDF или Word</p>
            <p className="text-xs text-muted-foreground/70">Поддерживаются форматы: .pdf, .doc, .docx (до 50 МБ)</p>
          </div>
          <div className="flex flex-col gap-2">
            <Button variant="outline" size="sm" className="mx-auto" onClick={() => document.getElementById(`doc-upload-${block.id}`)?.click()} disabled={isUploading}>
              {isUploading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Upload className="w-4 h-4 mr-2" />}
              {isUploading ? "Загрузка..." : "Загрузить файл"}
            </Button>
            <input id={`doc-upload-${block.id}`} type="file" accept=".pdf,.doc,.docx" className="hidden" onChange={(e) => { if (e.target.files?.[0]) handleFileUpload(e.target.files[0]); }} />
            <div className="text-center text-xs text-muted-foreground">или вставьте ссылку</div>
            <div className="flex gap-2">
              <Input value={documentUrl} onChange={(e) => onUpdate({ documentUrl: e.target.value })} placeholder="https://example.com/document.pdf" className="text-sm flex-1" />
              {!documentName && documentUrl && <Button size="sm" variant="outline" onClick={() => onUpdate({ documentName: documentUrl.split('/').pop() || 'document' })}>OK</Button>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── SliderBlock ────────────────────────────────────────────────────────────
function SliderBlock({ block, onUpdate }: { block: ContentBlock; onUpdate: (updates: Partial<ContentBlock>) => void }) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const slides = block.sliderSlides || [];
  const currentIndex = block.sliderCurrentIndex || 0;

  const parsePptxFile = async (file: File): Promise<SliderSlide[]> => {
    const JSZip = (await import('jszip')).default;
    const arrayBuffer = await file.arrayBuffer();
    const zip = await JSZip.loadAsync(arrayBuffer);
    const slidesArray: SliderSlide[] = [];
    const mediaFiles: Record<string, string> = {};
    const mediaEntries = Object.keys(zip.files).filter(name => name.startsWith('ppt/media/'));
    for (const mediaPath of mediaEntries) {
      try {
        const mediaFile = zip.files[mediaPath];
        if (mediaFile && !mediaFile.dir) {
          const blob = await mediaFile.async('blob');
          const fileName = mediaPath.split('/').pop() || '';
          const ext2 = fileName.split('.').pop()?.toLowerCase();
          let mimeType = 'image/png';
          if (ext2 === 'jpg' || ext2 === 'jpeg') mimeType = 'image/jpeg';
          else if (ext2 === 'gif') mimeType = 'image/gif';
          else if (ext2 === 'svg') mimeType = 'image/svg+xml';
          else if (ext2 === 'webp') mimeType = 'image/webp';
          const dataUrl = await new Promise<string>((resolve) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result as string);
            reader.readAsDataURL(new Blob([blob], { type: mimeType }));
          });
          mediaFiles[fileName] = dataUrl;
        }
      } catch (err) { console.warn('Failed to extract media:', mediaPath, err); }
    }
    const slideFiles = Object.keys(zip.files).filter(name => name.match(/ppt\/slides\/slide\d+\.xml$/)).sort((a, b) => {
      const numA = parseInt(a.match(/slide(\d+)\.xml$/)?.[1] || '0');
      const numB = parseInt(b.match(/slide(\d+)\.xml$/)?.[1] || '0');
      return numA - numB;
    });
    for (const slideFile of slideFiles) {
      const slideNum = slideFile.match(/slide(\d+)\.xml$/)?.[1] || '1';
      const content = await zip.files[slideFile].async('string');
      const parser2 = new DOMParser();
      const doc = parser2.parseFromString(content, 'application/xml');
      const textNodes = doc.querySelectorAll('a\\:t, t');
      const texts: string[] = [];
      textNodes.forEach(node => { const text = node.textContent?.trim(); if (text) texts.push(text); });
      let slideImageUrl: string | undefined;
      const relsPath = `ppt/slides/_rels/slide${slideNum}.xml.rels`;
      if (zip.files[relsPath]) {
        try {
          const relsContent = await zip.files[relsPath].async('string');
          const relsDoc = parser2.parseFromString(relsContent, 'application/xml');
          const relationships = relsDoc.querySelectorAll('Relationship');
          for (const rel of Array.from(relationships)) {
            const target = rel.getAttribute('Target');
            const type = rel.getAttribute('Type');
            if (type?.includes('/image') && target) {
              const imageName = target.replace('../media/', '');
              if (mediaFiles[imageName]) { slideImageUrl = mediaFiles[imageName]; break; }
            }
          }
        } catch (err) { console.warn('Failed to parse rels for slide:', slideNum, err); }
      }
      if (texts.length > 0 || slideImageUrl) {
        slidesArray.push({ id: crypto.randomUUID(), title: texts[0] || `Слайд ${slideNum}`, content: texts.slice(1).join('\n'), imageUrl: slideImageUrl });
      }
    }
    return slidesArray;
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.name.toLowerCase().split('.').pop() !== 'pptx') { setError('Поддерживается только формат PPTX'); return; }
    setIsLoading(true); setError(null);
    try {
      const parsedSlides = await parsePptxFile(file);
      if (parsedSlides.length === 0) { setError('Не удалось извлечь слайды из презентации'); return; }
      onUpdate({ sliderSlides: parsedSlides, sliderCurrentIndex: 0, content: file.name });
    } catch (err) { console.error('Error parsing PPTX:', err); setError('Ошибка при обработке файла'); }
    finally { setIsLoading(false); }
  };

  const goToSlide = (index: number) => { if (index >= 0 && index < slides.length) onUpdate({ sliderCurrentIndex: index }); };
  const removeSlider = () => onUpdate({ sliderSlides: [], sliderCurrentIndex: 0, content: '' });

  if (slides.length === 0) {
    return (
      <div className="py-2">
        <div className="bg-muted rounded-xl p-6 space-y-4">
          <div className="text-center">
            <Presentation className="w-8 h-8 mx-auto mb-2 text-orange-500" />
            <p className="text-sm text-muted-foreground mb-2">Загрузите презентацию PPTX</p>
            <p className="text-xs text-muted-foreground/70">Слайды будут отображаться как интерактивный слайдер</p>
          </div>
          {error && <div className="text-sm text-destructive text-center">{error}</div>}
          <label className="flex items-center justify-center gap-2 p-3 border-2 border-dashed border-border rounded-lg cursor-pointer hover:border-primary/50 transition-colors">
            {isLoading ? <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /> : <Upload className="w-5 h-5 text-muted-foreground" />}
            <span className="text-sm text-muted-foreground">{isLoading ? 'Обработка...' : 'Выбрать файл PPTX'}</span>
            <input type="file" accept=".pptx" onChange={handleFileUpload} className="hidden" disabled={isLoading} />
          </label>
        </div>
      </div>
    );
  }

  const currentSlide = slides[currentIndex];
  return (
    <div className="py-2">
      <div className="rounded-xl border border-orange-500/30 bg-orange-500/5 overflow-hidden">
        <div className="flex items-center justify-between p-3 border-b border-orange-500/20">
          <div className="flex items-center gap-2 text-orange-500"><Presentation className="w-5 h-5" /><span className="font-medium text-sm">{block.content || 'Презентация'}</span></div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">{currentIndex + 1} / {slides.length}</span>
            <Button variant="ghost" size="sm" className="h-7 text-destructive hover:text-destructive" onClick={removeSlider}><Trash2 className="w-4 h-4" /></Button>
          </div>
        </div>
        <div className="p-6 min-h-[250px]">
          {currentSlide && (
            <div className="space-y-4">
              {currentSlide.imageUrl ? (
                <div className="relative group rounded-lg overflow-hidden border border-border bg-secondary/20">
                  <img src={currentSlide.imageUrl} alt={currentSlide.title || 'Слайд'} className="w-full max-h-[400px] object-contain" />
                  <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                    <label className="cursor-pointer px-3 py-2 bg-background/90 rounded-lg text-xs font-medium hover:bg-background transition-colors flex items-center gap-1.5">
                      <Upload className="w-3.5 h-3.5" />Заменить
                      <input type="file" accept="image/*" className="hidden" onChange={(e) => { const file = e.target.files?.[0]; if (!file) return; const reader = new FileReader(); reader.onload = () => { const ns = [...slides]; ns[currentIndex] = { ...ns[currentIndex], imageUrl: reader.result as string }; onUpdate({ sliderSlides: ns }); }; reader.readAsDataURL(file); }} />
                    </label>
                    <Button variant="destructive" size="sm" className="h-8 text-xs gap-1.5" onClick={() => { const ns = [...slides]; ns[currentIndex] = { ...ns[currentIndex], imageUrl: undefined }; onUpdate({ sliderSlides: ns }); }}>
                      <Trash2 className="w-3.5 h-3.5" />Удалить
                    </Button>
                  </div>
                </div>
              ) : (
                <label className="flex flex-col items-center justify-center gap-2 p-8 border-2 border-dashed border-border rounded-lg cursor-pointer hover:border-orange-500/50 hover:bg-orange-500/5 transition-colors">
                  <ImageIcon className="w-8 h-8 text-muted-foreground/50" />
                  <span className="text-sm text-muted-foreground">Загрузить изображение для слайда</span>
                  <input type="file" accept="image/*" className="hidden" onChange={(e) => { const file = e.target.files?.[0]; if (!file) return; const reader = new FileReader(); reader.onload = () => { const ns = [...slides]; ns[currentIndex] = { ...ns[currentIndex], imageUrl: reader.result as string }; onUpdate({ sliderSlides: ns }); }; reader.readAsDataURL(file); }} />
                </label>
              )}
              <h3 className="text-lg font-semibold">{currentSlide.title}</h3>
              {currentSlide.content && <div className="text-sm text-muted-foreground whitespace-pre-wrap">{currentSlide.content}</div>}
            </div>
          )}
        </div>
        <div className="flex items-center justify-between p-3 border-t border-orange-500/20 bg-orange-500/5">
          <Button variant="ghost" size="sm" onClick={() => goToSlide(currentIndex - 1)} disabled={currentIndex === 0} className="gap-1"><ChevronLeft className="w-4 h-4" />Назад</Button>
          <div className="flex gap-1">
            {slides.map((_, i) => <button key={i} onClick={() => goToSlide(i)} className={cn("w-2 h-2 rounded-full transition-colors", i === currentIndex ? "bg-orange-500" : "bg-orange-500/30 hover:bg-orange-500/50")} />)}
          </div>
          <Button variant="ghost" size="sm" onClick={() => goToSlide(currentIndex + 1)} disabled={currentIndex === slides.length - 1} className="gap-1">Далее<ChevronRight className="w-4 h-4" /></Button>
        </div>
      </div>
    </div>
  );
}

// ─── BlockContent ───────────────────────────────────────────────────────────
function BlockContent({ block, onUpdate, courseTitle, lessonTitle, existingContent }: { block: ContentBlock; onUpdate: (updates: Partial<ContentBlock>) => void; courseTitle?: string; lessonTitle?: string; existingContent?: string }) {
  const editorStyleClasses = (() => {
    const classes: string[] = [];
    if (block.textAlign === 'center') classes.push('text-center');
    if (block.textAlign === 'right') classes.push('text-right');
    if (block.textSize === 'sm') classes.push('text-sm');
    if (block.textSize === 'lg') classes.push('text-lg');
    if (block.bold) classes.push('font-bold');
    if (block.italic) classes.push('italic');
    if (block.strikethrough) classes.push('line-through');
    if (block.underline) classes.push('underline');
    if (block.uppercase) classes.push('uppercase');
    if (block.lineHeight === 'tight') classes.push('leading-tight');
    if (block.lineHeight === 'relaxed') classes.push('leading-relaxed');
    if (block.fontFamily === 'mono') classes.push('font-mono');
    if (block.textColor) { const preset = textColorPresets.find(p => p.value === block.textColor); if (preset?.class) classes.push(preset.class); }
    if (block.bgColor) { const preset = bgColorPresets.find(p => p.value === block.bgColor); if (preset?.class) classes.push(preset.class, 'rounded-lg', 'p-3'); }
    if (block.borderStyle === 'thin') classes.push('border border-border');
    if (block.borderStyle === 'bold') classes.push('border-2 border-foreground/30');
    if (block.borderStyle === 'dashed') classes.push('border border-dashed border-border');
    if (block.borderRadius === 'md') classes.push('rounded-lg');
    if (block.borderRadius === 'xl') classes.push('rounded-2xl');
    if ((block.borderStyle && block.borderStyle !== 'none') && !block.bgColor) classes.push('p-3');
    return classes.join(' ');
  })();

  switch (block.type) {
    case "paragraph": return <ParagraphBlock block={block} onUpdate={onUpdate} courseTitle={courseTitle} lessonTitle={lessonTitle} existingContent={existingContent} editorStyleClasses={editorStyleClasses} />;
    case "heading1": return <RichTextEditor value={block.content} onChange={(val) => onUpdate({ content: val })} placeholder="Заголовок 1" className={cn("text-2xl font-bold", editorStyleClasses)} minHeight="40px" />;
    case "heading2": return <RichTextEditor value={block.content} onChange={(val) => onUpdate({ content: val })} placeholder="Заголовок 2" className={cn("text-xl font-semibold", editorStyleClasses)} minHeight="36px" />;
    case "bulletList": case "numberedList": return <div className={cn("space-y-1 py-2", editorStyleClasses)}><RichTextEditor value={(block.content || "").replace(/<\/?li>/gi, "")} onChange={(val) => onUpdate({ content: val })} placeholder="Элемент списка (каждая строка — отдельный пункт)" className="text-sm" minHeight="60px" /></div>;
    case "quote": return <QuoteBlock block={block} onUpdate={onUpdate} courseTitle={courseTitle} lessonTitle={lessonTitle} existingContent={existingContent} />;
    case "callout-info": case "callout-warning": case "callout-tip": case "callout-success": case "callout-danger": return <CalloutBlock block={block} onUpdate={onUpdate} courseTitle={courseTitle} lessonTitle={lessonTitle} existingContent={existingContent} />;
    case "highlight": return <HighlightBlock block={block} onUpdate={onUpdate} courseTitle={courseTitle} lessonTitle={lessonTitle} existingContent={existingContent} />;
    case "accordion": return <AccordionBlock block={block} onUpdate={onUpdate} courseTitle={courseTitle} lessonTitle={lessonTitle} existingContent={existingContent} />;
    case "quiz": return <QuizBlock block={block} onUpdate={onUpdate} courseTitle={courseTitle} lessonTitle={lessonTitle} existingContent={existingContent} />;
    case "image": return <ImageBlock block={block} onUpdate={onUpdate} />;
    case "video": return <VideoBlock block={block} onUpdate={onUpdate} />;
    case "audio": return <AudioBlock block={block} onUpdate={onUpdate} />;
    case "slider": return <SliderBlock block={block} onUpdate={onUpdate} />;
    case "document": return <DocumentBlock block={block} onUpdate={onUpdate} />;
    case "divider": return <div className="py-4"><hr className="border-border" /></div>;
    default: return null;
  }
}

// ─── SortableBlockItem ──────────────────────────────────────────────────────
interface SortableBlockItemProps {
  block: ContentBlock;
  isFocused: boolean;
  onFocus: () => void;
  onUpdate: (updates: Partial<ContentBlock>) => void;
  onDelete: () => void;
  onAddAfter: (type: BlockType) => void;
  courseTitle?: string;
  lessonTitle?: string;
  existingContent?: string;
  presets: { name: string; style: StylePreset }[];
  onPresetsChange: (presets: { name: string; style: StylePreset }[]) => void;
}

function SortableBlockItem({ block, isFocused, onFocus, onUpdate, onDelete, onAddAfter, courseTitle, lessonTitle, existingContent, presets, onPresetsChange }: SortableBlockItemProps) {
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
        signal: ttsController.signal,
      });
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
    <div ref={setNodeRef} style={style} data-block-id={block.id} className={cn("group relative rounded-lg transition-all", isFocused && "bg-secondary/30")} onClick={onFocus}>
      <div className="min-w-0">
        <BlockContent block={block} onUpdate={onUpdate} courseTitle={courseTitle} lessonTitle={lessonTitle} existingContent={existingContent} />
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
          <Popover>
            <PopoverTrigger asChild><button className="h-8 w-8 flex items-center justify-center hover:bg-white/20 rounded-full transition-colors" title="Добавить блок"><Plus className="w-4 h-4" /></button></PopoverTrigger>
            <PopoverContent align="center" className="w-72 p-2">
              <Tabs defaultValue="text">
                <TabsList className="w-full h-8 p-0.5">{Object.entries(blockCategories).map(([key, cat]) => <TabsTrigger key={key} value={key} className="text-xs px-2 py-1 h-7">{cat.label}</TabsTrigger>)}</TabsList>
                {Object.entries(blockCategories).map(([key, cat]) => <TabsContent key={key} value={key} className="mt-2"><BlockCategoryGrid items={cat.items} onSelect={(type) => onAddAfter(type)} calloutItems={key === "other" ? calloutItems : undefined} /></TabsContent>)}
              </Tabs>
            </PopoverContent>
          </Popover>
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
              {ttsGenerating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Headphones className="w-4 h-4" />}
              {ttsGenerating ? "Генерация..." : "Озвучить текст"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Main BlockEditor Component ─────────────────────────────────────────────
export function BlockEditor({ blocks, onChange, readOnly = false, courseTitle, lessonTitle }: BlockEditorProps) {
  const [focusedBlockId, setFocusedBlockId] = useState<string | null>(null);
  const [stylePresets, setStylePresets] = useState(() => loadPresets());
  const [isFormatting, setIsFormatting] = useState(false);

  const historyRef = useRef<ContentBlock[][]>([JSON.parse(JSON.stringify(blocks))]);
  const historyIndexRef = useRef(0);
  const isUndoRedoRef = useRef(false);

  const pushHistory = useCallback((newBlocks: ContentBlock[]) => {
    if (isUndoRedoRef.current) { isUndoRedoRef.current = false; return; }
    const history = historyRef.current;
    const idx = historyIndexRef.current;
    historyRef.current = history.slice(0, idx + 1);
    historyRef.current.push(JSON.parse(JSON.stringify(newBlocks)));
    if (historyRef.current.length > 50) historyRef.current.shift();
    historyIndexRef.current = historyRef.current.length - 1;
  }, []);

  const handleUndo = useCallback(() => {
    if (historyIndexRef.current <= 0) return;
    historyIndexRef.current--;
    isUndoRedoRef.current = true;
    onChange(JSON.parse(JSON.stringify(historyRef.current[historyIndexRef.current])));
  }, [onChange]);

  const handleRedo = useCallback(() => {
    if (historyIndexRef.current >= historyRef.current.length - 1) return;
    historyIndexRef.current++;
    isUndoRedoRef.current = true;
    onChange(JSON.parse(JSON.stringify(historyRef.current[historyIndexRef.current])));
  }, [onChange]);

  const onChangeWithHistory = useCallback((newBlocks: ContentBlock[]) => {
    pushHistory(newBlocks);
    onChange(newBlocks);
  }, [onChange, pushHistory]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        if (e.shiftKey) { e.preventDefault(); handleRedo(); }
        else { e.preventDefault(); handleUndo(); }
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'y') { e.preventDefault(); handleRedo(); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [handleUndo, handleRedo]);

  const canUndo = historyIndexRef.current > 0;
  const canRedo = historyIndexRef.current < historyRef.current.length - 1;

  const addBlock = useCallback((type: BlockType, afterIndex?: number) => {
    const newBlock = createBlock(type);
    const newBlocks = [...blocks];
    if (afterIndex !== undefined) newBlocks.splice(afterIndex + 1, 0, newBlock);
    else newBlocks.push(newBlock);
    onChangeWithHistory(newBlocks);
    setFocusedBlockId(newBlock.id);
  }, [blocks, onChangeWithHistory]);

  const updateBlock = useCallback((id: string, updates: Partial<ContentBlock>) => {
    onChangeWithHistory(blocks.map(b => b.id === id ? { ...b, ...updates } : b));
  }, [blocks, onChangeWithHistory]);

  const deleteBlock = useCallback((id: string) => {
    onChangeWithHistory(blocks.filter(b => b.id !== id));
  }, [blocks, onChangeWithHistory]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const oldIndex = blocks.findIndex((b) => b.id === active.id);
      const newIndex = blocks.findIndex((b) => b.id === over.id);
      onChangeWithHistory(arrayMove(blocks, oldIndex, newIndex));
    }
  };

  const handleFormatWithAI = useCallback(async () => {
    if (blocks.length === 0) return;
    const rawText = blocks.map(b => { if (b.type === "accordion" && b.accordionTitle) return `${b.accordionTitle}\n${b.content}`; return b.content; }).filter(Boolean).join("\n\n");
    if (!rawText.trim()) return;
    const canProceed = await checkAiLimitGlobal();
    if (!canProceed) return;
    setIsFormatting(true);
    try {
      const { data, error } = await safeInvoke<{ success: boolean; blocks: any[] }>("generate-lesson-content", { body: { rawText, lessonType: "format", courseTitle, lessonTitle } });
      if (error || !data?.success || !data.blocks?.length) { const { toast } = await import("sonner"); toast.error(error?.message || "Не удалось оформить текст"); return; }
      const formatted: ContentBlock[] = data.blocks.map((b: any) => ({ ...createBlock(b.type as BlockType), content: b.content || "", ...(b.accordionTitle && { accordionTitle: b.accordionTitle }) }));
      onChangeWithHistory(formatted);
      await incrementAiLimitGlobal();
      const { toast } = await import("sonner"); toast.success("Текст оформлен с помощью ИИ");
    } catch (err) { console.error("Format with AI error:", err); }
    finally { setIsFormatting(false); }
  }, [blocks, courseTitle, lessonTitle, onChangeWithHistory]);

  if (readOnly) return <BlockRenderer blocks={blocks} />;

  return (
    <div className="space-y-2">
      <div className="flex justify-end">
        <div className="inline-flex items-center gap-1 bg-background/90 backdrop-blur-sm border border-border rounded-lg p-1.5 shadow-md">
          {blocks.length > 0 && (
            <Button variant="ghost" size="sm" onClick={handleFormatWithAI} disabled={isFormatting} title="Оформить текст с помощью ИИ" className="h-10 px-3 gap-1.5 text-xs font-medium">
              {isFormatting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />}Оформить с ИИ
            </Button>
          )}
          <div className="w-px h-6 bg-border" />
          <Button variant="ghost" size="sm" onClick={handleUndo} disabled={!canUndo} title="Отменить (Ctrl+Z)" className="h-10 w-10 p-0"><Undo2 className="w-5 h-5" /></Button>
          <Button variant="ghost" size="sm" onClick={handleRedo} disabled={!canRedo} title="Вернуть (Ctrl+Shift+Z)" className="h-10 w-10 p-0"><Redo2 className="w-5 h-5" /></Button>
        </div>
      </div>
      {blocks.length === 0 && (
        <div className="text-center py-8 text-muted-foreground border-2 border-dashed border-border rounded-xl">
          <Type className="w-8 h-8 mx-auto mb-2 opacity-50" />
          <p className="text-sm mb-3">Начните добавлять контент</p>
          <AddBlockButton onAdd={(type) => addBlock(type)} />
        </div>
      )}
      {blocks.length > 0 && (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={blocks.map(b => b.id)} strategy={verticalListSortingStrategy}>
            {blocks.map((block, index) => (
              <SortableBlockItem
                key={block.id}
                block={block}
                isFocused={focusedBlockId === block.id}
                onFocus={() => setFocusedBlockId(block.id)}
                onUpdate={(updates) => updateBlock(block.id, updates)}
                onDelete={() => deleteBlock(block.id)}
                onAddAfter={(type) => addBlock(type, index)}
                courseTitle={courseTitle}
                lessonTitle={lessonTitle}
                existingContent={summarizeExistingContent(blocks)}
                presets={stylePresets}
                onPresetsChange={(p) => { setStylePresets(p); savePresets(p); }}
              />
            ))}
          </SortableContext>
        </DndContext>
      )}
      {blocks.length > 0 && (
        <div className="flex justify-center pt-2"><AddBlockButton onAdd={(type) => addBlock(type)} /></div>
      )}
    </div>
  );
}
