import { htmlToDocxBlob, downloadBlob } from "@/lib/docx/htmlToDocx";
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

// =================== WORD (OOXML DOCX) ===================
export async function exportCatalogToDocx(groups: CatalogGroup[]) {
  const total = totalCount(groups);
  const dateLabel = new Date().toLocaleDateString("ru-RU");

  const groupsHtml = groups
    .map(
      (g) => `
      <h2 style="font-family:'Times New Roman',serif;font-size:16pt;color:#0d7d7a;margin-top:18pt;margin-bottom:6pt;">
        ${escapeHtml(g.title)} <span style="font-size:11pt;color:#666;font-weight:normal;">— ${g.count} ${g.count >= 5 ? "курсов" : g.count >= 2 ? "курса" : "курс"}</span>
      </h2>
      <ul style="font-family:'Times New Roman',serif;font-size:12pt;margin:0 0 8pt 0;">
        ${g.courses
          .map((c) => {
            const title = `<b>${escapeHtml(c.title)}</b>`;
            const desc = c.description
              ? `<div style="color:#555;font-size:11pt;margin-top:2pt;">${escapeHtml(c.description)}</div>`
              : "";
            return `<li style="margin-bottom:5pt;">${title}${desc}</li>`;
          })
          .join("")}
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

  downloadBlob(await htmlToDocxBlob(html), `Каталог-курсов-Синтагма-${todayStr()}.docx`);
}

// =================== PDF (jsPDF, кириллица через встроенный шрифт PT Sans) ===================
async function ensureCyrillicFont(doc: jsPDF) {
  const abort=new AbortController(),timeout=setTimeout(()=>abort.abort(),15_000);
  try {
    for(const [file,style] of [['PTSans-Regular.ttf','normal'],['PTSans-Bold.ttf','bold']] as const) {
      const response=await fetch('/fonts/'+file,{signal:abort.signal,credentials:'omit',referrerPolicy:'no-referrer'});
      if(!response.ok) throw new Error('Не удалось загрузить шрифт с поддержкой кириллицы. PDF не сформирован.');
      const bytes=new Uint8Array(await response.arrayBuffer());
      if(bytes.length<100 || bytes.length>5_000_000) throw new Error('Некорректный шрифт PDF.');
      let binary='';for(const byte of bytes)binary+=String.fromCharCode(byte);
      doc.addFileToVFS(file,btoa(binary));doc.addFont(file,'PTSans',style);
    }
    doc.setFont('PTSans','normal');
  } finally {clearTimeout(timeout);}
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
    const headerLines: string[]=doc.splitTextToSize(header,contentWidth);
    for(const line of headerLines){ensureSpace(6);doc.text(line,marginX,y);y+=6;}y+=1;
    for(const course of g.courses) {
      doc.setTextColor(40,40,40);doc.setFontSize(10);
      const titleLines: string[]=doc.splitTextToSize('• '+course.title,contentWidth-4);
      for(const line of titleLines){ensureSpace(5);doc.text(line,marginX+4,y);y+=5;}
      if(course.description) {
        doc.setTextColor(110,110,110);doc.setFontSize(9);
        const descriptionLines: string[]=doc.splitTextToSize(course.description,contentWidth-8);
        for(const line of descriptionLines){ensureSpace(4.5);doc.text(line,marginX+8,y);y+=4.5;}
      }
      y+=1.5;
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
