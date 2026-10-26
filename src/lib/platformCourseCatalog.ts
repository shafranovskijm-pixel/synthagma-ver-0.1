import { MARKETPLACE_ORG_ID } from '@/constants/marketplace';

export interface CourseListingOwnership {
  course_id?: unknown;
  organization_id?: unknown;
  course?: { id?: unknown; organization_id?: unknown } | null;
}

/** Presentation only. The purchase RPC remains authoritative for price, permission and delivery. */
export function isPlatformCourseListing(listing: CourseListingOwnership | null | undefined): boolean {
  return !!listing && typeof listing.course_id === 'string'
    && listing.course?.id === listing.course_id
    && listing.course.organization_id === MARKETPLACE_ORG_ID
    && (listing.organization_id === MARKETPLACE_ORG_ID || listing.organization_id === null);
}

interface CourseLandingSource {
  id?: unknown;
  organization_id?: unknown;
  price: number;
  landing_content: any;
}

/** Derive the current platform offer without rewriting saved landing content or a customer's settings. */
export function getCourseLandingPresentation(course: CourseLandingSource) {
  const platformFree = typeof course.id === 'string'
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(course.id)
    && course.organization_id === MARKETPLACE_ORG_ID;
  if (!platformFree) return { platformFree, price: course.price, landingContent: course.landing_content };
  const original = course.landing_content && typeof course.landing_content === 'object' && !Array.isArray(course.landing_content)
    ? course.landing_content : {};
  return {
    platformFree, price: 0,
    landingContent: {
      ...original,
      external_url: undefined,
      pricing: { ...original.pricing, tiers: [] },
      cta: { ...original.cta, title: 'Бесплатный доступ к курсу', subtitle: 'Оставьте заявку на обучение. Оплата за доступ к этому курсу платформы не требуется.' },
      enrollment: { ...original.enrollment, mode: 'request', success_url: undefined },
    },
  };
}

/** Editorial selection from the source-derived 2026.09 passports; not a popularity or approval rating. */
export const RECOMMENDED_PLATFORM_COURSES = [
  {
    "courseId": "da5f004e-b9ea-5fb4-ac58-068cadb4ab24",
    "title": "ИИ для учебного центра",
    "fullTitle": "Генеративный ИИ в работе учебного центра: подготовка и проверка материалов",
    "sourceLessonId": "f47ee1fe-725e-5a90-8c51-8327e342e27c"
  },
  {
    "courseId": "8b2e739c-5b3f-58a8-b810-02f1510e5327",
    "title": "Проектирование ДПО",
    "fullTitle": "Проектирование дополнительных профессиональных программ и учебных комплектов",
    "sourceLessonId": "50f7c9b7-6107-5aba-8326-212f46f09b2e"
  },
  {
    "courseId": "07169ea9-1d00-531a-8dec-97b4a3fdb3a7",
    "title": "Кадровое делопроизводство",
    "fullTitle": "Кадровое делопроизводство: оформление трудовых событий и контроль достоверности",
    "sourceLessonId": "a078c7a2-78ce-556f-ac02-5608a07faeb8"
  },
  {
    "courseId": "00327a03-f79c-5d5c-9f57-d3c46cc54bae",
    "title": "44-ФЗ для поставщика",
    "fullTitle": "Участие поставщика в закупках 44-ФЗ: проверка условий и подготовка заявки",
    "sourceLessonId": "e93e2f93-b8e3-5a80-9d66-6788fb118f88"
  },
  {
    "courseId": "2b39c8c9-3093-53f4-8aa2-9b399e78d063",
    "title": "Пожарная безопасность",
    "fullTitle": "Пожарная безопасность для лиц, ответственных за обеспечение пожарной безопасности",
    "sourceLessonId": "a0ab3ae7-80db-5943-bdc9-28b42a2a3e6f"
  },
  {
    "courseId": "7f64b0b6-fa12-5ab7-b410-fcf1fb8ac277",
    "title": "Учебный процесс в СДО",
    "fullTitle": "Организация учебного процесса в СДО: маршруты, доступ и история обучения",
    "sourceLessonId": "5a2d7d81-bd4f-5285-b5ab-9f681c78b21a"
  }
] as const;

/** Select only entries present in the current catalogue; never substitute an equal title or a client copy. */
export function selectRecommendedPlatformCourses<T>(courses: readonly T[], courseId: (course: T) => string): T[] {
  return RECOMMENDED_PLATFORM_COURSES.flatMap(recommendation => {
    const matches = courses.filter(course => courseId(course) === recommendation.courseId);
    return matches.length === 1 ? matches : [];
  });
}
