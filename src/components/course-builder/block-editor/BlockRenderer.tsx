import { useState } from "react";
import DOMPurify from "dompurify";
import {
  AlertCircle, Lightbulb, HelpCircle, ChevronDown, ChevronRight, ChevronLeft,
  BookOpen, Headphones, Presentation, Highlighter, CheckCircle, XCircle, Play, Video,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { LazyMediaPreview } from "@/components/course-builder/LazyMediaPreview";
import { VideoPreviewInline } from "@/components/course-builder/VideoPreviewInline";
import type { ContentBlock } from "./types";
import { bgColorPresets, textColorPresets } from "./types";
import { renderHtml } from "./utils";
import { getEmbedSrc } from "./embedSrc";
import { FormulaRender } from "./FormulaRender";

function RenderBlock({ block, quizAnswer, quizSubmitted, onQuizAnswer, onQuizSubmit, sliderIndex, onSliderChange }: { 
  block: ContentBlock; 
  quizAnswer?: number; 
  quizSubmitted?: boolean; 
  onQuizAnswer: (index: number) => void; 
  onQuizSubmit: () => void;
  sliderIndex?: number;
  onSliderChange?: (index: number) => void;
}) {
  const [accordionOpen, setAccordionOpen] = useState(false);

  const getBlockStyleClasses = () => {
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
    if (block.textColor) {
      const preset = textColorPresets.find(p => p.value === block.textColor);
      if (preset?.class) classes.push(preset.class);
    }
    if (block.bgColor) {
      const preset = bgColorPresets.find(p => p.value === block.bgColor);
      if (preset?.class) classes.push(preset.class, 'rounded-lg', 'p-3');
    }
    if (block.borderStyle === 'thin') classes.push('border border-border');
    if (block.borderStyle === 'bold') classes.push('border-2 border-foreground/30');
    if (block.borderStyle === 'dashed') classes.push('border border-dashed border-border');
    if (block.borderRadius === 'md') classes.push('rounded-lg');
    if (block.borderRadius === 'xl') classes.push('rounded-2xl');
    if ((block.borderStyle && block.borderStyle !== 'none') && !block.bgColor) classes.push('p-3');
    return classes.join(' ');
  };

  const styleClasses = getBlockStyleClasses();

  switch (block.type) {
    case "paragraph":
      return <p className={styleClasses} dangerouslySetInnerHTML={{ __html: renderHtml(block.content) }} />;
    case "heading1":
      return <h1 className={cn("text-3xl font-bold", styleClasses)} dangerouslySetInnerHTML={{ __html: renderHtml(block.content) }} />;
    case "heading2":
      return <h2 className={cn("text-2xl font-bold", styleClasses)} dangerouslySetInnerHTML={{ __html: renderHtml(block.content) }} />;
    case "heading3":
      return <h3 className={cn("text-xl font-semibold", styleClasses)} dangerouslySetInnerHTML={{ __html: renderHtml(block.content) }} />;
    case "heading4":
      return <h4 className={cn("text-lg font-semibold", styleClasses)} dangerouslySetInnerHTML={{ __html: renderHtml(block.content) }} />;
    case "bulletList":
      return <ul className={cn("list-disc pl-6", styleClasses)}>{(block.content || "").replace(/<\/?li>/gi, "").split("\n").filter(Boolean).map((item, i) => <li key={i} dangerouslySetInnerHTML={{ __html: renderHtml(item) }} />)}</ul>;
    case "numberedList":
      return <ol className={cn("list-decimal pl-6", styleClasses)}>{(block.content || "").replace(/<\/?li>/gi, "").split("\n").filter(Boolean).map((item, i) => <li key={i} dangerouslySetInnerHTML={{ __html: renderHtml(item) }} />)}</ol>;
    case "quote":
      return <blockquote className={cn("border-l-4 border-muted-foreground/30 pl-4 italic text-muted-foreground", styleClasses)} dangerouslySetInnerHTML={{ __html: renderHtml(block.content) }} />;
    case "callout-info":
      return <div className={cn("rounded-xl p-4 bg-blue-500/10 border border-blue-500/30 flex gap-3 not-prose [&_a]:text-primary [&_a]:underline", styleClasses)}><AlertCircle className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" /><div className="flex-1 min-w-0">{block.calloutTitle && <p className="text-sm font-semibold mb-1">{block.calloutTitle}</p>}<p className="text-sm" dangerouslySetInnerHTML={{ __html: renderHtml(block.content) }} /></div></div>;
    case "callout-warning":
      return <div className={cn("rounded-xl p-4 bg-amber-500/10 border border-amber-500/30 flex gap-3 not-prose [&_a]:text-primary [&_a]:underline", styleClasses)}><AlertCircle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" /><div className="flex-1 min-w-0">{block.calloutTitle && <p className="text-sm font-semibold mb-1">{block.calloutTitle}</p>}<p className="text-sm" dangerouslySetInnerHTML={{ __html: renderHtml(block.content) }} /></div></div>;
    case "callout-tip":
      return <div className={cn("rounded-xl p-4 bg-green-500/10 border border-green-500/30 flex gap-3 not-prose [&_a]:text-primary [&_a]:underline", styleClasses)}><Lightbulb className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" /><div className="flex-1 min-w-0">{block.calloutTitle && <p className="text-sm font-semibold mb-1">{block.calloutTitle}</p>}<p className="text-sm" dangerouslySetInnerHTML={{ __html: renderHtml(block.content) }} /></div></div>;
    case "callout-success":
      return <div className={cn("rounded-xl p-4 bg-emerald-500/10 border border-emerald-500/30 flex gap-3 not-prose [&_a]:text-primary [&_a]:underline", styleClasses)}><CheckCircle className="w-5 h-5 text-emerald-500 flex-shrink-0 mt-0.5" /><div className="flex-1 min-w-0">{block.calloutTitle && <p className="text-sm font-semibold mb-1">{block.calloutTitle}</p>}<p className="text-sm" dangerouslySetInnerHTML={{ __html: renderHtml(block.content) }} /></div></div>;
    case "callout-danger":
      return <div className={cn("rounded-xl p-4 bg-red-500/10 border border-red-500/30 flex gap-3 not-prose [&_a]:text-primary [&_a]:underline", styleClasses)}><XCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" /><div className="flex-1 min-w-0">{block.calloutTitle && <p className="text-sm font-semibold mb-1">{block.calloutTitle}</p>}<p className="text-sm" dangerouslySetInnerHTML={{ __html: renderHtml(block.content) }} /></div></div>;
    case "highlight":
      return (
        <div className={cn("rounded-xl p-4 border border-yellow-400/40 bg-gradient-to-r from-yellow-400/10 via-amber-400/5 to-transparent relative overflow-hidden not-prose [&_a]:text-primary [&_a]:underline", styleClasses)}>
          <div className="absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-yellow-400 via-amber-500 to-orange-500" />
          <div className="pl-3 flex gap-3">
            <Highlighter className="w-5 h-5 text-yellow-500 flex-shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              {block.calloutTitle && <p className="text-sm font-semibold mb-1">{block.calloutTitle}</p>}
              <p className="text-sm" dangerouslySetInnerHTML={{ __html: renderHtml(block.content) }} />
            </div>
          </div>
        </div>
      );
    case "accordion":
      return (
        <div className="rounded-xl border border-purple-500/30 bg-purple-500/5 overflow-hidden not-prose [&_a]:text-primary [&_a]:underline">
          <button className="w-full flex items-center gap-2 p-3 text-left hover:bg-purple-500/10" onClick={() => setAccordionOpen(!accordionOpen)}>
            {accordionOpen ? <ChevronDown className="w-4 h-4 text-purple-500" /> : <ChevronRight className="w-4 h-4 text-purple-500" />}
            <span className="font-medium">{block.accordionTitle}</span>
          </button>
          {accordionOpen && <div className="p-3 pt-0 border-t border-purple-500/20"><p className="text-sm" dangerouslySetInnerHTML={{ __html: renderHtml(block.content) }} /></div>}
        </div>
      );
    case "divider":
      return <hr className="border-border my-2" />;
    case "document":
      if (!block.documentUrl) return null;
      const docExt = block.documentName?.split('.').pop()?.toLowerCase();
      const isPdf = docExt === 'pdf';
      const previewUrl = isPdf
        ? `https://docs.google.com/gview?url=${encodeURIComponent(block.documentUrl)}&embedded=true`
        : `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(block.documentUrl)}`;
      return (
        <div className="rounded-xl border border-indigo-500/30 bg-indigo-500/5 overflow-hidden not-prose">
          <div className="flex items-center gap-3 p-3 border-b border-indigo-500/20">
            <div className="w-8 h-8 rounded-lg bg-indigo-500/10 flex items-center justify-center">
              <BookOpen className="w-4 h-4 text-indigo-500" />
            </div>
            <span className="font-medium text-sm truncate flex-1">{block.documentName || 'Документ'}</span>
            <a href={block.documentUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-indigo-500 hover:underline">Скачать</a>
          </div>
          <div className="aspect-[4/3]">
            <iframe src={previewUrl} className="w-full h-full border-0" />
          </div>
        </div>
      );
    case "quiz":
      const options = block.quizOptions || [];
      const correctIndex = options.findIndex(o => o.isCorrect);
      const isCorrect = quizSubmitted && quizAnswer === correctIndex;
      return (
        <div className="rounded-xl border border-primary/30 bg-primary/5 p-4 space-y-3 not-prose">
          <div className="flex items-center gap-2 text-primary"><HelpCircle className="w-5 h-5" /><span className="font-medium">Проверьте себя</span></div>
          <p className="font-medium">{block.quizQuestion}</p>
          <div className="space-y-2">
            {options.map((option, i) => (
              <button key={i} onClick={() => onQuizAnswer(i)} disabled={quizSubmitted} className={cn("w-full text-left p-3 rounded-lg border transition-all", quizAnswer === i && !quizSubmitted && "border-primary bg-primary/10", quizSubmitted && option.isCorrect && "border-green-500 bg-green-500/10", quizSubmitted && quizAnswer === i && !option.isCorrect && "border-destructive bg-destructive/10", !quizSubmitted && quizAnswer !== i && "border-border hover:border-primary/50")}>
                {option.text}
              </button>
            ))}
          </div>
          {!quizSubmitted && quizAnswer !== undefined && <Button onClick={onQuizSubmit} size="sm">Проверить</Button>}
          {quizSubmitted && <div className={cn("p-3 rounded-lg text-sm", isCorrect ? "bg-green-500/10 text-green-700 dark:text-green-400" : "bg-destructive/10 text-destructive")}>{isCorrect ? "Правильно! " : "Неправильно. "}{block.quizExplanation}</div>}
        </div>
      );
    case "image":
      return block.imageSrc ? <img src={block.imageSrc} alt={block.imageAlt || ""} className="rounded-lg max-w-full h-auto not-prose" /> : null;
    case "video": {
      if (!block.videoUrl) return null;
      return <div className="not-prose"><VideoPreviewInline content={block.videoUrl} eager /></div>;
    }
    case "slider":
      const slides = block.sliderSlides || [];
      const currentIdx = sliderIndex ?? 0;
      const currentSlide = slides[currentIdx];
      if (slides.length === 0) return null;
      return (
        <div className="rounded-xl border border-orange-500/30 bg-orange-500/5 overflow-hidden not-prose">
          <div className="flex items-center justify-between p-3 border-b border-orange-500/20">
            <div className="flex items-center gap-2 text-orange-500">
              <Presentation className="w-5 h-5" />
              <span className="font-medium text-sm">{block.content || 'Презентация'}</span>
            </div>
            <span className="text-xs text-muted-foreground">
              {currentIdx + 1} / {slides.length}
            </span>
          </div>
          <div className="p-6 min-h-[250px]">
            {currentSlide && (
              <div className="space-y-4">
                {currentSlide.imageUrl && (
                  <div className="rounded-lg overflow-hidden border border-border bg-secondary/20">
                    <img 
                      src={currentSlide.imageUrl} 
                      alt={currentSlide.title || 'Слайд'} 
                      className="w-full max-h-[400px] object-contain"
                    />
                  </div>
                )}
                <h3 className="text-lg font-semibold">{currentSlide.title}</h3>
                {currentSlide.content && (
                  <div className="text-sm text-muted-foreground whitespace-pre-wrap">
                    {currentSlide.content}
                  </div>
                )}
              </div>
            )}
          </div>
          <div className="flex items-center justify-between p-3 border-t border-orange-500/20 bg-orange-500/5">
            <Button variant="ghost" size="sm" onClick={() => onSliderChange?.(currentIdx - 1)} disabled={currentIdx === 0} className="gap-1">
              <ChevronLeft className="w-4 h-4" /> Назад
            </Button>
            <div className="flex gap-1">
              {slides.map((_, i) => (
                <button key={i} onClick={() => onSliderChange?.(i)} className={cn("w-2 h-2 rounded-full transition-colors", i === currentIdx ? "bg-orange-500" : "bg-orange-500/30 hover:bg-orange-500/50")} />
              ))}
            </div>
            <Button variant="ghost" size="sm" onClick={() => onSliderChange?.(currentIdx + 1)} disabled={currentIdx === slides.length - 1} className="gap-1">
              Далее <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      );
    case "audio":
      return block.audioUrl ? (
        <div className="rounded-xl border border-teal-500/30 bg-teal-500/5 p-4 not-prose">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-lg bg-teal-500/10 flex items-center justify-center">
              <Headphones className="w-5 h-5 text-teal-500" />
            </div>
            <span className="font-medium text-sm">Аудио</span>
          </div>
          <audio controls preload="none" className="w-full">
            <source src={block.audioUrl} type="audio/mpeg" />
            Ваш браузер не поддерживает аудио.
          </audio>
        </div>
      ) : null;
    case "table": {
      const rows = block.tableRows || [];
      if (rows.length === 0) return null;
      const hasHeader = block.tableHasHeader !== false;
      return (
        <div className="overflow-x-auto not-prose">
          <table className="w-full border-collapse rounded-lg overflow-hidden border border-border">
            {hasHeader && rows[0] && (
              <thead className="bg-muted/60">
                <tr>{rows[0].map((cell, i) => <th key={i} className="border border-border px-3 py-2 text-left text-sm font-semibold">{cell}</th>)}</tr>
              </thead>
            )}
            <tbody>
              {(hasHeader ? rows.slice(1) : rows).map((row, rIdx) => (
                <tr key={rIdx}>{row.map((cell, cIdx) => <td key={cIdx} className="border border-border px-3 py-2 text-sm">{cell}</td>)}</tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    }
    case "button": {
      const variant = block.buttonVariant || "primary";
      const align = block.buttonAlign || "left";
      const url = block.buttonUrl || "#";
      const label = block.buttonLabel || "Нажмите";
      const cls = cn(
        "inline-flex items-center justify-center px-5 h-10 rounded-md text-sm font-medium transition-colors",
        variant === "primary" && "bg-primary text-primary-foreground hover:bg-primary/90",
        variant === "outline" && "border border-input bg-background hover:bg-accent",
        variant === "ghost" && "hover:bg-accent text-foreground"
      );
      const wrap = cn("flex not-prose", align === "center" && "justify-center", align === "right" && "justify-end");
      return (
        <div className={wrap}>
          <a href={url} target="_blank" rel="noopener noreferrer" className={cls}>{label}</a>
        </div>
      );
    }
    case "embed": {
      const src = getEmbedSrc(block.embedUrl || "");
      if (!src) return null;
      const height = block.embedHeight || 480;
      return (
        <div className="rounded-lg overflow-hidden border border-border bg-black not-prose" style={{ height }}>
          <iframe src={src} className="w-full h-full border-0" allow="autoplay; fullscreen; picture-in-picture; encrypted-media; clipboard-write" allowFullScreen referrerPolicy="no-referrer-when-downgrade" />
        </div>
      );
    }
    case "code":
      return (
        <pre className="not-prose rounded-lg border border-border bg-muted/40 p-4 overflow-x-auto"><code className={`language-${block.codeLanguage || "plaintext"} font-mono text-sm`}>{block.content || ""}</code></pre>
      );
    case "formula":
      return <div className="not-prose"><FormulaRender tex={block.content || ""} displayMode={block.formulaDisplayMode !== "inline"} /></div>;
    default:
      return null;
  }
}

export function BlockRenderer({ blocks }: { blocks: ContentBlock[] }) {
  const [quizAnswers, setQuizAnswers] = useState<Record<string, number>>({});
  const [quizSubmitted, setQuizSubmitted] = useState<Record<string, boolean>>({});
  const [sliderIndices, setSliderIndices] = useState<Record<string, number>>({});

  return (
    <div className="prose prose-sm max-w-none dark:prose-invert space-y-4 [&_a]:!text-primary [&_a]:!underline [&_a]:!underline-offset-2 [&_a]:cursor-pointer [&_a]:break-all [&_a]:transition-opacity hover:[&_a]:opacity-80">
      {blocks.map((block) => (
        <RenderBlock
          key={block.id}
          block={block}
          quizAnswer={quizAnswers[block.id]}
          quizSubmitted={quizSubmitted[block.id]}
          onQuizAnswer={(index) => setQuizAnswers(prev => ({ ...prev, [block.id]: index }))}
          onQuizSubmit={() => setQuizSubmitted(prev => ({ ...prev, [block.id]: true }))}
          sliderIndex={sliderIndices[block.id] ?? (block.sliderCurrentIndex || 0)}
          onSliderChange={(index) => setSliderIndices(prev => ({ ...prev, [block.id]: index }))}
        />
      ))}
    </div>
  );
}
