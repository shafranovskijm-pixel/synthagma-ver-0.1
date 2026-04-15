import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  Download,
  Search,
  Clock,
  BookOpen,
  Users,
  Calendar,
  CheckCircle2 } from "lucide-react";
import { format } from "date-fns";
import { ru } from "date-fns/locale";
import { getXLSX } from "@/utils/xlsxHelper";
import { SigmaSpinner } from "@/components/ui/SigmaSpinner";

interface Course {
  id: string;
  title: string;
}

interface EnrollmentWithProgress {
  id: string;
  user_id: string;
  user_name: string;
  course_id: string;
  course_title: string;
  progress: number;
  status: string;
  started_at: string;
  completed_at: string | null;
  time_spent: number;
}

interface ClassJournalExportProps {
  organizationId: string;
}

export function ClassJournalExport({ organizationId }: ClassJournalExportProps) {
  const [courses, setCourses] = useState<Course[]>([]);
  const [enrollments, setEnrollments] = useState<EnrollmentWithProgress[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedCourseId, setSelectedCourseId] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    if (organizationId) {
      loadData();
    }
  }, [organizationId]);

  const loadData = async () => {
    setIsLoading(true);
    try {
      // Load courses
      const { data: coursesData } = await supabase
        .from("courses")
        .select("id, title")
        .eq("organization_id", organizationId)
        .order("title");

      setCourses(coursesData || []);

      // Load enrollments with profile data
      const courseIds = (coursesData || []).map(c => c.id);
      if (courseIds.length === 0) {
        setEnrollments([]);
        setIsLoading(false);
        return;
      }

      const { data: enrollmentsData } = await supabase
        .from("enrollments")
        .select(`
          id,
          user_id,
          course_id,
          progress,
          status,
          started_at,
          completed_at,
          time_spent,
          courses!inner(title)
        `)
        .in("course_id", courseIds);

      if (enrollmentsData) {
        // Get user names
        const userIds = [...new Set(enrollmentsData.map(e => e.user_id))];
        const { data: profiles } = await supabase
          .from("profiles")
          .select("user_id, full_name")
          .in("user_id", userIds);

        const profileMap = new Map(profiles?.map(p => [p.user_id, p.full_name || "Без имени"]) || []);

        const enrichedEnrollments: EnrollmentWithProgress[] = enrollmentsData.map(e => ({
          id: e.id,
          user_id: e.user_id,
          user_name: profileMap.get(e.user_id) || "Без имени",
          course_id: e.course_id,
          course_title: (e.courses as { title: string }).title,
          progress: e.progress,
          status: e.status,
          started_at: e.started_at,
          completed_at: e.completed_at,
          time_spent: e.time_spent }));

        setEnrollments(enrichedEnrollments);
      }
    } catch (error) {
      console.error("Error loading data:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const formatDuration = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    if (hours > 0) return `${hours} ч ${minutes} мин`;
    return `${minutes} мин`;
  };

  const filteredEnrollments = enrollments.filter(e => {
    const matchesCourse = selectedCourseId === "all" || e.course_id === selectedCourseId;
    const matchesSearch = 
      e.user_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      e.course_title.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCourse && matchesSearch;
  });

  const handleExport = async () => {
    const XLSX = await getXLSX();
    const exportData = filteredEnrollments.map((e, index) => ({
      "№": index + 1,
      "ФИО": e.user_name,
      "Курс": e.course_title,
      "Прогресс (%)": e.progress,
      "Статус": e.status === "completed" ? "Завершён" : e.status === "active" ? "В процессе" : e.status,
      "Дата начала": format(new Date(e.started_at), "dd.MM.yyyy", { locale: ru }),
      "Дата завершения": e.completed_at ? format(new Date(e.completed_at), "dd.MM.yyyy", { locale: ru }) : "-",
      "Время изучения": formatDuration(e.time_spent),
      "Время изучения (мин)": Math.round(e.time_spent / 60) }));

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Журнал занятий");
    XLSX.writeFile(wb, `class_journal_${format(new Date(), "yyyy-MM-dd")}.xlsx`);
    toast.success("Журнал занятий выгружен");
  };

  const stats = {
    total: filteredEnrollments.length,
    completed: filteredEnrollments.filter(e => e.status === "completed").length,
    avgProgress: filteredEnrollments.length > 0
      ? Math.round(filteredEnrollments.reduce((sum, e) => sum + e.progress, 0) / filteredEnrollments.length)
      : 0,
    totalTime: filteredEnrollments.reduce((sum, e) => sum + e.time_spent, 0) };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">Журнал занятий</h2>
          <p className="text-sm text-muted-foreground">
            Время прохождения и изучения курсов
          </p>
        </div>
        <Button
          variant="outline"
          className="rounded-xl gap-2"
          onClick={handleExport}
          disabled={filteredEnrollments.length === 0}
        >
          <Download className="w-4 h-4" />
          Выгрузить в Excel
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        <div className="bg-card rounded-xl border border-border p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <Users className="w-5 h-5 text-primary" />
            </div>
            <div>
              <div className="text-2xl font-bold">{stats.total}</div>
              <div className="text-xs text-muted-foreground">Всего записей</div>
            </div>
          </div>
        </div>
        <div className="bg-card rounded-xl border border-border p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-green-500/10 flex items-center justify-center">
              <CheckCircle2 className="w-5 h-5 text-green-500" />
            </div>
            <div>
              <div className="text-2xl font-bold">{stats.completed}</div>
              <div className="text-xs text-muted-foreground">Завершили</div>
            </div>
          </div>
        </div>
        <div className="bg-card rounded-xl border border-border p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center">
              <BookOpen className="w-5 h-5 text-blue-500" />
            </div>
            <div>
              <div className="text-2xl font-bold">{stats.avgProgress}%</div>
              <div className="text-xs text-muted-foreground">Ср. прогресс</div>
            </div>
          </div>
        </div>
        <div className="bg-card rounded-xl border border-border p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-orange-500/10 flex items-center justify-center">
              <Clock className="w-5 h-5 text-orange-500" />
            </div>
            <div>
              <div className="text-2xl font-bold">{formatDuration(stats.totalTime)}</div>
              <div className="text-xs text-muted-foreground">Общее время</div>
            </div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-4">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Поиск по ФИО или курсу..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10 rounded-xl"
          />
        </div>
        <Select value={selectedCourseId} onValueChange={setSelectedCourseId}>
          <SelectTrigger className="w-64 rounded-xl">
            <SelectValue placeholder="Все курсы" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Все курсы</SelectItem>
            {courses.map(course => (
              <SelectItem key={course.id} value={course.id}>
                {course.title}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <SigmaSpinner size="lg" />
        </div>
      ) : filteredEnrollments.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground bg-card rounded-2xl border border-border">
          <BookOpen className="w-12 h-12 mx-auto mb-3 opacity-50" />
          <p>Нет данных для отображения</p>
        </div>
      ) : (
        <div className="bg-card rounded-2xl border border-border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-muted/50">
                <tr>
                  <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">ФИО</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">Курс</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">Прогресс</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">Статус</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">Начало</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">Завершение</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">Время изучения</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filteredEnrollments.map((e) => (
                  <tr key={e.id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3 text-sm font-medium">{e.user_name}</td>
                    <td className="px-4 py-3 text-sm">{e.course_title}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-16 h-2 rounded-full bg-muted overflow-hidden">
                          <div
                            className="h-full bg-primary rounded-full"
                            style={{ width: `${Math.min(e.progress, 100)}%` }}
                          />
                        </div>
                        <span className="text-sm">{Math.min(e.progress, 100)}%</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {e.status === "completed" ? (
                        <span className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full bg-green-500/10 text-green-600">
                          <CheckCircle2 className="w-3 h-3" />
                          Завершён
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full bg-blue-500/10 text-blue-600">
                          <Clock className="w-3 h-3" />
                          В процессе
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-muted-foreground">
                      {format(new Date(e.started_at), "dd.MM.yyyy", { locale: ru })}
                    </td>
                    <td className="px-4 py-3 text-sm text-muted-foreground">
                      {e.completed_at
                        ? format(new Date(e.completed_at), "dd.MM.yyyy", { locale: ru })
                        : "-"}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <div className="flex items-center gap-1">
                        <Clock className="w-4 h-4 text-muted-foreground" />
                        {formatDuration(e.time_spent)}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}