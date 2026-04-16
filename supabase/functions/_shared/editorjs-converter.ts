// EditorJS blocks → project JSON blocks converter

export function cleanHtml(text: string): string {
  if (!text) return text;
  return text
    .replace(/&nbsp;/gi, " ")
    .replace(/\u00A0/g, " ")
    .replace(/ {2,}/g, " ");
}

export function makeId(): string {
  return crypto.randomUUID().replace(/-/g, "").slice(0, 8);
}

export function editorBlocksToJsonBlocks(blocks: any[]): any[] {
  if (!Array.isArray(blocks)) return [];
  const result: any[] = [];
  for (const block of blocks) {
    const converted = convertBlock(block);
    if (converted) result.push(converted);
  }
  return result;
}

function convertBlock(block: any): any | null {
  const { type, data } = block;
  if (!data) return null;

  switch (type) {
    case "paragraph":
      if (!data.text) return null;
      return { id: makeId(), type: "paragraph", content: cleanHtml(data.text) };

    case "header": {
      const level = data.level || 2;
      return {
        id: makeId(),
        type: level <= 1 ? "heading1" : "heading2",
        content: cleanHtml(data.text || ""),
      };
    }

    case "image": {
      const src = data.file?.url || data.url || "";
      if (!src) return null;
      return {
        id: makeId(),
        type: "image",
        content: cleanHtml(data.caption || ""),
        imageSrc: src,
        imageAlt: cleanHtml(data.caption || ""),
      };
    }

    case "list":
    case "nestedList": {
      const style = data.style === "ordered" ? "numberedList" : "bulletList";
      const text = cleanHtml(flattenListItems(data.items || []));
      return { id: makeId(), type: style, content: text };
    }

    case "delimiter":
      return { id: makeId(), type: "divider", content: "" };

    case "quote":
      return {
        id: makeId(),
        type: "quote",
        content: cleanHtml((data.text || "") + (data.caption ? `\n— ${data.caption}` : "")),
      };

    case "table": {
      if (!data.content || !Array.isArray(data.content)) return null;
      const html = renderTableHtml(data);
      return { id: makeId(), type: "paragraph", content: cleanHtml(html) };
    }

    case "video":
      return {
        id: makeId(),
        type: "video",
        content: "",
        videoUrl: data.url || data.file?.url || "",
      };

    case "embed":
      return {
        id: makeId(),
        type: "paragraph",
        content: `<em>[Embed: ${data.source || data.embed || ""}]</em>`,
      };

    case "attaches":
    case "file":
      return {
        id: makeId(),
        type: "document",
        content: cleanHtml(data.title || data.file?.name || "Вложение"),
        documentUrl: data.file?.url || "",
        documentName: cleanHtml(data.title || data.file?.name || "Вложение"),
      };

    case "warning":
      return {
        id: makeId(),
        type: "callout-warning",
        content: cleanHtml(`<strong>${data.title || ""}</strong>\n${data.message || ""}`),
      };

    case "code":
      return {
        id: makeId(),
        type: "paragraph",
        content: `<pre><code>${data.code || ""}</code></pre>`,
      };

    case "raw":
      if (!data.html) return null;
      return { id: makeId(), type: "paragraph", content: cleanHtml(data.html) };

    default:
      if (data.text) return { id: makeId(), type: "paragraph", content: cleanHtml(data.text) };
      return null;
  }
}

export function flattenListItems(items: any[]): string {
  return items
    .map((item: any) => {
      if (typeof item === "string") return `<li>${item}</li>`;
      const content = item.content || item.text || "";
      const nested =
        item.items && item.items.length > 0
          ? `<ul>${flattenListItems(item.items)}</ul>`
          : "";
      return `<li>${content}${nested}</li>`;
    })
    .join("");
}

export function renderTableHtml(data: any): string {
  if (!data.content || !Array.isArray(data.content)) return "";
  const rows = data.content
    .map((row: string[], i: number) => {
      const tag = data.withHeadings && i === 0 ? "th" : "td";
      const cells = row.map((c: string) => `<${tag}>${c}</${tag}>`).join("");
      return `<tr>${cells}</tr>`;
    })
    .join("");
  return `<table>${rows}</table>`;
}
