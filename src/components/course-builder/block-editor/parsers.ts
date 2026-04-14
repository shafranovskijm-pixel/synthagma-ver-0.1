import type { ContentBlock } from "./types";

export function blocksToJson(blocks: ContentBlock[]): string {
  return JSON.stringify(blocks);
}

export function jsonToBlocks(json: string): ContentBlock[] {
  try { return JSON.parse(json); } catch { return []; }
}

/** Normalize a single line: trim leading whitespace, split compound lines like "--- ### Heading" */
function normalizeLines(rawLines: string[]): string[] {
  const out: string[] = [];
  for (const raw of rawLines) {
    const line = raw.trimStart();
    const compound = line.match(/^([-*_]{3,})\s+(#{1,6}\s+.*)$/);
    if (compound) {
      out.push(compound[1]);
      out.push(compound[2]);
    } else {
      out.push(line);
    }
  }
  return out;
}

/** Convert plain Markdown text into ContentBlock[] */
export function markdownToBlocks(md: string): ContentBlock[] {
  if (!md || typeof md !== "string") return [];

  const trimmed = md.trim();
  if (trimmed.startsWith("[")) {
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) return parsed;
    } catch { /* not JSON, proceed with markdown parsing */ }
  }

  const blocks: ContentBlock[] = [];
  const lines = normalizeLines(md.split("\n"));
  let i = 0;

  const mkId = () => crypto.randomUUID?.() ?? `block-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  while (i < lines.length) {
    const line = lines[i];

    if (!line.trim()) { i++; continue; }

    // ::: callout / highlight / accordion markers — inline format
    const inlineMarkerMatch = line.match(/^:::(info|warning|tip|danger|highlight|accordion)\s*(.+?)\s*:::?\s*$/i);
    if (inlineMarkerMatch && inlineMarkerMatch[2].trim().length > 0) {
      const markerType = inlineMarkerMatch[1].toLowerCase();
      const content = inlineMarkerMatch[2].trim();
      const blockType = markerType === "highlight" ? "highlight"
        : markerType === "accordion" ? "accordion"
        : `callout-${markerType}`;
      const block: any = { id: mkId(), type: blockType, content };
      if (markerType === "accordion" && content) {
        block.accordionTitle = content.split("\n")[0];
      }
      blocks.push(block);
      i++; continue;
    }

    // ::: callout / highlight / accordion markers — multiline format
    const markerMatch = line.match(/^:::(info|warning|tip|danger|highlight|accordion)\s*(.*)?$/i);
    if (markerMatch) {
      const markerType = markerMatch[1].toLowerCase();
      const markerExtra = (markerMatch[2] || "").trim();
      i++;
      const bodyLines: string[] = [];
      while (i < lines.length && !/^:::\s*$/.test(lines[i].trimStart())) {
        bodyLines.push(lines[i]);
        i++;
      }
      if (i < lines.length) i++;
      const blockType = markerType === "highlight" ? "highlight"
        : markerType === "accordion" ? "accordion"
        : `callout-${markerType}`;
      const block: any = { id: mkId(), type: blockType, content: bodyLines.join("\n").trim() || markerExtra };
      if (markerType === "accordion" && markerExtra) {
        block.accordionTitle = markerExtra;
      }
      blocks.push(block);
      continue;
    }

    // Headings
    if (/^###+ /.test(line)) {
      blocks.push({ id: mkId(), type: "heading2", content: line.replace(/^#{3,}\s+/, "").trim() });
      i++; continue;
    }
    if (/^## /.test(line)) {
      blocks.push({ id: mkId(), type: "heading2", content: line.replace(/^## /, "").trim() });
      i++; continue;
    }
    if (/^# /.test(line)) {
      blocks.push({ id: mkId(), type: "heading1", content: line.replace(/^# /, "").trim() });
      i++; continue;
    }

    // Blockquote
    if (/^>\s?/.test(line)) {
      const quoteLines: string[] = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) {
        quoteLines.push(lines[i].replace(/^>\s?/, ""));
        i++;
      }
      blocks.push({ id: mkId(), type: "quote", content: quoteLines.join("\n") });
      continue;
    }

    // Unordered list
    if (/^[-*]\s/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^[-*]\s/.test(lines[i])) {
        items.push(lines[i].replace(/^[-*]\s/, ""));
        i++;
      }
      blocks.push({ id: mkId(), type: "bulletList", content: items.join("\n") });
      continue;
    }

    // Ordered list
    if (/^\d+\.\s/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\d+\.\s/.test(lines[i])) {
        items.push(lines[i].replace(/^\d+\.\s/, ""));
        i++;
      }
      blocks.push({ id: mkId(), type: "numberedList", content: items.join("\n") });
      continue;
    }

    // Horizontal rule → divider
    if (/^[-*_]{3,}\s*$/.test(line)) {
      blocks.push({ id: mkId(), type: "divider", content: "" });
      i++; continue;
    }

    // Regular paragraph
    const paraLines: string[] = [];
    while (i < lines.length && lines[i].trim() && !/^#{1,6}\s/.test(lines[i]) && !/^>\s?/.test(lines[i]) && !/^[-*]\s/.test(lines[i]) && !/^\d+\.\s/.test(lines[i]) && !/^[-*_]{3,}\s*$/.test(lines[i]) && !/^:::(info|warning|tip|danger|highlight|accordion)/i.test(lines[i]) && !/^:::\s*$/.test(lines[i])) {
      paraLines.push(lines[i]);
      i++;
    }
    if (paraLines.length) {
      let html = paraLines.join(" ")
        .replace(/\$\$(.+?)\$\$/g, "$1")
        .replace(/\$([^$]+?)\$/g, "$1")
        .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
        .replace(/\*(.+?)\*/g, "<em>$1</em>");
      blocks.push({ id: mkId(), type: "paragraph", content: html });
    }
  }

  return blocks;
}

export function htmlToBlocks(html: string): ContentBlock[] {
  const blocks: ContentBlock[] = [];
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");

  const processNode = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent?.trim();
      if (text) {
        blocks.push({ id: crypto.randomUUID(), type: "paragraph", content: text });
      }
      return;
    }

    if (node.nodeType !== Node.ELEMENT_NODE) return;

    const el = node as Element;
    const tagName = el.tagName.toLowerCase();

    switch (tagName) {
      case "h1":
        blocks.push({ id: crypto.randomUUID(), type: "heading1", content: el.textContent || "" });
        break;
      case "h2":
      case "h3":
        blocks.push({ id: crypto.randomUUID(), type: "heading2", content: el.textContent || "" });
        break;
      case "p":
        const imgInP = el.querySelector("img");
        if (imgInP && el.childNodes.length === 1) {
          blocks.push({ id: crypto.randomUUID(), type: "image", content: "", imageSrc: imgInP.getAttribute("src") || "", imageAlt: imgInP.getAttribute("alt") || "" });
        } else {
          blocks.push({ id: crypto.randomUUID(), type: "paragraph", content: el.innerHTML || "" });
        }
        break;
      case "ul":
        const bulletItems = Array.from(el.querySelectorAll(":scope > li")).map(li => li.innerHTML || "").join("\n");
        blocks.push({ id: crypto.randomUUID(), type: "bulletList", content: bulletItems });
        break;
      case "ol":
        const numberedItems = Array.from(el.querySelectorAll(":scope > li")).map(li => li.innerHTML || "").join("\n");
        blocks.push({ id: crypto.randomUUID(), type: "numberedList", content: numberedItems });
        break;
      case "blockquote":
        blocks.push({ id: crypto.randomUUID(), type: "quote", content: el.innerHTML || "" });
        break;
      case "img":
        blocks.push({ id: crypto.randomUUID(), type: "image", content: "", imageSrc: el.getAttribute("src") || "", imageAlt: el.getAttribute("alt") || "" });
        break;
      case "div":
      case "section":
      case "article":
      case "span":
        el.childNodes.forEach(processNode);
        break;
      default:
        el.childNodes.forEach(processNode);
    }
  };

  doc.body.childNodes.forEach(processNode);

  return blocks.filter(b => b.content || b.imageSrc || b.documentUrl || b.type === "quiz" || b.type === "accordion" || b.type === "image" || b.type === "document");
}
