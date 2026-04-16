import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ArrowLeft, Calendar as CalendarIcon, Search, Users, Award, FileSpreadsheet, CheckCircle, XCircle, Trophy, GraduationCap, Clock, Eye, CheckCircle2 } from "lucide-react";
import { format, parseISO } from "date-fns";
import { ru } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { SigmaSpinner } from "@/components/ui/SigmaSpinner";
import { useAutoFinalAttestation } from "@/hooks/useAutoFinalAttestation";

interface AutoFinalAttestationJournalProps { organizationId: string; onClose: () => void; }

export function AutoFinalAttestationJournal({ organizationId, onClose }: AutoFinalAttestationJournalProps) {
  const h = useAutoFinalAttestation(organizationId);

  if (h.loading) return <div className="flex items-center justify-center h-64"><SigmaSpinner size="lg" /></div>;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={onClose} className="rounded-xl"><ArrowLeft className="w-5 h-5" /></Button>
          <div><h2 className="text-xl font-semibold">Журнал итоговой аттестации</h2><p className="text-sm text-muted-foreground">Результаты финальных тестов и завершения курсов</p></div>
        </div>
        <Button onClick={h.exportToExcel} className="rounded-xl"><FileSpreadsheet className="w-4 h-4 mr-2" />Экспорт в Excel</Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {[
          { icon: Users, color: "blue", label: "Учеников", value: h.stats.uniqueStudents },
          { icon: GraduationCap, color: "purple", label: "Завершили курс", value: h.stats.completed },
          { icon: Award, color: "amber", label: "Сдали итоговый", value: h.stats.withFinalTest },
          { icon: Trophy, color: "green", label: "Аттестовано", value: h.stats.passedFinal },
          { icon: CheckCircle, color: "indigo", label: "Средний балл", value: `${h.stats.avgScore}%` },
        ].map((s, i) => (
          <div key={i} className="bg-card rounded-xl border border-border p-4"><div className="flex items-center gap-3"><div className={`w-10 h-10 rounded-lg bg-${s.color}-500/10 flex items-center justify-center`}><s.icon className={`w-5 h-5 text-${s.color}-500`} /></div><div><p className="text-2xl font-bold">{s.value}</p><p className="text-xs text-muted-foreground">{s.label}</p></div></div></div>
        ))}
      </div>

      {/* Filters */}
      <div className="bg-card rounded-2xl border border-border p-4">
        <div className="flex flex-wrap items-center gap-4">
          <div className="relative flex-1 min-w-[200px]"><Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" /><Input placeholder="Поиск по ФИО, курсу..." value={h.searchQuery} onChange={(e) => h.setSearchQuery(e.target.value)} className="pl-10 rounded-xl" /></div>
          <Select value={h.selectedCourse} onValueChange={h.setSelectedCourse}><SelectTrigger className="w-[200px] rounded-xl"><SelectValue placeholder="Все курсы" /></SelectTrigger><SelectContent><SelectItem value="all">Все курсы</SelectItem>{h.courses.map(c => <SelectItem key={c.id} value={c.id}>{c.title}</SelectItem>)}</SelectContent></Select>
          <Select value={h.selectedStatus} onValueChange={h.setSelectedStatus}><SelectTrigger className="w-[180px] rounded-xl"><SelectValue placeholder="Все статусы" /></SelectTrigger><SelectContent><SelectItem value="all">Все статусы</SelectItem><SelectItem value="completed">Завершили курс</SelectItem><SelectItem value="in_progress">В процессе</SelectItem><SelectItem value="passed">Аттестованы</SelectItem><SelectItem value="failed">Не аттестованы</SelectItem></SelectContent></Select>
          <Popover><PopoverTrigger asChild><Button variant="outline" className="rounded-xl gap-2"><CalendarIcon className="w-4 h-4" />{format(h.dateRange.from, "d MMM", { locale: ru })} — {format(h.dateRange.to, "d MMM yyyy", { locale: ru })}</Button></PopoverTrigger><PopoverContent className="w-auto p-0" align="end"><Calendar mode="range" selected={{ from: h.dateRange.from, to: h.dateRange.to }} onSelect={(range) => { if (range?.from && range?.to) h.setDateRange({ from: range.from, to: range.to }); else if (range?.from) h.setDateRange({ from: range.from, to: range.from }); }} locale={ru} numberOfMonths={2} /></PopoverContent></Popover>
        </div>
      </div>

      {/* Table */}
      {h.filteredRecords.length > 0 ? (
        <div className="bg-card rounded-2xl border border-border overflow-hidden"><div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Ученик</TableHead><TableHead>Курс</TableHead><TableHead className="text-center">Прогресс</TableHead><TableHead className="text-center">Итоговый тест</TableHead><TableHead className="text-center">Результат</TableHead><TableHead className="text-center">Дата аттестации</TableHead><TableHead className="text-center">Время</TableHead><TableHead className="text-center w-[60px]"></TableHead></TableRow></TableHeader>
        <TableBody>{h.filteredRecords.slice(0, 100).map(r => (
          <TableRow key={r.id}>
            <TableCell><div className="flex items-center gap-2"><div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-sm font-semibold text-primary">{r.student_name.charAt(0).toUpperCase()}</div><div><p className="font-medium">{r.student_name}</p><p className="text-xs text-muted-foreground">{r.student_email}</p></div></div></TableCell>
            <TableCell><div><span className="text-sm">{r.course_title}</span><div className="flex items-center gap-1 mt-0.5"><Badge variant="outline" className={cn("text-xs rounded", r.enrollment_status === "completed" ? "border-green-500/50 text-green-600 bg-green-500/10" : "border-amber-500/50 text-amber-600 bg-amber-500/10")}>{r.enrollment_status === "completed" ? "Завершён" : "В процессе"}</Badge></div></div></TableCell>
            <TableCell className="text-center"><div className="flex items-center justify-center gap-2"><div className="w-16 h-2 rounded-full bg-secondary overflow-hidden"><div className={cn("h-full rounded-full", r.progress >= 100 ? "bg-green-500" : "bg-primary")} style={{ width: `${Math.min(r.progress, 100)}%` }} /></div><span className="text-sm font-medium">{r.progress}%</span></div></TableCell>
            <TableCell className="text-center">{r.final_test_score !== null && r.final_test_max_score !== null ? <span className={cn("inline-flex items-center px-2 py-1 rounded-lg font-medium text-sm", h.getScoreColor(r.final_test_score, r.final_test_max_score))}>{r.final_test_score}/{r.final_test_max_score}<span className="ml-1 text-xs opacity-70">({Math.round((r.final_test_score / r.final_test_max_score) * 100)}%)</span></span> : <span className="text-muted-foreground text-sm">Не сдан</span>}</TableCell>
            <TableCell className="text-center">{r.final_test_score === null ? <div className="flex items-center justify-center gap-1 text-muted-foreground"><Clock className="w-4 h-4" /><span className="text-sm">Ожидается</span></div> : r.final_test_passed ? <div className="flex items-center justify-center gap-1 text-green-600"><CheckCircle className="w-4 h-4" /><span className="text-sm font-medium">ЗАЧЁТ</span></div> : <div className="flex items-center justify-center gap-1 text-red-600"><XCircle className="w-4 h-4" /><span className="text-sm font-medium">НЕЗАЧЁТ</span></div>}</TableCell>
            <TableCell className="text-center"><span className="text-sm text-muted-foreground">{r.final_test_date ? format(parseISO(r.final_test_date), "dd.MM.yyyy", { locale: ru }) : "—"}</span></TableCell>
            <TableCell className="text-center"><span className="text-sm text-muted-foreground">{h.formatTime(r.total_time_spent)}</span></TableCell>
            <TableCell className="text-center">{r.test_attempt_id ? <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => h.handleViewAttempt(r)} title="Просмотр ответов"><Eye className="w-4 h-4" /></Button> : null}</TableCell>
          </TableRow>
        ))}</TableBody></Table></div>
        {h.filteredRecords.length > 100 && <div className="p-4 text-center text-sm text-muted-foreground border-t border-border">Показано 100 из {h.filteredRecords.length} записей</div>}
        </div>
      ) : (
        <div className="bg-card rounded-2xl border border-border p-8 text-center"><Award className="w-12 h-12 mx-auto text-muted-foreground mb-4" /><h3 className="font-semibold mb-2">Нет данных об аттестации</h3><p className="text-muted-foreground">{h.records.length === 0 ? "Нет записей об обучении" : "Нет записей по фильтрам"}</p></div>
      )}

      {/* Test attempt details dialog */}
      <Dialog open={h.detailsOpen} onOpenChange={h.setDetailsOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col"><DialogHeader><DialogTitle>Детали тестирования</DialogTitle>{h.attemptDetails && <p className="text-sm text-muted-foreground">{h.attemptDetails.student_name} · {h.attemptDetails.course_title} · {h.attemptDetails.score}/{h.attemptDetails.max_score} ({h.attemptDetails.max_score > 0 ? Math.round((h.attemptDetails.score / h.attemptDetails.max_score) * 100) : 0}%)</p>}</DialogHeader>
        <div className="flex-1 min-h-0 overflow-y-auto space-y-3 pr-1">
          {h.detailsLoading ? <div className="flex items-center justify-center py-12"><SigmaSpinner /></div> : h.attemptDetails ? h.attemptDetails.shown_question_ids.map(qId => h.attemptDetails!.questions.find(q => q.id === qId)).filter(Boolean).map((q, idx) => {
            const question = q!;
            const studentAnswer = h.attemptDetails!.answers[question.id];
            const isCorrect = studentAnswer === question.correct_answer;
            return (
              <div key={question.id} className="rounded-lg border border-border p-3 space-y-2">
                <div className="text-sm font-medium">{idx + 1}. {question.question}</div>
                <div className="space-y-1">{question.options.map((opt, optIdx) => {
                  const optText = typeof opt === "object" && opt !== null ? (opt as { text: string }).text : String(opt);
                  const isSC = studentAnswer === optIdx; const isCA = question.correct_answer === optIdx;
                  let bg = "";
                  if (isSC && isCorrect) bg = "bg-green-500/10 border-green-500/30 text-green-700";
                  else if (isSC && !isCorrect) bg = "bg-destructive/10 border-destructive/30 text-destructive";
                  else if (isCA) bg = "bg-green-500/5 border-green-500/20 text-green-600";
                  return <div key={optIdx} className={`text-sm px-3 py-1.5 rounded-md border ${bg || "border-transparent"}`}>{isSC && isCorrect && <CheckCircle2 className="w-3.5 h-3.5 inline mr-1.5" />}{isSC && !isCorrect && <XCircle className="w-3.5 h-3.5 inline mr-1.5" />}{!isSC && isCA && <CheckCircle2 className="w-3.5 h-3.5 inline mr-1.5 opacity-50" />}{optText}</div>;
                })}</div>
                {question.explanation && <div className="text-xs text-muted-foreground bg-muted/50 p-2 rounded">💡 {question.explanation}</div>}
              </div>
            );
          }) : null}
        </div></DialogContent>
      </Dialog>
    </div>
  );
}
