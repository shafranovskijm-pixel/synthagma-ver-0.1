import { useState } from "react";
import { WithdrawalDialog } from "../education-issuance/WithdrawalDialog";
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

// The server retains the enrollment, its results and documents.
interface UnenrollConfirmDialogProps {
  open: boolean; onOpenChange: (open: boolean) => void; organizationId: string | null;
  enrollmentIds: string[]; onWithdrawn: () => void;
}
export function UnenrollConfirmDialog(props: UnenrollConfirmDialogProps) {
  if (!props.organizationId) return null;
  return <WithdrawalDialog open={props.open} onOpenChange={props.onOpenChange} organizationId={props.organizationId}
    enrollmentIds={props.enrollmentIds} onWithdrawn={props.onWithdrawn} />;
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

