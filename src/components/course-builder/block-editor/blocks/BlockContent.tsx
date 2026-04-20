import { RichTextEditor } from "../../RichTextEditor";
import { cn } from "@/lib/utils";
import { bgColorPresets, textColorPresets } from "../types";
import type { ContentBlock } from "../types";
import { ParagraphBlock, QuoteBlock, CalloutBlock, HighlightBlock, AccordionBlock } from "./TextBlocks";
import { QuizBlock } from "./QuizBlock";
import { ImageBlock, VideoBlock, AudioBlock, DocumentBlock } from "./MediaBlocks";
import { SliderBlock } from "./SliderBlock";

export function BlockContent({ block, onUpdate, courseTitle, lessonTitle, existingContent, organizationId, courseId, lessonId }: { block: ContentBlock; onUpdate: (updates: Partial<ContentBlock>) => void; courseTitle?: string; lessonTitle?: string; existingContent?: string; organizationId?: string; courseId?: string; lessonId?: string }) {
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

  const blockCtrlProps = {
    onConvertType: (type: any) => onUpdate({ type }),
    onStyleUpdate: (updates: any) => onUpdate(updates),
    currentBlockType: block.type,
    currentTextAlign: block.textAlign,
    currentTextColor: block.textColor,
    currentBgColor: block.bgColor,
    currentTextSize: block.textSize,
  };

  switch (block.type) {
    case "paragraph": return <ParagraphBlock block={block} onUpdate={onUpdate} courseTitle={courseTitle} lessonTitle={lessonTitle} existingContent={existingContent} editorStyleClasses={editorStyleClasses} blockCtrlProps={blockCtrlProps} />;
    case "heading1": return <RichTextEditor {...blockCtrlProps} value={block.content} onChange={(val) => onUpdate({ content: val })} placeholder="Заголовок 1" className={cn("text-3xl font-bold", editorStyleClasses)} minHeight="44px" />;
    case "heading2": return <RichTextEditor {...blockCtrlProps} value={block.content} onChange={(val) => onUpdate({ content: val })} placeholder="Заголовок 2" className={cn("text-2xl font-bold", editorStyleClasses)} minHeight="40px" />;
    case "heading3": return <RichTextEditor {...blockCtrlProps} value={block.content} onChange={(val) => onUpdate({ content: val })} placeholder="Заголовок 3" className={cn("text-xl font-semibold", editorStyleClasses)} minHeight="36px" />;
    case "heading4": return <RichTextEditor {...blockCtrlProps} value={block.content} onChange={(val) => onUpdate({ content: val })} placeholder="Заголовок 4" className={cn("text-lg font-semibold", editorStyleClasses)} minHeight="32px" />;
    case "bulletList": case "numberedList": return <div className={cn("space-y-1 py-2", editorStyleClasses)}><RichTextEditor {...blockCtrlProps} value={(block.content || "").replace(/<\/?li>/gi, "")} onChange={(val) => onUpdate({ content: val })} placeholder="Элемент списка (каждая строка — отдельный пункт)" className="text-sm" minHeight="60px" /></div>;
    case "quote": return <QuoteBlock block={block} onUpdate={onUpdate} courseTitle={courseTitle} lessonTitle={lessonTitle} existingContent={existingContent} blockCtrlProps={blockCtrlProps} />;
    case "callout-info": case "callout-warning": case "callout-tip": case "callout-success": case "callout-danger": return <CalloutBlock block={block} onUpdate={onUpdate} courseTitle={courseTitle} lessonTitle={lessonTitle} existingContent={existingContent} blockCtrlProps={blockCtrlProps} />;
    case "highlight": return <HighlightBlock block={block} onUpdate={onUpdate} courseTitle={courseTitle} lessonTitle={lessonTitle} existingContent={existingContent} blockCtrlProps={blockCtrlProps} />;
    case "accordion": return <AccordionBlock block={block} onUpdate={onUpdate} courseTitle={courseTitle} lessonTitle={lessonTitle} existingContent={existingContent} blockCtrlProps={blockCtrlProps} />;
    case "quiz": return <QuizBlock block={block} onUpdate={onUpdate} courseTitle={courseTitle} lessonTitle={lessonTitle} existingContent={existingContent} />;
    case "image": return <ImageBlock block={block} onUpdate={onUpdate} />;
    case "video": return <VideoBlock block={block} onUpdate={onUpdate} organizationId={organizationId} courseId={courseId} lessonId={lessonId} />;
    case "audio": return <AudioBlock block={block} onUpdate={onUpdate} />;
    case "slider": return <SliderBlock block={block} onUpdate={onUpdate} />;
    case "document": return <DocumentBlock block={block} onUpdate={onUpdate} />;
    case "divider": return <div className="py-4"><hr className="border-border" /></div>;
    default: return null;
  }
}
