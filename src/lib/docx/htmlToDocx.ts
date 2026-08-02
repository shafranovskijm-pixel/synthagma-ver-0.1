/**
 * Генерация настоящего редактируемого DOCX (OOXML) из HTML-разметки документа.
 * Без внешних зависимостей кроме jszip — важна поддержка кириллицы и таблиц.
 */
import JSZip from "jszip";

const CONTENT_TYPES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
</Types>`;

const RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;

const DOC_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`;

const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:docDefaults><w:rPrDefault><w:rPr>
<w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:cs="Times New Roman"/>
<w:sz w:val="24"/><w:szCs w:val="24"/><w:lang w:val="ru-RU"/>
</w:rPr></w:rPrDefault></w:docDefaults>
<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style>
<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/>
<w:pPr><w:spacing w:before="240" w:after="120"/><w:outlineLvl w:val="0"/></w:pPr>
<w:rPr><w:b/><w:sz w:val="32"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:basedOn w:val="Normal"/>
<w:pPr><w:spacing w:before="200" w:after="100"/><w:outlineLvl w:val="1"/></w:pPr>
<w:rPr><w:b/><w:sz w:val="28"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading3"><w:name w:val="heading 3"/><w:basedOn w:val="Normal"/>
<w:pPr><w:spacing w:before="160" w:after="80"/><w:outlineLvl w:val="2"/></w:pPr>
<w:rPr><w:b/><w:sz w:val="26"/></w:rPr></w:style>
</w:styles>`;

const SECTION = `<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="850" w:bottom="1134" w:left="1701" w:header="708" w:footer="708" w:gutter="0"/></w:sectPr>`;

export function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

interface InlineFmt {
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  center?: boolean;
  right?: boolean;
}

const BLOCK_TAGS = new Set(["P", "DIV", "H1", "H2", "H3", "H4", "H5", "H6", "LI", "SECTION", "ARTICLE", "HEADER", "FOOTER", "BLOCKQUOTE", "PRE", "TR", "TD", "TH", "TABLE", "UL", "OL", "BR", "HR"]);

function runXml(text: string, fmt: InlineFmt): string {
  if (!text) return "";
  const rPr: string[] = [];
  if (fmt.bold) rPr.push("<w:b/>");
  if (fmt.italic) rPr.push("<w:i/>");
  if (fmt.underline) rPr.push('<w:u w:val="single"/>');
  const props = rPr.length ? `<w:rPr>${rPr.join("")}</w:rPr>` : "";
  return `<w:r>${props}<w:t xml:space="preserve">${escapeXml(text)}</w:t></w:r>`;
}

function collectRuns(node: Node, fmt: InlineFmt, out: string[]): void {
  if (node.nodeType === 3) {
    const raw = (node.nodeValue || "").replace(/\s+/g, " ");
    if (raw.trim() === "" && !/^\s+$/.test(raw)) return;
    if (raw.trim() === "" ) {
      if (out.length) out.push(runXml(" ", fmt));
      return;
    }
    out.push(runXml(raw, fmt));
    return;
  }
  if (node.nodeType !== 1) return;
  const el = node as Element;
  const tag = el.tagName.toUpperCase();
  if (tag === "BR") { out.push("<w:r><w:br/></w:r>"); return; }
  const style = (el.getAttribute("style") || "").toLowerCase();
  const next: InlineFmt = {
    ...fmt,
    bold: fmt.bold || tag === "B" || tag === "STRONG" || /font-weight:\s*(bold|[6-9]00)/.test(style),
    italic: fmt.italic || tag === "I" || tag === "EM" || /font-style:\s*italic/.test(style),
    underline: fmt.underline || tag === "U" || /text-decoration:[^;]*underline/.test(style),
  };
  el.childNodes.forEach(child => collectRuns(child, next, out));
}

function alignFromStyle(el: Element): "center" | "right" | "both" | null {
  const style = (el.getAttribute("style") || "").toLowerCase();
  const attr = (el.getAttribute("align") || "").toLowerCase();
  const value = /text-align:\s*(center|right|justify)/.exec(style)?.[1] || attr;
  if (value === "center") return "center";
  if (value === "right") return "right";
  if (value === "justify") return "both";
  return null;
}

function paragraphXml(el: Element, opts: { styleId?: string; listPrefix?: string } = {}): string {
  const runs: string[] = [];
  if (opts.listPrefix) runs.push(runXml(opts.listPrefix, {}));
  el.childNodes.forEach(child => collectRuns(child, {}, runs));
  if (runs.length === 0) return "<w:p/>";
  const pPr: string[] = [];
  if (opts.styleId) pPr.push(`<w:pStyle w:val="${opts.styleId}"/>`);
  const align = alignFromStyle(el);
  if (align) pPr.push(`<w:jc w:val="${align}"/>`);
  const props = pPr.length ? `<w:pPr>${pPr.join("")}</w:pPr>` : "";
  return `<w:p>${props}${runs.join("")}</w:p>`;
}

function cellXml(cell: Element, widthPct: number): string {
  const hasBlocks = Array.from(cell.children).some(c => BLOCK_TAGS.has(c.tagName.toUpperCase()));
  const inner = hasBlocks ? blocksXml(cell) : paragraphXml(cell);
  const body = inner || "<w:p/>";
  const shading = cell.tagName.toUpperCase() === "TH" ? '<w:shd w:val="clear" w:color="auto" w:fill="EFEFEF"/>' : "";
  const span = Number(cell.getAttribute("colspan") || "1");
  const gridSpan = span > 1 ? `<w:gridSpan w:val="${span}"/>` : "";
  return `<w:tc><w:tcPr><w:tcW w:w="${Math.round(widthPct)}" w:type="pct"/>${gridSpan}${shading}</w:tcPr>${body}</w:tc>`;
}

function tableXml(table: Element): string {
  const rows = Array.from(table.querySelectorAll("tr"));
  if (rows.length === 0) return "";
  const maxCols = Math.max(...rows.map(r => r.querySelectorAll("td,th").length), 1);
  const widthPct = 5000 / maxCols;
  const grid = Array.from({ length: maxCols }).map(() => `<w:gridCol w:w="${Math.round(9355 / maxCols)}"/>`).join("");
  const borders = ["top", "left", "bottom", "right", "insideH", "insideV"]
    .map(s => `<w:${s} w:val="single" w:sz="4" w:space="0" w:color="000000"/>`)
    .join("");
  const body = rows
    .map(r => {
      const cells = Array.from(r.querySelectorAll("td,th"));
      if (cells.length === 0) return "";
      const isHeader = cells.every(c => c.tagName.toUpperCase() === "TH");
      const trPr = isHeader ? "<w:trPr><w:tblHeader/></w:trPr>" : "";
      return `<w:tr>${trPr}${cells.map(c => cellXml(c, widthPct)).join("")}</w:tr>`;
    })
    .join("");
  return `<w:tbl><w:tblPr><w:tblW w:w="5000" w:type="pct"/><w:tblBorders>${borders}</w:tblBorders></w:tblPr><w:tblGrid>${grid}</w:tblGrid>${body}</w:tbl>`;
}

function blocksXml(root: Element): string {
  const parts: string[] = [];

  const walk = (el: Element) => {
    Array.from(el.children).forEach(child => {
      const tag = child.tagName.toUpperCase();
      if (tag === "TABLE") { parts.push(tableXml(child)); return; }
      if (tag === "UL" || tag === "OL") {
        const items = Array.from(child.children).filter(c => c.tagName.toUpperCase() === "LI");
        items.forEach((li, i) => {
          parts.push(paragraphXml(li, { listPrefix: tag === "OL" ? `${i + 1}. ` : "— " }));
        });
        return;
      }
      if (/^H[1-6]$/.test(tag)) {
        const level = Math.min(3, Number(tag[1]));
        parts.push(paragraphXml(child, { styleId: `Heading${level}` }));
        return;
      }
      if (tag === "HR") { parts.push("<w:p/>"); return; }
      if (tag === "BR") { parts.push("<w:p/>"); return; }
      if (tag === "SCRIPT" || tag === "STYLE") return;

      const hasBlockChildren = Array.from(child.children).some(c => BLOCK_TAGS.has(c.tagName.toUpperCase()));
      if (hasBlockChildren) {
        // Текст, лежащий прямо в контейнере, не теряем.
        const direct = Array.from(child.childNodes).filter(n => n.nodeType === 3 && (n.nodeValue || "").trim());
        if (direct.length) {
          const runs: string[] = [];
          direct.forEach(n => collectRuns(n, {}, runs));
          if (runs.length) parts.push(`<w:p>${runs.join("")}</w:p>`);
        }
        walk(child);
        return;
      }
      parts.push(paragraphXml(child));
    });
  };

  walk(root);
  return parts.join("");
}

function parseHtml(html: string): Element {
  const doc = new DOMParser().parseFromString(html, "text/html");
  return doc.body;
}

/** HTML → строка word/document.xml (экспортируется для тестов). */
export function htmlToWordXml(html: string): string {
  const body = parseHtml(html);
  const content = blocksXml(body) || "<w:p/>";
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${content}${SECTION}</w:body></w:document>`;
}

function buildZip(html: string): JSZip {
  const zip = new JSZip();
  zip.file("[Content_Types].xml", CONTENT_TYPES);
  zip.folder("_rels")!.file(".rels", RELS);
  const word = zip.folder("word")!;
  word.file("document.xml", htmlToWordXml(html));
  word.file("styles.xml", STYLES);
  word.folder("_rels")!.file("document.xml.rels", DOC_RELS);
  return zip;
}

export async function htmlToDocxBlob(html: string): Promise<Blob> {
  return buildZip(html).generateAsync({
    type: "blob",
    mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  });
}

export function sanitizeFileName(name: string, ext: string): string {
  const base = (name || "document")
    .replace(/[\\/:*?"<>|]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80) || "document";
  return `${base}.${ext}`;
}

/** Несколько документов → один ZIP с DOCX внутри. */
export async function htmlDocsToZipBlob(docs: Array<{ name: string; html: string }>): Promise<Blob> {
  const zip = new JSZip();
  const used = new Set<string>();
  for (const doc of docs) {
    let fileName = sanitizeFileName(doc.name, "docx");
    let i = 2;
    while (used.has(fileName)) {
      fileName = sanitizeFileName(`${doc.name} (${i++})`, "docx");
    }
    used.add(fileName);
    const inner = await buildZip(doc.html).generateAsync({ type: "uint8array" });
    zip.file(fileName, inner);
  }
  return zip.generateAsync({ type: "blob", mimeType: "application/zip" });
}

export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
