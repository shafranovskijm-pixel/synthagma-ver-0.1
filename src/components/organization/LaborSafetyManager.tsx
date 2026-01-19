import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Plus, Download, Trash2, Edit, FolderPlus, Users, Loader2, Search, CheckCircle, FileText, X, GraduationCap } from "lucide-react";
import { format } from "date-fns";

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
}

interface LaborSafetyManagerProps {
  organizationId: string;
}

export function LaborSafetyManager({ organizationId }: LaborSafetyManagerProps) {
  const [groups, setGroups] = useState<LaborSafetyGroup[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [records, setRecords] = useState<LaborSafetyRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingRecords, setIsLoadingRecords] = useState(false);
  
  // Search and filters
  const [searchName, setSearchName] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  
  // Selection
  const [selectedRecordIds, setSelectedRecordIds] = useState<Set<string>>(new Set());
  
  // Group dialog
  const [showGroupDialog, setShowGroupDialog] = useState(false);
  const [groupName, setGroupName] = useState("");
  const [isCreatingGroup, setIsCreatingGroup] = useState(false);
  const [editingGroup, setEditingGroup] = useState<LaborSafetyGroup | null>(null);
  
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
  
  // Course enrollment dialog
  const [showEnrollDialog, setShowEnrollDialog] = useState(false);
  const [courses, setCourses] = useState<Course[]>([]);
  const [selectedCourseId, setSelectedCourseId] = useState<string>("");
  const [isLoadingCourses, setIsLoadingCourses] = useState(false);
  const [isEnrolling, setIsEnrolling] = useState(false);

  // Filtered records based on search
  const filteredRecords = useMemo(() => {
    return records.filter((record) => {
      // Filter by name
      if (searchName && !record.full_name.toLowerCase().includes(searchName.toLowerCase())) {
        return false;
      }
      
      // Filter by created_at date range
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

  useEffect(() => {
    fetchGroups();
  }, [organizationId]);

  useEffect(() => {
    if (selectedGroupId) {
      fetchRecords(selectedGroupId);
      setSelectedRecordIds(new Set()); // Clear selection when switching groups
    } else {
      setRecords([]);
      setSelectedRecordIds(new Set());
    }
  }, [selectedGroupId]);

  const fetchGroups = async () => {
    try {
      setIsLoading(true);
      const { data, error } = await supabase
        .from("labor_safety_groups")
        .select("*")
        .eq("organization_id", organizationId)
        .order("created_at", { ascending: false });
      
      if (error) throw error;
      setGroups(data || []);
      
      // Auto-select first group
      if (data && data.length > 0 && !selectedGroupId) {
        setSelectedGroupId(data[0].id);
      }
    } catch (error) {
      console.error("Error fetching groups:", error);
      toast.error("Ошибка загрузки групп");
    } finally {
      setIsLoading(false);
    }
  };

  const fetchRecords = async (groupId: string) => {
    try {
      setIsLoadingRecords(true);
      const { data, error } = await supabase
        .from("labor_safety_records")
        .select("*")
        .eq("group_id", groupId)
        .order("created_at", { ascending: true });
      
      if (error) throw error;
      setRecords(data || []);
    } catch (error) {
      console.error("Error fetching records:", error);
      toast.error("Ошибка загрузки записей");
    } finally {
      setIsLoadingRecords(false);
    }
  };

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
        setSelectedGroupId(data.id);
      }
      
      setShowGroupDialog(false);
      setGroupName("");
      setEditingGroup(null);
      fetchGroups();
    } catch (error) {
      console.error("Error saving group:", error);
      toast.error("Ошибка сохранения группы");
    } finally {
      setIsCreatingGroup(false);
    }
  };

  const handleDeleteGroup = async (groupId: string) => {
    if (!confirm("Удалить группу и все её записи?")) return;
    
    try {
      const { error } = await supabase
        .from("labor_safety_groups")
        .delete()
        .eq("id", groupId);
      
      if (error) throw error;
      toast.success("Группа удалена");
      
      if (selectedGroupId === groupId) {
        setSelectedGroupId(null);
      }
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
    if (!selectedGroupId) return;

    try {
      setIsSavingRecord(true);
      
      const recordData = {
        group_id: selectedGroupId,
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
      fetchRecords(selectedGroupId);
    } catch (error) {
      console.error("Error saving record:", error);
      toast.error("Ошибка сохранения записи");
    } finally {
      setIsSavingRecord(false);
    }
  };

  const handleDeleteRecord = async (recordId: string) => {
    if (!confirm("Удалить запись?")) return;
    
    try {
      const { error } = await supabase
        .from("labor_safety_records")
        .delete()
        .eq("id", recordId);
      
      if (error) throw error;
      toast.success("Запись удалена");
      selectedRecordIds.delete(recordId);
      setSelectedRecordIds(new Set(selectedRecordIds));
      if (selectedGroupId) fetchRecords(selectedGroupId);
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

  // Toggle selection of a single record
  const toggleRecordSelection = (recordId: string) => {
    const newSelection = new Set(selectedRecordIds);
    if (newSelection.has(recordId)) {
      newSelection.delete(recordId);
    } else {
      newSelection.add(recordId);
    }
    setSelectedRecordIds(newSelection);
  };

  // Toggle all filtered records
  const toggleAllFiltered = () => {
    if (allFilteredSelected) {
      // Deselect all filtered
      const newSelection = new Set(selectedRecordIds);
      filteredRecords.forEach(r => newSelection.delete(r.id));
      setSelectedRecordIds(newSelection);
    } else {
      // Select all filtered
      const newSelection = new Set(selectedRecordIds);
      filteredRecords.forEach(r => newSelection.add(r.id));
      setSelectedRecordIds(newSelection);
    }
  };

  // Clear search filters
  const clearFilters = () => {
    setSearchName("");
    setDateFrom("");
    setDateTo("");
  };

  // Export selected records to XML
  const exportSelectedToXML = () => {
    const recordsToExport = selectedRecordIds.size > 0 
      ? records.filter(r => selectedRecordIds.has(r.id))
      : filteredRecords;
    
    if (recordsToExport.length === 0) {
      toast.error("Нет данных для экспорта");
      return;
    }

    const selectedGroup = groups.find(g => g.id === selectedGroupId);
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

  // Set is_passed = true for selected records
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
      if (selectedGroupId) fetchRecords(selectedGroupId);
    } catch (error) {
      console.error("Error updating records:", error);
      toast.error("Ошибка обновления записей");
    } finally {
      setIsBulkUpdating(false);
    }
  };

  // Generate protocol for selected records
  const generateProtocolForSelected = () => {
    const recordsToExport = selectedRecordIds.size > 0 
      ? records.filter(r => selectedRecordIds.has(r.id))
      : filteredRecords;
    
    if (recordsToExport.length === 0) {
      toast.error("Выберите записи для протокола");
      return;
    }

    const selectedGroup = groups.find(g => g.id === selectedGroupId);
    const groupNameValue = selectedGroup?.name || "Группа";
    const currentDate = format(new Date(), 'dd.MM.yyyy');

    // Generate a simple protocol document
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
    .date { text-align: right; margin-bottom: 20px; }
    .footer { margin-top: 40px; }
    .signature-line { margin-top: 40px; display: flex; justify-content: space-between; }
    .signature-item { text-align: center; }
    .signature-item .line { border-top: 1px solid black; width: 200px; margin: 0 auto; }
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

    // Open in new window for printing
    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(protocolHtml);
      printWindow.document.close();
      printWindow.focus();
      setTimeout(() => printWindow.print(), 500);
    }
    
    toast.success(`Протокол сформирован для ${recordsToExport.length} записей`);
  };

  const escapeXml = (str: string) => {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  };

  // Fetch courses for enrollment
  const fetchCourses = async () => {
    try {
      setIsLoadingCourses(true);
      const { data, error } = await supabase
        .from("courses")
        .select("id, title, description, is_published")
        .eq("organization_id", organizationId)
        .order("title");
      
      if (error) throw error;
      setCourses(data || []);
    } catch (error) {
      console.error("Error fetching courses:", error);
      toast.error("Ошибка загрузки курсов");
    } finally {
      setIsLoadingCourses(false);
    }
  };

  // Handle opening enrollment dialog
  const openEnrollDialog = () => {
    if (selectedRecordIds.size === 0) {
      toast.error("Выберите записи для зачисления");
      return;
    }
    setShowEnrollDialog(true);
    setSelectedCourseId("");
    fetchCourses();
  };

  // Enroll selected records to course
  const enrollSelectedToCourse = async () => {
    if (!selectedCourseId) {
      toast.error("Выберите курс");
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
        // Create or find profile for this record
        const { data: existingProfiles, error: profileError } = await supabase
          .from("profiles")
          .select("user_id")
          .eq("organization_id", organizationId)
          .eq("full_name", record.full_name)
          .limit(1);

        if (profileError) {
          console.error("Error checking profile:", profileError);
          failCount++;
          continue;
        }

        let userId: string | null = null;

        if (existingProfiles && existingProfiles.length > 0) {
          userId = existingProfiles[0].user_id;
        } else {
          // Create a new user/profile via edge function
          const { data: registerData, error: registerError } = await supabase.functions.invoke(
            "register-student",
            {
              body: {
                organization_id: organizationId,
                full_name: record.full_name,
                email: `${record.full_name.replace(/\s+/g, '_').toLowerCase()}_${Date.now()}@temp.local`,
                no_login: true
              }
            }
          );

          if (registerError || !registerData?.user_id) {
            console.error("Error registering student:", registerError);
            failCount++;
            continue;
          }

          userId = registerData.user_id;
        }

        if (!userId) {
          failCount++;
          continue;
        }

        // Check if already enrolled
        const { data: existingEnrollment } = await supabase
          .from("enrollments")
          .select("id")
          .eq("user_id", userId)
          .eq("course_id", selectedCourseId)
          .limit(1);

        if (existingEnrollment && existingEnrollment.length > 0) {
          alreadyEnrolledCount++;
          continue;
        }

        // Create enrollment
        const { error: enrollError } = await supabase
          .from("enrollments")
          .insert({
            user_id: userId,
            course_id: selectedCourseId,
            status: "active"
          });

        if (enrollError) {
          console.error("Error enrolling:", enrollError);
          failCount++;
        } else {
          successCount++;
        }
      }

      if (successCount > 0) {
        toast.success(`Зачислено на курс: ${successCount} чел.`);
      }
      if (alreadyEnrolledCount > 0) {
        toast.info(`Уже зачислены: ${alreadyEnrolledCount} чел.`);
      }
      if (failCount > 0) {
        toast.error(`Ошибка зачисления: ${failCount} чел.`);
      }

      setShowEnrollDialog(false);
      setSelectedRecordIds(new Set());
    } catch (error) {
      console.error("Error enrolling records:", error);
      toast.error("Ошибка зачисления на курс");
    } finally {
      setIsEnrolling(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Groups management */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Users className="w-5 h-5" />
            Группы охраны труда
          </CardTitle>
          <Dialog open={showGroupDialog} onOpenChange={setShowGroupDialog}>
            <DialogTrigger asChild>
              <Button 
                className="gap-2"
                onClick={() => {
                  setGroupName("");
                  setEditingGroup(null);
                }}
              >
                <FolderPlus className="w-4 h-4" />
                Создать группу
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{editingGroup ? "Редактировать группу" : "Создать группу"}</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label>Название группы</Label>
                  <Input
                    value={groupName}
                    onChange={(e) => setGroupName(e.target.value)}
                    placeholder="Введите название группы"
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setShowGroupDialog(false)}>
                  Отмена
                </Button>
                <Button onClick={handleCreateGroup} disabled={isCreatingGroup}>
                  {isCreatingGroup && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  {editingGroup ? "Сохранить" : "Создать"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent>
          {groups.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">
              Нет групп. Создайте первую группу для начала работы.
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {groups.map((group) => (
                <div
                  key={group.id}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg border cursor-pointer transition-colors ${
                    selectedGroupId === group.id
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-card hover:bg-secondary border-border"
                  }`}
                  onClick={() => setSelectedGroupId(group.id)}
                >
                  <span>{group.name}</span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setGroupName(group.name);
                      setEditingGroup(group);
                      setShowGroupDialog(true);
                    }}
                    className="p-1 hover:bg-secondary/50 rounded"
                  >
                    <Edit className="w-3 h-3" />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteGroup(group.id);
                    }}
                    className="p-1 hover:bg-destructive/20 rounded text-destructive"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Records table */}
      {selectedGroupId && (
        <Card>
          <CardHeader className="space-y-4">
            <div className="flex flex-row items-center justify-between flex-wrap gap-4">
              <CardTitle>
                Записи: {groups.find(g => g.id === selectedGroupId)?.name}
              </CardTitle>
              <div className="flex gap-2 flex-wrap">
                <Dialog open={showRecordDialog} onOpenChange={(open) => {
                  setShowRecordDialog(open);
                  if (!open) resetRecordForm();
                }}>
                  <DialogTrigger asChild>
                    <Button className="gap-2">
                      <Plus className="w-4 h-4" />
                      Добавить запись
                    </Button>
                  </DialogTrigger>
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
                          placeholder="Охрана труда и безопасность"
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
              </div>
            </div>
            
            {/* Search and filters */}
            <div className="flex flex-wrap gap-3 items-end">
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Поиск по ФИО</Label>
                <div className="relative">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Введите имя..."
                    value={searchName}
                    onChange={(e) => setSearchName(e.target.value)}
                    className="pl-8 w-[200px]"
                  />
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Дата создания от</Label>
                <Input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  className="w-[150px]"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Дата создания до</Label>
                <Input
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  className="w-[150px]"
                />
              </div>
              {(searchName || dateFrom || dateTo) && (
                <Button variant="ghost" size="icon" onClick={clearFilters} title="Сбросить фильтры">
                  <X className="w-4 h-4" />
                </Button>
              )}
            </div>

            {/* Bulk actions */}
            {selectedRecordIds.size > 0 && (
              <div className="flex flex-wrap gap-2 items-center p-3 bg-primary/5 rounded-lg border border-primary/20">
                <span className="text-sm font-medium">
                  Выбрано: {selectedRecordIds.size}
                </span>
                <div className="h-4 w-px bg-border" />
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={exportSelectedToXML}
                  className="gap-1"
                >
                  <Download className="w-3.5 h-3.5" />
                  Экспорт XML
                </Button>
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={markSelectedAsPassed}
                  disabled={isBulkUpdating}
                  className="gap-1"
                >
                  {isBulkUpdating ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <CheckCircle className="w-3.5 h-3.5" />
                  )}
                  Отметить пройдено
                </Button>
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={generateProtocolForSelected}
                  className="gap-1"
                >
                  <FileText className="w-3.5 h-3.5" />
                  Сформировать протокол
                </Button>
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={openEnrollDialog}
                  className="gap-1"
                >
                  <GraduationCap className="w-3.5 h-3.5" />
                  Зачислить на курс
                </Button>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={() => setSelectedRecordIds(new Set())}
                >
                  Снять выделение
                </Button>
              </div>
            )}

            {/* Enroll to Course Dialog */}
            <Dialog open={showEnrollDialog} onOpenChange={setShowEnrollDialog}>
              <DialogContent className="max-w-md">
                <DialogHeader>
                  <DialogTitle>Зачислить на курс</DialogTitle>
                </DialogHeader>
                <div className="py-4 space-y-4">
                  <p className="text-sm text-muted-foreground">
                    Будет зачислено: <strong>{selectedRecordIds.size}</strong> чел.
                  </p>
                  <div className="space-y-2">
                    <Label>Выберите курс</Label>
                    {isLoadingCourses ? (
                      <div className="flex items-center justify-center py-4">
                        <Loader2 className="w-5 h-5 animate-spin text-primary" />
                      </div>
                    ) : courses.length === 0 ? (
                      <p className="text-sm text-muted-foreground py-2">
                        Нет доступных курсов
                      </p>
                    ) : (
                      <Select value={selectedCourseId} onValueChange={setSelectedCourseId}>
                        <SelectTrigger>
                          <SelectValue placeholder="Выберите курс" />
                        </SelectTrigger>
                        <SelectContent>
                          {courses.map((course) => (
                            <SelectItem key={course.id} value={course.id}>
                              {course.title}
                              {!course.is_published && " (черновик)"}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setShowEnrollDialog(false)}>
                    Отмена
                  </Button>
                  <Button 
                    onClick={enrollSelectedToCourse} 
                    disabled={isEnrolling || !selectedCourseId || courses.length === 0}
                  >
                    {isEnrolling && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                    Зачислить
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </CardHeader>
          <CardContent>
            {isLoadingRecords ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-primary" />
              </div>
            ) : filteredRecords.length === 0 ? (
              <p className="text-muted-foreground text-center py-8">
                {records.length === 0 
                  ? "Нет записей в этой группе. Добавьте первую запись."
                  : "Нет записей, соответствующих фильтрам."}
              </p>
            ) : (
              <div className="rounded-lg border overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12">
                        <Checkbox
                          checked={allFilteredSelected}
                          onCheckedChange={toggleAllFiltered}
                        />
                      </TableHead>
                      <TableHead className="w-12">№</TableHead>
                      <TableHead>ФИО</TableHead>
                      <TableHead>СНИЛС</TableHead>
                      <TableHead>Должность</TableHead>
                      <TableHead>ИНН</TableHead>
                      <TableHead>Организация</TableHead>
                      <TableHead>Протокол</TableHead>
                      <TableHead>Программа</TableHead>
                      <TableHead>Дата</TableHead>
                      <TableHead>Пройдено</TableHead>
                      <TableHead className="w-20">Действия</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredRecords.map((record, index) => (
                      <TableRow 
                        key={record.id}
                        className={selectedRecordIds.has(record.id) ? "bg-primary/5" : ""}
                      >
                        <TableCell>
                          <Checkbox
                            checked={selectedRecordIds.has(record.id)}
                            onCheckedChange={() => toggleRecordSelection(record.id)}
                          />
                        </TableCell>
                        <TableCell>{index + 1}</TableCell>
                        <TableCell className="font-medium">{record.full_name}</TableCell>
                        <TableCell>{record.snils || "-"}</TableCell>
                        <TableCell>{record.position || "-"}</TableCell>
                        <TableCell>{record.inn || "-"}</TableCell>
                        <TableCell>{record.organization_name || "-"}</TableCell>
                        <TableCell>{record.protocol_number || "-"}</TableCell>
                        <TableCell className="max-w-[200px] truncate" title={record.program_name || ""}>
                          {record.program_name || "-"}
                        </TableCell>
                        <TableCell>
                          {record.exam_date ? format(new Date(record.exam_date), "dd.MM.yyyy") : "-"}
                        </TableCell>
                        <TableCell>
                          <span className={record.is_passed ? "text-green-600" : "text-muted-foreground"}>
                            {record.is_passed ? "Да" : "Нет"}
                          </span>
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => openEditRecord(record)}
                            >
                              <Edit className="w-4 h-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleDeleteRecord(record.id)}
                              className="text-destructive hover:text-destructive"
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
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
