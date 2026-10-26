import React from 'react';
import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { PublicCourseExplorer } from '@/components/landing/PublicCourseExplorer';
import { filterPublicCourses, publicCourseText } from '@/lib/publicCourseExplorer';
import type { PublicCatalogCourse, PublicCourseCatalog } from '@/lib/publicCourseCatalog';

function course(index: number, title = `Курс ${index}`, categoryName = 'Педагогика'): PublicCatalogCourse {
  return { id: `10000000-0000-4000-8000-${String(index).padStart(12, '0')}`, courseId: `20000000-0000-4000-8000-${String(index).padStart(12, '0')}`, title, categoryName, description: 'Практические задания и обратная связь' };
}
function catalog(courses: PublicCatalogCourse[]): PublicCourseCatalog {
  const categories = [...new Set(courses.map(item => item.categoryName))];
  return { totalCount: courses.length, directionsCount: categories.length, examples: [], groups: categories.map(title => { const items = courses.filter(item => item.categoryName === title); return { title, count: items.length, courses: items }; }) };
}

describe('Public course discovery', () => {
  it('PCE01 finds Russian case/ё/punctuation and all tokens across title, direction and plain description', () => {
    const data = catalog([course(1, 'Проверяемый отчёт 44-ФЗ', 'Закупки'), course(2, 'Планирование урока')]);
    const before = JSON.stringify(data);
    expect(filterPublicCourses(data.groups, ' ОТЧЕТ 44 фз закупки ').map(item => item.courseId)).toEqual([data.groups[0].courses[0].courseId]);
    expect(filterPublicCourses(data.groups, 'ПЛАНИРОВАНИЕ связь').map(item => item.title)).toEqual(['Планирование урока']);
    expect(filterPublicCourses(data.groups, 'отчет несуществующий')).toEqual([]);
    expect(JSON.stringify(data)).toBe(before);
  });
  it('PCE02 intersects direction and query, keeps the original order and returns no substitute for an unknown direction', () => {
    const data = catalog([course(1, 'Анализ'), course(2, 'Анализ кадров', 'Кадры'), course(3, 'Анализ заданий')]);
    expect(filterPublicCourses(data.groups, 'анализ', 'Педагогика').map(item => item.title)).toEqual(['Анализ', 'Анализ заданий']);
    expect(filterPublicCourses(data.groups, '', 'Неразрешённое направление')).toEqual([]);
  });
  it('PCE03 shows twelve cards, reveals the remainder and resets pagination after a search and clear', () => {
    render(<MemoryRouter><PublicCourseExplorer catalog={catalog(Array.from({ length: 14 }, (_, index) => course(index + 1)))} /></MemoryRouter>);
    const list = screen.getByRole('list', { name: 'Курсы публичного каталога' });
    expect(within(list).getAllByRole('article')).toHaveLength(12);
    fireEvent.click(screen.getByRole('button', { name: 'Показать ещё 2' }));
    expect(within(list).getAllByRole('article')).toHaveLength(14);
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'Курс 14' } });
    expect(within(list).getAllByRole('article')).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: 'Очистить поиск' }));
    expect(within(list).getAllByRole('article')).toHaveLength(12);
  });
  it('PCE04 presents safe text and a precise login round trip without a payment or certificate claim', () => {
    const item = { ...course(1, 'Работа с данными'), description: '<b>Проверяемый</b>&nbsp;результат <img src=x onerror=alert(1)>' };
    render(<MemoryRouter><PublicCourseExplorer catalog={catalog([item])} /></MemoryRouter>);
    expect(screen.getByText('Проверяемый результат')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Купить|Оплатить|Получить сертификат/ })).toBeNull();
    const target = screen.getByRole('link', { name: 'Открыть в кабинете: Работа с данными' }).getAttribute('href')!;
    const next = new URL(target, 'https://synthetic.example').searchParams.get('next')!;
    expect(new URL(next, 'https://synthetic.example').pathname).toBe('/organization');
    expect(new URL(next, 'https://synthetic.example').searchParams.get('catalogCourseId')).toBe(item.courseId);
    expect(publicCourseText(item.description)).toBe('Проверяемый результат');
  });
  it('PCE05 native direction filter, no-result state and reset remain keyboard discoverable', () => {
    render(<MemoryRouter><PublicCourseExplorer catalog={catalog([course(1), course(2, 'Кадры', 'Кадровое дело')])} /></MemoryRouter>);
    fireEvent.change(screen.getByRole('combobox', { name: 'Направление' }), { target: { value: 'Кадровое дело' } });
    expect(screen.getByRole('list').querySelectorAll('article')).toHaveLength(1);
    fireEvent.change(screen.getByRole('searchbox', { name: 'Какой навык хотите развить?' }), { target: { value: 'нет такого курса' } });
    expect(screen.getByRole('heading', { name: 'По вашему запросу курсов не найдено' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Показать все курсы' }));
    expect(screen.getByRole('list').querySelectorAll('article')).toHaveLength(2);
    expect(screen.getByRole('status').textContent).toContain('2 из 2');
  });
});
