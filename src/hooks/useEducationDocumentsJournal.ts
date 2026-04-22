import { useState, useEffect, useMemo } from "react";
import { toast } from "sonner";
import { parseISO, startOfYear, endOfYear, isWithinInterval, format } from "date-fns";
import { ru } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import { getXLSX } from "@/utils/xlsxHelper";
import {
  type EducationDocumentRecord,
  type CompletedStudent,
  PROGRAM_TYPE_TO_DOC_TYPE,
  DOCUMENT_TYPES,
  DELIVERY_METHODS,
  mapDbRecord,
  getDefaultFormData,
  getJournalTitle,
  getJournalSubtitle,
  buildExportData,
  buildInsertRecord,
  EXCEL_COL_WIDTHS,
} from "./educationDocumentsHelpers";

export type { EducationDocumentRecord, CompletedStudent };
export { DOCUMENT_TYPES, DELIVERY_METHODS };

interface UseEducationDocumentsJournalProps {
  organizationId: string;
  documentTypeFilter?: "certificate" | "diploma" | "qualification";
}

export function useEducationDocumentsJournal({
  organizationId,
  documentTypeFilter,
}: UseEducationDocumentsJournalProps) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [records, setRecords] = useState<EducationDocumentRecord[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedDocType, setSelectedDocType] = useState<string>("all");
  const [selectedStatus, setSelectedStatus] = useState<string>("all");
  const [dateRange, setDateRange] = useState<{ from: Date; to: Date }>({
    from: startOfYear(new Date()),
    to: endOfYear(new Date()),
  });

  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showSelectStudentsDialog, setShowSelectStudentsDialog] = useState(false);
  const [editingRecord, setEditingRecord] = useState<EducationDocumentRecord | null>(null);
  const [deletingRecord, setDeletingRecord] = useState<EducationDocumentRecord | null>(null);

  const [completedStudents, setCompletedStudents] = useState<CompletedStudent[]>([]);
  const [loadingStudents, setLoadingStudents] = useState(false);
  const [selectedStudents, setSelectedStudents] = useState<Set<string>>(new Set());
  const [studentSearchQuery, setStudentSearchQuery] = useState("");

  // Document settings from branding
  const [orgData, setOrgData] = useState<{
    name: string;
    license_number?: string | null;
    city?: string | null;
    stamp_url?: string | null;
    signature_url?: string | null;
    director_name?: string | null;
    director_position?: string | null;
  }>({ name: "" });

  const [docSettings, setDocSettings] = useState<{
    certificateSettings?: { series: string; startNumber: number; city: string; regNumberFormat: string };
    diplomaSettings?: { series: string; startNumber: number; city: string; regNumberFormat: string };
  }>({});

  const [formData, setFormData] = useState(getDefaultFormData(documentTypeFilter));

  // Load records and document settings
  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      try {
        const [recordsRes, orgRes] = await Promise.all([
          supabase
            .from("education_document_records")
            .select("*")
            .eq("organization_id", organizationId)
            .order("created_at", { ascending: false }),
          supabase
            .from("organizations")
            .select("name, branding, license_number, stamp_url, signature_url, director_name, director_position")
            .eq("id", organizationId)
            .single(),
        ]);
        if (recordsRes.error) throw recordsRes.error;
        setRecords((recordsRes.data || []).map(mapDbRecord));

        if (orgRes.data) {
          const o = orgRes.data as any;
          const branding = o.branding as Record<string, unknown> | null;
          setOrgData({
            name: o.name || "",
            license_number: o.license_number,
            city: (branding?.city as string) || null,
            stamp_url: o.stamp_url,
            signature_url: o.signature_url,
            director_name: o.director_name,
            director_position: o.director_position,
          });
          if (branding) {
            setDocSettings({
              certificateSettings: branding.certificateSettings as any,
              diplomaSettings: branding.diplomaSettings as any,
            });
          }
        }
      } catch (error) {
        console.error("Error loading records:", error);
        toast.error("Ошибка загрузки записей журнала");
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, [organizationId]);

  const loadCompletedStudents = async () => {
    setLoadingStudents(true);
    try {
      const { data: courses, error: coursesError } = await supabase
        .from("courses")
        .select("id, title, frdo_program_type")
        .eq("organization_id", organizationId);
      if (coursesError) throw coursesError;
      if (!courses || courses.length === 0) { setCompletedStudents([]); return; }

      const courseIds = courses.map((c) => c.id);
      const courseMap = new Map(courses.map((c) => [c.id, c.title]));
      const courseProgramMap = new Map(courses.map((c) => [c.id, c.frdo_program_type]));

      const { data: enrollments, error: enrollmentsError } = await supabase
        .from("enrollments")
        .select("id, user_id, course_id, completed_at")
        .in("course_id", courseIds)
        .eq("status", "completed")
        .not("completed_at", "is", null);
      if (enrollmentsError) throw enrollmentsError;
      if (!enrollments || enrollments.length === 0) { setCompletedStudents([]); return; }

      const userIds = [...new Set(enrollments.map((e) => e.user_id))];

      const { data: profiles, error: profilesError } = await supabase
        .from("profiles")
        .select("user_id, full_name, email")
        .in("user_id", userIds);
      if (profilesError) throw profilesError;

      const { data: frdoData, error: frdoError } = await supabase
        .from("student_frdo_data")
        .select("user_id, birth_date")
        .in("user_id", userIds);
      if (frdoError) throw frdoError;

      const profileMap = new Map(profiles?.map((p) => [p.user_id, p]) || []);
      const frdoMap = new Map(frdoData?.map((f) => [f.user_id, f.birth_date]) || []);
      const addedEnrollmentIds = new Set(records.filter((r) => r.enrollment_id).map((r) => r.enrollment_id));

      const students: CompletedStudent[] = enrollments.map((enrollment) => {
        const profile = profileMap.get(enrollment.user_id);
        const birthDate = frdoMap.get(enrollment.user_id);
        return {
          enrollment_id: enrollment.id,
          user_id: enrollment.user_id,
          full_name: profile?.full_name || profile?.email || "Неизвестный студент",
          birth_date: birthDate || null,
          course_title: courseMap.get(enrollment.course_id) || "Неизвестный курс",
          completed_at: enrollment.completed_at!,
          already_added: addedEnrollmentIds.has(enrollment.id),
          frdo_program_type: courseProgramMap.get(enrollment.course_id) || null,
        };
      });
      students.sort((a, b) => new Date(b.completed_at).getTime() - new Date(a.completed_at).getTime());
      setCompletedStudents(students);
    } catch (error) {
      console.error("Error loading completed students:", error);
      toast.error("Ошибка загрузки списка выпускников");
    } finally {
      setLoadingStudents(false);
    }
  };

  useEffect(() => {
    if (!loading) { loadCompletedStudents(); }
  }, [loading, organizationId]);

  const newGraduatesCount = useMemo(() => {
    let students = completedStudents;
    if (documentTypeFilter) {
      students = students.filter((s) => {
        if (!s.frdo_program_type) return true;
        return PROGRAM_TYPE_TO_DOC_TYPE[s.frdo_program_type] === documentTypeFilter;
      });
    }
    return students.filter((s) => !s.already_added).length;
  }, [completedStudents, documentTypeFilter]);

  const filteredRecords = useMemo(() => {
    return records.filter((record) => {
      if (documentTypeFilter && record.document_type !== documentTypeFilter) return false;
      const searchLower = searchQuery.toLowerCase();
      const matchesSearch = !searchQuery ||
        record.full_name.toLowerCase().includes(searchLower) ||
        record.reg_number.toLowerCase().includes(searchLower) ||
        record.document_number.toLowerCase().includes(searchLower) ||
        record.specialty_name.toLowerCase().includes(searchLower);
      const matchesDocType = selectedDocType === "all" || record.document_type === selectedDocType;
      const matchesStatus = selectedStatus === "all" || record.document_status === selectedStatus;
      const recordDate = parseISO(record.issue_date);
      const matchesDate = isWithinInterval(recordDate, { start: dateRange.from, end: dateRange.to });
      return matchesSearch && matchesDocType && matchesStatus && matchesDate;
    });
  }, [records, searchQuery, selectedDocType, selectedStatus, dateRange, documentTypeFilter]);

  const stats = useMemo(() => {
    const certificates = filteredRecords.filter((r) => r.document_type === "certificate").length;
    const diplomas = filteredRecords.filter((r) => r.document_type === "diploma").length;
    const originals = filteredRecords.filter((r) => r.document_status === "original").length;
    const duplicates = filteredRecords.filter((r) => r.document_status === "duplicate").length;
    return { total: filteredRecords.length, certificates, diplomas, originals, duplicates };
  }, [filteredRecords]);

  const filteredStudents = useMemo(() => {
    let filtered = completedStudents;
    // Filter by document type tab: only show students whose course program type matches
    if (documentTypeFilter) {
      filtered = filtered.filter((s) => {
        if (!s.frdo_program_type) return true; // courses without program type show in all tabs
        return PROGRAM_TYPE_TO_DOC_TYPE[s.frdo_program_type] === documentTypeFilter;
      });
    }
    if (studentSearchQuery) {
      const query = studentSearchQuery.toLowerCase();
      filtered = filtered.filter((s) => s.full_name.toLowerCase().includes(query) || s.course_title.toLowerCase().includes(query));
    }
    return filtered;
  }, [completedStudents, studentSearchQuery, documentTypeFilter]);

  const journalTitle = getJournalTitle(documentTypeFilter);
  const journalSubtitle = getJournalSubtitle(documentTypeFilter);

  const resetForm = () => {
    setFormData(getDefaultFormData(documentTypeFilter));
  };

  const generateRegNumber = async () => {
    const year = formData.issue_date.getFullYear();
    const docType = formData.document_type || "doc";
    let nextNumber = 1;
    try {
      const { data, error } = await supabase.rpc("next_reg_number", {
        p_org: organizationId,
        p_doc_type: docType,
        p_year: year,
      });
      if (error) throw error;
      nextNumber = (data as number) || 1;
    } catch (err) {
      console.warn("next_reg_number RPC failed, falling back to client count:", err);
      nextNumber = records.filter((r) => parseISO(r.issue_date).getFullYear() === year).length + 1;
    }

    // Try to use settings from branding
    const settings = formData.document_type === "diploma" ? docSettings.diplomaSettings : docSettings.certificateSettings;
    if (settings?.regNumberFormat) {
      const regNum = settings.regNumberFormat
        .replace("{{year}}", year.toString())
        .replace("{{number}}", ((settings.startNumber || 0) + nextNumber - 1).toString().padStart(4, "0"));
      setFormData((prev) => ({
        ...prev,
        reg_number: regNum,
        document_series: prev.document_series || settings.series || "",
      }));
    } else {
      setFormData((prev) => ({ ...prev, reg_number: `ДОК-${year}/${nextNumber.toString().padStart(4, "0")}` }));
    }
  };

  const handleOpenAdd = () => { resetForm(); setShowAddDialog(true); };

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
      enrollment_id: record.enrollment_id || "",
    });
    setEditingRecord(record);
  };

  const handleOpenSelectStudents = async () => {
    setSelectedStudents(new Set());
    setStudentSearchQuery("");
    setShowSelectStudentsDialog(true);
    await loadCompletedStudents();
  };

  const generateDocumentNumber = (index: number) => {
    const year = new Date().getFullYear();
    const existingCount = records.filter((r) => parseISO(r.issue_date).getFullYear() === year).length;
    return `${year}/${(existingCount + index + 1).toString().padStart(6, "0")}`;
  };

  const handleAutoAddAllGraduates = async () => {
    let newStudents = completedStudents.filter((s) => !s.already_added);
    if (documentTypeFilter) {
      newStudents = newStudents.filter((s) => {
        if (!s.frdo_program_type) return true;
        return PROGRAM_TYPE_TO_DOC_TYPE[s.frdo_program_type] === documentTypeFilter;
      });
    }
    if (newStudents.length === 0) { toast.info("Все выпускники уже добавлены в журнал"); return; }
    setSaving(true);
    try {
      const year = new Date().getFullYear();
      let existingCount = records.filter((r) => parseISO(r.issue_date).getFullYear() === year).length;
      const recordsToInsert = newStudents.map((student, index) => {
        existingCount += 1;
        const docType = student.frdo_program_type
          ? (PROGRAM_TYPE_TO_DOC_TYPE[student.frdo_program_type] || documentTypeFilter || "certificate")
          : (documentTypeFilter || "certificate");
        const docNumber = `${year}/${(existingCount + index).toString().padStart(6, "0")}`;
        return {
          organization_id: organizationId, reg_number: `ДОК-${year}/${existingCount.toString().padStart(4, "0")}`,
          full_name: student.full_name, birth_date: student.birth_date || null,
          document_type: docType, document_series: "",
          document_number: docNumber, issue_date: new Date().toISOString().split("T")[0],
          specialty_name: student.course_title, qualification_name: "", protocol_number: "",
          protocol_date: null, order_number: "", order_date: null, document_status: "original",
          original_document_data: null, delivery_method: "personal", delivery_details: null,
          notes: null, enrollment_id: student.enrollment_id,
        };
      });
      const { data, error } = await supabase.from("education_document_records").insert(recordsToInsert).select();
      if (error) throw error;
      const mapped = (data || []).map(mapDbRecord);
      setRecords([...mapped, ...records]);
      loadCompletedStudents();
      toast.success(`Автоматически добавлено ${mapped.length} записей`);
    } catch (error) {
      console.error("Error auto-adding graduates:", error);
      toast.error("Ошибка при добавлении записей");
    } finally {
      setSaving(false);
    }
  };

  const handleCreateFromStudents = async () => {
    const selectedList = completedStudents.filter((s) => selectedStudents.has(s.enrollment_id) && !s.already_added);
    if (selectedList.length === 0) { toast.error("Выберите хотя бы одного выпускника"); return; }
    setSaving(true);
    try {
      const year = new Date().getFullYear();
      let existingCount = records.filter((r) => parseISO(r.issue_date).getFullYear() === year).length;
      const recordsToInsert = selectedList.map((student, index) => {
        existingCount += 1;
        const docType = student.frdo_program_type
          ? (PROGRAM_TYPE_TO_DOC_TYPE[student.frdo_program_type] || documentTypeFilter || "certificate")
          : (documentTypeFilter || "certificate");
        return {
          organization_id: organizationId, reg_number: `ДОК-${year}/${existingCount.toString().padStart(4, "0")}`,
          full_name: student.full_name, birth_date: student.birth_date || null,
          document_type: docType, document_series: "",
          document_number: generateDocumentNumber(index), issue_date: new Date().toISOString().split("T")[0],
          specialty_name: student.course_title, qualification_name: "", protocol_number: "",
          protocol_date: null, order_number: "", order_date: null, document_status: "original",
          original_document_data: null, delivery_method: "personal", delivery_details: null,
          notes: null, enrollment_id: student.enrollment_id,
        };
      });
      const { data, error } = await supabase.from("education_document_records").insert(recordsToInsert).select();
      if (error) throw error;
      const mapped = (data || []).map(mapDbRecord);
      setRecords([...mapped, ...records]);
      setShowSelectStudentsDialog(false);
      loadCompletedStudents();
      toast.success(`Создано ${mapped.length} записей`);
    } catch (error) {
      console.error("Error creating records from students:", error);
      toast.error("Ошибка при создании записей");
    } finally {
      setSaving(false);
    }
  };

  const toggleStudentSelection = (enrollmentId: string) => {
    const newSet = new Set(selectedStudents);
    if (newSet.has(enrollmentId)) newSet.delete(enrollmentId); else newSet.add(enrollmentId);
    setSelectedStudents(newSet);
  };

  const selectAllStudents = () => {
    const available = filteredStudents.filter((s) => !s.already_added);
    if (selectedStudents.size === available.length) setSelectedStudents(new Set());
    else setSelectedStudents(new Set(available.map((s) => s.enrollment_id)));
  };

  const handleSave = async () => {
    if (!formData.full_name.trim()) { toast.error("Введите ФИО выпускника"); return; }
    if (!formData.reg_number.trim()) { toast.error("Введите регистрационный номер"); return; }
    if (!formData.document_number.trim()) { toast.error("Введите номер документа"); return; }
    if (!formData.specialty_name.trim()) { toast.error("Введите наименование специальности"); return; }

    setSaving(true);
    try {
      const dbRecord = {
        organization_id: organizationId,
        reg_number: formData.reg_number.trim(),
        full_name: formData.full_name.trim(),
        birth_date: formData.birth_date?.toISOString().split("T")[0] || null,
        document_type: formData.document_type,
        document_series: formData.document_series.trim() || null,
        document_number: formData.document_number.trim(),
        issue_date: formData.issue_date.toISOString().split("T")[0],
        specialty_name: formData.specialty_name.trim(),
        qualification_name: formData.qualification_name.trim() || null,
        protocol_number: formData.protocol_number.trim() || null,
        protocol_date: formData.protocol_date?.toISOString().split("T")[0] || null,
        order_number: formData.order_number.trim() || null,
        order_date: formData.order_date?.toISOString().split("T")[0] || null,
        document_status: formData.document_status,
        original_document_data: formData.document_status === "duplicate" ? formData.original_document_data.trim() : null,
        delivery_method: formData.delivery_method,
        delivery_details: formData.delivery_method !== "personal" ? formData.delivery_details.trim() : null,
        notes: formData.notes.trim() || null,
        enrollment_id: formData.enrollment_id || null,
      };

      if (editingRecord) {
        const { data, error } = await supabase.from("education_document_records").update(dbRecord).eq("id", editingRecord.id).select().single();
        if (error) throw error;
        setRecords(records.map((r) => r.id === editingRecord.id ? mapDbRecord(data) : r));
        toast.success("Запись обновлена");
      } else {
        const { data, error } = await supabase.from("education_document_records").insert(dbRecord).select().single();
        if (error) throw error;
        setRecords([mapDbRecord(data), ...records]);
        toast.success("Запись добавлена");
      }
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

  const handleDelete = async () => {
    if (!deletingRecord) return;
    try {
      const { error } = await supabase.from("education_document_records").delete().eq("id", deletingRecord.id);
      if (error) throw error;
      setRecords(records.filter((r) => r.id !== deletingRecord.id));
      toast.success("Запись удалена");
      setDeletingRecord(null);
    } catch (error) {
      console.error("Error deleting record:", error);
      toast.error("Ошибка при удалении");
    }
  };

  const exportToExcel = async () => {
    if (filteredRecords.length === 0) { toast.error("Нет данных для экспорта"); return; }
    const XLSX = await getXLSX();
    const exportData = buildExportData(filteredRecords);
    const worksheet = XLSX.utils.json_to_sheet(exportData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Документы об образовании");
    worksheet["!cols"] = EXCEL_COL_WIDTHS;
    XLSX.writeFile(workbook, `Журнал_документов_об_образовании_${format(new Date(), "dd-MM-yyyy")}.xlsx`);
    toast.success("Журнал экспортирован в Excel");
  };

  return {
    // State
    loading, saving, records, searchQuery, setSearchQuery,
    selectedDocType, setSelectedDocType, selectedStatus, setSelectedStatus,
    dateRange, setDateRange, orgData,
    showAddDialog, setShowAddDialog, showSelectStudentsDialog, setShowSelectStudentsDialog,
    editingRecord, setEditingRecord, deletingRecord, setDeletingRecord,
    completedStudents, loadingStudents, selectedStudents,
    studentSearchQuery, setStudentSearchQuery,
    formData, setFormData,
    // Computed
    filteredRecords, stats, filteredStudents, newGraduatesCount,
    // Helpers
    journalTitle, journalSubtitle,
    // Actions
    resetForm, generateRegNumber, handleOpenAdd, handleOpenEdit,
    handleOpenSelectStudents, handleAutoAddAllGraduates, handleCreateFromStudents,
    toggleStudentSelection, selectAllStudents,
    handleSave, handleDelete, exportToExcel,
  };
}
