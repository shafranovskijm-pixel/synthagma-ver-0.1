import { useState, useCallback } from "react";
import { Course } from "@/types/shared";

export function useCourseDocsDialog() {
  const [showCourseDocsDialog, setShowCourseDocsDialog] = useState(false);
  const [selectedCourseForDocs, setSelectedCourseForDocs] = useState<Course | null>(null);

  const openCourseDocs = useCallback((course: Course) => {
    setSelectedCourseForDocs(course);
    setShowCourseDocsDialog(true);
  }, []);

  const closeCourseDocs = useCallback(() => {
    setShowCourseDocsDialog(false);
    setSelectedCourseForDocs(null);
  }, []);

  return {
    showCourseDocsDialog,
    setShowCourseDocsDialog,
    selectedCourseForDocs,
    setSelectedCourseForDocs,
    openCourseDocs,
    closeCourseDocs,
  };
}
