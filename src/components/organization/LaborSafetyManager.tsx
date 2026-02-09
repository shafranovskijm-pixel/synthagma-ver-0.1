import { useState, useEffect, useMemo, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { 
  Plus, 
  Download, 
  Trash2, 
  Edit, 
  FolderPlus, 
  Users, 
  Loader2, 
  Search, 
  CheckCircle, 
  FileText, 
  X, 
  GraduationCap,
  ArrowLeft,
  MoreHorizontal,
  SortAsc,
  SortDesc,
  FolderOpen,
  Calendar,
  Shield,
   ChevronRight,
   User,
   Key
} from "lucide-react";
import { format } from "date-fns";
 import { LaborSafetyStudentDetailCard } from "./LaborSafetyStudentDetailCard";
import { useWordDocumentGenerator } from "@/hooks/useWordDocumentGenerator";

interface Course {
  id: string;
  title: string;
  description: string | null;
  is_published: boolean;
}

interface LaborSafetyGroup {
  id: string;
  name: string;
  organization_id: string;
  created_at: string;
  records_count?: number;
}

interface LaborSafetyRecord {
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
  // Enrollment progress data
  enrollments?: { course_id: string; course_title: string; progress: number; status: string }[];
  averageProgress?: number;
  hasActiveEnrollment?: boolean;
}

interface LaborSafetyManagerProps {
  organizationId: string;
}

type SortField = 'name' | 'created_at' | 'records_count';
type SortDirection = 'asc' | 'desc';

export function LaborSafetyManager({ organizationId }: LaborSafetyManagerProps) {
  // Groups state
  const [groups, setGroups] = useState<LaborSafetyGroup[]>([]);
  const [selectedGroup, setSelectedGroup] = useState<LaborSafetyGroup | null>(null);
  const [records, setRecords] = useState<LaborSafetyRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingRecords, setIsLoadingRecords] = useState(false);
  
  // Groups navigation
  const [groupSearch, setGroupSearch] = useState("");
  const [groupSortField, setGroupSortField] = useState<SortField>('created_at');
  const [groupSortDirection, setGroupSortDirection] = useState<SortDirection>('desc');
  const [isGroupSearchOpen, setIsGroupSearchOpen] = useState(false);
  
  // Records search and filters
  const [searchName, setSearchName] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  
  // Selection
  const [selectedRecordIds, setSelectedRecordIds] = useState<Set<string>>(new Set());
  
  // Group dialog
  const [showGroupDialog, setShowGroupDialog] = useState(false);
  const [groupName, setGroupName] = useState("");
  const [groupDescription, setGroupDescription] = useState("");
  const [isCreatingGroup, setIsCreatingGroup] = useState(false);
  const [editingGroup, setEditingGroup] = useState<LaborSafetyGroup | null>(null);
  const [showDeleteGroupConfirm, setShowDeleteGroupConfirm] = useState(false);
  const [groupToDelete, setGroupToDelete] = useState<LaborSafetyGroup | null>(null);
  
  // Record dialog
  const [showRecordDialog, setShowRecordDialog] = useState(false);
  const [editingRecord, setEditingRecord] = useState<LaborSafetyRecord | null>(null);
  const [recordForm, setRecordForm] = useState({
    full_name: "",
    snils: "",
    position: "",
    inn: "",
    organization_name: "",
    protocol_number: "",
    program_name: "",
    exam_date: "",
    is_passed: false,
  });
  const [isSavingRecord, setIsSavingRecord] = useState(false);
  
  // Bulk actions loading
  const [isBulkUpdating, setIsBulkUpdating] = useState(false);
  const [isGeneratingCredentials, setIsGeneratingCredentials] = useState(false);
  
  // Course enrollment dialog
  const [showEnrollDialog, setShowEnrollDialog] = useState(false);
  const [courses, setCourses] = useState<Course[]>([]);
  const [selectedCourseIds, setSelectedCourseIds] = useState<string[]>([]);
  const [isLoadingCourses, setIsLoadingCourses] = useState(false);
  const [isEnrolling, setIsEnrolling] = useState(false);

   // Student detail card
   const [selectedRecordForDetail, setSelectedRecordForDetail] = useState<LaborSafetyRecord | null>(null);
   const [showStudentDetailCard, setShowStudentDetailCard] = useState(false);

  // Word document generator
  const { generateDocument, isGenerating } = useWordDocumentGenerator();

  // Filtered and sorted groups
  const filteredGroups = useMemo(() => {
    let result = [...groups];
    
    // Filter by search
    if (groupSearch) {
      const search = groupSearch.toLowerCase();
      result = result.filter(g => g.name.toLowerCase().includes(search));
    }

    // Sort
    result.sort((a, b) => {
      let comparison = 0;
      switch (groupSortField) {
        case 'name':
          comparison = a.name.localeCompare(b.name, 'ru');
          break;
        case 'created_at':
          comparison = new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
          break;
        case 'records_count':
          comparison = (a.records_count || 0) - (b.records_count || 0);
          break;
      }
      return groupSortDirection === 'asc' ? comparison : -comparison;
    });

    return result;
  }, [groups, groupSearch, groupSortField, groupSortDirection]);

  // Filtered records based on search
  const filteredRecords = useMemo(() => {
    return records.filter((record) => {
      if (searchName && !record.full_name.toLowerCase().includes(searchName.toLowerCase())) {
        return false;
      }
      
      if (record.created_at) {
        const createdDate = new Date(record.created_at);
        if (dateFrom) {
          const fromDate = new Date(dateFrom);
          fromDate.setHours(0, 0, 0, 0);
          if (createdDate < fromDate) return false;
        }
        if (dateTo) {
          const toDate = new Date(dateTo);
          toDate.setHours(23, 59, 59, 999);
          if (createdDate > toDate) return false;
        }
      }
      
      return true;
    });
  }, [records, searchName, dateFrom, dateTo]);

  // Check if all filtered records are selected
  const allFilteredSelected = filteredRecords.length > 0 && 
    filteredRecords.every(r => selectedRecordIds.has(r.id));

  // Fetch groups with record counts
  const fetchGroups = useCallback(async () => {
    try {
      setIsLoading(true);
      const { data, error } = await supabase
        .from("labor_safety_groups")
        .select("*, labor_safety_records(count)")
        .eq("organization_id", organizationId)
        .order("created_at", { ascending: false });
      
      if (error) throw error;
      
      const groupsWithCount = (data || []).map(g => ({
        ...g,
        records_count: g.labor_safety_records?.[0]?.count || 0
      }));
      
      setGroups(groupsWithCount);
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
        .from("labor_safety_records")
        .select("*")
        .eq("group_id", groupId)
        .order("full_name", { ascending: true });
      
      if (error) throw error;
      
      // Fetch course enrollments for each record via labor_safety_profiles
      const recordsWithCourses = await Promise.all((data || []).map(async (record) => {
        // Get profile linked to this record
        const { data: profile } = await supabase
          .from("labor_safety_profiles")
          .select("user_id")
          .eq("record_id", record.id)
          .maybeSingle();
        
        if (profile?.user_id) {
          // Get enrollments with course titles
          const { data: enrollments } = await supabase
            .from("enrollments")
            .select("course_id, progress, status, courses(id, title)")
            .eq("user_id", profile.user_id);
          
          const enrollmentData = (enrollments || []).map((e: any) => ({
            course_id: e.course_id,
            course_title: e.courses?.title || "Курс",
            progress: e.progress || 0,
            status: e.status || "active",
          }));
          
          const courses = enrollmentData.map(e => ({ id: e.course_id, title: e.course_title }));
          
          // Calculate average progress
          const avgProgress = enrollmentData.length > 0
            ? Math.round(enrollmentData.reduce((sum, e) => sum + e.progress, 0) / enrollmentData.length)
            : 0;
          
          const hasActive = enrollmentData.some(e => e.status === "active" && e.progress < 100);
          
          return { 
            ...record, 
            courses, 
            enrollments: enrollmentData,
            averageProgress: avgProgress,
            hasActiveEnrollment: hasActive,
          };
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

  useEffect(() => {
    fetchGroups();
  }, [fetchGroups]);

  useEffect(() => {
    if (selectedGroup) {
      fetchRecords(selectedGroup.id);
      setSelectedRecordIds(new Set());
    } else {
      setRecords([]);
      setSelectedRecordIds(new Set());
    }
  }, [selectedGroup, fetchRecords]);

  const handleCreateGroup = async () => {
    if (!groupName.trim()) {
      toast.error("Введите название группы");
      return;
    }

    try {
      setIsCreatingGroup(true);
      
      if (editingGroup) {
        const { error } = await supabase
          .from("labor_safety_groups")
          .update({ name: groupName.trim() })
          .eq("id", editingGroup.id);
        
        if (error) throw error;
        toast.success("Группа обновлена");
      } else {
        const { data, error } = await supabase
          .from("labor_safety_groups")
          .insert({
            organization_id: organizationId,
            name: groupName.trim(),
          })
          .select()
          .single();
        
        if (error) throw error;
        toast.success("Группа создана");
        
        // Navigate to new group
        if (data) {
          setSelectedGroup({ ...data, records_count: 0 });
        }
      }
      
      setShowGroupDialog(false);
      setGroupName("");
      setGroupDescription("");
      setEditingGroup(null);
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
      // First delete all records in the group
      await supabase
        .from("labor_safety_records")
        .delete()
        .eq("group_id", groupToDelete.id);
      
      const { error } = await supabase
        .from("labor_safety_groups")
        .delete()
        .eq("id", groupToDelete.id);
      
      if (error) throw error;
      toast.success("Группа удалена");
      
      if (selectedGroup?.id === groupToDelete.id) {
        setSelectedGroup(null);
      }
      
      setShowDeleteGroupConfirm(false);
      setGroupToDelete(null);
      fetchGroups();
    } catch (error) {
      console.error("Error deleting group:", error);
      toast.error("Ошибка удаления группы");
    }
  };

  const handleSaveRecord = async () => {
    if (!recordForm.full_name.trim()) {
      toast.error("Введите ФИО");
      return;
    }
    if (!selectedGroup) return;

    try {
      setIsSavingRecord(true);
      
      const recordData = {
        group_id: selectedGroup.id,
        full_name: recordForm.full_name.trim(),
        snils: recordForm.snils.trim() || null,
        position: recordForm.position.trim() || null,
        inn: recordForm.inn.trim() || null,
        organization_name: recordForm.organization_name.trim() || null,
        protocol_number: recordForm.protocol_number.trim() || null,
        program_name: recordForm.program_name.trim() || null,
        exam_date: recordForm.exam_date || null,
        is_passed: recordForm.is_passed,
      };

      if (editingRecord) {
        const { error } = await supabase
          .from("labor_safety_records")
          .update(recordData)
          .eq("id", editingRecord.id);
        
        if (error) throw error;
        toast.success("Запись обновлена");
      } else {
        const { error } = await supabase
          .from("labor_safety_records")
          .insert(recordData);
        
        if (error) throw error;
        toast.success("Запись добавлена");
      }
      
      setShowRecordDialog(false);
      resetRecordForm();
      fetchRecords(selectedGroup.id);
      fetchGroups(); // Update counts
    } catch (error) {
      console.error("Error saving record:", error);
      toast.error("Ошибка сохранения записи");
    } finally {
      setIsSavingRecord(false);
    }
  };

  const handleDeleteRecord = async (recordId: string) => {
    try {
      const { error } = await supabase
        .from("labor_safety_records")
        .delete()
        .eq("id", recordId);
      
      if (error) throw error;
      toast.success("Запись удалена");
      selectedRecordIds.delete(recordId);
      setSelectedRecordIds(new Set(selectedRecordIds));
      if (selectedGroup) {
        fetchRecords(selectedGroup.id);
        fetchGroups();
      }
    } catch (error) {
      console.error("Error deleting record:", error);
      toast.error("Ошибка удаления записи");
    }
  };

  const resetRecordForm = () => {
    setRecordForm({
      full_name: "",
      snils: "",
      position: "",
      inn: "",
      organization_name: "",
      protocol_number: "",
      program_name: "",
      exam_date: "",
      is_passed: false,
    });
    setEditingRecord(null);
  };

  const openEditRecord = (record: LaborSafetyRecord) => {
    setEditingRecord(record);
    setRecordForm({
      full_name: record.full_name,
      snils: record.snils || "",
      position: record.position || "",
      inn: record.inn || "",
      organization_name: record.organization_name || "",
      protocol_number: record.protocol_number || "",
      program_name: record.program_name || "",
      exam_date: record.exam_date || "",
      is_passed: record.is_passed,
    });
    setShowRecordDialog(true);
  };

  const toggleRecordSelection = (recordId: string) => {
    const newSelection = new Set(selectedRecordIds);
    if (newSelection.has(recordId)) {
      newSelection.delete(recordId);
    } else {
      newSelection.add(recordId);
    }
    setSelectedRecordIds(newSelection);
  };

  const toggleAllFiltered = () => {
    if (allFilteredSelected) {
      const newSelection = new Set(selectedRecordIds);
      filteredRecords.forEach(r => newSelection.delete(r.id));
      setSelectedRecordIds(newSelection);
    } else {
      const newSelection = new Set(selectedRecordIds);
      filteredRecords.forEach(r => newSelection.add(r.id));
      setSelectedRecordIds(newSelection);
    }
  };

  const clearFilters = () => {
    setSearchName("");
    setDateFrom("");
    setDateTo("");
  };

  const escapeXml = (str: string) => {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  };

  const exportSelectedToXML = () => {
    const recordsToExport = selectedRecordIds.size > 0 
      ? records.filter(r => selectedRecordIds.has(r.id))
      : filteredRecords;
    
    if (recordsToExport.length === 0) {
      toast.error("Нет данных для экспорта");
      return;
    }

    const groupNameValue = selectedGroup?.name || "Группа";

    let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
    xml += `<LaborSafetyRecords group="${escapeXml(groupNameValue)}" exportDate="${format(new Date(), 'yyyy-MM-dd')}">\n`;
    
    recordsToExport.forEach((record, index) => {
      xml += `  <Record number="${index + 1}">\n`;
      xml += `    <FullName>${escapeXml(record.full_name)}</FullName>\n`;
      xml += `    <SNILS>${escapeXml(record.snils || "")}</SNILS>\n`;
      xml += `    <Position>${escapeXml(record.position || "")}</Position>\n`;
      xml += `    <INN>${escapeXml(record.inn || "")}</INN>\n`;
      xml += `    <OrganizationName>${escapeXml(record.organization_name || "")}</OrganizationName>\n`;
      xml += `    <ProtocolNumber>${escapeXml(record.protocol_number || "")}</ProtocolNumber>\n`;
      xml += `    <ProgramName>${escapeXml(record.program_name || "")}</ProgramName>\n`;
      xml += `    <ExamDate>${record.exam_date || ""}</ExamDate>\n`;
      xml += `    <IsPassed>${record.is_passed ? "Да" : "Нет"}</IsPassed>\n`;
      xml += `  </Record>\n`;
    });
    
    xml += '</LaborSafetyRecords>';

    const blob = new Blob([xml], { type: 'application/xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `labor_safety_${format(new Date(), 'yyyy-MM-dd')}.xml`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`Экспортировано ${recordsToExport.length} записей`);
  };

  const markSelectedAsPassed = async () => {
    if (selectedRecordIds.size === 0) {
      toast.error("Выберите записи");
      return;
    }

    try {
      setIsBulkUpdating(true);
      
      const { error } = await supabase
        .from("labor_safety_records")
        .update({ is_passed: true })
        .in("id", Array.from(selectedRecordIds));
      
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
    const recordsToExport = selectedRecordIds.size > 0 
      ? records.filter(r => selectedRecordIds.has(r.id))
      : filteredRecords;
    
    if (recordsToExport.length === 0) {
      toast.error("Выберите записи для протокола");
      return;
    }

    const groupNameValue = selectedGroup?.name || "Группа";
    const currentDate = format(new Date(), 'dd.MM.yyyy');

    let protocolHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Протокол проверки знаний по охране труда</title>
  <style>
    body { font-family: 'Times New Roman', serif; padding: 40px; font-size: 14px; }
    h1 { text-align: center; font-size: 16px; margin-bottom: 20px; }
    h2 { text-align: center; font-size: 14px; margin-bottom: 30px; font-weight: normal; }
    table { width: 100%; border-collapse: collapse; margin-top: 20px; }
    th, td { border: 1px solid black; padding: 8px; text-align: left; }
    th { background-color: #f0f0f0; }
    .header { margin-bottom: 20px; }
    .footer { margin-top: 40px; }
    @media print { body { padding: 20px; } }
  </style>
</head>
<body>
  <h1>ПРОТОКОЛ</h1>
  <h2>заседания комиссии по проверке знаний требований охраны труда</h2>
  
  <div class="header">
    <p><strong>Группа:</strong> ${escapeXml(groupNameValue)}</p>
    <p><strong>Дата формирования:</strong> ${currentDate}</p>
    <p><strong>Количество слушателей:</strong> ${recordsToExport.length}</p>
  </div>

  <table>
    <thead>
      <tr>
        <th>№</th>
        <th>ФИО</th>
        <th>Должность</th>
        <th>Организация</th>
        <th>Программа обучения</th>
        <th>Результат</th>
      </tr>
    </thead>
    <tbody>
      ${recordsToExport.map((record, index) => `
        <tr>
          <td>${index + 1}</td>
          <td>${escapeXml(record.full_name)}</td>
          <td>${escapeXml(record.position || '-')}</td>
          <td>${escapeXml(record.organization_name || '-')}</td>
          <td>${escapeXml(record.program_name || '-')}</td>
          <td>${record.is_passed ? 'Сдал' : 'Не сдал'}</td>
        </tr>
      `).join('')}
    </tbody>
  </table>

  <div class="footer">
    <p>Председатель комиссии: _________________________________ / ___________________ /</p>
    <p style="margin-top: 20px;">Члены комиссии:</p>
    <p>1. _________________________________ / ___________________ /</p>
    <p>2. _________________________________ / ___________________ /</p>
    <p>3. _________________________________ / ___________________ /</p>
  </div>
</body>
</html>`;

    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(protocolHtml);
      printWindow.document.close();
      printWindow.focus();
      setTimeout(() => printWindow.print(), 500);
    }
    
    toast.success(`Протокол сформирован для ${recordsToExport.length} записей`);
  };

  // Generate credentials for selected records
  const generateCredentialsForSelected = async () => {
    if (selectedRecordIds.size === 0) {
      toast.error("Выберите записи");
      return;
    }

    const recordsToProcess = records.filter(r => selectedRecordIds.has(r.id));
    if (recordsToProcess.length === 0) {
      toast.error("Нет выбранных записей");
      return;
    }

    try {
      setIsGeneratingCredentials(true);
      let successCount = 0;
      let alreadyExistsCount = 0;
      let failCount = 0;

      for (const record of recordsToProcess) {
        // Check if profile already exists for this record
        const { data: existingProfile } = await supabase
          .from("labor_safety_profiles")
          .select("id, login, generated_password")
          .eq("record_id", record.id)
          .eq("organization_id", organizationId)
          .maybeSingle();

        if (existingProfile && existingProfile.login && existingProfile.generated_password) {
          alreadyExistsCount++;
          continue;
        }

        // Create account via edge function
        const { data, error } = await supabase.functions.invoke("register-student", {
          body: {
            organization_id: organizationId,
            full_name: record.full_name,
            email: `ls_${record.id.slice(0, 8)}@temp.local`,
            no_login: false,
          }
        });

        if (error || data?.error) {
          console.error("Error registering:", error || data?.error);
          failCount++;
          continue;
        }

        if (data?.user_id) {
          // Link to labor safety profile
          const { error: linkError } = await supabase
            .from("labor_safety_profiles")
            .upsert({
              user_id: data.user_id,
              full_name: record.full_name,
              login: data.login,
              generated_password: data.generated_password,
              email: data.email,
              organization_id: organizationId,
              record_id: record.id,
            }, { onConflict: 'record_id' });

          if (linkError) {
            console.error("Error linking profile:", linkError);
            failCount++;
          } else {
            successCount++;
          }
        } else {
          failCount++;
        }
      }

      if (successCount > 0) {
        toast.success(`Создано доступов: ${successCount}`);
      }
      if (alreadyExistsCount > 0) {
        toast.info(`Уже имеют доступ: ${alreadyExistsCount}`);
      }
      if (failCount > 0) {
        toast.error(`Ошибок: ${failCount}`);
      }

      setSelectedRecordIds(new Set());
    } catch (error) {
      console.error("Error generating credentials:", error);
      toast.error("Ошибка генерации доступов");
    } finally {
      setIsGeneratingCredentials(false);
    }
  };

  // Generate Word documents for selected records
  const handleGeneratePrikaz = () => {
    const recordsToExport = selectedRecordIds.size > 0 
      ? records.filter(r => selectedRecordIds.has(r.id))
      : filteredRecords;
    
    if (recordsToExport.length === 0) {
      toast.error("Выберите записи для формирования приказа");
      return;
    }

    generateDocument({
      templateType: "prikaz",
      persons: recordsToExport.map(r => ({
        fullName: r.full_name,
        position: r.position || undefined,
        organization: r.organization_name || undefined,
        snils: r.snils || undefined,
        inn: r.inn || undefined,
        programName: r.program_name || undefined,
        examDate: r.exam_date || undefined,
        isPassed: r.is_passed,
      })),
      groupName: selectedGroup?.name,
    });
  };

  const handleGenerateProtokol = () => {
    const recordsToExport = selectedRecordIds.size > 0 
      ? records.filter(r => selectedRecordIds.has(r.id))
      : filteredRecords;
    
    if (recordsToExport.length === 0) {
      toast.error("Выберите записи для формирования протокола");
      return;
    }

    generateDocument({
      templateType: "protokol",
      persons: recordsToExport.map(r => ({
        fullName: r.full_name,
        position: r.position || undefined,
        organization: r.organization_name || undefined,
        snils: r.snils || undefined,
        inn: r.inn || undefined,
        programName: r.program_name || undefined,
        examDate: r.exam_date || undefined,
        isPassed: r.is_passed,
      })),
      groupName: selectedGroup?.name,
    });
  };

  // Fetch courses for enrollment
  const fetchCourses = useCallback(async () => {
    try {
      setIsLoadingCourses(true);
     
     // First find the "Охрана труда" category
     const { data: categoryData } = await supabase
       .from("course_categories")
       .select("id")
       .eq("organization_id", organizationId)
       .ilike("name", "%охрана труда%")
       .maybeSingle();
     
     let query = supabase
       .from("courses")
       .select("id, title, description, is_published")
       .eq("organization_id", organizationId)
       .order("title");
     
     // Filter by category if found
     if (categoryData?.id) {
       query = query.eq("category_id", categoryData.id);
     }
     
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
    if (selectedRecordIds.size === 0) {
      toast.error("Выберите записи для зачисления");
      return;
    }
    setShowEnrollDialog(true);
    setSelectedCourseIds([]);
    fetchCourses();
  };

  const enrollSelectedToCourse = async () => {
    if (selectedCourseIds.length === 0) {
      toast.error("Выберите хотя бы один курс");
      return;
    }

    const recordsToEnroll = records.filter(r => selectedRecordIds.has(r.id));
    if (recordsToEnroll.length === 0) {
      toast.error("Нет выбранных записей");
      return;
    }

    try {
      setIsEnrolling(true);

      let successCount = 0;
      let failCount = 0;
      let alreadyEnrolledCount = 0;

      for (const record of recordsToEnroll) {
       // First check labor_safety_profiles for this record
       const { data: laborProfile, error: laborProfileError } = await supabase
         .from("labor_safety_profiles")
         .select("user_id")
         .eq("record_id", record.id)
         .eq("organization_id", organizationId)
         .maybeSingle();

       if (laborProfileError) {
         console.error("Error checking labor safety profile:", laborProfileError);
          failCount++;
          continue;
        }

        let userId: string | null = null;

       if (laborProfile?.user_id) {
         userId = laborProfile.user_id;
        } else {
         // No profile exists - create one via register-student
          const { data: registerData, error: registerError } = await supabase.functions.invoke(
            "register-student",
            {
              body: {
                organization_id: organizationId,
                full_name: record.full_name,
              }
            }
          );

          if (registerError || !registerData?.user_id) {
            console.error("Error registering student:", registerError);
            failCount++;
            continue;
          }

          userId = registerData.user_id;
         
         // Link to labor safety profile
         await supabase
           .from("labor_safety_profiles")
           .upsert({
             user_id: userId,
             full_name: record.full_name,
             login: registerData.login,
             generated_password: registerData.generated_password,
             email: registerData.email,
             organization_id: organizationId,
             record_id: record.id,
           }, { onConflict: 'record_id' });
        }

        if (!userId) {
          failCount++;
          continue;
        }

        // Enroll in all selected courses
        for (const courseId of selectedCourseIds) {
          const { data: existingEnrollment } = await supabase
            .from("enrollments")
            .select("id")
            .eq("user_id", userId)
            .eq("course_id", courseId)
            .maybeSingle();

          if (existingEnrollment) {
            alreadyEnrolledCount++;
            continue;
          }

          const { error: enrollError } = await supabase
            .from("enrollments")
            .insert({
              user_id: userId,
              course_id: courseId,
              status: "active"
            });

          if (enrollError) {
            console.error("Error enrolling:", enrollError);
            failCount++;
          } else {
            successCount++;
          }
        }
      }

      if (successCount > 0) {
        toast.success(`Зачислено: ${successCount} записей`);
      }
      if (alreadyEnrolledCount > 0) {
        toast.info(`Уже зачислены: ${alreadyEnrolledCount}`);
      }
      if (failCount > 0) {
        toast.error(`Ошибок: ${failCount}`);
      }

      setShowEnrollDialog(false);
      setSelectedRecordIds(new Set());
      if (selectedGroup) fetchRecords(selectedGroup.id);
    } catch (error) {
      console.error("Error enrolling records:", error);
      toast.error("Ошибка зачисления на курс");
    } finally {
      setIsEnrolling(false);
    }
  };

  // Loading state
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  // Groups list view (when no group selected)
  if (!selectedGroup) {
    return (
      <div className="space-y-4">
        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold flex items-center gap-2">
              <Shield className="h-5 w-5 text-primary" />
              Охрана труда
            </h2>
            <p className="text-sm text-muted-foreground">
              {groups.length} {groups.length === 1 ? 'группа' : groups.length < 5 ? 'группы' : 'групп'}
            </p>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            {/* Quick search with Command */}
            <Popover open={isGroupSearchOpen} onOpenChange={setIsGroupSearchOpen}>
              <PopoverTrigger asChild>
                <Button variant="outline" className="w-full sm:w-[260px] justify-start">
                  <Search className="mr-2 h-4 w-4 shrink-0" />
                  <span className="truncate text-muted-foreground">
                    {groupSearch || "Найти группу..."}
                  </span>
                </Button>
              </PopoverTrigger>
              <PopoverContent className="p-0 w-[300px]" align="end">
                <Command>
                  <CommandInput 
                    placeholder="Поиск по названию..." 
                    value={groupSearch}
                    onValueChange={setGroupSearch}
                  />
                  <CommandList>
                    <CommandEmpty>Группы не найдены</CommandEmpty>
                    <CommandGroup heading={`Найдено: ${filteredGroups.length}`}>
                      {filteredGroups.slice(0, 15).map(group => (
                        <CommandItem
                          key={group.id}
                          onSelect={() => {
                            setSelectedGroup(group);
                            setIsGroupSearchOpen(false);
                            setGroupSearch("");
                          }}
                          className="cursor-pointer"
                        >
                          <FolderOpen className="mr-2 h-4 w-4 shrink-0" />
                          <span className="flex-1 truncate">{group.name}</span>
                          <Badge variant="secondary" className="ml-2 shrink-0">
                            {group.records_count || 0}
                          </Badge>
                        </CommandItem>
                      ))}
                      {filteredGroups.length > 15 && (
                        <div className="px-2 py-1.5 text-xs text-muted-foreground">
                          И ещё {filteredGroups.length - 15}...
                        </div>
                      )}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>

            <Button onClick={() => {
              setEditingGroup(null);
              setGroupName("");
              setGroupDescription("");
              setShowGroupDialog(true);
            }}>
              <Plus className="h-4 w-4 mr-2" />
              <span className="hidden sm:inline">Создать группу</span>
              <span className="sm:hidden">Создать</span>
            </Button>
          </div>
        </div>

        {/* Sorting controls */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm text-muted-foreground">Сортировка:</span>
          <Button
            variant={groupSortField === 'name' ? 'secondary' : 'ghost'}
            size="sm"
            onClick={() => {
              if (groupSortField === 'name') {
                setGroupSortDirection(d => d === 'asc' ? 'desc' : 'asc');
              } else {
                setGroupSortField('name');
                setGroupSortDirection('asc');
              }
            }}
          >
            По названию
            {groupSortField === 'name' && (
              groupSortDirection === 'asc' ? <SortAsc className="ml-1 h-3 w-3" /> : <SortDesc className="ml-1 h-3 w-3" />
            )}
          </Button>
          <Button
            variant={groupSortField === 'created_at' ? 'secondary' : 'ghost'}
            size="sm"
            onClick={() => {
              if (groupSortField === 'created_at') {
                setGroupSortDirection(d => d === 'asc' ? 'desc' : 'asc');
              } else {
                setGroupSortField('created_at');
                setGroupSortDirection('desc');
              }
            }}
          >
            По дате
            {groupSortField === 'created_at' && (
              groupSortDirection === 'asc' ? <SortAsc className="ml-1 h-3 w-3" /> : <SortDesc className="ml-1 h-3 w-3" />
            )}
          </Button>
          <Button
            variant={groupSortField === 'records_count' ? 'secondary' : 'ghost'}
            size="sm"
            onClick={() => {
              if (groupSortField === 'records_count') {
                setGroupSortDirection(d => d === 'asc' ? 'desc' : 'asc');
              } else {
                setGroupSortField('records_count');
                setGroupSortDirection('desc');
              }
            }}
          >
            По кол-ву записей
            {groupSortField === 'records_count' && (
              groupSortDirection === 'asc' ? <SortAsc className="ml-1 h-3 w-3" /> : <SortDesc className="ml-1 h-3 w-3" />
            )}
          </Button>

          {groupSearch && (
            <Button variant="ghost" size="sm" onClick={() => setGroupSearch("")}>
              <X className="h-3 w-3 mr-1" />
              Сбросить фильтр
            </Button>
          )}
        </div>

        {/* Groups grid */}
        {filteredGroups.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center justify-center py-12">
              <FolderOpen className="h-12 w-12 text-muted-foreground/50 mb-4" />
              <p className="text-muted-foreground text-center">
                {groups.length === 0 
                  ? "Нет групп. Создайте первую группу для учёта сотрудников."
                  : "Группы не найдены по заданным критериям."}
              </p>
              {groups.length === 0 && (
                <Button 
                  className="mt-4"
                  onClick={() => setShowGroupDialog(true)}
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Создать группу
                </Button>
              )}
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {filteredGroups.map(group => (
              <Card 
                key={group.id}
                className="cursor-pointer hover:border-primary/50 hover:shadow-md transition-all group"
                onClick={() => setSelectedGroup(group)}
              >
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <h3 className="font-medium truncate group-hover:text-primary transition-colors flex items-center gap-2">
                        {group.name}
                        <ChevronRight className="h-4 w-4 opacity-0 group-hover:opacity-100 transition-opacity" />
                      </h3>
                      <div className="flex items-center gap-3 mt-2 text-sm text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Users className="h-3.5 w-3.5" />
                          {group.records_count || 0}
                        </span>
                        <span className="flex items-center gap-1">
                          <Calendar className="h-3.5 w-3.5" />
                          {format(new Date(group.created_at), 'dd.MM.yyyy')}
                        </span>
                      </div>
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild onClick={e => e.stopPropagation()}>
                        <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={(e) => {
                          e.stopPropagation();
                          setEditingGroup(group);
                          setGroupName(group.name);
                          setShowGroupDialog(true);
                        }}>
                          <Edit className="h-4 w-4 mr-2" />
                          Редактировать
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem 
                          className="text-destructive focus:text-destructive"
                          onClick={(e) => {
                            e.stopPropagation();
                            setGroupToDelete(group);
                            setShowDeleteGroupConfirm(true);
                          }}
                        >
                          <Trash2 className="h-4 w-4 mr-2" />
                          Удалить
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Group Dialog */}
        <Dialog open={showGroupDialog} onOpenChange={setShowGroupDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {editingGroup ? 'Редактировать группу' : 'Создать группу'}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Название группы *</Label>
                <Input
                  value={groupName}
                  onChange={e => setGroupName(e.target.value)}
                  placeholder="Например: Инженеры 2024"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowGroupDialog(false)}>
                Отмена
              </Button>
              <Button onClick={handleCreateGroup} disabled={isCreatingGroup}>
                {isCreatingGroup && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                {editingGroup ? 'Сохранить' : 'Создать'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Delete Confirm */}
        <AlertDialog open={showDeleteGroupConfirm} onOpenChange={setShowDeleteGroupConfirm}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Удалить группу?</AlertDialogTitle>
              <AlertDialogDescription>
                Группа "{groupToDelete?.name}" и все записи ({groupToDelete?.records_count || 0}) в ней будут удалены. Это действие нельзя отменить.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Отмена</AlertDialogCancel>
              <AlertDialogAction onClick={handleDeleteGroup} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                Удалить
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    );
  }

  // Records view (when group is selected)
  return (
    <div className="space-y-4">
      {/* Header with back button */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Button 
            variant="ghost" 
            size="icon"
            onClick={() => setSelectedGroup(null)}
            className="shrink-0"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h2 className="text-xl font-semibold">{selectedGroup.name}</h2>
            <p className="text-sm text-muted-foreground">
              {records.length} {records.length === 1 ? 'запись' : records.length < 5 ? 'записи' : 'записей'}
            </p>
          </div>
        </div>

        <Button onClick={() => {
          resetRecordForm();
          setShowRecordDialog(true);
        }}>
          <Plus className="h-4 w-4 mr-2" />
          Добавить запись
        </Button>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="flex-1 relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Поиск по ФИО..."
                value={searchName}
                onChange={e => setSearchName(e.target.value)}
                className="pl-8 w-full"
              />
            </div>
            <div className="flex gap-2 items-center">
              <Input
                type="date"
                value={dateFrom}
                onChange={e => setDateFrom(e.target.value)}
                className="w-[130px]"
              />
              <span className="text-muted-foreground">—</span>
              <Input
                type="date"
                value={dateTo}
                onChange={e => setDateTo(e.target.value)}
                className="w-[130px]"
              />
              {(searchName || dateFrom || dateTo) && (
                <Button 
                  variant="ghost" 
                  size="icon"
                  onClick={clearFilters}
                >
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Bulk actions */}
      {selectedRecordIds.size > 0 && (
        <Card className="border-primary/50 bg-primary/5">
          <CardContent className="p-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary">
                Выбрано: {selectedRecordIds.size}
              </Badge>
              <Separator orientation="vertical" className="h-6" />
              <Button variant="outline" size="sm" onClick={exportSelectedToXML} disabled={isBulkUpdating}>
                <Download className="h-4 w-4 mr-2" />
                Экспорт XML
              </Button>
              <Button variant="outline" size="sm" onClick={markSelectedAsPassed} disabled={isBulkUpdating}>
                {isBulkUpdating ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <CheckCircle className="h-4 w-4 mr-2" />}
                Отметить сдано
              </Button>
              <Button variant="outline" size="sm" onClick={generateProtocolForSelected}>
                <FileText className="h-4 w-4 mr-2" />
                Протокол
              </Button>
              <Button variant="outline" size="sm" onClick={handleGeneratePrikaz} disabled={isGenerating}>
                {isGenerating ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <FileText className="h-4 w-4 mr-2" />}
                Приказ (Word)
              </Button>
              <Button variant="outline" size="sm" onClick={handleGenerateProtokol} disabled={isGenerating}>
                {isGenerating ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <FileText className="h-4 w-4 mr-2" />}
                Протокол (Word)
              </Button>
              <Button variant="outline" size="sm" onClick={openEnrollDialog}>
                <GraduationCap className="h-4 w-4 mr-2" />
                На курс
              </Button>
              <Button
                variant="ghost" 
                size="sm" 
                onClick={() => setSelectedRecordIds(new Set())}
              >
                <X className="h-4 w-4 mr-1" />
                Сбросить
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Records table */}
      {isLoadingRecords ? (
        <div className="flex items-center justify-center h-32">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : filteredRecords.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Users className="h-12 w-12 text-muted-foreground/50 mb-4" />
            <p className="text-muted-foreground text-center">
              {records.length === 0 
                ? "Нет записей. Добавьте первого сотрудника."
                : "Записи не найдены по заданным критериям."}
            </p>
            {records.length === 0 && (
              <Button 
                className="mt-4"
                onClick={() => {
                  resetRecordForm();
                  setShowRecordDialog(true);
                }}
              >
                <Plus className="h-4 w-4 mr-2" />
                Добавить запись
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <ScrollArea className="w-full">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">
                    <Checkbox
                      checked={allFilteredSelected}
                      onCheckedChange={toggleAllFiltered}
                    />
                  </TableHead>
                  <TableHead>ФИО</TableHead>
                  <TableHead className="hidden md:table-cell">Должность</TableHead>
                  <TableHead className="hidden lg:table-cell">Организация</TableHead>
                  <TableHead className="hidden md:table-cell">Курсы</TableHead>
                  <TableHead className="hidden lg:table-cell">СНИЛС</TableHead>
                  <TableHead className="hidden sm:table-cell">Дата экзамена</TableHead>
                  <TableHead className="w-24">Статус</TableHead>
                  <TableHead className="w-16"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredRecords.map(record => (
                  <TableRow key={record.id}>
                    <TableCell>
                      <Checkbox
                        checked={selectedRecordIds.has(record.id)}
                        onCheckedChange={() => toggleRecordSelection(record.id)}
                      />
                    </TableCell>
                     <TableCell 
                       className="font-medium cursor-pointer hover:text-primary transition-colors"
                       onClick={() => {
                         setSelectedRecordForDetail(record);
                         setShowStudentDetailCard(true);
                       }}
                     >
                       {record.full_name}
                     </TableCell>
                    <TableCell className="hidden md:table-cell">{record.position || '-'}</TableCell>
                    <TableCell className="hidden lg:table-cell">{record.organization_name || '-'}</TableCell>
                    <TableCell className="hidden md:table-cell">
                      {record.courses && record.courses.length > 0 ? (
                        <div className="flex flex-wrap gap-1 max-w-[200px]">
                          {record.courses.slice(0, 2).map((course) => (
                            <Badge key={course.id} variant="outline" className="text-xs truncate max-w-[150px]">
                              {course.title}
                            </Badge>
                          ))}
                          {record.courses.length > 2 && (
                            <Badge variant="secondary" className="text-xs">
                              +{record.courses.length - 2}
                            </Badge>
                          )}
                        </div>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="hidden lg:table-cell">{record.snils || '-'}</TableCell>
                    <TableCell className="hidden sm:table-cell">
                      {record.exam_date 
                        ? format(new Date(record.exam_date), 'dd.MM.yyyy')
                        : '-'}
                    </TableCell>
                    <TableCell>
                      {record.is_passed ? (
                        <Badge variant="default">Сдано</Badge>
                      ) : record.enrollments && record.enrollments.length > 0 ? (
                        <div className="flex flex-col gap-1">
                          <Badge variant="outline" className="text-xs">
                            Обучение: {Math.min(record.averageProgress || 0, 100)}%
                          </Badge>
                          {(record.averageProgress || 0) >= 100 && (
                            <Badge variant="secondary" className="text-xs">Завершено</Badge>
                          )}
                        </div>
                      ) : (
                        <Badge variant="secondary">Не начато</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => openEditRecord(record)}>
                            <Edit className="h-4 w-4 mr-2" />
                            Редактировать
                          </DropdownMenuItem>
                           <DropdownMenuItem onClick={() => {
                             setSelectedRecordForDetail(record);
                             setShowStudentDetailCard(true);
                           }}>
                             <User className="h-4 w-4 mr-2" />
                             Личное дело
                           </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem 
                            className="text-destructive focus:text-destructive"
                            onClick={() => handleDeleteRecord(record.id)}
                          >
                            <Trash2 className="h-4 w-4 mr-2" />
                            Удалить
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </ScrollArea>
        </Card>
      )}

      {/* Record Dialog */}
      <Dialog open={showRecordDialog} onOpenChange={(open) => {
        setShowRecordDialog(open);
        if (!open) resetRecordForm();
      }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingRecord ? "Редактировать запись" : "Добавить запись"}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-4 py-4">
            <div className="space-y-2 col-span-2">
              <Label>ФИО *</Label>
              <Input
                value={recordForm.full_name}
                onChange={(e) => setRecordForm({ ...recordForm, full_name: e.target.value })}
                placeholder="Иванов Иван Иванович"
              />
            </div>
            <div className="space-y-2">
              <Label>СНИЛС</Label>
              <Input
                value={recordForm.snils}
                onChange={(e) => setRecordForm({ ...recordForm, snils: e.target.value })}
                placeholder="123-456-789 00"
              />
            </div>
            <div className="space-y-2">
              <Label>Должность</Label>
              <Input
                value={recordForm.position}
                onChange={(e) => setRecordForm({ ...recordForm, position: e.target.value })}
                placeholder="Инженер"
              />
            </div>
            <div className="space-y-2">
              <Label>ИНН</Label>
              <Input
                value={recordForm.inn}
                onChange={(e) => setRecordForm({ ...recordForm, inn: e.target.value })}
                placeholder="1234567890"
              />
            </div>
            <div className="space-y-2">
              <Label>Организация</Label>
              <Input
                value={recordForm.organization_name}
                onChange={(e) => setRecordForm({ ...recordForm, organization_name: e.target.value })}
                placeholder="ООО 'Компания'"
              />
            </div>
            <div className="space-y-2">
              <Label>Номер протокола</Label>
              <Input
                value={recordForm.protocol_number}
                onChange={(e) => setRecordForm({ ...recordForm, protocol_number: e.target.value })}
                placeholder="20"
              />
            </div>
            <div className="space-y-2">
              <Label>Программа обучения</Label>
              <Input
                value={recordForm.program_name}
                onChange={(e) => setRecordForm({ ...recordForm, program_name: e.target.value })}
                placeholder="Охрана труда"
              />
            </div>
            <div className="space-y-2">
              <Label>Дата экзамена</Label>
              <Input
                type="date"
                value={recordForm.exam_date}
                onChange={(e) => setRecordForm({ ...recordForm, exam_date: e.target.value })}
              />
            </div>
            <div className="flex items-center gap-2 col-span-2">
              <Checkbox
                id="is_passed"
                checked={recordForm.is_passed}
                onCheckedChange={(checked) => setRecordForm({ ...recordForm, is_passed: !!checked })}
              />
              <Label htmlFor="is_passed" className="cursor-pointer">Пройдено</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setShowRecordDialog(false);
              resetRecordForm();
            }}>
              Отмена
            </Button>
            <Button onClick={handleSaveRecord} disabled={isSavingRecord}>
              {isSavingRecord && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {editingRecord ? "Сохранить" : "Добавить"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

       {/* Student Detail Card */}
       <LaborSafetyStudentDetailCard
         isOpen={showStudentDetailCard}
         onOpenChange={setShowStudentDetailCard}
         record={selectedRecordForDetail}
         organizationId={organizationId}
         onRecordUpdated={() => {
           if (selectedGroup) fetchRecords(selectedGroup.id);
         }}
       />
 
      {/* Enroll Dialog */}
      <Dialog open={showEnrollDialog} onOpenChange={setShowEnrollDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Записать на курс</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <p className="text-sm text-muted-foreground">
              Будет создан профиль и зачисление для {selectedRecordIds.size} сотрудников.
            </p>
            <div className="space-y-2">
              <Label>Выберите курсы ({selectedCourseIds.length} выбрано)</Label>
              {isLoadingCourses ? (
                <div className="flex items-center justify-center py-4">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : courses.length === 0 ? (
                <p className="text-sm text-muted-foreground py-2">Нет доступных курсов</p>
              ) : (
                <ScrollArea className="h-[250px] border rounded-md p-2">
                  <div className="space-y-2">
                    {courses.map(course => (
                      <label
                        key={course.id}
                        className="flex items-start gap-3 p-2 rounded-md hover:bg-muted cursor-pointer"
                      >
                        <Checkbox
                          checked={selectedCourseIds.includes(course.id)}
                          onCheckedChange={(checked) => {
                            if (checked) {
                              setSelectedCourseIds(prev => [...prev, course.id]);
                            } else {
                              setSelectedCourseIds(prev => prev.filter(id => id !== course.id));
                            }
                          }}
                          className="mt-0.5"
                        />
                        <span className="text-sm leading-tight">{course.title}</span>
                      </label>
                    ))}
                  </div>
                </ScrollArea>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEnrollDialog(false)}>
              Отмена
            </Button>
            <Button onClick={enrollSelectedToCourse} disabled={isEnrolling || selectedCourseIds.length === 0}>
              {isEnrolling && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Записать {selectedCourseIds.length > 0 && `(${selectedCourseIds.length})`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
