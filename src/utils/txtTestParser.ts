interface ImportedQuestion {
  question: string;
  options: string[];
  correctAnswer: number;
  explanation?: string;
}

/**
 * Parses test files in custom TXT format:
 * *Тесты==           — test marker
 * #Test Name==       — test name (ignored)
 * ?Question text==   — question
 * +- Correct answer== — correct answer (prefix +-)
 * - Wrong answer==    — wrong answer (prefix -)
 * \Explanation==      — explanation (optional)
 */
export function parseTxtTestFile(text: string): ImportedQuestion[] {
  const questions: ImportedQuestion[] = [];

  // Normalize line endings and split
  const lines = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");

  let currentQuestion = "";
  let currentOptions: string[] = [];
  let correctIndices: number[] = [];
  let currentExplanation = "";

  const pushQuestion = () => {
    if (currentQuestion && currentOptions.length >= 2) {
      questions.push({
        question: currentQuestion,
        options: currentOptions,
        correctAnswer: correctIndices.length > 0 ? correctIndices[0] : 0,
        ...(currentExplanation ? { explanation: currentExplanation } : {}),
      });
    }
    currentQuestion = "";
    currentOptions = [];
    correctIndices = [];
    currentExplanation = "";
  };

  for (const rawLine of lines) {
    // Remove trailing == delimiter
    const line = rawLine.replace(/==\s*$/, "").trim();
    if (!line) continue;

    // Test marker or test name — skip
    if (line.startsWith("*") || line.startsWith("#")) continue;

    // Question line
    if (line.startsWith("?")) {
      pushQuestion();
      currentQuestion = line.substring(1).trim();
      continue;
    }

    // Correct answer
    if (line.startsWith("+-")) {
      const answerText = line.substring(2).trim();
      if (answerText) {
        correctIndices.push(currentOptions.length);
        currentOptions.push(answerText);
      }
      continue;
    }

    // Wrong answer
    if (line.startsWith("-")) {
      const answerText = line.substring(1).trim();
      if (answerText) {
        currentOptions.push(answerText);
      }
      continue;
    }

    // Explanation
    if (line.startsWith("\\")) {
      currentExplanation = line.substring(1).trim();
      continue;
    }
  }

  // Don't forget the last question
  pushQuestion();

  return questions;
}
