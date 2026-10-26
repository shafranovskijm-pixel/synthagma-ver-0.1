import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, getDefaultNormalizer, render, screen } from '@testing-library/react';
import { MARKETPLACE_ORG_ID } from '@/constants/marketplace';
import { getCourseLandingPresentation, isPlatformCourseListing, RECOMMENDED_PLATFORM_COURSES, selectRecommendedPlatformCourses } from '@/lib/platformCourseCatalog';
import { loadPublicCourseCatalog } from '@/lib/publicCourseCatalog';
import { fetchCatalog } from '@/hooks/useCourseStoreFetch';
import { CourseStoreDetailView } from '@/components/organization/CourseStoreDetailView';
import { OrderDialog } from '@/components/organization/CourseStoreDialogs';
import { MarketplaceHeroCards } from '@/components/admin/marketplace/MarketplaceHeroCards';
import { ports } from './setup';

const OTHER_ORG = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const REC = RECOMMENDED_PLATFORM_COURSES[0];
// DOM text uses Testing Library whitespace normalization; keep the exact numeric amount and currency.
const exactMoneyText = (amount: number) => getDefaultNormalizer()(`${amount.toLocaleString()} ₽`);
function listing(overrides: Record<string, any> = {}) {
  return {
    id: '11111111-1111-4111-8111-111111111111', course_id: REC.courseId,
    organization_id: MARKETPLACE_ORG_ID, price_student: 15000, price_organization: 12000,
    is_active: true, description_short: null, organization: { name: 'СИНТАГМА' },
    course: { id: REC.courseId, organization_id: MARKETPLACE_ORG_ID, title: REC.fullTitle },
    ...overrides,
  };
}
function detail(course: any, onOrder = vi.fn()) {
  return render(<CourseStoreDetailView course={course} userRole="organization" userId="synthetic-owner" onBack={vi.fn()} onOrder={onOrder} />);
}
function order(course: any, onOrder = vi.fn(), count = 1) {
  return render(<OrderDialog open onOpenChange={vi.fn()} course={course} userRole="organization" studentsCount={count} setStudentsCount={vi.fn()} orderNotes="" setOrderNotes={vi.fn()} isOrdering={false} onOrder={onOrder} />);
}
function publicRow(courseId: string, index: number, title = 'Одинаковое название') {
  return {
    id: `10000000-0000-4000-8000-${String(index).padStart(12, '0')}`, course_id: courseId,
    description_short: null,
    course: { id: courseId, organization_id: MARKETPLACE_ORG_ID, title, description: null, is_published: true, hidden_from_catalog: false, category: { name: 'Новые · 2026.09', hidden_from_catalog: false } },
  };
}

describe('Current platform ownership and client boundaries', () => {
  it('FC01 accepts actual source owner and the explicit legacy null listing without mutating either row', () => {
    const own = listing(); const legacy = listing({ organization_id: null });
    const before = JSON.stringify([own, legacy]);
    expect(isPlatformCourseListing(own)).toBe(true);
    expect(isPlatformCourseListing(legacy)).toBe(true);
    expect(JSON.stringify([own, legacy])).toBe(before);
  });
  it('FC02 rejects a client copy even with a platform source_course_id and an identical title', () => {
    const copy = listing({ organization_id: OTHER_ORG, source_course_id: REC.courseId, course: { id: REC.courseId, organization_id: OTHER_ORG, title: REC.fullTitle } });
    expect(isPlatformCourseListing(copy)).toBe(false);
  });
  it('FC03 rejects missing ownership, a foreign listing owner and a mismatched source identity', () => {
    expect(isPlatformCourseListing(listing({ course: { id: REC.courseId, title: REC.fullTitle } }))).toBe(false);
    expect(isPlatformCourseListing(listing({ organization_id: undefined }))).toBe(false);
    expect(isPlatformCourseListing(listing({ organization_id: OTHER_ORG }))).toBe(false);
    expect(isPlatformCourseListing(listing({ course_id: '22222222-2222-4222-8222-222222222222' }))).toBe(false);
    expect(isPlatformCourseListing(null)).toBe(false);
  });
  it('FC04 actual store fetch requests current nested owner and keeps rows usable by the ownership guard', async () => {
    const rows = [listing(), listing({ organization_id: OTHER_ORG, course: { id: REC.courseId, organization_id: OTHER_ORG, title: REC.fullTitle } })];
    const query: any = { select: vi.fn(() => query), eq: vi.fn(() => query), neq: vi.fn(async () => ({ data: rows, error: null })) };
    ports.from.mockReturnValue(query);
    const receive = vi.fn(); await fetchCatalog(OTHER_ORG, receive);
    expect(query.select.mock.calls[0][0]).toContain('course:courses(id, organization_id,');
    expect(receive).toHaveBeenCalledWith(rows);
    expect(receive.mock.calls[0][0].map(isPlatformCourseListing)).toEqual([true, false]);
  });
});

describe('Actual detail and order components', () => {
  it('FC05 own source shows free receipt CTA even with an old positive listing price', () => {
    const course = listing(); const before = JSON.stringify(course); const onOrder = vi.fn();
    detail(course, onOrder);
    expect(screen.getByText('БЕСПЛАТНО')).toBeTruthy();
    expect(screen.queryByText('12,000 ₽')).toBeNull();
    expect(screen.queryByText('Приобрести комплект')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Получить бесплатно' }));
    expect(onOrder).toHaveBeenCalledTimes(1);
    expect(onOrder).toHaveBeenCalledWith(course);
    expect(JSON.stringify(course)).toBe(before);
  });
  it('FC06 unknown or client ownership preserves the original positive-price offer', () => {
    detail(listing({ organization_id: OTHER_ORG, course: { id: REC.courseId, organization_id: OTHER_ORG, title: REC.fullTitle } }));
    expect(screen.queryByText('БЕСПЛАТНО')).toBeNull();
    expect(screen.getByText(exactMoneyText(12000))).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Получить курс' })).toBeTruthy();
  });
  it('FC07 own preview uses the normal course route rather than a historical paid-program page', () => {
    detail(listing()); fireEvent.click(screen.getByRole('button', { name: 'Просмотр' }));
    expect(ports.navigate).toHaveBeenCalledWith(`/course-preview/${REC.courseId}?from=store`);
  });
  it('FC08 own order is free, headcount is planning only and the existing submit callback receives no forged price', () => {
    const submit = vi.fn(); order(listing(), submit, 4);
    expect(screen.getByText('Получить курс бесплатно')).toBeTruthy();
    expect(screen.getByText('Бесплатно')).toBeTruthy();
    expect(screen.queryByText('Итого:')).toBeNull();
    expect(screen.getByLabelText('Планируемое количество слушателей')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Получить бесплатно' }));
    expect(submit).toHaveBeenCalledTimes(1);
    expect(submit.mock.calls[0][0]).toHaveProperty('type', 'click');
    expect(submit.mock.calls[0][0]).not.toHaveProperty('price');
  });
  it('FC09 a client offer retains its price and headcount calculation', () => {
    order(listing({ organization_id: OTHER_ORG, course: { id: REC.courseId, organization_id: OTHER_ORG, title: REC.fullTitle } }), vi.fn(), 2);
    expect(screen.getByText(exactMoneyText(12000))).toBeTruthy();
    expect(screen.getByText(exactMoneyText(24000))).toBeTruthy();
    expect(screen.queryByText('Получить курс бесплатно')).toBeNull();
  });
  it('FC14 even a historical paid-program ID is free when its current source ownership is platform-owned', () => {
    const paidId = '8ae9739f-e87b-5397-94a5-86bfe99b0d77';
    detail(listing({ course_id: paidId, course: { id: paidId, organization_id: MARKETPLACE_ORG_ID, title: 'Исторический комплект' } }));
    expect(screen.getByText('БЕСПЛАТНО')).toBeTruthy();
    expect(screen.queryByText('Приобрести комплект')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Просмотр' }));
    expect(ports.navigate).toHaveBeenCalledWith(`/course-preview/${paidId}?from=store`);
  });
  it('FC15 the same legacy ID with a foreign current owner retains the existing paid-kit dialog', () => {
    const paidId = '8ae9739f-e87b-5397-94a5-86bfe99b0d77';
    order(listing({ course_id: paidId, organization_id: OTHER_ORG, course: { id: paidId, organization_id: OTHER_ORG, title: 'Чужой комплект' } }), vi.fn(), 3);
    expect(screen.getByText('Приобрести комплект для учебного центра')).toBeTruthy();
    // Existing client paid-kit UI shows both unit price and flat total, even for multiple planned listeners.
    expect(screen.getAllByText(exactMoneyText(12000))).toHaveLength(2);
    expect(screen.getByText('Итого:')).toBeTruthy();
    expect(screen.queryByText(exactMoneyText(36000))).toBeNull();
    expect(screen.getByLabelText('Планируемое количество слушателей')).toHaveProperty('value', '3');
    expect(screen.getByRole('button', { name: 'Приобрести комплект' }).hasAttribute('disabled')).toBe(false);
    expect(screen.queryByText('Получить бесплатно')).toBeNull();
  });
});

describe('Active landing uses current direct ownership without rewriting stored settings', () => {
  const settings = {
    external_url: 'https://payments.example/NON_SECRET_TEST_ORDER',
    pricing: { title: 'Старые тарифы', tiers: [{ name: 'Пакет', price: 15000 }] },
    enrollment: { mode: 'payment', consent_required: true, fields: [{ key: 'email', type: 'email', required: true }], success_url: 'https://payments.example/success' },
    cta: { title: 'Купить комплект', subtitle: 'Старая цена' },
    sections_order: ['hero', 'pricing', 'cta'],
  };
  it('FC16 platform landing derives zero price, no paid tiers/redirect and the existing request flow, preserving stored data', () => {
    const before = JSON.stringify(settings);
    const result = getCourseLandingPresentation({ id: REC.courseId, organization_id: MARKETPLACE_ORG_ID, price: 15000, landing_content: settings });
    expect(result.platformFree).toBe(true); expect(result.price).toBe(0);
    expect(result.landingContent.external_url).toBeUndefined();
    expect(result.landingContent.pricing.tiers).toEqual([]);
    expect(result.landingContent.enrollment.mode).toBe('request');
    expect(result.landingContent.enrollment.success_url).toBeUndefined();
    expect(result.landingContent.enrollment.fields).toBe(settings.enrollment.fields);
    expect(result.landingContent.enrollment.consent_required).toBe(true);
    expect(result.landingContent.cta.title).toBe('Бесплатный доступ к курсу');
    expect(result.landingContent.sections_order).toBe(settings.sections_order);
    expect(JSON.stringify(settings)).toBe(before);
  });
  it('FC17 client landing keeps its original price, payment settings, tiers and external URL by identity', () => {
    const result = getCourseLandingPresentation({ id: REC.courseId, organization_id: OTHER_ORG, price: 15000, landing_content: settings });
    expect(result.platformFree).toBe(false); expect(result.price).toBe(15000);
    expect(result.landingContent).toBe(settings);
    expect(result.landingContent.enrollment.mode).toBe('payment');
  });
  it('FC18 unknown direct owner or missing ID never inherits free status from a platform source copy', () => {
    for (const course of [{ id: REC.courseId, organization_id: undefined }, { id: undefined, organization_id: MARKETPLACE_ORG_ID }]) {
      const result = getCourseLandingPresentation({ ...course, price: 15000, landing_content: settings });
      expect(result.platformFree).toBe(false); expect(result.price).toBe(15000); expect(result.landingContent).toBe(settings);
    }
  });
});

describe('One exact editorial selection, all other public courses retained', () => {
  it('FC10 actual cards dispatch the exact available UUID and contain no invented popularity or April claim', () => {
    const click = vi.fn();
    render(<MarketplaceHeroCards availableCourseIds={[REC.courseId]} onCourseClick={click} />);
    expect(screen.getAllByRole('button')).toHaveLength(1);
    fireEvent.click(screen.getByRole('button'));
    expect(click).toHaveBeenCalledTimes(1);
    expect(click).toHaveBeenCalledWith(REC.courseId);
    expect(screen.queryByText(/Популярные|апреле|Свежие программы/)).toBeNull();
  });
  it('FC11 unavailable or duplicate listings never become a title-matched substitute', () => {
    const { container } = render(<MarketplaceHeroCards availableCourseIds={['22222222-2222-4222-8222-222222222222', REC.courseId, REC.courseId]} onCourseClick={vi.fn()} />);
    expect(container.querySelector('button')).toBeNull();
    const sameTitle = [{ courseId: '22222222-2222-4222-8222-222222222222', title: REC.fullTitle }];
    expect(selectRecommendedPlatformCourses(sameTitle, item => item.courseId)).toEqual([]);
  });
  it('FC12 public catalogue keeps every valid row while selecting the six exact course IDs in editorial order', async () => {
    const extraId = '33333333-3333-4333-8333-333333333333';
    const rows = [...RECOMMENDED_PLATFORM_COURSES].reverse().map((course, index) => publicRow(course.courseId, index + 1));
    rows.push(publicRow(extraId, 99));
    const before = JSON.stringify(rows);
    const catalogue = await loadPublicCourseCatalog({ fetchPage: async () => rows });
    expect(catalogue.totalCount).toBe(7);
    expect(catalogue.groups.flatMap(group => group.courses).some(course => course.courseId === extraId)).toBe(true);
    expect(catalogue.examples.map(course => course.courseId)).toEqual(RECOMMENDED_PLATFORM_COURSES.map(course => course.courseId));
    expect(JSON.stringify(rows)).toBe(before);
  });
  it('FC13 absence of the recommended course leaves its example absent without hiding the ordinary catalogue', async () => {
    const catalogue = await loadPublicCourseCatalog({ fetchPage: async () => [publicRow('33333333-3333-4333-8333-333333333333', 99, REC.fullTitle)] });
    expect(catalogue.totalCount).toBe(1);
    expect(catalogue.examples).toEqual([]);
    expect(catalogue.groups[0].courses[0].title).toBe(REC.fullTitle);
  });
});
