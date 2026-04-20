/**
 * Общий тип props для всех вариантов секции «Как проходит обучение» (process).
 * Контент представлен строкой, где каждая непустая строка = шаг процесса.
 */
export interface ProcessVariantProps {
  title: string;
  content: string;
  isEditing?: boolean;
  onTitleChange?: (v: string) => void;
  onContentChange?: (v: string) => void;
}

/** Парсит content в массив пунктов: трим, удаление маркеров, фильтрация пустых. */
export function parseProcessLines(content: string): string[] {
  return content
    .split("\n")
    .map((l) => l.replace(/^[-•]\s*/, "").trim())
    .filter(Boolean);
}
