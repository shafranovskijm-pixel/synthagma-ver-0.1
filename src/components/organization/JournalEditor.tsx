import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ArrowLeft, Plus, Calendar as CalendarIcon, Check, X, Minus, Users, Trash2 } from "lucide-react";
import { format, startOfWeek } from "date-fns";
import { ru } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { useJournalEditor } from "@/hooks/useJournalEditor";
import { SigmaSpinner } from "@/components/ui/SigmaSpinner";

interface JournalEditorProps { organizationId: string; journalType: string; journalTitle: string; onClose: () => void; }

const ATTENDANCE_VALUES = [
  { value: "present", label: "Присутствует", icon: Check, color: "text-green-500 bg-green-500/10" },
  { value: "absent", label: "Отсутствует", icon: X, color: "text-red-500 bg-red-500/10" },
  { value: "late", label: "Опоздание", icon: Minus, color: "text-amber-500 bg-amber-500/10" },
  { value: "excused", label: "Ув. причина", icon: Check, color: "text-blue-500 bg-blue-500/10" },
];
const GRADE_VALUES = ["5", "4", "3", "2", "н/а", "зачёт", "незачёт"];

export function JournalEditor(props: JournalEditorProps) {
  const {
    loading, saving, students, courses, selectedCourse, setSelectedCourse,
    journalInstance, dates, weekStart, setWeekStart,
    showCreateDialog, setShowCreateDialog, showDeleteDialog, setShowDeleteDialog,
    newJournalTitle, setNewJournalTitle, existingJournals, selectedJournalId, setSelectedJournalId,
    createJournal, updateEntry, getEntryValue, deleteJournal, isAttendanceJournal, addDays
  } = useJournalEditor(props);

  if (loading && existingJournals.length === 0) return <div className="flex items-center justify-center h-64"><SigmaSpinner size="lg" /></div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4"><Button variant="ghost" size="icon" onClick={props.onClose} className="rounded-xl"><ArrowLeft className="w-5 h-5" /></Button><div><h2 className="text-xl font-semibold">{props.journalTitle}</h2><p className="text-sm text-muted-foreground">Онлайн ведение журнала</p></div></div>
        <Button variant="outline" className="rounded-xl" onClick={() => setShowCreateDialog(true)}><Plus className="w-4 h-4 mr-2" />Новый журнал</Button>
      </div>

      {existingJournals.length > 0 ? (
        <div className="flex items-center gap-4 flex-wrap">
          <Select value={selectedJournalId} onValueChange={setSelectedJournalId}><SelectTrigger className="w-[300px] rounded-xl"><SelectValue placeholder="Выберите журнал" /></SelectTrigger><SelectContent>{existingJournals.map(j => <SelectItem key={j.id} value={j.id}>{j.title}</SelectItem>)}</SelectContent></Select>
          {journalInstance && (
            <>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" className="rounded-lg" onClick={() => setWeekStart(addDays(weekStart, -7))}>← Пред.</Button>
                <Popover>
                  <PopoverTrigger asChild><Button variant="outline" size="sm" className="rounded-lg"><CalendarIcon className="w-4 h-4 mr-2" />{format(weekStart, "d MMM", { locale: ru })} — {format(addDays(weekStart, 6), "d MMM yyyy", { locale: ru })}</Button></PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start"><Calendar mode="single" selected={weekStart} onSelect={d => d && setWeekStart(startOfWeek(d, { locale: ru, weekStartsOn: 1 }))} locale={ru} /></PopoverContent>
                </Popover>
                <Button variant="outline" size="sm" className="rounded-lg" onClick={() => setWeekStart(addDays(weekStart, 7))}>След. →</Button>
              </div>
              <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive rounded-xl" onClick={() => setShowDeleteDialog(true)}><Trash2 className="w-4 h-4" /></Button>
            </>
          )}
        </div>
      ) : (
        <div className="bg-card rounded-2xl border border-border p-8 text-center"><Users className="w-12 h-12 mx-auto text-muted-foreground mb-4" /><h3 className="font-semibold mb-2">Нет журналов</h3><Button onClick={() => setShowCreateDialog(true)} className="rounded-xl"><Plus className="w-4 h-4 mr-2" />Создать журнал</Button></div>
      )}

      {journalInstance && students.length > 0 && (
        <div className="bg-card rounded-2xl border border-border overflow-hidden"><div className="overflow-x-auto"><Table>
          <TableHeader><TableRow><TableHead className="min-w-[200px] sticky left-0 bg-card z-10">Ученик</TableHead>{dates.map(d => <TableHead key={d.toISOString()} className="text-center min-w-[60px]"><div className="text-xs text-muted-foreground">{format(d, "EEE", { locale: ru })}</div><div>{format(d, "d", { locale: ru })}</div></TableHead>)}</TableRow></TableHeader>
          <TableBody>{students.map(s => (
            <TableRow key={s.user_id}>
              <TableCell className="font-medium sticky left-0 bg-card z-10"><div className="flex items-center gap-2"><div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-sm font-semibold text-primary">{s.full_name.charAt(0).toUpperCase()}</div><span className="truncate max-w-[150px]">{s.full_name}</span></div></TableCell>
              {dates.map(d => {
                const val = getEntryValue(s.user_id, d);
                return (
                  <TableCell key={d.toISOString()} className="text-center p-1">
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant="ghost" size="sm" className={cn("w-10 h-10 p-0 rounded-lg", isAttendanceJournal ? ATTENDANCE_VALUES.find(v => v.value === val)?.color : (val && "font-semibold"))}>
                          {isAttendanceJournal ? (ATTENDANCE_VALUES.find(v => v.value === val)?.icon ? <Check className="w-4 h-4" /> : <span className="text-muted-foreground">—</span>) : (val || "—")}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-2" align="center">
                        <div className={cn("gap-1", isAttendanceJournal ? "flex flex-col" : "grid grid-cols-4")}>
                          {isAttendanceJournal ? ATTENDANCE_VALUES.map(o => <Button key={o.value} variant="ghost" size="sm" className={cn("justify-start gap-2", o.color)} onClick={() => updateEntry(s.user_id, d, o.value)}><o.icon className="w-4 h-4" />{o.label}</Button>) : GRADE_VALUES.map(g => <Button key={g} variant="ghost" size="sm" onClick={() => updateEntry(s.user_id, d, g)}>{g}</Button>)}
                          <Button variant="ghost" size="sm" className="text-muted-foreground justify-start" onClick={() => updateEntry(s.user_id, d, "")}>{isAttendanceJournal ? <><Minus className="w-4 h-4 mr-2" />Очистить</> : "×"}</Button>
                        </div>
                      </PopoverContent>
                    </Popover>
                  </TableCell>
                );
              })}
            </TableRow>
          ))}</TableBody>
        </Table></div></div>
      )}

      {journalInstance && students.length === 0 && <div className="bg-card rounded-2xl border border-border p-8 text-center"><Users className="w-12 h-12 mx-auto text-muted-foreground mb-4" /><h3 className="font-semibold mb-2">Нет учеников</h3><p className="text-muted-foreground">{journalInstance.course_id ? "На курс ещё никто не записан" : "В организации нет учеников"}</p></div>}

      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="sm:max-w-md"><DialogHeader><DialogTitle>Создать журнал</DialogTitle></DialogHeader><div className="space-y-4 py-4"><div className="space-y-2"><label className="text-sm font-medium">Название</label><Input value={newJournalTitle} onChange={e => setNewJournalTitle(e.target.value)} placeholder="Название" className="rounded-xl" /></div><div className="space-y-2"><label className="text-sm font-medium">Курс</label><Select value={selectedCourse} onValueChange={setSelectedCourse}><SelectTrigger className="rounded-xl"><SelectValue placeholder="Все ученики" /></SelectTrigger><SelectContent><SelectItem value="all">Все ученики</SelectItem>{courses.map(c => <SelectItem key={c.id} value={c.id}>{c.title}</SelectItem>)}</SelectContent></Select></div></div><div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setShowCreateDialog(false)} className="rounded-xl">Отмена</Button><Button onClick={createJournal} disabled={saving} className="rounded-xl">{saving && <SigmaSpinner size="sm" className="mr-2" />}Создать</Button></div></DialogContent>
      </Dialog>

      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Удалить журнал?</AlertDialogTitle><AlertDialogDescription>Вы уверены? Это действие нельзя отменить.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Отмена</AlertDialogCancel><AlertDialogAction onClick={deleteJournal} className="bg-destructive hover:bg-destructive/90">Удалить</AlertDialogAction></AlertDialogFooter></AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
