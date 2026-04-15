import { useState, useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue } from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow } from "@/components/ui/table";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger } from "@/components/ui/popover";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  ArrowLeft,
  Calendar as CalendarIcon,
  Search,
  Users,
  BookOpen,
  Award,
  FileSpreadsheet,
  CheckCircle,
  XCircle,
  TrendingUp,
  GraduationCap } from "lucide-react";
import { format, parseISO, startOfMonth, endOfMonth, isWithinInterval } from "date-fns";
import { ru } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { getXLSX } from "@/utils/xlsxHelper";
import { Badge } from "@/components/ui/badge";

interface GradeRecord {
  id: string;
  user_id: string;
  student_name: string;
  student_email: string;
  course_id: string;
  course_title: string;
  lesson_id: string;
  lesson_title: string;
  lesson_type: string;
  completed_at: string;
  score: number | null;
  max_score: number | null;
  passed: boolean;
  control_type: "test" | "lesson" | "practice";
}

interface Course {
  id: string;
  title: string;
}

interface AutoGradesJournalProps {
  organizationId: string;
  onClose: () => void;
}

export function AutoGradesJournal({
  organizationId,
  onClose }: AutoGradesJournalProps) {
  const [loading, setLoading] = useState(true);
  const [records, setRecords] = useState<GradeRecord[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCourse, setSelectedCourse] = useState<string>("all");
  const [selectedType, setSelectedType] = useState<string>("all");
  const [dateRange, setDateRange] = useState<{
    from: Date;
    to: Date;
  }>({
    from: startOfMonth(new Date()),
    to: endOfMonth(new Date()) });

  // Fetch all data
  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        // Fetch courses
        const { data: coursesData } = await supabase
          .from("courses")
          .select("id, title")
          .eq("organization_id", organizationId)
          .order("title");

        if (coursesData) {
          setCourses(coursesData);
        }

        // Fetch test attempts
        const { data: testAttempts } = await supabase
          .from("test_attempts")
          .select("*")
          .order("completed_at", { ascending: false });

        // Fetch lesson progress for non-test lessons
        const { data: lessonProgress } = await supabase
          .from("lesson_progress")
          .select("*")
          .eq("completed", true)
          .not("completed_at", "is", null)
          .order("completed_at", { ascending: false });

        // Get all lesson IDs
        const testLessonIds = testAttempts?.map((t) => t.lesson_id) || [];
        const progressLessonIds = lessonProgress?.map((p) => p.lesson_id) || [];
        const allLessonIds = [...new Set([...testLessonIds, ...progressLessonIds])];

        // Get all user IDs
        const testUserIds = testAttempts?.map((t) => t.user_id) || [];
        const progressUserIds = lessonProgress?.map((p) => p.user_id) || [];
        const allUserIds = [...new Set([...testUserIds, ...progressUserIds])];

        // Fetch lessons
        const { data: lessons } = await supabase
          .from("lessons")
          .select("id, title, course_id, type")
          .in("id", allLessonIds);

        // Fetch profiles from organization
        const { data: profiles } = await supabase
          .from("profiles")
          .select("user_id, full_name, email")
          .eq("organization_id", organizationId)
          .in("user_id", allUserIds);

        // Get course IDs from lessons
        const courseIds = lessons ? [...new Set(lessons.map((l) => l.course_id))] : [];
        
        // Fetch course details
        const { data: courseDetails } = await supabase
          .from("courses")
          .select("id, title")
          .eq("organization_id", organizationId)
          .in("id", courseIds);

        // Build maps
        const profileMap = new Map(profiles?.map((p) => [p.user_id, p]) || []);
        const lessonMap = new Map(lessons?.map((l) => [l.id, l]) || []);
        const courseMap = new Map(courseDetails?.map((c) => [c.id, c]) || []);

        const gradeRecords: GradeRecord[] = [];

        // Process test attempts
        for (const attempt of testAttempts || []) {
          const profile = profileMap.get(attempt.user_id);
          const lesson = lessonMap.get(attempt.lesson_id);
          
          if (!profile || !lesson) continue;
          
          const course = courseMap.get(lesson.course_id);
          if (!course) continue;

          const percentage = attempt.max_score > 0 
            ? Math.round((attempt.score / attempt.max_score) * 100) 
            : 0;

          gradeRecords.push({
            id: attempt.id,
            user_id: attempt.user_id,
            student_name: profile.full_name || profile.email || "Без имени",
            student_email: profile.email || "",
            course_id: lesson.course_id,
            course_title: course.title,
            lesson_id: attempt.lesson_id,
            lesson_title: lesson.title,
            lesson_type: lesson.type,
            completed_at: attempt.completed_at,
            score: attempt.score,
            max_score: attempt.max_score,
            passed: percentage >= 70,
            control_type: "test" });
        }

        // Process lesson progress (non-test lessons as completed assignments)
        const testLessonIdsSet = new Set(testLessonIds);
        for (const progress of lessonProgress || []) {
          // Skip if this is a test lesson (already processed above)
          if (testLessonIdsSet.has(progress.lesson_id)) continue;

          const profile = profileMap.get(progress.user_id);
          const lesson = lessonMap.get(progress.lesson_id);
          
          if (!profile || !lesson) continue;
          
          const course = courseMap.get(lesson.course_id);
          if (!course) continue;

          gradeRecords.push({
            id: progress.id,
            user_id: progress.user_id,
            student_name: profile.full_name || profile.email || "Без имени",
            student_email: profile.email || "",
            course_id: lesson.course_id,
            course_title: course.title,
            lesson_id: progress.lesson_id,
            lesson_title: lesson.title,
            lesson_type: lesson.type,
            completed_at: progress.completed_at!,
            score: null,
            max_score: null,
            passed: true,
            control_type: lesson.type === "test" ? "test" : "lesson" });
        }

        // Sort by date descending
        gradeRecords.sort((a, b) => 
          new Date(b.completed_at).getTime() - new Date(a.completed_at).getTime()
        );

        setRecords(gradeRecords);
      } catch (error) {
        console.error("Error fetching grades data:", error);
        toast.error("Ошибка при загрузке данных");
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [organizationId]);

  // Filter records
  const filteredRecords = useMemo(() => {
    return records.filter((record) => {
      // Search filter
      const searchLower = searchQuery.toLowerCase();
      const matchesSearch =
        !searchQuery ||
        record.student_name.toLowerCase().includes(searchLower) ||
        record.student_email.toLowerCase().includes(searchLower) ||
        record.course_title.toLowerCase().includes(searchLower) ||
        record.lesson_title.toLowerCase().includes(searchLower);

      // Course filter
      const matchesCourse =
        selectedCourse === "all" || record.course_id === selectedCourse;

      // Type filter
      const matchesType =
        selectedType === "all" || record.control_type === selectedType;

      // Date filter
      const recordDate = parseISO(record.completed_at);
      const matchesDate = isWithinInterval(recordDate, {
        start: dateRange.from,
        end: dateRange.to });

      return matchesSearch && matchesCourse && matchesType && matchesDate;
    });
  }, [records, searchQuery, selectedCourse, selectedType, dateRange]);

  // Statistics
  const stats = useMemo(() => {
    const uniqueStudents = new Set(filteredRecords.map((r) => r.user_id)).size;
    const testRecords = filteredRecords.filter((r) => r.control_type === "test");
    const totalTests = testRecords.length;
    const passedTests = testRecords.filter((r) => r.passed).length;
    const avgScore = testRecords.length > 0
      ? Math.round(
          testRecords.reduce((acc, r) => {
            if (r.score !== null && r.max_score !== null && r.max_score > 0) {
              return acc + (r.score / r.max_score) * 100;
            }
            return acc;
          }, 0) / testRecords.filter(r => r.max_score && r.max_score > 0).length
        ) || 0
      : 0;

    return { 
      uniqueStudents, 
      totalTests, 
      passedTests, 
      avgScore,
      totalRecords: filteredRecords.length 
    };
  }, [filteredRecords]);

  // Export to Excel
  const exportToExcel = async () => {
    if (filteredRecords.length === 0) {
      toast.error("Нет данных для экспорта");
      return;
    }

    const XLSX = await getXLSX();
    const exportData = filteredRecords.map((record) => ({
      "ФИО ученика": record.student_name,
      "Email": record.student_email,
      "Курс": record.course_title,
      "Модуль/Урок": record.lesson_title,
      "Тип контроля": record.control_type === "test" ? "Тест" : "Урок/Практика",
      "Балл": record.score !== null ? `${record.score}/${record.max_score}` : "—",
      "Процент": record.score !== null && record.max_score 
        ? `${Math.round((record.score / record.max_score) * 100)}%` 
        : "—",
      "Результат": record.passed ? "Зачёт" : "Незачёт",
      "Дата": format(parseISO(record.completed_at), "dd.MM.yyyy HH:mm", {
        locale: ru }) }));

    const worksheet = XLSX.utils.json_to_sheet(exportData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Успеваемость");

    // Auto-width columns
    const columnWidths = [
      { wch: 30 }, // ФИО
      { wch: 25 }, // Email
      { wch: 40 }, // Курс
      { wch: 40 }, // Модуль
      { wch: 15 }, // Тип
      { wch: 10 }, // Балл
      { wch: 10 }, // Процент
      { wch: 12 }, // Результат
      { wch: 18 }, // Дата
    ];
    worksheet["!cols"] = columnWidths;

    const fileName = `Журнал_успеваемости_${format(new Date(), "dd-MM-yyyy")}.xlsx`;
    XLSX.writeFile(workbook, fileName);
    toast.success("Журнал экспортирован в Excel");
  };

  const getScoreColor = (score: number | null, maxScore: number | null) => {
    if (score === null || maxScore === null || maxScore === 0) return "";
    const percentage = (score / maxScore) * 100;
    if (percentage >= 90) return "text-green-600 bg-green-500/10";
    if (percentage >= 70) return "text-blue-600 bg-blue-500/10";
    if (percentage >= 50) return "text-amber-600 bg-amber-500/10";
    return "text-red-600 bg-red-500/10";
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <SigmaSpinner size="lg" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={onClose} className="rounded-xl">
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div>
            <h2 className="text-xl font-semibold">Журнал текущего контроля успеваемости</h2>
            <p className="text-sm text-muted-foreground">
              Автоматический учёт оценок, тестов и практических заданий
            </p>
          </div>
        </div>
        <Button onClick={exportToExcel} className="rounded-xl">
          <FileSpreadsheet className="w-4 h-4 mr-2" />
          Экспорт в Excel
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-card rounded-xl border border-border p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center">
              <Users className="w-5 h-5 text-blue-500" />
            </div>
            <div>
              <p className="text-2xl font-bold">{stats.uniqueStudents}</p>
              <p className="text-xs text-muted-foreground">Учеников</p>
            </div>
          </div>
        </div>
        <div className="bg-card rounded-xl border border-border p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-purple-500/10 flex items-center justify-center">
              <GraduationCap className="w-5 h-5 text-purple-500" />
            </div>
            <div>
              <p className="text-2xl font-bold">{stats.totalTests}</p>
              <p className="text-xs text-muted-foreground">Тестов сдано</p>
            </div>
          </div>
        </div>
        <div className="bg-card rounded-xl border border-border p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-green-500/10 flex items-center justify-center">
              <CheckCircle className="w-5 h-5 text-green-500" />
            </div>
            <div>
              <p className="text-2xl font-bold">{stats.passedTests}</p>
              <p className="text-xs text-muted-foreground">Успешно сдано</p>
            </div>
          </div>
        </div>
        <div className="bg-card rounded-xl border border-border p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-amber-500/10 flex items-center justify-center">
              <TrendingUp className="w-5 h-5 text-amber-500" />
            </div>
            <div>
              <p className="text-2xl font-bold">{stats.avgScore}%</p>
              <p className="text-xs text-muted-foreground">Средний балл</p>
            </div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-card rounded-2xl border border-border p-4">
        <div className="flex flex-wrap items-center gap-4">
          {/* Search */}
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Поиск по ФИО, курсу, уроку..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 rounded-xl"
            />
          </div>

          {/* Course filter */}
          <Select value={selectedCourse} onValueChange={setSelectedCourse}>
            <SelectTrigger className="w-[200px] rounded-xl">
              <SelectValue placeholder="Все курсы" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Все курсы</SelectItem>
              {courses.map((course) => (
                <SelectItem key={course.id} value={course.id}>
                  {course.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Type filter */}
          <Select value={selectedType} onValueChange={setSelectedType}>
            <SelectTrigger className="w-[180px] rounded-xl">
              <SelectValue placeholder="Все типы" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Все типы</SelectItem>
              <SelectItem value="test">Тесты</SelectItem>
              <SelectItem value="lesson">Уроки</SelectItem>
            </SelectContent>
          </Select>

          {/* Date range */}
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className="rounded-xl gap-2">
                <CalendarIcon className="w-4 h-4" />
                {format(dateRange.from, "d MMM", { locale: ru })} —{" "}
                {format(dateRange.to, "d MMM yyyy", { locale: ru })}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="end">
              <Calendar
                mode="range"
                selected={{ from: dateRange.from, to: dateRange.to }}
                onSelect={(range) => {
                  if (range?.from && range?.to) {
                    setDateRange({ from: range.from, to: range.to });
                  } else if (range?.from) {
                    setDateRange({ from: range.from, to: range.from });
                  }
                }}
                locale={ru}
                numberOfMonths={2}
              />
            </PopoverContent>
          </Popover>

          {/* Quick filters */}
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              className="rounded-lg"
              onClick={() => {
                const now = new Date();
                setDateRange({
                  from: startOfMonth(now),
                  to: endOfMonth(now) });
              }}
            >
              Этот месяц
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="rounded-lg"
              onClick={() => {
                const now = new Date();
                const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
                setDateRange({
                  from: startOfMonth(lastMonth),
                  to: endOfMonth(lastMonth) });
              }}
            >
              Прошлый месяц
            </Button>
          </div>
        </div>
      </div>

      {/* Table */}
      {filteredRecords.length > 0 ? (
        <div className="bg-card rounded-2xl border border-border overflow-hidden">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Ученик</TableHead>
                  <TableHead>Курс</TableHead>
                  <TableHead>Модуль / Урок</TableHead>
                  <TableHead className="text-center">Тип</TableHead>
                  <TableHead className="text-center">Балл</TableHead>
                  <TableHead className="text-center">Результат</TableHead>
                  <TableHead className="text-center">Дата</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredRecords.slice(0, 100).map((record) => (
                  <TableRow key={`${record.id}-${record.control_type}`}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-sm font-semibold text-primary">
                          {record.student_name.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <p className="font-medium">{record.student_name}</p>
                          <p className="text-xs text-muted-foreground">
                            {record.student_email}
                          </p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className="text-sm">{record.course_title}</span>
                    </TableCell>
                    <TableCell>
                      <span className="text-sm">{record.lesson_title}</span>
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge
                        variant="outline"
                        className={cn(
                          "rounded-lg",
                          record.control_type === "test"
                            ? "border-purple-500/50 text-purple-600 bg-purple-500/10"
                            : "border-blue-500/50 text-blue-600 bg-blue-500/10"
                        )}
                      >
                        {record.control_type === "test" ? "Тест" : "Урок"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-center">
                      {record.score !== null && record.max_score !== null ? (
                        <span
                          className={cn(
                            "inline-flex items-center px-2 py-1 rounded-lg font-medium text-sm",
                            getScoreColor(record.score, record.max_score)
                          )}
                        >
                          {record.score}/{record.max_score}
                          <span className="ml-1 text-xs opacity-70">
                            ({Math.round((record.score / record.max_score) * 100)}%)
                          </span>
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-center">
                      {record.passed ? (
                        <div className="flex items-center justify-center gap-1 text-green-600">
                          <CheckCircle className="w-4 h-4" />
                          <span className="text-sm">Зачёт</span>
                        </div>
                      ) : (
                        <div className="flex items-center justify-center gap-1 text-red-600">
                          <XCircle className="w-4 h-4" />
                          <span className="text-sm">Незачёт</span>
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="text-center">
                      <span className="text-sm text-muted-foreground">
                        {format(parseISO(record.completed_at), "dd.MM.yyyy HH:mm", {
                          locale: ru })}
                      </span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          {filteredRecords.length > 100 && (
            <div className="p-4 text-center text-sm text-muted-foreground border-t border-border">
              Показано 100 из {filteredRecords.length} записей. Используйте фильтры для уточнения.
            </div>
          )}
        </div>
      ) : (
        <div className="bg-card rounded-2xl border border-border p-8 text-center">
          <Award className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
          <h3 className="font-semibold mb-2">Нет данных об успеваемости</h3>
          <p className="text-muted-foreground">
            {records.length === 0
              ? "Ученики ещё не проходили тесты и уроки"
              : "Нет записей, соответствующих фильтрам"}
          </p>
        </div>
      )}
    </div>
  );
}