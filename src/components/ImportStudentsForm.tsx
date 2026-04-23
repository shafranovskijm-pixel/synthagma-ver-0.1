import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { safeInvoke } from "@/utils/safeInvoke";
import { showLimitToast } from "@/utils/limitToast";
import { Upload, FileSpreadsheet, Download, CheckCircle2, XCircle, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { getErrorMessage } from "@/utils/handleSupabaseError";
import { SigmaSpinner } from "@/components/ui/SigmaSpinner";

interface Course {
  id: string;
  title: string;
}

interface Company {
  id: string;
  name: string;
  inn: string | null;
}

interface ImportResult {
  success: boolean;
  email: string;
  name: string;
  error?: string;
  password?: string;
}

interface ImportStudentsFormProps {
  organizationId: string | null;
  courses: Course[];
  companies: Company[];
  onSuccess: () => void;
}

export default function ImportStudentsForm({ organizationId, courses, companies, onSuccess }: ImportStudentsFormProps) {
  const [file, setFile] = useState<File | null>(null);
  const [selectedCourseId, setSelectedCourseId] = useState<string>("");
  const [selectedCompanyId, setSelectedCompanyId] = useState<string>("");
  const [isImporting, setIsImporting] = useState(false);
  const [results, setResults] = useState<ImportResult[]>([]);
  const [showResults, setShowResults] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const generatePassword = () => {
    const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    let password = "";
    for (let i = 0; i < 10; i++) {
      password += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return password;
  };

  const parseCSV = (text: string): { email: string; name: string }[] => {
    const lines = text.trim().split("\n");
    const students: { email: string; name: string }[] = [];

    const startIndex = lines[0]?.toLowerCase().includes("email") || lines[0]?.toLowerCase().includes("фио") ? 1 : 0;

    for (let i = startIndex; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      const separator = line.includes(";") ? ";" : ",";
      const parts = line.split(separator).map(p => p.trim().replace(/^["']|["']$/g, ""));

      if (parts.length >= 2) {
        const emailIndex = parts[0].includes("@") ? 0 : 1;
        const nameIndex = emailIndex === 0 ? 1 : 0;

        const email = parts[emailIndex]?.trim();
        const name = parts[nameIndex]?.trim();

        if (email && email.includes("@") && name) {
          students.push({ email, name });
        }
      }
    }

    return students;
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      setFile(selectedFile);
      setResults([]);
      setShowResults(false);
    }
  };

  const handleImport = async () => {
    if (!file) {
      toast.error("Ошибка", { description: "Выберите файл для импорта" });
      return;
    }
    if (!organizationId) {
      toast.error("Ошибка", { description: "Организация не определена. Попробуйте обновить страницу." });
      return;
    }

    setIsImporting(true);
    setResults([]);

    try {
      const text = await file.text();
      const students = parseCSV(text);

      if (students.length === 0) {
        toast.error("Ошибка", { description: "Не найдено записей для импорта" });
        setIsImporting(false);
        return;
      }

      // Pre-check student limit before starting import
      if (organizationId) {
        const { data: currentCount } = await supabase.rpc('count_org_students', { org_id: organizationId });
        const { data: orgData } = await supabase
          .from('organizations')
          .select('subscription_plan')
          .eq('id', organizationId)
          .single();

        const planLimits: Record<string, number> = { free: 10, start: 100, standard: 200, professional: 1000, maximum: -1 };
        const maxStudents = planLimits[orgData?.subscription_plan || 'free'] ?? 10;
        const count = Number(currentCount) || 0;

        if (maxStudents !== -1 && count + students.length > maxStudents) {
          showLimitToast(`Превышен лимит учеников. Текущий тариф позволяет ${maxStudents} учеников. Сейчас: ${count}, импорт: ${students.length}.`);
          setIsImporting(false);
          return;
        }
      }

      const importResults: ImportResult[] = [];

      for (const student of students) {
        try {
          // Use no_login mode to allow duplicate emails - students get unique logins
          const { data, error } = await safeInvoke<any>("register-student", {
            body: {
              email: student.email,
              full_name: student.name,
              organization_id: organizationId,
              course_id: selectedCourseId || null,
              company_id: selectedCompanyId || null,
              no_login: true // This allows duplicate emails by generating unique logins
            }
          });

          if (error) throw error;
          if (data?.error) throw new Error(data.error);

          importResults.push({
            success: true,
            email: student.email,
            name: student.name,
            password: data.password || "см. карточку ученика"
          });
        } catch (err: any) {
          importResults.push({
            success: false,
            email: student.email,
            name: student.name,
            error: err.message || "Ошибка создания"
          });
        }
      }

      setResults(importResults);
      setShowResults(true);

      const successCount = importResults.filter(r => r.success).length;
      const failCount = importResults.filter(r => !r.success).length;

      if (failCount === 0) {
        toast.success("Успешно", { description: `Импортировано ${successCount} учеников` });
      } else if (successCount === 0) {
        toast.error("Ошибка", { description: `Ошибка импорта всех ${failCount} учеников` });
      } else {
        toast.success("Частичный успех", { description: `Импортировано ${successCount} из ${students.length} учеников` });
      }
    } catch (error: any) {
      console.error("Import error:", error);
      toast.error("Ошибка", { description: getErrorMessage(error) });
    } finally {
      setIsImporting(false);
    }
  };

  const downloadResults = () => {
    const successResults = results.filter(r => r.success);
    if (successResults.length === 0) return;

    const csv = "ФИО;Email;Пароль\n" + successResults.map(r => `${r.name};${r.email};${r.password}`).join("\n");
    const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "imported_students.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const downloadTemplate = () => {
    const template = "ФИО;Email\nИванов Иван Иванович;ivanov@example.com\nПетрова Мария Сергеевна;petrova@example.com";
    const blob = new Blob(["\ufeff" + template], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "students_template.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  if (showResults) {
    const successCount = results.filter(r => r.success).length;
    const failCount = results.filter(r => !r.success).length;

    return (
      <div className="space-y-4 py-4">
        <div className="flex items-center gap-4 p-4 bg-secondary/50 rounded-xl">
          <div className="flex items-center gap-2 text-green-500">
            <CheckCircle2 className="w-5 h-5" />
            <span className="font-medium">{successCount} успешно</span>
          </div>
          {failCount > 0 && (
            <div className="flex items-center gap-2 text-destructive">
              <XCircle className="w-5 h-5" />
              <span className="font-medium">{failCount} с ошибками</span>
            </div>
          )}
        </div>

        <div className="max-h-60 overflow-y-auto space-y-2">
          {results.map((result, idx) => (
            <div
              key={idx}
              className={`p-3 rounded-lg border ${
                result.success ? "bg-green-500/5 border-green-500/20" : "bg-destructive/5 border-destructive/20"
              }`}
            >
              <div className="flex items-start justify-between">
                <div>
                  <div className="font-medium text-sm">{result.name}</div>
                  <div className="text-xs text-muted-foreground">{result.email}</div>
                </div>
                {result.success ? (
                  <div className="text-xs text-muted-foreground">
                    Пароль: <code className="bg-secondary px-1 rounded">{result.password}</code>
                  </div>
                ) : (
                  <div className="text-xs text-destructive">{result.error}</div>
                )}
              </div>
            </div>
          ))}
        </div>

        <div className="flex gap-3 pt-2">
          {successCount > 0 && (
            <Button variant="outline" className="flex-1 rounded-xl gap-2" onClick={downloadResults}>
              <Download className="w-4 h-4" />
              Скачать пароли
            </Button>
          )}
          <Button className="flex-1 btn-gradient rounded-xl" onClick={onSuccess}>
            Готово
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 py-4">
      <div className="p-4 bg-secondary/50 rounded-xl">
        <div className="flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-muted-foreground shrink-0 mt-0.5" />
          <div className="text-sm text-muted-foreground">
            <p className="font-medium text-foreground mb-1">Формат файла:</p>
            <p>CSV файл с колонками: ФИО и Email</p>
            <p>Разделитель: запятая или точка с запятой</p>
          </div>
        </div>
        <Button variant="link" className="mt-2 h-auto p-0 text-primary" onClick={downloadTemplate}>
          <Download className="w-4 h-4 mr-1" />
          Скачать шаблон
        </Button>
      </div>

      <div className="space-y-2">
        <Label>Файл со списком учеников *</Label>
        <div
          className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-colors ${
            file ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"
          }`}
          onClick={() => fileInputRef.current?.click()}
        >
          <input ref={fileInputRef} type="file" accept=".csv,.txt" className="hidden" onChange={handleFileChange} />
          {file ? (
            <div className="flex items-center justify-center gap-2">
              <FileSpreadsheet className="w-6 h-6 text-primary" />
              <span className="font-medium">{file.name}</span>
            </div>
          ) : (
            <div>
              <Upload className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">Нажмите для выбора или перетащите файл</p>
            </div>
          )}
        </div>
      </div>

      <div className="space-y-2">
        <Label>Компания (опционально)</Label>
        <Select value={selectedCompanyId} onValueChange={setSelectedCompanyId}>
          <SelectTrigger className="rounded-xl">
            <SelectValue placeholder="Выберите компанию" />
          </SelectTrigger>
          <SelectContent>
            {companies.map((company) => (
              <SelectItem key={company.id} value={company.id}>
                {company.name} {company.inn ? `(ИНН: ${company.inn})` : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label>Курс для зачисления (опционально)</Label>
        <Select value={selectedCourseId} onValueChange={setSelectedCourseId}>
          <SelectTrigger className="rounded-xl">
            <SelectValue placeholder="Выберите курс" />
          </SelectTrigger>
          <SelectContent>
            {courses.map((course) => (
              <SelectItem key={course.id} value={course.id}>
                {course.title}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Button className="w-full btn-gradient rounded-xl gap-2" onClick={handleImport} disabled={!file || isImporting}>
        {isImporting ? (
          <>
            <SigmaSpinner size="sm" />
            Импорт...
          </>
        ) : (
          <>
            <Upload className="w-4 h-4" />
            Импортировать
          </>
        )}
      </Button>
    </div>
  );
}
