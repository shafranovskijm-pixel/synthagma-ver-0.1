import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Copy, Building2, Save, Key, Send, Mail, Trash2, FileSpreadsheet } from "lucide-react";
import { SigmaSpinner } from "@/components/ui/SigmaSpinner";

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

interface StudentDocument {
  id: string;
  type: string;
  name: string;
  file_url: string | null;
}

interface TestAttempt {
  id: string;
  lesson_id: string;
  lesson_title: string;
  score: number;
  max_score: number;
  completed_at: string;
  answers: Record<string, number>;
}

interface StudentDetails {
  student: Student;
  documents: StudentDocument[];
  testAttempts: TestAttempt[];
}

interface Company {
  id: string;
  name: string;
  inn: string | null;
}

interface StudentDetailsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  studentDetails: StudentDetails | null;
  isLoading: boolean;
  companies: Company[];
  studentCompanyId: string;
  onStudentCompanyIdChange: (id: string) => void;
  isSavingStudentCompany: boolean;
  onAttachToCompany: () => void;
  isCreatingCredentials: boolean;
  onCreateCredentials: () => void;
  isSendingCredentials: boolean;
  onSendCredentials: () => void;
  isSendingCredentialsEmail: boolean;
  onSendCredentialsEmail: () => void;
  isDeletingStudent: boolean;
  onDeleteStudent: () => void;
  onCopyCredentials: (login: string, password: string) => void;
}

export function StudentDetailsDialog({
  open,
  onOpenChange,
  studentDetails,
  isLoading,
  companies,
  studentCompanyId,
  onStudentCompanyIdChange,
  isSavingStudentCompany,
  onAttachToCompany,
  isCreatingCredentials,
  onCreateCredentials,
  isSendingCredentials,
  onSendCredentials,
  isSendingCredentialsEmail,
  onSendCredentialsEmail,
  isDeletingStudent,
  onDeleteStudent,
  onCopyCredentials }: StudentDetailsDialogProps) {
  const handleExportTests = () => {
    if (!studentDetails) return;
    
    import('xlsx').then(XLSX => {
      const exportData = studentDetails.testAttempts.map(attempt => ({
        'Тест': attempt.lesson_title,
        'Баллы': attempt.score,
        'Макс. баллы': attempt.max_score,
        'Процент': Math.round(attempt.score / attempt.max_score * 100) + '%',
        'Результат': attempt.score >= attempt.max_score * 0.7 ? 'Пройден' : 'Не пройден',
        'Дата': new Date(attempt.completed_at).toLocaleString('ru-RU')
      }));
      const ws = XLSX.utils.json_to_sheet(exportData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Результаты тестов');
      XLSX.writeFile(wb, `тесты_${studentDetails.student.name}_${new Date().toISOString().split('T')[0]}.xlsx`);
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl rounded-2xl max-h-[90vh] overflow-auto">
        <DialogHeader>
          <DialogTitle className="font-display">Карточка ученика</DialogTitle>
        </DialogHeader>
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <SigmaSpinner size="lg" />
          </div>
        ) : studentDetails && (
          <div className="space-y-6">
            {/* Basic Info */}
            <div className="bg-secondary/30 rounded-xl p-4">
              <h3 className="font-semibold text-lg">{studentDetails.student.name}</h3>
              <p className="text-muted-foreground">{studentDetails.student.email || "Email не указан"}</p>
              
              {/* Login credentials */}
              {studentDetails.student.login && (
                <div className="mt-3 p-3 bg-background rounded-lg border border-border">
                  <p className="text-sm text-muted-foreground mb-2">Данные для входа:</p>
                  <div className="flex items-center gap-3 flex-wrap">
                    <span className="bg-primary/10 text-primary px-2 py-1 rounded text-sm font-mono">
                      {studentDetails.student.login}
                    </span>
                    {studentDetails.student.generated_password && (
                      <span className="bg-muted text-muted-foreground px-2 py-1 rounded text-sm font-mono">
                        {studentDetails.student.generated_password}
                      </span>
                    )}
                    <Button
                      variant="outline"
                      size="sm"
                      className="rounded-lg gap-1 ml-auto"
                      onClick={() => onCopyCredentials(studentDetails.student.login!, studentDetails.student.generated_password || "")}
                    >
                      <Copy className="w-3.5 h-3.5" />
                      Копировать
                    </Button>
                  </div>
                </div>
              )}

              {studentDetails.student.course && (
                <p className="text-sm mt-3">
                  Курс: <span className="font-medium">{studentDetails.student.course}</span>
                </p>
              )}
              <div className="flex items-center gap-3 mt-3">
                <Progress value={studentDetails.student.progress} className="flex-1 h-3" />
                <span className="font-semibold">{studentDetails.student.progress}%</span>
              </div>
            </div>

            {/* Actions */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Attach to company */}
              <div className="bg-secondary/30 rounded-xl p-4">
                <h4 className="font-medium mb-3 flex items-center gap-2">
                  <Building2 className="w-4 h-4" />
                  Прикрепить к компании
                </h4>
                <div className="flex gap-2">
                  <Select value={studentCompanyId} onValueChange={onStudentCompanyIdChange}>
                    <SelectTrigger className="flex-1 rounded-lg">
                      <SelectValue placeholder="Выберите компанию" />
                    </SelectTrigger>
                    <SelectContent>
                      {companies.map(company => (
                        <SelectItem key={company.id} value={company.id}>
                          {company.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    variant="outline"
                    size="icon"
                    className="rounded-lg shrink-0"
                    onClick={onAttachToCompany}
                    disabled={!studentCompanyId || isSavingStudentCompany}
                  >
                    {isSavingStudentCompany ? <SigmaSpinner size="sm" /> : <Save className="w-4 h-4" />}
                  </Button>
                </div>
              </div>

              {/* Create credentials for students without login */}
              {!studentDetails.student.login && (
                <div className="bg-secondary/30 rounded-xl p-4">
                  <h4 className="font-medium mb-3 flex items-center gap-2">
                    <Key className="w-4 h-4" />
                    Данные для входа
                  </h4>
                  <p className="text-sm text-muted-foreground mb-3">
                    У ученика нет логина и пароля для входа в систему
                  </p>
                  <Button
                    className="w-full rounded-lg gap-2 btn-gradient"
                    onClick={onCreateCredentials}
                    disabled={isCreatingCredentials}
                  >
                    {isCreatingCredentials ? <SigmaSpinner size="sm" /> : <Key className="w-4 h-4" />}
                    Создать логин и пароль
                  </Button>
                </div>
              )}

              {/* Send credentials */}
              {studentDetails.student.login && studentDetails.student.generated_password && (
                <div className="bg-secondary/30 rounded-xl p-4">
                  <h4 className="font-medium mb-3 flex items-center gap-2">
                    <Send className="w-4 h-4" />
                    Отправить данные для входа
                  </h4>
                  <div className="flex flex-col gap-2">
                    <Button
                      variant="outline"
                      className="w-full rounded-lg gap-2"
                      onClick={onSendCredentials}
                      disabled={isSendingCredentials}
                    >
                      {isSendingCredentials ? <SigmaSpinner size="sm" /> : <Copy className="w-4 h-4" />}
                      Скопировать сообщение
                    </Button>
                    <Button
                      className="w-full rounded-lg gap-2 btn-gradient"
                      onClick={onSendCredentialsEmail}
                      disabled={isSendingCredentialsEmail || !studentDetails.student.email}
                    >
                      {isSendingCredentialsEmail ? <SigmaSpinner size="sm" /> : <Mail className="w-4 h-4" />}
                      {studentDetails.student.email ? "Отправить на почту" : "Email не указан"}
                    </Button>
                  </div>
                </div>
              )}

              {/* Delete student */}
              <div className="bg-destructive/10 rounded-xl p-4">
                <h4 className="font-medium mb-3 flex items-center gap-2 text-destructive">
                  <Trash2 className="w-4 h-4" />
                  Удалить ученика
                </h4>
                <p className="text-sm text-muted-foreground mb-3">
                  Полностью удалить ученика из системы
                </p>
                <Button
                  variant="destructive"
                  className="w-full rounded-lg gap-2"
                  onClick={onDeleteStudent}
                  disabled={isDeletingStudent}
                >
                  {isDeletingStudent ? <SigmaSpinner size="sm" /> : <Trash2 className="w-4 h-4" />}
                  Удалить ученика
                </Button>
              </div>
            </div>

            {/* Test Results */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold">Результаты тестов</h3>
                {studentDetails.testAttempts.length > 0 && (
                  <Button variant="outline" size="sm" className="rounded-lg gap-2" onClick={handleExportTests}>
                    <FileSpreadsheet className="w-4 h-4" />
                    Экспорт
                  </Button>
                )}
              </div>
              {studentDetails.testAttempts.length === 0 ? (
                <p className="text-muted-foreground text-sm">Нет пройденных тестов</p>
              ) : (
                <div className="space-y-3">
                  {studentDetails.testAttempts.map(attempt => (
                    <div key={attempt.id} className="bg-secondary/30 rounded-xl p-4">
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-medium">{attempt.lesson_title}</span>
                        <span className={`font-bold ${attempt.score >= attempt.max_score * 0.7 ? 'text-sigma-green' : 'text-destructive'}`}>
                          {attempt.score} / {attempt.max_score}
                        </span>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {new Date(attempt.completed_at).toLocaleString()}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
