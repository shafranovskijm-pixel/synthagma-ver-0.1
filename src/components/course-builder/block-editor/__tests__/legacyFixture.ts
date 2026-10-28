// Synthetic public regression content, never copied from a production question bank.
export const legacyFixture = [
  { id: "image-1", type: "image", url: "/qa-synthetic.png", alt: "Учебная схема", caption: "Синтетический рисунок", privateExtra: { retain: true } },
  { id: "paragraph-1", type: "paragraph", text: "Первый учебный абзац", extra: { version: 7 } },
  { id: "heading-1", type: "heading", level: 2, text: "Учебный раздел" },
  { id: "callout-1", type: "callout", variant: "info", title: "Пример", text: "Текст примера" },
  { id: "accordion-1", type: "accordion", items: [
    { id: "section-a", title: "Раздел А", content: "Содержимое раздела А", extra: { keep: "A" } },
    { id: "section-b", title: "Раздел Б", content: "Содержимое раздела Б", extra: { keep: "B" } },
  ], extra: "unchanged" },
  { id: "quiz-1", type: "quiz", question: "Сколько будет два плюс два?", options: ["1", "2", "4", "8"], correctIndex: 2, explanation: "Два плюс два равно четырём.", extra: ["preserve"] },
  { id: "divider-1", type: "divider" },
  { id: "button-1", type: "button", label: "Открыть пример", url: "/qa-example", variant: "outline", openInNewTab: false },
];
export const rawLegacy = JSON.stringify(legacyFixture, null, 2) + "\n";

export const objectQuizFixture = { id: "object-quiz", type: "quiz", question: "Сколько будет два плюс два?", options: [
  { id: "option-a", text: "1", isCorrect: false, extra: { retain: "a" } },
  { id: "option-b", text: "2", isCorrect: false, extra: { retain: "b" } },
  { id: "option-c", text: "4", isCorrect: true, extra: { retain: "c" } },
  { id: "option-d", text: "8", isCorrect: false, extra: { retain: "d" } },
], explanation: "Два плюс два равно четырём.", extra: "source-object-form" };
export const rawObjectQuiz = JSON.stringify([objectQuizFixture], null, 2) + "\n";
