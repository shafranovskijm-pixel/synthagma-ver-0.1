import { PDFDocument, PDFPage, PDFFont, rgb, RGB } from "pdf-lib";

export interface PartyInfo {
  fullName: string;
  email: string;
  signedAt: string | null;
  ip?: string | null;
  agreementId?: string | null;
  documentHash?: string | null;
}

export interface DrawStampOptions {
  font: PDFFont;
  fontBold: PDFFont;
  signatureMethod: "pep" | "handwritten_scan";
  documentTitle: string;
}

const A4 = { width: 595.28, height: 841.89 };
const MARGIN = 40;
const TEAL: RGB = rgb(0.06, 0.55, 0.49); // ~#0f8c7e
const TEXT: RGB = rgb(0.07, 0.07, 0.07);
const MUTED: RGB = rgb(0.4, 0.4, 0.4);
const STAMP_BG: RGB = rgb(0.94, 0.98, 0.97);

const fmtDate = (iso: string | null | undefined): string => {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("ru-RU", { timeZone: "Europe/Moscow" });
  } catch {
    return iso;
  }
};

/** Разбивает строку на строки, помещающиеся в maxWidth. */
function wrapText(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  if (!text) return [""];
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current = "";
  for (const w of words) {
    const test = current ? current + " " + w : w;
    if (font.widthOfTextAtSize(test, size) <= maxWidth) {
      current = test;
    } else {
      if (current) lines.push(current);
      // если одно слово длиннее ширины — разбиваем по символам
      if (font.widthOfTextAtSize(w, size) > maxWidth) {
        let chunk = "";
        for (const ch of w) {
          if (font.widthOfTextAtSize(chunk + ch, size) <= maxWidth) {
            chunk += ch;
          } else {
            lines.push(chunk);
            chunk = ch;
          }
        }
        current = chunk;
      } else {
        current = w;
      }
    }
  }
  if (current) lines.push(current);
  return lines;
}

interface DrawTextOpts {
  size?: number;
  color?: RGB;
  font?: PDFFont;
  maxWidth?: number;
  lineHeight?: number;
}

/** Возвращает Y после блока. */
function drawWrappedText(
  page: PDFPage,
  text: string,
  x: number,
  y: number,
  opts: DrawTextOpts & { font: PDFFont },
): number {
  const size = opts.size ?? 11;
  const color = opts.color ?? TEXT;
  const lh = opts.lineHeight ?? size * 1.35;
  const maxWidth = opts.maxWidth ?? A4.width - MARGIN * 2;
  const lines = wrapText(text, opts.font, size, maxWidth);
  let cy = y;
  for (const line of lines) {
    page.drawText(line, { x, y: cy, size, font: opts.font, color });
    cy -= lh;
  }
  return cy;
}

function drawStampBlock(
  page: PDFPage,
  party: PartyInfo,
  label: string,
  x: number,
  y: number,
  width: number,
  opts: DrawStampOptions,
): number {
  const { font, fontBold, signatureMethod } = opts;
  const padding = 12;
  const innerW = width - padding * 2;
  const lineH = 14;

  // Подсчёт высоты блока
  const rows: Array<[string, string]> = [
    ["ФИО:", party.fullName || "—"],
    ["Email:", party.email || "—"],
    ["Дата:", fmtDate(party.signedAt) + " (МСК)"],
  ];
  if (party.ip) rows.push(["IP:", party.ip]);
  if (party.agreementId) rows.push(["Соглашение:", `PEP-${party.agreementId.slice(0, 8).toUpperCase()}`]);
  if (party.documentHash) rows.push(["SHA-256:", party.documentHash]);

  // Считаем строки с переносом для хеша
  let contentLines = 0;
  for (const [, val] of rows) {
    const wrapped = wrapText(val, font, 9, innerW - 70);
    contentLines += wrapped.length;
  }
  const headerH = 22;
  const blockH = headerH + contentLines * lineH + padding * 2 + 6;

  // Рамка
  page.drawRectangle({
    x, y: y - blockH, width, height: blockH,
    color: STAMP_BG,
    borderColor: TEAL,
    borderWidth: 1.5,
  });

  // Заголовок
  const methodSuffix = signatureMethod === "handwritten_scan"
    ? "Скан с подписью"
    : "ПЭП (63-ФЗ)";
  page.drawText(`${label} · ${methodSuffix}`, {
    x: x + padding,
    y: y - padding - 9,
    size: 9,
    font: fontBold,
    color: TEAL,
  });
  // линия под заголовком
  page.drawLine({
    start: { x: x + padding, y: y - padding - 14 },
    end: { x: x + width - padding, y: y - padding - 14 },
    color: TEAL,
    thickness: 0.5,
    opacity: 0.3,
  });

  // Строки
  let cy = y - padding - headerH;
  for (const [k, v] of rows) {
    page.drawText(k, { x: x + padding, y: cy, size: 9, font, color: MUTED });
    const wrapped = wrapText(v, font, 9, innerW - 70);
    for (let i = 0; i < wrapped.length; i++) {
      page.drawText(wrapped[i], {
        x: x + padding + 70,
        y: cy - i * lineH,
        size: 9,
        font: k === "ФИО:" ? fontBold : font,
        color: TEXT,
      });
    }
    cy -= lineH * wrapped.length;
  }

  return blockH;
}

/** Добавляет финальную страницу со штампами обеих сторон. */
export function appendStampPage(
  pdf: PDFDocument,
  sender: PartyInfo | undefined,
  recipient: PartyInfo | undefined,
  opts: DrawStampOptions,
): PDFPage {
  const page = pdf.addPage([A4.width, A4.height]);
  const { font, fontBold, documentTitle, signatureMethod } = opts;

  // Шапка
  let y = A4.height - MARGIN;
  page.drawText("Подписи сторон", {
    x: MARGIN, y: y - 20, size: 18, font: fontBold, color: TEAL,
  });
  page.drawLine({
    start: { x: MARGIN, y: y - 28 },
    end: { x: A4.width - MARGIN, y: y - 28 },
    color: TEAL, thickness: 2,
  });
  y -= 44;

  page.drawText(`Документ: ${documentTitle}`, {
    x: MARGIN, y, size: 11, font: fontBold, color: TEXT,
    maxWidth: A4.width - MARGIN * 2,
  });
  y -= 18;

  const methodLabel = signatureMethod === "handwritten_scan"
    ? "Способ подписания: скан с собственноручной подписью и печатью"
    : "Способ подписания: ПЭП (Простая электронная подпись, 63-ФЗ)";
  page.drawText(methodLabel, { x: MARGIN, y, size: 9, font, color: MUTED });
  y -= 24;

  // Штампы — в столбик (надёжнее, чем в строку, при длинных строках)
  const blockWidth = A4.width - MARGIN * 2;

  if (sender?.signedAt) {
    const h = drawStampBlock(page, sender, "Отправитель (Оператор)", MARGIN, y, blockWidth, opts);
    y -= h + 16;
  }
  if (recipient?.signedAt) {
    const h = drawStampBlock(page, recipient, "Получатель", MARGIN, y, blockWidth, opts);
    y -= h + 16;
  }

  // Футер
  const footer = "Документ подписан в системе Синтагма. Подписи имеют юридическую силу, равную собственноручной (ст. 6 63-ФЗ).";
  drawWrappedText(page, footer, MARGIN, MARGIN + 20, {
    font, size: 8, color: MUTED, maxWidth: blockWidth, lineHeight: 11,
  });

  return page;
}

/** Очень простой парсер HTML → текстовые блоки. */
interface TextBlock {
  text: string;
  size: number;
  bold: boolean;
  spacingAfter: number;
}

function htmlToBlocks(html: string): TextBlock[] {
  // Нормализуем
  const cleaned = html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "");

  const blocks: TextBlock[] = [];
  const decode = (s: string) =>
    s.replace(/&nbsp;/g, " ")
     .replace(/&amp;/g, "&")
     .replace(/&lt;/g, "<")
     .replace(/&gt;/g, ">")
     .replace(/&quot;/g, '"')
     .replace(/&#39;/g, "'")
     .replace(/&laquo;/g, "«")
     .replace(/&raquo;/g, "»")
     .replace(/&mdash;/g, "—")
     .replace(/&ndash;/g, "–");

  const stripTags = (s: string) => decode(s.replace(/<[^>]+>/g, "")).replace(/\s+/g, " ").trim();

  // Делим по блочным тегам
  const blockRegex = /<(h[1-6]|p|li|tr|div|blockquote)[^>]*>([\s\S]*?)<\/\1>/gi;
  let m: RegExpExecArray | null;
  let lastIdx = 0;
  const fallbackChunks: string[] = [];

  while ((m = blockRegex.exec(cleaned))) {
    if (m.index > lastIdx) {
      const between = cleaned.slice(lastIdx, m.index);
      const t = stripTags(between);
      if (t) fallbackChunks.push(t);
    }
    const tag = m[1].toLowerCase();
    const inner = stripTags(m[2]);
    if (!inner) {
      lastIdx = blockRegex.lastIndex;
      continue;
    }
    if (/^h[1-3]$/.test(tag)) {
      const sz = tag === "h1" ? 16 : tag === "h2" ? 14 : 12;
      blocks.push({ text: inner, size: sz, bold: true, spacingAfter: 8 });
    } else if (tag === "li") {
      blocks.push({ text: "• " + inner, size: 11, bold: false, spacingAfter: 4 });
    } else if (tag === "blockquote") {
      blocks.push({ text: "» " + inner, size: 11, bold: false, spacingAfter: 6 });
    } else {
      blocks.push({ text: inner, size: 11, bold: false, spacingAfter: 6 });
    }
    lastIdx = blockRegex.lastIndex;
  }
  if (lastIdx < cleaned.length) {
    const tail = stripTags(cleaned.slice(lastIdx));
    if (tail) fallbackChunks.push(tail);
  }

  // Если совсем ничего не распарсилось — fallback на чистый текст
  if (blocks.length === 0) {
    const plain = stripTags(cleaned);
    if (plain) {
      // Делим длинный текст по двойным переносам
      for (const para of plain.split(/\s{4,}|\n{2,}/)) {
        const t = para.trim();
        if (t) blocks.push({ text: t, size: 11, bold: false, spacingAfter: 6 });
      }
    }
  } else if (fallbackChunks.length) {
    for (const t of fallbackChunks) {
      blocks.push({ text: t, size: 11, bold: false, spacingAfter: 6 });
    }
  }

  return blocks;
}

/** Рендерит HTML-договор как новые страницы PDF. */
export function appendHtmlAsPages(
  pdf: PDFDocument,
  html: string,
  documentTitle: string,
  font: PDFFont,
  fontBold: PDFFont,
): void {
  const blocks = htmlToBlocks(html);
  let page = pdf.addPage([A4.width, A4.height]);
  const maxWidth = A4.width - MARGIN * 2;
  let y = A4.height - MARGIN;

  // Заголовок документа
  page.drawText(documentTitle, {
    x: MARGIN, y: y - 18, size: 18, font: fontBold, color: TEAL,
    maxWidth,
  });
  page.drawLine({
    start: { x: MARGIN, y: y - 26 },
    end: { x: A4.width - MARGIN, y: y - 26 },
    color: TEAL, thickness: 2,
  });
  y -= 46;

  for (const b of blocks) {
    const f = b.bold ? fontBold : font;
    const lh = b.size * 1.4;
    const lines = wrapText(b.text, f, b.size, maxWidth);
    for (const line of lines) {
      if (y < MARGIN + lh) {
        page = pdf.addPage([A4.width, A4.height]);
        y = A4.height - MARGIN;
      }
      page.drawText(line, { x: MARGIN, y, size: b.size, font: f, color: TEXT });
      y -= lh;
    }
    y -= b.spacingAfter;
  }
}

/** Встраивает скан-изображение (jpg/png) на отдельной странице. */
export async function appendImagePage(
  pdf: PDFDocument,
  imageBytes: ArrayBuffer,
  mime: string,
  caption: string,
  fontBold: PDFFont,
): Promise<void> {
  const page = pdf.addPage([A4.width, A4.height]);
  page.drawText(caption, {
    x: MARGIN, y: A4.height - MARGIN - 14, size: 12, font: fontBold, color: TEAL,
  });

  let img;
  if (mime.includes("png")) {
    img = await pdf.embedPng(imageBytes);
  } else {
    img = await pdf.embedJpg(imageBytes);
  }
  const maxW = A4.width - MARGIN * 2;
  const maxH = A4.height - MARGIN * 2 - 40;
  const scale = Math.min(maxW / img.width, maxH / img.height);
  const w = img.width * scale;
  const h = img.height * scale;
  page.drawImage(img, {
    x: (A4.width - w) / 2,
    y: A4.height - MARGIN - 30 - h,
    width: w,
    height: h,
  });
}
