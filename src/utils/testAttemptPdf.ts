import { format } from "date-fns";
import { ru } from "date-fns/locale";

interface QuestionForExport {
  id: string;
  question: string;
  options: any[];
  correct_answer: number | null;
  explanation?: string | null;
}

interface TestAttemptExportData {
  studentName: string;
  courseTitle: string;
  testTitle: string;
  completedAt: string;
  score: number;
  maxScore: number;
  percentage: number;
  isPassed: boolean;
  passingScore: number;
  questions: QuestionForExport[];
  answers: Record<string, number>;
}

const optText = (opt: any): string =>
  typeof opt === "object" && opt !== null ? String((opt as any).text ?? "") : String(opt ?? "");

const buildFilename = (data: TestAttemptExportData, ext: string) => {
  const safe = data.testTitle.substring(0, 40).replace(/[^a-zA-Z0-9а-яА-ЯёЁ_-]+/g, "_");
  const date = format(new Date(data.completedAt), "yyyy-MM-dd");
  return `test_${safe}_${date}.${ext}`;
};

/** PDF через html2canvas — корректно рендерит кириллицу (шрифты браузера). */
export async function generateTestAttemptPdf(data: TestAttemptExportData) {
  const [{ default: html2canvas }, { default: jsPDF }] = await Promise.all([
    import("html2canvas"),
    import("jspdf"),
  ]);

  const dateStr = format(new Date(data.completedAt), "d MMMM yyyy, HH:mm", { locale: ru });

  const container = document.createElement("div");
  container.style.cssText = [
    "position:fixed",
    "left:-10000px",
    "top:0",
    "width:794px", // ~ A4 @ 96dpi
    "padding:32px",
    "background:#ffffff",
    "color:#111111",
    "font-family:'Inter','Helvetica Neue',Arial,sans-serif",
    "font-size:12px",
    "line-height:1.45",
    "box-sizing:border-box",
  ].join(";");

  const esc = (s: string) =>
    s
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");

  const questionsHtml = data.questions
    .map((q, idx) => {
      const studentAnswer = data.answers[q.id];
      const optionsHtml = q.options
        .map((opt, optIdx) => {
          const isStudentChoice = studentAnswer === optIdx;
          const isCorrectOption = q.correct_answer === optIdx;
          let bg = "#ffffff";
          let border = "#e5e7eb";
          let mark = "";
          if (isStudentChoice && isCorrectOption) {
            bg = "#ecfdf5"; border = "#10b981"; mark = "✓ ";
          } else if (isStudentChoice) {
            bg = "#fef2f2"; border = "#ef4444"; mark = "✗ ";
          } else if (isCorrectOption) {
            bg = "#f0fdf4"; border = "#86efac"; mark = "→ ";
          }
          return `<div style="padding:6px 10px;margin:3px 0;border-radius:6px;border:1px solid ${border};background:${bg};font-size:11px">${mark}${esc(optText(opt))}</div>`;
        })
        .join("");
      const explanationHtml = q.explanation
        ? `<div style="margin-top:6px;padding:6px 10px;background:#f8fafc;border-left:3px solid #94a3b8;font-size:10.5px;color:#475569">💡 ${esc(q.explanation)}</div>`
        : "";
      return `
        <div style="margin-bottom:14px;padding:12px;border:1px solid #e5e7eb;border-radius:8px;page-break-inside:avoid">
          <div style="font-weight:600;font-size:12px;margin-bottom:6px">${idx + 1}. ${esc(q.question)}</div>
          ${optionsHtml}
          ${explanationHtml}
        </div>
      `;
    })
    .join("");

  const statusColor = data.isPassed ? "#10b981" : "#ef4444";
  const statusText = data.isPassed ? "Пройден" : "Не пройден";

  container.innerHTML = `
    <div style="border-bottom:2px solid #111;padding-bottom:12px;margin-bottom:16px">
      <div style="font-size:20px;font-weight:700">Отчёт о тестировании</div>
      <div style="font-size:11px;color:#666;margin-top:4px">${esc(dateStr)}</div>
    </div>
    <table style="width:100%;font-size:12px;margin-bottom:16px;border-collapse:collapse">
      <tbody>
        <tr><td style="padding:4px 0;color:#666;width:150px">Ученик</td><td style="padding:4px 0;font-weight:600">${esc(data.studentName)}</td></tr>
        <tr><td style="padding:4px 0;color:#666">Курс</td><td style="padding:4px 0">${esc(data.courseTitle)}</td></tr>
        <tr><td style="padding:4px 0;color:#666">Тест</td><td style="padding:4px 0">${esc(data.testTitle)}</td></tr>
        <tr><td style="padding:4px 0;color:#666">Результат</td><td style="padding:4px 0;font-weight:600">${data.score} из ${data.maxScore} (${data.percentage}%)</td></tr>
        <tr><td style="padding:4px 0;color:#666">Проходной балл</td><td style="padding:4px 0">${data.passingScore}%</td></tr>
        <tr><td style="padding:4px 0;color:#666">Статус</td><td style="padding:4px 0"><span style="display:inline-block;padding:2px 10px;border-radius:12px;background:${statusColor};color:#fff;font-size:11px;font-weight:600">${statusText}</span></td></tr>
      </tbody>
    </table>
    <div>${questionsHtml}</div>
  `;

  document.body.appendChild(container);

  try {
    const canvas = await html2canvas(container, {
      scale: 2,
      useCORS: true,
      backgroundColor: "#ffffff",
      logging: false,
    });

    const pdf = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const margin = 8;
    const contentWidth = pageWidth - margin * 2;
    const contentHeight = pageHeight - margin * 2;

    const pxPerMm = canvas.width / contentWidth;
    const pageHeightPx = Math.floor(contentHeight * pxPerMm);

    let renderedPx = 0;
    let pageIdx = 0;
    while (renderedPx < canvas.height) {
      const sliceHeightPx = Math.min(pageHeightPx, canvas.height - renderedPx);
      const sliceCanvas = document.createElement("canvas");
      sliceCanvas.width = canvas.width;
      sliceCanvas.height = sliceHeightPx;
      const ctx = sliceCanvas.getContext("2d");
      if (!ctx) throw new Error("Canvas context unavailable");
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, sliceCanvas.width, sliceCanvas.height);
      ctx.drawImage(canvas, 0, renderedPx, canvas.width, sliceHeightPx, 0, 0, canvas.width, sliceHeightPx);
      const imgData = sliceCanvas.toDataURL("image/jpeg", 0.92);
      const imgHeightMm = sliceHeightPx / pxPerMm;
      if (pageIdx > 0) pdf.addPage();
      pdf.addImage(imgData, "JPEG", margin, margin, contentWidth, imgHeightMm, undefined, "FAST");
      renderedPx += sliceHeightPx;
      pageIdx += 1;
    }

    pdf.save(buildFilename(data, "pdf"));
  } finally {
    document.body.removeChild(container);
  }
}

/** Excel-экспорт (xlsx). */
export async function generateTestAttemptExcel(data: TestAttemptExportData) {
  const XLSX = await import("xlsx");

  const dateStr = format(new Date(data.completedAt), "d MMMM yyyy, HH:mm", { locale: ru });

  const summary = [
    ["Отчёт о тестировании"],
    [],
    ["Ученик", data.studentName],
    ["Курс", data.courseTitle],
    ["Тест", data.testTitle],
    ["Дата", dateStr],
    ["Результат", `${data.score} из ${data.maxScore} (${data.percentage}%)`],
    ["Проходной балл", `${data.passingScore}%`],
    ["Статус", data.isPassed ? "Пройден" : "Не пройден"],
  ];

  const header = ["№", "Вопрос", "Ответ ученика", "Правильный ответ", "Итог", "Пояснение"];
  const rows = data.questions.map((q, idx) => {
    const studentIdx = data.answers[q.id];
    const studentAnswer = typeof studentIdx === "number" ? optText(q.options[studentIdx]) : "—";
    const correctAnswer =
      typeof q.correct_answer === "number" ? optText(q.options[q.correct_answer]) : "—";
    const ok = studentIdx === q.correct_answer;
    return [
      idx + 1,
      q.question,
      studentAnswer,
      correctAnswer,
      ok ? "Верно" : "Неверно",
      q.explanation || "",
    ];
  });

  const wb = XLSX.utils.book_new();

  const wsSummary = XLSX.utils.aoa_to_sheet(summary);
  wsSummary["!cols"] = [{ wch: 20 }, { wch: 60 }];
  XLSX.utils.book_append_sheet(wb, wsSummary, "Итог");

  const wsQuestions = XLSX.utils.aoa_to_sheet([header, ...rows]);
  wsQuestions["!cols"] = [
    { wch: 5 },
    { wch: 60 },
    { wch: 40 },
    { wch: 40 },
    { wch: 10 },
    { wch: 50 },
  ];
  XLSX.utils.book_append_sheet(wb, wsQuestions, "Вопросы");

  XLSX.writeFile(wb, buildFilename(data, "xlsx"));
}
