import { useState, useEffect, useMemo, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { parseISO, startOfYear, endOfYear, isWithinInterval, format } from "date-fns";
import { ru } from "date-fns/locale";
import { getXLSX } from "@/utils/xlsxHelper";
import { getSignedStorageUrl } from "@/utils/storageHelpers";
import { downloadHtmlFile } from "@/utils/downloadHtmlFile";

export interface DocumentRecord {
  id: string;
  original_id: string;
  reg_number: string | null;
  document_type: string;
  document_name: string;
  direction: "incoming" | "outgoing";
  date: string;
  related_entity: string | null;
  related_entity_type: "student" | "company" | "organization" | null;
  notes: string | null;
  source: "issuance_log" | "company_document" | "enrollment";
  is_editable: boolean;
  file_url: string | null;
}

export const DOCUMENT_TYPE_LABELS: Record<string, { label: string; prefix: string }> = {
  contract: { label: "Договор", prefix: "ДОГ" },
  enrollment_order: { label: "Приказ о зачислении", prefix: "ПР-З" },
  expulsion_order: { label: "Приказ об отчислении", prefix: "ПР-О" },
  certificate: { label: "Удостоверение", prefix: "УД" },
  diploma: { label: "Диплом", prefix: "ДП" },
  protocol: { label: "Протокол", prefix: "ПРТ" },
  invoice: { label: "Счёт", prefix: "СЧ" },
  act: { label: "Акт", prefix: "АКТ" },
  other: { label: "Прочее", prefix: "ПР" },
};

const generateRegNumber = (
  docType: string, date: string, _index: number,
  typeCounters: Map<string, Map<number, number>>
): string => {
  const docDate = parseISO(date);
  const year = docDate.getFullYear();
  const prefix = DOCUMENT_TYPE_LABELS[docType]?.prefix || "ПР";
  if (!typeCounters.has(docType)) typeCounters.set(docType, new Map());
  const yearCounters = typeCounters.get(docType)!;
  if (!yearCounters.has(year)) yearCounters.set(year, 0);
  const currentCount = yearCounters.get(year)! + 1;
  yearCounters.set(year, currentCount);
  return `${prefix}-${year}/${currentCount.toString().padStart(3, "0")}`;
};

export function useDocumentRegistrationJournal(organizationId: string) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [records, setRecords] = useState<DocumentRecord[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedType, setSelectedType] = useState("all");
  const [selectedDirection, setSelectedDirection] = useState("all");
  const [dateRange, setDateRange] = useState({ from: startOfYear(new Date()), to: endOfYear(new Date()) });
  const [editingRecord, setEditingRecord] = useState<DocumentRecord | null>(null);
  const [editRegNumber, setEditRegNumber] = useState("");
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [newDocument, setNewDocument] = useState({
    document_type: "contract", document_name: "", direction: "outgoing" as "incoming" | "outgoing",
    date: new Date(), related_entity: "", reg_number: "", notes: "",
  });

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const documentRecords: DocumentRecord[] = [];
        const { data: issuanceLog } = await supabase.from("document_issuance_log").select("*").eq("organization_id", organizationId).order("issued_at", { ascending: false });
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
          documentRecords.push({ id: doc.id, original_id: doc.id, reg_number: doc.reg_number, document_type: docType, document_name: doc.document_name, direction: "outgoing", date: doc.issued_at, related_entity: doc.user_name, related_entity_type: "student", notes: doc.send_method ? `Отправлено: ${doc.send_method}` : null, source: "issuance_log", is_editable: true, file_url: doc.file_url || null });
        }

        const { data: companyDocs } = await supabase.from("company_documents").select(`*, companies:company_id (name)`).order("uploaded_at", { ascending: false });
        const { data: orgCompanies } = await supabase.from("companies").select("id, name").eq("organization_id", organizationId);
        const orgCompanyIds = new Set(orgCompanies?.map(c => c.id) || []);
        for (const doc of companyDocs || []) {
          if (!orgCompanyIds.has(doc.company_id)) continue;
          let docType = "other";
          if (doc.type === "contract" || doc.name.toLowerCase().includes("договор")) docType = "contract";
          else if (doc.type === "invoice" || doc.name.toLowerCase().includes("счёт")) docType = "invoice";
          else if (doc.type === "act" || doc.name.toLowerCase().includes("акт")) docType = "act";
          documentRecords.push({ id: doc.id, original_id: doc.id, reg_number: doc.contract_number, document_type: docType, document_name: doc.name, direction: doc.type === "contract" ? "incoming" : "outgoing", date: doc.contract_date || doc.uploaded_at, related_entity: (doc.companies as any)?.name || null, related_entity_type: "company", notes: doc.amount ? `Сумма: ${doc.amount} ₽` : null, source: "company_document", is_editable: true, file_url: doc.file_url || null });
        }

        const { data: orgDocs } = await supabase.from("org_documents").select("id, name, file_url, type").eq("organization_id", organizationId);
        const orgDocFileMap = new Map<string, string>();
        for (const od of orgDocs || []) { if (od.file_url) orgDocFileMap.set(od.name.toLowerCase(), od.file_url); }

        const { data: enrollmentHistory } = await supabase.from("enrollment_history").select(`*, courses:course_id (title, organization_id)`).order("created_at", { ascending: false });
        const enrollmentUserIds = enrollmentHistory?.map(e => e.user_id) || [];
        const { data: profiles } = await supabase.from("profiles").select("user_id, full_name, email").in("user_id", enrollmentUserIds);
        const profileMap = new Map(profiles?.map(p => [p.user_id, p]) || []);
        for (const entry of enrollmentHistory || []) {
          const course = entry.courses as any;
          if (!course || course.organization_id !== organizationId) continue;
          const profile = profileMap.get(entry.user_id);
          const studentName = profile?.full_name || profile?.email || "Неизвестный";
          if (entry.action === "enrolled") {
            const docName = `Приказ о зачислении на курс "${course.title}"`;
            documentRecords.push({ id: `enrollment_${entry.id}`, original_id: entry.id, reg_number: entry.enrollment_id ? `ПР-${entry.enrollment_id.slice(0, 8).toUpperCase()}` : null, document_type: "enrollment_order", document_name: docName, direction: "outgoing", date: entry.created_at, related_entity: studentName, related_entity_type: "student", notes: null, source: "enrollment", is_editable: false, file_url: orgDocFileMap.get(docName.toLowerCase()) || null });
          } else if (entry.action === "completed" || entry.action === "expelled") {
            const docName = entry.action === "completed" ? `Завершение обучения на курсе "${course.title}"` : `Приказ об отчислении с курса "${course.title}"`;
            documentRecords.push({ id: `expulsion_${entry.id}`, original_id: entry.id, reg_number: entry.enrollment_id ? `ПР-${entry.enrollment_id.slice(0, 8).toUpperCase()}` : null, document_type: entry.action === "completed" ? "certificate" : "expulsion_order", document_name: docName, direction: "outgoing", date: entry.created_at, related_entity: studentName, related_entity_type: "student", notes: null, source: "enrollment", is_editable: false, file_url: orgDocFileMap.get(docName.toLowerCase()) || null });
          }
        }

        documentRecords.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
        const typeCounters = new Map<string, Map<number, number>>();
        const numberedRecords = documentRecords.map(record => {
          if (record.reg_number) return record;
          return { ...record, reg_number: generateRegNumber(record.document_type, record.date, 0, typeCounters) };
        });
        numberedRecords.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
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

  const filteredRecords = useMemo(() => {
    return records.filter(record => {
      const searchLower = searchQuery.toLowerCase();
      const matchesSearch = !searchQuery || record.document_name.toLowerCase().includes(searchLower) || (record.reg_number?.toLowerCase().includes(searchLower)) || (record.related_entity?.toLowerCase().includes(searchLower));
      const matchesType = selectedType === "all" || record.document_type === selectedType;
      const matchesDirection = selectedDirection === "all" || record.direction === selectedDirection;
      const recordDate = parseISO(record.date);
      const matchesDate = isWithinInterval(recordDate, { start: dateRange.from, end: dateRange.to });
      return matchesSearch && matchesType && matchesDirection && matchesDate;
    });
  }, [records, searchQuery, selectedType, selectedDirection, dateRange]);

  const stats = useMemo(() => {
    const incoming = filteredRecords.filter(r => r.direction === "incoming").length;
    const outgoing = filteredRecords.filter(r => r.direction === "outgoing").length;
    const contracts = filteredRecords.filter(r => r.document_type === "contract").length;
    const orders = filteredRecords.filter(r => r.document_type === "enrollment_order" || r.document_type === "expulsion_order").length;
    return { incoming, outgoing, contracts, orders, total: filteredRecords.length };
  }, [filteredRecords]);

  const handleViewDocument = useCallback(async (record: DocumentRecord) => {
    if (!record.file_url) return;
    try {
      if (record.file_url.startsWith("http")) { window.open(record.file_url, "_blank"); }
      else {
        const signedUrl = await getSignedStorageUrl("org-documents", record.file_url);
        if (signedUrl) { const res = await fetch(signedUrl); const html = await res.text(); const blob = new Blob([html], { type: "text/html" }); window.open(URL.createObjectURL(blob), "_blank"); }
        else toast.error("Не удалось открыть документ");
      }
    } catch { toast.error("Ошибка при открытии документа"); }
  }, []);

  const handleDownloadDocument = useCallback(async (record: DocumentRecord) => {
    if (!record.file_url) return;
    try {
      let url = record.file_url;
      if (!url.startsWith("http")) { const signedUrl = await getSignedStorageUrl("org-documents", url); if (!signedUrl) { toast.error("Не удалось скачать документ"); return; } url = signedUrl; }
      await downloadHtmlFile(url, record.document_name);
      toast.success("Документ скачан");
    } catch { toast.error("Ошибка при скачивании документа"); }
  }, []);

  const handleEditClick = useCallback((record: DocumentRecord) => {
    if (!record.is_editable) { toast.info("Этот документ нельзя редактировать"); return; }
    setEditingRecord(record);
    setEditRegNumber(record.reg_number || "");
  }, []);

  const handleSaveRegNumber = useCallback(async () => {
    if (!editingRecord) return;
    setSaving(true);
    try {
      const newRegNumber = editRegNumber.trim() || null;
      if (editingRecord.source === "issuance_log") {
        const { error } = await supabase.from("document_issuance_log").update({ reg_number: newRegNumber }).eq("id", editingRecord.original_id);
        if (error) throw error;
      } else if (editingRecord.source === "company_document") {
        const { error } = await supabase.from("company_documents").update({ contract_number: newRegNumber }).eq("id", editingRecord.original_id);
        if (error) throw error;
      }
      setRecords(prev => prev.map(r => r.id === editingRecord.id ? { ...r, reg_number: newRegNumber } : r));
      toast.success("Регистрационный номер сохранён");
      setEditingRecord(null);
      setEditRegNumber("");
    } catch { toast.error("Ошибка при сохранении"); }
    finally { setSaving(false); }
  }, [editingRecord, editRegNumber]);

  const generateSuggestedNumber = useCallback(() => {
    if (!editingRecord) return;
    const year = parseISO(editingRecord.date).getFullYear();
    const prefix = DOCUMENT_TYPE_LABELS[editingRecord.document_type]?.prefix || "ПР";
    const sameTypeYearCount = records.filter(r => { const rYear = parseISO(r.date).getFullYear(); return r.document_type === editingRecord.document_type && rYear === year; }).length;
    setEditRegNumber(`${prefix}-${year}/${(sameTypeYearCount + 1).toString().padStart(3, "0")}`);
  }, [editingRecord, records]);

  const handleAddDocument = useCallback(async () => {
    if (!newDocument.document_name.trim()) { toast.error("Введите наименование документа"); return; }
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { toast.error("Пользователь не авторизован"); return; }
      const { data: profile } = await supabase.from("profiles").select("full_name, email").eq("user_id", user.id).single();
      const userName = newDocument.related_entity.trim() || profile?.full_name || profile?.email || "Неизвестный";
      const { data: insertedDoc, error } = await supabase.from("document_issuance_log").insert({ organization_id: organizationId, user_id: user.id, user_name: userName, document_type: newDocument.document_type, document_name: newDocument.document_name.trim(), reg_number: newDocument.reg_number.trim() || null, issued_at: newDocument.date.toISOString(), send_method: newDocument.notes.trim() || null }).select().single();
      if (error) throw error;
      const newRecord: DocumentRecord = { id: insertedDoc.id, original_id: insertedDoc.id, reg_number: insertedDoc.reg_number, document_type: newDocument.document_type, document_name: insertedDoc.document_name, direction: newDocument.direction, date: insertedDoc.issued_at, related_entity: userName, related_entity_type: "student", notes: insertedDoc.send_method ? `Примечание: ${insertedDoc.send_method}` : null, source: "issuance_log", is_editable: true, file_url: null };
      setRecords(prev => [newRecord, ...prev]);
      setNewDocument({ document_type: "contract", document_name: "", direction: "outgoing", date: new Date(), related_entity: "", reg_number: "", notes: "" });
      setShowAddDialog(false);
      toast.success("Документ добавлен в журнал");
    } catch { toast.error("Ошибка при добавлении документа"); }
    finally { setSaving(false); }
  }, [newDocument, organizationId]);

  const generateNewDocNumber = useCallback(() => {
    const year = newDocument.date.getFullYear();
    const prefix = DOCUMENT_TYPE_LABELS[newDocument.document_type]?.prefix || "ПР";
    const sameTypeYearCount = records.filter(r => { const rYear = parseISO(r.date).getFullYear(); return r.document_type === newDocument.document_type && rYear === year; }).length;
    setNewDocument(prev => ({ ...prev, reg_number: `${prefix}-${year}/${(sameTypeYearCount + 1).toString().padStart(3, "0")}` }));
  }, [newDocument.date, newDocument.document_type, records]);

  const exportToExcel = useCallback(async () => {
    if (filteredRecords.length === 0) { toast.error("Нет данных для экспорта"); return; }
    const XLSX = await getXLSX();
    const exportData = filteredRecords.map((record, index) => ({ "№ п/п": index + 1, "Рег. номер": record.reg_number || "—", "Тип документа": DOCUMENT_TYPE_LABELS[record.document_type]?.label || record.document_type, "Наименование": record.document_name, "Направление": record.direction === "incoming" ? "Входящий" : "Исходящий", "Дата": format(parseISO(record.date), "dd.MM.yyyy", { locale: ru }), "Контрагент/Лицо": record.related_entity || "—", "Примечание": record.notes || "—" }));
    const worksheet = XLSX.utils.json_to_sheet(exportData);
    worksheet["!cols"] = [{ wch: 8 }, { wch: 15 }, { wch: 22 }, { wch: 50 }, { wch: 12 }, { wch: 12 }, { wch: 30 }, { wch: 25 }];
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Журнал документов");
    XLSX.writeFile(workbook, `Журнал_регистрации_документов_${format(new Date(), "dd-MM-yyyy")}.xlsx`);
    toast.success("Журнал экспортирован в Excel");
  }, [filteredRecords]);

  return {
    loading, saving, records, filteredRecords, stats,
    searchQuery, setSearchQuery, selectedType, setSelectedType,
    selectedDirection, setSelectedDirection, dateRange, setDateRange,
    editingRecord, setEditingRecord, editRegNumber, setEditRegNumber,
    showAddDialog, setShowAddDialog, newDocument, setNewDocument,
    handleViewDocument, handleDownloadDocument, handleEditClick,
    handleSaveRegNumber, generateSuggestedNumber, handleAddDocument,
    generateNewDocNumber, exportToExcel,
  };
}
