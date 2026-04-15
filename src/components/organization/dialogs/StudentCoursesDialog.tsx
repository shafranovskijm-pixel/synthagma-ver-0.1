import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
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
import { Input } from "@/components/ui/input";
import { GraduationCap, Plus, X, Search, RotateCcw } from "lucide-react";
import { CourseGroupedList } from "./CourseGroupedList";
import { SigmaSpinner } from "@/components/ui/SigmaSpinner";
interface CourseCategory {
  id: string;
  name: string;
  color: string;
}

interface Course {
  id: string;
  title: string;
  description: string | null;
  is_published: boolean;
  created_at: string;
  lessonsCount?: number;
  studentsCount?: number;
  duration?: string;
  category_id?: string | null;
}

interface Student {
  id: string;
  user_id: string;
  enrollment_id: string | null;
  name: string;
  email: string;
  login: string | null;
  generated_password: string | null;
  course: string | null;
  course_id: string | null;
  progress: number;
  lastActivity: string | null;
  status: string | null;
}

interface StudentEnrollment {
  course: Course;
  enrollment_id: string;
  progress: number;
  status: string;
}

interface StudentCoursesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  student: Student | null;
  isLoading: boolean;
  studentEnrollments: StudentEnrollment[];
  availableCourses: Course[];
  selectedCoursesToAdd: Set<string>;
  searchQuery: string;
  onSearchQueryChange: (query: string) => void;
  onToggleCourseSelection: (courseId: string) => void;
  isAddingCourses: boolean;
  onAddCourses: () => void;
  onRemoveEnrollment: (enrollmentId: string) => void;
  onResetProgress: (enrollmentId: string, courseTitle: string) => void;
  getCategoryById: (id?: string | null) => CourseCategory | undefined;
}

export function StudentCoursesDialog({
  open,
  onOpenChange,
  student,
  isLoading,
  studentEnrollments,
  availableCourses,
  selectedCoursesToAdd,
  searchQuery,
  onSearchQueryChange,
  onToggleCourseSelection,
  isAddingCourses,
  onAddCourses,
  onRemoveEnrollment,
  onResetProgress,
  getCategoryById }: StudentCoursesDialogProps) {
  const filteredCourses = availableCourses.filter(c => 
    searchQuery === "" || c.title.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl rounded-2xl max-h-[90vh] overflow-auto">
        <DialogHeader>
          <DialogTitle className="font-display">
            Курсы ученика: {student?.name}
          </DialogTitle>
          <DialogDescription>
            Управление зачислениями на курсы
          </DialogDescription>
        </DialogHeader>
        
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <SigmaSpinner size="lg" />
          </div>
        ) : (
          <div className="space-y-6">
            {/* Current enrollments */}
            <div>
              <h3 className="font-semibold mb-3 flex items-center gap-2">
                <GraduationCap className="w-5 h-5" />
                Текущие курсы ({studentEnrollments.length})
              </h3>
              {studentEnrollments.length === 0 ? (
                <p className="text-muted-foreground text-sm bg-secondary/30 rounded-xl p-4">
                  Ученик не зачислен ни на один курс
                </p>
              ) : (
                <div className="space-y-2 max-h-48 overflow-auto">
                  {studentEnrollments.map(({ course, enrollment_id, progress, status }) => (
                    <div key={enrollment_id} className="flex items-center justify-between p-3 bg-secondary/30 rounded-xl">
                      <div className="flex-1">
                        <div className="font-medium">{course.title}</div>
                        <div className="flex items-center gap-3 mt-1">
                          <Progress value={progress} className="w-24 h-2" />
                          <span className="text-sm text-muted-foreground">{progress}%</span>
                          <span className={`text-xs px-2 py-0.5 rounded-full ${
                            status === 'completed' ? 'bg-sigma-green/10 text-sigma-green' : 'bg-primary/10 text-primary'
                          }`}>
                            {status === 'completed' ? 'Завершён' : 'В процессе'}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 ml-3">
                        {progress > 0 && (
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button
                                variant="outline"
                                size="sm"
                                className="rounded-lg"
                                title="Сбросить прогресс"
                              >
                                <RotateCcw className="w-4 h-4" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Сбросить прогресс?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  Все результаты тестов и отметки о прохождении уроков курса "{course.title}" будут удалены.
                                  Ученику придётся пройти курс заново с самого начала.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Отмена</AlertDialogCancel>
                                <AlertDialogAction onClick={() => onResetProgress(enrollment_id, course.title)}>
                                  Сбросить
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        )}
                        <Button
                          variant="outline"
                          size="sm"
                          className="rounded-lg text-destructive hover:text-destructive"
                          onClick={() => onRemoveEnrollment(enrollment_id)}
                          title="Отчислить с курса"
                        >
                          <X className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Available courses to add */}
            <div>
              <h3 className="font-semibold mb-3 flex items-center gap-2">
                <Plus className="w-5 h-5" />
                Зачислить на курсы
              </h3>
              
              {availableCourses.length === 0 ? (
                <p className="text-muted-foreground text-sm bg-secondary/30 rounded-xl p-4">
                  Все доступные курсы уже назначены
                </p>
              ) : (
                <>
                  <div className="relative mb-3">
                    <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      placeholder="Поиск курсов..."
                      value={searchQuery}
                      onChange={e => onSearchQueryChange(e.target.value)}
                      className="pl-10 rounded-xl"
                    />
                  </div>
                  
                  <div className="space-y-1 max-h-60 overflow-auto border border-border rounded-xl p-2">
                    <CourseGroupedList
                      courses={filteredCourses}
                      getCategoryById={getCategoryById}
                      emptyMessage="Курсы не найдены"
                      renderCourse={(course) => {
                        const isSelected = selectedCoursesToAdd.has(course.id);
                        return (
                          <div
                            key={course.id}
                            className={`flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-colors ${
                              isSelected ? 'bg-primary/10 border border-primary' : 'bg-secondary/30 hover:bg-secondary/50'
                            }`}
                            onClick={() => onToggleCourseSelection(course.id)}
                          >
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => onToggleCourseSelection(course.id)}
                              className="w-4 h-4 rounded"
                            />
                            <div className="flex-1">
                              <div className="font-medium">{course.title}</div>
                            </div>
                          </div>
                        );
                      }}
                    />
                  </div>
                  
                  {selectedCoursesToAdd.size > 0 && (
                    <Button
                      className="w-full btn-gradient rounded-xl mt-4"
                      onClick={onAddCourses}
                      disabled={isAddingCourses}
                    >
                      {isAddingCourses ? (
                        <>
                          <SigmaSpinner size="sm" className="mr-2" />
                          Зачисление...
                        </>
                      ) : (
                        <>
                          <GraduationCap className="w-4 h-4 mr-2" />
                          Зачислить на {selectedCoursesToAdd.size} курсов
                        </>
                      )}
                    </Button>
                  )}
                </>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
