import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, FileSpreadsheet, CheckCircle2, XCircle, BarChart3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Progress } from "@/components/ui/progress";

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
  const [stats, setStats] = useState({
    totalAttempts: 0,
    passedCount: 0,
    averageScore: 0,
    uniqueStudents: 0
  });

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

      // Calculate stats
      const passedCount = enrichedData.filter(a => a.score >= a.max_score * 0.7).length;
      const averageScore = enrichedData.length > 0
        ? Math.round(enrichedData.reduce((sum, a) => sum + (a.score / a.max_score) * 100, 0) / enrichedData.length)
        : 0;
      const uniqueStudents = new Set(enrichedData.map(a => a.user_id)).size;

      setStats({
        totalAttempts: enrichedData.length,
        passedCount,
        averageScore,
        uniqueStudents
      });
    } catch (error) {
      console.error("Error fetching test data:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleExport = () => {
    import('xlsx').then(XLSX => {
      const exportData = testData.map(a => ({
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
        >
          <FileSpreadsheet className="w-4 h-4" />
          Экспорт в Excel
        </Button>
      </div>

      {/* Results list */}
      <div className="space-y-2 max-h-60 overflow-auto">
        {testData.map(attempt => (
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
    </div>
  );
}
