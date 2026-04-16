import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Search } from "lucide-react";
import { format, parseISO } from "date-fns";
import { cn } from "@/lib/utils";
import { SigmaSpinner } from "@/components/ui/SigmaSpinner";

interface Student {
  enrollment_id: string;
  full_name: string;
  course_title: string;
  completed_at: string;
  already_added: boolean;
}

interface SelectStudentsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  studentSearchQuery: string;
  setStudentSearchQuery: (q: string) => void;
  loadingStudents: boolean;
  filteredStudents: Student[];
  selectedStudents: Set<string>;
  toggleStudentSelection: (id: string) => void;
  selectAllStudents: () => void;
  saving: boolean;
  onSubmit: () => void;
}

export function SelectStudentsDialog({
  open, onOpenChange, studentSearchQuery, setStudentSearchQuery,
  loadingStudents, filteredStudents, selectedStudents,
  toggleStudentSelection, selectAllStudents, saving, onSubmit
}: SelectStudentsDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col overflow-hidden">
        <DialogHeader className="shrink-0">
          <DialogTitle>Выбор выпускников для добавления</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 flex-1 min-h-0 overflow-y-auto">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input placeholder="Поиск по ФИО или курсу..." value={studentSearchQuery} onChange={(e) => setStudentSearchQuery(e.target.value)} className="pl-10 rounded-xl" />
          </div>
          {loadingStudents ? (
            <div className="flex justify-center py-8"><SigmaSpinner /></div>
          ) : filteredStudents.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">Нет завершивших студентов для добавления</div>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <Button variant="ghost" size="sm" onClick={selectAllStudents} className="rounded-lg">
                  {selectedStudents.size === filteredStudents.filter((s) => !s.already_added).length ? "Снять всё" : "Выбрать всё"}
                </Button>
                <span className="text-sm text-muted-foreground">Выбрано: {selectedStudents.size}</span>
              </div>
              <ScrollArea className="h-[400px] pr-4">
                <div className="space-y-2">
                  {filteredStudents.map((student) => (
                    <div key={student.enrollment_id} className={cn("flex items-center gap-3 p-3 rounded-xl border transition-colors overflow-hidden", student.already_added ? "opacity-50 bg-muted/30" : "hover:bg-secondary/30 cursor-pointer", selectedStudents.has(student.enrollment_id) && "border-primary/50 bg-primary/5")} onClick={() => !student.already_added && toggleStudentSelection(student.enrollment_id)}>
                      <Checkbox checked={student.already_added || selectedStudents.has(student.enrollment_id)} disabled={student.already_added} className="shrink-0" />
                      <div className="flex-1 min-w-0 overflow-hidden">
                        <div className="font-medium text-sm truncate">{student.full_name}</div>
                        <div className="text-xs text-muted-foreground truncate">{student.course_title}</div>
                      </div>
                      {student.already_added ? (
                        <Badge variant="secondary" className="text-xs">Добавлен</Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">{format(parseISO(student.completed_at), "dd.MM.yyyy")}</span>
                      )}
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </>
          )}
        </div>
        <DialogFooter className="shrink-0">
          <Button variant="outline" onClick={() => onOpenChange(false)} className="rounded-xl">Отмена</Button>
          <Button onClick={onSubmit} disabled={saving || selectedStudents.size === 0} className="rounded-xl">
            {saving && <SigmaSpinner size="sm" className="mr-2" />}
            Добавить ({selectedStudents.size})
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
