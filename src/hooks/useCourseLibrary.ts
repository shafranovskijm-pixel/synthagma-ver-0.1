import { useCallback, useEffect, useRef, useState } from "react";
import {
  createLibrarySignedUrl,
  fetchCourseLibrary,
  type CourseLibraryModule,
  type CourseLibraryResource,
} from "@/api/courseLibrary";
import { isValidHttpsUrl } from "@/lib/courseLibrary";

export function useCourseLibrary(courseId: string | undefined) {
  const [resources, setResources] = useState<CourseLibraryResource[]>([]);
  const [modules, setModules] = useState<CourseLibraryModule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const requestRef = useRef(0);

  const refresh = useCallback(async () => {
    if (!courseId) {
      setResources([]);
      setModules([]);
      setLoading(false);
      return;
    }

    const request = ++requestRef.current;
    setLoading(true);
    setError(null);
    try {
      const result = await fetchCourseLibrary(courseId);
      if (request !== requestRef.current) return;
      setResources(result.resources);
      setModules(result.modules);
    } catch (caught) {
      if (request !== requestRef.current) return;
      console.error("[course-library] load failed", caught);
      setResources([]);
      setModules([]);
      setError("Не удалось загрузить электронную библиотеку. Повторите попытку.");
    } finally {
      if (request === requestRef.current) setLoading(false);
    }
  }, [courseId]);

  useEffect(() => {
    void refresh();
    return () => {
      requestRef.current += 1;
    };
  }, [refresh]);

  const getOpenUrl = useCallback(async (resource: CourseLibraryResource): Promise<string> => {
    if (resource.externalUrl) {
      if (!isValidHttpsUrl(resource.externalUrl)) {
        throw new Error("Ссылка ресурса временно недоступна или имеет небезопасный формат");
      }
      return resource.externalUrl;
    }
    if (resource.storagePath) return createLibrarySignedUrl(resource.storagePath);
    throw new Error("У ресурса пока нет доступной ссылки или файла");
  }, []);

  return {
    resources,
    modules,
    loading,
    error,
    refresh,
    getOpenUrl,
  };
}
