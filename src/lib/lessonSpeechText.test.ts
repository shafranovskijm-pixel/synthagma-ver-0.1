import { describe, expect, it } from 'vitest';
import { htmlToBlocks, parseLessonContent } from '@/components/course-builder/block-editor/parsers';
import type { ContentBlock } from '@/components/course-builder/block-editor/types';
import { lessonBlocksToSpeechText, speechTextFromHtml } from './lessonSpeechText.ts';
import { splitSpeechText } from './browserSpeech.ts';

describe('readable lesson text', () => {
  it('keeps h3/h4 and actual imported tableRows in their lesson order', () => {
    const imported = htmlToBlocks('<h3>Условия работы</h3><p>Проверьте таблицу.</p><table><tr><th>Параметр</th><th>Значение</th></tr><tr><td><strong>Температура</strong></td><td>20&nbsp;°C<br>Без перегрева</td></tr></table><h4>Проверка</h4>', { preserveTextStructure: true });
    const blocks = parseLessonContent(JSON.stringify(imported));
    expect(blocks.find(block => block.type === 'table')).toMatchObject({
      content: '', tableCellsHtml: true,
      tableRows: [['Параметр', 'Значение'], ['<strong>Температура</strong>', '20&nbsp;°C<br>Без перегрева']],
    });
    expect(lessonBlocksToSpeechText(blocks)).toBe('Условия работы. Проверьте таблицу. Параметр; Значение. Температура; 20 °C. Без перегрева. Проверка');
  });

  it('decodes inline HTML/entities and preserves br, paragraph and list item boundaries', () => {
    expect(speechTextFromHtml('<p>Без<strong>опас</strong>ность &amp; &#171;контроль&#187;</p><ul><li>Проверка&nbsp;А<br>Проверка Б</li><li><a href="https://media.test/file.mp4">Инструкция</a></li></ul>'))
      .toBe('Безопасность & «контроль». Проверка А. Проверка Б. Инструкция');
  });

  it('supports both newline lists and imported inline li markup without reading tags', () => {
    const blocks: ContentBlock[] = [
      { id: 'one', type: 'numberedList', listStart: 3, content: '<strong>Первый</strong> пункт\nВторой &amp; третий' },
      { id: 'two', type: 'bulletList', content: '<li>Четвёртый</li><li>Пятый<br>Продолжение</li>' },
    ];
    expect(lessonBlocksToSpeechText(blocks)).toBe('Первый пункт. Второй & третий. Четвёртый. Пятый. Продолжение');
  });

  it('keeps plain table cells and ignores empty rows without losing following text', () => {
    const blocks: ContentBlock[] = [
      { id: 'table', type: 'table', content: '', tableRows: [['', ''], ['Давление', '5 < 10'], ['Готово', 'Да']] },
      { id: 'last', type: 'paragraph', content: 'Конец урока.' },
    ];
    expect(lessonBlocksToSpeechText(blocks)).toBe('Давление; 5 < 10. Готово; Да. Конец урока.');
  });

  it('never reads code, media URLs, hidden markup, attributes or quiz answer keys', () => {
    const blocks: ContentBlock[] = [
      { id: 'code', type: 'code', content: 'SECRET_CODE()' },
      { id: 'image', type: 'image', content: '', imageSrc: 'https://media.test/private.png', imageAlt: 'SECRET_IMAGE' },
      { id: 'audio', type: 'audio', content: 'SECRET_AUDIO', audioUrl: 'https://media.test/private.mp3' },
      { id: 'video', type: 'video', content: 'https://media.test/private.mp4' },
      { id: 'embed', type: 'embed', content: '', embedUrl: 'https://media.test/private' },
      { id: 'document', type: 'document', content: '', documentUrl: 'https://media.test/private.pdf' },
      { id: 'quiz', type: 'quiz', content: 'SECRET_CONTENT', quizQuestion: '<b>Что проверить?</b>', quizOptions: [{ text: 'SECRET_ANSWER', isCorrect: true }], quizExplanation: 'SECRET_EXPLANATION' },
      { id: 'paragraph', type: 'paragraph', content: '<p>Видимый текст</p><script>SECRET_SCRIPT</script><style>SECRET_STYLE</style><code>SECRET_INLINE_CODE</code><pre>SECRET_PRE</pre><span hidden>SECRET_HIDDEN</span><span aria-hidden="true">SECRET_ARIA</span><img src="https://media.test/hidden.png" alt="SECRET_ALT"><video>SECRET_VIDEO</video>' },
    ];
    const text = lessonBlocksToSpeechText(blocks);
    expect(text).toBe('Вопрос: Что проверить? Видимый текст');
    expect(text).not.toMatch(/SECRET|https?:|<|>|isCorrect/);
  });

  it('preserves text callouts and accordion titles without reading additional block fields', () => {
    const blocks: ContentBlock[] = [
      { id: 'danger', type: 'callout-danger', calloutTitle: 'Важно', content: 'Не включать.' },
      { id: 'highlight', type: 'highlight', content: '<em>Проверьте питание</em>' },
      { id: 'accordion', type: 'accordion', accordionTitle: 'Детали', content: 'Сначала осмотр.' },
    ];
    expect(lessonBlocksToSpeechText(blocks)).toBe('Важно. Не включать. Проверьте питание. Детали. Сначала осмотр.');
  });

  it('keeps h3 and table cells in a 20,000+ character mixed-format lesson through chunking', () => {
    const blocks: ContentBlock[] = Array.from({ length: 240 }, (_, index) => [
      { id: `h-${index}`, type: 'heading3' as const, content: `Раздел ${index}` },
      { id: `p-${index}`, type: 'paragraph' as const, content: 'Перед началом работы проверьте исправность оборудования и условия безопасности.' },
      { id: `t-${index}`, type: 'table' as const, content: '', tableCellsHtml: true, tableRows: [[`Условие ${index}`, '<b>Подтверждено</b>']] },
    ]).flat();
    const text = lessonBlocksToSpeechText(parseLessonContent(JSON.stringify(blocks)));
    expect(text.length).toBeGreaterThan(20000);
    expect(text).toContain('Раздел 0.'); expect(text).toContain('Условие 239; Подтверждено');
    expect(text.match(/Подтверждено/g)).toHaveLength(240);
    expect(splitSpeechText(text).join(' ')).toBe(text);
  });
});
