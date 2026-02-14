import { useState, useEffect, useMemo, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { format } from "date-fns";
import { useWordDocumentGenerator } from "@/hooks/useWordDocumentGenerator";

export interface LaborSafetyCourse {
  id: string;
  title: string;
  description: string | null;
  is_published: boolean;
}

export interface LaborSafetyGroup {
  id: string;
  name: string;
  organization_id: string;
  created_at: string;
  records_count?: number;
}

export interface LaborSafetyRecord {
  id: string;
  group_id: string;
  full_name: string;
  snils: string | null;
  position: string | null;
  inn: string | null;
  organization_name: string | null;
  protocol_number: string | null;
  program_name: string | null;
  exam_date: string | null;
  is_passed: boolean;
  created_at?: string;
  courses?: { id: string; title: string }[];
  enrollments?: { course_id: string; course_title: string; progress: number; status: string }[];
  averageProgress?: number;
  hasActiveEnrollment?: boolean;
}

export type SortField = 'name' | 'created_at' | 'records_count';
export type SortDirection = 'asc' | 'desc';

interface UseLaborSafetyManagerProps {
  organizationId: string;
}

export function useLaborSafetyManager({ organizationId }: UseLaborSafetyManagerProps) {
  const [groups, setGroups] = useState<LaborSafetyGroup[]>([]);
  const [selectedGroup, setSelectedGroup] = useState<LaborSafetyGroup | null>(null);
  const [records, setRecords] = useState<LaborSafetyRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingRecords, setIsLoadingRecords] = useState(false);

  const [groupSearch, setGroupSearch] = useState("");
  const [groupSortField, setGroupSortField] = useState<SortField>('created_at');
  const [groupSortDirection, setGroupSortDirection] = useState<SortDirection>('desc');
  const [isGroupSearchOpen, setIsGroupSearchOpen] = useState(false);

  const [searchName, setSearchName] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const [selectedRecordIds, setSelectedRecordIds] = useState<Set<string>>(new Set());

  const [showGroupDialog, setShowGroupDialog] = useState(false);
  const [groupName, setGroupName] = useState("");
  const [groupDescription, setGroupDescription] = useState("");
  const [isCreatingGroup, setIsCreatingGroup] = useState(false);
  const [editingGroup, setEditingGroup] = useState<LaborSafetyGroup | null>(null);
  const [showDeleteGroupConfirm, setShowDeleteGroupConfirm] = useState(false);
  const [groupToDelete, setGroupToDelete] = useState<LaborSafetyGroup | null>(null);

  const [showRecordDialog, setShowRecordDialog] = useState(false);
  const [editingRecord, setEditingRecord] = useState<LaborSafetyRecord | null>(null);
  const [recordForm, setRecordForm] = useState({
    full_name: "", snils: "", position: "", inn: "",
    organization_name: "", protocol_number: "", program_name: "",
    exam_date: "", is_passed: false,
  });
  const [isSavingRecord, setIsSavingRecord] = useState(false);

  const [isBulkUpdating, setIsBulkUpdating] = useState(false);
  const [isGeneratingCredentials, setIsGeneratingCredentials] = useState(false);

  const [showEnrollDialog, setShowEnrollDialog] = useState(false);
  const [courses, setCourses] = useState<LaborSafetyCourse[]>([]);
  const [selectedCourseIds, setSelectedCourseIds] = useState<string[]>([]);
  const [isLoadingCourses, setIsLoadingCourses] = useState(false);
  const [isEnrolling, setIsEnrolling] = useState(false);

  const [selectedRecordForDetail, setSelectedRecordForDetail] = useState<LaborSafetyRecord | null>(null);
  const [showStudentDetailCard, setShowStudentDetailCard] = useState(false);

  const { generateDocument, isGenerating } = useWordDocumentGenerator();

  // Filtered groups
  const filteredGroups = useMemo(() => {
    let result = [...groups];
    if (groupSearch) {
      const search = groupSearch.toLowerCase();
      result = result.filter(g => g.name.toLowerCase().includes(search));
    }
    result.sort((a, b) => {
      let comparison = 0;
      switch (groupSortField) {
        case 'name': comparison = a.name.localeCompare(b.name, 'ru'); break;
        case 'created_at': comparison = new Date(a.created_at).getTime() - new Date(b.created_at).getTime(); break;
        case 'records_count': comparison = (a.records_count || 0) - (b.records_count || 0); break;
      }
      return groupSortDirection === 'asc' ? comparison : -comparison;
    });
    return result;
  }, [groups, groupSearch, groupSortField, groupSortDirection]);

  // Filtered records
  const filteredRecords = useMemo(() => {
    return records.filter((record) => {
      if (searchName && !record.full_name.toLowerCase().includes(searchName.toLowerCase())) return false;
      if (record.created_at) {
        const createdDate = new Date(record.created_at);
        if (dateFrom) { const f = new Date(dateFrom); f.setHours(0,0,0,0); if (createdDate < f) return false; }
        if (dateTo) { const t = new Date(dateTo); t.setHours(23,59,59,999); if (createdDate > t) return false; }
      }
      return true;
    });
  }, [records, searchName, dateFrom, dateTo]);

  const allFilteredSelected = filteredRecords.length > 0 && filteredRecords.every(r => selectedRecordIds.has(r.id));

  const fetchGroups = useCallback(async () => {
    try {
      setIsLoading(true);
      const { data, error } = await supabase
        .from("labor_safety_groups")
        .select("*, labor_safety_records(count)")
        .eq("organization_id", organizationId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      setGroups((data || []).map(g => ({ ...g, records_count: g.labor_safety_records?.[0]?.count || 0 })));
    } catch (error) {
      console.error("Error fetching groups:", error);
      toast.error("Ошибка загрузки групп");
    } finally {
      setIsLoading(false);
    }
  }, [organizationId]);

  const fetchRecords = useCallback(async (groupId: string) => {
    try {
      setIsLoadingRecords(true);
      const { data, error } = await supabase
        .from("labor_safety_records").select("*").eq("group_id", groupId).order("full_name", { ascending: true });
      if (error) throw error;

      const recordsWithCourses = await Promise.all((data || []).map(async (record) => {
        const { data: profile } = await supabase.from("labor_safety_profiles").select("user_id").eq("record_id", record.id).maybeSingle();
        if (profile?.user_id) {
          const { data: enrollments } = await supabase.from("enrollments").select("course_id, progress, status, courses(id, title)").eq("user_id", profile.user_id);
          const enrollmentData = (enrollments || []).map((e: any) => ({ course_id: e.course_id, course_title: e.courses?.title || "Курс", progress: e.progress || 0, status: e.status || "active" }));
          const coursesData = enrollmentData.map(e => ({ id: e.course_id, title: e.course_title }));
          const avgProgress = enrollmentData.length > 0 ? Math.round(enrollmentData.reduce((sum, e) => sum + e.progress, 0) / enrollmentData.length) : 0;
          return { ...record, courses: coursesData, enrollments: enrollmentData, averageProgress: avgProgress, hasActiveEnrollment: enrollmentData.some(e => e.status === "active" && e.progress < 100) };
        }
        return { ...record, courses: [], enrollments: [], averageProgress: 0, hasActiveEnrollment: false };
      }));
      setRecords(recordsWithCourses);
    } catch (error) {
      console.error("Error fetching records:", error);
      toast.error("Ошибка загрузки записей");
    } finally {
      setIsLoadingRecords(false);
    }
  }, []);

  useEffect(() => { fetchGroups(); }, [fetchGroups]);
  useEffect(() => {
    if (selectedGroup) { fetchRecords(selectedGroup.id); setSelectedRecordIds(new Set()); }
    else { setRecords([]); setSelectedRecordIds(new Set()); }
  }, [selectedGroup, fetchRecords]);

  const handleCreateGroup = async () => {
    if (!groupName.trim()) { toast.error("Введите название группы"); return; }
    try {
      setIsCreatingGroup(true);
      if (editingGroup) {
        const { error } = await supabase.from("labor_safety_groups").update({ name: groupName.trim() }).eq("id", editingGroup.id);
        if (error) throw error;
        toast.success("Группа обновлена");
      } else {
        const { data, error } = await supabase.from("labor_safety_groups").insert({ organization_id: organizationId, name: groupName.trim() }).select().single();
        if (error) throw error;
        toast.success("Группа создана");
        if (data) setSelectedGroup({ ...data, records_count: 0 });
      }
      setShowGroupDialog(false); setGroupName(""); setGroupDescription(""); setEditingGroup(null);
      fetchGroups();
    } catch (error) {
      console.error("Error saving group:", error);
      toast.error("Ошибка сохранения группы");
    } finally {
      setIsCreatingGroup(false);
    }
  };

  const handleDeleteGroup = async () => {
    if (!groupToDelete) return;
    try {
      await supabase.from("labor_safety_records").delete().eq("group_id", groupToDelete.id);
      const { error } = await supabase.from("labor_safety_groups").delete().eq("id", groupToDelete.id);
      if (error) throw error;
      toast.success("Группа удалена");
      if (selectedGroup?.id === groupToDelete.id) setSelectedGroup(null);
      setShowDeleteGroupConfirm(false); setGroupToDelete(null);
      fetchGroups();
    } catch (error) {
      console.error("Error deleting group:", error);
      toast.error("Ошибка удаления группы");
    }
  };

  const handleSaveRecord = async () => {
    if (!recordForm.full_name.trim()) { toast.error("Введите ФИО"); return; }
    if (!selectedGroup) return;
    try {
      setIsSavingRecord(true);
      const recordData = {
        group_id: selectedGroup.id, full_name: recordForm.full_name.trim(),
        snils: recordForm.snils.trim() || null, position: recordForm.position.trim() || null,
        inn: recordForm.inn.trim() || null, organization_name: recordForm.organization_name.trim() || null,
        protocol_number: recordForm.protocol_number.trim() || null, program_name: recordForm.program_name.trim() || null,
        exam_date: recordForm.exam_date || null, is_passed: recordForm.is_passed,
      };
      if (editingRecord) {
        const { error } = await supabase.from("labor_safety_records").update(recordData).eq("id", editingRecord.id);
        if (error) throw error;
        toast.success("Запись обновлена");
      } else {
        const { error } = await supabase.from("labor_safety_records").insert(recordData);
        if (error) throw error;
        toast.success("Запись добавлена");
      }
      setShowRecordDialog(false); resetRecordForm();
      fetchRecords(selectedGroup.id); fetchGroups();
    } catch (error) {
      console.error("Error saving record:", error);
      toast.error("Ошибка сохранения записи");
    } finally {
      setIsSavingRecord(false);
    }
  };

  const handleDeleteRecord = async (recordId: string) => {
    try {
      const { error } = await supabase.from("labor_safety_records").delete().eq("id", recordId);
      if (error) throw error;
      toast.success("Запись удалена");
      selectedRecordIds.delete(recordId);
      setSelectedRecordIds(new Set(selectedRecordIds));
      if (selectedGroup) { fetchRecords(selectedGroup.id); fetchGroups(); }
    } catch (error) {
      console.error("Error deleting record:", error);
      toast.error("Ошибка удаления записи");
    }
  };

  const resetRecordForm = () => {
    setRecordForm({ full_name: "", snils: "", position: "", inn: "", organization_name: "", protocol_number: "", program_name: "", exam_date: "", is_passed: false });
    setEditingRecord(null);
  };

  const openEditRecord = (record: LaborSafetyRecord) => {
    setEditingRecord(record);
    setRecordForm({ full_name: record.full_name, snils: record.snils || "", position: record.position || "", inn: record.inn || "", organization_name: record.organization_name || "", protocol_number: record.protocol_number || "", program_name: record.program_name || "", exam_date: record.exam_date || "", is_passed: record.is_passed });
    setShowRecordDialog(true);
  };

  const toggleRecordSelection = (recordId: string) => {
    const ns = new Set(selectedRecordIds);
    if (ns.has(recordId)) ns.delete(recordId); else ns.add(recordId);
    setSelectedRecordIds(ns);
  };

  const toggleAllFiltered = () => {
    if (allFilteredSelected) {
      const ns = new Set(selectedRecordIds);
      filteredRecords.forEach(r => ns.delete(r.id));
      setSelectedRecordIds(ns);
    } else {
      const ns = new Set(selectedRecordIds);
      filteredRecords.forEach(r => ns.add(r.id));
      setSelectedRecordIds(ns);
    }
  };

  const clearFilters = () => { setSearchName(""); setDateFrom(""); setDateTo(""); };

  const escapeXml = (str: string) => str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');

  const exportSelectedToXML = () => {
    const recs = selectedRecordIds.size > 0 ? records.filter(r => selectedRecordIds.has(r.id)) : filteredRecords;
    if (recs.length === 0) { toast.error("Нет данных для экспорта"); return; }
    let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
    xml += `<LaborSafetyRecords group="${escapeXml(selectedGroup?.name || "Группа")}" exportDate="${format(new Date(), 'yyyy-MM-dd')}">\n`;
    recs.forEach((record, index) => {
      xml += `  <Record number="${index + 1}">\n`;
      xml += `    <FullName>${escapeXml(record.full_name)}</FullName>\n    <SNILS>${escapeXml(record.snils || "")}</SNILS>\n    <Position>${escapeXml(record.position || "")}</Position>\n    <INN>${escapeXml(record.inn || "")}</INN>\n    <OrganizationName>${escapeXml(record.organization_name || "")}</OrganizationName>\n    <ProtocolNumber>${escapeXml(record.protocol_number || "")}</ProtocolNumber>\n    <ProgramName>${escapeXml(record.program_name || "")}</ProgramName>\n    <ExamDate>${record.exam_date || ""}</ExamDate>\n    <IsPassed>${record.is_passed ? "Да" : "Нет"}</IsPassed>\n`;
      xml += `  </Record>\n`;
    });
    xml += '</LaborSafetyRecords>';
    const blob = new Blob([xml], { type: 'application/xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `labor_safety_${format(new Date(), 'yyyy-MM-dd')}.xml`;
    a.click(); URL.revokeObjectURL(url);
    toast.success(`Экспортировано ${recs.length} записей`);
  };

  const markSelectedAsPassed = async () => {
    if (selectedRecordIds.size === 0) { toast.error("Выберите записи"); return; }
    try {
      setIsBulkUpdating(true);
      const { error } = await supabase.from("labor_safety_records").update({ is_passed: true }).in("id", Array.from(selectedRecordIds));
      if (error) throw error;
      toast.success(`Отмечено как пройдено: ${selectedRecordIds.size} записей`);
      if (selectedGroup) fetchRecords(selectedGroup.id);
    } catch (error) {
      console.error("Error updating records:", error);
      toast.error("Ошибка обновления записей");
    } finally {
      setIsBulkUpdating(false);
    }
  };

  const generateProtocolForSelected = () => {
    const recs = selectedRecordIds.size > 0 ? records.filter(r => selectedRecordIds.has(r.id)) : filteredRecords;
    if (recs.length === 0) { toast.error("Выберите записи для протокола"); return; }
    const groupNameValue = selectedGroup?.name || "Группа";
    const currentDate = format(new Date(), 'dd.MM.yyyy');
    let protocolHtml = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Протокол проверки знаний по охране труда</title><style>body{font-family:'Times New Roman',serif;padding:40px;font-size:14px}h1{text-align:center;font-size:16px;margin-bottom:20px}h2{text-align:center;font-size:14px;margin-bottom:30px;font-weight:normal}table{width:100%;border-collapse:collapse;margin-top:20px}th,td{border:1px solid black;padding:8px;text-align:left}th{background-color:#f0f0f0}.footer{margin-top:40px}@media print{body{padding:20px}}</style></head><body><h1>ПРОТОКОЛ</h1><h2>заседания комиссии по проверке знаний требований охраны труда</h2><div><p><strong>Группа:</strong> ${escapeXml(groupNameValue)}</p><p><strong>Дата формирования:</strong> ${currentDate}</p><p><strong>Количество слушателей:</strong> ${recs.length}</p></div><table><thead><tr><th>№</th><th>ФИО</th><th>Должность</th><th>Организация</th><th>Программа обучения</th><th>Результат</th></tr></thead><tbody>${recs.map((r, i) => `<tr><td>${i+1}</td><td>${escapeXml(r.full_name)}</td><td>${escapeXml(r.position || '-')}</td><td>${escapeXml(r.organization_name || '-')}</td><td>${escapeXml(r.program_name || '-')}</td><td>${r.is_passed ? 'Сдал' : 'Не сдал'}</td></tr>`).join('')}</tbody></table><div class="footer"><p>Председатель комиссии: _________________________________ / ___________________ /</p><p style="margin-top:20px">Члены комиссии:</p><p>1. _________________________________ / ___________________ /</p><p>2. _________________________________ / ___________________ /</p><p>3. _________________________________ / ___________________ /</p></div></body></html>`;
    const printWindow = window.open('', '_blank');
    if (printWindow) { printWindow.document.write(protocolHtml); printWindow.document.close(); printWindow.focus(); setTimeout(() => printWindow.print(), 500); }
    toast.success(`Протокол сформирован для ${recs.length} записей`);
  };

  const generateCredentialsForSelected = async () => {
    if (selectedRecordIds.size === 0) { toast.error("Выберите записи"); return; }
    const recordsToProcess = records.filter(r => selectedRecordIds.has(r.id));
    if (recordsToProcess.length === 0) { toast.error("Нет выбранных записей"); return; }
    try {
      setIsGeneratingCredentials(true);
      let successCount = 0, alreadyExistsCount = 0, failCount = 0;
      for (const record of recordsToProcess) {
        const { data: existingProfile } = await supabase.from("labor_safety_profiles").select("id, login, generated_password").eq("record_id", record.id).eq("organization_id", organizationId).maybeSingle();
        if (existingProfile && existingProfile.login && existingProfile.generated_password) { alreadyExistsCount++; continue; }
        const { data, error } = await supabase.functions.invoke("register-student", { body: { organization_id: organizationId, full_name: record.full_name, email: `ls_${record.id.slice(0, 8)}@temp.local`, no_login: false } });
        if (error || data?.error) { failCount++; continue; }
        if (data?.user_id) {
          const { error: linkError } = await supabase.from("labor_safety_profiles").upsert({ user_id: data.user_id, full_name: record.full_name, login: data.login, generated_password: data.generated_password, email: data.email, organization_id: organizationId, record_id: record.id }, { onConflict: 'record_id' });
          if (linkError) failCount++; else successCount++;
        } else failCount++;
      }
      if (successCount > 0) toast.success(`Создано доступов: ${successCount}`);
      if (alreadyExistsCount > 0) toast.info(`Уже имеют доступ: ${alreadyExistsCount}`);
      if (failCount > 0) toast.error(`Ошибок: ${failCount}`);
      setSelectedRecordIds(new Set());
    } catch (error) {
      console.error("Error generating credentials:", error);
      toast.error("Ошибка генерации доступов");
    } finally {
      setIsGeneratingCredentials(false);
    }
  };

  const handleGeneratePrikaz = () => {
    const recs = selectedRecordIds.size > 0 ? records.filter(r => selectedRecordIds.has(r.id)) : filteredRecords;
    if (recs.length === 0) { toast.error("Выберите записи для формирования приказа"); return; }
    generateDocument({ templateType: "prikaz", persons: recs.map(r => ({ fullName: r.full_name, position: r.position || undefined, organization: r.organization_name || undefined, snils: r.snils || undefined, inn: r.inn || undefined, programName: r.program_name || undefined, examDate: r.exam_date || undefined, isPassed: r.is_passed })), groupName: selectedGroup?.name });
  };

  const handleGenerateProtokol = () => {
    const recs = selectedRecordIds.size > 0 ? records.filter(r => selectedRecordIds.has(r.id)) : filteredRecords;
    if (recs.length === 0) { toast.error("Выберите записи для формирования протокола"); return; }
    generateDocument({ templateType: "protokol", persons: recs.map(r => ({ fullName: r.full_name, position: r.position || undefined, organization: r.organization_name || undefined, snils: r.snils || undefined, inn: r.inn || undefined, programName: r.program_name || undefined, examDate: r.exam_date || undefined, isPassed: r.is_passed })), groupName: selectedGroup?.name });
  };

  const fetchCourses = useCallback(async () => {
    try {
      setIsLoadingCourses(true);
      const { data: categoryData } = await supabase.from("course_categories").select("id").eq("organization_id", organizationId).ilike("name", "%охрана труда%").maybeSingle();
      let query = supabase.from("courses").select("id, title, description, is_published").eq("organization_id", organizationId).order("title");
      if (categoryData?.id) query = query.eq("category_id", categoryData.id);
      const { data, error } = await query;
      if (error) throw error;
      setCourses(data || []);
    } catch (error) {
      console.error("Error fetching courses:", error);
      toast.error("Ошибка загрузки курсов");
    } finally {
      setIsLoadingCourses(false);
    }
  }, [organizationId]);

  const openEnrollDialog = () => {
    if (selectedRecordIds.size === 0) { toast.error("Выберите записи для зачисления"); return; }
    setShowEnrollDialog(true); setSelectedCourseIds([]); fetchCourses();
  };

  const enrollSelectedToCourse = async () => {
    if (selectedCourseIds.length === 0) { toast.error("Выберите хотя бы один курс"); return; }
    const recordsToEnroll = records.filter(r => selectedRecordIds.has(r.id));
    if (recordsToEnroll.length === 0) { toast.error("Нет выбранных записей"); return; }
    try {
      setIsEnrolling(true);
      let successCount = 0, failCount = 0, alreadyEnrolledCount = 0;
      for (const record of recordsToEnroll) {
        const { data: laborProfile, error: laborProfileError } = await supabase.from("labor_safety_profiles").select("user_id").eq("record_id", record.id).eq("organization_id", organizationId).maybeSingle();
        if (laborProfileError) { failCount++; continue; }
        let userId: string | null = null;
        if (laborProfile?.user_id) { userId = laborProfile.user_id; }
        else {
          const { data: registerData, error: registerError } = await supabase.functions.invoke("register-student", { body: { organization_id: organizationId, full_name: record.full_name } });
          if (registerError || !registerData?.user_id) { failCount++; continue; }
          userId = registerData.user_id;
          await supabase.from("labor_safety_profiles").upsert({ user_id: userId, full_name: record.full_name, login: registerData.login, generated_password: registerData.generated_password, email: registerData.email, organization_id: organizationId, record_id: record.id }, { onConflict: 'record_id' });
        }
        if (!userId) { failCount++; continue; }
        for (const courseId of selectedCourseIds) {
          const { data: existing } = await supabase.from("enrollments").select("id").eq("user_id", userId).eq("course_id", courseId).maybeSingle();
          if (existing) { alreadyEnrolledCount++; continue; }
          const { error: enrollError } = await supabase.from("enrollments").insert({ user_id: userId, course_id: courseId, status: "active" });
          if (enrollError) failCount++; else successCount++;
        }
      }
      if (successCount > 0) toast.success(`Зачислено: ${successCount} записей`);
      if (alreadyEnrolledCount > 0) toast.info(`Уже зачислены: ${alreadyEnrolledCount}`);
      if (failCount > 0) toast.error(`Ошибок: ${failCount}`);
      setShowEnrollDialog(false); setSelectedRecordIds(new Set());
      if (selectedGroup) fetchRecords(selectedGroup.id);
    } catch (error) {
      console.error("Error enrolling records:", error);
      toast.error("Ошибка зачисления на курс");
    } finally {
      setIsEnrolling(false);
    }
  };

  return {
    // Groups
    groups, filteredGroups, selectedGroup, setSelectedGroup, isLoading,
    groupSearch, setGroupSearch, groupSortField, setGroupSortField,
    groupSortDirection, setGroupSortDirection, isGroupSearchOpen, setIsGroupSearchOpen,
    showGroupDialog, setShowGroupDialog, groupName, setGroupName,
    groupDescription, setGroupDescription, isCreatingGroup, editingGroup, setEditingGroup,
    showDeleteGroupConfirm, setShowDeleteGroupConfirm, groupToDelete, setGroupToDelete,
    handleCreateGroup, handleDeleteGroup,
    // Records
    records, filteredRecords, isLoadingRecords,
    searchName, setSearchName, dateFrom, setDateFrom, dateTo, setDateTo,
    selectedRecordIds, setSelectedRecordIds, allFilteredSelected,
    showRecordDialog, setShowRecordDialog, editingRecord, setEditingRecord,
    recordForm, setRecordForm, isSavingRecord,
    handleSaveRecord, handleDeleteRecord, resetRecordForm, openEditRecord,
    toggleRecordSelection, toggleAllFiltered, clearFilters,
    // Bulk actions
    isBulkUpdating, isGeneratingCredentials, isGenerating,
    exportSelectedToXML, markSelectedAsPassed, generateProtocolForSelected,
    generateCredentialsForSelected, handleGeneratePrikaz, handleGenerateProtokol,
    // Course enrollment
    showEnrollDialog, setShowEnrollDialog, courses, selectedCourseIds, setSelectedCourseIds,
    isLoadingCourses, isEnrolling, openEnrollDialog, enrollSelectedToCourse,
    // Student detail
    selectedRecordForDetail, setSelectedRecordForDetail,
    showStudentDetailCard, setShowStudentDetailCard,
    // Utils
    fetchGroups, fetchRecords,
  };
}
