import { describe, it, expect } from "vitest";
import { parseTxtTestFile } from "../txtTestParser";

describe("parseTxtTestFile", () => {
  it("parses a single question with correct/wrong answers", () => {
    const input = `*Тесты==
#Тест 1==
?Какой цвет неба?==
+-Голубой==
-Зелёный==
-Красный==
\\Небо голубое из-за рассеяния света==`;

    const result = parseTxtTestFile(input);
    expect(result).toHaveLength(1);
    expect(result[0].question).toBe("Какой цвет неба?");
    expect(result[0].options).toEqual(["Голубой", "Зелёный", "Красный"]);
    expect(result[0].correctAnswer).toBe(0);
    expect(result[0].explanation).toBe("Небо голубое из-за рассеяния света");
  });

  it("parses multiple questions", () => {
    const input = `?Вопрос 1==
+-Правильный==
-Неправильный==
?Вопрос 2==
-Неправильный==
+-Правильный==`;

    const result = parseTxtTestFile(input);
    expect(result).toHaveLength(2);
    expect(result[0].correctAnswer).toBe(0);
    expect(result[1].correctAnswer).toBe(1);
  });

  it("skips questions with less than 2 options", () => {
    const input = `?Вопрос==
+-Единственный ответ==`;
    expect(parseTxtTestFile(input)).toHaveLength(0);
  });

  it("returns empty for empty input", () => {
    expect(parseTxtTestFile("")).toEqual([]);
  });

  it("handles missing explanation", () => {
    const input = `?Вопрос==
+-Да==
-Нет==`;
    const result = parseTxtTestFile(input);
    expect(result[0].explanation).toBeUndefined();
  });
});
