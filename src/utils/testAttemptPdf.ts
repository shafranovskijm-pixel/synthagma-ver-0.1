// jsPDF is loaded dynamically (~500 KB) — only when the user clicks "Download PDF".
import { format } from "date-fns";
import { ru } from "date-fns/locale";

interface QuestionForPdf {
  id: string;
  question: string;
  options: string[];
  correct_answer: number | null;
}

interface TestAttemptPdfData {
  studentName: string;
  courseTitle: string;
  testTitle: string;
  completedAt: string;
  score: number;
  maxScore: number;
  percentage: number;
  isPassed: boolean;
  passingScore: number;
  questions: QuestionForPdf[];
  answers: Record<string, number>;
}

export async function generateTestAttemptPdf(data: TestAttemptPdfData) {
  const { default: jsPDF } = await import("jspdf");
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

  // Register and use a font that supports Cyrillic — jsPDF default doesn't.
  // We'll use the built-in helvetica and encode properly.
  // For Cyrillic we need to add a font. We'll use a simple workaround:
  // draw text that jsPDF can handle with its standard font set.
  
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 15;
  const contentWidth = pageWidth - margin * 2;
  let y = 20;

  const addText = (text: string, x: number, yPos: number, options?: { fontSize?: number; fontStyle?: string; maxWidth?: number }) => {
    const size = options?.fontSize || 10;
    doc.setFontSize(size);
    if (options?.fontStyle) {
      doc.setFont("helvetica", options.fontStyle);
    } else {
      doc.setFont("helvetica", "normal");
    }
    
    if (options?.maxWidth) {
      const lines = doc.splitTextToSize(text, options.maxWidth);
      doc.text(lines, x, yPos);
      return lines.length * size * 0.4;
    }
    doc.text(text, x, yPos);
    return size * 0.4;
  };

  const checkPage = (needed: number) => {
    if (y + needed > doc.internal.pageSize.getHeight() - 15) {
      doc.addPage();
      y = 20;
    }
  };

  // Title
  addText("Otchet o testirovanii", margin, y, { fontSize: 16, fontStyle: "bold" });
  y += 10;

  // Meta
  const dateStr = format(new Date(data.completedAt), "d MMMM yyyy, HH:mm", { locale: ru });
  
  const metaLines = [
    `Student: ${data.studentName}`,
    `Kurs: ${data.courseTitle}`,
    `Test: ${data.testTitle}`,
    `Data: ${dateStr}`,
    `Rezultat: ${data.score} iz ${data.maxScore} (${data.percentage}%)`,
    `Prohodnoi ball: ${data.passingScore}%`,
    `Status: ${data.isPassed ? "Proiden" : "Ne proiden"}`,
  ];

  metaLines.forEach((line) => {
    addText(line, margin, y, { fontSize: 10 });
    y += 5;
  });

  y += 5;
  doc.setDrawColor(200);
  doc.line(margin, y, pageWidth - margin, y);
  y += 8;

  // Questions
  data.questions.forEach((q, idx) => {
    checkPage(30);
    
    const questionText = `${idx + 1}. ${q.question}`;
    const h = addText(questionText, margin, y, { fontSize: 10, fontStyle: "bold", maxWidth: contentWidth });
    y += Math.max(h, 5) + 2;

    q.options.forEach((opt, optIdx) => {
      checkPage(7);
      const studentAnswer = data.answers[q.id];
      const isStudentChoice = studentAnswer === optIdx;
      const isCorrectOption = q.correct_answer === optIdx;

      let prefix = "  ";
      if (isStudentChoice && isCorrectOption) prefix = "[V] ";
      else if (isStudentChoice) prefix = "[X] ";
      else if (isCorrectOption) prefix = "[=] ";

      const optText = `${prefix}${opt}`;
      const oh = addText(optText, margin + 4, y, { fontSize: 9, maxWidth: contentWidth - 8 });
      y += Math.max(oh, 4) + 1;
    });

    y += 4;
  });

  // Save
  const filename = `test_${data.testTitle.substring(0, 30).replace(/[^a-zA-Z0-9а-яА-ЯёЁ]/g, "_")}_${format(new Date(data.completedAt), "yyyy-MM-dd")}.pdf`;
  doc.save(filename);
}
