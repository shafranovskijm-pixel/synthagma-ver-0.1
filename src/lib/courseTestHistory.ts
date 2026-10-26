export type HistoryStatus = "snapshot" | "legacy_unknown" | "snapshot_unavailable";

export interface HistoricalAttempt {
  id: string;
  answers: Record<string, number>;
  shown_question_ids: string[];
  score: number;
  max_score: number;
  passed?: boolean | null;
  passing_score?: number | null;
}
export interface QuestionDetail {
  questionText: string;
  options: string[];
  selectedAnswer: number;
  selectedAnswerStatus: "answered" | "unanswered" | "unknown";
  correctAnswer: number | null;
  isCorrect: boolean | null;
}
export interface ResolvedAttemptHistory {
  status: HistoryStatus;
  details: QuestionDetail[];
}
type SnapshotQuestion = { id: string; question: string; options: string[]; key: number | null };

export function normalizeHistoricalOption(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && "text" in value &&
      typeof (value as { text: unknown }).text === "string") return (value as { text: string }).text;
  return null;
}
function decodeQuestions(value: unknown): SnapshotQuestion[] | null {
  if (!Array.isArray(value) || value.length === 0) return null;
  const seen = new Set<string>();
  const result: SnapshotQuestion[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object" || typeof item.id !== "string" ||
        seen.has(item.id) || typeof item.question !== "string" || !Array.isArray(item.options) ||
        item.options.length === 0) return null;
    seen.add(item.id);
    const options = item.options.map(normalizeHistoricalOption);
    if (options.some((option: string | null) => option === null)) return null;
    const key = Number.isInteger(item.correct_answer) &&
      item.correct_answer >= 0 && item.correct_answer < options.length ? item.correct_answer : null;
    result.push({ id: item.id, question: item.question, options: options as string[], key });
  }
  return result;
}
export function resolveAttemptHistory(attempt: HistoricalAttempt, payload: unknown): ResolvedAttemptHistory {
  if (!payload || typeof payload !== "object") return { status: "snapshot_unavailable", details: [] };
  const row = payload as Record<string, unknown>;
  if (row.attempt_id !== attempt.id) return { status: "snapshot_unavailable", details: [] };
  if (row.history_status === "legacy_unknown") return { status: "legacy_unknown", details: [] };
  if (row.history_status !== "snapshot") return { status: "snapshot_unavailable", details: [] };
  if (!attempt.answers || typeof attempt.answers !== "object" || Array.isArray(attempt.answers) ||
      !Array.isArray(attempt.shown_question_ids) ||
      attempt.shown_question_ids.some(id => typeof id !== "string")) {
    return { status: "snapshot_unavailable", details: [] };
  }
  const questions = decodeQuestions(row.questions);
  if (!questions) return { status: "snapshot_unavailable", details: [] };
  // A completed session's question order is authoritative. Never replace or
  // supplement a missing question with the current bank.
  if (attempt.shown_question_ids.length > 0 &&
      (attempt.shown_question_ids.length !== questions.length ||
       attempt.shown_question_ids.some((id, i) => id !== questions[i].id))) {
    return { status: "snapshot_unavailable", details: [] };
  }
  const details = questions.map((question): QuestionDetail => {
    const raw = attempt.answers[question.id];
    const unanswered = raw === undefined;
    const validSelection = Number.isInteger(raw) && raw >= 0 && raw < question.options.length;
    return {
      questionText: question.question,
      options: question.options,
      selectedAnswer: validSelection ? raw : -1,
      selectedAnswerStatus: unanswered ? "unanswered" : validSelection ? "answered" : "unknown",
      correctAnswer: question.key,
      isCorrect: question.key === null || (!unanswered && !validSelection)
        ? null : !unanswered && raw === question.key,
    };
  });
  return { status: "snapshot", details };
}
export function storedAttemptOutcome(attempt: Pick<HistoricalAttempt, "score" | "max_score" | "passed" | "passing_score">): boolean | null {
  if (typeof attempt.passed === "boolean") return attempt.passed;
  const threshold = attempt.passing_score;
  if (typeof threshold !== "number" || !Number.isInteger(threshold) || threshold < 0 ||
      threshold > 100 || !Number.isFinite(attempt.score) || !Number.isFinite(attempt.max_score) ||
      attempt.max_score <= 0 || attempt.score < 0 || attempt.score > attempt.max_score) return null;
  return Math.round(attempt.score * 100 / attempt.max_score) >= threshold;
}
export function outcomeLabel(value: boolean | null): string {
  return value === true ? "Пройден" : value === false ? "Не пройден" : "Не подтверждён";
}
export const UNKNOWN_HISTORY = "Исходная редакция вопросов не подтверждена";

export function questionCounts(history: ResolvedAttemptHistory): { correct: number | null; incorrect: number | null } {
  if (history.status !== "snapshot" || history.details.some(d => d.isCorrect === null)) {
    return { correct: null, incorrect: null };
  }
  return {
    correct: history.details.filter(d => d.isCorrect === true).length,
    incorrect: history.details.filter(d => d.isCorrect === false).length,
  };
}

export interface ExportAttempt extends HistoricalAttempt {
  user_name: string;
  user_email: string;
  lesson_title: string;
  completed_at: string;
  history: ResolvedAttemptHistory;
}
type ExportRow = Record<string, string | number>;
const plain = (value: string, limit: number) => value.replace(/<[^>]*>/g, "").substring(0, limit);

// Shared by the actual XLSX exporter. Unknown history never receives a bank
// question, a current answer label, or an inferred correct/incorrect result.
export function buildHistoryExport(attempts: ExportAttempt[]) {
  const summaryData: ExportRow[] = [];
  const detailedData: ExportRow[] = [];
  const wrongAnswersData: ExportRow[] = [];
  for (const a of attempts) {
    const counts = questionCounts(a.history);
    summaryData.push({
      "ФИО": a.user_name, "Email": a.user_email, "Тест": a.lesson_title,
      "Баллы": a.score, "Макс. баллы": a.max_score,
      "Процент": a.max_score > 0 ? Math.round(a.score / a.max_score * 100) + "%" : "0%",
      "Результат": outcomeLabel(storedAttemptOutcome(a)),
      "Правильных": counts.correct ?? "Не подтверждено",
      "Неправильных": counts.incorrect ?? "Не подтверждено",
      "Редакция вопросов": a.history.status === "snapshot" ? "Снимок попытки" : UNKNOWN_HISTORY,
      "Дата": new Date(a.completed_at).toLocaleString("ru-RU"),
    });
    const identity = { "ФИО": a.user_name, "Тест": a.lesson_title,
      "Дата": new Date(a.completed_at).toLocaleString("ru-RU") };
    if (a.history.status !== "snapshot") {
      detailedData.push({ ...identity, "Вопрос": UNKNOWN_HISTORY, "Результат": "Не подтверждён" });
      continue;
    }
    a.history.details.forEach((d, i) => {
      const row: ExportRow = {
        ...identity, "№ вопроса": i + 1, "Вопрос": plain(d.questionText, 500),
        "Ответ студента": d.selectedAnswerStatus === "unknown" ? "Не подтверждён"
          : d.selectedAnswer >= 0 ? plain(d.options[d.selectedAnswer], 200) : "Нет ответа",
        "Правильный ответ": d.correctAnswer !== null ? plain(d.options[d.correctAnswer], 200) : "Не подтверждён",
        "Результат": d.isCorrect === true ? "✓ Верно" : d.isCorrect === false ? "✗ Неверно" : "Не подтверждён",
      };
      detailedData.push(row);
      if (d.isCorrect === false) {
        const { "Результат": _, ...wrongRow } = row;
        wrongAnswersData.push(wrongRow);
      }
    });
  }
  return { summaryData, detailedData, wrongAnswersData };
}
