import { FileSpreadsheet, CheckCircle2, XCircle, BarChart3, Filter, X, Calendar, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { format } from "date-fns";
import { ru } from "date-fns/locale";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { SigmaSpinner } from "@/components/ui/SigmaSpinner";
import { useCourseTestReport, normalizeOption } from "@/hooks/useCourseTestReport";

interface CourseTestReportProps {
  courseId: string;
  courseName: string;
  organizationId: string;
}

export function CourseTestReport({ courseId, courseName, organizationId }: CourseTestReportProps) {
  const r = useCourseTestReport(courseId, courseName, organizationId);

  if (r.isLoading) {
    return <div className="flex items-center justify-center py-8"><SigmaSpinner /></div>;
  }

  if (r.testData.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 px-6">
        <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-emerald-500/20 to-emerald-500/5 flex items-center justify-center mb-4">
          <BarChart3 className="w-8 h-8 text-emerald-500" />
        </div>
        <h3 className="text-lg font-semibold mb-2">Результаты тестирования</h3>
        <p className="text-sm text-muted-foreground text-center max-w-md mb-6">
          Здесь появятся результаты после того, как ученики пройдут тесты.
        </p>
        <Button variant="outline" className="rounded-xl gap-2" onClick={() => window.location.href = `/course-builder/${courseId}`}>
          Перейти в конструктор
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="bg-secondary/20 rounded-xl p-3 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm font-medium"><Filter className="w-4 h-4" />Фильтры</div>
          {r.hasActiveFilters && (
            <Button variant="ghost" size="sm" onClick={r.clearFilters} className="h-7 text-xs gap-1"><X className="w-3 h-3" />Сбросить</Button>
          )}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
          <Select value={r.selectedStudent} onValueChange={r.setSelectedStudent}>
            <SelectTrigger className="h-9 bg-background"><SelectValue placeholder="Ученик" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Все ученики</SelectItem>
              {r.uniqueStudents.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={r.selectedTest} onValueChange={r.setSelectedTest}>
            <SelectTrigger className="h-9 bg-background"><SelectValue placeholder="Тест" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Все тесты</SelectItem>
              {r.uniqueTests.map(t => <SelectItem key={t.id} value={t.id}>{t.title}</SelectItem>)}
            </SelectContent>
          </Select>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className="h-9 justify-start text-left font-normal bg-background">
                <Calendar className="w-4 h-4 mr-2" />{r.dateFrom ? format(r.dateFrom, "dd.MM.yyyy", { locale: ru }) : "С даты"}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start"><CalendarComponent mode="single" selected={r.dateFrom} onSelect={r.setDateFrom} initialFocus /></PopoverContent>
          </Popover>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className="h-9 justify-start text-left font-normal bg-background">
                <Calendar className="w-4 h-4 mr-2" />{r.dateTo ? format(r.dateTo, "dd.MM.yyyy", { locale: ru }) : "По дату"}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start"><CalendarComponent mode="single" selected={r.dateTo} onSelect={r.setDateTo} initialFocus /></PopoverContent>
          </Popover>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-secondary/30 rounded-xl p-3 text-center"><div className="text-2xl font-bold">{r.stats.totalAttempts}</div><div className="text-xs text-muted-foreground">Попыток</div></div>
        <div className="bg-secondary/30 rounded-xl p-3 text-center"><div className="text-2xl font-bold">{r.stats.uniqueStudents}</div><div className="text-xs text-muted-foreground">Учеников</div></div>
        <div className="bg-sigma-green/10 rounded-xl p-3 text-center"><div className="text-2xl font-bold text-sigma-green">{r.stats.passedCount}</div><div className="text-xs text-muted-foreground">Сдали</div></div>
        <div className="bg-primary/10 rounded-xl p-3 text-center"><div className="text-2xl font-bold text-primary">{r.stats.averageScore}%</div><div className="text-xs text-muted-foreground">Средний балл</div></div>
      </div>

      {/* Export */}
      <div className="flex justify-end">
        <Button variant="outline" size="sm" className="rounded-lg gap-2" onClick={r.handleExport} disabled={r.filteredData.length === 0}>
          <FileSpreadsheet className="w-4 h-4" />Экспорт с вопросами ({r.filteredData.length})
        </Button>
      </div>

      {/* Results */}
      {r.filteredData.length === 0 ? (
        <div className="text-center py-6 text-muted-foreground"><p>Нет результатов по выбранным фильтрам</p></div>
      ) : (
        <div className="space-y-2 max-h-[400px] overflow-auto">
          {r.filteredData.map(attempt => {
            const isExpanded = r.expandedAttempts.has(attempt.id);
            const details = r.getAttemptQuestionDetails(attempt);
            const incorrectCount = details.filter(d => !d.isCorrect).length;
            return (
              <Collapsible key={attempt.id} open={isExpanded}>
                <div className={`rounded-xl ${attempt.score >= attempt.max_score * 0.7 ? "bg-sigma-green/10" : "bg-destructive/10"}`}>
                  <CollapsibleTrigger asChild>
                    <div className="flex items-center justify-between p-3 cursor-pointer hover:bg-black/5 transition-colors rounded-xl" onClick={() => r.toggleExpanded(attempt.id)}>
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <div className={`p-2 rounded-lg ${attempt.score >= attempt.max_score * 0.7 ? "bg-sigma-green/20 text-sigma-green" : "bg-destructive/20 text-destructive"}`}>
                          {attempt.score >= attempt.max_score * 0.7 ? <CheckCircle2 className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="font-medium truncate">{attempt.user_name}</div>
                          <div className="text-sm text-muted-foreground truncate">{attempt.lesson_title}</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-4 ml-3">
                        <div className="text-right">
                          <div className={`font-bold ${attempt.score >= attempt.max_score * 0.7 ? 'text-sigma-green' : 'text-destructive'}`}>{attempt.score}/{attempt.max_score}</div>
                          <div className="text-xs text-muted-foreground">
                            {incorrectCount > 0 && <span className="text-destructive">{incorrectCount} ошиб. </span>}
                            {new Date(attempt.completed_at).toLocaleDateString('ru-RU')}
                          </div>
                        </div>
                        {isExpanded ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
                      </div>
                    </div>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <div className="px-3 pb-3 space-y-2">
                      <div className="text-xs font-medium text-muted-foreground mb-2">Ответы на вопросы:</div>
                      {details.map((d, idx) => (
                        <div key={idx} className={`p-2 rounded-lg text-sm ${d.isCorrect ? 'bg-sigma-green/10' : 'bg-destructive/10'}`}>
                          <div className="flex items-start gap-2">
                            <span className={`font-medium ${d.isCorrect ? 'text-sigma-green' : 'text-destructive'}`}>{d.isCorrect ? '✓' : '✗'}</span>
                            <div className="flex-1 min-w-0">
                              <div className="font-medium mb-1 line-clamp-2" dangerouslySetInnerHTML={{ __html: d.questionText.length > 150 ? d.questionText.substring(0, 150) + '...' : d.questionText }} />
                              <div className="text-xs space-y-0.5">
                                <div><span className="text-muted-foreground">Ответ: </span><span className={d.isCorrect ? 'text-sigma-green' : 'text-destructive'}>{d.selectedAnswer >= 0 && d.options[d.selectedAnswer] ? normalizeOption(d.options[d.selectedAnswer]).replace(/<[^>]*>/g, '').substring(0, 100) : 'Нет ответа'}</span></div>
                                {!d.isCorrect && <div><span className="text-muted-foreground">Правильно: </span><span className="text-sigma-green">{normalizeOption(d.options[d.correctAnswer]).replace(/<[^>]*>/g, '').substring(0, 100)}</span></div>}
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CollapsibleContent>
                </div>
              </Collapsible>
            );
          })}
        </div>
      )}
    </div>
  );
}
