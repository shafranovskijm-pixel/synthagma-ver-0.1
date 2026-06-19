import jsPDF from "jspdf";

export interface CatalogCourse {
  title: string;
  description?: string | null;
}

export interface CatalogGroup {
  title: string;
  count: number;
  courses: CatalogCourse[];
}

const todayStr = () => {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

const totalCount = (groups: CatalogGroup[]) =>
  groups.reduce((s, g) => s + (g.count || g.courses.length), 0);

const escapeHtml = (str: string) =>
  str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// =================== WORD (.doc через HTML, открывается MS Word/LibreOffice) ===================
export function exportCatalogToDocx(groups: CatalogGroup[]) {
  const total = totalCount(groups);
  const dateLabel = new Date().toLocaleDateString("ru-RU");

  const groupsHtml = groups
    .map(
      (g) => `
      <h2 style="font-family:'Times New Roman',serif;font-size:16pt;color:#0d7d7a;margin-top:18pt;margin-bottom:6pt;">
        ${escapeHtml(g.title)} <span style="font-size:11pt;color:#666;font-weight:normal;">— ${g.count} ${g.count >= 5 ? "курсов" : g.count >= 2 ? "курса" : "курс"}</span>
      </h2>
      <ul style="font-family:'Times New Roman',serif;font-size:12pt;margin:0 0 8pt 0;">
        ${g.courses.map((c) => `<li style="margin-bottom:3pt;">${escapeHtml(c)}</li>`).join("")}
      </ul>`
    )
    .join("");

  const html = `<!DOCTYPE html>
<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">
<head>
  <meta charset="utf-8">
  <title>Каталог программ обучения — Синтагма</title>
  <!--[if gte mso 9]><xml><w:WordDocument><w:View>Print</w:View><w:Zoom>100</w:Zoom></w:WordDocument></xml><![endif]-->
  <style>
    @page { size: A4; margin: 2cm; }
    body { font-family: 'Times New Roman', serif; font-size: 12pt; color: #1a1a1a; }
    h1 { font-size: 22pt; color: #0d7d7a; margin: 0 0 6pt 0; }
    .meta { color: #555; font-size: 11pt; margin-bottom: 16pt; }
    .footer { margin-top: 24pt; padding-top: 8pt; border-top: 1px solid #ccc; font-size: 10pt; color: #888; text-align: center; }
  </style>
</head>
<body>
  <h1>Каталог программ обучения</h1>
  <div class="meta">
    Платформа «Синтагма» — sintagma.com.ru<br>
    Дата выгрузки: ${dateLabel}<br>
    Всего: ${total} курсов в ${groups.length} направлениях
  </div>
  ${groupsHtml}
  <div class="footer">© Синтагма · Готовые программы обучения для организаций</div>
</body>
</html>`;

  const blob = new Blob(["\ufeff", html], { type: "application/msword" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `Каталог-курсов-Синтагма-${todayStr()}.doc`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// =================== PDF (jsPDF, кириллица через встроенный шрифт PT Sans) ===================
async function ensureCyrillicFont(doc: jsPDF) {
  // jsPDF + helvetica не поддерживает кириллицу. Подгружаем PT Sans (Google Fonts CDN) как base64.
  // Если не удалось — используем helvetica с транслитом fallback.
  try {
    const url = "https://fonts.gstatic.com/s/ptsans/v17/jizaRExUiTo99u79D0KExQ.ttf";
    const res = await fetch(url);
    if (!res.ok) throw new Error("font fetch failed");
    const buf = await res.arrayBuffer();
    let binary = "";
    const bytes = new Uint8Array(buf);
    for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
    const base64 = btoa(binary);
    doc.addFileToVFS("PTSans.ttf", base64);
    doc.addFont("PTSans.ttf", "PTSans", "normal");
    doc.addFont("PTSans.ttf", "PTSans", "bold");
    doc.setFont("PTSans", "normal");
    return true;
  } catch (e) {
    console.warn("Cyrillic font load failed, falling back to helvetica:", e);
    doc.setFont("helvetica", "normal");
    return false;
  }
}

export async function exportCatalogToPdf(groups: CatalogGroup[]) {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  await ensureCyrillicFont(doc);

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const marginX = 18;
  const marginTop = 18;
  const marginBottom = 18;
  const contentWidth = pageWidth - marginX * 2;

  let y = marginTop;
  const total = totalCount(groups);
  const dateLabel = new Date().toLocaleDateString("ru-RU");

  const ensureSpace = (h: number) => {
    if (y + h > pageHeight - marginBottom) {
      doc.addPage();
      y = marginTop;
    }
  };

  // Заголовок
  doc.setTextColor(13, 125, 122);
  doc.setFontSize(20);
  doc.text("Каталог программ обучения", marginX, y);
  y += 8;

  doc.setTextColor(85, 85, 85);
  doc.setFontSize(10);
  doc.text("Платформа «Синтагма» — sintagma.com.ru", marginX, y);
  y += 5;
  doc.text(`Дата выгрузки: ${dateLabel}`, marginX, y);
  y += 5;
  doc.text(`Всего: ${total} курсов в ${groups.length} направлениях`, marginX, y);
  y += 8;

  // Линия
  doc.setDrawColor(13, 125, 122);
  doc.setLineWidth(0.4);
  doc.line(marginX, y, pageWidth - marginX, y);
  y += 6;

  for (const g of groups) {
    ensureSpace(14);
    doc.setTextColor(13, 125, 122);
    doc.setFontSize(13);
    const declension = g.count >= 5 ? "курсов" : g.count >= 2 ? "курса" : "курс";
    const header = `${g.title}  —  ${g.count} ${declension}`;
    const headerLines = doc.splitTextToSize(header, contentWidth);
    doc.text(headerLines, marginX, y);
    y += headerLines.length * 6 + 1;

    doc.setTextColor(40, 40, 40);
    doc.setFontSize(10);
    for (const course of g.courses) {
      const lines = doc.splitTextToSize(`• ${course}`, contentWidth - 4);
      ensureSpace(lines.length * 5 + 1);
      doc.text(lines, marginX + 4, y);
      y += lines.length * 5 + 0.5;
    }
    y += 4;
  }

  // Footer на последней странице
  ensureSpace(10);
  doc.setDrawColor(200, 200, 200);
  doc.setLineWidth(0.2);
  doc.line(marginX, y, pageWidth - marginX, y);
  y += 5;
  doc.setTextColor(136, 136, 136);
  doc.setFontSize(9);
  doc.text("© Синтагма · Готовые программы обучения для организаций", pageWidth / 2, y, { align: "center" });

  doc.save(`Каталог-курсов-Синтагма-${todayStr()}.pdf`);
}
