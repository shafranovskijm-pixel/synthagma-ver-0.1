import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, FileSpreadsheet, CheckCircle2, XCircle, BarChart3, Filter, X, Calendar } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { format } from "date-fns";
import { ru } from "date-fns/locale";

interface TestAttemptData {
  id: string;
  user_id: string;
  lesson_id: string;
  score: number;
  max_score: number;
  completed_at: string;
  user_name: string;
  user_email: string;
  lesson_title: string;
}

interface CourseTestReportProps {
  courseId: string;
  courseName: string;
  organizationId: string;
}

export function CourseTestReport({ courseId, courseName, organizationId }: CourseTestReportProps) {
  const [testData, setTestData] = useState<TestAttemptData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  
  // Filters
  const [selectedStudent, setSelectedStudent] = useState<string>("all");
  const [selectedTest, setSelectedTest] = useState<string>("all");
  const [dateFrom, setDateFrom] = useState<Date | undefined>(undefined);
  const [dateTo, setDateTo] = useState<Date | undefined>(undefined);

  useEffect(() => {
    fetchTestData();
  }, [courseId]);

  const fetchTestData = async () => {
    setIsLoading(true);
    try {
      // Fetch lessons for this course (tests only)
      const { data: lessons } = await supabase
        .from("lessons")
        .select("id, title")
        .eq("course_id", courseId)
        .eq("type", "test");

      if (!lessons || lessons.length === 0) {
        setTestData([]);
        setIsLoading(false);
        return;
      }

      const lessonIds = lessons.map(l => l.id);
      const lessonsMap = new Map(lessons.map(l => [l.id, l.title]));

      // Fetch test attempts
      const { data: attempts } = await supabase
        .from("test_attempts")
        .select("*")
        .in("lesson_id", lessonIds)
        .order("completed_at", { ascending: false });

      if (!attempts || attempts.length === 0) {
        setTestData([]);
        setIsLoading(false);
        return;
      }

      // Fetch profiles
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, full_name, email")
        .eq("organization_id", organizationId);

      const profilesMap = new Map(
        (profiles || []).map(p => [p.user_id, { name: p.full_name || "Неизвестный", email: p.email || "" }])
      );

      const enrichedData: TestAttemptData[] = attempts.map(a => ({
        id: a.id,
        user_id: a.user_id,
        lesson_id: a.lesson_id,
        score: a.score,
        max_score: a.max_score,
        completed_at: a.completed_at,
        user_name: profilesMap.get(a.user_id)?.name || "Неизвестный",
        user_email: profilesMap.get(a.user_id)?.email || "",
        lesson_title: lessonsMap.get(a.lesson_id) || "Тест"
      }));

      setTestData(enrichedData);
    } catch (error) {
      console.error("Error fetching test data:", error);
    } finally {
      setIsLoading(false);
    }
  };

  // Get unique students and tests for filters
  const uniqueStudents = useMemo(() => {
    const students = new Map<string, string>();
    testData.forEach(a => {
      if (!students.has(a.user_id)) {
        students.set(a.user_id, a.user_name);
      }
    });
    return Array.from(students.entries()).map(([id, name]) => ({ id, name }));
  }, [testData]);

  const uniqueTests = useMemo(() => {
    const tests = new Map<string, string>();
    testData.forEach(a => {
      if (!tests.has(a.lesson_id)) {
        tests.set(a.lesson_id, a.lesson_title);
      }
    });
    return Array.from(tests.entries()).map(([id, title]) => ({ id, title }));
  }, [testData]);

  // Filtered data
  const filteredData = useMemo(() => {
    return testData.filter(a => {
      if (selectedStudent !== "all" && a.user_id !== selectedStudent) return false;
      if (selectedTest !== "all" && a.lesson_id !== selectedTest) return false;
      
      const attemptDate = new Date(a.completed_at);
      if (dateFrom) {
        const fromStart = new Date(dateFrom);
        fromStart.setHours(0, 0, 0, 0);
        if (attemptDate < fromStart) return false;
      }
      if (dateTo) {
        const toEnd = new Date(dateTo);
        toEnd.setHours(23, 59, 59, 999);
        if (attemptDate > toEnd) return false;
      }
      
      return true;
    });
  }, [testData, selectedStudent, selectedTest, dateFrom, dateTo]);

  // Stats based on filtered data
  const stats = useMemo(() => {
    const passedCount = filteredData.filter(a => a.score >= a.max_score * 0.7).length;
    const averageScore = filteredData.length > 0
      ? Math.round(filteredData.reduce((sum, a) => sum + (a.score / a.max_score) * 100, 0) / filteredData.length)
      : 0;
    const uniqueStudentsCount = new Set(filteredData.map(a => a.user_id)).size;

    return {
      totalAttempts: filteredData.length,
      passedCount,
      averageScore,
      uniqueStudents: uniqueStudentsCount
    };
  }, [filteredData]);

  const hasActiveFilters = selectedStudent !== "all" || selectedTest !== "all" || dateFrom || dateTo;

  const clearFilters = () => {
    setSelectedStudent("all");
    setSelectedTest("all");
    setDateFrom(undefined);
    setDateTo(undefined);
  };

  const handleExport = () => {
    import('xlsx').then(XLSX => {
      const exportData = filteredData.map(a => ({
        'ФИО': a.user_name,
        'Email': a.user_email,
        'Тест': a.lesson_title,
        'Баллы': a.score,
        'Макс. баллы': a.max_score,
        'Процент': Math.round((a.score / a.max_score) * 100) + '%',
        'Результат': a.score >= a.max_score * 0.7 ? 'Пройден' : 'Не пройден',
        'Дата': new Date(a.completed_at).toLocaleString('ru-RU')
      }));
      const ws = XLSX.utils.json_to_sheet(exportData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Результаты тестов');
      XLSX.writeFile(wb, `результаты_тестов_${courseName}_${new Date().toISOString().split('T')[0]}.xlsx`);
      toast.success('Результаты тестов экспортированы');
    });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  if (testData.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <BarChart3 className="w-8 h-8 mx-auto mb-2 opacity-50" />
        <p>Нет результатов тестирования</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="bg-secondary/20 rounded-xl p-3 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Filter className="w-4 h-4" />
            Фильтры
          </div>
          {hasActiveFilters && (
            <Button
              variant="ghost"
              size="sm"
              onClick={clearFilters}
              className="h-7 text-xs gap-1"
            >
              <X className="w-3 h-3" />
              Сбросить
            </Button>
          )}
        </div>
        
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
          {/* Student filter */}
          <Select value={selectedStudent} onValueChange={setSelectedStudent}>
            <SelectTrigger className="h-9 bg-background">
              <SelectValue placeholder="Ученик" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Все ученики</SelectItem>
              {uniqueStudents.map(s => (
                <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Test filter */}
          <Select value={selectedTest} onValueChange={setSelectedTest}>
            <SelectTrigger className="h-9 bg-background">
              <SelectValue placeholder="Тест" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Все тесты</SelectItem>
              {uniqueTests.map(t => (
                <SelectItem key={t.id} value={t.id}>{t.title}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Date from */}
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className="h-9 justify-start text-left font-normal bg-background">
                <Calendar className="w-4 h-4 mr-2" />
                {dateFrom ? format(dateFrom, "dd.MM.yyyy", { locale: ru }) : "С даты"}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <CalendarComponent
                mode="single"
                selected={dateFrom}
                onSelect={setDateFrom}
                initialFocus
              />
            </PopoverContent>
          </Popover>

          {/* Date to */}
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className="h-9 justify-start text-left font-normal bg-background">
                <Calendar className="w-4 h-4 mr-2" />
                {dateTo ? format(dateTo, "dd.MM.yyyy", { locale: ru }) : "По дату"}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <CalendarComponent
                mode="single"
                selected={dateTo}
                onSelect={setDateTo}
                initialFocus
              />
            </PopoverContent>
          </Popover>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-secondary/30 rounded-xl p-3 text-center">
          <div className="text-2xl font-bold">{stats.totalAttempts}</div>
          <div className="text-xs text-muted-foreground">Попыток</div>
        </div>
        <div className="bg-secondary/30 rounded-xl p-3 text-center">
          <div className="text-2xl font-bold">{stats.uniqueStudents}</div>
          <div className="text-xs text-muted-foreground">Учеников</div>
        </div>
        <div className="bg-sigma-green/10 rounded-xl p-3 text-center">
          <div className="text-2xl font-bold text-sigma-green">{stats.passedCount}</div>
          <div className="text-xs text-muted-foreground">Сдали</div>
        </div>
        <div className="bg-primary/10 rounded-xl p-3 text-center">
          <div className="text-2xl font-bold text-primary">{stats.averageScore}%</div>
          <div className="text-xs text-muted-foreground">Средний балл</div>
        </div>
      </div>

      {/* Export button */}
      <div className="flex justify-end">
        <Button
          variant="outline"
          size="sm"
          className="rounded-lg gap-2"
          onClick={handleExport}
          disabled={filteredData.length === 0}
        >
          <FileSpreadsheet className="w-4 h-4" />
          Экспорт в Excel ({filteredData.length})
        </Button>
      </div>

      {/* Results list */}
      {filteredData.length === 0 ? (
        <div className="text-center py-6 text-muted-foreground">
          <p>Нет результатов по выбранным фильтрам</p>
        </div>
      ) : (
        <div className="space-y-2 max-h-60 overflow-auto">
          {filteredData.map(attempt => (
            <div
              key={attempt.id}
              className={`flex items-center justify-between p-3 rounded-xl ${
                attempt.score >= attempt.max_score * 0.7 ? "bg-sigma-green/10" : "bg-destructive/10"
              }`}
            >
              <div className="flex items-center gap-3 min-w-0 flex-1">
                <div className={`p-2 rounded-lg ${
                  attempt.score >= attempt.max_score * 0.7 
                    ? "bg-sigma-green/20 text-sigma-green" 
                    : "bg-destructive/20 text-destructive"
                }`}>
                  {attempt.score >= attempt.max_score * 0.7 ? (
                    <CheckCircle2 className="w-4 h-4" />
                  ) : (
                    <XCircle className="w-4 h-4" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="font-medium truncate">{attempt.user_name}</div>
                  <div className="text-sm text-muted-foreground truncate">{attempt.lesson_title}</div>
                </div>
              </div>
              <div className="flex items-center gap-4 ml-3">
                <div className="text-right">
                  <div className={`font-bold ${
                    attempt.score >= attempt.max_score * 0.7 ? 'text-sigma-green' : 'text-destructive'
                  }`}>
                    {attempt.score}/{attempt.max_score}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {new Date(attempt.completed_at).toLocaleDateString('ru-RU')}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
