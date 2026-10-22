import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { XCircle } from "lucide-react";
import ImportStudentsForm from "@/components/ImportStudentsForm";
import { SigmaSpinner } from "@/components/ui/SigmaSpinner";

// Re-export extracted dialogs
export { AddStudentDialog } from "./AddStudentDialog";
export { EnrollDialog } from "./EnrollDialog";

interface Company {
  id: string;
  name: string;
  inn: string | null;
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

// Import Students Dialog
interface ImportStudentsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organizationId: string | null;
  courses: Course[];
  companies: Company[];
}

export function ImportStudentsDialog({ open, onOpenChange, organizationId, courses, companies }: ImportStudentsDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl rounded-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display">Импорт учеников</DialogTitle>
          <DialogDescription>Загрузите файл Excel или CSV со списком учеников</DialogDescription>
        </DialogHeader>
        <ImportStudentsForm 
          organizationId={organizationId} 
          courses={courses.filter(c => c.is_published)} 
          companies={companies} 
          onSuccess={() => { onOpenChange(false); window.location.reload(); }} 
        />
      </DialogContent>
    </Dialog>
  );
}

// Unenroll Confirmation Dialog
interface UnenrollConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedCount: number;
  isUnenrolling: boolean;
  onConfirm: () => void;
  preparation?: { rows: { enrollment_id: string; user_id: string; course_id: string; student_name: string; course_title: string; status: string | null; progress: number | null }[] } | null;
  onOpenGroups?: () => void;
}

export function UnenrollConfirmDialog({ open, onOpenChange, selectedCount, isUnenrolling, onConfirm, preparation, onOpenGroups }: UnenrollConfirmDialogProps) {
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="rounded-2xl max-h-[90vh] overflow-y-auto"><DialogHeader><DialogTitle className="font-display text-destructive">Подготовить отчисление</DialogTitle><DialogDescription>{preparation ? 'Выбранные зачисления проверены. Это подготовка: ученики продолжают обучение, результаты и история сохранены. Приказ и событие отчисления не создавались.' : 'Проверить выбранные зачисления (' + selectedCount + ') и сохранить их контекст для подготовки? Удаление зачислений и автоматический приказ не выполняются.'}</DialogDescription></DialogHeader>{preparation && <div className="space-y-3"><div className="rounded-xl border border-border p-3 space-y-2">{preparation.rows.map(row => <div key={row.enrollment_id}><p className="text-sm font-medium">{row.student_name} · {row.course_title}</p><p className="text-xs text-muted-foreground">Состояние: {row.status ?? 'не указано'} · прогресс: {row.progress ?? 0}%</p><details className="text-xs text-muted-foreground"><summary>Точное зачисление</summary><p className="break-all">{row.enrollment_id}</p></details></div>)}</div><p className="text-sm text-muted-foreground">Откройте «Ученики → Группы», выберите фактическую группу и её документы. Сведения нужно проверить перед оформлением. Перевод зачисления в состояние отчисления требует отдельного подтверждённого рабочего процесса.</p></div>}<div className="flex flex-wrap gap-3 justify-end pt-4"><Button variant="outline" className="rounded-xl" onClick={() => onOpenChange(false)} disabled={isUnenrolling}>{preparation ? 'Закрыть' : 'Отмена'}</Button>{preparation ? onOpenGroups && <Button className="rounded-xl" onClick={onOpenGroups}>Открыть группы</Button> : <Button variant="destructive" className="rounded-xl" onClick={onConfirm} disabled={isUnenrolling}>{isUnenrolling ? <><SigmaSpinner size="sm" className="mr-2" />Проверка...</> : <><XCircle className="w-4 h-4 mr-2" />Проверить выбор</>}</Button>}</div></DialogContent></Dialog>;
}

// Category Dialog
interface CategoryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isCreating: boolean;
  onCreate: (name: string, color: string) => void;
}

export function CategoryDialog({ open, onOpenChange, isCreating, onCreate }: CategoryDialogProps) {
  const [name, setName] = useState("");
  const [color, setColor] = useState("#6366f1");

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) { setName(""); setColor("#6366f1"); } onOpenChange(v); }}>
      <DialogContent className="rounded-2xl">
        <DialogHeader><DialogTitle className="font-display">Создать категорию</DialogTitle></DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>Название</Label>
            <Input placeholder="Название категории" className="rounded-xl" value={name} onChange={e => setName(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Цвет</Label>
            <div className="flex items-center gap-3">
              <input type="color" value={color} onChange={e => setColor(e.target.value)} className="w-12 h-10 rounded-lg border border-border cursor-pointer" />
              <Input value={color} onChange={e => setColor(e.target.value)} className="flex-1 rounded-xl" />
            </div>
          </div>
          <Button className="w-full btn-gradient rounded-xl" onClick={() => onCreate(name, color)} disabled={isCreating}>
            {isCreating ? (<><SigmaSpinner size="sm" className="mr-2" />Создание...</>) : "Создать"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

