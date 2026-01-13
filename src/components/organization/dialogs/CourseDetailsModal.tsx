import { useState } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { CourseDocumentsManager } from "@/components/organization/CourseDocumentsManager";
import { EnrollmentHistory } from "@/components/organization/EnrollmentHistory";
import { CourseTestReport } from "@/components/organization/CourseTestReport";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { 
  Users, 
  BookOpen, 
  Eye, 
  Edit, 
  TrendingUp, 
  CheckCircle2, 
  FileText, 
  History, 
  CheckSquare,
  Plus,
  Trash2,
  Loader2
} from "lucide-react";
import { useNavigate } from "react-router-dom";

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
  progress: number;
  status: string | null;
}

interface CourseDetailsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  course: Course | null;
  courseStudents: Student[];
  organizationId: string | null;
  activeTab: "students" | "materials" | "history" | "tests";
  onTabChange: (tab: "students" | "materials" | "history" | "tests") => void;
  onEnrollStudent: () => void;
  onCourseDeleted?: () => void;
}

export function CourseDetailsModal({
  open,
  onOpenChange,
  course,
  courseStudents,
  organizationId,
  activeTab,
  onTabChange,
  onEnrollStudent,
  onCourseDeleted
}: CourseDetailsModalProps) {
  const navigate = useNavigate();
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  if (!course) return null;

  const handleDeleteCourse = async () => {
    setIsDeleting(true);
    try {
      // Delete enrollments first
      await supabase.from("enrollments").delete().eq("course_id", course.id);
      
      // Delete lessons
      await supabase.from("lessons").delete().eq("course_id", course.id);
      
      // Delete course documents
      await supabase.from("course_documents").delete().eq("course_id", course.id);
      
      // Delete the course
      const { error } = await supabase.from("courses").delete().eq("id", course.id);
      if (error) throw error;
      
      toast.success("Курс удалён");
      setShowDeleteConfirm(false);
      onOpenChange(false);
      onCourseDeleted?.();
    } catch (error) {
      console.error("Error deleting course:", error);
      toast.error("Ошибка удаления курса");
    } finally {
      setIsDeleting(false);
    }
  };

  const totalStudents = courseStudents.length;
  const activeStudents = courseStudents.filter(s => s.status !== 'completed').length;
  const completedStudents = courseStudents.filter(s => s.status === 'completed').length;
  const avgProgress = totalStudents > 0 
    ? Math.round(courseStudents.reduce((sum, s) => sum + s.progress, 0) / totalStudents) 
    : 0;
  const completionRate = totalStudents > 0 
    ? Math.round(completedStudents / totalStudents * 100) 
    : 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl rounded-2xl max-h-[90vh] overflow-hidden flex flex-col p-0">
        <div className="p-6 border-b border-border bg-gradient-to-br from-primary/10 to-accent/10">
          <div className="flex items-start justify-between">
            <div>
              <DialogTitle className="font-display text-2xl mb-2">{course.title}</DialogTitle>
              <div className="flex items-center gap-4 text-sm text-muted-foreground">
                <span className={`px-2 py-1 rounded-full text-xs ${
                  course.is_published 
                    ? 'bg-sigma-green/10 text-sigma-green' 
                    : 'bg-muted text-muted-foreground'
                }`}>
                  {course.is_published ? 'Опубликован' : 'Черновик'}
                </span>
                <div className="flex items-center gap-1">
                  <Users className="w-4 h-4" />
                  {course.studentsCount} учеников
                </div>
                <div className="flex items-center gap-1">
                  <BookOpen className="w-4 h-4" />
                  {course.lessonsCount} уроков
                </div>
              </div>
            </div>
            <div className="flex gap-2">
              <Button 
                variant="outline" 
                className="rounded-xl gap-2" 
                onClick={() => navigate(`/course-preview/${course.id}`)}
              >
                <Eye className="w-4 h-4" />
                Просмотр
              </Button>
              <Button 
                className="rounded-xl gap-2 btn-gradient" 
                onClick={() => navigate(`/course-builder/${course.id}`)}
              >
                <Edit className="w-4 h-4" />
                Редактировать
              </Button>
              <Button 
                variant="outline" 
                className="rounded-xl gap-2 text-destructive hover:bg-destructive hover:text-destructive-foreground" 
                onClick={() => setShowDeleteConfirm(true)}
              >
                <Trash2 className="w-4 h-4" />
                Удалить
              </Button>
            </div>
          </div>
          
          {/* Course Statistics */}
          <div className="grid grid-cols-3 gap-4 mt-4">
            <div className="bg-background/50 backdrop-blur-sm rounded-xl p-4 border border-border/50">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-primary/10">
                  <TrendingUp className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <div className="text-2xl font-bold">{avgProgress}%</div>
                  <div className="text-xs text-muted-foreground">Средний прогресс</div>
                </div>
              </div>
              <Progress value={avgProgress} className="mt-3 h-1.5" />
            </div>
            
            <div className="bg-background/50 backdrop-blur-sm rounded-xl p-4 border border-border/50">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-sigma-green/10">
                  <Users className="w-5 h-5 text-sigma-green" />
                </div>
                <div>
                  <div className="text-2xl font-bold">{activeStudents}</div>
                  <div className="text-xs text-muted-foreground">Активных учеников</div>
                </div>
              </div>
              <div className="mt-3 text-xs text-muted-foreground">
                из {totalStudents} зачисленных
              </div>
            </div>
            
            <div className="bg-background/50 backdrop-blur-sm rounded-xl p-4 border border-border/50">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-accent/10">
                  <CheckCircle2 className="w-5 h-5 text-accent" />
                </div>
                <div>
                  <div className="text-2xl font-bold">{completionRate}%</div>
                  <div className="text-xs text-muted-foreground">Завершаемость</div>
                </div>
              </div>
              <div className="mt-3 text-xs text-muted-foreground">
                {completedStudents} из {totalStudents} завершили
              </div>
            </div>
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={v => onTabChange(v as any)} className="flex-1 flex flex-col overflow-hidden">
          <div className="px-6 pt-4 border-b border-border">
            <TabsList className="bg-secondary/50 rounded-xl">
              <TabsTrigger value="students" className="rounded-lg gap-2">
                <Users className="w-4 h-4" />
                Ученики
              </TabsTrigger>
              <TabsTrigger value="materials" className="rounded-lg gap-2">
                <FileText className="w-4 h-4" />
                Материалы
              </TabsTrigger>
              <TabsTrigger value="history" className="rounded-lg gap-2">
                <History className="w-4 h-4" />
                История
              </TabsTrigger>
              <TabsTrigger value="tests" className="rounded-lg gap-2">
                <CheckSquare className="w-4 h-4" />
                Тесты
              </TabsTrigger>
            </TabsList>
          </div>

          <div className="flex-1 overflow-auto p-6">
            <TabsContent value="students" className="mt-0 h-full">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold">Ученики курса</h3>
                  <Button className="btn-gradient rounded-xl gap-2" onClick={onEnrollStudent}>
                    <Plus className="w-4 h-4" />
                    Зачислить ученика
                  </Button>
                </div>
                
                {courseStudents.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">
                    <Users className="w-12 h-12 mx-auto mb-4 opacity-50" />
                    <p>Нет зачисленных учеников</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {courseStudents.map(student => (
                      <div key={student.id} className="flex items-center justify-between p-4 bg-secondary/50 rounded-xl">
                        <div>
                          <div className="font-medium">{student.name}</div>
                          <div className="text-sm text-muted-foreground">{student.email}</div>
                        </div>
                        <div className="flex items-center gap-4">
                          <div className="text-right">
                            <div className="text-sm font-medium">{student.progress}%</div>
                            <Progress value={student.progress} className="w-24 h-2" />
                          </div>
                          <span className={`px-2 py-1 rounded-full text-xs ${
                            student.status === 'completed' 
                              ? 'bg-sigma-green/10 text-sigma-green' 
                              : 'bg-primary/10 text-primary'
                          }`}>
                            {student.status === 'completed' ? 'Завершил' : 'Активный'}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </TabsContent>

            <TabsContent value="materials" className="mt-0 h-full">
              <CourseDocumentsManager 
                courseId={course.id} 
                courseName={course.title} 
                embedded={true} 
              />
            </TabsContent>

            <TabsContent value="history" className="mt-0 h-full">
              <EnrollmentHistory 
                courseId={course.id} 
                organizationId={organizationId || ""} 
                courseName={course.title} 
              />
            </TabsContent>

            <TabsContent value="tests" className="mt-0 h-full">
              <CourseTestReport 
                courseId={course.id} 
                courseName={course.title} 
                organizationId={organizationId || ""} 
              />
            </TabsContent>
          </div>
        </Tabs>
      </DialogContent>
      
      {/* Delete Confirmation Dialog */}
      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent className="rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Удалить курс?</AlertDialogTitle>
            <AlertDialogDescription>
              Вы уверены, что хотите удалить курс "{course.title}"? 
              Будут также удалены все уроки, материалы и записи о зачислении учеников.
              Это действие нельзя отменить.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-xl" disabled={isDeleting}>
              Отмена
            </AlertDialogCancel>
            <AlertDialogAction 
              className="rounded-xl bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={handleDeleteCourse}
              disabled={isDeleting}
            >
              {isDeleting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Удаление...
                </>
              ) : (
                <>
                  <Trash2 className="w-4 h-4 mr-2" />
                  Удалить
                </>
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  );
}
