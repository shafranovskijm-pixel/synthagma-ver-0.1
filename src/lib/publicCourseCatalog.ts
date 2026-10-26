import { z } from 'zod';
import { publicCatalogClient } from '@/integrations/supabase/publicCatalogClient';
import { MARKETPLACE_ORG_ID } from '@/constants/marketplace';
import { selectRecommendedPlatformCourses } from '@/lib/platformCourseCatalog';

export const PUBLIC_CATALOG_PAGE_SIZE = 200;
const CATEGORY_ORDER = [
  'Электробезопасность', 'Энергетика', 'Рабочие профессии', 'Медицина',
  'Охрана труда', 'Пожарная безопасность', 'Строительные специальности',
  'Слесари', 'Промышленная безопасность', 'Разное', 'Машинист',
  'Экологическая безопасность', 'Строительный контроль', 'Профессиональная переподготовка',
];

const rowSchema = z.object({
  id: z.string().uuid(),
  course_id: z.string().uuid(),
  description_short: z.string().nullable(),
  course: z.object({
    id: z.string().uuid(), organization_id: z.literal(MARKETPLACE_ORG_ID), title: z.string().trim().min(1),
    description: z.string().nullable(), is_published: z.literal(true),
    hidden_from_catalog: z.boolean().nullable().optional(),
    category: z.object({
      name: z.string().trim().min(1), hidden_from_catalog: z.boolean().nullable().optional(),
    }).nullable(),
  }),
}).refine(row => row.course_id === row.course.id, 'Unexpected public course identity');

export interface PublicCatalogCourse {
  id: string;
  courseId: string;
  title: string;
  description: string | null;
  categoryName: string;
}
export interface PublicCatalogGroup {
  title: string;
  count: number;
  courses: PublicCatalogCourse[];
}
export interface PublicCourseCatalog {
  groups: PublicCatalogGroup[];
  totalCount: number;
  directionsCount: number;
  examples: PublicCatalogCourse[];
}
export type PublicCatalogPageFetcher = (
  from: number, to: number, signal?: AbortSignal,
) => Promise<unknown[]>;

export const fetchPublicCatalogPage: PublicCatalogPageFetcher = async (from, to, signal) => {
  const query = publicCatalogClient.from('marketplace_courses')
    .select('id, course_id, description_short, course:courses!inner(id, organization_id, title, description, is_published, hidden_from_catalog, category:course_categories(name, hidden_from_catalog))')
    .eq('organization_id', MARKETPLACE_ORG_ID)
    .eq('course.organization_id', MARKETPLACE_ORG_ID)
    .eq('is_active', true)
    .eq('is_validated', true)
    .eq('course.is_published', true)
    .order('id', { ascending: true })
    .range(from, to);
  const { data, error } = signal ? await query.abortSignal(signal) : await query;
  if (error) throw error;
  if (!Array.isArray(data)) throw new Error('Public catalogue response is unavailable');
  return data;
};

export async function loadPublicCourseCatalog({
  fetchPage = fetchPublicCatalogPage, signal,
}: { fetchPage?: PublicCatalogPageFetcher; signal?: AbortSignal } = {}): Promise<PublicCourseCatalog> {
  const courses: PublicCatalogCourse[] = [];
  const seen = new Set<string>();
  for (let from = 0; ; from += PUBLIC_CATALOG_PAGE_SIZE) {
    const raw = await fetchPage(from, from + PUBLIC_CATALOG_PAGE_SIZE - 1, signal);
    const rows = z.array(rowSchema).parse(raw);
    if (rows.length > PUBLIC_CATALOG_PAGE_SIZE) throw new Error('Unexpected public catalogue page');
    for (const row of rows) {
      if (seen.has(row.id)) throw new Error('Public catalogue changed during loading');
      seen.add(row.id);
      if (row.course.hidden_from_catalog === true || row.course.category?.hidden_from_catalog === true) continue;
      courses.push({
        id: row.id, courseId: row.course.id, title: row.course.title,
        description: row.description_short || row.course.description || null,
        categoryName: row.course.category?.name || 'Прочее',
      });
    }
    if (rows.length < PUBLIC_CATALOG_PAGE_SIZE) break;
  }
  const byCategory = new Map<string, PublicCatalogCourse[]>();
  for (const course of courses) {
    const group = byCategory.get(course.categoryName) ?? [];
    group.push(course);
    byCategory.set(course.categoryName, group);
  }
  const rank = (name: string) => {
    const index = CATEGORY_ORDER.indexOf(name);
    return index < 0 ? CATEGORY_ORDER.length : index;
  };
  const groups = [...byCategory].map(([title, items]) => ({
    title, count: items.length,
    courses: items.sort((a, b) => a.title.localeCompare(b.title, 'ru') || a.id.localeCompare(b.id)),
  })).sort((a, b) => rank(a.title) - rank(b.title) || a.title.localeCompare(b.title, 'ru'));
  const examples = selectRecommendedPlatformCourses(courses, course => course.courseId);
  return { groups, totalCount: courses.length, directionsCount: groups.length, examples };
}
