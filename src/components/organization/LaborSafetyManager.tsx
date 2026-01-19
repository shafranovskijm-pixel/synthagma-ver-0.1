import { useState, useEffect } from "react";
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
import { Plus, Download, Trash2, Edit, FolderPlus, Users, Loader2 } from "lucide-react";
import { format } from "date-fns";

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

  useEffect(() => {
    fetchGroups();
  }, [organizationId]);

  useEffect(() => {
    if (selectedGroupId) {
      fetchRecords(selectedGroupId);
    } else {
      setRecords([]);
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

  const exportToXML = () => {
    if (records.length === 0) {
      toast.error("Нет данных для экспорта");
      return;
    }

    const selectedGroup = groups.find(g => g.id === selectedGroupId);
    const groupName = selectedGroup?.name || "Группа";

    let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
    xml += `<LaborSafetyRecords group="${escapeXml(groupName)}" exportDate="${format(new Date(), 'yyyy-MM-dd')}">\n`;
    
    records.forEach((record, index) => {
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
    toast.success("XML файл экспортирован");
  };

  const escapeXml = (str: string) => {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
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
          <CardHeader className="flex flex-row items-center justify-between flex-wrap gap-4">
            <CardTitle>
              Записи: {groups.find(g => g.id === selectedGroupId)?.name}
            </CardTitle>
            <div className="flex gap-2">
              <Button variant="outline" onClick={exportToXML} className="gap-2">
                <Download className="w-4 h-4" />
                Экспорт в XML
              </Button>
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
          </CardHeader>
          <CardContent>
            {isLoadingRecords ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-primary" />
              </div>
            ) : records.length === 0 ? (
              <p className="text-muted-foreground text-center py-8">
                Нет записей в этой группе. Добавьте первую запись.
              </p>
            ) : (
              <div className="rounded-lg border overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
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
                    {records.map((record, index) => (
                      <TableRow key={record.id}>
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