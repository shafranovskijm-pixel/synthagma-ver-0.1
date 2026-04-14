import { useState, useMemo } from "react";
import { Course } from "@/types/shared";

interface UseCourseFiltersProps {
  courses: Course[];
  selectedCategoryFilter: string;
}

export function useCourseFilters({ courses, selectedCategoryFilter }: UseCourseFiltersProps) {
  const [courseFilter, setCourseFilter] = useState<"all" | "published" | "draft">("all");
  const [courseViewMode, setCourseViewMode] = useState<"grid" | "list">("grid");
  const [courseSearchQuery, setCourseSearchQuery] = useState("");

  const filteredCourses = useMemo(() => 
    courses.filter(course => {
      const matchesSearch = course.title.toLowerCase().includes(courseSearchQuery.toLowerCase());
      const matchesFilter = 
        courseFilter === "all" || 
        (courseFilter === "published" && course.is_published) || 
        (courseFilter === "draft" && !course.is_published);
      const matchesCategory = 
        selectedCategoryFilter === "all" || 
        (selectedCategoryFilter === "none" && !course.category_id) || 
        course.category_id === selectedCategoryFilter;
      return matchesSearch && matchesFilter && matchesCategory;
    }), 
    [courses, courseSearchQuery, courseFilter, selectedCategoryFilter]
  );

  return {
    courseFilter,
    setCourseFilter,
    courseViewMode,
    setCourseViewMode,
    courseSearchQuery,
    setCourseSearchQuery,
    filteredCourses,
  };
}
