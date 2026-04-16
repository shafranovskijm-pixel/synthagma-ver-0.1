import { useState, useEffect, useMemo } from "react";
import { toast } from "sonner";
import { format, parseISO, startOfYear, endOfYear, isWithinInterval } from "date-fns";
import { ru } from "date-fns/locale";
import { getXLSX } from "@/utils/xlsxHelper";

export interface CopyDuplicateRecord {
  id: string;
  reg_number: string;
  recipient_name: string;
  original_document_type: string;
  original_document_number: string;
  original_issue_date: string;
  copy_type: "copy" | "duplicate";
  issue_date: string;
  issue_reason: string;
  notes: string | null;
}

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

export function useCopiesDuplicatesJournal(organizationId: string) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [records, setRecords] = useState<CopyDuplicateRecord[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCopyType, setSelectedCopyType] = useState("all");
  const [dateRange, setDateRange] = useState({ from: startOfYear(new Date()), to: endOfYear(new Date()) });
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [editingRecord, setEditingRecord] = useState<CopyDuplicateRecord | null>(null);
  const [deletingRecord, setDeletingRecord] = useState<CopyDuplicateRecord | null>(null);
  const [formData, setFormData] = useState(defaultFormData());

  useEffect(() => {
    setLoading(true);
    try {
      const stored = localStorage.getItem(`copies_duplicates_${organizationId}`);
      if (stored) setRecords(JSON.parse(stored));
    } catch (e) { console.error("Error loading records:", e); }
    finally { setLoading(false); }
  }, [organizationId]);

  const saveRecords = (r: CopyDuplicateRecord[]) => { localStorage.setItem(`copies_duplicates_${organizationId}`, JSON.stringify(r)); setRecords(r); };

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
    const year = formData.issue_date.getFullYear();
    const prefix = formData.copy_type === "copy" ? "КОП" : "ДУБ";
    const count = records.filter(r => { const y = parseISO(r.issue_date).getFullYear(); return r.copy_type === formData.copy_type && y === year; }).length;
    setFormData(prev => ({ ...prev, reg_number: `${prefix}-${year}/${(count + 1).toString().padStart(3, "0")}` }));
  };

  const handleOpenAdd = () => { resetForm(); setShowAddDialog(true); };

  const handleOpenEdit = (r: CopyDuplicateRecord) => {
    setFormData({
      reg_number: r.reg_number, recipient_name: r.recipient_name,
      original_document_type: r.original_document_type, original_document_number: r.original_document_number,
      original_issue_date: parseISO(r.original_issue_date), copy_type: r.copy_type,
      issue_date: parseISO(r.issue_date), issue_reason: r.issue_reason, notes: r.notes || "",
    });
    setEditingRecord(r);
  };

  const handleSave = () => {
    if (!formData.recipient_name.trim()) { toast.error("Введите ФИО получателя"); return; }
    if (!formData.reg_number.trim()) { toast.error("Введите регистрационный номер"); return; }
    if (!formData.original_document_number.trim()) { toast.error("Введите номер оригинала документа"); return; }
    setSaving(true);
    try {
      const rd: CopyDuplicateRecord = {
        id: editingRecord?.id || crypto.randomUUID(),
        reg_number: formData.reg_number.trim(), recipient_name: formData.recipient_name.trim(),
        original_document_type: formData.original_document_type, original_document_number: formData.original_document_number.trim(),
        original_issue_date: formData.original_issue_date.toISOString(), copy_type: formData.copy_type,
        issue_date: formData.issue_date.toISOString(), issue_reason: formData.issue_reason, notes: formData.notes.trim() || null,
      };
      const newRecords = editingRecord ? records.map(r => r.id === editingRecord.id ? rd : r) : [rd, ...records];
      saveRecords(newRecords);
      toast.success(editingRecord ? "Запись обновлена" : "Запись добавлена");
      setShowAddDialog(false); setEditingRecord(null); resetForm();
    } catch (e) { console.error("Error saving:", e); toast.error("Ошибка при сохранении"); }
    finally { setSaving(false); }
  };

  const handleDelete = () => {
    if (!deletingRecord) return;
    saveRecords(records.filter(r => r.id !== deletingRecord.id));
    toast.success("Запись удалена"); setDeletingRecord(null);
  };

  const exportToExcel = async () => {
    if (filteredRecords.length === 0) { toast.error("Нет данных для экспорта"); return; }
    const XLSX = await getXLSX();
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
    XLSX.writeFile(wb, `Журнал_копий_дубликатов_${format(new Date(), "dd-MM-yyyy")}.xlsx`);
    toast.success("Журнал экспортирован в Excel");
  };

  return {
    loading, saving, records, filteredRecords, stats,
    searchQuery, setSearchQuery, selectedCopyType, setSelectedCopyType,
    dateRange, setDateRange, showAddDialog, setShowAddDialog,
    editingRecord, setEditingRecord, deletingRecord, setDeletingRecord,
    formData, setFormData, resetForm, generateRegNumber,
    handleOpenAdd, handleOpenEdit, handleSave, handleDelete, exportToExcel,
  };
}
