import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { renderToStaticMarkup } from 'react-dom/server';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { describe, expect, it } from 'vitest';
import { prepareTextLessonReplacement } from '../textLessonReplacement';
import { htmlToBlocks } from '@/components/course-builder/block-editor/parsers';
import { BlockRenderer } from '@/components/course-builder/block-editor/BlockRenderer';

const doc = (html: string) => new DOMParser().parseFromString(html, 'text/html');
const compact = (text: string | null) => (text || '').replace(/\s/g, '');
const links = (document: Document) => Array.from(document.querySelectorAll('a[href]')).map(a => a.getAttribute('href')).sort();

describe('opt-in text parsing; no course splitting', () => {
  it('preserves GFM tables, cell links, emphasis, numbered starts and safety blockquotes', () => {
    const md = '# Title\n\n> **Не включать:** только анализ.\n\n| Норма | Условие |\n|---|---|\n| [Документ](https://example.test/norm) | **Не применять** |\n\n3. A\n4. B';
    const patch = prepareTextLessonReplacement('one.MD', md);
    const rendered = doc(renderToStaticMarkup(<BlockRenderer blocks={patch.blocks || []} />));
    expect(rendered.querySelectorAll('table tr')).toHaveLength(2);
    expect(rendered.querySelector('td a')?.getAttribute('href')).toBe('https://example.test/norm');
    expect(rendered.querySelector('td strong')?.textContent).toBe('Не применять');
    expect(rendered.querySelector('blockquote strong')?.textContent).toBe('Не включать:');
    expect(rendered.querySelector('ol')?.getAttribute('start')).toBe('3');
    expect(Object.keys(patch).sort()).toEqual(['blocks', 'content']);
  });
  it('uses the same opt-in HTML blocks and removes active or network-loading markup', () => {
    const patch = prepareTextLessonReplacement('one.html', '<script>bad()</script><style>body{background:url(https://evil.test)}</style><h1>Лекция</h1><p onclick="bad()">Текст <a href="javascript:bad()">опасная ссылка</a></p><iframe src="https://evil.test"></iframe><img src="https://evil.test/x"><form><input value="secret"></form><table><tr><th>A</th></tr><tr><td>Условие</td></tr></table>');
    const rendered = doc(renderToStaticMarkup(<BlockRenderer blocks={patch.blocks || []} />));
    expect(rendered.body.textContent).toContain('Лекция');
    expect(rendered.body.textContent).not.toContain('bad()');
    expect(rendered.querySelector('script,style,iframe,img,form,input,video,audio,object,embed')).toBeNull();
    expect(rendered.querySelector('[onclick],[src],[srcdoc]')).toBeNull();
    expect(links(rendered)).toEqual([]);
    expect(rendered.querySelectorAll('table tr')).toHaveLength(2);
  });
  it('keeps the default htmlToBlocks output unchanged when no opt-in flag is supplied', () => {
    const html = '<h3>Heading</h3><hr><ol start="3"><li>Item</li></ol><table><tr><th>A</th><td>B</td></tr></table>';
    const legacy = htmlToBlocks(html).map(({ id, ...block }) => block);
    expect(legacy).toEqual([
      { type: 'heading2', content: 'Heading' }, { type: 'numberedList', content: 'Item' },
      { type: 'paragraph', content: 'A' }, { type: 'paragraph', content: 'B' },
    ]);
  });
  it('rejects empty/oversized input and never interprets JSON as imported lesson records', () => {
    expect(() => prepareTextLessonReplacement('one.md', ' ')).toThrow();
    expect(() => prepareTextLessonReplacement('one.md', 'a'.repeat(2 * 1024 * 1024 + 1))).toThrow();
    const patch = prepareTextLessonReplacement('one.md', '[{"id":"victim","type":"test","questions":[1]}]');
    expect(patch.blocks?.some(block => block.type === 'quiz')).toBe(false);
    expect(Object.keys(patch).sort()).toEqual(['blocks', 'content']);
  });
  it('preserves heading links and loose list item boundaries', () => {
    const patch = prepareTextLessonReplacement('one.md', '# [Норма](https://example.test)\n\n1. Первый абзац\n\n   Продолжение того же пункта.\n\n2. Второй пункт');
    const rendered = doc(renderToStaticMarkup(<BlockRenderer blocks={patch.blocks || []} />));
    expect(rendered.querySelector('h1 a')?.getAttribute('href')).toBe('https://example.test');
    expect(rendered.querySelectorAll('ol > li')).toHaveLength(2);
    expect(rendered.querySelector('ol > li')?.textContent).toContain('Продолжение того же пункта.');
  });
  it.each([
    '<table><tr><td colspan="2">Общее условие</td></tr></table>',
    '<table><tr><td><table><tr><td>Вложение</td></tr></table></td></tr></table>',
    '<ol><li>Первый<ul><li>Подпункт</li></ul></li></ol>',
  ])('rejects unsupported relationships instead of flattening them: %s', html => {
    expect(() => prepareTextLessonReplacement('one.html', html)).toThrow(/не поддерживаются/);
  });
});

describe.each([
  {
    label: 'accepted lecture files',
    sourcePath: (id: string) => fileURLToPath(new URL('../../../tests/fixtures/csz-text-lesson-replacement/source/module' + id + '.md', import.meta.url)),
  },
  {
    label: 'student_exports_v1 lecture files',
    sourcePath: (id: string) => fileURLToPath(new URL('../../../tests/fixtures/csz-text-lesson-replacement/student-exports-v1/module' + id + '.md', import.meta.url)),
  },
])('nine $label, local read-only fidelity check', ({ sourcePath }) => {
  it.each(['01', '02', '03', '04', '05', '06', '07', '08', '10'])('preserves rendered text, tables and links of module%s', id => {
    const source = readFileSync(sourcePath(id), 'utf8');
    const before = doc(renderToStaticMarkup(<ReactMarkdown remarkPlugins={[remarkGfm]} skipHtml>{source}</ReactMarkdown>));
    const patch = prepareTextLessonReplacement('lecture.md', source);
    const after = doc(renderToStaticMarkup(<BlockRenderer blocks={patch.blocks || []} />));
    expect(compact(after.body.textContent)).toBe(compact(before.body.textContent));
    expect(after.querySelectorAll('table')).toHaveLength(before.querySelectorAll('table').length);
    expect(after.querySelectorAll('table tr')).toHaveLength(before.querySelectorAll('table tr').length);
    for (const selector of ['ol', 'ul', 'li', 'blockquote', 'strong', 'em']) {
      expect(after.querySelectorAll(selector), selector).toHaveLength(before.querySelectorAll(selector).length);
    }
    expect(links(after)).toEqual(links(before));
  });
});
