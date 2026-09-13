import DOMPurify from "dompurify";
import { parseLessonContent } from "@/components/course-builder/block-editor";

interface ReviewerQuizOption {
  text?: string;
}

interface ReviewerSlide {
  id?: string;
  title?: string;
  content?: string;
  imageUrl?: string;
}

interface ReviewerBlock {
  id?: string;
  type?: string;
  content?: string;
  accordionTitle?: string;
  calloutTitle?: string;
  quizQuestion?: string;
  quizOptions?: ReviewerQuizOption[];
  imageSrc?: string;
  imageAlt?: string;
  videoUrl?: string;
  audioUrl?: string;
  documentUrl?: string;
  documentName?: string;
  sliderSlides?: ReviewerSlide[];
  tableRows?: string[][];
  tableHasHeader?: boolean;
  buttonLabel?: string;
  buttonUrl?: string;
  embedUrl?: string;
  codeLanguage?: string;
}

function textValue(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function safeUrl(value?: unknown): string | undefined {
  if (typeof value !== "string" || !value) return undefined;
  try {
    const parsed = new URL(value, window.location.origin);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return undefined;
    return parsed.href;
  } catch {
    return undefined;
  }
}

function RichText({ value, className }: { value?: unknown; className?: string }) {
  if (typeof value !== "string" || !value) return null;
  return (
    <div
      className={className}
      dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(value) }}
    />
  );
}

function sanitizedHtml(value?: unknown) {
  return { __html: DOMPurify.sanitize(typeof value === "string" ? value : "") };
}

function renderBlock(block: ReviewerBlock, index: number) {
  const key = block.id || `review-block-${index}`;
  const content = textValue(block.content) || "";

  switch (block.type) {
    case "heading1":
      return <h2 key={key} className="text-2xl font-bold" dangerouslySetInnerHTML={sanitizedHtml(content)} />;
    case "heading2":
      return <h3 key={key} className="text-xl font-semibold" dangerouslySetInnerHTML={sanitizedHtml(content)} />;
    case "heading3":
      return <h4 key={key} className="text-lg font-semibold" dangerouslySetInnerHTML={sanitizedHtml(content)} />;
    case "heading4":
      return <h5 key={key} className="font-semibold" dangerouslySetInnerHTML={sanitizedHtml(content)} />;
    case "bulletList":
    case "numberedList": {
      const List = block.type === "bulletList" ? "ul" : "ol";
      const items = content.replace(/<\/?li>/gi, "").split("\n").filter(Boolean);
      return (
        <List key={key} className={block.type === "bulletList" ? "list-disc space-y-1 pl-6" : "list-decimal space-y-1 pl-6"}>
          {items.map((item, itemIndex) => (
            <li key={`${key}-item-${itemIndex}`} dangerouslySetInnerHTML={sanitizedHtml(item)} />
          ))}
        </List>
      );
    }
    case "quote":
      return <blockquote key={key} className="border-l-4 border-primary/40 pl-4 text-muted-foreground"><RichText value={content} /></blockquote>;
    case "callout-info":
    case "callout-warning":
    case "callout-tip":
    case "callout-success":
    case "callout-danger":
    case "highlight":
      return (
        <section key={key} className="rounded-xl border border-border bg-muted/40 p-4">
          {textValue(block.calloutTitle) && <p className="mb-2 font-semibold">{textValue(block.calloutTitle)}</p>}
          <RichText value={content} />
        </section>
      );
    case "accordion":
      return (
        <section key={key} className="rounded-xl border border-border p-4">
          <p className="mb-2 font-semibold">{textValue(block.accordionTitle) || "Раздел"}</p>
          <RichText value={content} />
        </section>
      );
    case "quiz":
      return (
        <section key={key} aria-label="Мини-тест без ключа ответа" className="rounded-xl border border-border p-4">
          <p className="font-semibold">{textValue(block.quizQuestion) || content || "Вопрос"}</p>
          <ol className="mt-3 list-[upper-alpha] space-y-2 pl-7">
            {(Array.isArray(block.quizOptions) ? block.quizOptions : []).map((option, optionIndex) => (
              <li key={`${key}-option-${optionIndex}`}>{textValue(option?.text) || `Вариант ${optionIndex + 1}`}</li>
            ))}
          </ol>
        </section>
      );
    case "image": {
      const url = safeUrl(block.imageSrc);
      return url ? <img key={key} src={url} alt={textValue(block.imageAlt) || "Материал урока"} className="max-h-[640px] rounded-xl object-contain" /> : null;
    }
    case "video": {
      const url = safeUrl(block.videoUrl || content);
      return url ? <video key={key} controls controlsList="nodownload" preload="metadata" className="w-full rounded-xl"><source src={url} /></video> : null;
    }
    case "audio": {
      const url = safeUrl(block.audioUrl || content);
      return url ? <audio key={key} controls controlsList="nodownload" preload="metadata" className="w-full"><source src={url} /></audio> : null;
    }
    case "slider":
      return (
        <section key={key} aria-label="Слайды презентации" className="space-y-3">
          {(Array.isArray(block.sliderSlides) ? block.sliderSlides : []).filter(
            (slide): slide is ReviewerSlide => Boolean(slide && typeof slide === "object"),
          ).map((slide, slideIndex) => {
            const imageUrl = safeUrl(slide.imageUrl);
            const slideTitle = textValue(slide.title);
            return (
              <article key={slide.id || `${key}-slide-${slideIndex}`} className="rounded-xl border border-border p-4">
                <p className="mb-2 text-sm font-semibold">{slideTitle || `Слайд ${slideIndex + 1}`}</p>
                {imageUrl && <img src={imageUrl} alt={slideTitle || `Слайд ${slideIndex + 1}`} className="mb-3 max-h-[520px] object-contain" />}
                <RichText value={slide.content} />
              </article>
            );
          })}
        </section>
      );
    case "divider":
      return <hr key={key} className="border-border" />;
    case "document": {
      const url = safeUrl(block.documentUrl);
      return url ? <a key={key} href={url} target="_blank" rel="noopener noreferrer" className="text-primary underline">{textValue(block.documentName) || "Открыть документ"}</a> : <p key={key}>{textValue(block.documentName) || "Документ"}</p>;
    }
    case "table":
      return (
        <div key={key} className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <tbody>
              {(Array.isArray(block.tableRows) ? block.tableRows : []).filter(Array.isArray).map((row, rowIndex) => (
                <tr key={`${key}-row-${rowIndex}`}>
                  {row.map((cell, cellIndex) => {
                    const Cell = block.tableHasHeader && rowIndex === 0 ? "th" : "td";
                    return <Cell key={`${key}-cell-${cellIndex}`} className="border border-border p-2 text-left"><RichText value={textValue(cell) || ""} /></Cell>;
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    case "button": {
      const url = safeUrl(block.buttonUrl);
      return url ? <a key={key} href={url} target="_blank" rel="noopener noreferrer" className="text-primary underline">{textValue(block.buttonLabel) || "Открыть ссылку"}</a> : <p key={key}>{textValue(block.buttonLabel) || content}</p>;
    }
    case "embed": {
      const url = safeUrl(block.embedUrl);
      return url ? <a key={key} href={url} target="_blank" rel="noopener noreferrer" className="text-primary underline">Открыть внешний материал</a> : null;
    }
    case "code":
      return <pre key={key} className="overflow-x-auto rounded-xl bg-muted p-4"><code data-language={textValue(block.codeLanguage)}>{content}</code></pre>;
    case "formula":
      return <pre key={key} className="overflow-x-auto rounded-xl border border-border p-3"><code>{content}</code></pre>;
    case "paragraph":
    default:
      return <RichText key={key} value={content} className="whitespace-pre-wrap break-words" />;
  }
}

export function ReviewerLessonContent({ content }: { content: string | null }) {
  if (!content?.trim()) {
    return <p className="text-muted-foreground">Содержимое элемента отсутствует.</p>;
  }

  const trimmedContent = content.trim();
  if (trimmedContent.startsWith("[") || trimmedContent.startsWith("{")) {
    try {
      if (!Array.isArray(JSON.parse(trimmedContent))) {
        return <p className="text-muted-foreground">Содержимое элемента отсутствует.</p>;
      }
    } catch {
      return <p className="text-muted-foreground">Содержимое элемента отсутствует.</p>;
    }
  }

  const blocks = parseLessonContent(content) as unknown as ReviewerBlock[];
  return <div className="space-y-4">{blocks.map(renderBlock)}</div>;
}
