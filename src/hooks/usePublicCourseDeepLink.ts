import { useEffect, useRef, useState } from 'react';
import { useLocation, useSearchParams } from 'react-router-dom';
import { resolvePublicCourseDeepLink, type CourseCatalogReadScope, type PublicCourseDeepLinkListing } from '@/lib/publicCourseExplorer';

interface Options<T> {
  catalog: T[];
  isLoading: boolean;
  loadedScope: CourseCatalogReadScope | null;
  organizationId: string;
  userId?: string;
  onSelect: (course: T) => void;
  onOpenCatalog: (tab: 'catalog') => void;
}

/** Resolves only an exact currently public source. Does not open an order or call any remote operation. */
export function usePublicCourseDeepLink<T extends PublicCourseDeepLinkListing>({
  catalog, isLoading, loadedScope, organizationId, userId, onSelect, onOpenCatalog,
}: Options<T>) {
  const [params, setParams] = useSearchParams();
  const location = useLocation();
  const requested = params.has('catalogCourseId');
  const requestedId = params.getAll('catalogCourseId').length === 1 ? params.get('catalogCourseId') : '';
  const handled = useRef<string | null>(null);
  const [unavailableKey, setUnavailableKey] = useState<string | null>(null);
  const requestKey = JSON.stringify([location.key, organizationId, userId, requested, requestedId]);

  useEffect(() => {
    if (!requested) { handled.current = null; setUnavailableKey(null); return; }
    if (isLoading || !loadedScope || loadedScope.organizationId !== organizationId || loadedScope.userId !== userId) return;
    if (handled.current === requestKey) return;
    handled.current = requestKey;
    const selected = resolvePublicCourseDeepLink(catalog, requestedId, { organizationId, userId }, loadedScope, isLoading);
    onOpenCatalog('catalog');
    setUnavailableKey(selected ? null : requestKey);
    if (selected) onSelect(selected);
  }, [catalog, isLoading, loadedScope, organizationId, userId, requested, requestedId, requestKey, onSelect, onOpenCatalog]);

  const clearRequestedCourse = () => {
    setParams(previous => {
      const next = new URLSearchParams(previous);
      next.delete('catalogCourseId');
      return next;
    }, { replace: true });
    setUnavailableKey(null);
  };
  return { requested, requestedId, unavailable: requested && unavailableKey === requestKey, clearRequestedCourse };
}
