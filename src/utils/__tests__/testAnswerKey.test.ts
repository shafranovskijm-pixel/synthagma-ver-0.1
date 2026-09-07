import { describe, expect, it } from 'vitest';
import { getTestAnswerKeyNotice, getTestAnswerKeyState } from '../testAnswerKey';

describe('saved answer key feedback', () => {
  it.each([0, 1])('accepts the existing zero-based index %s', key => {
    expect(getTestAnswerKeyState(key, ['A', 'B'])).toBe('valid');
  });

  it.each([-1, 2, 4, 0.5, '0', NaN])('does not invent a replacement for invalid key %s', key => {
    expect(getTestAnswerKeyState(key, ['A', 'B'])).toBe('invalid');
  });

  it('distinguishes a saved missing key from withheld feedback', () => {
    expect(getTestAnswerKeyState(null, ['A', 'B'])).toBe('missing');
    expect(getTestAnswerKeyNotice('missing')).toContain('не задан');
    expect(getTestAnswerKeyState(undefined, ['A', 'B'])).toBe('hidden');
    expect(getTestAnswerKeyNotice('hidden')).toBeNull();
    expect(getTestAnswerKeyNotice('valid')).toBeNull();
  });
});
