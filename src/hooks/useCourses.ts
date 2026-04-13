import { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Course, CourseCategory, CourseFilter, CourseViewMode } from "@/types";
import { 
  fetchCourses,
  fetchCourseStudentCounts,
  fetchCategories,
  createCourse,
  updateCourse,
  deleteCourse,
  publishCourse,
  duplicateCourse,
  createCategory,
  updateCategory,
  deleteCategory
} from "@/api/courses";
import { toast } from "sonner";

interface UseCoursesReturn {
  courses: Course[];
  error: string | null;
  categories: CourseCategory[];
  isLoading: boolean;
  // Filtering
  filter: CourseFilter;
  setFilter: (filter: CourseFilter) => void;
  categoryFilter: string;
  setCategoryFilter: (categoryId: string) => void;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  viewMode: CourseViewMode;
  setViewMode: (mode: CourseViewMode) => void;
  filteredCourses: Course[];
  // Course CRUD
  create: (title: string, description?: string, categoryId?: string) => Promise<Course | null>;
  update: (courseId: string, updates: Partial<Course>) => Promise<boolean>;
  remove: (courseId: string) => Promise<boolean>;
  publish: (courseId: string, isPublished: boolean) => Promise<boolean>;
  duplicate: (courseId: string) => Promise<Course | null>;
  // Category CRUD
  createCat: (name: string, color: string) => Promise<CourseCategory | null>;
  updateCat: (categoryId: string, updates: Partial<CourseCategory>) => Promise<boolean>;
  removeCat: (categoryId: string) => Promise<boolean>;
  refresh: () => void;
  updateCourseLocally: (courseId: string, updates: Partial<Course>) => void;
  reorderCourses: (activeId: string, overId: string) => Promise<void>;
}

export function useCourses(organizationId: string | null): UseCoursesReturn {
  const [courses, setCourses] = useState<Course[]>([]);
  const [categories, setCategories] = useState<CourseCategory[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  
  // Filters
  const [filter, setFilter] = useState<CourseFilter>("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [viewMode, setViewMode] = useState<CourseViewMode>("grid");

  // Load courses and categories
  useEffect(() => {
    const load = async () => {
      if (!organizationId) {
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      setError(null);
      try {
        const [coursesData, categoriesData] = await Promise.all([
          fetchCourses(organizationId),
          fetchCategories(organizationId)
        ]);
        setCourses(coursesData);
        setCategories(categoriesData);

        // Lazy-load student counts after rendering courses
        const courseIds = coursesData.map(c => c.id);
        fetchCourseStudentCounts(courseIds).then(countMap => {
          if (countMap.size > 0) {
            setCourses(prev => prev.map(c => ({
              ...c,
              studentsCount: countMap.get(c.id) ?? c.studentsCount ?? 0
            })));
          }
        });
      } catch (err: any) {
        console.error("Error loading courses:", err);
        setError(err?.message || "Не удалось загрузить курсы");
      } finally {
        setIsLoading(false);
      }
    };

    load();
  }, [organizationId, refreshKey]);

  // Filtered courses
  const filteredCourses = useMemo(() => {
    return courses.filter(course => {
      // Search filter
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        const matchesSearch = 
          course.title.toLowerCase().includes(query) ||
          (course.description && course.description.toLowerCase().includes(query));
        if (!matchesSearch) return false;
      }

      // Status filter
      if (filter !== "all") {
        if (filter === "published" && !course.is_published) return false;
        if (filter === "draft" && course.is_published) return false;
      }

      // Category filter
      if (categoryFilter !== "all") {
        if (categoryFilter === "none") {
          if (course.category_id) return false;
        } else if (course.category_id !== categoryFilter) {
          return false;
        }
      }

      return true;
    });
  }, [courses, searchQuery, filter, categoryFilter]);

  const create = useCallback(async (
    title: string, 
    description?: string, 
    categoryId?: string
  ): Promise<Course | null> => {
    if (!organizationId) return null;

    const course = await createCourse(organizationId, title, description, categoryId);
    if (course) {
      toast.success("Курс создан");
      setRefreshKey(prev => prev + 1);
    } else {
      toast.error("Ошибка создания курса");
    }
    return course;
  }, [organizationId]);

  const update = useCallback(async (courseId: string, updates: Partial<Course>): Promise<boolean> => {
    const success = await updateCourse(courseId, updates);
    if (success) {
      toast.success("Курс обновлён");
      setRefreshKey(prev => prev + 1);
    } else {
      toast.error("Ошибка обновления курса");
    }
    return success;
  }, []);

  const remove = useCallback(async (courseId: string): Promise<boolean> => {
    const success = await deleteCourse(courseId);
    if (success) {
      toast.success("Курс удалён");
      setRefreshKey(prev => prev + 1);
    } else {
      toast.error("Ошибка удаления курса");
    }
    return success;
  }, []);

  const publish = useCallback(async (courseId: string, isPublished: boolean): Promise<boolean> => {
    const success = await publishCourse(courseId, isPublished);
    if (success) {
      toast.success(isPublished ? "Курс опубликован" : "Курс снят с публикации");
      setRefreshKey(prev => prev + 1);
    } else {
      toast.error("Ошибка изменения статуса публикации");
    }
    return success;
  }, []);

  const duplicate = useCallback(async (courseId: string): Promise<Course | null> => {
    const course = await duplicateCourse(courseId);
    if (course) {
      toast.success("Курс скопирован");
      setRefreshKey(prev => prev + 1);
    } else {
      toast.error("Ошибка копирования курса");
    }
    return course;
  }, []);

  const createCat = useCallback(async (name: string, color: string): Promise<CourseCategory | null> => {
    if (!organizationId) return null;

    const category = await createCategory(organizationId, name, color);
    if (category) {
      toast.success("Категория создана");
      setRefreshKey(prev => prev + 1);
    } else {
      toast.error("Ошибка создания категории");
    }
    return category;
  }, [organizationId]);

  const updateCat = useCallback(async (categoryId: string, updates: Partial<CourseCategory>): Promise<boolean> => {
    const success = await updateCategory(categoryId, updates);
    if (success) {
      toast.success("Категория обновлена");
      setRefreshKey(prev => prev + 1);
    } else {
      toast.error("Ошибка обновления категории");
    }
    return success;
  }, []);

  const removeCat = useCallback(async (categoryId: string): Promise<boolean> => {
    const success = await deleteCategory(categoryId);
    if (success) {
      toast.success("Категория удалена");
      setRefreshKey(prev => prev + 1);
    } else {
      toast.error("Ошибка удаления категории");
    }
    return success;
  }, []);

  const refresh = useCallback(() => {
    setRefreshKey(prev => prev + 1);
  }, []);

  const updateCourseLocally = useCallback((courseId: string, updates: Partial<Course>) => {
    setCourses(prev => prev.map(course => 
      course.id === courseId ? { ...course, ...updates } : course
    ));
  }, []);

  const reorderCourses = useCallback(async (activeId: string, overId: string) => {
    const oldIndex = courses.findIndex(c => c.id === activeId);
    const newIndex = courses.findIndex(c => c.id === overId);
    if (oldIndex === -1 || newIndex === -1) return;

    const reordered = [...courses];
    const [moved] = reordered.splice(oldIndex, 1);
    reordered.splice(newIndex, 0, moved);
    setCourses(reordered);

    // Save to DB
    const updates = reordered.map((c, i) =>
      supabase.from("courses").update({ catalog_order: i } as any).eq("id", c.id)
    );
    await Promise.all(updates);
  }, [courses]);

  return {
    courses,
    categories,
    isLoading,
    error,
    filter,
    setFilter,
    categoryFilter,
    setCategoryFilter,
    searchQuery,
    setSearchQuery,
    viewMode,
    setViewMode,
    filteredCourses,
    create,
    update,
    remove,
    publish,
    duplicate,
    createCat,
    updateCat,
    removeCat,
    refresh,
    updateCourseLocally,
    reorderCourses,
  };
}
