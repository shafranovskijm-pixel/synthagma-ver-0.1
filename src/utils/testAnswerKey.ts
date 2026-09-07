export type TestAnswerKeyState = 'hidden' | 'missing' | 'invalid' | 'valid';

/** An absent key is hidden feedback, while an explicit null is a saved missing key. */
export function getTestAnswerKeyState(key: unknown, options: unknown): TestAnswerKeyState {
  if (key === undefined) return 'hidden';
  if (key === null) return 'missing';
  return typeof key === 'number' && Number.isInteger(key) && Array.isArray(options)
    && key >= 0 && key < options.length ? 'valid' : 'invalid';
}

export function getTestAnswerKeyNotice(state: TestAnswerKeyState): string | null {
  if (state === 'missing') return 'Правильный ответ в вопросе не задан. Балл не начислен.';
  if (state === 'invalid') return 'Правильный ответ в вопросе указан некорректно. Балл не начислен.';
  return null;
}
