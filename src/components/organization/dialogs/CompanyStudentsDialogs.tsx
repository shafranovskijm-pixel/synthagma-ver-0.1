import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle } from "@/components/ui/dialog";
import {
  Search,
  Users,
  Mail,
  Calendar,
  Check,
  UserPlus,
  FileSpreadsheet } from "lucide-react";
import { format } from "date-fns";
import { ru } from "date-fns/locale";
import { getXLSX } from "@/utils/xlsxHelper";
import { toast } from "sonner";
import type { Company } from "@/hooks/useCompaniesManager";

interface CompanyStudent {
  id: string;
  user_id: string;
  full_name: string;
  email: string;
  created_at: string;
  enrollments: {
    course_title: string;
    progress: number;
    status: string;
  }[];
}

interface AvailableStudent {
  id: string;
  user_id: string;
  full_name: string;
  email: string;
  company_id: string | null;
  company_name: string | null;
}

interface ViewStudentsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  company: Company | null;
  students: CompanyStudent[];
  isLoading: boolean;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
}

export function ViewStudentsDialog({
  open,
  onOpenChange,
  company,
  students,
  isLoading,
  searchQuery,
  setSearchQuery }: ViewStudentsDialogProps) {
  const filteredStudents = students.filter(
    (s) =>
      s.full_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.email.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleExport = async () => {
    if (students.length === 0) return;
    
    const XLSX = await getXLSX();
    const exportData: any[] = [];
    students.forEach((student) => {
      if (student.enrollments.length === 0) {
        exportData.push({
          "ФИО": student.full_name,
          "Email": student.email,
          "Курс": "Не зачислен",
          "Прогресс": "",
          "Статус": "" });
      } else {
        student.enrollments.forEach((enrollment) => {
          exportData.push({
            "ФИО": student.full_name,
            "Email": student.email,
            "Курс": enrollment.course_title,
            "Прогресс": `${enrollment.progress}%`,
            "Статус": enrollment.status === "completed" ? "Завершён" : "Активный" });
        });
      }
    });

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Ученики");
    XLSX.writeFile(wb, `${company?.name || "company"}_students.xlsx`);
    toast.success("Список учеников экспортирован");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-2xl max-w-3xl max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="font-display flex items-center gap-2">
            <Users className="w-5 h-5 text-primary" />
            Ученики компании «{company?.name}»
          </DialogTitle>
          <DialogDescription>
            {students.length} учеников в компании
          </DialogDescription>
        </DialogHeader>

        <div className="py-4 space-y-4 flex-1 overflow-hidden flex flex-col">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Поиск по имени или email..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 rounded-xl"
            />
          </div>

          <div className="flex-1 overflow-y-auto">
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <SigmaSpinner size="lg" />
              </div>
            ) : filteredStudents.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <Users className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p>{searchQuery ? "Ученики не найдены" : "Нет учеников в этой компании"}</p>
              </div>
            ) : (
              <div className="space-y-3">
                {filteredStudents.map((student) => (
                  <div
                    key={student.id}
                    className="bg-secondary/50 rounded-xl p-4 border border-border"
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <div className="font-medium">{student.full_name}</div>
                        <div className="text-sm text-muted-foreground flex items-center gap-1">
                          <Mail className="w-3 h-3" />
                          {student.email}
                        </div>
                        <div className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                          <Calendar className="w-3 h-3" />
                          Регистрация: {format(new Date(student.created_at), "dd MMM yyyy", { locale: ru })}
                        </div>
                      </div>
                      <span className="text-xs px-2 py-1 bg-primary/10 text-primary rounded-full">
                        {student.enrollments.length} курсов
                      </span>
                    </div>

                    {student.enrollments.length > 0 ? (
                      <div className="space-y-2">
                        {student.enrollments.map((enrollment, idx) => (
                          <div
                            key={idx}
                            className="flex items-center justify-between bg-background rounded-lg px-3 py-2"
                          >
                            <div className="flex-1 min-w-0 mr-4">
                              <div className="text-sm font-medium truncate">
                                {enrollment.course_title}
                              </div>
                            </div>
                            <div className="flex items-center gap-3">
                              <div className="flex items-center gap-2 w-32">
                              <Progress value={Math.min(enrollment.progress, 100)} className="h-2 flex-1" />
                              <span className="text-xs font-medium w-10 text-right">
                                {Math.min(enrollment.progress, 100)}%
                              </span>
                              </div>
                              <span
                                className={`text-xs px-2 py-0.5 rounded-full ${
                                  enrollment.status === "completed"
                                    ? "bg-sigma-green/10 text-sigma-green"
                                    : "bg-muted text-muted-foreground"
                                }`}
                              >
                                {enrollment.status === "completed" ? "Завершён" : "Активный"}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-sm text-muted-foreground italic">
                        Не зачислен на курсы
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="flex justify-between pt-4 border-t border-border">
          <Button
            variant="outline"
            className="rounded-xl gap-2"
            onClick={handleExport}
            disabled={students.length === 0}
          >
            <FileSpreadsheet className="w-4 h-4" />
            Экспорт в Excel
          </Button>
          <Button
            variant="outline"
            className="rounded-xl"
            onClick={() => onOpenChange(false)}
          >
            Закрыть
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

interface BulkAssignStudentsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  company: Company | null;
  availableStudents: AvailableStudent[];
  selectedStudentIds: string[];
  isLoading: boolean;
  isAssigning: boolean;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  showOnlyUnassigned: boolean;
  setShowOnlyUnassigned: (value: boolean) => void;
  onToggleStudent: (studentId: string) => void;
  onToggleSelectAll: () => void;
  onAssign: () => void;
}

export function BulkAssignStudentsDialog({
  open,
  onOpenChange,
  company,
  availableStudents,
  selectedStudentIds,
  isLoading,
  isAssigning,
  searchQuery,
  setSearchQuery,
  showOnlyUnassigned,
  setShowOnlyUnassigned,
  onToggleStudent,
  onToggleSelectAll,
  onAssign }: BulkAssignStudentsDialogProps) {
  const filteredStudents = availableStudents.filter((s) => {
    const matchesSearch =
      s.full_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.email.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesFilter = showOnlyUnassigned ? !s.company_id : true;
    return matchesSearch && matchesFilter;
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-2xl max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="font-display flex items-center gap-2">
            <UserPlus className="w-5 h-5 text-sigma-green" />
            Назначить учеников в компанию
          </DialogTitle>
          <DialogDescription>
            Выберите учеников для назначения в «{company?.name}»
          </DialogDescription>
        </DialogHeader>

        <div className="py-4 space-y-4 flex-1 overflow-hidden flex flex-col">
          <div className="flex gap-3">
            <div className="relative flex-1">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Поиск по имени или email..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 rounded-xl"
              />
            </div>
            <Button
              variant={showOnlyUnassigned ? "default" : "outline"}
              className="rounded-xl gap-2"
              onClick={() => setShowOnlyUnassigned(!showOnlyUnassigned)}
            >
              {showOnlyUnassigned && <Check className="w-4 h-4" />}
              Без компании
            </Button>
          </div>

          <div className="flex items-center justify-between">
            <div className="flex gap-4">
              <div className="flex items-center gap-2 px-3 py-2 bg-primary/10 rounded-lg">
                <Users className="w-4 h-4 text-primary" />
                <span className="text-sm font-medium">{filteredStudents.length} учеников</span>
              </div>
              {selectedStudentIds.length > 0 && (
                <div className="flex items-center gap-2 px-3 py-2 bg-sigma-green/10 rounded-lg">
                  <Check className="w-4 h-4 text-sigma-green" />
                  <span className="text-sm font-medium">{selectedStudentIds.length} выбрано</span>
                </div>
              )}
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="text-sm"
              onClick={onToggleSelectAll}
              disabled={filteredStudents.length === 0}
            >
              {selectedStudentIds.length === filteredStudents.length && filteredStudents.length > 0
                ? "Снять выделение"
                : "Выбрать всех"}
            </Button>
          </div>

          <div className="flex-1 overflow-y-auto border border-border rounded-xl">
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <SigmaSpinner size="lg" />
              </div>
            ) : filteredStudents.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <Users className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p>{searchQuery || showOnlyUnassigned ? "Ученики не найдены" : "Нет учеников в организации"}</p>
              </div>
            ) : (
              <div className="divide-y divide-border">
                {filteredStudents.map((student) => {
                  const isSelected = selectedStudentIds.includes(student.id);
                  const isAlreadyInCompany = student.company_id === company?.id;
                  
                  return (
                    <div
                      key={student.id}
                      className={`flex items-center gap-4 p-4 hover:bg-secondary/50 transition-colors cursor-pointer ${
                        isSelected ? "bg-primary/5" : ""
                      } ${isAlreadyInCompany ? "opacity-50" : ""}`}
                      onClick={() => !isAlreadyInCompany && onToggleStudent(student.id)}
                    >
                      <Checkbox
                        checked={isSelected}
                        disabled={isAlreadyInCompany}
                        onCheckedChange={() => !isAlreadyInCompany && onToggleStudent(student.id)}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="font-medium">{student.full_name}</div>
                        <div className="text-sm text-muted-foreground flex items-center gap-1">
                          <Mail className="w-3 h-3" />
                          {student.email}
                        </div>
                      </div>
                      {student.company_name ? (
                        <span className={`text-xs px-2 py-1 rounded-full ${
                          isAlreadyInCompany 
                            ? "bg-sigma-green/10 text-sigma-green" 
                            : "bg-muted text-muted-foreground"
                        }`}>
                          {isAlreadyInCompany ? "Уже в этой компании" : student.company_name}
                        </span>
                      ) : (
                        <span className="text-xs px-2 py-1 rounded-full bg-orange-500/10 text-orange-500">
                          Без компании
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
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
            onClick={onAssign}
            disabled={selectedStudentIds.length === 0 || isAssigning}
          >
            {isAssigning ? (
              <>
                <SigmaSpinner size="sm" />
                Назначение...
              </>
            ) : (
              <>
                <UserPlus className="w-4 h-4" />
                Назначить ({selectedStudentIds.length})
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
