import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { renderToStaticMarkup } from 'react-dom/server';
import DOMPurify from 'dompurify';
import { blocksToJson, htmlToBlocks } from '@/components/course-builder/block-editor/parsers';
import type { Lesson } from '@/components/course-builder/LessonTypeConfig';

export interface TextLessonContext { organizationId?: string; courseId?: string; lessonId: string }
export type TextLessonPatch = Pick<Lesson, 'blocks' | 'content'>;
export const MAX_TEXT_LESSON_FILE_BYTES = 2 * 1024 * 1024;
export const textLessonContextKey = (context: TextLessonContext) =>
  JSON.stringify([context.organizationId, context.courseId, context.lessonId]);
export const textLessonFingerprint = (lesson: Pick<Lesson, 'content' | 'blocks'>) =>
  JSON.stringify([lesson.content, lesson.blocks]);
export function canReplaceTextLesson(context: TextLessonContext, lesson: Pick<Lesson, 'id' | 'type' | '__contentLoaded'>): boolean {
  return !!context.organizationId?.trim() && !!context.courseId?.trim() && !!context.lessonId?.trim()
    && context.lessonId === lesson.id && (lesson.type === 'text' || lesson.type === 'lesson')
    && lesson.__contentLoaded === true;
}

// No course parser, AI, file upload, storage or database calls. Only text blocks are created.
export function prepareTextLessonReplacement(fileName: string, source: string): TextLessonPatch {
  const ext = fileName.split('.').pop()?.toLowerCase();
  if (!ext || !['md', 'markdown', 'html', 'htm'].includes(ext)) throw new Error('Выберите файл MD или HTML одной лекции.');
  if (!source.trim() || source.length > MAX_TEXT_LESSON_FILE_BYTES) throw new Error('Файл пуст или превышает лимит 2 МиБ.');
  const html = ext === 'md' || ext === 'markdown'
    ? renderToStaticMarkup(<ReactMarkdown remarkPlugins={[remarkGfm]} skipHtml>{source.replace(/^\uFEFF/, '')}</ReactMarkdown>)
    : source;
  // Text-only allowlist: never mount imported scripts, CSS, media, embeds or input controls.
  const clean = DOMPurify.sanitize(html, {
    ALLOWED_TAGS: ['p', 'div', 'section', 'article', 'span', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
      'strong', 'b', 'em', 'i', 'u', 's', 'del', 'code', 'pre', 'blockquote', 'br', 'hr',
      'ul', 'ol', 'li', 'table', 'thead', 'tbody', 'tfoot', 'tr', 'td', 'th', 'a', 'sup', 'sub'],
    ALLOWED_ATTR: ['href', 'title', 'start', 'colspan', 'rowspan'],
    ALLOW_DATA_ATTR: false,
  });
  const document = new DOMParser().parseFromString(clean, 'text/html');
  // Existing native blocks cannot faithfully represent merged cells or nested lists.
  // Refuse these structures instead of silently flattening their relationships.
  if (document.querySelector('table table, [colspan]:not([colspan="1"]), [rowspan]:not([rowspan="1"]), li ul, li ol')) {
    throw new Error('Объединённые ячейки, вложенные таблицы и вложенные списки не поддерживаются этим точечным импортом. Содержание не изменено.');
  }
  const blocks = htmlToBlocks(clean, { preserveTextStructure: true });
  if (!blocks.some(block => block.content.trim() || block.tableRows?.some(row => row.some(cell => cell.trim())))) {
    throw new Error('В файле не найдено текстового содержания. Изображения и активные элементы не импортируются.');
  }
  return { blocks, content: blocksToJson(blocks) };
}
