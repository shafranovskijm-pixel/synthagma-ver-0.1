import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { format, addDays, startOfWeek } from "date-fns";
import { ru } from "date-fns/locale";

interface Student { id: string; user_id: string; full_name: string; email: string; }
interface Course { id: string; title: string; }
interface JournalEntry { id?: string; user_id: string; entry_date: string; value: string; notes?: string; }
interface JournalInstance { id: string; organization_id: string; course_id: string | null; journal_type: string; title: string; created_at: string; }

interface UseJournalEditorProps { organizationId: string; journalType: string; journalTitle: string; onClose: () => void; }

export function useJournalEditor({ organizationId, journalType, journalTitle, onClose }: UseJournalEditorProps) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [students, setStudents] = useState<Student[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [selectedCourse, setSelectedCourse] = useState("");
  const [journalInstance, setJournalInstance] = useState<JournalInstance | null>(null);
  const [entries, setEntries] = useState<Map<string, JournalEntry>>(new Map());
  const [dates, setDates] = useState<Date[]>([]);
  const [weekStart, setWeekStart] = useState<Date>(startOfWeek(new Date(), { locale: ru, weekStartsOn: 1 }));
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [newJournalTitle, setNewJournalTitle] = useState(journalTitle);
  const [existingJournals, setExistingJournals] = useState<JournalInstance[]>([]);
  const [selectedJournalId, setSelectedJournalId] = useState("");

  useEffect(() => {
    const weekDates: Date[] = [];
    for (let i = 0; i < 7; i++) weekDates.push(addDays(weekStart, i));
    setDates(weekDates);
  }, [weekStart]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [coursesRes, journalsRes] = await Promise.all([
          supabase.from("courses").select("id, title").eq("organization_id", organizationId).order("title"),
          supabase.from("journal_instances").select("*").eq("organization_id", organizationId).eq("journal_type", journalType).order("created_at", { ascending: false }),
        ]);
        if (coursesRes.data) setCourses(coursesRes.data);
        if (journalsRes.data) {
          setExistingJournals(journalsRes.data as JournalInstance[]);
          if (journalsRes.data.length > 0) setSelectedJournalId(journalsRes.data[0].id);
        }
      } catch (error) { console.error("Error:", error); }
      finally { setLoading(false); }
    };
    fetchData();
  }, [organizationId, journalType]);

  useEffect(() => {
    const fetchJournalData = async () => {
      if (!selectedJournalId) return;
      setLoading(true);
      try {
        const { data: journal } = await supabase.from("journal_instances").select("*").eq("id", selectedJournalId).single();
        if (journal) {
          setJournalInstance(journal as JournalInstance);
          if (journal.course_id) {
            const { data: enrollments } = await supabase.from("enrollments").select("user_id").eq("course_id", journal.course_id);
            if (enrollments && enrollments.length > 0) {
              const { data: profiles } = await supabase.from("profiles").select("id, user_id, full_name, email").in("user_id", enrollments.map(e => e.user_id));
              if (profiles) setStudents(profiles.map(p => ({ id: p.id, user_id: p.user_id, full_name: p.full_name || p.email || "Без имени", email: p.email || "" })));
            }
          } else {
            const { data: profiles } = await supabase.from("profiles").select("id, user_id, full_name, email").eq("organization_id", organizationId);
            if (profiles) setStudents(profiles.map(p => ({ id: p.id, user_id: p.user_id, full_name: p.full_name || p.email || "Без имени", email: p.email || "" })));
          }
          const { data: journalEntries } = await supabase.from("journal_entries").select("*").eq("journal_id", selectedJournalId);
          if (journalEntries) {
            const entriesMap = new Map<string, JournalEntry>();
            journalEntries.forEach(entry => entriesMap.set(`${entry.user_id}_${entry.entry_date}`, { id: entry.id, user_id: entry.user_id, entry_date: entry.entry_date, value: entry.value || "", notes: entry.notes || "" }));
            setEntries(entriesMap);
          }
        }
      } catch (error) { console.error("Error:", error); }
      finally { setLoading(false); }
    };
    fetchJournalData();
  }, [selectedJournalId, organizationId]);

  const createJournal = async () => {
    if (!newJournalTitle.trim()) { toast.error("Введите название журнала"); return; }
    setSaving(true);
    try {
      const { data, error } = await supabase.from("journal_instances").insert({ organization_id: organizationId, course_id: selectedCourse === "all" ? null : selectedCourse || null, journal_type: journalType, title: newJournalTitle }).select().single();
      if (error) throw error;
      setExistingJournals(prev => [data as JournalInstance, ...prev]);
      setSelectedJournalId(data.id); setShowCreateDialog(false);
      toast.success("Журнал создан");
    } catch (error) { console.error("Error:", error); toast.error("Ошибка при создании журнала"); }
    finally { setSaving(false); }
  };

  const updateEntry = async (userId: string, date: Date, value: string) => {
    if (!journalInstance) return;
    const dateStr = format(date, "yyyy-MM-dd");
    const key = `${userId}_${dateStr}`;
    const existingEntry = entries.get(key);
    try {
      if (existingEntry?.id) {
        const { error } = await supabase.from("journal_entries").update({ value, updated_at: new Date().toISOString() }).eq("id", existingEntry.id);
        if (error) throw error;
      } else {
        const { data, error } = await supabase.from("journal_entries").insert({ journal_id: journalInstance.id, user_id: userId, entry_date: dateStr, entry_type: journalType === "attendance" ? "attendance" : "grade", value }).select().single();
        if (error) throw error;
        setEntries(prev => { const m = new Map(prev); m.set(key, { id: data.id, user_id: userId, entry_date: dateStr, value }); return m; });
        return;
      }
      setEntries(prev => { const m = new Map(prev); m.set(key, { ...existingEntry, value }); return m; });
    } catch (error) { console.error("Error:", error); toast.error("Ошибка при сохранении"); }
  };

  const getEntryValue = (userId: string, date: Date): string => entries.get(`${userId}_${format(date, "yyyy-MM-dd")}`)?.value || "";

  const deleteJournal = async () => {
    if (!journalInstance) return;
    try {
      const { error } = await supabase.from("journal_instances").delete().eq("id", journalInstance.id);
      if (error) throw error;
      setExistingJournals(prev => prev.filter(j => j.id !== journalInstance.id));
      setSelectedJournalId(existingJournals[1]?.id || "");
      setJournalInstance(null); setShowDeleteDialog(false);
      toast.success("Журнал удалён");
    } catch (error) { console.error("Error:", error); toast.error("Ошибка при удалении"); }
  };

  const isAttendanceJournal = journalType === "attendance" || journalType === "entry_control";

  return {
    loading, saving, students, courses, selectedCourse, setSelectedCourse,
    journalInstance, entries, dates, weekStart, setWeekStart,
    showCreateDialog, setShowCreateDialog, showDeleteDialog, setShowDeleteDialog,
    newJournalTitle, setNewJournalTitle, existingJournals, selectedJournalId, setSelectedJournalId,
    createJournal, updateEntry, getEntryValue, deleteJournal, isAttendanceJournal,
    onClose, journalTitle, addDays,
  };
}
