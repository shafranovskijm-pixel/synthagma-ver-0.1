import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { format, addDays, startOfWeek } from "date-fns";
import { ru } from "date-fns/locale";

interface Student { id: string; user_id: string; full_name: string; email: string; }
interface Course { id: string; title: string; }
interface JournalEntry { id?: string; user_id: string; entry_date: string; value: string; notes?: string; updated_at?: string; }
interface JournalInstance { id: string; organization_id: string; course_id: string | null; journal_type: string; title: string; created_at: string; }

interface UseJournalEditorProps { organizationId: string; journalType: string; journalTitle: string; onClose: () => void; }

export function useJournalEditor({ organizationId, journalType, journalTitle, onClose }: UseJournalEditorProps) {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [writeBlocked, setWriteBlocked] = useState(true);
  const writeBlockedRef = useRef(true);
  const directoryRefreshRequiredRef = useRef(false);
  const preferredJournalRef = useRef("");
  const [directoryRevision, setDirectoryRevision] = useState(0);
  const [journalRevision, setJournalRevision] = useState(0);
  const [saving, setSaving] = useState(false);
  const [students, setStudents] = useState<Student[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [selectedCourse, setSelectedCourse] = useState("");
  const [journalInstance, setJournalInstance] = useState<JournalInstance | null>(null);
  const [entries, setEntries] = useState<Map<string, JournalEntry>>(new Map());
  const entriesRef = useRef(entries);
  entriesRef.current = entries;
  const [dates, setDates] = useState<Date[]>([]);
  const [weekStart, setWeekStart] = useState<Date>(startOfWeek(new Date(), { locale: ru, weekStartsOn: 1 }));
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [newJournalTitle, setNewJournalTitle] = useState(journalTitle);
  const [existingJournals, setExistingJournals] = useState<JournalInstance[]>([]);
  const [selectedJournalId, setSelectedJournalId] = useState("");
  const context = `${organizationId}:${journalType}:${selectedJournalId}`;
  const contextRef = useRef(context);
  const contextRevisionRef = useRef(0);
  if (contextRef.current !== context) { contextRef.current = context; contextRevisionRef.current += 1; }
  useEffect(() => () => { contextRevisionRef.current += 1; }, []);
  const savingRef = useRef(false);
  const isAttendanceJournal = journalType === "attendance" || journalType === "entry_control";
  const entryType = isAttendanceJournal ? "attendance" : "grade";

  const blockWrites = (message: string, refreshDirectory = false) => {
    writeBlockedRef.current = true;
    if (refreshDirectory) directoryRefreshRequiredRef.current = true;
    setWriteBlocked(true);
    setLoadError(message);
  };
  const allowWrites = () => {
    writeBlockedRef.current = false;
    setWriteBlocked(false);
    setLoadError(null);
  };
  const finishWrite = (revision: number, writeContext: string, refreshDirectory = false) => {
    // A read started before our write finished is not a confirmation of that write.
    // In particular, returning A -> B -> A must not allow a second insert.
    const sameScope = refreshDirectory
      ? contextRef.current.startsWith(`${organizationId}:${journalType}:`)
      : contextRef.current === writeContext;
    if (contextRevisionRef.current !== revision && sameScope) {
      contextRevisionRef.current += 1;
      blockWrites("Во время сохранения выбранный журнал изменился. Перезагрузите журнал, чтобы проверить сохранённые данные перед следующими изменениями.", refreshDirectory);
      setLoading(false);
    }
    savingRef.current = false;
    setSaving(false);
  };
  const reloadJournal = () => {
    if (savingRef.current) return;
    contextRevisionRef.current += 1;
    writeBlockedRef.current = true;
    setWriteBlocked(true);
    setLoading(true);
    if (directoryRefreshRequiredRef.current || !selectedJournalId) {
      preferredJournalRef.current = selectedJournalId;
      setDirectoryRevision(version => version + 1);
    } else {
      setJournalRevision(version => version + 1);
    }
  };

  useEffect(() => {
    const weekDates: Date[] = [];
    for (let i = 0; i < 7; i++) weekDates.push(addDays(weekStart, i));
    setDates(weekDates);
  }, [weekStart]);

  useEffect(() => {
    let cancelled = false;
    writeBlockedRef.current = true;
    directoryRefreshRequiredRef.current = true;
    setWriteBlocked(true);
    setLoading(true);
    setLoadError(null);
    setCourses([]); setExistingJournals([]); setSelectedJournalId(""); setSelectedCourse("");
    entriesRef.current = new Map();
    setJournalInstance(null); setStudents([]); setEntries(new Map());
    const fetchData = async () => {
      try {
        const [coursesRes, journalsRes] = await Promise.all([
          supabase.from("courses").select("id, title").eq("organization_id", organizationId).order("title"),
          supabase.from("journal_instances").select("*").eq("organization_id", organizationId).eq("journal_type", journalType).order("created_at", { ascending: false }),
        ]);
        if (coursesRes.error) throw coursesRes.error;
        if (journalsRes.error) throw journalsRes.error;
        if (cancelled) return;
        setCourses(coursesRes.data || []);
        const loadedJournals = (journalsRes.data || []) as JournalInstance[];
        setExistingJournals(loadedJournals);
        const selectedId = loadedJournals.find(journal => journal.id === preferredJournalRef.current)?.id || loadedJournals[0]?.id || "";
        preferredJournalRef.current = "";
        directoryRefreshRequiredRef.current = false;
        setSelectedJournalId(selectedId);
        if (selectedId) setJournalRevision(version => version + 1);
        else allowWrites();
      } catch (error) { if (!cancelled) { console.error("Error:", error); blockWrites("Не удалось загрузить журналы. Перезагрузите журнал перед внесением изменений.", true); toast.error("Не удалось загрузить журналы"); } }
      finally { if (!cancelled) setLoading(false); }
    };
    fetchData();
    return () => { cancelled = true; };
  }, [organizationId, journalType, directoryRevision]);

  useEffect(() => {
    let cancelled = false;
    const readRevision = contextRevisionRef.current;
    entriesRef.current = new Map();
    setJournalInstance(null); setStudents([]); setEntries(new Map());
    const fetchJournalData = async () => {
      if (!selectedJournalId) return;
      writeBlockedRef.current = true;
      setWriteBlocked(true);
      setLoading(true);
      if (!directoryRefreshRequiredRef.current) setLoadError(null);
      try {
        const { data: journal, error: journalError } = await supabase.from("journal_instances").select("*")
          .eq("id", selectedJournalId).eq("organization_id", organizationId).eq("journal_type", journalType).single();
        if (journalError) throw journalError;
        if (cancelled || contextRevisionRef.current !== readRevision) return;
        if (!journal || journal.organization_id !== organizationId || journal.journal_type !== journalType) throw new Error("Журнал не принадлежит текущему разделу");
        if (journal) {
          let loadedStudents: Student[] = [];
          if (journal.course_id) {
            const { data: enrollments, error: enrollmentsError } = await supabase.from("enrollments").select("user_id").eq("course_id", journal.course_id);
            if (enrollmentsError) throw enrollmentsError;
            if (enrollments && enrollments.length > 0) {
              const { data: profiles, error: profilesError } = await supabase.from("profiles").select("id, user_id, full_name, email").eq("organization_id", organizationId).in("user_id", enrollments.map(e => e.user_id));
              if (profilesError) throw profilesError;
              if (profiles) loadedStudents = profiles.map(p => ({ id: p.id, user_id: p.user_id, full_name: p.full_name || p.email || "Без имени", email: p.email || "" }));
            }
          } else {
            const { data: profiles, error: profilesError } = await supabase.from("profiles").select("id, user_id, full_name, email").eq("organization_id", organizationId);
            if (profilesError) throw profilesError;
            if (profiles) loadedStudents = profiles.map(p => ({ id: p.id, user_id: p.user_id, full_name: p.full_name || p.email || "Без имени", email: p.email || "" }));
          }
          const { data: journalEntries, error: entriesError } = await supabase.from("journal_entries").select("*").eq("journal_id", selectedJournalId);
          if (entriesError) throw entriesError;
          if (cancelled || contextRevisionRef.current !== readRevision) return;
          if (journalEntries) {
            const entriesMap = new Map<string, JournalEntry>();
            journalEntries.forEach(entry => {
              const key = `${entry.user_id}_${entry.entry_date}`;
              if (entriesMap.has(key)) throw new Error("В журнале есть несколько отметок ученика за одну дату. Требуется проверка записей");
              entriesMap.set(key, { id: entry.id, user_id: entry.user_id, entry_date: entry.entry_date, value: entry.value || "", notes: entry.notes || "", updated_at: entry.updated_at });
            });
            entriesRef.current = entriesMap;
            setEntries(entriesMap);
          }
          setStudents(loadedStudents);
          setJournalInstance(journal as JournalInstance);
          if (!directoryRefreshRequiredRef.current) allowWrites();
        }
      } catch (error) { if (!cancelled && contextRevisionRef.current === readRevision) { console.error("Error:", error); blockWrites("Не удалось подтвердить данные журнала. Перезагрузите журнал: до успешной проверки изменения отключены."); toast.error("Не удалось загрузить данные журнала. Запись отключена до повторной загрузки"); } }
      finally { if (!cancelled && contextRevisionRef.current === readRevision) setLoading(false); }
    };
    fetchJournalData();
    return () => { cancelled = true; };
  }, [selectedJournalId, organizationId, journalType, journalRevision]);

  const createJournal = async () => {
    if (savingRef.current || writeBlockedRef.current || loading) return;
    if (!newJournalTitle.trim()) { toast.error("Введите название журнала"); return; }
    const courseId = selectedCourse === "all" ? null : selectedCourse || null;
    if (courseId && !courses.some(course => course.id === courseId)) { toast.error("Выберите курс текущей организации"); return; }
    const writeContext = contextRevisionRef.current;
    const writeContextKey = contextRef.current;
    savingRef.current = true; setSaving(true);
    try {
      const { data, error } = await supabase.from("journal_instances").insert({ organization_id: organizationId, course_id: courseId, journal_type: journalType, title: newJournalTitle }).select().single();
      if (error) throw error;
      if (!data?.id || data.organization_id !== organizationId || data.journal_type !== journalType || data.course_id !== courseId) throw new Error("База не подтвердила создание журнала");
      if (contextRevisionRef.current !== writeContext) return;
      setExistingJournals(prev => [data as JournalInstance, ...prev]);
      setSelectedJournalId(data.id); setShowCreateDialog(false);
      toast.success("Журнал создан");
    } catch (error) { if (contextRevisionRef.current === writeContext) { console.error("Error:", error); blockWrites("Создание журнала не подтверждено. Перезагрузите список перед повтором, чтобы не создать дубликат.", true); toast.error("Ошибка при создании журнала"); } }
    finally { finishWrite(writeContext, writeContextKey, true); }
  };

  const updateEntry = async (userId: string, date: Date, value: string) => {
    if (savingRef.current || writeBlockedRef.current || loading || !journalInstance || journalInstance.id !== selectedJournalId
      || journalInstance.organization_id !== organizationId || journalInstance.journal_type !== journalType
      || !students.some(student => student.user_id === userId)) return;
    const dateStr = format(date, "yyyy-MM-dd");
    const key = `${userId}_${dateStr}`;
    const existingEntry = entriesRef.current.get(key);
    const writeContext = contextRevisionRef.current;
    const writeContextKey = contextRef.current;
    const journalId = journalInstance.id;
    savingRef.current = true; setSaving(true);
    try {
      let saved;
      if (existingEntry?.id) {
        if (!existingEntry.updated_at) throw new Error("Обновите журнал перед сохранением");
        const { data, error } = await supabase.from("journal_entries")
          .update({ value, entry_type: entryType, updated_at: new Date().toISOString() })
          .eq("id", existingEntry.id).eq("journal_id", journalId).eq("user_id", userId)
          .eq("entry_date", dateStr).eq("updated_at", existingEntry.updated_at).select().maybeSingle();
        if (error) throw error;
        saved = data;
      } else {
        const { data, error } = await supabase.from("journal_entries").insert({ journal_id: journalId, user_id: userId, entry_date: dateStr, entry_type: entryType, value }).select().single();
        if (error) throw error;
        saved = data;
      }
      if (!saved?.id || saved.journal_id !== journalId || saved.user_id !== userId || saved.entry_date !== dateStr
        || saved.entry_type !== entryType || saved.value !== value || !saved.updated_at) throw new Error("База не подтвердила сохранение отметки");
      const { data: confirmed, error: confirmError } = await supabase.from("journal_entries").select("*")
        .eq("journal_id", journalId).eq("user_id", userId).eq("entry_date", dateStr).maybeSingle();
      if (confirmError) throw confirmError;
      if (!confirmed || confirmed.id !== saved.id || confirmed.value !== value || confirmed.entry_type !== entryType
        || confirmed.journal_id !== journalId || confirmed.user_id !== userId || confirmed.entry_date !== dateStr
        || confirmed.updated_at !== saved.updated_at) throw new Error("Повторное чтение не подтвердило отметку");
      if (contextRevisionRef.current !== writeContext) return;
      const updatedEntries = new Map(entriesRef.current);
      updatedEntries.set(key, { id: saved.id, user_id: userId, entry_date: dateStr, value, notes: saved.notes || "", updated_at: saved.updated_at });
      entriesRef.current = updatedEntries;
      setEntries(updatedEntries);
    } catch (error) { if (contextRevisionRef.current === writeContext) { console.error("Error:", error); blockWrites("Сохранение отметки не подтверждено. Она могла сохраниться в базе. Перезагрузите журнал перед повтором — это защитит от дубликатов."); toast.error("Отметка не подтверждена. Обновите журнал перед повтором"); } }
    finally { finishWrite(writeContext, writeContextKey); }
  };

  const getEntryValue = (userId: string, date: Date): string => entries.get(`${userId}_${format(date, "yyyy-MM-dd")}`)?.value || "";

  const deleteJournal = async () => {
    if (savingRef.current || writeBlockedRef.current || loading || !journalInstance || journalInstance.id !== selectedJournalId
      || journalInstance.organization_id !== organizationId || journalInstance.journal_type !== journalType) return;
    const writeContext = contextRevisionRef.current;
    const writeContextKey = contextRef.current;
    savingRef.current = true; setSaving(true);
    try {
      const { data, error } = await supabase.from("journal_instances").delete().eq("id", journalInstance.id)
        .eq("organization_id", organizationId).eq("journal_type", journalType).select("id");
      if (error) throw error;
      if (!data || data.length !== 1 || data[0].id !== journalInstance.id) throw new Error("База не подтвердила удаление журнала");
      if (contextRevisionRef.current !== writeContext) return;
      const remaining = existingJournals.filter(j => j.id !== journalInstance.id);
      setExistingJournals(remaining);
      setSelectedJournalId(remaining[0]?.id || "");
      setJournalInstance(null); setShowDeleteDialog(false);
      toast.success("Журнал удалён");
    } catch (error) { if (contextRevisionRef.current === writeContext) { console.error("Error:", error); blockWrites("Удаление журнала не подтверждено. Перезагрузите список перед следующими изменениями.", true); toast.error("Ошибка при удалении"); } }
    finally { finishWrite(writeContext, writeContextKey, true); }
  };

  const visibleJournal = journalInstance?.id === selectedJournalId && journalInstance.organization_id === organizationId
    && journalInstance.journal_type === journalType ? journalInstance : null;
  return {
    loading, loadError, writeBlocked, reloadJournal, saving, students: visibleJournal ? students : [], courses, selectedCourse, setSelectedCourse,
    journalInstance: visibleJournal, entries, dates, weekStart, setWeekStart,
    showCreateDialog, setShowCreateDialog, showDeleteDialog, setShowDeleteDialog,
    newJournalTitle, setNewJournalTitle, existingJournals, selectedJournalId, setSelectedJournalId,
    createJournal, updateEntry, getEntryValue, deleteJournal, isAttendanceJournal,
    onClose, journalTitle, addDays,
  };
}
