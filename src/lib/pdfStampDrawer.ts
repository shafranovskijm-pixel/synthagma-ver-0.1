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
const INS_BG: RGB = rgb(0.86, 0.99, 0.84);    // light-green фон вставки
const INS_TEXT: RGB = rgb(0.08, 0.33, 0.18);  // тёмно-зелёный текст вставки
const INK_BLUE: RGB = rgb(0.10, 0.30, 0.75);  // синий «как чернила» — для watermark
const INK_BLUE_BG: RGB = rgb(0.93, 0.95, 1.0);

/**
 * Рисует компактный синий watermark-штамп ПЭП в правом нижнем углу страницы.
 * Если подписали обе стороны — рендерит две полоски рядом.
 */
export function drawSignatureWatermark(
  page: PDFPage,
  sender: PartyInfo | undefined,
  recipient: PartyInfo | undefined,
  font: PDFFont,
  fontBold: PDFFont,
  signatureMethod: "pep" | "handwritten_scan",
): void {
  const parties: Array<{ label: string; party: PartyInfo }> = [];
  if (sender?.signedAt) parties.push({ label: "Отправитель", party: sender });
  if (recipient?.signedAt) parties.push({ label: "Получатель", party: recipient });
  if (parties.length === 0) return;

  const { width: pageW } = page.getSize();
  const stampW = 175;
  const stampH = 64;
  const gap = 6;
  const marginR = 18;
  const marginB = 18;

  const totalW = parties.length * stampW + (parties.length - 1) * gap;
  let x = pageW - marginR - totalW;
  const y = marginB;

  const methodSuffix =
    signatureMethod === "handwritten_scan" ? "Скан · подпись" : "ПЭП · 63-ФЗ";

  for (const { label, party } of parties) {
    // Рамка
    page.drawRectangle({
      x, y, width: stampW, height: stampH,
      color: INK_BLUE_BG,
      borderColor: INK_BLUE,
      borderWidth: 0.8,
      opacity: 0.85,
      borderOpacity: 0.85,
    });

    // Заголовок
    page.drawText(`Подписано · ${methodSuffix}`, {
      x: x + 8, y: y + stampH - 12,
      size: 7, font: fontBold, color: INK_BLUE,
    });

    // ФИО (обрезаем по ширине)
    const fio = (party.fullName || party.email || "—").slice(0, 36);
    page.drawText(fio, {
      x: x + 8, y: y + stampH - 24,
      size: 8, font: fontBold, color: INK_BLUE,
    });

    // Роль
    page.drawText(label, {
      x: x + 8, y: y + stampH - 35,
      size: 7, font, color: INK_BLUE,
    });

    // Дата
    page.drawText(fmtDate(party.signedAt), {
      x: x + 8, y: y + stampH - 46,
      size: 7, font, color: INK_BLUE,
    });

    // Хеш / ID соглашения (последние 8)
    const tail = (party.documentHash || party.agreementId || "").slice(-8);
    if (tail) {
      page.drawText(`#${tail.toUpperCase()}`, {
        x: x + 8, y: y + 6,
        size: 6, font, color: INK_BLUE,
      });
    }

    x += stampW + gap;
  }
}

/** Применяет watermark ко всем страницам PDF, кроме указанных индексов. */
export function applyWatermarkToAllPages(
  pdf: PDFDocument,
  sender: PartyInfo | undefined,
  recipient: PartyInfo | undefined,
  font: PDFFont,
  fontBold: PDFFont,
  signatureMethod: "pep" | "handwritten_scan",
  skipIndices: Set<number> = new Set(),
): void {
  const pages = pdf.getPages();
  pages.forEach((page, i) => {
    if (skipIndices.has(i)) return;
    drawSignatureWatermark(page, sender, recipient, font, fontBold, signatureMethod);
  });
}

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

/** Очень простой парсер HTML → текстовые блоки с поддержкой <ins>. */
interface TextRun {
  text: string;
  inserted: boolean;
}
interface TextBlock {
  runs: TextRun[];
  size: number;
  bold: boolean;
  spacingAfter: number;
}

const decodeEntities = (s: string) =>
  s.replace(/&nbsp;/g, " ")
   .replace(/&amp;/g, "&")
   .replace(/&lt;/g, "<")
   .replace(/&gt;/g, ">")
   .replace(/&quot;/g, '"')
   .replace(/&#39;/g, "'")
   .replace(/&laquo;/g, "«")
   .replace(/&raquo;/g, "»")
   .replace(/&mdash;/g, "—")
   .replace(/&ndash;/g, "–")
   .replace(/<br\s*\/?>(\s*)/gi, " ");

/**
 * Преобразует inner HTML блока в массив runs.
 * Распознаёт <ins ...>...</ins> (и вложенный текст) — помечает как inserted.
 * Все остальные теги внутри удаляются (их текст сохраняется).
 */
function innerHtmlToRuns(inner: string): TextRun[] {
  if (!inner) return [];
  const runs: TextRun[] = [];
  // Регулярка для <ins>...</ins> (не вложенные ins)
  const insRe = /<ins\b[^>]*>([\s\S]*?)<\/ins>/gi;
  let lastIdx = 0;
  let m: RegExpExecArray | null;
  const pushPlain = (chunk: string) => {
    const t = decodeEntities(chunk.replace(/<[^>]+>/g, "")).replace(/\s+/g, " ");
    if (t) runs.push({ text: t, inserted: false });
  };
  while ((m = insRe.exec(inner))) {
    if (m.index > lastIdx) pushPlain(inner.slice(lastIdx, m.index));
    const insText = decodeEntities(m[1].replace(/<[^>]+>/g, "")).replace(/\s+/g, " ");
    if (insText) runs.push({ text: insText, inserted: true });
    lastIdx = insRe.lastIndex;
  }
  if (lastIdx < inner.length) pushPlain(inner.slice(lastIdx));
  // Склеиваем соседние runs одного типа
  const merged: TextRun[] = [];
  for (const r of runs) {
    const last = merged[merged.length - 1];
    if (last && last.inserted === r.inserted) {
      last.text = (last.text + r.text).replace(/\s{2,}/g, " ");
    } else {
      merged.push({ ...r });
    }
  }
  // Trim leading/trailing whitespace
  if (merged.length) {
    merged[0].text = merged[0].text.replace(/^\s+/, "");
    merged[merged.length - 1].text = merged[merged.length - 1].text.replace(/\s+$/, "");
  }
  return merged.filter((r) => r.text.length > 0);
}

function htmlToBlocks(html: string): TextBlock[] {
  const cleaned = html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "");

  const blocks: TextBlock[] = [];
  const blockRegex = /<(h[1-6]|p|li|tr|div|blockquote)[^>]*>([\s\S]*?)<\/\1>/gi;
  let m: RegExpExecArray | null;
  let lastIdx = 0;
  const fallbackChunks: string[] = [];

  while ((m = blockRegex.exec(cleaned))) {
    if (m.index > lastIdx) {
      const between = cleaned.slice(lastIdx, m.index);
      const t = decodeEntities(between.replace(/<[^>]+>/g, "")).replace(/\s+/g, " ").trim();
      if (t) fallbackChunks.push(t);
    }
    const tag = m[1].toLowerCase();
    const runs = innerHtmlToRuns(m[2]);
    if (runs.length === 0) {
      lastIdx = blockRegex.lastIndex;
      continue;
    }
    if (/^h[1-3]$/.test(tag)) {
      const sz = tag === "h1" ? 16 : tag === "h2" ? 14 : 12;
      blocks.push({ runs, size: sz, bold: true, spacingAfter: 8 });
    } else if (tag === "li") {
      runs[0] = { ...runs[0], text: "• " + runs[0].text };
      blocks.push({ runs, size: 11, bold: false, spacingAfter: 4 });
    } else if (tag === "blockquote") {
      runs[0] = { ...runs[0], text: "» " + runs[0].text };
      blocks.push({ runs, size: 11, bold: false, spacingAfter: 6 });
    } else {
      blocks.push({ runs, size: 11, bold: false, spacingAfter: 6 });
    }
    lastIdx = blockRegex.lastIndex;
  }
  if (lastIdx < cleaned.length) {
    const tail = decodeEntities(cleaned.slice(lastIdx).replace(/<[^>]+>/g, "")).replace(/\s+/g, " ").trim();
    if (tail) fallbackChunks.push(tail);
  }

  // Если ничего не распарсилось — делаем один блок из всего текста (с учётом <ins>)
  if (blocks.length === 0) {
    const runs = innerHtmlToRuns(cleaned);
    if (runs.length) {
      blocks.push({ runs, size: 11, bold: false, spacingAfter: 6 });
    }
  } else if (fallbackChunks.length) {
    for (const t of fallbackChunks) {
      blocks.push({ runs: [{ text: t, inserted: false }], size: 11, bold: false, spacingAfter: 6 });
    }
  }

  return blocks;
}

/** Token = слово или один пробел; используется при per-run wrapping. */
interface Token {
  text: string;
  inserted: boolean;
  isSpace: boolean;
}

function tokenizeRuns(runs: TextRun[]): Token[] {
  const tokens: Token[] = [];
  for (const r of runs) {
    const parts = r.text.split(/(\s+)/);
    for (const p of parts) {
      if (!p) continue;
      if (/^\s+$/.test(p)) {
        tokens.push({ text: " ", inserted: r.inserted, isSpace: true });
      } else {
        tokens.push({ text: p, inserted: r.inserted, isSpace: false });
      }
    }
  }
  return tokens;
}

/** Раскладывает токены на строки с переносом по maxWidth. */
function layoutTokens(
  tokens: Token[],
  font: PDFFont,
  size: number,
  maxWidth: number,
): Token[][] {
  const lines: Token[][] = [];
  let line: Token[] = [];
  let lineWidth = 0;
  const widthOf = (s: string) => font.widthOfTextAtSize(s, size);

  for (const tok of tokens) {
    // не начинаем строку с пробела
    if (tok.isSpace && line.length === 0) continue;
    const w = widthOf(tok.text);
    if (lineWidth + w > maxWidth && line.length > 0) {
      // убираем хвостовой пробел
      while (line.length && line[line.length - 1].isSpace) {
        const last = line.pop()!;
        lineWidth -= widthOf(last.text);
      }
      lines.push(line);
      line = [];
      lineWidth = 0;
      if (tok.isSpace) continue;
    }
    // если слово длиннее ширины — разбиваем по символам
    if (!tok.isSpace && w > maxWidth) {
      let chunk = "";
      for (const ch of tok.text) {
        if (widthOf(chunk + ch) > maxWidth && chunk) {
          line.push({ text: chunk, inserted: tok.inserted, isSpace: false });
          lines.push(line);
          line = [];
          lineWidth = 0;
          chunk = ch;
        } else {
          chunk += ch;
        }
      }
      if (chunk) {
        line.push({ text: chunk, inserted: tok.inserted, isSpace: false });
        lineWidth += widthOf(chunk);
      }
      continue;
    }
    line.push(tok);
    lineWidth += w;
  }
  if (line.length) {
    while (line.length && line[line.length - 1].isSpace) line.pop();
    if (line.length) lines.push(line);
  }
  return lines;
}

/** Рендерит HTML-договор как новые страницы PDF (с поддержкой <ins>). */
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
    const tokens = tokenizeRuns(b.runs);
    const lines = layoutTokens(tokens, f, b.size, maxWidth);

    for (const line of lines) {
      if (y < MARGIN + lh) {
        page = pdf.addPage([A4.width, A4.height]);
        y = A4.height - MARGIN;
      }
      // Рисуем токены последовательно с правильным цветом + фоном для inserted
      let cx = MARGIN;
      for (const tok of line) {
        const w = f.widthOfTextAtSize(tok.text, b.size);
        if (tok.inserted && !tok.isSpace) {
          // фон-прямоугольник
          const padY = 1.5;
          page.drawRectangle({
            x: cx - 1,
            y: y - padY,
            width: w + 2,
            height: b.size + padY * 1.5,
            color: INS_BG,
          });
        }
        page.drawText(tok.text, {
          x: cx,
          y,
          size: b.size,
          font: f,
          color: tok.inserted ? INS_TEXT : TEXT,
        });
        cx += w;
      }
      y -= lh;
    }
    y -= b.spacingAfter;
  }
}

/** Описание принятой правки для итоговой страницы со списком. */
export interface AcceptedEditSummary {
  id: string;
  kind: "insert" | "replace" | "delete";
  before?: string;
  after?: string;
}

/** Добавляет страницу «Принятые правки клиента» (для PDF-вложений). */
export function appendAcceptedEditsListPage(
  pdf: PDFDocument,
  edits: AcceptedEditSummary[],
  font: PDFFont,
  fontBold: PDFFont,
): void {
  if (!edits || edits.length === 0) return;
  let page = pdf.addPage([A4.width, A4.height]);
  const maxWidth = A4.width - MARGIN * 2;
  let y = A4.height - MARGIN;

  page.drawText("Принятые правки клиента", {
    x: MARGIN, y: y - 18, size: 16, font: fontBold, color: TEAL,
  });
  page.drawLine({
    start: { x: MARGIN, y: y - 26 },
    end: { x: A4.width - MARGIN, y: y - 26 },
    color: TEAL, thickness: 1.5,
  });
  y -= 44;

  page.drawText(
    "Перечисленные правки приняты организацией и являются неотъемлемой частью договора.",
    { x: MARGIN, y, size: 9, font, color: MUTED, maxWidth },
  );
  y -= 18;

  edits.forEach((e, i) => {
    const num = `${i + 1}.`;
    const label =
      e.kind === "insert" ? "Вставить:"
      : e.kind === "delete" ? "Удалить:"
      : "Заменить:";
    const headerLine = `${num} ${label}`;

    if (y < MARGIN + 60) {
      page = pdf.addPage([A4.width, A4.height]);
      y = A4.height - MARGIN;
    }
    page.drawText(headerLine, { x: MARGIN, y, size: 11, font: fontBold, color: TEAL });
    y -= 16;

    const drawTextBlock = (label: string, text: string, color: RGB, bg?: RGB) => {
      const lines = wrapText(text, font, 10, maxWidth - 12);
      const blockH = lines.length * 13 + 8;
      if (y - blockH < MARGIN) {
        page = pdf.addPage([A4.width, A4.height]);
        y = A4.height - MARGIN;
      }
      if (bg) {
        page.drawRectangle({
          x: MARGIN, y: y - blockH + 4, width: maxWidth, height: blockH,
          color: bg,
        });
      }
      page.drawText(label, { x: MARGIN + 6, y: y - 4, size: 8, font: fontBold, color: MUTED });
      let cy = y - 16;
      for (const ln of lines) {
        page.drawText(ln, { x: MARGIN + 6, y: cy, size: 10, font, color });
        cy -= 13;
      }
      y -= blockH + 4;
    };

    if ((e.kind === "delete" || e.kind === "replace") && e.before) {
      drawTextBlock("Было:", e.before, MUTED);
    }
    if ((e.kind === "insert" || e.kind === "replace") && e.after) {
      drawTextBlock("Стало:", e.after, INS_TEXT, INS_BG);
    }
    y -= 6;
  });
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
