import { useState, useEffect, useMemo, useRef, type SetStateAction } from "react";
import { toast } from "sonner";
import { format, parseISO, startOfYear, endOfYear, isWithinInterval } from "date-fns";
import { ru } from "date-fns/locale";
import { getXLSX } from "@/utils/xlsxHelper";
import { useCopiesJournalScope, type CopiesJournalScope } from "@/hooks/useCopiesJournalScope";
import { COPIES_STORAGE_CHANGED, COPIES_STORAGE_ERROR, copiesJournalKey, readCopiesJournal, type CopyDuplicateRecord } from "@/lib/journals/copiesJournalStorage";
export type { CopyDuplicateRecord } from "@/lib/journals/copiesJournalStorage";

export const DOCUMENT_TYPES = [
  { value: "certificate", label: "Удостоверение" },
  { value: "diploma", label: "Диплом" },
  { value: "qualification", label: "Свидетельство о квалификации" },
  { value: "other", label: "Другой документ" },
];

export const ISSUE_REASONS = [
  { value: "lost", label: "Утеря оригинала" },
  { value: "damaged", label: "Порча оригинала" },
  { value: "name_change", label: "Изменение ФИО" },
  { value: "employer_request", label: "Запрос работодателя" },
  { value: "archive", label: "Для архива" },
  { value: "other", label: "Другая причина" },
];

const defaultFormData = () => ({
  reg_number: "",
  recipient_name: "",
  original_document_type: "certificate",
  original_document_number: "",
  original_issue_date: new Date(),
  copy_type: "copy" as "copy" | "duplicate",
  issue_date: new Date(),
  issue_reason: "lost",
  notes: "",
});

const emptyView = (scope: CopiesJournalScope) => ({
  scope, loaded: false, error: null as string | null, saving: false,
  records: [] as CopyDuplicateRecord[], raw: null as string | null,
  searchQuery: "", selectedCopyType: "all",
  dateRange: { from: startOfYear(new Date()), to: endOfYear(new Date()) },
  showAddDialog: false, editingRecord: null as CopyDuplicateRecord | null,
  deletingRecord: null as CopyDuplicateRecord | null, formData: defaultFormData(),
});
type View = ReturnType<typeof emptyView>;

/** @deprecated Historical browser-only editor retained for recovery/tests. Production routes use ServerCopiesDuplicatesJournal and useCopyRegistry; never route new work here. */
export function useCopiesDuplicatesJournal(organizationId: string) {
  const { scope, isCurrent } = useCopiesJournalScope(organizationId);
  const [state, setState] = useState(() => emptyView(scope));
  const current = useRef(state);
  // Mask old data in the first render, before the loading effect can run.
  if (current.current.scope !== scope) current.current = emptyView(scope);
  const view = state.scope === scope ? state : current.current;
  const change = (update: (previous: View) => View) => {
    if (!isCurrent() || current.current.scope !== scope) return false;
    const next = update(current.current);
    current.current = next;
    setState(next);
    return true;
  };
  const setField = <K extends keyof View>(key: K) => (value: SetStateAction<View[K]>) => {
    change(previous => ({ ...previous, [key]: typeof value === "function"
      ? (value as (before: View[K]) => View[K])(previous[key]) : value }));
  };
  useEffect(() => {
    if (!isCurrent()) return;
    try {
      const source = readCopiesJournal(scope.organizationId);
      change(() => ({ ...emptyView(scope), ...source, loaded: true }));
    } catch {
      change(() => ({ ...emptyView(scope), loaded: true, error: COPIES_STORAGE_ERROR }));
    }
  }, [scope]);

  const usable = () => isCurrent() && current.current.scope === scope && current.current.loaded && !current.current.error;
  const confirmSource = (raw = current.current.raw) => {
    if (!usable()) return false;
    try {
      const latest = readCopiesJournal(scope.organizationId);
      if (latest.raw !== raw) {
        change(previous => ({ ...previous, error: COPIES_STORAGE_CHANGED }));
        return false;
      }
      return isCurrent();
    } catch {
      change(previous => ({ ...previous, error: COPIES_STORAGE_ERROR }));
      return false;
    }
  };
  const saveRecords = (records: CopyDuplicateRecord[]) => {
    if (!confirmSource(view.raw)) return false;
    const raw = JSON.stringify(records);
    if (!isCurrent()) return false;
    localStorage.setItem(copiesJournalKey(scope.organizationId), raw);
    return change(previous => ({ ...previous, records, raw }));
  };
  const records = view.loaded && !view.error ? view.records : [];
  const { searchQuery, selectedCopyType, dateRange, formData, editingRecord, deletingRecord } = view;
  const setFormData = setField("formData");
  const setShowAddDialog = setField("showAddDialog");
  const setEditingRecord = setField("editingRecord");
  const setDeletingRecord = setField("deletingRecord");

  const filteredRecords = useMemo(() => records.filter(r => {
    const sl = searchQuery.toLowerCase();
    const matchSearch = !searchQuery || r.recipient_name.toLowerCase().includes(sl) || r.reg_number.toLowerCase().includes(sl) || r.original_document_number.toLowerCase().includes(sl);
    const matchType = selectedCopyType === "all" || r.copy_type === selectedCopyType;
    const matchDate = isWithinInterval(parseISO(r.issue_date), { start: dateRange.from, end: dateRange.to });
    return matchSearch && matchType && matchDate;
  }), [records, searchQuery, selectedCopyType, dateRange]);

  const stats = useMemo(() => ({
    total: filteredRecords.length,
    copies: filteredRecords.filter(r => r.copy_type === "copy").length,
    duplicates: filteredRecords.filter(r => r.copy_type === "duplicate").length,
  }), [filteredRecords]);

  const resetForm = () => setFormData(defaultFormData());

  const generateRegNumber = () => {
    if (!usable()) return;
    const year = formData.issue_date.getFullYear();
    const prefix = formData.copy_type === "copy" ? "КОП" : "ДУБ";
    const count = records.filter(r => { const y = parseISO(r.issue_date).getFullYear(); return r.copy_type === formData.copy_type && y === year; }).length;
    setFormData(prev => ({ ...prev, reg_number: `${prefix}-${year}/${(count + 1).toString().padStart(3, "0")}` }));
  };

  const handleOpenAdd = () => { if (!usable()) return; resetForm(); setShowAddDialog(true); };

  const handleOpenEdit = (r: CopyDuplicateRecord) => {
    if (!usable() || !current.current.records.includes(r)) return;
    setFormData({
      reg_number: r.reg_number, recipient_name: r.recipient_name,
      original_document_type: r.original_document_type, original_document_number: r.original_document_number,
      original_issue_date: parseISO(r.original_issue_date), copy_type: r.copy_type,
      issue_date: parseISO(r.issue_date), issue_reason: r.issue_reason, notes: r.notes || "",
    });
    setEditingRecord(r);
  };

  const handleSave = () => {
    if (!usable()) return;
    if (editingRecord && !current.current.records.includes(editingRecord)) return;
    if (!formData.recipient_name.trim()) { toast.error("Введите ФИО получателя"); return; }
    if (!formData.reg_number.trim()) { toast.error("Введите регистрационный номер"); return; }
    if (!formData.original_document_number.trim()) { toast.error("Введите номер оригинала документа"); return; }
    change(previous => ({ ...previous, saving: true }));
    try {
      const rd: CopyDuplicateRecord = {
        ...editingRecord,
        id: editingRecord?.id || crypto.randomUUID(),
        reg_number: formData.reg_number.trim(), recipient_name: formData.recipient_name.trim(),
        original_document_type: formData.original_document_type, original_document_number: formData.original_document_number.trim(),
        original_issue_date: formData.original_issue_date.toISOString(), copy_type: formData.copy_type,
        issue_date: formData.issue_date.toISOString(), issue_reason: formData.issue_reason, notes: formData.notes.trim() || null,
      };
      const newRecords = editingRecord ? records.map(r => r.id === editingRecord.id ? rd : r) : [rd, ...records];
      if (!saveRecords(newRecords)) return;
      toast.success(editingRecord ? "Запись обновлена" : "Запись добавлена");
      setShowAddDialog(false); setEditingRecord(null); resetForm();
    } catch {
      if (isCurrent()) {
        change(previous => ({ ...previous, error: "Не удалось сохранить журнал в этом браузере. Закройте журнал и откройте снова; исходные записи не очищайте." }));
        toast.error("Ошибка при сохранении");
      }
    } finally { change(previous => ({ ...previous, saving: false })); }
  };

  const handleDelete = () => {
    if (!usable() || !deletingRecord || !current.current.records.includes(deletingRecord)) return;
    try {
      if (!saveRecords(records.filter(r => r.id !== deletingRecord.id))) return;
      toast.success("Запись удалена"); setDeletingRecord(null);
    } catch {
      if (isCurrent()) {
        change(previous => ({ ...previous, error: "Не удалось удалить запись в этом браузере. Закройте журнал и откройте снова; исходные записи не очищайте." }));
        toast.error("Ошибка при удалении");
      }
    }
  };

  const exportToExcel = async () => {
    if (!confirmSource(view.raw)) return;
    if (filteredRecords.length === 0) { toast.error("Нет данных для экспорта"); return; }
    const exportSource = view.raw;
    try {
      const XLSX = await getXLSX();
      if (!confirmSource(exportSource)) return;
      const data = filteredRecords.map((r, i) => ({
        "№ п/п": i + 1, "Рег. номер": r.reg_number,
        "Тип": r.copy_type === "copy" ? "Копия" : "Дубликат", "ФИО получателя": r.recipient_name,
        "Тип оригинала": DOCUMENT_TYPES.find(t => t.value === r.original_document_type)?.label || r.original_document_type,
        "Номер оригинала": r.original_document_number,
        "Дата выдачи оригинала": format(parseISO(r.original_issue_date), "dd.MM.yyyy", { locale: ru }),
        "Дата выдачи копии/дубликата": format(parseISO(r.issue_date), "dd.MM.yyyy", { locale: ru }),
        "Причина выдачи": ISSUE_REASONS.find(x => x.value === r.issue_reason)?.label || r.issue_reason,
        "Примечание": r.notes || "—",
      }));
      const ws = XLSX.utils.json_to_sheet(data);
      ws["!cols"] = [{ wch: 8 }, { wch: 15 }, { wch: 12 }, { wch: 30 }, { wch: 20 }, { wch: 18 }, { wch: 18 }, { wch: 22 }, { wch: 25 }, { wch: 30 }];
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Копии и дубликаты");
      if (!isCurrent()) return;
      XLSX.writeFile(wb, `Журнал_копий_дубликатов_${format(new Date(), "dd-MM-yyyy")}.xlsx`);
      toast.success("Журнал экспортирован в Excel");
    } catch {
      if (isCurrent()) toast.error("Ошибка при экспорте журнала");
    }
  };

  return {
    loading: !scope.ready || !view.loaded, saving: view.saving, error: view.error, records, filteredRecords, stats,
    searchQuery, setSearchQuery: setField("searchQuery"), selectedCopyType, setSelectedCopyType: setField("selectedCopyType"),
    dateRange, setDateRange: setField("dateRange"), showAddDialog: view.showAddDialog, setShowAddDialog,
    editingRecord, setEditingRecord, deletingRecord, setDeletingRecord,
    formData, setFormData, resetForm, generateRegNumber,
    handleOpenAdd, handleOpenEdit, handleSave, handleDelete, exportToExcel,
  };
}
