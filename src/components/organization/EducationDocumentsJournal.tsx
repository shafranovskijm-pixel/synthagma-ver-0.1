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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import {
  ArrowLeft,
  Calendar as CalendarIcon,
  Search,
  Loader2,
  FileSpreadsheet,
  FileText,
  Plus,
  Pencil,
  Trash2,
  Hash,
  User,
  GraduationCap,
  Award,
  Mail,
} from "lucide-react";
import { format, parseISO, startOfYear, endOfYear, isWithinInterval } from "date-fns";
import { ru } from "date-fns/locale";
import { cn } from "@/lib/utils";
import * as XLSX from "xlsx";
import { Badge } from "@/components/ui/badge";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";

interface EducationDocumentRecord {
  id: string;
  reg_number: string;
  full_name: string;
  birth_date: string;
  document_type: "certificate" | "diploma" | "qualification";
  document_series: string;
  document_number: string;
  issue_date: string;
  specialty_name: string;
  qualification_name: string;
  protocol_number: string;
  protocol_date: string;
  order_number: string;
  order_date: string;
  document_status: "original" | "duplicate";
  original_document_data: string | null;
  delivery_method: "personal" | "representative" | "postal";
  delivery_details: string | null;
  notes: string | null;
}

interface EducationDocumentsJournalProps {
  organizationId: string;
  onClose: () => void;
}

const DOCUMENT_TYPES = [
  { value: "certificate", label: "Удостоверение" },
  { value: "diploma", label: "Диплом" },
  { value: "qualification", label: "Свидетельство о квалификации" },
];

const DELIVERY_METHODS = [
  { value: "personal", label: "Лично" },
  { value: "representative", label: "Через представителя" },
  { value: "postal", label: "Почтовое отправление" },
];

export function EducationDocumentsJournal({
  organizationId,
  onClose,
}: EducationDocumentsJournalProps) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [records, setRecords] = useState<EducationDocumentRecord[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedDocType, setSelectedDocType] = useState<string>("all");
  const [selectedStatus, setSelectedStatus] = useState<string>("all");
  const [dateRange, setDateRange] = useState<{
    from: Date;
    to: Date;
  }>({
    from: startOfYear(new Date()),
    to: endOfYear(new Date()),
  });

  // Dialog states
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [editingRecord, setEditingRecord] = useState<EducationDocumentRecord | null>(null);
  const [deletingRecord, setDeletingRecord] = useState<EducationDocumentRecord | null>(null);

  // Form state
  const [formData, setFormData] = useState({
    reg_number: "",
    full_name: "",
    birth_date: null as Date | null,
    document_type: "certificate" as "certificate" | "diploma" | "qualification",
    document_series: "",
    document_number: "",
    issue_date: new Date(),
    specialty_name: "",
    qualification_name: "",
    protocol_number: "",
    protocol_date: null as Date | null,
    order_number: "",
    order_date: null as Date | null,
    document_status: "original" as "original" | "duplicate",
    original_document_data: "",
    delivery_method: "personal" as "personal" | "representative" | "postal",
    delivery_details: "",
    notes: "",
  });

  // Load records from localStorage
  useEffect(() => {
    const loadRecords = () => {
      setLoading(true);
      try {
        const stored = localStorage.getItem(`education_documents_${organizationId}`);
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
  const saveRecords = (newRecords: EducationDocumentRecord[]) => {
    localStorage.setItem(`education_documents_${organizationId}`, JSON.stringify(newRecords));
    setRecords(newRecords);
  };

  // Filter records
  const filteredRecords = useMemo(() => {
    return records.filter((record) => {
      const searchLower = searchQuery.toLowerCase();
      const matchesSearch =
        !searchQuery ||
        record.full_name.toLowerCase().includes(searchLower) ||
        record.reg_number.toLowerCase().includes(searchLower) ||
        record.document_number.toLowerCase().includes(searchLower) ||
        record.specialty_name.toLowerCase().includes(searchLower);

      const matchesDocType =
        selectedDocType === "all" || record.document_type === selectedDocType;

      const matchesStatus =
        selectedStatus === "all" || record.document_status === selectedStatus;

      const recordDate = parseISO(record.issue_date);
      const matchesDate = isWithinInterval(recordDate, {
        start: dateRange.from,
        end: dateRange.to,
      });

      return matchesSearch && matchesDocType && matchesStatus && matchesDate;
    });
  }, [records, searchQuery, selectedDocType, selectedStatus, dateRange]);

  // Statistics
  const stats = useMemo(() => {
    const certificates = filteredRecords.filter((r) => r.document_type === "certificate").length;
    const diplomas = filteredRecords.filter((r) => r.document_type === "diploma").length;
    const originals = filteredRecords.filter((r) => r.document_status === "original").length;
    const duplicates = filteredRecords.filter((r) => r.document_status === "duplicate").length;
    return { total: filteredRecords.length, certificates, diplomas, originals, duplicates };
  }, [filteredRecords]);

  // Reset form
  const resetForm = () => {
    setFormData({
      reg_number: "",
      full_name: "",
      birth_date: null,
      document_type: "certificate",
      document_series: "",
      document_number: "",
      issue_date: new Date(),
      specialty_name: "",
      qualification_name: "",
      protocol_number: "",
      protocol_date: null,
      order_number: "",
      order_date: null,
      document_status: "original",
      original_document_data: "",
      delivery_method: "personal",
      delivery_details: "",
      notes: "",
    });
  };

  // Generate registration number
  const generateRegNumber = () => {
    const year = formData.issue_date.getFullYear();
    const sameYearCount = records.filter((r) => {
      const rYear = parseISO(r.issue_date).getFullYear();
      return rYear === year;
    }).length;
    const suggestedNumber = `ДОК-${year}/${(sameYearCount + 1).toString().padStart(4, "0")}`;
    setFormData((prev) => ({ ...prev, reg_number: suggestedNumber }));
  };

  // Open add dialog
  const handleOpenAdd = () => {
    resetForm();
    setShowAddDialog(true);
  };

  // Open edit dialog
  const handleOpenEdit = (record: EducationDocumentRecord) => {
    setFormData({
      reg_number: record.reg_number,
      full_name: record.full_name,
      birth_date: record.birth_date ? parseISO(record.birth_date) : null,
      document_type: record.document_type,
      document_series: record.document_series,
      document_number: record.document_number,
      issue_date: parseISO(record.issue_date),
      specialty_name: record.specialty_name,
      qualification_name: record.qualification_name,
      protocol_number: record.protocol_number,
      protocol_date: record.protocol_date ? parseISO(record.protocol_date) : null,
      order_number: record.order_number,
      order_date: record.order_date ? parseISO(record.order_date) : null,
      document_status: record.document_status,
      original_document_data: record.original_document_data || "",
      delivery_method: record.delivery_method,
      delivery_details: record.delivery_details || "",
      notes: record.notes || "",
    });
    setEditingRecord(record);
  };

  // Save record
  const handleSave = () => {
    if (!formData.full_name.trim()) {
      toast.error("Введите ФИО выпускника");
      return;
    }
    if (!formData.reg_number.trim()) {
      toast.error("Введите регистрационный номер");
      return;
    }
    if (!formData.document_number.trim()) {
      toast.error("Введите номер документа");
      return;
    }
    if (!formData.specialty_name.trim()) {
      toast.error("Введите наименование специальности");
      return;
    }

    setSaving(true);

    try {
      const recordData: EducationDocumentRecord = {
        id: editingRecord?.id || crypto.randomUUID(),
        reg_number: formData.reg_number.trim(),
        full_name: formData.full_name.trim(),
        birth_date: formData.birth_date?.toISOString() || "",
        document_type: formData.document_type,
        document_series: formData.document_series.trim(),
        document_number: formData.document_number.trim(),
        issue_date: formData.issue_date.toISOString(),
        specialty_name: formData.specialty_name.trim(),
        qualification_name: formData.qualification_name.trim(),
        protocol_number: formData.protocol_number.trim(),
        protocol_date: formData.protocol_date?.toISOString() || "",
        order_number: formData.order_number.trim(),
        order_date: formData.order_date?.toISOString() || "",
        document_status: formData.document_status,
        original_document_data: formData.document_status === "duplicate" ? formData.original_document_data.trim() : null,
        delivery_method: formData.delivery_method,
        delivery_details: formData.delivery_method !== "personal" ? formData.delivery_details.trim() : null,
        notes: formData.notes.trim() || null,
      };

      let newRecords: EducationDocumentRecord[];

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
  const exportToExcel = () => {
    if (filteredRecords.length === 0) {
      toast.error("Нет данных для экспорта");
      return;
    }

    const exportData = filteredRecords.map((record, index) => ({
      "№ п/п": index + 1,
      "Рег. номер": record.reg_number,
      "ФИО выпускника": record.full_name,
      "Дата рождения": record.birth_date ? format(parseISO(record.birth_date), "dd.MM.yyyy", { locale: ru }) : "—",
      "Тип документа": DOCUMENT_TYPES.find((t) => t.value === record.document_type)?.label || "",
      "Серия": record.document_series || "—",
      "Номер": record.document_number,
      "Дата выдачи": format(parseISO(record.issue_date), "dd.MM.yyyy", { locale: ru }),
      "Специальность/направление": record.specialty_name,
      "Квалификация": record.qualification_name || "—",
      "№ протокола ГЭК": record.protocol_number || "—",
      "Дата протокола": record.protocol_date ? format(parseISO(record.protocol_date), "dd.MM.yyyy", { locale: ru }) : "—",
      "№ приказа об отчислении": record.order_number || "—",
      "Дата приказа": record.order_date ? format(parseISO(record.order_date), "dd.MM.yyyy", { locale: ru }) : "—",
      "Статус": record.document_status === "original" ? "Оригинал" : "Дубликат",
      "Данные оригинала (для дубликата)": record.original_document_data || "—",
      "Способ получения": DELIVERY_METHODS.find((m) => m.value === record.delivery_method)?.label || "",
      "Детали получения": record.delivery_details || "—",
      "Примечания": record.notes || "—",
    }));

    const worksheet = XLSX.utils.json_to_sheet(exportData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Документы об образовании");

    const columnWidths = [
      { wch: 8 }, { wch: 18 }, { wch: 35 }, { wch: 14 }, { wch: 25 },
      { wch: 10 }, { wch: 15 }, { wch: 14 }, { wch: 40 }, { wch: 25 },
      { wch: 15 }, { wch: 14 }, { wch: 20 }, { wch: 14 }, { wch: 12 },
      { wch: 30 }, { wch: 20 }, { wch: 30 }, { wch: 30 },
    ];
    worksheet["!cols"] = columnWidths;

    const fileName = `Журнал_документов_об_образовании_${format(new Date(), "dd-MM-yyyy")}.xlsx`;
    XLSX.writeFile(workbook, fileName);
    toast.success("Журнал экспортирован в Excel");
  };

  if (loading) {
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
            <h2 className="text-xl font-semibold">Журнал регистрации документов об образовании</h2>
            <p className="text-sm text-muted-foreground">
              Учёт выданных удостоверений, дипломов и свидетельств о квалификации
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
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
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
              <Award className="w-5 h-5 text-green-500" />
            </div>
            <div>
              <p className="text-2xl font-bold">{stats.certificates}</p>
              <p className="text-xs text-muted-foreground">Удостоверений</p>
            </div>
          </div>
        </div>
        <div className="bg-card rounded-xl border border-border p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-purple-500/10 flex items-center justify-center">
              <GraduationCap className="w-5 h-5 text-purple-500" />
            </div>
            <div>
              <p className="text-2xl font-bold">{stats.diplomas}</p>
              <p className="text-xs text-muted-foreground">Дипломов</p>
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
              placeholder="Поиск по ФИО, номеру документа..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 rounded-xl"
            />
          </div>

          <Select value={selectedDocType} onValueChange={setSelectedDocType}>
            <SelectTrigger className="w-[200px] rounded-xl">
              <SelectValue placeholder="Тип документа" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Все типы</SelectItem>
              {DOCUMENT_TYPES.map((type) => (
                <SelectItem key={type.value} value={type.value}>
                  {type.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={selectedStatus} onValueChange={setSelectedStatus}>
            <SelectTrigger className="w-[160px] rounded-xl">
              <SelectValue placeholder="Статус" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Все статусы</SelectItem>
              <SelectItem value="original">Оригиналы</SelectItem>
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
                  <TableHead className="w-32">Рег. номер</TableHead>
                  <TableHead>ФИО выпускника</TableHead>
                  <TableHead>Документ</TableHead>
                  <TableHead>Специальность</TableHead>
                  <TableHead className="text-center">Дата выдачи</TableHead>
                  <TableHead>Статус</TableHead>
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
                      <div>
                        <div className="font-medium">{record.full_name}</div>
                        {record.birth_date && (
                          <div className="text-xs text-muted-foreground">
                            Дата рождения: {format(parseISO(record.birth_date), "dd.MM.yyyy")}
                          </div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div>
                        <Badge variant="secondary" className="rounded mb-1">
                          {DOCUMENT_TYPES.find((t) => t.value === record.document_type)?.label}
                        </Badge>
                        <div className="text-xs text-muted-foreground">
                          {record.document_series && `Серия: ${record.document_series}, `}
                          № {record.document_number}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="max-w-[200px]">
                        <div className="text-sm truncate">{record.specialty_name}</div>
                        {record.qualification_name && (
                          <div className="text-xs text-muted-foreground truncate">
                            {record.qualification_name}
                          </div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-center">
                      {format(parseISO(record.issue_date), "dd.MM.yyyy")}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={cn(
                          "rounded",
                          record.document_status === "original"
                            ? "bg-green-500/10 text-green-600 border-green-500/30"
                            : "bg-amber-500/10 text-amber-600 border-amber-500/30"
                        )}
                      >
                        {record.document_status === "original" ? "Оригинал" : "Дубликат"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="rounded-lg h-8 w-8"
                          onClick={() => handleOpenEdit(record)}
                        >
                          <Pencil className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="rounded-lg h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
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
        <div className="bg-card rounded-2xl border border-border p-12">
          <div className="text-center">
            <div className="w-16 h-16 rounded-full bg-muted/50 flex items-center justify-center mx-auto mb-4">
              <GraduationCap className="w-8 h-8 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-medium mb-2">Записей не найдено</h3>
            <p className="text-sm text-muted-foreground mb-4">
              {searchQuery || selectedDocType !== "all" || selectedStatus !== "all"
                ? "Попробуйте изменить параметры поиска"
                : "Добавьте первую запись в журнал"}
            </p>
            {!searchQuery && selectedDocType === "all" && selectedStatus === "all" && (
              <Button onClick={handleOpenAdd} className="rounded-xl">
                <Plus className="w-4 h-4 mr-2" />
                Добавить запись
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Add/Edit Dialog */}
      <Dialog
        open={showAddDialog || !!editingRecord}
        onOpenChange={() => {
          setShowAddDialog(false);
          setEditingRecord(null);
          resetForm();
        }}
      >
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingRecord ? "Редактирование записи" : "Добавление записи в журнал"}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-6 py-4">
            {/* Registration Number */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Регистрационный номер *</Label>
                <div className="flex gap-2">
                  <Input
                    value={formData.reg_number}
                    onChange={(e) =>
                      setFormData((prev) => ({ ...prev, reg_number: e.target.value }))
                    }
                    placeholder="ДОК-2025/0001"
                    className="rounded-xl"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={generateRegNumber}
                    className="rounded-xl shrink-0"
                  >
                    <Hash className="w-4 h-4 mr-1" />
                    Генерировать
                  </Button>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Дата выдачи документа *</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        "w-full justify-start text-left font-normal rounded-xl",
                        !formData.issue_date && "text-muted-foreground"
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {formData.issue_date
                        ? format(formData.issue_date, "dd MMMM yyyy", { locale: ru })
                        : "Выберите дату"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={formData.issue_date}
                      onSelect={(date) =>
                        setFormData((prev) => ({ ...prev, issue_date: date || new Date() }))
                      }
                      locale={ru}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
              </div>
            </div>

            {/* Graduate Info */}
            <div className="space-y-4">
              <h4 className="font-medium flex items-center gap-2">
                <User className="w-4 h-4" />
                Данные выпускника
              </h4>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>ФИО выпускника (как в паспорте) *</Label>
                  <Input
                    value={formData.full_name}
                    onChange={(e) =>
                      setFormData((prev) => ({ ...prev, full_name: e.target.value }))
                    }
                    placeholder="Иванов Иван Иванович"
                    className="rounded-xl"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Дата рождения</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className={cn(
                          "w-full justify-start text-left font-normal rounded-xl",
                          !formData.birth_date && "text-muted-foreground"
                        )}
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {formData.birth_date
                          ? format(formData.birth_date, "dd MMMM yyyy", { locale: ru })
                          : "Выберите дату"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={formData.birth_date || undefined}
                        onSelect={(date) =>
                          setFormData((prev) => ({ ...prev, birth_date: date || null }))
                        }
                        locale={ru}
                        captionLayout="dropdown-buttons"
                        fromYear={1940}
                        toYear={new Date().getFullYear()}
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>
                </div>
              </div>
            </div>

            {/* Document Info */}
            <div className="space-y-4">
              <h4 className="font-medium flex items-center gap-2">
                <Award className="w-4 h-4" />
                Данные документа
              </h4>
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>Тип документа *</Label>
                  <Select
                    value={formData.document_type}
                    onValueChange={(value) =>
                      setFormData((prev) => ({
                        ...prev,
                        document_type: value as "certificate" | "diploma" | "qualification",
                      }))
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
                <div className="space-y-2">
                  <Label>Серия документа</Label>
                  <Input
                    value={formData.document_series}
                    onChange={(e) =>
                      setFormData((prev) => ({ ...prev, document_series: e.target.value }))
                    }
                    placeholder="ПП"
                    className="rounded-xl"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Номер документа *</Label>
                  <Input
                    value={formData.document_number}
                    onChange={(e) =>
                      setFormData((prev) => ({ ...prev, document_number: e.target.value }))
                    }
                    placeholder="0000001"
                    className="rounded-xl"
                  />
                </div>
              </div>
            </div>

            {/* Education Info */}
            <div className="space-y-4">
              <h4 className="font-medium flex items-center gap-2">
                <GraduationCap className="w-4 h-4" />
                Сведения об образовании
              </h4>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Наименование специальности / направления подготовки / профессии *</Label>
                  <Textarea
                    value={formData.specialty_name}
                    onChange={(e) =>
                      setFormData((prev) => ({ ...prev, specialty_name: e.target.value }))
                    }
                    placeholder="Охрана труда"
                    className="rounded-xl min-h-[80px]"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Присвоенная квалификация</Label>
                  <Textarea
                    value={formData.qualification_name}
                    onChange={(e) =>
                      setFormData((prev) => ({ ...prev, qualification_name: e.target.value }))
                    }
                    placeholder="Специалист по охране труда"
                    className="rounded-xl min-h-[80px]"
                  />
                </div>
              </div>
            </div>

            {/* Protocol and Order Info */}
            <div className="space-y-4">
              <h4 className="font-medium">Основания выдачи</h4>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Номер протокола ГЭК</Label>
                  <Input
                    value={formData.protocol_number}
                    onChange={(e) =>
                      setFormData((prev) => ({ ...prev, protocol_number: e.target.value }))
                    }
                    placeholder="1"
                    className="rounded-xl"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Дата протокола ГЭК</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className={cn(
                          "w-full justify-start text-left font-normal rounded-xl",
                          !formData.protocol_date && "text-muted-foreground"
                        )}
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {formData.protocol_date
                          ? format(formData.protocol_date, "dd MMMM yyyy", { locale: ru })
                          : "Выберите дату"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={formData.protocol_date || undefined}
                        onSelect={(date) =>
                          setFormData((prev) => ({ ...prev, protocol_date: date || null }))
                        }
                        locale={ru}
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>
                </div>
                <div className="space-y-2">
                  <Label>Номер приказа об отчислении</Label>
                  <Input
                    value={formData.order_number}
                    onChange={(e) =>
                      setFormData((prev) => ({ ...prev, order_number: e.target.value }))
                    }
                    placeholder="12-ОТ"
                    className="rounded-xl"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Дата приказа</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className={cn(
                          "w-full justify-start text-left font-normal rounded-xl",
                          !formData.order_date && "text-muted-foreground"
                        )}
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {formData.order_date
                          ? format(formData.order_date, "dd MMMM yyyy", { locale: ru })
                          : "Выберите дату"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={formData.order_date || undefined}
                        onSelect={(date) =>
                          setFormData((prev) => ({ ...prev, order_date: date || null }))
                        }
                        locale={ru}
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>
                </div>
              </div>
            </div>

            {/* Document Status */}
            <div className="space-y-4">
              <h4 className="font-medium">Статус документа</h4>
              <RadioGroup
                value={formData.document_status}
                onValueChange={(value) =>
                  setFormData((prev) => ({
                    ...prev,
                    document_status: value as "original" | "duplicate",
                  }))
                }
                className="flex gap-6"
              >
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="original" id="original" />
                  <Label htmlFor="original" className="cursor-pointer">
                    Оригинал
                  </Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="duplicate" id="duplicate" />
                  <Label htmlFor="duplicate" className="cursor-pointer">
                    Дубликат
                  </Label>
                </div>
              </RadioGroup>

              {formData.document_status === "duplicate" && (
                <div className="space-y-2">
                  <Label>Данные заменяемого оригинала</Label>
                  <Textarea
                    value={formData.original_document_data}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        original_document_data: e.target.value,
                      }))
                    }
                    placeholder="Серия ПП № 0000001 от 01.01.2024, причина замены: утеря"
                    className="rounded-xl"
                  />
                </div>
              )}
            </div>

            {/* Delivery Info */}
            <div className="space-y-4">
              <h4 className="font-medium flex items-center gap-2">
                <Mail className="w-4 h-4" />
                Сведения о получении
              </h4>
              <div className="space-y-2">
                <Label>Способ получения</Label>
                <Select
                  value={formData.delivery_method}
                  onValueChange={(value) =>
                    setFormData((prev) => ({
                      ...prev,
                      delivery_method: value as "personal" | "representative" | "postal",
                    }))
                  }
                >
                  <SelectTrigger className="rounded-xl">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DELIVERY_METHODS.map((method) => (
                      <SelectItem key={method.value} value={method.value}>
                        {method.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {formData.delivery_method !== "personal" && (
                <div className="space-y-2">
                  <Label>
                    {formData.delivery_method === "representative"
                      ? "Данные представителя (ФИО, доверенность)"
                      : "Номер почтового отправления"}
                  </Label>
                  <Input
                    value={formData.delivery_details}
                    onChange={(e) =>
                      setFormData((prev) => ({ ...prev, delivery_details: e.target.value }))
                    }
                    placeholder={
                      formData.delivery_method === "representative"
                        ? "Петров П.П., доверенность № 1 от 01.01.2025"
                        : "80123456789012"
                    }
                    className="rounded-xl"
                  />
                </div>
              )}
            </div>

            {/* Notes */}
            <div className="space-y-2">
              <Label>Примечания</Label>
              <Textarea
                value={formData.notes}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, notes: e.target.value }))
                }
                placeholder="Дополнительные сведения..."
                className="rounded-xl"
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowAddDialog(false);
                setEditingRecord(null);
                resetForm();
              }}
              className="rounded-xl"
            >
              Отмена
            </Button>
            <Button onClick={handleSave} disabled={saving} className="rounded-xl">
              {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {editingRecord ? "Сохранить" : "Добавить"}
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
              Вы уверены, что хотите удалить запись для{" "}
              <strong>{deletingRecord?.full_name}</strong> (рег. номер:{" "}
              {deletingRecord?.reg_number})? Это действие нельзя отменить.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Отмена</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive hover:bg-destructive/90"
            >
              Удалить
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
