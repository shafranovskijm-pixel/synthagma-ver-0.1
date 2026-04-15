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
  Check,
  Search,
  Users,
  Download,
  BookOpen,
  Clock,
  Filter,
  FileSpreadsheet } from "lucide-react";
import { format, parseISO, startOfMonth, endOfMonth, isWithinInterval } from "date-fns";
import { ru } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { getXLSX } from "@/utils/xlsxHelper";

interface AttendanceRecord {
  id: string;
  user_id: string;
  student_name: string;
  student_email: string;
  course_id: string;
  course_title: string;
  lesson_id: string;
  lesson_title: string;
  completed_at: string;
  time_spent: number;
}

interface Course {
  id: string;
  title: string;
}

interface AutoAttendanceJournalProps {
  organizationId: string;
  onClose: () => void;
}

export function AutoAttendanceJournal({
  organizationId,
  onClose }: AutoAttendanceJournalProps) {
  const [loading, setLoading] = useState(true);
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCourse, setSelectedCourse] = useState<string>("all");
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

        // Fetch lesson progress with all related data
        const { data: lessonProgress } = await supabase
          .from("lesson_progress")
          .select(`
            id,
            user_id,
            lesson_id,
            completed,
            completed_at,
            time_spent
          `)
          .eq("completed", true)
          .not("completed_at", "is", null)
          .order("completed_at", { ascending: false });

        if (!lessonProgress || lessonProgress.length === 0) {
          setRecords([]);
          setLoading(false);
          return;
        }

        // Get unique user_ids and lesson_ids
        const userIds = [...new Set(lessonProgress.map((p) => p.user_id))];
        const lessonIds = [...new Set(lessonProgress.map((p) => p.lesson_id))];

        // Fetch profiles for users in organization
        const { data: profiles } = await supabase
          .from("profiles")
          .select("user_id, full_name, email")
          .eq("organization_id", organizationId)
          .in("user_id", userIds);

        // Fetch lessons with course info
        const { data: lessons } = await supabase
          .from("lessons")
          .select("id, title, course_id")
          .in("id", lessonIds);

        // Fetch course titles
        const courseIds = lessons ? [...new Set(lessons.map((l) => l.course_id))] : [];
        const { data: courseDetails } = await supabase
          .from("courses")
          .select("id, title")
          .eq("organization_id", organizationId)
          .in("id", courseIds);

        // Build records
        const profileMap = new Map(profiles?.map((p) => [p.user_id, p]) || []);
        const lessonMap = new Map(lessons?.map((l) => [l.id, l]) || []);
        const courseMap = new Map(courseDetails?.map((c) => [c.id, c]) || []);

        const attendanceRecords: AttendanceRecord[] = [];

        for (const progress of lessonProgress) {
          const profile = profileMap.get(progress.user_id);
          const lesson = lessonMap.get(progress.lesson_id);
          
          if (!profile || !lesson) continue;
          
          const course = courseMap.get(lesson.course_id);
          if (!course) continue;

          attendanceRecords.push({
            id: progress.id,
            user_id: progress.user_id,
            student_name: profile.full_name || profile.email || "Без имени",
            student_email: profile.email || "",
            course_id: lesson.course_id,
            course_title: course.title,
            lesson_id: progress.lesson_id,
            lesson_title: lesson.title,
            completed_at: progress.completed_at!,
            time_spent: progress.time_spent || 0 });
        }

        setRecords(attendanceRecords);
      } catch (error) {
        console.error("Error fetching attendance data:", error);
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

      // Date filter
      const recordDate = parseISO(record.completed_at);
      const matchesDate = isWithinInterval(recordDate, {
        start: dateRange.from,
        end: dateRange.to });

      return matchesSearch && matchesCourse && matchesDate;
    });
  }, [records, searchQuery, selectedCourse, dateRange]);

  // Statistics
  const stats = useMemo(() => {
    const uniqueStudents = new Set(filteredRecords.map((r) => r.user_id)).size;
    const uniqueCourses = new Set(filteredRecords.map((r) => r.course_id)).size;
    const totalLessons = filteredRecords.length;
    const totalTimeMinutes = Math.round(
      filteredRecords.reduce((acc, r) => acc + r.time_spent, 0) / 60
    );

    return { uniqueStudents, uniqueCourses, totalLessons, totalTimeMinutes };
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
      "Урок": record.lesson_title,
      "Дата посещения": format(parseISO(record.completed_at), "dd.MM.yyyy HH:mm", {
        locale: ru }),
      "Время (мин)": Math.round(record.time_spent / 60) }));

    const worksheet = XLSX.utils.json_to_sheet(exportData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Посещаемость");

    // Auto-width columns
    const columnWidths = [
      { wch: 30 }, // ФИО
      { wch: 25 }, // Email
      { wch: 40 }, // Курс
      { wch: 40 }, // Урок
      { wch: 20 }, // Дата
      { wch: 12 }, // Время
    ];
    worksheet["!cols"] = columnWidths;

    const fileName = `Журнал_посещаемости_${format(new Date(), "dd-MM-yyyy")}.xlsx`;
    XLSX.writeFile(workbook, fileName);
    toast.success("Журнал экспортирован в Excel");
  };

  const formatTime = (seconds: number) => {
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes} мин`;
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    return `${hours}ч ${remainingMinutes}мин`;
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
            <h2 className="text-xl font-semibold">Журнал учёта посещаемости занятий</h2>
            <p className="text-sm text-muted-foreground">
              Автоматический учёт всех посещений уроков учениками
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
            <div className="w-10 h-10 rounded-lg bg-green-500/10 flex items-center justify-center">
              <BookOpen className="w-5 h-5 text-green-500" />
            </div>
            <div>
              <p className="text-2xl font-bold">{stats.uniqueCourses}</p>
              <p className="text-xs text-muted-foreground">Курсов</p>
            </div>
          </div>
        </div>
        <div className="bg-card rounded-xl border border-border p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-purple-500/10 flex items-center justify-center">
              <Check className="w-5 h-5 text-purple-500" />
            </div>
            <div>
              <p className="text-2xl font-bold">{stats.totalLessons}</p>
              <p className="text-xs text-muted-foreground">Уроков пройдено</p>
            </div>
          </div>
        </div>
        <div className="bg-card rounded-xl border border-border p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-amber-500/10 flex items-center justify-center">
              <Clock className="w-5 h-5 text-amber-500" />
            </div>
            <div>
              <p className="text-2xl font-bold">{stats.totalTimeMinutes}</p>
              <p className="text-xs text-muted-foreground">Минут обучения</p>
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
            <SelectTrigger className="w-[250px] rounded-xl">
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
                  <TableHead>Урок</TableHead>
                  <TableHead className="text-center">Дата посещения</TableHead>
                  <TableHead className="text-center">Время</TableHead>
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
                      <span className="text-sm">{record.course_title}</span>
                    </TableCell>
                    <TableCell>
                      <span className="text-sm">{record.lesson_title}</span>
                    </TableCell>
                    <TableCell className="text-center">
                      <div className="flex items-center justify-center gap-1.5">
                        <div className="w-2 h-2 rounded-full bg-green-500" />
                        <span className="text-sm">
                          {format(parseISO(record.completed_at), "dd.MM.yyyy HH:mm", {
                            locale: ru })}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="text-center">
                      <span className="text-sm text-muted-foreground">
                        {formatTime(record.time_spent)}
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
          <Users className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
          <h3 className="font-semibold mb-2">Нет данных о посещаемости</h3>
          <p className="text-muted-foreground">
            {records.length === 0
              ? "Ученики ещё не проходили уроки"
              : "Нет записей, соответствующих фильтрам"}
          </p>
        </div>
      )}
    </div>
  );
}