import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle } from "@/components/ui/dialog";
import {
  GraduationCap,
  BookOpen,
  Check } from "lucide-react";
import type { Company } from "@/hooks/useCompaniesManager";
import { CourseGroupedList } from "./CourseGroupedList";

interface CourseCategory {
  id: string;
  name: string;
  color: string;
}

interface Course {
  id: string;
  title: string;
  is_published: boolean;
  category_id?: string | null;
}

interface BulkEnrollDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  company: Company | null;
  courses: Course[];
  selectedCourseIds: string[];
  isLoading: boolean;
  isEnrolling: boolean;
  onToggleCourse: (courseId: string) => void;
  onEnroll: () => void;
  categories?: CourseCategory[];
  getCategoryById?: (id?: string | null) => CourseCategory | undefined;
}

export function BulkEnrollDialog({
  open,
  onOpenChange,
  company,
  courses,
  selectedCourseIds,
  isLoading,
  isEnrolling,
  onToggleCourse,
  onEnroll,
  categories = [],
  getCategoryById = () => undefined }: BulkEnrollDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-2xl max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="font-display flex items-center gap-2">
            <GraduationCap className="w-5 h-5 text-orange-500" />
            Зачислить на курсы
          </DialogTitle>
          <DialogDescription>
            Выберите курсы для зачисления всех учеников компании «{company?.name}»
          </DialogDescription>
        </DialogHeader>

        <div className="py-4 space-y-4 flex-1 overflow-hidden flex flex-col">
          {selectedCourseIds.length > 0 && (
            <div className="flex items-center gap-2 px-3 py-2 bg-orange-500/10 rounded-lg w-fit">
              <Check className="w-4 h-4 text-orange-500" />
              <span className="text-sm font-medium">{selectedCourseIds.length} курсов выбрано</span>
            </div>
          )}

          <div className="flex-1 overflow-y-auto border border-border rounded-xl p-2">
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <SigmaSpinner size="lg" />
              </div>
            ) : courses.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <BookOpen className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p>Нет доступных курсов</p>
              </div>
            ) : (
              <CourseGroupedList
                courses={courses}
                getCategoryById={getCategoryById}
                emptyMessage="Нет доступных курсов"
                renderCourse={(course) => {
                  const isSelected = selectedCourseIds.includes(course.id);
                  return (
                    <div
                      key={course.id}
                      className={`flex items-center gap-4 p-4 hover:bg-secondary/50 transition-colors cursor-pointer rounded-xl ${
                        isSelected ? "bg-orange-500/5" : ""
                      }`}
                      onClick={() => onToggleCourse(course.id)}
                    >
                      <Checkbox
                        checked={isSelected}
                        onCheckedChange={() => onToggleCourse(course.id)}
                      />
                      <div className="flex items-center gap-3 flex-1">
                        <div className="w-10 h-10 rounded-lg bg-orange-500/10 flex items-center justify-center">
                          <BookOpen className="w-5 h-5 text-orange-500" />
                        </div>
                        <div>
                          <div className="font-medium">{course.title}</div>
                          <div className="text-xs text-muted-foreground">
                            {course.is_published ? "Опубликован" : "Черновик"}
                          </div>
                        </div>
                      </div>
                      <span
                        className={`text-xs px-2 py-1 rounded-full ${
                          course.is_published
                            ? "bg-sigma-green/10 text-sigma-green"
                            : "bg-muted text-muted-foreground"
                        }`}
                      >
                        {course.is_published ? "Активный" : "Неактивный"}
                      </span>
                    </div>
                  );
                }}
              />
            )}
          </div>
        </div>

        <div className="flex justify-between pt-4 border-t border-border">
          <Button
            variant="outline"
            className="rounded-xl"
            onClick={() => onOpenChange(false)}
          >
            Отмена
          </Button>
          <Button
            className="btn-gradient rounded-xl gap-2"
            onClick={onEnroll}
            disabled={selectedCourseIds.length === 0 || isEnrolling}
          >
            {isEnrolling ? (
              <>
                <SigmaSpinner size="sm" />
                Зачисление...
              </>
            ) : (
              <>
                <GraduationCap className="w-4 h-4" />
                Зачислить ({selectedCourseIds.length})
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
