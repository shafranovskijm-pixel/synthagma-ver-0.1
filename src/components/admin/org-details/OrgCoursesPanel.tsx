import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { DndContext, closestCenter } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { BookOpen, CheckCircle2, AlertCircle, Download } from "lucide-react";
import { toast } from "sonner";
import { SortableCourseRow } from "../SortableCourseRow";
import type { Course } from "@/hooks/useOrgDetailsView";
import type { DragEndEvent } from "@dnd-kit/core";

interface OrgCoursesPanelProps {
  courses: Course[];
  organizationId: string;
  dndSensors: any;
  handleCourseDragEnd: (event: DragEndEvent) => void;
  migratingCourseId: string | null;
  setMigratingCourseId: (id: string | null) => void;
  migrationResult: Record<string, { status: 'success' | 'error'; message: string }>;
  setMigrationResult: React.Dispatch<React.SetStateAction<Record<string, { status: 'success' | 'error'; message: string }>>>;
  onShowSkillspaceImport: () => void;
  onShowSkillspaceBatchImport: () => void;
  onSkillspaceUpdate: (course: { id: string; title: string }) => void;
  fetchCourses: () => Promise<void>;
}

export function OrgCoursesPanel({
  courses, organizationId, dndSensors, handleCourseDragEnd,
  migratingCourseId, setMigratingCourseId, migrationResult, setMigrationResult,
  onShowSkillspaceImport, onShowSkillspaceBatchImport, onSkillspaceUpdate, fetchCourses,
}: OrgCoursesPanelProps) {
  const readyCourses = courses.filter(c => c.lessons_count > 0 && c.is_published);
  const needsReview = courses.filter(c => c.lessons_count === 0);

  const handleMigrate = async (course: Course) => {
    setMigratingCourseId(course.id);
    setMigrationResult(prev => { const next = { ...prev }; delete next[course.id]; return next; });
    try {
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/migrate-course-media`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}` },
          body: JSON.stringify({ courseId: course.id, organizationId }),
          signal: AbortSignal.timeout(300000),
        }
      );
      const data = await res.json();
      if (data.success) {
        const msg = `Перенесено: ${data.filesTransferred}, ошибок: ${data.filesFailed || 0}, пропущено: ${data.filesSkipped || 0}`;
        setMigrationResult(prev => ({ ...prev, [course.id]: { status: 'success', message: msg } }));
        toast.success(msg, { duration: 15000 });
      } else {
        const isWorkerLimit = data.error?.includes("WORKER_LIMIT") || data.code === "WORKER_LIMIT";
        const msg = isWorkerLimit ? "Файлы слишком большие для автоматического переноса" : (data.error || "Ошибка миграции");
        setMigrationResult(prev => ({ ...prev, [course.id]: { status: 'error', message: msg } }));
        toast.error(msg, { duration: 15000 });
      }
    } catch (e: any) {
      const isTimeout = e.name === "TimeoutError" || e.name === "AbortError";
      const msg = isTimeout ? "Миграция заняла слишком много времени" : "Ошибка: " + e.message;
      setMigrationResult(prev => ({ ...prev, [course.id]: { status: 'error', message: msg } }));
      toast.error(msg, { duration: 15000 });
    } finally {
      setMigratingCourseId(null);
      setTimeout(() => { setMigrationResult(prev => { const next = { ...prev }; delete next[course.id]; return next; }); }, 10000);
    }
  };

  const handleDelete = async (course: Course) => {
    if (!confirm(`Удалить курс «${course.title}»? Это действие нельзя отменить.`)) return;
    const { error } = await supabase.from("courses").delete().eq("id", course.id);
    if (error) toast.error("Ошибка удаления: " + error.message);
    else { toast.success("Курс удалён"); fetchCourses(); }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-muted text-sm text-muted-foreground">
            <BookOpen className="w-4 h-4" />
            <span>Всего курсов: <span className="font-semibold text-foreground">{courses.length}</span></span>
          </div>
          {readyCourses.length > 0 && (
            <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-emerald-50 text-sm text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400">
              <CheckCircle2 className="w-3.5 h-3.5" /><span>{readyCourses.length} готово</span>
            </div>
          )}
          {needsReview.length > 0 && (
            <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-amber-50 text-sm text-amber-700 dark:bg-amber-950/30 dark:text-amber-400">
              <AlertCircle className="w-3.5 h-3.5" /><span>{needsReview.length} без уроков</span>
            </div>
          )}
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={onShowSkillspaceBatchImport}><Download className="w-4 h-4 mr-2" />Пакетный импорт</Button>
          <Button variant="outline" size="sm" onClick={onShowSkillspaceImport}><Download className="w-4 h-4 mr-2" />Импорт со SkillSpace</Button>
        </div>
      </div>
      <Card className="shadow-sm hover:shadow-md transition-shadow duration-200">
        <CardContent className="p-0">
          <DndContext sensors={dndSensors} collisionDetection={closestCenter} onDragEnd={handleCourseDragEnd}>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10"></TableHead>
                  <TableHead>Курс</TableHead>
                  <TableHead className="text-center">Уроков</TableHead>
                  <TableHead className="text-center">Учеников</TableHead>
                  <TableHead>Статус</TableHead>
                  <TableHead className="w-10"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <SortableContext items={courses.map(c => c.id)} strategy={verticalListSortingStrategy}>
                  {courses.map((course) => (
                    <SortableCourseRow
                      key={course.id}
                      course={course}
                      migratingCourseId={migratingCourseId}
                      migrationResult={migrationResult}
                      onMigrate={() => handleMigrate(course)}
                      onUpdate={() => onSkillspaceUpdate({ id: course.id, title: course.title })}
                      onDelete={() => handleDelete(course)}
                    />
                  ))}
                </SortableContext>
                {courses.length === 0 && (
                  <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Нет курсов</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </DndContext>
        </CardContent>
      </Card>
    </div>
  );
}
