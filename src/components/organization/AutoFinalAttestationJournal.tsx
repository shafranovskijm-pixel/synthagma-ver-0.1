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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  ArrowLeft,
  Calendar as CalendarIcon,
  Search,
  Users,
  Award,
  FileSpreadsheet,
  CheckCircle,
  XCircle,
  Trophy,
  GraduationCap,
  Clock,
  Eye,
  CheckCircle2 } from "lucide-react";
import { format, parseISO, startOfMonth, endOfMonth, isWithinInterval } from "date-fns";
import { ru } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { getXLSX } from "@/utils/xlsxHelper";
import { Badge } from "@/components/ui/badge";
import { SigmaSpinner } from "@/components/ui/SigmaSpinner";

interface AttemptQuestion {
  id: string;
  question: string;
  options: (string | { text: string })[];
  correct_answer: number | null;
  explanation?: string | null;
}

interface AttemptDetails {
  answers: Record<string, number>;
  shown_question_ids: string[];
  questions: AttemptQuestion[];
  score: number;
  max_score: number;
  student_name: string;
  course_title: string;
}

interface FinalAttestationRecord {
  id: string;
  user_id: string;
  student_name: string;
  student_email: string;
  course_id: string;
  course_title: string;
  enrollment_status: string;
  started_at: string;
  completed_at: string | null;
  progress: number;
  final_test_score: number | null;
  final_test_max_score: number | null;
  final_test_passed: boolean;
  final_test_date: string | null;
  total_time_spent: number;
  test_attempt_id: string | null;
}

interface Course {
  id: string;
  title: string;
}

interface AutoFinalAttestationJournalProps {
  organizationId: string;
  onClose: () => void;
}

export function AutoFinalAttestationJournal({
  organizationId,
  onClose }: AutoFinalAttestationJournalProps) {
  const [loading, setLoading] = useState(true);
  const [records, setRecords] = useState<FinalAttestationRecord[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCourse, setSelectedCourse] = useState<string>("all");
  const [selectedStatus, setSelectedStatus] = useState<string>("all");
  const [dateRange, setDateRange] = useState<{
    from: Date;
    to: Date;
  }>({
    from: startOfMonth(new Date()),
    to: endOfMonth(new Date()) });
  const [attemptDetails, setAttemptDetails] = useState<AttemptDetails | null>(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);

  const handleViewAttempt = async (record: FinalAttestationRecord) => {
    if (!record.test_attempt_id) return;
    setDetailsLoading(true);
    setDetailsOpen(true);
    try {
      const { data: attempt } = await supabase
        .from("test_attempts")
        .select("id, answers, shown_question_ids, score, max_score")
        .eq("id", record.test_attempt_id)
        .single();

      if (!attempt) throw new Error("Attempt not found");

      const shownIds = (attempt.shown_question_ids as string[]) || [];
      const { data: questions } = await supabase
        .from("test_questions")
        .select("id, question, options, correct_answer, explanation")
        .in("id", shownIds);

      setAttemptDetails({
        answers: (attempt.answers as Record<string, number>) || {},
        shown_question_ids: shownIds,
        questions: (questions || []) as AttemptQuestion[],
        score: attempt.score,
        max_score: attempt.max_score,
        student_name: record.student_name,
        course_title: record.course_title });
    } catch (err) {
      console.error("Error loading attempt details:", err);
      toast.error("Ошибка при загрузке деталей теста");
      setDetailsOpen(false);
    } finally {
      setDetailsLoading(false);
    }
  };


  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        // Fetch courses for organization
        const { data: coursesData } = await supabase
          .from("courses")
          .select("id, title")
          .eq("organization_id", organizationId)
          .order("title");

        if (coursesData) {
          setCourses(coursesData);
        }

        const courseIds = coursesData?.map((c) => c.id) || [];
        if (courseIds.length === 0) {
          setRecords([]);
          setLoading(false);
          return;
        }

        // Fetch enrollments for organization's courses
        const { data: enrollments } = await supabase
          .from("enrollments")
          .select("*")
          .in("course_id", courseIds)
          .order("started_at", { ascending: false });

        if (!enrollments || enrollments.length === 0) {
          setRecords([]);
          setLoading(false);
          return;
        }

        // Get user IDs from enrollments
        const userIds = [...new Set(enrollments.map((e) => e.user_id))];

        // Fetch profiles
        const { data: profiles } = await supabase
          .from("profiles")
          .select("user_id, full_name, email")
          .eq("organization_id", organizationId)
          .in("user_id", userIds);

        // Fetch lessons to find final tests (last test in each course)
        const { data: lessons } = await supabase
          .from("lessons")
          .select("id, course_id, title, type, order_index")
          .in("course_id", courseIds)
          .eq("type", "test")
          .order("order_index", { ascending: false });

        // Get the last test for each course (final test)
        const finalTestMap = new Map<string, string>();
        const processedCourses = new Set<string>();
        for (const lesson of lessons || []) {
          if (!processedCourses.has(lesson.course_id)) {
            finalTestMap.set(lesson.course_id, lesson.id);
            processedCourses.add(lesson.course_id);
          }
        }

        // Fetch test attempts for final tests
        const finalTestIds = Array.from(finalTestMap.values());
        const { data: testAttempts } = await supabase
          .from("test_attempts")
          .select("*")
          .in("lesson_id", finalTestIds)
          .in("user_id", userIds);

        // Build maps
        const profileMap = new Map(profiles?.map((p) => [p.user_id, p]) || []);
        const courseMap = new Map(coursesData?.map((c) => [c.id, c]) || []);
        
        // Map test attempts by user_id + lesson_id, keeping only the best attempt
        const bestAttemptMap = new Map<string, typeof testAttempts[0]>();
        for (const attempt of testAttempts || []) {
          const key = `${attempt.user_id}_${attempt.lesson_id}`;
          const existing = bestAttemptMap.get(key);
          if (!existing || attempt.score > existing.score) {
            bestAttemptMap.set(key, attempt);
          }
        }

        // Build records
        const attestationRecords: FinalAttestationRecord[] = [];

        for (const enrollment of enrollments) {
          const profile = profileMap.get(enrollment.user_id);
          const course = courseMap.get(enrollment.course_id);
          
          if (!profile || !course) continue;

          const finalTestId = finalTestMap.get(enrollment.course_id);
          const attemptKey = finalTestId ? `${enrollment.user_id}_${finalTestId}` : null;
          const finalAttempt = attemptKey ? bestAttemptMap.get(attemptKey) : null;

          let finalTestPassed = false;
          if (finalAttempt && finalAttempt.max_score > 0) {
            const percentage = (finalAttempt.score / finalAttempt.max_score) * 100;
            finalTestPassed = percentage >= 70;
          }

          attestationRecords.push({
            id: enrollment.id,
            user_id: enrollment.user_id,
            student_name: profile.full_name || profile.email || "Без имени",
            student_email: profile.email || "",
            course_id: enrollment.course_id,
            course_title: course.title,
            enrollment_status: enrollment.status,
            started_at: enrollment.started_at,
            completed_at: enrollment.completed_at,
            progress: enrollment.progress || 0,
            final_test_score: finalAttempt?.score ?? null,
            final_test_max_score: finalAttempt?.max_score ?? null,
            final_test_passed: finalTestPassed,
            final_test_date: finalAttempt?.completed_at ?? null,
            total_time_spent: enrollment.time_spent || 0,
            test_attempt_id: finalAttempt?.id ?? null });
        }

        setRecords(attestationRecords);
      } catch (error) {
        console.error("Error fetching attestation data:", error);
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
        record.course_title.toLowerCase().includes(searchLower);

      // Course filter
      const matchesCourse =
        selectedCourse === "all" || record.course_id === selectedCourse;

      // Status filter
      let matchesStatus = true;
      if (selectedStatus === "completed") {
        matchesStatus = record.enrollment_status === "completed";
      } else if (selectedStatus === "in_progress") {
        matchesStatus = record.enrollment_status === "in_progress";
      } else if (selectedStatus === "passed") {
        matchesStatus = record.final_test_passed;
      } else if (selectedStatus === "failed") {
        matchesStatus = record.final_test_score !== null && !record.final_test_passed;
      }

      // Date filter (by completion or start date)
      const recordDate = record.completed_at 
        ? parseISO(record.completed_at) 
        : parseISO(record.started_at);
      const matchesDate = isWithinInterval(recordDate, {
        start: dateRange.from,
        end: dateRange.to });

      return matchesSearch && matchesCourse && matchesStatus && matchesDate;
    });
  }, [records, searchQuery, selectedCourse, selectedStatus, dateRange]);

  // Statistics
  const stats = useMemo(() => {
    const uniqueStudents = new Set(filteredRecords.map((r) => r.user_id)).size;
    const completed = filteredRecords.filter((r) => r.enrollment_status === "completed").length;
    const withFinalTest = filteredRecords.filter((r) => r.final_test_score !== null).length;
    const passedFinal = filteredRecords.filter((r) => r.final_test_passed).length;
    const avgScore = withFinalTest > 0
      ? Math.round(
          filteredRecords
            .filter((r) => r.final_test_score !== null && r.final_test_max_score)
            .reduce((acc, r) => acc + ((r.final_test_score! / r.final_test_max_score!) * 100), 0) 
          / withFinalTest
        )
      : 0;

    return { uniqueStudents, completed, withFinalTest, passedFinal, avgScore };
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
      "Статус": record.enrollment_status === "completed" ? "Завершён" : "В процессе",
      "Прогресс (%)": record.progress,
      "Дата начала": format(parseISO(record.started_at), "dd.MM.yyyy", { locale: ru }),
      "Дата завершения": record.completed_at 
        ? format(parseISO(record.completed_at), "dd.MM.yyyy", { locale: ru }) 
        : "—",
      "Итоговый тест (балл)": record.final_test_score !== null 
        ? `${record.final_test_score}/${record.final_test_max_score}` 
        : "Не сдан",
      "Процент": record.final_test_score !== null && record.final_test_max_score
        ? `${Math.round((record.final_test_score / record.final_test_max_score) * 100)}%`
        : "—",
      "Результат аттестации": record.final_test_score === null 
        ? "Ожидается" 
        : record.final_test_passed 
          ? "ЗАЧЁТ" 
          : "НЕЗАЧЁТ",
      "Дата итоговой аттестации": record.final_test_date 
        ? format(parseISO(record.final_test_date), "dd.MM.yyyy HH:mm", { locale: ru }) 
        : "—",
      "Время обучения (мин)": Math.round(record.total_time_spent / 60) }));

    const worksheet = XLSX.utils.json_to_sheet(exportData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Итоговая аттестация");

    // Auto-width columns
    const columnWidths = [
      { wch: 30 }, // ФИО
      { wch: 25 }, // Email
      { wch: 40 }, // Курс
      { wch: 15 }, // Статус
      { wch: 10 }, // Прогресс
      { wch: 12 }, // Дата начала
      { wch: 15 }, // Дата завершения
      { wch: 18 }, // Балл
      { wch: 10 }, // Процент
      { wch: 20 }, // Результат
      { wch: 22 }, // Дата аттестации
      { wch: 18 }, // Время
    ];
    worksheet["!cols"] = columnWidths;

    const fileName = `Журнал_итоговой_аттестации_${format(new Date(), "dd-MM-yyyy")}.xlsx`;
    XLSX.writeFile(workbook, fileName);
    toast.success("Журнал экспортирован в Excel");
  };

  const formatTime = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    if (hours > 0) return `${hours}ч ${minutes}м`;
    return `${minutes}м`;
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
            <h2 className="text-xl font-semibold">Журнал итоговой аттестации</h2>
            <p className="text-sm text-muted-foreground">
              Результаты финальных тестов и завершения курсов
            </p>
          </div>
        </div>
        <Button onClick={exportToExcel} className="rounded-xl">
          <FileSpreadsheet className="w-4 h-4 mr-2" />
          Экспорт в Excel
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
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
              <p className="text-2xl font-bold">{stats.completed}</p>
              <p className="text-xs text-muted-foreground">Завершили курс</p>
            </div>
          </div>
        </div>
        <div className="bg-card rounded-xl border border-border p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-amber-500/10 flex items-center justify-center">
              <Award className="w-5 h-5 text-amber-500" />
            </div>
            <div>
              <p className="text-2xl font-bold">{stats.withFinalTest}</p>
              <p className="text-xs text-muted-foreground">Сдали итоговый</p>
            </div>
          </div>
        </div>
        <div className="bg-card rounded-xl border border-border p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-green-500/10 flex items-center justify-center">
              <Trophy className="w-5 h-5 text-green-500" />
            </div>
            <div>
              <p className="text-2xl font-bold">{stats.passedFinal}</p>
              <p className="text-xs text-muted-foreground">Аттестовано</p>
            </div>
          </div>
        </div>
        <div className="bg-card rounded-xl border border-border p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-indigo-500/10 flex items-center justify-center">
              <CheckCircle className="w-5 h-5 text-indigo-500" />
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
              placeholder="Поиск по ФИО, курсу..."
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

          {/* Status filter */}
          <Select value={selectedStatus} onValueChange={setSelectedStatus}>
            <SelectTrigger className="w-[180px] rounded-xl">
              <SelectValue placeholder="Все статусы" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Все статусы</SelectItem>
              <SelectItem value="completed">Завершили курс</SelectItem>
              <SelectItem value="in_progress">В процессе</SelectItem>
              <SelectItem value="passed">Аттестованы</SelectItem>
              <SelectItem value="failed">Не аттестованы</SelectItem>
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
                  <TableHead className="text-center">Прогресс</TableHead>
                  <TableHead className="text-center">Итоговый тест</TableHead>
                  <TableHead className="text-center">Результат</TableHead>
                  <TableHead className="text-center">Дата аттестации</TableHead>
                  <TableHead className="text-center">Время</TableHead>
                  <TableHead className="text-center w-[60px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredRecords.slice(0, 100).map((record) => (
                  <TableRow key={record.id}>
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
                      <div>
                        <span className="text-sm">{record.course_title}</span>
                        <div className="flex items-center gap-1 mt-0.5">
                          <Badge
                            variant="outline"
                            className={cn(
                              "text-xs rounded",
                              record.enrollment_status === "completed"
                                ? "border-green-500/50 text-green-600 bg-green-500/10"
                                : "border-amber-500/50 text-amber-600 bg-amber-500/10"
                            )}
                          >
                            {record.enrollment_status === "completed" ? "Завершён" : "В процессе"}
                          </Badge>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-center">
                      <div className="flex items-center justify-center gap-2">
                        <div className="w-16 h-2 rounded-full bg-secondary overflow-hidden">
                          <div
                            className={cn(
                              "h-full rounded-full",
                              record.progress >= 100 ? "bg-green-500" : "bg-primary"
                            )}
                            style={{ width: `${Math.min(record.progress, 100)}%` }}
                          />
                        </div>
                        <span className="text-sm font-medium">{record.progress}%</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-center">
                      {record.final_test_score !== null && record.final_test_max_score !== null ? (
                        <span
                          className={cn(
                            "inline-flex items-center px-2 py-1 rounded-lg font-medium text-sm",
                            getScoreColor(record.final_test_score, record.final_test_max_score)
                          )}
                        >
                          {record.final_test_score}/{record.final_test_max_score}
                          <span className="ml-1 text-xs opacity-70">
                            ({Math.round((record.final_test_score / record.final_test_max_score) * 100)}%)
                          </span>
                        </span>
                      ) : (
                        <span className="text-muted-foreground text-sm">Не сдан</span>
                      )}
                    </TableCell>
                    <TableCell className="text-center">
                      {record.final_test_score === null ? (
                        <div className="flex items-center justify-center gap-1 text-muted-foreground">
                          <Clock className="w-4 h-4" />
                          <span className="text-sm">Ожидается</span>
                        </div>
                      ) : record.final_test_passed ? (
                        <div className="flex items-center justify-center gap-1 text-green-600">
                          <CheckCircle className="w-4 h-4" />
                          <span className="text-sm font-medium">ЗАЧЁТ</span>
                        </div>
                      ) : (
                        <div className="flex items-center justify-center gap-1 text-red-600">
                          <XCircle className="w-4 h-4" />
                          <span className="text-sm font-medium">НЕЗАЧЁТ</span>
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="text-center">
                      <span className="text-sm text-muted-foreground">
                        {record.final_test_date
                          ? format(parseISO(record.final_test_date), "dd.MM.yyyy", { locale: ru })
                          : "—"}
                      </span>
                    </TableCell>
                    <TableCell className="text-center">
                      <span className="text-sm text-muted-foreground">
                        {formatTime(record.total_time_spent)}
                      </span>
                    </TableCell>
                    <TableCell className="text-center">
                      {record.test_attempt_id ? (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => handleViewAttempt(record)}
                          title="Просмотр ответов"
                        >
                          <Eye className="w-4 h-4" />
                        </Button>
                      ) : null}
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
          <h3 className="font-semibold mb-2">Нет данных об аттестации</h3>
          <p className="text-muted-foreground">
            {records.length === 0
              ? "Нет записей об обучении учеников"
              : "Нет записей, соответствующих фильтрам"}
          </p>
        </div>
      )}

      {/* Test attempt details dialog */}
      <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Детали тестирования</DialogTitle>
            {attemptDetails && (
              <p className="text-sm text-muted-foreground">
                {attemptDetails.student_name} · {attemptDetails.course_title} · Результат: {attemptDetails.score}/{attemptDetails.max_score} ({attemptDetails.max_score > 0 ? Math.round((attemptDetails.score / attemptDetails.max_score) * 100) : 0}%)
              </p>
            )}
          </DialogHeader>
          <div className="flex-1 min-h-0 overflow-y-auto space-y-3 pr-1">
            {detailsLoading ? (
              <div className="flex items-center justify-center py-12">
                <SigmaSpinner />
              </div>
            ) : attemptDetails ? (
              attemptDetails.shown_question_ids
                .map((qId) => attemptDetails.questions.find((q) => q.id === qId))
                .filter(Boolean)
                .map((q, idx) => {
                  const question = q!;
                  const studentAnswer = attemptDetails.answers[question.id];
                  const isCorrect = studentAnswer === question.correct_answer;
                  return (
                    <div key={question.id} className="rounded-lg border border-border p-3 space-y-2">
                      <div className="text-sm font-medium">
                        {idx + 1}. {question.question}
                      </div>
                      <div className="space-y-1">
                        {question.options.map((opt, optIdx) => {
                          const optText = typeof opt === "object" && opt !== null ? (opt as { text: string }).text : String(opt);
                          const isStudentChoice = studentAnswer === optIdx;
                          const isCorrectOption = question.correct_answer === optIdx;
                          let bg = "";
                          if (isStudentChoice && isCorrect) bg = "bg-green-500/10 border-green-500/30 text-green-700";
                          else if (isStudentChoice && !isCorrect) bg = "bg-destructive/10 border-destructive/30 text-destructive";
                          else if (isCorrectOption) bg = "bg-green-500/5 border-green-500/20 text-green-600";

                          return (
                            <div key={optIdx} className={`text-sm px-3 py-1.5 rounded-md border ${bg || "border-transparent"}`}>
                              {isStudentChoice && isCorrect && <CheckCircle2 className="w-3.5 h-3.5 inline mr-1.5" />}
                              {isStudentChoice && !isCorrect && <XCircle className="w-3.5 h-3.5 inline mr-1.5" />}
                              {!isStudentChoice && isCorrectOption && <CheckCircle2 className="w-3.5 h-3.5 inline mr-1.5 opacity-50" />}
                              {optText}
                            </div>
                          );
                        })}
                      </div>
                      {question.explanation && (
                        <div className="text-xs text-muted-foreground bg-muted/50 p-2 rounded">
                          💡 {question.explanation}
                        </div>
                      )}
                    </div>
                  );
                })
            ) : null}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
