import { useState } from "react";
import { useBlockAIGenerate } from "@/hooks/useBlockAIGenerate";
import { RichTextEditor } from "../../RichTextEditor";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  AlertCircle, Lightbulb, CheckCircle, XCircle, Highlighter,
  ChevronDown, ChevronRight, Sparkles, Pencil } from "lucide-react";
import type { ContentBlock } from "../types";
import { SigmaSpinner } from "@/components/ui/SigmaSpinner";

function AIGenerateButton({ isGenerating, onClick }: { isGenerating: boolean; onClick: () => void }) {
  return (
    <Button variant="outline" size="sm" onClick={onClick} disabled={isGenerating} className="gap-2 text-xs">
      {isGenerating ? <SigmaSpinner size="xs" /> : <Sparkles className="w-3 h-3" />}
      {isGenerating ? "Генерация..." : "Сгенерировать с ИИ"}
    </Button>
  );
}

export { AIGenerateButton };

interface BlockAIProps {
  block: ContentBlock;
  onUpdate: (updates: Partial<ContentBlock>) => void;
  courseTitle?: string;
  lessonTitle?: string;
  existingContent?: string;
  blockCtrlProps?: Record<string, any>;
}

/** Helper to invoke the AI content generation edge function. */
async function invokeContentFn(body: Record<string, unknown>) {
  const { supabase } = await import("@/integrations/supabase/client");
  const { data, error } = await supabase.functions.invoke("generate-course-content", { body });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return data;
}

export function ParagraphBlock({ block, onUpdate, courseTitle, lessonTitle, existingContent, editorStyleClasses, blockCtrlProps }: BlockAIProps & { editorStyleClasses: string }) {
  const { isGenerating, run } = useBlockAIGenerate();
  const [showPrompt, setShowPrompt] = useState(false);
  const [customPrompt, setCustomPrompt] = useState("");

  const handleGenerate = async (prompt?: string) => {
    const ok = await run(async () => {
      const data = await invokeContentFn({
        contentType: "paragraph_text",
        lessonTitle: lessonTitle || "Общая тема",
        courseTitle: courseTitle || "Курс",
        existingContent,
        customPrompt: prompt || "",
      });
      if (!data?.content) return null;
      onUpdate({ content: data.content });
      return data.content as string;
    }, "Ошибка генерации текста");
    if (ok) {
      setShowPrompt(false);
      setCustomPrompt("");
    }
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
            {isGenerating ? <SigmaSpinner size="xs" /> : <Sparkles className="w-3 h-3" />}Создать
          </Button>
        </div>
      )}
      {isGenerating && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground py-4 justify-center">
          <SigmaSpinner size="sm" />Генерация текста...
        </div>
      )}
      <RichTextEditor {...(blockCtrlProps || {})} value={block.content} onChange={(val) => onUpdate({ content: val })} placeholder="Введите текст..." className={editorStyleClasses} />
    </div>
  );
}

export function QuoteBlock({ block, onUpdate, courseTitle, lessonTitle, existingContent, blockCtrlProps }: BlockAIProps) {
  const { isGenerating, run } = useBlockAIGenerate();
  const handleGenerate = () => run(async () => {
    const data = await invokeContentFn({
      contentType: "quote",
      lessonTitle: lessonTitle || "Общая тема",
      courseTitle: courseTitle || "Курс",
      existingContent,
    });
    if (!data?.content) return null;
    onUpdate({ content: data.content });
    return data.content as string;
  }, "Ошибка генерации цитаты");
  return (
    <div className="border-l-4 border-muted-foreground/30 pl-4 py-2 space-y-2">
      <div className="flex justify-end"><AIGenerateButton isGenerating={isGenerating} onClick={handleGenerate} /></div>
      <RichTextEditor {...(blockCtrlProps || {})} value={block.content} onChange={(val) => onUpdate({ content: val })} placeholder="Введите цитату..." className="italic text-muted-foreground" />
    </div>
  );
}

export function CalloutBlock({ block, onUpdate, courseTitle, lessonTitle, existingContent, blockCtrlProps }: BlockAIProps) {
  const { isGenerating, run } = useBlockAIGenerate();
  const styles = {
    "callout-info": { bg: "bg-blue-500/10", border: "border-blue-500/30", icon: AlertCircle, iconColor: "text-blue-500" },
    "callout-warning": { bg: "bg-amber-500/10", border: "border-amber-500/30", icon: AlertCircle, iconColor: "text-amber-500" },
    "callout-tip": { bg: "bg-green-500/10", border: "border-green-500/30", icon: Lightbulb, iconColor: "text-green-500" },
    "callout-success": { bg: "bg-emerald-500/10", border: "border-emerald-500/30", icon: CheckCircle, iconColor: "text-emerald-500" },
    "callout-danger": { bg: "bg-red-500/10", border: "border-red-500/30", icon: XCircle, iconColor: "text-red-500" } };
  const style = styles[block.type as keyof typeof styles];
  const Icon = style.icon;

  const handleGenerate = () => run(async () => {
    const data = await invokeContentFn({
      contentType: "callout",
      calloutType: block.type,
      lessonTitle: lessonTitle || "Общая тема",
      courseTitle: courseTitle || "Курс",
      existingContent,
    });
    if (!data?.content) return null;
    onUpdate({ content: data.content });
    return data.content as string;
  }, "Ошибка генерации");

  return (
    <div className={cn("rounded-xl p-4 border", style.bg, style.border)}>
      <div className="flex items-center justify-between mb-2">
        <Icon className={cn("w-5 h-5 flex-shrink-0", style.iconColor)} />
        <AIGenerateButton isGenerating={isGenerating} onClick={handleGenerate} />
      </div>
      <Input
        value={block.calloutTitle || ""}
        onChange={(e) => onUpdate({ calloutTitle: e.target.value })}
        placeholder="Заголовок (необязательно)"
        className="font-semibold border-0 bg-transparent p-0 h-auto mb-1.5 focus-visible:ring-0 placeholder:text-muted-foreground/60"
      />
      <RichTextEditor {...(blockCtrlProps || {})} value={block.content} onChange={(val) => onUpdate({ content: val })} placeholder="Введите текст..." minHeight="40px" />
    </div>
  );
}

export function HighlightBlock({ block, onUpdate, courseTitle, lessonTitle, existingContent, blockCtrlProps }: BlockAIProps) {
  const { isGenerating, run } = useBlockAIGenerate();
  const handleGenerate = () => run(async () => {
    const data = await invokeContentFn({
      contentType: "callout",
      calloutType: "highlight",
      lessonTitle: lessonTitle || "Общая тема",
      courseTitle: courseTitle || "Курс",
      existingContent,
    });
    if (!data?.content) return null;
    onUpdate({ content: data.content });
    return data.content as string;
  }, "Ошибка генерации");
  return (
    <div className="rounded-xl p-4 border border-yellow-400/40 bg-gradient-to-r from-yellow-400/10 via-amber-400/5 to-transparent relative overflow-hidden">
      <div className="absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-yellow-400 via-amber-500 to-orange-500" />
      <div className="pl-3">
        <div className="flex items-center justify-between mb-2">
          <Highlighter className="w-5 h-5 text-yellow-500 flex-shrink-0" />
          <AIGenerateButton isGenerating={isGenerating} onClick={handleGenerate} />
        </div>
        <RichTextEditor {...(blockCtrlProps || {})} value={block.content} onChange={(val) => onUpdate({ content: val })} placeholder="Введите текст выделения..." minHeight="40px" />
      </div>
    </div>
  );
}

export function AccordionBlock({ block, onUpdate, courseTitle, lessonTitle, existingContent, blockCtrlProps }: BlockAIProps) {
  const { isGenerating, run } = useBlockAIGenerate();
  const isOpen = block.accordionOpen ?? true;

  const handleGenerate = () => run(async () => {
    const data = await invokeContentFn({
      contentType: "accordion",
      lessonTitle: lessonTitle || "Общая тема",
      courseTitle: courseTitle || "Курс",
      existingContent,
    });
    if (!data?.accordion) return null;
    onUpdate({
      accordionTitle: data.accordion.title || block.accordionTitle,
      content: data.accordion.content || "",
    });
    return data.accordion;
  }, "Ошибка генерации");

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
          <RichTextEditor {...(blockCtrlProps || {})} value={block.content} onChange={(val) => onUpdate({ content: val })} placeholder="Содержимое секции..." minHeight="60px" />
        </div>
      )}
    </div>
  );
}
