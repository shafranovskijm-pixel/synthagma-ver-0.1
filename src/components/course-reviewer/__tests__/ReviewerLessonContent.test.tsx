import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ReviewerLessonContent } from "@/components/course-reviewer/ReviewerLessonContent";

afterEach(() => cleanup());

describe("ReviewerLessonContent fail-closed rendering", () => {
  it("does not render malformed JSON-looking content carrying answer markers", () => {
    const view = render(
      <ReviewerLessonContent content={'[{"type":"quiz","correct_answer":0,"quizExplanation":"Скрытый ключ"'} />,
    );

    expect(screen.getByText("Содержимое элемента отсутствует.")).toBeInTheDocument();
    expect(view.container).not.toHaveTextContent("correct_answer");
    expect(view.container).not.toHaveTextContent("Скрытый ключ");
  });

  it("renders a mini-quiz statically without its supplied key or explanation", () => {
    const content = JSON.stringify([{
      id: "quiz-1",
      type: "quiz",
      content: "",
      quizQuestion: "Контрольный вопрос",
      quizExplanation: "Скрытое объяснение",
      quizOptions: [
        { text: "Вариант А", isCorrect: true },
        { text: "Вариант Б", isCorrect: false },
      ],
    }]);

    render(<ReviewerLessonContent content={`\u00a0\u2003\n\t${content}`} />);
    const region = screen.getByRole("region", { name: "Мини-тест без ключа ответа" });
    expect(within(region).getByText("Контрольный вопрос")).toBeInTheDocument();
    expect(within(region).getByText("Вариант А")).toBeInTheDocument();
    expect(within(region).getByText("Вариант Б")).toBeInTheDocument();
    expect(within(region).queryByRole("button")).toBeNull();
    expect(screen.queryByText("Скрытое объяснение")).toBeNull();
  });

  it("does not crash or render nested keys from malformed table rows", () => {
    const content = JSON.stringify([{
      id: "table-1",
      type: "table",
      content: "",
      tableRows: [
        { isCorrect: true },
        ["Безопасная ячейка", { quizExplanation: "Скрыто" }],
      ],
      tableHasHeader: false,
    }]);

    const view = render(<ReviewerLessonContent content={content} />);
    expect(screen.getByText("Безопасная ячейка")).toBeInTheDocument();
    expect(view.container).not.toHaveTextContent("isCorrect");
    expect(view.container).not.toHaveTextContent("quizExplanation");
    expect(view.container).not.toHaveTextContent("Скрыто");
  });
});
