import { useState, useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  ArrowLeft,
  Calendar as CalendarIcon,
  Search,
  Loader2,
  FileSpreadsheet,
  FileText,
  FileCheck,
  ArrowDownLeft,
  ArrowUpRight,
  Building2,
  User,
  Hash,
  Pencil,
} from "lucide-react";
import { format, parseISO, startOfYear, endOfYear, isWithinInterval } from "date-fns";
import { ru } from "date-fns/locale";
import { cn } from "@/lib/utils";
import * as XLSX from "xlsx";
import { Badge } from "@/components/ui/badge";

interface DocumentRecord {
  id: string;
  original_id: string; // ID without prefixes for DB updates
  reg_number: string | null;
  document_type: string;
  document_name: string;
  direction: "incoming" | "outgoing";
  date: string;
  related_entity: string | null;
  related_entity_type: "student" | "company" | "organization" | null;
  notes: string | null;
  source: "issuance_log" | "company_document" | "enrollment";
  is_editable: boolean; // Can this record's reg_number be edited in DB
}

interface AutoDocumentRegistrationJournalProps {
  organizationId: string;
  onClose: () => void;
}

const DOCUMENT_TYPE_LABELS: Record<string, { label: string; icon: typeof FileText; prefix: string }> = {
  contract: { label: "Договор", icon: FileCheck, prefix: "ДОГ" },
  enrollment_order: { label: "Приказ о зачислении", icon: ArrowDownLeft, prefix: "ПР-З" },
  expulsion_order: { label: "Приказ об отчислении", icon: ArrowUpRight, prefix: "ПР-О" },
  certificate: { label: "Удостоверение", icon: FileText, prefix: "УД" },
  diploma: { label: "Диплом", icon: FileText, prefix: "ДП" },
  protocol: { label: "Протокол", icon: FileText, prefix: "ПРТ" },
  invoice: { label: "Счёт", icon: FileText, prefix: "СЧ" },
  act: { label: "Акт", icon: FileText, prefix: "АКТ" },
  other: { label: "Прочее", icon: FileText, prefix: "ПР" },
};

// Generate automatic registration number based on year and document type
const generateRegNumber = (
  docType: string,
  date: string,
  index: number,
  typeCounters: Map<string, Map<number, number>>
): string => {
  const docDate = parseISO(date);
  const year = docDate.getFullYear();
  const prefix = DOCUMENT_TYPE_LABELS[docType]?.prefix || "ПР";
  
  // Get or initialize the counter for this type and year
  if (!typeCounters.has(docType)) {
    typeCounters.set(docType, new Map());
  }
  const yearCounters = typeCounters.get(docType)!;
  
  if (!yearCounters.has(year)) {
    yearCounters.set(year, 0);
  }
  
  const currentCount = yearCounters.get(year)! + 1;
  yearCounters.set(year, currentCount);
  
  // Format: PREFIX-YYYY/NNN (e.g., ДОГ-2025/001)
  return `${prefix}-${year}/${currentCount.toString().padStart(3, "0")}`;
};

export function AutoDocumentRegistrationJournal({
  organizationId,
  onClose,
}: AutoDocumentRegistrationJournalProps) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [records, setRecords] = useState<DocumentRecord[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedType, setSelectedType] = useState<string>("all");
  const [selectedDirection, setSelectedDirection] = useState<string>("all");
  const [dateRange, setDateRange] = useState<{
    from: Date;
    to: Date;
  }>({
    from: startOfYear(new Date()),
    to: endOfYear(new Date()),
  });
  
  // Edit dialog state
  const [editingRecord, setEditingRecord] = useState<DocumentRecord | null>(null);
  const [editRegNumber, setEditRegNumber] = useState("");

  // Fetch all document data
  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const documentRecords: DocumentRecord[] = [];

        // 1. Fetch from document_issuance_log (issued documents - outgoing)
        const { data: issuanceLog } = await supabase
          .from("document_issuance_log")
          .select("*")
          .eq("organization_id", organizationId)
          .order("issued_at", { ascending: false });

        for (const doc of issuanceLog || []) {
          let docType = "other";
          const nameLower = doc.document_name.toLowerCase();
          if (nameLower.includes("договор")) docType = "contract";
          else if (nameLower.includes("зачисл") || nameLower.includes("приказ") && nameLower.includes("зачисл")) docType = "enrollment_order";
          else if (nameLower.includes("отчисл")) docType = "expulsion_order";
          else if (nameLower.includes("удостовер")) docType = "certificate";
          else if (nameLower.includes("диплом")) docType = "diploma";
          else if (nameLower.includes("протокол")) docType = "protocol";
          else if (nameLower.includes("счёт") || nameLower.includes("счет")) docType = "invoice";
          else if (nameLower.includes("акт")) docType = "act";

          documentRecords.push({
            id: doc.id,
            original_id: doc.id,
            reg_number: doc.reg_number,
            document_type: docType,
            document_name: doc.document_name,
            direction: "outgoing",
            date: doc.issued_at,
            related_entity: doc.user_name,
            related_entity_type: "student",
            notes: doc.send_method ? `Отправлено: ${doc.send_method}` : null,
            source: "issuance_log",
            is_editable: true,
          });
        }

        // 2. Fetch company documents (contracts - can be incoming or outgoing)
        const { data: companyDocs } = await supabase
          .from("company_documents")
          .select(`
            *,
            companies:company_id (name)
          `)
          .order("uploaded_at", { ascending: false });

        // Filter by organization through companies
        const { data: orgCompanies } = await supabase
          .from("companies")
          .select("id, name")
          .eq("organization_id", organizationId);

        const orgCompanyIds = new Set(orgCompanies?.map((c) => c.id) || []);

        for (const doc of companyDocs || []) {
          if (!orgCompanyIds.has(doc.company_id)) continue;

          let docType = "other";
          if (doc.type === "contract" || doc.name.toLowerCase().includes("договор")) {
            docType = "contract";
          } else if (doc.type === "invoice" || doc.name.toLowerCase().includes("счёт")) {
            docType = "invoice";
          } else if (doc.type === "act" || doc.name.toLowerCase().includes("акт")) {
            docType = "act";
          }

          documentRecords.push({
            id: doc.id,
            original_id: doc.id,
            reg_number: doc.contract_number,
            document_type: docType,
            document_name: doc.name,
            direction: doc.type === "contract" ? "incoming" : "outgoing",
            date: doc.contract_date || doc.uploaded_at,
            related_entity: (doc.companies as any)?.name || null,
            related_entity_type: "company",
            notes: doc.amount ? `Сумма: ${doc.amount} ₽` : null,
            source: "company_document",
            is_editable: true,
          });
        }

        // 3. Fetch enrollment history for orders
        const { data: enrollmentHistory } = await supabase
          .from("enrollment_history")
          .select(`
            *,
            courses:course_id (title, organization_id)
          `)
          .order("created_at", { ascending: false });

        // Get user profiles for enrollment history
        const enrollmentUserIds = enrollmentHistory?.map((e) => e.user_id) || [];
        const { data: profiles } = await supabase
          .from("profiles")
          .select("user_id, full_name, email")
          .in("user_id", enrollmentUserIds);

        const profileMap = new Map(profiles?.map((p) => [p.user_id, p]) || []);

        for (const entry of enrollmentHistory || []) {
          const course = entry.courses as any;
          if (!course || course.organization_id !== organizationId) continue;

          const profile = profileMap.get(entry.user_id);
          const studentName = profile?.full_name || profile?.email || "Неизвестный";

          if (entry.action === "enrolled") {
            documentRecords.push({
              id: `enrollment_${entry.id}`,
              original_id: entry.id,
              reg_number: entry.enrollment_id ? `ПР-${entry.enrollment_id.slice(0, 8).toUpperCase()}` : null,
              document_type: "enrollment_order",
              document_name: `Приказ о зачислении на курс "${course.title}"`,
              direction: "outgoing",
              date: entry.created_at,
              related_entity: studentName,
              related_entity_type: "student",
              notes: null,
              source: "enrollment",
              is_editable: false, // enrollment_history has no reg_number field
            });
          } else if (entry.action === "completed" || entry.action === "expelled") {
            documentRecords.push({
              id: `expulsion_${entry.id}`,
              original_id: entry.id,
              reg_number: entry.enrollment_id ? `ПР-${entry.enrollment_id.slice(0, 8).toUpperCase()}` : null,
              document_type: entry.action === "completed" ? "certificate" : "expulsion_order",
              document_name: entry.action === "completed" 
                ? `Завершение обучения на курсе "${course.title}"`
                : `Приказ об отчислении с курса "${course.title}"`,
              direction: "outgoing",
              date: entry.created_at,
              related_entity: studentName,
              related_entity_type: "student",
              notes: null,
              source: "enrollment",
              is_editable: false, // enrollment_history has no reg_number field
            });
          }
        }

        // Sort by date ascending first for proper numbering
        documentRecords.sort((a, b) => 
          new Date(a.date).getTime() - new Date(b.date).getTime()
        );

        // Generate automatic registration numbers for documents without them
        const typeCounters = new Map<string, Map<number, number>>();
        
        const numberedRecords = documentRecords.map((record) => {
          // If already has a reg_number, use it but still track the count
          if (record.reg_number) {
            return record;
          }
          
          // Generate auto number
          const autoRegNumber = generateRegNumber(
            record.document_type,
            record.date,
            0,
            typeCounters
          );
          
          return {
            ...record,
            reg_number: autoRegNumber,
          };
        });

        // Sort back by date descending for display
        numberedRecords.sort((a, b) => 
          new Date(b.date).getTime() - new Date(a.date).getTime()
        );

        setRecords(numberedRecords);
      } catch (error) {
        console.error("Error fetching documents:", error);
        toast.error("Ошибка при загрузке данных");
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [organizationId]);

  // Filter records
  const filteredRecords = useMemo(() => {
    return records.filter((record) => {
      // Search filter
      const searchLower = searchQuery.toLowerCase();
      const matchesSearch =
        !searchQuery ||
        record.document_name.toLowerCase().includes(searchLower) ||
        (record.reg_number?.toLowerCase().includes(searchLower)) ||
        (record.related_entity?.toLowerCase().includes(searchLower));

      // Type filter
      const matchesType =
        selectedType === "all" || record.document_type === selectedType;

      // Direction filter
      const matchesDirection =
        selectedDirection === "all" || record.direction === selectedDirection;

      // Date filter
      const recordDate = parseISO(record.date);
      const matchesDate = isWithinInterval(recordDate, {
        start: dateRange.from,
        end: dateRange.to,
      });

      return matchesSearch && matchesType && matchesDirection && matchesDate;
    });
  }, [records, searchQuery, selectedType, selectedDirection, dateRange]);

  // Statistics
  const stats = useMemo(() => {
    const incoming = filteredRecords.filter((r) => r.direction === "incoming").length;
    const outgoing = filteredRecords.filter((r) => r.direction === "outgoing").length;
    const contracts = filteredRecords.filter((r) => r.document_type === "contract").length;
    const orders = filteredRecords.filter(
      (r) => r.document_type === "enrollment_order" || r.document_type === "expulsion_order"
    ).length;

    return { incoming, outgoing, contracts, orders, total: filteredRecords.length };
  }, [filteredRecords]);

  // Open edit dialog
  const handleEditClick = (record: DocumentRecord) => {
    if (!record.is_editable) {
      toast.info("Этот документ нельзя редактировать");
      return;
    }
    setEditingRecord(record);
    setEditRegNumber(record.reg_number || "");
  };

  // Save registration number to database
  const handleSaveRegNumber = async () => {
    if (!editingRecord) return;
    
    setSaving(true);
    try {
      const newRegNumber = editRegNumber.trim() || null;
      
      if (editingRecord.source === "issuance_log") {
        const { error } = await supabase
          .from("document_issuance_log")
          .update({ reg_number: newRegNumber })
          .eq("id", editingRecord.original_id);
          
        if (error) throw error;
      } else if (editingRecord.source === "company_document") {
        const { error } = await supabase
          .from("company_documents")
          .update({ contract_number: newRegNumber })
          .eq("id", editingRecord.original_id);
          
        if (error) throw error;
      }
      
      // Update local state
      setRecords((prev) =>
        prev.map((r) =>
          r.id === editingRecord.id ? { ...r, reg_number: newRegNumber } : r
        )
      );
      
      toast.success("Регистрационный номер сохранён");
      setEditingRecord(null);
      setEditRegNumber("");
    } catch (error) {
      console.error("Error saving reg number:", error);
      toast.error("Ошибка при сохранении");
    } finally {
      setSaving(false);
    }
  };

  // Generate suggested number for document
  const generateSuggestedNumber = () => {
    if (!editingRecord) return;
    
    const year = parseISO(editingRecord.date).getFullYear();
    const prefix = DOCUMENT_TYPE_LABELS[editingRecord.document_type]?.prefix || "ПР";
    
    // Count existing documents of this type in this year
    const sameTypeYearCount = records.filter((r) => {
      const rYear = parseISO(r.date).getFullYear();
      return r.document_type === editingRecord.document_type && rYear === year;
    }).length;
    
    const suggestedNumber = `${prefix}-${year}/${(sameTypeYearCount + 1).toString().padStart(3, "0")}`;
    setEditRegNumber(suggestedNumber);
  };

  // Export to Excel
  const exportToExcel = () => {
    if (filteredRecords.length === 0) {
      toast.error("Нет данных для экспорта");
      return;
    }

    const exportData = filteredRecords.map((record, index) => ({
      "№ п/п": index + 1,
      "Рег. номер": record.reg_number || "—",
      "Тип документа": DOCUMENT_TYPE_LABELS[record.document_type]?.label || record.document_type,
      "Наименование": record.document_name,
      "Направление": record.direction === "incoming" ? "Входящий" : "Исходящий",
      "Дата": format(parseISO(record.date), "dd.MM.yyyy", { locale: ru }),
      "Контрагент/Лицо": record.related_entity || "—",
      "Примечание": record.notes || "—",
    }));

    const worksheet = XLSX.utils.json_to_sheet(exportData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Журнал документов");

    // Auto-width columns
    const columnWidths = [
      { wch: 8 },  // № п/п
      { wch: 15 }, // Рег. номер
      { wch: 22 }, // Тип
      { wch: 50 }, // Наименование
      { wch: 12 }, // Направление
      { wch: 12 }, // Дата
      { wch: 30 }, // Контрагент
      { wch: 25 }, // Примечание
    ];
    worksheet["!cols"] = columnWidths;

    const fileName = `Журнал_регистрации_документов_${format(new Date(), "dd-MM-yyyy")}.xlsx`;
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
            <h2 className="text-xl font-semibold">Журнал регистрации документов</h2>
            <p className="text-sm text-muted-foreground">
              Входящие и исходящие документы: договоры, приказы, счета
            </p>
          </div>
        </div>
        <Button onClick={exportToExcel} className="rounded-xl">
          <FileSpreadsheet className="w-4 h-4 mr-2" />
          Экспорт в Excel
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <div className="bg-card rounded-xl border border-border p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center">
              <FileText className="w-5 h-5 text-blue-500" />
            </div>
            <div>
              <p className="text-2xl font-bold">{stats.total}</p>
              <p className="text-xs text-muted-foreground">Всего</p>
            </div>
          </div>
        </div>
        <div className="bg-card rounded-xl border border-border p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-green-500/10 flex items-center justify-center">
              <ArrowDownLeft className="w-5 h-5 text-green-500" />
            </div>
            <div>
              <p className="text-2xl font-bold">{stats.incoming}</p>
              <p className="text-xs text-muted-foreground">Входящих</p>
            </div>
          </div>
        </div>
        <div className="bg-card rounded-xl border border-border p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-amber-500/10 flex items-center justify-center">
              <ArrowUpRight className="w-5 h-5 text-amber-500" />
            </div>
            <div>
              <p className="text-2xl font-bold">{stats.outgoing}</p>
              <p className="text-xs text-muted-foreground">Исходящих</p>
            </div>
          </div>
        </div>
        <div className="bg-card rounded-xl border border-border p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-purple-500/10 flex items-center justify-center">
              <FileCheck className="w-5 h-5 text-purple-500" />
            </div>
            <div>
              <p className="text-2xl font-bold">{stats.contracts}</p>
              <p className="text-xs text-muted-foreground">Договоров</p>
            </div>
          </div>
        </div>
        <div className="bg-card rounded-xl border border-border p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-indigo-500/10 flex items-center justify-center">
              <Hash className="w-5 h-5 text-indigo-500" />
            </div>
            <div>
              <p className="text-2xl font-bold">{stats.orders}</p>
              <p className="text-xs text-muted-foreground">Приказов</p>
            </div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-card rounded-2xl border border-border p-4">
        <div className="flex flex-wrap items-center gap-4">
          {/* Search */}
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Поиск по названию, номеру, контрагенту..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 rounded-xl"
            />
          </div>

          {/* Type filter */}
          <Select value={selectedType} onValueChange={setSelectedType}>
            <SelectTrigger className="w-[200px] rounded-xl">
              <SelectValue placeholder="Все типы" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Все типы</SelectItem>
              <SelectItem value="contract">Договоры</SelectItem>
              <SelectItem value="enrollment_order">Приказы о зачислении</SelectItem>
              <SelectItem value="expulsion_order">Приказы об отчислении</SelectItem>
              <SelectItem value="certificate">Удостоверения</SelectItem>
              <SelectItem value="diploma">Дипломы</SelectItem>
              <SelectItem value="invoice">Счета</SelectItem>
              <SelectItem value="act">Акты</SelectItem>
            </SelectContent>
          </Select>

          {/* Direction filter */}
          <Select value={selectedDirection} onValueChange={setSelectedDirection}>
            <SelectTrigger className="w-[160px] rounded-xl">
              <SelectValue placeholder="Все" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Все направления</SelectItem>
              <SelectItem value="incoming">Входящие</SelectItem>
              <SelectItem value="outgoing">Исходящие</SelectItem>
            </SelectContent>
          </Select>

          {/* Date range */}
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className="rounded-xl gap-2">
                <CalendarIcon className="w-4 h-4" />
                {format(dateRange.from, "d MMM", { locale: ru })} —{" "}
                {format(dateRange.to, "d MMM yyyy", { locale: ru })}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="end">
              <Calendar
                mode="range"
                selected={{ from: dateRange.from, to: dateRange.to }}
                onSelect={(range) => {
                  if (range?.from && range?.to) {
                    setDateRange({ from: range.from, to: range.to });
                  } else if (range?.from) {
                    setDateRange({ from: range.from, to: range.from });
                  }
                }}
                locale={ru}
                numberOfMonths={2}
              />
            </PopoverContent>
          </Popover>

          {/* Quick year filter */}
          <Button
            variant="outline"
            size="sm"
            className="rounded-lg"
            onClick={() => {
              const now = new Date();
              setDateRange({
                from: startOfYear(now),
                to: endOfYear(now),
              });
            }}
          >
            {new Date().getFullYear()} год
          </Button>
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
                  <TableHead>Документ</TableHead>
                  <TableHead className="text-center">Направление</TableHead>
                  <TableHead>Контрагент / Лицо</TableHead>
                  <TableHead className="text-center">Дата</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredRecords.slice(0, 100).map((record, index) => {
                  const typeConfig = DOCUMENT_TYPE_LABELS[record.document_type] || DOCUMENT_TYPE_LABELS.other;
                  const TypeIcon = typeConfig.icon;

                  return (
                    <TableRow key={record.id}>
                      <TableCell className="text-center text-muted-foreground">
                        {index + 1}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          {record.reg_number ? (
                            <Badge variant="outline" className="rounded font-mono">
                              {record.reg_number}
                            </Badge>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                          {record.is_editable && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6 opacity-50 hover:opacity-100"
                              onClick={() => handleEditClick(record)}
                            >
                              <Pencil className="w-3 h-3" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-start gap-2">
                          <div
                            className={cn(
                              "w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0",
                              record.document_type === "contract" && "bg-purple-500/10",
                              record.document_type === "enrollment_order" && "bg-green-500/10",
                              record.document_type === "expulsion_order" && "bg-red-500/10",
                              record.document_type === "certificate" && "bg-blue-500/10",
                              record.document_type === "diploma" && "bg-amber-500/10",
                              !["contract", "enrollment_order", "expulsion_order", "certificate", "diploma"].includes(record.document_type) && "bg-secondary"
                            )}
                          >
                            <TypeIcon
                              className={cn(
                                "w-4 h-4",
                                record.document_type === "contract" && "text-purple-500",
                                record.document_type === "enrollment_order" && "text-green-500",
                                record.document_type === "expulsion_order" && "text-red-500",
                                record.document_type === "certificate" && "text-blue-500",
                                record.document_type === "diploma" && "text-amber-500",
                                !["contract", "enrollment_order", "expulsion_order", "certificate", "diploma"].includes(record.document_type) && "text-muted-foreground"
                              )}
                            />
                          </div>
                          <div>
                            <p className="font-medium text-sm">{record.document_name}</p>
                            <p className="text-xs text-muted-foreground">{typeConfig.label}</p>
                            {record.notes && (
                              <p className="text-xs text-muted-foreground mt-0.5">{record.notes}</p>
                            )}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge
                          variant="outline"
                          className={cn(
                            "rounded",
                            record.direction === "incoming"
                              ? "border-green-500/50 text-green-600 bg-green-500/10"
                              : "border-amber-500/50 text-amber-600 bg-amber-500/10"
                          )}
                        >
                          {record.direction === "incoming" ? (
                            <>
                              <ArrowDownLeft className="w-3 h-3 mr-1" />
                              Вх.
                            </>
                          ) : (
                            <>
                              <ArrowUpRight className="w-3 h-3 mr-1" />
                              Исх.
                            </>
                          )}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {record.related_entity ? (
                          <div className="flex items-center gap-2">
                            {record.related_entity_type === "company" ? (
                              <Building2 className="w-4 h-4 text-muted-foreground" />
                            ) : (
                              <User className="w-4 h-4 text-muted-foreground" />
                            )}
                            <span className="text-sm">{record.related_entity}</span>
                          </div>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-center">
                        <span className="text-sm">
                          {format(parseISO(record.date), "dd.MM.yyyy", { locale: ru })}
                        </span>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
          {filteredRecords.length > 100 && (
            <div className="p-4 text-center text-sm text-muted-foreground border-t border-border">
              Показано 100 из {filteredRecords.length} записей. Используйте фильтры для уточнения.
            </div>
          )}
        </div>
      ) : (
        <div className="bg-card rounded-2xl border border-border p-8 text-center">
          <FileText className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
          <h3 className="font-semibold mb-2">Нет документов</h3>
          <p className="text-muted-foreground">
            {records.length === 0
              ? "Документы ещё не зарегистрированы"
              : "Нет документов, соответствующих фильтрам"}
          </p>
        </div>
      )}

      {/* Edit Registration Number Dialog */}
      <Dialog open={!!editingRecord} onOpenChange={(open) => !open && setEditingRecord(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Редактирование рег. номера</DialogTitle>
          </DialogHeader>
          
          {editingRecord && (
            <div className="space-y-4">
              <div className="bg-muted/50 rounded-lg p-3">
                <p className="text-sm font-medium">{editingRecord.document_name}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {DOCUMENT_TYPE_LABELS[editingRecord.document_type]?.label || "Документ"} • {format(parseISO(editingRecord.date), "dd.MM.yyyy", { locale: ru })}
                </p>
              </div>
              
              <div className="space-y-2">
                <label className="text-sm font-medium">Регистрационный номер</label>
                <div className="flex gap-2">
                  <Input
                    value={editRegNumber}
                    onChange={(e) => setEditRegNumber(e.target.value)}
                    placeholder="Например: ДОГ-2025/001"
                    className="flex-1"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={generateSuggestedNumber}
                    className="shrink-0"
                  >
                    <Hash className="w-4 h-4 mr-1" />
                    Авто
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Формат: ТИП-ГОД/НОМЕР (например, ДОГ-2025/001)
                </p>
              </div>
            </div>
          )}
          
          <DialogFooter className="flex gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => setEditingRecord(null)}
              disabled={saving}
            >
              Отмена
            </Button>
            <Button onClick={handleSaveRegNumber} disabled={saving}>
              {saving ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Сохранение...
                </>
              ) : (
                "Сохранить"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}