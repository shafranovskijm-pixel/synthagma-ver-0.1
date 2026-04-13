import { useState, useCallback } from "react";
import { Course } from "@/types/shared";

type CourseDetailsTabType = "students" | "materials" | "history" | "tests" | "landing" | "settings" | "reminders" | "groups" | "achievements";

export function useCourseDetailsModal() {
  const [showCourseDetailsModal, setShowCourseDetailsModal] = useState(false);
  const [selectedCourseForDetails, setSelectedCourseForDetails] = useState<Course | null>(null);
  const [courseDetailsTab, setCourseDetailsTab] = useState<CourseDetailsTabType>("students");

  const openCourseDetails = useCallback((course: Course, tab: CourseDetailsTabType = "students") => {
    setSelectedCourseForDetails(course);
    setCourseDetailsTab(tab);
    setShowCourseDetailsModal(true);
  }, []);

  const closeCourseDetails = useCallback(() => {
    setShowCourseDetailsModal(false);
    setSelectedCourseForDetails(null);
  }, []);

  return {
    showCourseDetailsModal,
    setShowCourseDetailsModal,
    selectedCourseForDetails,
    setSelectedCourseForDetails,
    courseDetailsTab,
    setCourseDetailsTab,
    openCourseDetails,
    closeCourseDetails,
  };
}

export type { CourseDetailsTabType };
