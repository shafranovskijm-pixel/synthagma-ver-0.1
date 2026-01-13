import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  ArrowLeft,
  Save,
  Plus,
  Calendar as CalendarIcon,
  Check,
  X,
  Minus,
  Users,
  Loader2,
  Download,
  Trash2,
} from "lucide-react";
import { format, addDays, startOfWeek, parseISO } from "date-fns";
import { ru } from "date-fns/locale";
import { cn } from "@/lib/utils";

interface Student {
  id: string;
  user_id: string;
  full_name: string;
  email: string;
}

interface Course {
  id: string;
  title: string;
}

interface JournalEntry {
  id?: string;
  user_id: string;
  entry_date: string;
  value: string;
  notes?: string;
}

interface JournalInstance {
  id: string;
  organization_id: string;
  course_id: string | null;
  journal_type: string;
  title: string;
  created_at: string;
}

interface JournalEditorProps {
  organizationId: string;
  journalType: string;
  journalTitle: string;
  onClose: () => void;
}

const ATTENDANCE_VALUES = [
  { value: "present", label: "Присутствует", icon: Check, color: "text-green-500 bg-green-500/10" },
  { value: "absent", label: "Отсутствует", icon: X, color: "text-red-500 bg-red-500/10" },
  { value: "late", label: "Опоздание", icon: Minus, color: "text-amber-500 bg-amber-500/10" },
  { value: "excused", label: "Ув. причина", icon: Check, color: "text-blue-500 bg-blue-500/10" },
];

const GRADE_VALUES = ["5", "4", "3", "2", "н/а", "зачёт", "незачёт"];

export function JournalEditor({
  organizationId,
  journalType,
  journalTitle,
  onClose,
}: JournalEditorProps) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [students, setStudents] = useState<Student[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [selectedCourse, setSelectedCourse] = useState<string>("");
  const [journalInstance, setJournalInstance] = useState<JournalInstance | null>(null);
  const [entries, setEntries] = useState<Map<string, JournalEntry>>(new Map());
  const [dates, setDates] = useState<Date[]>([]);
  const [weekStart, setWeekStart] = useState<Date>(startOfWeek(new Date(), { locale: ru, weekStartsOn: 1 }));
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [newJournalTitle, setNewJournalTitle] = useState(journalTitle);
  const [existingJournals, setExistingJournals] = useState<JournalInstance[]>([]);
  const [selectedJournalId, setSelectedJournalId] = useState<string>("");

  // Generate week dates
  useEffect(() => {
    const weekDates: Date[] = [];
    for (let i = 0; i < 7; i++) {
      weekDates.push(addDays(weekStart, i));
    }
    setDates(weekDates);
  }, [weekStart]);

  // Fetch courses and existing journals
  useEffect(() => {
    const fetchData = async () => {
      try {
        const [coursesRes, journalsRes] = await Promise.all([
          supabase
            .from("courses")
            .select("id, title")
            .eq("organization_id", organizationId)
            .order("title"),
          supabase
            .from("journal_instances")
            .select("*")
            .eq("organization_id", organizationId)
            .eq("journal_type", journalType)
            .order("created_at", { ascending: false }),
        ]);

        if (coursesRes.data) {
          setCourses(coursesRes.data);
        }

        if (journalsRes.data) {
          setExistingJournals(journalsRes.data as JournalInstance[]);
          if (journalsRes.data.length > 0) {
            setSelectedJournalId(journalsRes.data[0].id);
          }
        }
      } catch (error) {
        console.error("Error fetching data:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [organizationId, journalType]);

  // Fetch journal instance and students when journal is selected
  useEffect(() => {
    const fetchJournalData = async () => {
      if (!selectedJournalId) return;

      setLoading(true);
      try {
        // Get journal instance
        const { data: journal } = await supabase
          .from("journal_instances")
          .select("*")
          .eq("id", selectedJournalId)
          .single();

        if (journal) {
          setJournalInstance(journal as JournalInstance);

          // Fetch students enrolled in the course
          if (journal.course_id) {
            const { data: enrollments } = await supabase
              .from("enrollments")
              .select("user_id")
              .eq("course_id", journal.course_id);

            if (enrollments && enrollments.length > 0) {
              const userIds = enrollments.map((e) => e.user_id);
              const { data: profiles } = await supabase
                .from("profiles")
                .select("id, user_id, full_name, email")
                .in("user_id", userIds);

              if (profiles) {
                setStudents(
                  profiles.map((p) => ({
                    id: p.id,
                    user_id: p.user_id,
                    full_name: p.full_name || p.email || "Без имени",
                    email: p.email || "",
                  }))
                );
              }
            }
          } else {
            // Fetch all students from organization
            const { data: profiles } = await supabase
              .from("profiles")
              .select("id, user_id, full_name, email")
              .eq("organization_id", organizationId);

            if (profiles) {
              setStudents(
                profiles.map((p) => ({
                  id: p.id,
                  user_id: p.user_id,
                  full_name: p.full_name || p.email || "Без имени",
                  email: p.email || "",
                }))
              );
            }
          }

          // Fetch existing entries
          const { data: journalEntries } = await supabase
            .from("journal_entries")
            .select("*")
            .eq("journal_id", selectedJournalId);

          if (journalEntries) {
            const entriesMap = new Map<string, JournalEntry>();
            journalEntries.forEach((entry) => {
              const key = `${entry.user_id}_${entry.entry_date}`;
              entriesMap.set(key, {
                id: entry.id,
                user_id: entry.user_id,
                entry_date: entry.entry_date,
                value: entry.value || "",
                notes: entry.notes || "",
              });
            });
            setEntries(entriesMap);
          }
        }
      } catch (error) {
        console.error("Error fetching journal data:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchJournalData();
  }, [selectedJournalId, organizationId]);

  const createJournal = async () => {
    if (!newJournalTitle.trim()) {
      toast.error("Введите название журнала");
      return;
    }

    setSaving(true);
    try {
      const { data, error } = await supabase
        .from("journal_instances")
        .insert({
          organization_id: organizationId,
          course_id: selectedCourse || null,
          journal_type: journalType,
          title: newJournalTitle,
        })
        .select()
        .single();

      if (error) throw error;

      setExistingJournals((prev) => [data as JournalInstance, ...prev]);
      setSelectedJournalId(data.id);
      setShowCreateDialog(false);
      toast.success("Журнал создан");
    } catch (error) {
      console.error("Error creating journal:", error);
      toast.error("Ошибка при создании журнала");
    } finally {
      setSaving(false);
    }
  };

  const updateEntry = async (userId: string, date: Date, value: string) => {
    if (!journalInstance) return;

    const dateStr = format(date, "yyyy-MM-dd");
    const key = `${userId}_${dateStr}`;
    const existingEntry = entries.get(key);

    try {
      if (existingEntry?.id) {
        // Update existing entry
        const { error } = await supabase
          .from("journal_entries")
          .update({ value, updated_at: new Date().toISOString() })
          .eq("id", existingEntry.id);

        if (error) throw error;
      } else {
        // Create new entry
        const { data, error } = await supabase
          .from("journal_entries")
          .insert({
            journal_id: journalInstance.id,
            user_id: userId,
            entry_date: dateStr,
            entry_type: journalType === "attendance" ? "attendance" : "grade",
            value,
          })
          .select()
          .single();

        if (error) throw error;

        setEntries((prev) => {
          const newMap = new Map(prev);
          newMap.set(key, {
            id: data.id,
            user_id: userId,
            entry_date: dateStr,
            value,
          });
          return newMap;
        });
        return;
      }

      setEntries((prev) => {
        const newMap = new Map(prev);
        newMap.set(key, { ...existingEntry, value });
        return newMap;
      });
    } catch (error) {
      console.error("Error updating entry:", error);
      toast.error("Ошибка при сохранении");
    }
  };

  const getEntryValue = (userId: string, date: Date): string => {
    const key = `${userId}_${format(date, "yyyy-MM-dd")}`;
    return entries.get(key)?.value || "";
  };

  const renderAttendanceCell = (userId: string, date: Date) => {
    const value = getEntryValue(userId, date);
    const currentValue = ATTENDANCE_VALUES.find((v) => v.value === value);

    return (
      <Popover>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className={cn(
              "w-10 h-10 p-0 rounded-lg",
              currentValue?.color
            )}
          >
            {currentValue ? (
              <currentValue.icon className="w-4 h-4" />
            ) : (
              <span className="text-muted-foreground">—</span>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-2" align="center">
          <div className="flex flex-col gap-1">
            {ATTENDANCE_VALUES.map((option) => (
              <Button
                key={option.value}
                variant="ghost"
                size="sm"
                className={cn("justify-start gap-2", option.color)}
                onClick={() => updateEntry(userId, date, option.value)}
              >
                <option.icon className="w-4 h-4" />
                {option.label}
              </Button>
            ))}
            <Button
              variant="ghost"
              size="sm"
              className="justify-start gap-2 text-muted-foreground"
              onClick={() => updateEntry(userId, date, "")}
            >
              <Minus className="w-4 h-4" />
              Очистить
            </Button>
          </div>
        </PopoverContent>
      </Popover>
    );
  };

  const renderGradeCell = (userId: string, date: Date) => {
    const value = getEntryValue(userId, date);

    return (
      <Popover>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className={cn(
              "w-10 h-10 p-0 rounded-lg font-semibold",
              value === "5" && "text-green-500 bg-green-500/10",
              value === "4" && "text-blue-500 bg-blue-500/10",
              value === "3" && "text-amber-500 bg-amber-500/10",
              value === "2" && "text-red-500 bg-red-500/10",
              value === "зачёт" && "text-green-500 bg-green-500/10",
              value === "незачёт" && "text-red-500 bg-red-500/10"
            )}
          >
            {value || "—"}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-2" align="center">
          <div className="grid grid-cols-4 gap-1">
            {GRADE_VALUES.map((grade) => (
              <Button
                key={grade}
                variant="ghost"
                size="sm"
                onClick={() => updateEntry(userId, date, grade)}
              >
                {grade}
              </Button>
            ))}
            <Button
              variant="ghost"
              size="sm"
              className="text-muted-foreground"
              onClick={() => updateEntry(userId, date, "")}
            >
              ×
            </Button>
          </div>
        </PopoverContent>
      </Popover>
    );
  };

  const deleteJournal = async () => {
    if (!journalInstance) return;

    if (!confirm("Удалить журнал и все записи?")) return;

    try {
      const { error } = await supabase
        .from("journal_instances")
        .delete()
        .eq("id", journalInstance.id);

      if (error) throw error;

      setExistingJournals((prev) => prev.filter((j) => j.id !== journalInstance.id));
      setSelectedJournalId(existingJournals[1]?.id || "");
      setJournalInstance(null);
      toast.success("Журнал удалён");
    } catch (error) {
      console.error("Error deleting journal:", error);
      toast.error("Ошибка при удалении");
    }
  };

  const isAttendanceJournal = journalType === "attendance" || journalType === "entry_control";

  if (loading && existingJournals.length === 0) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
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
            <h2 className="text-xl font-semibold">{journalTitle}</h2>
            <p className="text-sm text-muted-foreground">
              Онлайн ведение журнала с автозаполнением
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            className="rounded-xl"
            onClick={() => setShowCreateDialog(true)}
          >
            <Plus className="w-4 h-4 mr-2" />
            Новый журнал
          </Button>
        </div>
      </div>

      {/* Journal Selection */}
      {existingJournals.length > 0 ? (
        <div className="flex items-center gap-4 flex-wrap">
          <Select value={selectedJournalId} onValueChange={setSelectedJournalId}>
            <SelectTrigger className="w-[300px] rounded-xl">
              <SelectValue placeholder="Выберите журнал" />
            </SelectTrigger>
            <SelectContent>
              {existingJournals.map((journal) => (
                <SelectItem key={journal.id} value={journal.id}>
                  {journal.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {journalInstance && (
            <>
              {/* Week navigation */}
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="rounded-lg"
                  onClick={() => setWeekStart(addDays(weekStart, -7))}
                >
                  ← Пред. неделя
                </Button>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" size="sm" className="rounded-lg">
                      <CalendarIcon className="w-4 h-4 mr-2" />
                      {format(weekStart, "d MMM", { locale: ru })} —{" "}
                      {format(addDays(weekStart, 6), "d MMM yyyy", { locale: ru })}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={weekStart}
                      onSelect={(date) =>
                        date && setWeekStart(startOfWeek(date, { locale: ru, weekStartsOn: 1 }))
                      }
                      locale={ru}
                    />
                  </PopoverContent>
                </Popover>
                <Button
                  variant="outline"
                  size="sm"
                  className="rounded-lg"
                  onClick={() => setWeekStart(addDays(weekStart, 7))}
                >
                  След. неделя →
                </Button>
              </div>

              <Button
                variant="ghost"
                size="icon"
                className="text-destructive rounded-xl"
                onClick={deleteJournal}
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            </>
          )}
        </div>
      ) : (
        <div className="bg-card rounded-2xl border border-border p-8 text-center">
          <Users className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
          <h3 className="font-semibold mb-2">Нет журналов</h3>
          <p className="text-muted-foreground mb-4">
            Создайте журнал для начала ведения записей
          </p>
          <Button onClick={() => setShowCreateDialog(true)} className="rounded-xl">
            <Plus className="w-4 h-4 mr-2" />
            Создать журнал
          </Button>
        </div>
      )}

      {/* Journal Table */}
      {journalInstance && students.length > 0 && (
        <div className="bg-card rounded-2xl border border-border overflow-hidden">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="min-w-[200px] sticky left-0 bg-card z-10">
                    Ученик
                  </TableHead>
                  {dates.map((date) => (
                    <TableHead key={date.toISOString()} className="text-center min-w-[60px]">
                      <div className="text-xs text-muted-foreground">
                        {format(date, "EEE", { locale: ru })}
                      </div>
                      <div>{format(date, "d", { locale: ru })}</div>
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {students.map((student) => (
                  <TableRow key={student.user_id}>
                    <TableCell className="font-medium sticky left-0 bg-card z-10">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-sm font-semibold text-primary">
                          {student.full_name.charAt(0).toUpperCase()}
                        </div>
                        <span className="truncate max-w-[150px]">{student.full_name}</span>
                      </div>
                    </TableCell>
                    {dates.map((date) => (
                      <TableCell key={date.toISOString()} className="text-center p-1">
                        {isAttendanceJournal
                          ? renderAttendanceCell(student.user_id, date)
                          : renderGradeCell(student.user_id, date)}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      {journalInstance && students.length === 0 && (
        <div className="bg-card rounded-2xl border border-border p-8 text-center">
          <Users className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
          <h3 className="font-semibold mb-2">Нет учеников</h3>
          <p className="text-muted-foreground">
            {journalInstance.course_id
              ? "На курс ещё никто не записан"
              : "В организации нет учеников"}
          </p>
        </div>
      )}

      {/* Create Journal Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Создать журнал</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Название журнала</label>
              <Input
                value={newJournalTitle}
                onChange={(e) => setNewJournalTitle(e.target.value)}
                placeholder="Введите название"
                className="rounded-xl"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Курс (опционально)</label>
              <Select value={selectedCourse} onValueChange={setSelectedCourse}>
                <SelectTrigger className="rounded-xl">
                  <SelectValue placeholder="Все ученики организации" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Все ученики организации</SelectItem>
                  {courses.map((course) => (
                    <SelectItem key={course.id} value={course.id}>
                      {course.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Выберите курс для автоматического заполнения списка учеников
              </p>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => setShowCreateDialog(false)}
              className="rounded-xl"
            >
              Отмена
            </Button>
            <Button onClick={createJournal} disabled={saving} className="rounded-xl">
              {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Создать
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}