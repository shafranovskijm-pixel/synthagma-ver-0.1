import { useQuery } from '@tanstack/react-query';
import { loadPublicCourseCatalog } from '@/lib/publicCourseCatalog';

export const PUBLIC_COURSE_CATALOG_QUERY_KEY = ['public-course-catalog', 'v1'] as const;

export function usePublicCourseCatalog() {
  return useQuery({
    queryKey: PUBLIC_COURSE_CATALOG_QUERY_KEY,
    queryFn: ({ signal }) => loadPublicCourseCatalog({ signal }),
    staleTime: 5 * 60 * 1000,
  });
}
