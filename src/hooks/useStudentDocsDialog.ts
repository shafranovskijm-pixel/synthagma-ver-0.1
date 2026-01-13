import { useState, useCallback } from "react";

interface SelectedStudentForDocs {
  enrollmentId: string;
  studentName: string;
  courseName: string;
}

export function useStudentDocsDialog() {
  const [showStudentDocsDialog, setShowStudentDocsDialog] = useState(false);
  const [selectedStudentForDocs, setSelectedStudentForDocs] = useState<SelectedStudentForDocs | null>(null);

  const openStudentDocs = useCallback(
    (enrollmentId: string, studentName: string, courseName: string) => {
      setSelectedStudentForDocs({ enrollmentId, studentName, courseName });
      setShowStudentDocsDialog(true);
    },
    []
  );

  const closeStudentDocs = useCallback(() => {
    setShowStudentDocsDialog(false);
    setSelectedStudentForDocs(null);
  }, []);

  return {
    showStudentDocsDialog,
    setShowStudentDocsDialog,
    selectedStudentForDocs,
    setSelectedStudentForDocs,
    openStudentDocs,
    closeStudentDocs,
  };
}
