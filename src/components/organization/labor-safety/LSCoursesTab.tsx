import React from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { SigmaSpinner } from "@/components/ui/SigmaSpinner";
import { BookOpen, GraduationCap, Plus, Trash2, RotateCcw } from "lucide-react";
import { format } from "date-fns";
import { ru } from "date-fns/locale";
import type { LSEnrollment, LSCourse } from "@/hooks/useLaborSafetyStudent";

function getStatusBadge(status: string) {
  switch (status) {
    case "completed": return <Badge className="bg-green-500/10 text-green-600 border-green-500/20">Завершён</Badge>;
    case "active": return <Badge className="bg-blue-500/10 text-blue-600 border-blue-500/20">Активен</Badge>;
    default: return <Badge variant="secondary">{status}</Badge>;
  }
}

interface LSCoursesTabProps {
  hasProfile: boolean;
  enrollments: LSEnrollment[];
  coursesToEnroll: LSCourse[];
  isAddingCourse: boolean;
  setIsAddingCourse: (v: boolean) => void;
  selectedCourseIds: string[];
  setSelectedCourseIds: React.Dispatch<React.SetStateAction<string[]>>;
  isEnrolling: boolean;
  handleEnrollToCourse: () => void;
  handleRemoveEnrollment: (id: string) => void;
  handleResetProgress: (enrollmentId: string, courseId: string) => void;
}

export function LSCoursesTab({
  hasProfile, enrollments, coursesToEnroll, isAddingCourse, setIsAddingCourse,
  selectedCourseIds, setSelectedCourseIds, isEnrolling,
  handleEnrollToCourse, handleRemoveEnrollment, handleResetProgress,
}: LSCoursesTabProps) {
  if (!hasProfile) {
    return <div className="text-center py-12 text-muted-foreground"><GraduationCap className="w-12 h-12 mx-auto mb-3 opacity-50" /><p>Сначала создайте учётную запись</p></div>;
  }

  return (
    <div className="bg-card rounded-2xl border border-border p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold flex items-center gap-2"><BookOpen className="w-5 h-5 text-primary" />Курсы ({enrollments.length})</h3>
        {coursesToEnroll.length > 0 && (
          <Button size="sm" variant="outline" onClick={() => setIsAddingCourse(!isAddingCourse)}><Plus className="w-4 h-4 mr-1" />Зачислить</Button>
        )}
      </div>

      {isAddingCourse && (
        <div className="mb-4 p-3 rounded-lg bg-muted/50 space-y-3">
          <div className="text-sm text-muted-foreground mb-2">Выберите курсы для зачисления:</div>
          <div className="max-h-48 overflow-y-auto space-y-2">
            {coursesToEnroll.map(c => (
              <div key={c.id} className={`flex items-center gap-3 p-2 rounded-lg cursor-pointer transition-colors ${selectedCourseIds.includes(c.id) ? "bg-primary/10" : "hover:bg-muted"}`}
                onClick={() => setSelectedCourseIds(prev => prev.includes(c.id) ? prev.filter(id => id !== c.id) : [...prev, c.id])}>
                <Checkbox checked={selectedCourseIds.includes(c.id)} onCheckedChange={checked => setSelectedCourseIds(prev => checked ? [...prev, c.id] : prev.filter(id => id !== c.id))} />
                <span className="text-sm">{c.title}</span>
              </div>
            ))}
          </div>
          {selectedCourseIds.length > 0 && <div className="text-xs text-muted-foreground">Выбрано: {selectedCourseIds.length}</div>}
          <div className="flex justify-end">
            <Button size="sm" onClick={handleEnrollToCourse} disabled={selectedCourseIds.length === 0 || isEnrolling}>
              {isEnrolling ? <SigmaSpinner size="sm" className="mr-1" /> : <GraduationCap className="w-4 h-4 mr-1" />}
              Зачислить ({selectedCourseIds.length})
            </Button>
          </div>
        </div>
      )}

      {enrollments.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground"><GraduationCap className="w-12 h-12 mx-auto mb-3 opacity-50" /><p>Нет назначенных курсов</p></div>
      ) : (
        <div className="space-y-3">
          {enrollments.map(e => (
            <div key={e.id} className="p-4 rounded-xl bg-muted/50">
              <div className="flex items-center justify-between mb-2">
                <div className="font-medium">{e.course_title}</div>
                <div className="flex items-center gap-2">
                  {getStatusBadge(e.status)}
                  {e.progress > 0 && <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => handleResetProgress(e.id, e.course_id)} title="Сбросить прогресс"><RotateCcw className="w-4 h-4" /></Button>}
                  <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => handleRemoveEnrollment(e.id)} title="Отчислить"><Trash2 className="w-4 h-4" /></Button>
                </div>
              </div>
              <div className="flex items-center gap-3"><Progress value={e.progress} className="flex-1 h-2" /><span className="text-sm text-muted-foreground">{Math.min(e.progress, 100)}%</span></div>
              <div className="text-xs text-muted-foreground mt-2">
                Начало: {format(new Date(e.started_at), "dd.MM.yyyy", { locale: ru })}
                {e.completed_at && <span className="text-green-600 ml-2">• Завершён: {format(new Date(e.completed_at), "dd.MM.yyyy", { locale: ru })}</span>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
