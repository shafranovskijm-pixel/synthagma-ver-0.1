import { useState, useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue } from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow } from "@/components/ui/table";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger } from "@/components/ui/popover";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle } from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  ArrowLeft,
  Calendar as CalendarIcon,
  Search,
  FileSpreadsheet,
  Copy,
  FileText,
  Plus,
  Pencil,
  Trash2,
  Hash,
  User } from "lucide-react";
import { format, parseISO, startOfYear, endOfYear, isWithinInterval } from "date-fns";
import { ru } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { getXLSX } from "@/utils/xlsxHelper";
import { Badge } from "@/components/ui/badge";
import { SigmaSpinner } from "@/components/ui/SigmaSpinner";

interface CopyDuplicateRecord {
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

interface CopiesDuplicatesJournalProps {
  organizationId: string;
  onClose: () => void;
}

const DOCUMENT_TYPES = [
  { value: "certificate", label: "Удостоверение" },
  { value: "diploma", label: "Диплом" },
  { value: "qualification", label: "Свидетельство о квалификации" },
  { value: "other", label: "Другой документ" },
];

const ISSUE_REASONS = [
  { value: "lost", label: "Утеря оригинала" },
  { value: "damaged", label: "Порча оригинала" },
  { value: "name_change", label: "Изменение ФИО" },
  { value: "employer_request", label: "Запрос работодателя" },
  { value: "archive", label: "Для архива" },
  { value: "other", label: "Другая причина" },
];

export function CopiesDuplicatesJournal({
  organizationId,
  onClose }: CopiesDuplicatesJournalProps) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [records, setRecords] = useState<CopyDuplicateRecord[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCopyType, setSelectedCopyType] = useState<string>("all");
  const [dateRange, setDateRange] = useState<{
    from: Date;
    to: Date;
  }>({
    from: startOfYear(new Date()),
    to: endOfYear(new Date()) });

  // Dialog states
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [editingRecord, setEditingRecord] = useState<CopyDuplicateRecord | null>(null);
  const [deletingRecord, setDeletingRecord] = useState<CopyDuplicateRecord | null>(null);

  // Form state
  const [formData, setFormData] = useState({
    reg_number: "",
    recipient_name: "",
    original_document_type: "certificate",
    original_document_number: "",
    original_issue_date: new Date(),
    copy_type: "copy" as "copy" | "duplicate",
    issue_date: new Date(),
    issue_reason: "lost",
    notes: "" });

  // Load records from localStorage (simulating database)
  useEffect(() => {
    const loadRecords = () => {
      setLoading(true);
      try {
        const stored = localStorage.getItem(`copies_duplicates_${organizationId}`);
        if (stored) {
          setRecords(JSON.parse(stored));
        }
      } catch (error) {
        console.error("Error loading records:", error);
      } finally {
        setLoading(false);
      }
    };

    loadRecords();
  }, [organizationId]);

  // Save records to localStorage
  const saveRecords = (newRecords: CopyDuplicateRecord[]) => {
    localStorage.setItem(`copies_duplicates_${organizationId}`, JSON.stringify(newRecords));
    setRecords(newRecords);
  };

  // Filter records
  const filteredRecords = useMemo(() => {
    return records.filter((record) => {
      const searchLower = searchQuery.toLowerCase();
      const matchesSearch =
        !searchQuery ||
        record.recipient_name.toLowerCase().includes(searchLower) ||
        record.reg_number.toLowerCase().includes(searchLower) ||
        record.original_document_number.toLowerCase().includes(searchLower);

      const matchesCopyType =
        selectedCopyType === "all" || record.copy_type === selectedCopyType;

      const recordDate = parseISO(record.issue_date);
      const matchesDate = isWithinInterval(recordDate, {
        start: dateRange.from,
        end: dateRange.to });

      return matchesSearch && matchesCopyType && matchesDate;
    });
  }, [records, searchQuery, selectedCopyType, dateRange]);

  // Statistics
  const stats = useMemo(() => {
    const copies = filteredRecords.filter((r) => r.copy_type === "copy").length;
    const duplicates = filteredRecords.filter((r) => r.copy_type === "duplicate").length;
    return { total: filteredRecords.length, copies, duplicates };
  }, [filteredRecords]);

  // Reset form
  const resetForm = () => {
    setFormData({
      reg_number: "",
      recipient_name: "",
      original_document_type: "certificate",
      original_document_number: "",
      original_issue_date: new Date(),
      copy_type: "copy",
      issue_date: new Date(),
      issue_reason: "lost",
      notes: "" });
  };

  // Generate registration number
  const generateRegNumber = () => {
    const year = formData.issue_date.getFullYear();
    const prefix = formData.copy_type === "copy" ? "КОП" : "ДУБ";
    const sameTypeYearCount = records.filter((r) => {
      const rYear = parseISO(r.issue_date).getFullYear();
      return r.copy_type === formData.copy_type && rYear === year;
    }).length;
    const suggestedNumber = `${prefix}-${year}/${(sameTypeYearCount + 1).toString().padStart(3, "0")}`;
    setFormData((prev) => ({ ...prev, reg_number: suggestedNumber }));
  };

  // Open add dialog
  const handleOpenAdd = () => {
    resetForm();
    setShowAddDialog(true);
  };

  // Open edit dialog
  const handleOpenEdit = (record: CopyDuplicateRecord) => {
    setFormData({
      reg_number: record.reg_number,
      recipient_name: record.recipient_name,
      original_document_type: record.original_document_type,
      original_document_number: record.original_document_number,
      original_issue_date: parseISO(record.original_issue_date),
      copy_type: record.copy_type,
      issue_date: parseISO(record.issue_date),
      issue_reason: record.issue_reason,
      notes: record.notes || "" });
    setEditingRecord(record);
  };

  // Save record (add or edit)
  const handleSave = () => {
    if (!formData.recipient_name.trim()) {
      toast.error("Введите ФИО получателя");
      return;
    }
    if (!formData.reg_number.trim()) {
      toast.error("Введите регистрационный номер");
      return;
    }
    if (!formData.original_document_number.trim()) {
      toast.error("Введите номер оригинала документа");
      return;
    }

    setSaving(true);

    try {
      const recordData: CopyDuplicateRecord = {
        id: editingRecord?.id || crypto.randomUUID(),
        reg_number: formData.reg_number.trim(),
        recipient_name: formData.recipient_name.trim(),
        original_document_type: formData.original_document_type,
        original_document_number: formData.original_document_number.trim(),
        original_issue_date: formData.original_issue_date.toISOString(),
        copy_type: formData.copy_type,
        issue_date: formData.issue_date.toISOString(),
        issue_reason: formData.issue_reason,
        notes: formData.notes.trim() || null };

      let newRecords: CopyDuplicateRecord[];

      if (editingRecord) {
        newRecords = records.map((r) =>
          r.id === editingRecord.id ? recordData : r
        );
        toast.success("Запись обновлена");
      } else {
        newRecords = [recordData, ...records];
        toast.success("Запись добавлена");
      }

      saveRecords(newRecords);
      setShowAddDialog(false);
      setEditingRecord(null);
      resetForm();
    } catch (error) {
      console.error("Error saving record:", error);
      toast.error("Ошибка при сохранении");
    } finally {
      setSaving(false);
    }
  };

  // Delete record
  const handleDelete = () => {
    if (!deletingRecord) return;

    const newRecords = records.filter((r) => r.id !== deletingRecord.id);
    saveRecords(newRecords);
    toast.success("Запись удалена");
    setDeletingRecord(null);
  };

  // Export to Excel
  const exportToExcel = async () => {
    if (filteredRecords.length === 0) {
      toast.error("Нет данных для экспорта");
      return;
    }

    const XLSX = await getXLSX();
    const exportData = filteredRecords.map((record, index) => ({
      "№ п/п": index + 1,
      "Рег. номер": record.reg_number,
      "Тип": record.copy_type === "copy" ? "Копия" : "Дубликат",
      "ФИО получателя": record.recipient_name,
      "Тип оригинала": DOCUMENT_TYPES.find((t) => t.value === record.original_document_type)?.label || record.original_document_type,
      "Номер оригинала": record.original_document_number,
      "Дата выдачи оригинала": format(parseISO(record.original_issue_date), "dd.MM.yyyy", { locale: ru }),
      "Дата выдачи копии/дубликата": format(parseISO(record.issue_date), "dd.MM.yyyy", { locale: ru }),
      "Причина выдачи": ISSUE_REASONS.find((r) => r.value === record.issue_reason)?.label || record.issue_reason,
      "Примечание": record.notes || "—" }));

    const worksheet = XLSX.utils.json_to_sheet(exportData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Копии и дубликаты");

    const columnWidths = [
      { wch: 8 },
      { wch: 15 },
      { wch: 12 },
      { wch: 30 },
      { wch: 20 },
      { wch: 18 },
      { wch: 18 },
      { wch: 22 },
      { wch: 25 },
      { wch: 30 },
    ];
    worksheet["!cols"] = columnWidths;

    const fileName = `Журнал_копий_дубликатов_${format(new Date(), "dd-MM-yyyy")}.xlsx`;
    XLSX.writeFile(workbook, fileName);
    toast.success("Журнал экспортирован в Excel");
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <SigmaSpinner size="lg" />
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
            <h2 className="text-xl font-semibold">Журнал учёта выдачи копий / дубликатов</h2>
            <p className="text-sm text-muted-foreground">
              Учёт выдачи копий и дубликатов документов об образовании / квалификации
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleOpenAdd} className="rounded-xl">
            <Plus className="w-4 h-4 mr-2" />
            Добавить
          </Button>
          <Button onClick={exportToExcel} className="rounded-xl">
            <FileSpreadsheet className="w-4 h-4 mr-2" />
            Экспорт в Excel
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-card rounded-xl border border-border p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center">
              <FileText className="w-5 h-5 text-blue-500" />
            </div>
            <div>
              <p className="text-2xl font-bold">{stats.total}</p>
              <p className="text-xs text-muted-foreground">Всего записей</p>
            </div>
          </div>
        </div>
        <div className="bg-card rounded-xl border border-border p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-green-500/10 flex items-center justify-center">
              <Copy className="w-5 h-5 text-green-500" />
            </div>
            <div>
              <p className="text-2xl font-bold">{stats.copies}</p>
              <p className="text-xs text-muted-foreground">Копий</p>
            </div>
          </div>
        </div>
        <div className="bg-card rounded-xl border border-border p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-amber-500/10 flex items-center justify-center">
              <FileText className="w-5 h-5 text-amber-500" />
            </div>
            <div>
              <p className="text-2xl font-bold">{stats.duplicates}</p>
              <p className="text-xs text-muted-foreground">Дубликатов</p>
            </div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-card rounded-2xl border border-border p-4">
        <div className="flex flex-wrap items-center gap-4">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Поиск по ФИО, номеру..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 rounded-xl"
            />
          </div>

          <Select value={selectedCopyType} onValueChange={setSelectedCopyType}>
            <SelectTrigger className="w-[180px] rounded-xl">
              <SelectValue placeholder="Все типы" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Все типы</SelectItem>
              <SelectItem value="copy">Копии</SelectItem>
              <SelectItem value="duplicate">Дубликаты</SelectItem>
            </SelectContent>
          </Select>

          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className="rounded-xl">
                <CalendarIcon className="w-4 h-4 mr-2" />
                {format(dateRange.from, "dd.MM.yy")} - {format(dateRange.to, "dd.MM.yy")}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="end">
              <Calendar
                mode="range"
                selected={{ from: dateRange.from, to: dateRange.to }}
                onSelect={(range) => {
                  if (range?.from && range?.to) {
                    setDateRange({ from: range.from, to: range.to });
                  }
                }}
                locale={ru}
                numberOfMonths={2}
              />
            </PopoverContent>
          </Popover>
        </div>
      </div>

      {/* Table */}
      {filteredRecords.length > 0 ? (
        <div className="bg-card rounded-2xl border border-border overflow-hidden">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12 text-center">№</TableHead>
                  <TableHead className="w-28">Рег. номер</TableHead>
                  <TableHead>Тип</TableHead>
                  <TableHead>Получатель</TableHead>
                  <TableHead>Оригинал документа</TableHead>
                  <TableHead className="text-center">Дата выдачи</TableHead>
                  <TableHead>Причина</TableHead>
                  <TableHead className="w-20"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredRecords.map((record, index) => (
                  <TableRow key={record.id}>
                    <TableCell className="text-center text-muted-foreground">
                      {index + 1}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="rounded font-mono">
                        {record.reg_number}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={cn(
                          "rounded",
                          record.copy_type === "copy"
                            ? "border-green-500/50 text-green-600 bg-green-500/10"
                            : "border-amber-500/50 text-amber-600 bg-amber-500/10"
                        )}
                      >
                        {record.copy_type === "copy" ? "Копия" : "Дубликат"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <User className="w-4 h-4 text-muted-foreground" />
                        <span className="font-medium">{record.recipient_name}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div>
                        <p className="text-sm font-medium">
                          {DOCUMENT_TYPES.find((t) => t.value === record.original_document_type)?.label}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          № {record.original_document_number} от{" "}
                          {format(parseISO(record.original_issue_date), "dd.MM.yyyy", { locale: ru })}
                        </p>
                      </div>
                    </TableCell>
                    <TableCell className="text-center">
                      {format(parseISO(record.issue_date), "dd.MM.yyyy", { locale: ru })}
                    </TableCell>
                    <TableCell>
                      <span className="text-sm">
                        {ISSUE_REASONS.find((r) => r.value === record.issue_reason)?.label}
                      </span>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => handleOpenEdit(record)}
                        >
                          <Pencil className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive hover:text-destructive"
                          onClick={() => setDeletingRecord(record)}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      ) : (
        <div className="bg-card rounded-2xl border border-border p-12 text-center">
          <Copy className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
          <h3 className="font-semibold mb-2">Нет записей</h3>
          <p className="text-muted-foreground mb-4">
            {records.length === 0
              ? "Добавьте первую запись о выдаче копии или дубликата"
              : "Нет записей, соответствующих фильтрам"}
          </p>
          {records.length === 0 && (
            <Button onClick={handleOpenAdd} className="rounded-xl">
              <Plus className="w-4 h-4 mr-2" />
              Добавить запись
            </Button>
          )}
        </div>
      )}

      {/* Add/Edit Dialog */}
      <Dialog
        open={showAddDialog || !!editingRecord}
        onOpenChange={(open) => {
          if (!open) {
            setShowAddDialog(false);
            setEditingRecord(null);
            resetForm();
          }
        }}
      >
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingRecord ? "Редактировать запись" : "Добавить запись"}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {/* Copy Type */}
            <div className="space-y-2">
              <Label>Тип выдачи *</Label>
              <Select
                value={formData.copy_type}
                onValueChange={(value: "copy" | "duplicate") =>
                  setFormData((prev) => ({ ...prev, copy_type: value }))
                }
              >
                <SelectTrigger className="rounded-xl">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="copy">Копия</SelectItem>
                  <SelectItem value="duplicate">Дубликат</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Registration Number */}
            <div className="space-y-2">
              <Label>Регистрационный номер *</Label>
              <div className="flex gap-2">
                <Input
                  value={formData.reg_number}
                  onChange={(e) => setFormData((prev) => ({ ...prev, reg_number: e.target.value }))}
                  placeholder="Например: КОП-2025/001"
                  className="flex-1 rounded-xl"
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={generateRegNumber}
                  className="shrink-0 rounded-xl"
                >
                  <Hash className="w-4 h-4 mr-1" />
                  Авто
                </Button>
              </div>
            </div>

            {/* Recipient Name */}
            <div className="space-y-2">
              <Label>ФИО получателя *</Label>
              <Input
                value={formData.recipient_name}
                onChange={(e) => setFormData((prev) => ({ ...prev, recipient_name: e.target.value }))}
                placeholder="Иванов Иван Иванович"
                className="rounded-xl"
              />
            </div>

            {/* Original Document Type */}
            <div className="space-y-2">
              <Label>Тип оригинала документа</Label>
              <Select
                value={formData.original_document_type}
                onValueChange={(value) =>
                  setFormData((prev) => ({ ...prev, original_document_type: value }))
                }
              >
                <SelectTrigger className="rounded-xl">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DOCUMENT_TYPES.map((type) => (
                    <SelectItem key={type.value} value={type.value}>
                      {type.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Original Document Number */}
            <div className="space-y-2">
              <Label>Номер оригинала документа *</Label>
              <Input
                value={formData.original_document_number}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, original_document_number: e.target.value }))
                }
                placeholder="Например: УД-2024/123"
                className="rounded-xl"
              />
            </div>

            {/* Original Issue Date */}
            <div className="space-y-2">
              <Label>Дата выдачи оригинала</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-full justify-start rounded-xl">
                    <CalendarIcon className="w-4 h-4 mr-2" />
                    {format(formData.original_issue_date, "dd MMMM yyyy", { locale: ru })}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={formData.original_issue_date}
                    onSelect={(date) =>
                      date && setFormData((prev) => ({ ...prev, original_issue_date: date }))
                    }
                    locale={ru}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>

            {/* Issue Date */}
            <div className="space-y-2">
              <Label>Дата выдачи копии/дубликата</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-full justify-start rounded-xl">
                    <CalendarIcon className="w-4 h-4 mr-2" />
                    {format(formData.issue_date, "dd MMMM yyyy", { locale: ru })}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={formData.issue_date}
                    onSelect={(date) =>
                      date && setFormData((prev) => ({ ...prev, issue_date: date }))
                    }
                    locale={ru}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>

            {/* Issue Reason */}
            <div className="space-y-2">
              <Label>Причина выдачи</Label>
              <Select
                value={formData.issue_reason}
                onValueChange={(value) =>
                  setFormData((prev) => ({ ...prev, issue_reason: value }))
                }
              >
                <SelectTrigger className="rounded-xl">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ISSUE_REASONS.map((reason) => (
                    <SelectItem key={reason.value} value={reason.value}>
                      {reason.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Notes */}
            <div className="space-y-2">
              <Label>Примечание</Label>
              <Textarea
                value={formData.notes}
                onChange={(e) => setFormData((prev) => ({ ...prev, notes: e.target.value }))}
                placeholder="Дополнительная информация"
                className="rounded-xl resize-none"
                rows={3}
              />
            </div>
          </div>

          <DialogFooter className="flex gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => {
                setShowAddDialog(false);
                setEditingRecord(null);
                resetForm();
              }}
              disabled={saving}
            >
              Отмена
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? (
                <>
                  <SigmaSpinner size="sm" className="mr-2" />
                  Сохранение...
                </>
              ) : editingRecord ? (
                "Сохранить"
              ) : (
                <>
                  <Plus className="w-4 h-4 mr-2" />
                  Добавить
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deletingRecord} onOpenChange={() => setDeletingRecord(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Удалить запись?</AlertDialogTitle>
            <AlertDialogDescription>
              Вы уверены, что хотите удалить запись о выдаче{" "}
              {deletingRecord?.copy_type === "copy" ? "копии" : "дубликата"} для{" "}
              <strong>{deletingRecord?.recipient_name}</strong>? Это действие нельзя отменить.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Отмена</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive hover:bg-destructive/90">
              Удалить
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
