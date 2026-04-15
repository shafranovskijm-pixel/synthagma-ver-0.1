import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Link, Copy, Send, FileText, Trash2, BarChart3, History, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { CourseTestReport } from "@/components/organization/CourseTestReport";
import { EnrollmentHistory } from "@/components/organization/EnrollmentHistory";
import { SigmaSpinner } from "@/components/ui/SigmaSpinner";

interface Course {
  id: string;
  title: string;
}

interface Student {
  id: string;
  user_id: string;
  enrollment_id: string | null;
  name: string;
  email: string;
  progress: number;
}

interface CourseStudentsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  course: Course | null;
  courseStudents: Student[];
  availableStudents: Student[];
  organizationId: string | null;
  isLoading: boolean;
  selectedStudentsToAdd: Set<string>;
  onToggleStudentSelection: (userId: string) => void;
  onAddStudentsToCourse: () => void;
  isAddingStudents: boolean;
  onRemoveFromCourse: (enrollmentId: string) => void;
  onShowInviteEmailDialog: () => void;
  onShowStudentDocs: (enrollmentId: string, studentName: string, courseName: string) => void;
  onRefresh?: () => void;
}

export function CourseStudentsDialog({
  open,
  onOpenChange,
  course,
  courseStudents,
  availableStudents,
  organizationId,
  isLoading,
  selectedStudentsToAdd,
  onToggleStudentSelection,
  onAddStudentsToCourse,
  isAddingStudents,
  onRemoveFromCourse,
  onShowInviteEmailDialog,
  onShowStudentDocs,
  onRefresh }: CourseStudentsDialogProps) {
  const handleResetProgress = async (student: Student) => {
    if (!student.enrollment_id || !course) return;

    try {
      // Get all lesson IDs for this course
      const { data: lessons } = await supabase
        .from("lessons")
        .select("id")
        .eq("course_id", course.id);

      const lessonIds = (lessons || []).map(l => l.id);

      // Delete lesson progress
      if (lessonIds.length > 0) {
        await supabase
          .from("lesson_progress")
          .delete()
          .eq("user_id", student.user_id)
          .in("lesson_id", lessonIds);

        // Delete test attempts
        await supabase
          .from("test_attempts")
          .delete()
          .eq("user_id", student.user_id)
          .in("lesson_id", lessonIds);
      }

      // Reset enrollment progress
      await supabase
        .from("enrollments")
        .update({ 
          progress: 0, 
          status: "active",
          completed_at: null 
        })
        .eq("id", student.enrollment_id);

      toast.success(`Прогресс ученика "${student.name}" сброшен`);
      onRefresh?.();
    } catch (error) {
      console.error("Error resetting progress:", error);
      toast.error("Ошибка сброса прогресса");
    }
  };
  const handleCopyLink = () => {
    if (course) {
      const url = `${window.location.origin}/course/${course.id}`;
      navigator.clipboard.writeText(url);
      toast.success("Ссылка на курс скопирована");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl rounded-2xl max-h-[90vh] overflow-auto">
        <DialogHeader>
          <DialogTitle className="font-display">Ученики курса: {course?.title}</DialogTitle>
        </DialogHeader>
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <SigmaSpinner size="lg" />
          </div>
        ) : (
          <div className="space-y-6">
            {/* Quick Actions */}
            <div className="bg-secondary/30 rounded-xl p-4 space-y-4">
              <h3 className="font-semibold flex items-center gap-2">
                <Link className="w-4 h-4" />
                Быстрые действия
              </h3>
              <div className="flex flex-wrap gap-3">
                <Button variant="outline" className="rounded-xl gap-2" onClick={handleCopyLink}>
                  <Copy className="w-4 h-4" />
                  Скопировать ссылку
                </Button>
                <Button variant="outline" className="rounded-xl gap-2" onClick={onShowInviteEmailDialog}>
                  <Send className="w-4 h-4" />
                  Отправить приглашение
                </Button>
              </div>
            </div>

            <div>
              <h3 className="font-semibold mb-3">Зачисленные ученики ({courseStudents.length})</h3>
              {courseStudents.length === 0 ? (
                <p className="text-muted-foreground text-sm">Нет зачисленных учеников</p>
              ) : (
                <div className="space-y-2 max-h-40 overflow-auto">
                  {courseStudents.map((s) => (
                    <div
                      key={s.enrollment_id}
                      className="flex items-center justify-between p-3 bg-secondary/50 rounded-xl"
                    >
                      <div>
                        <div className="font-medium">{s.name}</div>
                        <div className="text-sm text-muted-foreground">{s.email}</div>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="flex items-center gap-2">
                          <Progress value={Math.min(s.progress, 100)} className="w-20 h-2" />
                          <span className="text-sm">{Math.min(s.progress, 100)}%</span>
                        </div>
                        {s.progress > 0 && (
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button
                                variant="ghost"
                                size="sm"
                                title="Сбросить прогресс"
                              >
                                <RotateCcw className="w-4 h-4" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Сбросить прогресс?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  Все результаты тестов и отметки о прохождении уроков ученика "{s.name}" будут удалены.
                                  Ему придётся пройти курс заново с самого начала.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Отмена</AlertDialogCancel>
                                <AlertDialogAction onClick={() => handleResetProgress(s)}>
                                  Сбросить
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            if (s.enrollment_id && course) {
                              onShowStudentDocs(s.enrollment_id, s.name, course.title);
                            }
                          }}
                          title="Документы ученика"
                        >
                          <FileText className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-destructive hover:text-destructive"
                          onClick={() => s.enrollment_id && onRemoveFromCourse(s.enrollment_id)}
                          title="Отчислить"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div>
              <h3 className="font-semibold mb-3">Добавить учеников</h3>
              {availableStudents.length === 0 ? (
                <p className="text-muted-foreground text-sm">Все ученики уже зачислены</p>
              ) : (
                <>
                  <div className="space-y-2 max-h-40 overflow-auto mb-4">
                    {availableStudents.map((s) => (
                      <label
                        key={s.user_id}
                        className="flex items-center gap-3 p-3 bg-secondary/30 rounded-xl cursor-pointer hover:bg-secondary/50 transition-colors"
                      >
                        <input
                          type="checkbox"
                          checked={selectedStudentsToAdd.has(s.user_id)}
                          onChange={() => onToggleStudentSelection(s.user_id)}
                          className="w-4 h-4"
                        />
                        <div>
                          <div className="font-medium">{s.name}</div>
                          <div className="text-sm text-muted-foreground">{s.email}</div>
                        </div>
                      </label>
                    ))}
                  </div>
                  <Button
                    className="w-full btn-gradient rounded-xl"
                    onClick={onAddStudentsToCourse}
                    disabled={selectedStudentsToAdd.size === 0 || isAddingStudents}
                  >
                    {isAddingStudents ? (
                      <>
                        <SigmaSpinner size="sm" className="mr-2" />
                        Добавление...
                      </>
                    ) : (
                      `Зачислить (${selectedStudentsToAdd.size})`
                    )}
                  </Button>
                </>
              )}
            </div>

            {/* Course Test Report */}
            {course && organizationId && (
              <div>
                <h3 className="font-semibold mb-3 flex items-center gap-2">
                  <BarChart3 className="w-4 h-4" />
                  Результаты тестирования
                </h3>
                <CourseTestReport
                  courseId={course.id}
                  courseName={course.title}
                  organizationId={organizationId}
                />
              </div>
            )}

            {/* Enrollment History */}
            {course && organizationId && (
              <div>
                <h3 className="font-semibold mb-3 flex items-center gap-2">
                  <History className="w-4 h-4" />
                  История зачислений
                </h3>
                <EnrollmentHistory
                  courseId={course.id}
                  organizationId={organizationId}
                  courseName={course.title}
                />
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
