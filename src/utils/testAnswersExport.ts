
export interface QuestionForExport {
  question: string;
  options: string[];
  correctAnswer?: number | null;
}

export function exportQuestionsForAI(questions: QuestionForExport[], courseTitle: string): string {
  const lines: string[] = [];
  lines.push(`Курс: ${courseTitle}`);
  lines.push('');

  questions.forEach((q, i) => {
    lines.push(`Вопрос ${i + 1}: ${q.question}`);
    const letters = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
    q.options.forEach((opt, j) => {
      const marker = (q.correctAnswer != null && q.correctAnswer === j) ? '✅' : '  ';
      lines.push(`${marker} ${letters[j] || (j + 1).toString()}) ${opt}`);
    });
    lines.push('');
  });

  lines.push('Инструкция: Укажи правильные ответы в формате:');
  lines.push('1-A');
  lines.push('2-B');
  lines.push('3-C');
  lines.push('...');

  return lines.join('\n');
}

export interface ParsedAnswer {
  questionNumber: number;
  answerIndex: number;
  answerLetter: string;
}

export function parseAnswersFile(text: string, questionsCount: number): { answers: ParsedAnswer[]; errors: string[] } {
  const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  const answers: ParsedAnswer[] = [];
  const errors: string[] = [];
  const letterMap: Record<string, number> = { A: 0, B: 1, C: 2, D: 3, E: 4, F: 5, G: 6, H: 7 };

  for (const line of lines) {
    // Skip instruction lines or headers
    if (/^(вопрос|курс|инструкция|ответ|---)/i.test(line)) continue;
    if (line.startsWith('...')) continue;

    // Match patterns: "1-A", "1: A", "1 A", "1-1", "1: 1", "1.A", "1. A"
    const match = line.match(/^(\d+)\s*[-:.\s]\s*([A-Ha-h]|\d+)/);
    if (!match) continue;

    const qNum = parseInt(match[1]);
    const rawAnswer = match[2].toUpperCase();

    if (qNum < 1 || qNum > questionsCount) {
      errors.push(`Вопрос ${qNum} вне диапазона (1-${questionsCount})`);
      continue;
    }

    let answerIndex: number;
    let answerLetter: string;

    if (/^[A-H]$/.test(rawAnswer)) {
      answerIndex = letterMap[rawAnswer];
      answerLetter = rawAnswer;
    } else {
      answerIndex = parseInt(rawAnswer) - 1;
      answerLetter = String.fromCharCode(65 + answerIndex);
    }

    answers.push({ questionNumber: qNum, answerIndex, answerLetter });
  }

  return { answers, errors };
}

export function downloadTextFile(content: string, filename: string) {
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
