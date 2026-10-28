import { useCallback, useEffect, useRef, useState } from "react";
import {
  createLibrarySignedUrl,
  fetchCourseLibrary,
  type CourseLibraryModule,
  type CourseLibraryResource,
} from "@/api/courseLibrary";
import { useAuth } from "@/hooks/useAuth";
import { isValidHttpsUrl } from "@/lib/courseLibrary";
import type { LegacyCourseFileDelivery } from "@/lib/courseExactFileDelivery";

export function useCourseLibrary(courseId: string | undefined, enabled = true) {
  const { user } = useAuth();
  const actorId = user?.id ?? null;
  const scopeRef = useRef({ actorId, courseId, enabled });
  if (scopeRef.current.actorId !== actorId || scopeRef.current.courseId !== courseId || scopeRef.current.enabled !== enabled) {
    scopeRef.current = { actorId, courseId, enabled };
  }
  const scope = scopeRef.current;
  const mounted = useRef(false);
  const [loaded, setLoaded] = useState<{
    scope: typeof scope;
    resources: CourseLibraryResource[];
    modules: CourseLibraryModule[];
    loading: boolean;
    error: string | null;
  } | null>(null);
  const requestRef = useRef(0);
  const isCurrent = useCallback(() => mounted.current && scopeRef.current === scope, [scope]);

  const refresh = useCallback(async () => {
    if (!isCurrent()) return;
    const request = ++requestRef.current;
    if (!enabled || !courseId || !actorId) {
      setLoaded({ scope, resources: [], modules: [], loading: false, error: null });
      return;
    }
    setLoaded({ scope, resources: [], modules: [], loading: true, error: null });
    try {
      const result = await fetchCourseLibrary(courseId);
      if (!isCurrent() || request !== requestRef.current) return;
      setLoaded({ scope, resources: result.resources, modules: result.modules, loading: false, error: null });
    } catch (caught) {
      if (!isCurrent() || request !== requestRef.current) return;
      console.error("[course-library] load failed", caught);
      setLoaded({ scope, resources: [], modules: [], loading: false,
        error: "Не удалось загрузить электронную библиотеку. Повторите попытку." });
    }
  }, [courseId, actorId, scope, isCurrent, enabled]);

  useEffect(() => {
    mounted.current = true;
    void refresh();
    return () => { mounted.current = false; requestRef.current += 1; };
  }, [refresh]);

  // Only FilePreviewDialog's successful literal legacy branch may call this.
  // A stale resource, actor or reference cannot mint even a legacy signed URL.
  const getOpenUrl = useCallback(async (
    resource: CourseLibraryResource,
    context: Readonly<LegacyCourseFileDelivery>,
    signal: AbortSignal,
  ): Promise<string> => {
    const current = () => enabled && isCurrent() && !signal.aborted && !!actorId
      && resource.courseId === courseId && context.mode === "legacy" && context.state === "legacy"
      && context.actor_id === actorId && context.course_id === courseId
      && context.reference_kind === "course_document" && context.reference_id === resource.assignmentId;
    if (!current()) throw new Error("Материал недоступен в текущем кабинете");
    if (resource.externalUrl) {
      if (!isValidHttpsUrl(resource.externalUrl)) {
        throw new Error("Ссылка ресурса временно недоступна или имеет небезопасный формат");
      }
      return resource.externalUrl;
    }
    if (resource.storagePath) {
      const url = await createLibrarySignedUrl(resource.storagePath);
      if (!current() || !isValidHttpsUrl(url)) throw new Error("Материал недоступен в текущем кабинете");
      return url;
    }
    throw new Error("У ресурса пока нет доступной ссылки или файла");
  }, [courseId, actorId, isCurrent, enabled]);

  const current = loaded?.scope === scope ? loaded : null;
  return {
    resources: current?.resources ?? [],
    modules: current?.modules ?? [],
    loading: enabled ? current?.loading ?? !!courseId : false,
    error: current?.error ?? null,
    refresh,
    getOpenUrl,
  };
}
