import { Fragment } from "react";
import { parseLessonContent } from "@/components/course-builder/block-editor/parsers";
import { safeCourseInlineHtml } from "@/lib/courseFileConsumer";

export function CourseFileHeldNotice() {
  return <p role="status" className="text-sm text-muted-foreground">Встроенный материал пока недоступен: точная редакция и право доступа не подтверждены. Обратитесь в учебный центр.</p>;
}
/** Keep accepted text readable without letting a generic block renderer recreate
 * links or mount an unbound embedded resource while delivery is held/unknown. */
export function CourseTextWithoutResources({ content }: { content: string | null | undefined }) {
  const blocks = parseLessonContent(content || "");
  const html = (value: unknown) => ({ __html: safeCourseInlineHtml(typeof value === "string" ? value.replace(/\n/g, "<br/>") : "") });
  return <div className="prose prose-lg max-w-none dark:prose-invert">{blocks.map((block, index) => {
    const key = block.id || String(index);
    if (["image", "video", "audio", "slider", "document", "button", "embed", "quiz"].includes(block.type)) return <CourseFileHeldNotice key={key} />;
    if (block.type === "divider") return <hr key={key} />;
    if (block.type === "table") return <table key={key}><tbody>{(block.tableRows || []).map((row, ri) => <tr key={ri}>{row.map((cell, ci) => block.tableHasHeader && ri === 0 ? <th key={ci} dangerouslySetInnerHTML={html(cell)} /> : <td key={ci} dangerouslySetInnerHTML={html(cell)} />)}</tr>)}</tbody></table>;
    if (block.type === "code" || block.type === "formula") return <pre key={key}><code>{block.content}</code></pre>;
    const Tag = block.type === "heading1" ? "h1" : block.type === "heading2" ? "h2" : block.type === "heading3" ? "h3" : block.type === "heading4" ? "h4" : block.type === "quote" ? "blockquote" : "div";
    if (block.type === "bulletList" || block.type === "numberedList") {
      const items = (block.content || "").split("\n");
      return block.type === "bulletList" ? <ul key={key}>{items.map((item, i) => <li key={i} dangerouslySetInnerHTML={html(item)} />)}</ul> : <ol key={key}>{items.map((item, i) => <li key={i} dangerouslySetInnerHTML={html(item)} />)}</ol>;
    }
    return <Fragment key={key}>{(block.accordionTitle || block.calloutTitle) && <p><strong>{block.accordionTitle || block.calloutTitle}</strong></p>}<Tag className="whitespace-pre-wrap" dangerouslySetInnerHTML={html(block.content)} /></Fragment>;
  })}</div>;
}
