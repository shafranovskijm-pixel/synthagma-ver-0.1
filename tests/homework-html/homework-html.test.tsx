import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MARKETPLACE_ORG_ID } from '@/constants/marketplace';
import { canRenderPlatformHomeworkHtml, HomeworkTaskDescription, type HomeworkTaskScope } from '@/components/course-learning/HomeworkTaskDescription';
import { HomeworkSubmission } from '@/components/course-learning/HomeworkSubmission';
import { ports } from './setup';

const courseId = '00327a03-f79c-5d5c-9f57-d3c46cc54bae';
const lessonId = '1b7f35b7-e97f-541d-af6f-b96f9bd34597';
const actorId = '10000000-0000-4000-8000-000000000001';
const otherOrg = '20000000-0000-4000-8000-000000000002';
const otherCourse = '30000000-0000-4000-8000-000000000003';
const ownScope: HomeworkTaskScope = {
  routeCourseId: courseId,
  course: { id: courseId, organization_id: MARKETPLACE_ORG_ID },
  lesson: { id: lessonId, course_id: courseId },
};
const html = '<h2>Учебное задание</h2><p>Подготовьте обоснование.</p><ul><li>Условие</li><li>Результат</li></ul><table><thead><tr><th>Критерий</th></tr></thead><tbody><tr><td>Проверяемость</td></tr></tbody></table>';

describe('Current platform homework HTML — actual renderer and actual sanitizer', () => {
  it('HT01 renders readable headings, lists and table cells only for the matching platform source context', () => {
    const { container } = render(<HomeworkTaskDescription content={html} scope={ownScope} className="text-sm whitespace-pre-wrap" role="document" aria-label="Условия задания" />);
    expect(canRenderPlatformHomeworkHtml(ownScope)).toBe(true);
    expect(screen.getByRole('heading', { name: 'Учебное задание' })).toBeTruthy();
    expect(container.querySelectorAll('li')).toHaveLength(2);
    expect(screen.getByRole('columnheader', { name: 'Критерий' })).toBeTruthy();
    expect(screen.getByRole('cell', { name: 'Проверяемость' })).toBeTruthy();
    expect(screen.getByRole('document').classList.contains('text-sm')).toBe(true);
    expect(screen.getByRole('document').classList.contains('whitespace-normal')).toBe(true);
  });
  it('HT02 real DOMPurify removes executable tags, event attributes and javascript URLs', () => {
    const malicious = '<h2 onclick="window.__unsafe=1">Безопасное задание</h2><script>window.__unsafe=1</script><style>body{display:none}</style><iframe srcdoc="<script>alert(1)</script>"></iframe><object data="javascript:alert(1)"></object><form><input value="x" /></form><svg onload="alert(1)"></svg><a href="javascript:alert(1)" onmouseover="alert(1)">Источник</a>';
    const { container } = render(<HomeworkTaskDescription content={malicious} scope={ownScope} />);
    expect(screen.getByRole('heading', { name: 'Безопасное задание' })).toBeTruthy();
    expect(container.querySelector('script,style,iframe,object,embed,form,input,svg')).toBeNull();
    expect(container.querySelector('[onclick],[onmouseover],[onload],[srcdoc]')).toBeNull();
    expect(container.querySelector('a')?.getAttribute('href')).toBeNull();
  });
  it('HT03 plain-text mathematics and line breaks retain the original escaped text behavior on own courses', () => {
    const plain = 'Сравните: 2 < 5 и 8 > 3.\nВторая строка без HTML.';
    const { container } = render(<HomeworkTaskDescription content={plain} scope={ownScope} className="text-sm whitespace-pre-wrap" />);
    expect(container.textContent).toBe(plain);
    expect(container.querySelector('p,table,h2')).toBeNull();
    expect(container.firstElementChild?.className).toBe('text-sm whitespace-pre-wrap');
  });
  it('HT04 client copies keep literal text even when their ID or source lineage resembles a platform source', () => {
    const clientScope = { ...ownScope, course: { id: courseId, organization_id: otherOrg, source_course_id: courseId } };
    const { container } = render(<HomeworkTaskDescription content={html} scope={clientScope} className="whitespace-pre-wrap break-words" />);
    expect(container.textContent).toBe(html);
    expect(container.querySelector('h2,table,li')).toBeNull();
    expect(container.firstElementChild?.className).toBe('whitespace-pre-wrap break-words');
  });
  it('HT05 missing owner, route mismatch and stale lesson-course links fail closed to the original text view', () => {
    const mismatches: (HomeworkTaskScope | undefined)[] = [
      undefined,
      { ...ownScope, course: { id: courseId } },
      { ...ownScope, routeCourseId: otherCourse },
      { ...ownScope, lesson: { id: lessonId, course_id: otherCourse } },
      { ...ownScope, lesson: { id: lessonId } },
    ];
    const { container, rerender } = render(<HomeworkTaskDescription content={html} />);
    for (const scope of mismatches) {
      expect(canRenderPlatformHomeworkHtml(scope)).toBe(false);
      rerender(<HomeworkTaskDescription content={html} scope={scope} />);
      expect(container.querySelector('h2,table')).toBeNull();
      expect(container.textContent).toBe(html);
    }
  });
  it('HT06 a same-ID ownership/context change synchronously removes the rich view without reusing earlier HTML', () => {
    const { container, rerender } = render(<HomeworkTaskDescription content={html} scope={ownScope} />);
    expect(container.querySelector('table')).not.toBeNull();
    rerender(<HomeworkTaskDescription content={html} scope={{ ...ownScope, course: { id: courseId, organization_id: otherOrg } }} />);
    expect(container.querySelector('table')).toBeNull(); expect(container.textContent).toBe(html);
    rerender(<HomeworkTaskDescription content="Новое обычное условие" scope={ownScope} />);
    expect(container.querySelector('h2,table')).toBeNull(); expect(container.textContent).toBe('Новое обычное условие');
  });
  it('HT07 empty content remains empty and rendering does not rewrite the scope or original HTML', () => {
    const before = JSON.stringify(ownScope);
    const { container, rerender } = render(<HomeworkTaskDescription content={null} scope={ownScope} />);
    expect(container.childElementCount).toBe(0);
    rerender(<HomeworkTaskDescription content={html} scope={ownScope} />);
    expect(JSON.stringify(ownScope)).toBe(before); expect(html).toContain('<table>');
  });
  it('HT08 actual readonly HomeworkSubmission displays scoped HTML while retaining no-submit/no-complete behavior', async () => {
    const onComplete = vi.fn();
    ports.rows = [{ id: '40000000-0000-4000-8000-000000000004', organization_id: MARKETPLACE_ORG_ID, course_id: courseId, lesson_id: lessonId, student_id: actorId, content: 'Синтетический ответ', attachments: [], status: 'approved', score: 5, reviewer_comment: null, submitted_at: '2026-10-26T00:00:00Z', reviewed_at: '2026-10-26T01:00:00Z' }];
    render(<HomeworkSubmission organizationId={MARKETPLACE_ORG_ID} courseId={courseId} lessonId={lessonId} userId={actorId} taskDescription={html} taskScope={ownScope} isMobile={false} onComplete={onComplete} readOnly />);
    expect(await screen.findByRole('heading', { name: 'Учебное задание' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Отправить' })).toBeNull();
    expect(screen.queryByRole('textbox')).toBeNull(); expect(onComplete).not.toHaveBeenCalled();
    expect(ports.reads).toEqual([{ table: 'homework_submissions', filters: { organization_id: MARKETPLACE_ORG_ID, course_id: courseId, lesson_id: lessonId, student_id: actorId } }]);
  });
  it('HT09 actual client HomeworkSubmission retains its escaped task and existing answer form without new writes', async () => {
    const onComplete = vi.fn();
    const { container } = render(<HomeworkSubmission organizationId={otherOrg} courseId={courseId} lessonId={lessonId} userId={actorId} taskDescription={html} isMobile={false} onComplete={onComplete} />);
    expect(await screen.findByRole('textbox', { name: 'Ответ на практическое задание' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Отправить' }).hasAttribute('disabled')).toBe(true);
    expect(container.querySelector('table')).toBeNull();
    expect(container.textContent).toContain(html); expect(onComplete).not.toHaveBeenCalled();
    expect(ports.reads).toHaveLength(1);
  });
});
