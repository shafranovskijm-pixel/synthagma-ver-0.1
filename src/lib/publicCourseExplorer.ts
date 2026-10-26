import type { PublicCatalogCourse, PublicCatalogGroup } from '@/lib/publicCourseCatalog';
import { MARKETPLACE_ORG_ID } from '@/constants/marketplace';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Plain text only: saved descriptions are never inserted as HTML by the catalogue. */
export function publicCourseText(value: string | null | undefined): string {
  return (value ?? '').replace(/<[^>]*>/g, ' ').replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&amp;/gi, '&').replace(/\s+/g, ' ').trim();
}

function searchable(value: string) {
  return publicCourseText(value).normalize('NFKC').toLocaleLowerCase('ru').replace(/ё/g, 'е')
    .replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

/** Search only the already-authorized public DTO. Never fetch or infer additional courses. */
export function filterPublicCourses(groups: readonly PublicCatalogGroup[], query: string, direction = ''): PublicCatalogCourse[] {
  const tokens = searchable(query).split(' ').filter(Boolean);
  return groups.flatMap(group => direction && group.title !== direction ? [] : group.courses)
    .filter(course => {
      const haystack = searchable(`${course.title} ${course.description ?? ''} ${course.categoryName}`);
      return tokens.every(token => haystack.includes(token));
    });
}

export function courseCatalogDestination(courseId: string): string | null {
  if (!UUID.test(courseId)) return null;
  const query = new URLSearchParams({ tab: 'services', catalogCourseId: courseId });
  return `/organization?${query}`;
}

export function courseCatalogLoginHref(courseId: string): string | null {
  const destination = courseCatalogDestination(courseId);
  return destination ? `/login?${new URLSearchParams({ next: destination })}` : null;
}

export interface PublicCourseDeepLinkListing {
  course_id?: unknown;
  organization_id?: unknown;
  is_active?: unknown;
  is_validated?: unknown;
  course?: {
    id?: unknown;
    organization_id?: unknown;
    is_published?: unknown;
    hidden_from_catalog?: unknown;
    category?: { hidden_from_catalog?: unknown } | null;
  } | null;
}

export interface CourseCatalogReadScope {
  organizationId: string;
  userId?: string;
  requestVersion: number;
}

/** Presentation selection, not purchase authorization. Ambiguity or missing current facts fail closed. */
export function resolvePublicCourseDeepLink<T extends PublicCourseDeepLinkListing>(
  catalog: readonly T[], requestedId: string | null, expectedScope: { organizationId: string; userId?: string },
  loadedScope: CourseCatalogReadScope | null, isLoading: boolean,
): T | null {
  if (!requestedId || !UUID.test(requestedId) || isLoading || !expectedScope.organizationId || !expectedScope.userId
    || !loadedScope || loadedScope.organizationId !== expectedScope.organizationId || loadedScope.userId !== expectedScope.userId) return null;
  const matches = catalog.filter(row => row.course_id === requestedId);
  if (matches.length !== 1) return null;
  const row = matches[0]; const course = row.course;
  return row.organization_id === MARKETPLACE_ORG_ID && row.is_active === true && row.is_validated === true
    && course?.id === requestedId && course.organization_id === MARKETPLACE_ORG_ID
    && course.is_published === true && course.hidden_from_catalog === false
    && (course.category === null || course.category?.hidden_from_catalog === false) ? row : null;
}
