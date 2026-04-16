import { describe, it, expect } from "vitest";
import { exportQuestionsForAI, parseAnswersFile } from "../testAnswersExport";

describe("exportQuestionsForAI", () => {
  it("formats questions with correct answer markers", () => {
    const result = exportQuestionsForAI([
      { question: "Вопрос 1", options: ["А", "Б"], correctAnswer: 0 },
      { question: "Вопрос 2", options: ["В", "Г"], correctAnswer: 1 },
    ], "Тест");

    expect(result).toContain("Курс: Тест");
    expect(result).toContain("Вопрос 1: Вопрос 1");
    expect(result).toContain("✅ A) А");
    expect(result).toContain("   B) Б");
  });

  it("handles null correctAnswer", () => {
    const result = exportQuestionsForAI([
      { question: "Q", options: ["A", "B"], correctAnswer: null },
    ], "Test");
    expect(result).not.toContain("✅");
  });
});

describe("parseAnswersFile", () => {
  it("parses letter answers", () => {
    const { answers, errors } = parseAnswersFile("1-A\n2-B\n3-C", 5);
    expect(answers).toHaveLength(3);
    expect(answers[0]).toEqual({ questionNumber: 1, answerIndex: 0, answerLetter: "A" });
    expect(answers[1]).toEqual({ questionNumber: 2, answerIndex: 1, answerLetter: "B" });
    expect(errors).toHaveLength(0);
  });

  it("parses numeric answers", () => {
    const { answers } = parseAnswersFile("1-1\n2-3", 3);
    expect(answers[0].answerIndex).toBe(0);
    expect(answers[1].answerIndex).toBe(2);
  });

  it("skips instruction lines", () => {
    const { answers } = parseAnswersFile("Курс: тест\nИнструкция: ...\n1-A", 1);
    expect(answers).toHaveLength(1);
  });

  it("reports out-of-range questions", () => {
    const { answers, errors } = parseAnswersFile("10-A", 5);
    expect(answers).toHaveLength(0);
    expect(errors).toHaveLength(1);
  });

  it("handles colon separator", () => {
    const { answers } = parseAnswersFile("1: A\n2: B", 3);
    expect(answers).toHaveLength(2);
  });
});
