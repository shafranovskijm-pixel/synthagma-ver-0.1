import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  ArrowLeft, Calendar as CalendarIcon, Search, Users,
  Award, FileSpreadsheet, CheckCircle, XCircle, TrendingUp, GraduationCap } from "lucide-react";
import { format, parseISO, startOfMonth, endOfMonth } from "date-fns";
import { ru } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { SigmaSpinner } from "@/components/ui/SigmaSpinner";
import { useAutoGradesJournal } from "@/hooks/useAutoGradesJournal";

interface AutoGradesJournalProps {
  organizationId: string;
  onClose: () => void;
}

export function AutoGradesJournal({ organizationId, onClose }: AutoGradesJournalProps) {
  const h = useAutoGradesJournal(organizationId);

  if (h.loading) {
    return <div className="flex items-center justify-center h-64"><SigmaSpinner size="lg" /></div>;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={onClose} className="rounded-xl"><ArrowLeft className="w-5 h-5" /></Button>
          <div>
            <h2 className="text-xl font-semibold">Журнал текущего контроля успеваемости</h2>
            <p className="text-sm text-muted-foreground">Автоматический учёт оценок, тестов и практических заданий</p>
          </div>
        </div>
        <Button onClick={h.exportToExcel} className="rounded-xl"><FileSpreadsheet className="w-4 h-4 mr-2" />Экспорт в Excel</Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { icon: Users, color: "blue", label: "Учеников", value: h.stats.uniqueStudents },
          { icon: GraduationCap, color: "purple", label: "Тестов сдано", value: h.stats.totalTests },
          { icon: CheckCircle, color: "green", label: "Успешно сдано", value: h.stats.passedTests },
          { icon: TrendingUp, color: "amber", label: "Средний балл", value: `${h.stats.avgScore}%` },
        ].map((s, i) => (
          <div key={i} className="bg-card rounded-xl border border-border p-4">
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-lg bg-${s.color}-500/10 flex items-center justify-center`}>
                <s.icon className={`w-5 h-5 text-${s.color}-500`} />
              </div>
              <div>
                <p className="text-2xl font-bold">{s.value}</p>
                <p className="text-xs text-muted-foreground">{s.label}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="bg-card rounded-2xl border border-border p-4">
        <div className="flex flex-wrap items-center gap-4">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input placeholder="Поиск по ФИО, курсу, уроку..." value={h.searchQuery} onChange={(e) => h.setSearchQuery(e.target.value)} className="pl-10 rounded-xl" />
          </div>
          <Select value={h.selectedCourse} onValueChange={h.setSelectedCourse}>
            <SelectTrigger className="w-[200px] rounded-xl"><SelectValue placeholder="Все курсы" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Все курсы</SelectItem>
              {h.courses.map(course => <SelectItem key={course.id} value={course.id}>{course.title}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={h.selectedType} onValueChange={h.setSelectedType}>
            <SelectTrigger className="w-[180px] rounded-xl"><SelectValue placeholder="Все типы" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Все типы</SelectItem>
              <SelectItem value="test">Тесты</SelectItem>
              <SelectItem value="lesson">Уроки</SelectItem>
            </SelectContent>
          </Select>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className="rounded-xl gap-2">
                <CalendarIcon className="w-4 h-4" />
                {format(h.dateRange.from, "d MMM", { locale: ru })} — {format(h.dateRange.to, "d MMM yyyy", { locale: ru })}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="end">
              <Calendar mode="range" selected={{ from: h.dateRange.from, to: h.dateRange.to }} onSelect={(range) => {
                if (range?.from && range?.to) h.setDateRange({ from: range.from, to: range.to });
                else if (range?.from) h.setDateRange({ from: range.from, to: range.from });
              }} locale={ru} numberOfMonths={2} />
            </PopoverContent>
          </Popover>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" className="rounded-lg" onClick={() => { const now = new Date(); h.setDateRange({ from: startOfMonth(now), to: endOfMonth(now) }); }}>Этот месяц</Button>
            <Button variant="outline" size="sm" className="rounded-lg" onClick={() => { const now = new Date(); const lm = new Date(now.getFullYear(), now.getMonth() - 1, 1); h.setDateRange({ from: startOfMonth(lm), to: endOfMonth(lm) }); }}>Прошлый месяц</Button>
          </div>
        </div>
      </div>

      {/* Table */}
      {h.filteredRecords.length > 0 ? (
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
                {h.filteredRecords.slice(0, 100).map(record => (
                  <TableRow key={`${record.id}-${record.control_type}`}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-sm font-semibold text-primary">{record.student_name.charAt(0).toUpperCase()}</div>
                        <div><p className="font-medium">{record.student_name}</p><p className="text-xs text-muted-foreground">{record.student_email}</p></div>
                      </div>
                    </TableCell>
                    <TableCell><span className="text-sm">{record.course_title}</span></TableCell>
                    <TableCell><span className="text-sm">{record.lesson_title}</span></TableCell>
                    <TableCell className="text-center">
                      <Badge variant="outline" className={cn("rounded-lg", record.control_type === "test" ? "border-purple-500/50 text-purple-600 bg-purple-500/10" : "border-blue-500/50 text-blue-600 bg-blue-500/10")}>
                        {record.control_type === "test" ? "Тест" : "Урок"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-center">
                      {record.score !== null && record.max_score !== null ? (
                        <span className={cn("inline-flex items-center px-2 py-1 rounded-lg font-medium text-sm", h.getScoreColor(record.score, record.max_score))}>
                          {record.score}/{record.max_score}<span className="ml-1 text-xs opacity-70">({Math.round((record.score / record.max_score) * 100)}%)</span>
                        </span>
                      ) : <span className="text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell className="text-center">
                      {record.passed ? (
                        <div className="flex items-center justify-center gap-1 text-green-600"><CheckCircle className="w-4 h-4" /><span className="text-sm">Зачёт</span></div>
                      ) : (
                        <div className="flex items-center justify-center gap-1 text-red-600"><XCircle className="w-4 h-4" /><span className="text-sm">Незачёт</span></div>
                      )}
                    </TableCell>
                    <TableCell className="text-center"><span className="text-sm text-muted-foreground">{format(parseISO(record.completed_at), "dd.MM.yyyy HH:mm", { locale: ru })}</span></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          {h.filteredRecords.length > 100 && (
            <div className="p-4 text-center text-sm text-muted-foreground border-t border-border">Показано 100 из {h.filteredRecords.length} записей. Используйте фильтры для уточнения.</div>
          )}
        </div>
      ) : (
        <div className="bg-card rounded-2xl border border-border p-8 text-center">
          <Award className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
          <h3 className="font-semibold mb-2">Нет данных об успеваемости</h3>
          <p className="text-muted-foreground">{h.records.length === 0 ? "Ученики ещё не проходили тесты и уроки" : "Нет записей, соответствующих фильтрам"}</p>
        </div>
      )}
    </div>
  );
}
