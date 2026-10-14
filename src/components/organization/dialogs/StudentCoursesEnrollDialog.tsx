import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { SigmaSpinner } from "@/components/ui/SigmaSpinner";
import { CourseGroupedList } from "./CourseGroupedList";

export interface StudentCourseEnrollmentResult {
  courseId: string;
  title: string;
  confirmed: boolean;
  message: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  courses: { id: string; title: string; is_published: boolean; category_id?: string | null }[];
  getCategoryById: (id?: string | null) => { id: string; name: string; color: string } | undefined;
  isEnrolling: boolean;
  results: StudentCourseEnrollmentResult[];
  onEnroll: (courseIds: string[]) => void;
}

/** A separate dialog keeps the shared many-students / one-course flow unchanged. */
export function StudentCoursesEnrollDialog({ open, onOpenChange, courses, getCategoryById, isEnrolling, results, onEnroll }: Props) {
  const [search, setSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const eligibleCourses = courses.filter(course => course.is_published && !results.some(result => result.courseId === course.id && result.confirmed));
  const eligibleIds = new Set(eligibleCourses.map(course => course.id));
  const selection = selectedIds.filter(id => eligibleIds.has(id));
  const visibleCourses = eligibleCourses.filter(course => course.title.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()));

  useEffect(() => {
    const confirmedIds = new Set(results.filter(result => result.confirmed).map(result => result.courseId));
    setSelectedIds(ids => ids.filter(id => !confirmedIds.has(id)));
  }, [results]);

  const toggle = (id: string) => {
    if (isEnrolling) return;
    setSelectedIds(ids => ids.includes(id) ? ids.filter(selected => selected !== id) : [...ids, id]);
  };
  const confirmedCount = results.filter(result => result.confirmed).length;

  return (
    <Dialog open={open} onOpenChange={value => { if (!isEnrolling) onOpenChange(value); }}>
      <DialogContent className="rounded-2xl max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Добавить курсы ученику</DialogTitle>
          <DialogDescription>Отметьте один или несколько курсов. Уже назначенные курсы повторно не добавляются.</DialogDescription>
        </DialogHeader>
        <Input aria-label="Поиск курсов" placeholder="Поиск курса..." value={search} disabled={isEnrolling} onChange={event => setSearch(event.target.value)} />
        <div className="flex items-center justify-between gap-2 text-sm">
          <span aria-live="polite">Выбрано курсов: {selection.length}</span>
          <Button variant="ghost" size="sm" disabled={isEnrolling || visibleCourses.length === 0} onClick={() => {
            const visibleIds = visibleCourses.map(course => course.id);
            const allSelected = visibleIds.every(id => selection.includes(id));
            setSelectedIds(ids => allSelected ? ids.filter(id => !visibleIds.includes(id)) : [...new Set([...ids, ...visibleIds])]);
          }}>{visibleCourses.length > 0 && visibleCourses.every(course => selection.includes(course.id)) ? "Снять выбор найденных" : "Выбрать найденные"}</Button>
        </div>
        <div className="max-h-[300px] min-h-[120px] overflow-y-auto rounded-xl border p-2 space-y-1">
          <CourseGroupedList courses={visibleCourses} getCategoryById={getCategoryById} emptyMessage="Доступных новых курсов не найдено" renderCourse={course => (
            <label key={course.id} className={`flex items-center gap-3 rounded-lg p-3 ${selection.includes(course.id) ? "bg-primary/10" : "hover:bg-secondary/50"} ${isEnrolling ? "opacity-60" : "cursor-pointer"}`}>
              <Checkbox checked={selection.includes(course.id)} disabled={isEnrolling} onCheckedChange={() => toggle(course.id)} aria-label={course.title} />
              <span className="text-sm font-medium">{course.title}</span>
            </label>
          )} />
        </div>
        {results.length > 0 && (
          <div role="status" className="rounded-xl border p-3 text-sm space-y-2">
            <p className="font-medium">Подтверждено курсов: {confirmedCount} из {results.length}</p>
            <ul className="space-y-1">
              {results.map(result => <li key={result.courseId} className={result.confirmed ? "text-muted-foreground" : "text-destructive"}>{result.title}: {result.message}</li>)}
            </ul>
            {!isEnrolling && confirmedCount < results.length && <p>Повторите для оставшихся выбранных курсов. Подтверждённые зачисления сохраняются.</p>}
          </div>
        )}
        <Button className="w-full rounded-xl" disabled={isEnrolling || selection.length === 0} onClick={() => onEnroll(selection)}>
          {isEnrolling ? <><SigmaSpinner size="sm" className="mr-2" />Добавление курсов...</> : `Добавить выбранные курсы (${selection.length})`}
        </Button>
      </DialogContent>
    </Dialog>
  );
}
