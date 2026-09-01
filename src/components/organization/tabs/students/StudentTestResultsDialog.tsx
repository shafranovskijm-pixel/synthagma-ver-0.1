import { useEffect, useMemo, useState } from "react";
import { BarChart3, RefreshCw, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SigmaSpinner } from "@/components/ui/SigmaSpinner";
import type {
  OrganizationStudentCourseResult,
  StudentResultsProgress,
} from "@/api/organizationStudentResults";
import { flattenStudentTestResults } from "@/lib/studentTestResults";
import type { Course } from "@/types";

interface StudentTestResultsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  courses: Course[];
  initialCourseId: string;
  initialStudentId: string | null;
  rows: OrganizationStudentCourseResult[];
  isLoading: boolean;
  error: Error | null;
  progress: StudentResultsProgress | null;
  onLoad: (force?: boolean) => Promise<OrganizationStudentCourseResult[]>;
}

function statusClass(status: string): string {
  if (status === "Сдан" || status === "Сдано") {
    return "bg-sigma-green/10 text-sigma-green border-sigma-green/20";
  }
  if (status === "Не сдан" || status === "Не сдано") {
    return "bg-destructive/10 text-destructive border-destructive/20";
  }
  return "bg-muted text-muted-foreground border-border";
}

export function StudentTestResultsDialog({
  open,
  onOpenChange,
  courses,
  initialCourseId,
  initialStudentId,
  rows,
  isLoading,
  error,
  progress,
  onLoad,
}: StudentTestResultsDialogProps) {
  const [selectedCourseId, setSelectedCourseId] = useState("all");
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (!open) return;
    setSelectedCourseId(
      initialCourseId !== "all" && courses.some((course) => course.id === initialCourseId)
        ? initialCourseId
        : "all",
    );
    setSelectedStudentId(initialStudentId);
    void onLoad(false).catch(() => undefined);
  }, [open, initialCourseId, initialStudentId, courses, onLoad]);

  const records = useMemo(() => flattenStudentTestResults(rows), [rows]);
  const filteredRecords = useMemo(() => {
    const normalizedSearch = search.trim().toLocaleLowerCase("ru");
    return records.filter((record) => {
      if (selectedStudentId && record.userId !== selectedStudentId) return false;
      if (selectedCourseId !== "all" && record.courseId !== selectedCourseId) return false;
      if (!normalizedSearch) return true;
      return [record.fullName, record.email, record.courseTitle, record.testTitle]
        .some((value) => value.toLocaleLowerCase("ru").includes(normalizedSearch));
    });
  }, [records, search, selectedCourseId, selectedStudentId]);

  const selectedStudentName = useMemo(
    () => records.find((record) => record.userId === selectedStudentId)?.fullName ?? null,
    [records, selectedStudentId],
  );

  const uniqueStudents = useMemo(
    () => new Set(filteredRecords.map((record) => record.userId)).size,
    [filteredRecords],
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl max-h-[88vh] flex flex-col rounded-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-primary" />
            Результаты тестирования
          </DialogTitle>
          <DialogDescription>
            Последний результат каждого теста. Проходной балл берётся из настроек конкретного урока.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col sm:flex-row gap-2">
          <Select value={selectedCourseId} onValueChange={setSelectedCourseId}>
            <SelectTrigger className="sm:w-72 rounded-xl">
              <SelectValue placeholder="Выберите курс" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Все курсы</SelectItem>
              {courses.map((course) => (
                <SelectItem key={course.id} value={course.id}>{course.title}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Поиск по ФИО, email, курсу или тесту..."
              className="pl-10 rounded-xl"
            />
          </div>
          <Button
            type="button"
            variant="outline"
            className="rounded-xl gap-2"
            onClick={() => void onLoad(true).catch(() => undefined)}
            disabled={isLoading}
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? "animate-spin" : ""}`} />
            Обновить
          </Button>
        </div>

        {selectedStudentId && (
          <div className="flex items-center gap-2 rounded-xl bg-muted/60 px-3 py-2 text-sm">
            <span className="text-muted-foreground">Показаны результаты ученика:</span>
            <strong>{selectedStudentName ?? "выбранный ученик"}</strong>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="ml-auto h-8 rounded-lg gap-1"
              onClick={() => setSelectedStudentId(null)}
            >
              <X className="w-3.5 h-3.5" />
              Показать всех
            </Button>
          </div>
        )}

        {isLoading ? (
          <div className="flex-1 min-h-56 flex flex-col items-center justify-center gap-3 text-muted-foreground">
            <SigmaSpinner size="lg" />
            <p className="text-sm">
              {progress && progress.totalCourses > 0
                ? `Загружено курсов: ${progress.completedCourses} из ${progress.totalCourses}`
                : "Загружаем результаты..."}
            </p>
          </div>
        ) : error ? (
          <div className="flex-1 min-h-56 flex flex-col items-center justify-center gap-3 text-center">
            <p className="font-medium">Не удалось загрузить результаты</p>
            <p className="text-sm text-muted-foreground max-w-lg">
              Данные не показаны: загрузка должна завершиться полностью. Повторите попытку.
            </p>
            <p className="max-w-lg break-words rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">
              Причина: {error.message || "неизвестная ошибка сервера"}
            </p>
            <Button variant="outline" className="rounded-xl" onClick={() => void onLoad(true).catch(() => undefined)}>
              Повторить
            </Button>
          </div>
        ) : filteredRecords.length === 0 ? (
          <div className="flex-1 min-h-56 flex flex-col items-center justify-center gap-2 text-center text-muted-foreground">
            <BarChart3 className="w-10 h-10 opacity-40" />
            <p className="font-medium text-foreground">Результаты не найдены</p>
            <p className="text-sm">Проверьте курс и строку поиска.</p>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-4 text-sm text-muted-foreground">
              <span>Учеников: <strong className="text-foreground">{uniqueStudents}</strong></span>
              <span>Строк результатов: <strong className="text-foreground">{filteredRecords.length}</strong></span>
            </div>
            <div className="flex-1 min-h-0 overflow-auto rounded-xl border border-border">
              <table className="w-full min-w-[980px]">
                <thead className="sticky top-0 bg-card z-10">
                  <tr className="border-b border-border">
                    <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">ФИО</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">Email</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">Курс</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">Тест</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">Результат</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">Статус</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">Дата</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRecords.map((record, index) => (
                    <tr
                      key={`${record.userId}:${record.courseId}:${record.testTitle}:${index}`}
                      className="border-b border-border last:border-b-0"
                    >
                      <td className="px-4 py-3 text-sm font-medium">{record.fullName}</td>
                      <td className="px-4 py-3 text-sm text-muted-foreground">{record.email || "—"}</td>
                      <td className="px-4 py-3 text-sm">{record.courseTitle}</td>
                      <td className="px-4 py-3 text-sm">{record.testTitle}</td>
                      <td className="px-4 py-3 text-sm whitespace-nowrap">
                        {record.percent === null
                          ? "—"
                          : `${record.score ?? 0}/${record.maxScore ?? 0} · ${record.percent}%`}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex px-2 py-1 rounded-full border text-xs ${statusClass(record.status)}`}>
                          {record.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-muted-foreground whitespace-nowrap">
                        {record.completedAt ? new Date(record.completedAt).toLocaleString("ru-RU") : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
