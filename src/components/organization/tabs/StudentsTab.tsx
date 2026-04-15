import React, { useState, useCallback } from "react";
import { LoadMoreControls } from "@/components/ui/LoadMoreControls";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
import { 
  Users, Search, BookOpen, Filter, FileCheck, FileSpreadsheet, 
  GraduationCap, Key, Mail, XCircle, X, Copy, Trash2, 
  CheckCircle2, ChevronRight, AlertCircle, FileText, FolderOpen, Plus, Pencil, MessageCircle, Eye, Settings
} from "lucide-react";
import { GroupSettingsDialog } from "@/components/organization/GroupSettingsDialog";
import { useStudents } from "@/hooks/useStudents";
import { toast } from "sonner";
import type { Student, Course, StudentFRDOStatus } from "@/types";
import { useWordDocumentGenerator } from "@/hooks/useWordDocumentGenerator";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { ru } from "date-fns/locale";
import { SigmaSpinner } from "@/components/ui/SigmaSpinner";

function formatTimeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins} мин`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} ч`;
  const days = Math.floor(hours / 24);
  return `${days} дн`;
}

interface StudentsTabProps {
  organizationId: string;
  courses: Course[];
  studentDocsByUser: Map<string, string[]>;
  onViewStudent: (student: Student) => void;
  onCopyCredentials: (login: string, password: string) => void;
  // Bulk action handlers (passed from parent to maintain state)
  onBulkCreateCredentials?: (userIds: string[]) => Promise<void>;
  onBulkSendCredentials?: (userIds: string[]) => Promise<void>;
  onBulkSendDocReminders?: () => Promise<void>;
  onShowEnrollDialog?: (selectedIds: string[]) => void;
  onShowUnenrollConfirm?: (selectedIds: string[]) => void;
  onShowBulkFRDOExport?: (selectedIds: string[]) => void;
  onShowBulkDeleteConfirm?: (selectedUserIds: string[]) => void;
  isCreatingBulkCredentials?: boolean;
  isSendingBulkCredentials?: boolean;
  isSendingBulkDocReminders?: boolean;
  onAddStudent?: () => void;
  onImportStudents?: () => void;
  onNavigateToFRDO?: () => void;
}

export const StudentsTab = React.memo(function StudentsTab({
  organizationId,
  courses,
  studentDocsByUser,
  onViewStudent,
  onCopyCredentials,
  onBulkCreateCredentials,
  onBulkSendCredentials,
  onBulkSendDocReminders,
  onShowEnrollDialog,
  onShowUnenrollConfirm,
  onShowBulkFRDOExport,
  onShowBulkDeleteConfirm,
  isCreatingBulkCredentials = false,
  isSendingBulkCredentials = false,
  isSendingBulkDocReminders = false,
  onAddStudent,
  onImportStudents,
  onNavigateToFRDO }: StudentsTabProps) {
  const courseIds = courses.map(c => c.id);

  // Word document generator
  const { generateDocument, isGenerating } = useWordDocumentGenerator();
  
  const {
    filteredStudents,
    isLoading,
    frdoStatus,
    selectedStudentIds,
    setSelectedStudentIds,
    toggleSelection,
    toggleSelectAll,
    getSelectedUserIds,
    statusFilter,
    setStatusFilter,
    courseFilter,
    setCourseFilter,
    groupFilter,
    setGroupFilter,
    studentGroups,
    refreshGroups,
    studentGroupMap,
    docsFilter,
    setDocsFilter,
    searchQuery,
    setSearchQuery,
    removeStudent } = useStudents(organizationId, courseIds, studentDocsByUser);

  const [showGroupDialog, setShowGroupDialog] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");
  const [newGroupColor, setNewGroupColor] = useState("#6366f1");
  const [newGroupStartDate, setNewGroupStartDate] = useState<string>("");
  const [newGroupEndDate, setNewGroupEndDate] = useState<string>("");
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const [settingsGroupId, setSettingsGroupId] = useState<string | null>(null);
  const [showSendConfirm, setShowSendConfirm] = useState(false);
  const [showLoginsConfirm, setShowLoginsConfirm] = useState(false);
  const [showRemindConfirm, setShowRemindConfirm] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // Load-more pagination
  const [visibleCount, setVisibleCount] = useState(10);

  const handleCreateGroup = async () => {
    if (!newGroupName.trim()) return;
    try {
      const { error } = await supabase.from("student_groups").insert({
        name: newGroupName.trim(),
        color: newGroupColor,
        organization_id: organizationId,
        start_date: newGroupStartDate || null,
        end_date: newGroupEndDate || null } as any);
      if (error) throw error;
      toast.success("Группа создана");
      setNewGroupName("");
      setNewGroupStartDate("");
      setNewGroupEndDate("");
      refreshGroups();
    } catch (e) {
      toast.error("Ошибка создания группы");
    }
  };

  const handleDeleteGroup = async (groupId: string) => {
    try {
      const { error } = await supabase.from("student_groups").delete().eq("id", groupId);
      if (error) throw error;
      toast.success("Группа удалена");
      if (groupFilter === groupId) setGroupFilter("all");
      refreshGroups();
    } catch (e) {
      toast.error("Ошибка удаления группы");
    }
  };

  const handleAssignGroup = async (userId: string, groupId: string | null) => {
    try {
      const { error } = await supabase.from("profiles").update({ student_group_id: groupId } as any).eq("user_id", userId);
      if (error) throw error;
      refreshGroups();
    } catch (e) {
      toast.error("Ошибка назначения группы");
    }
  };

  const getSelectedEnrollmentsCount = useCallback(() => {
    let count = 0;
    for (const id of selectedStudentIds) {
      const student = filteredStudents.find(s => s.user_id === id);
      if (student?.enrollments && student.enrollments.length > 0) count += student.enrollments.length;
    }
    return count;
  }, [selectedStudentIds, filteredStudents]);

  const handleExportStudents = useCallback(async () => {
    const XLSX = await import('xlsx');
    const exportData = filteredStudents.map(s => ({
      'ФИО': s.name,
      'Email': s.email || '',
      'Логин': s.login || '',
      'Пароль': s.generated_password || '',
      'Курсы': s.course || 'Не зачислен',
      'Прогресс (%)': s.progress,
      'Статус': s.status === 'completed' ? 'Завершил' : s.status === 'active' ? 'Активный' : '—'
    }));
    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Ученики');
    XLSX.writeFile(wb, `ученики_${new Date().toISOString().split('T')[0]}.xlsx`);
    toast.success('Список учеников экспортирован');
  }, [filteredStudents]);

  // Generate Word documents for selected students
  const handleGeneratePrikaz = useCallback(() => {
    const studentsToExport = filteredStudents.filter(s => selectedStudentIds.has(s.user_id));
    
    if (studentsToExport.length === 0) {
      toast.error("Выберите учеников для формирования приказа");
      return;
    }

    generateDocument({
      templateType: "prikaz",
      persons: studentsToExport.map(s => ({
        fullName: s.name })) });
  }, [filteredStudents, selectedStudentIds, generateDocument]);

  const handleGenerateProtokol = useCallback(() => {
    const studentsToExport = filteredStudents.filter(s => selectedStudentIds.has(s.user_id));
    
    if (studentsToExport.length === 0) {
      toast.error("Выберите учеников для формирования протокола");
      return;
    }

    generateDocument({
      templateType: "protokol",
      persons: studentsToExport.map(s => ({
        fullName: s.name,
        isPassed: s.status === 'completed' })) });
  }, [filteredStudents, selectedStudentIds, generateDocument]);

  const renderDocumentStatus = (student: Student) => {
    const userDocs = studentDocsByUser.get(student.user_id) || [];
    const hasPassport = userDocs.some(t => t === "passport" || t === "birth_certificate");
    const hasSnils = userDocs.includes("snils");
    const hasEducation = userDocs.some(t => t === "education_document" || t === "diploma" || t === "attestat");
    
    return (
      <div className="flex items-center gap-1">
        <div 
          className={`w-6 h-6 rounded flex items-center justify-center ${hasPassport ? 'bg-green-500/10' : 'bg-red-500/10'}`} 
          title={hasPassport ? 'Паспорт загружен' : 'Нет паспорта'}
        >
          {hasPassport ? <CheckCircle2 className="w-3.5 h-3.5 text-green-500" /> : <XCircle className="w-3.5 h-3.5 text-red-500" />}
        </div>
        <div 
          className={`w-6 h-6 rounded flex items-center justify-center ${hasSnils ? 'bg-green-500/10' : 'bg-red-500/10'}`} 
          title={hasSnils ? 'СНИЛС загружен' : 'Нет СНИЛС'}
        >
          {hasSnils ? <CheckCircle2 className="w-3.5 h-3.5 text-green-500" /> : <XCircle className="w-3.5 h-3.5 text-red-500" />}
        </div>
        <div 
          className={`w-6 h-6 rounded flex items-center justify-center ${hasEducation ? 'bg-green-500/10' : 'bg-red-500/10'}`} 
          title={hasEducation ? 'Документ об образовании загружен' : 'Нет документа об образовании'}
        >
          {hasEducation ? <CheckCircle2 className="w-3.5 h-3.5 text-green-500" /> : <XCircle className="w-3.5 h-3.5 text-red-500" />}
        </div>
      </div>
    );
  };

  const renderFRDOStatus = (student: Student) => {
    const status = frdoStatus.get(student.user_id);
    if (!status || !status.hasData) {
      return (
        <div className="w-6 h-6 rounded flex items-center justify-center bg-muted" title="Данные ФРДО не заполнены">
          <XCircle className="w-3.5 h-3.5 text-muted-foreground" />
        </div>
      );
    }
    if (status.isComplete) {
      return (
        <div className="w-6 h-6 rounded flex items-center justify-center bg-green-500/10" title="Все данные ФРДО заполнены">
          <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />
        </div>
      );
    }
    return (
      <div 
        className="w-6 h-6 rounded flex items-center justify-center bg-amber-500/10" 
        title={`Не заполнено: ${status.missingFields.join(", ")}`}
      >
        <AlertCircle className="w-3.5 h-3.5 text-amber-500" />
      </div>
    );
  };

  // Load-more pagination
  const paginatedStudents = filteredStudents.slice(0, visibleCount);

  // Reset visible count when filters change
  React.useEffect(() => { setVisibleCount(10); }, [searchQuery, statusFilter, courseFilter, groupFilter, docsFilter]);

  return (
    <div className="bg-card rounded-xl lg:rounded-2xl border border-border">
      <div className="p-4 lg:p-6 border-b border-border space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-2 lg:gap-3">
            <h2 className="font-display text-lg lg:text-xl font-semibold">
              {courseFilter !== "all" ? `Ученики: ${courses.find(c => c.id === courseFilter)?.title || "Курс"}` : "Все ученики"}
            </h2>
            {courseFilter !== "all" && (
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={() => setCourseFilter("all")} 
                className="rounded-xl gap-1 text-muted-foreground hover:text-foreground"
              >
                <X className="w-4 h-4" />
                <span className="hidden sm:inline">Сбросить</span>
              </Button>
            )}
          </div>
        </div>
        
        {/* Mobile: Search first */}
        <div className="lg:hidden">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input 
              placeholder="Поиск..." 
              value={searchQuery} 
              onChange={e => setSearchQuery(e.target.value)} 
              className="pl-10 w-full rounded-xl" 
            />
          </div>
        </div>
        
        {/* Filters - scrollable on mobile */}
        <div className="flex items-center gap-2 lg:gap-3 overflow-x-auto pb-2 lg:overflow-visible lg:flex-wrap scrollbar-hide max-w-full">
        <TooltipProvider delayDuration={300}>
          {selectedStudentIds.size > 0 && (
            <>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button 
                    onClick={() => onShowEnrollDialog?.(Array.from(selectedStudentIds))} 
                    className="btn-gradient rounded-xl gap-2 shrink-0 text-xs lg:text-sm"
                  >
                    <GraduationCap className="w-4 h-4" />
                    <span className="hidden sm:inline">Зачислить</span> ({selectedStudentIds.size})
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Зачислить выбранных учеников на курс</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button 
                    onClick={() => setShowLoginsConfirm(true)} 
                    variant="outline" 
                    className="rounded-xl gap-2 shrink-0 text-xs lg:text-sm" 
                    disabled={isCreatingBulkCredentials}
                  >
                    {isCreatingBulkCredentials ? <SigmaSpinner size="sm" /> : <Key className="w-4 h-4" />}
                    <span className="hidden sm:inline">Логины</span>
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Создать логины и пароли</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button 
                    onClick={() => setShowSendConfirm(true)} 
                    variant="outline" 
                    className="rounded-xl gap-2 shrink-0 text-xs lg:text-sm" 
                    disabled={isSendingBulkCredentials}
                  >
                    {isSendingBulkCredentials ? <SigmaSpinner size="sm" /> : <Mail className="w-4 h-4" />}
                    <span className="hidden sm:inline">На почту</span>
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Отправить данные для входа на почту</TooltipContent>
              </Tooltip>
              {getSelectedEnrollmentsCount() > 0 && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button 
                      onClick={() => onShowUnenrollConfirm?.(Array.from(selectedStudentIds))} 
                      variant="outline" 
                      className="rounded-xl gap-2 text-destructive hover:text-destructive hover:bg-destructive/10 shrink-0 text-xs lg:text-sm"
                    >
                      <XCircle className="w-4 h-4" />
                      <span className="hidden sm:inline">Отчислить</span> ({getSelectedEnrollmentsCount()})
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Отчислить выбранных из курса</TooltipContent>
                </Tooltip>
              )}
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button 
                    onClick={() => onShowBulkFRDOExport?.(Array.from(selectedStudentIds))} 
                    variant="outline" 
                    className="rounded-xl gap-2 shrink-0 text-xs lg:text-sm"
                  >
                    <FileSpreadsheet className="w-4 h-4" />
                    <span className="hidden sm:inline">ФРДО</span> ({selectedStudentIds.size})
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Экспорт данных для ФРДО</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button 
                    onClick={() => setShowDeleteConfirm(true)} 
                    variant="outline" 
                    className="rounded-xl gap-2 text-destructive hover:text-destructive hover:bg-destructive/10 shrink-0 text-xs lg:text-sm"
                  >
                    <Trash2 className="w-4 h-4" />
                    <span className="hidden sm:inline">Удалить</span> ({selectedStudentIds.size})
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Удалить выбранных учеников</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button 
                    onClick={handleGeneratePrikaz} 
                    variant="outline" 
                    className="rounded-xl gap-2 shrink-0 text-xs lg:text-sm"
                    disabled={isGenerating}
                  >
                    {isGenerating ? <SigmaSpinner size="sm" /> : <FileText className="w-4 h-4" />}
                    <span className="hidden sm:inline">Приказ</span>
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Сгенерировать приказ</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button 
                    onClick={handleGenerateProtokol} 
                    variant="outline" 
                    className="rounded-xl gap-2 shrink-0 text-xs lg:text-sm"
                    disabled={isGenerating}
                  >
                    {isGenerating ? <SigmaSpinner size="sm" /> : <FileText className="w-4 h-4" />}
                    <span className="hidden sm:inline">Протокол</span>
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Сгенерировать протокол</TooltipContent>
              </Tooltip>
            </>
          )}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button 
                variant="outline" 
                className="rounded-xl gap-2 shrink-0 text-xs lg:text-sm" 
                onClick={() => setShowRemindConfirm(true)}
                disabled={isSendingBulkDocReminders}
              >
                {isSendingBulkDocReminders ? <SigmaSpinner size="sm" /> : <FileText className="w-4 h-4" />}
                <span className="hidden sm:inline">Напомнить</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent>Отправить напоминание о документах</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button 
                variant="outline" 
                className="rounded-xl gap-2 shrink-0 text-xs lg:text-sm" 
                onClick={handleExportStudents}
              >
                <FileSpreadsheet className="w-4 h-4" />
                <span className="hidden sm:inline">Экспорт</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent>Экспорт данных учеников в Excel</TooltipContent>
          </Tooltip>
          <Select value={courseFilter} onValueChange={setCourseFilter}>
            <SelectTrigger className="w-32 lg:w-48 rounded-xl shrink-0 text-xs lg:text-sm">
              <BookOpen className="w-4 h-4 mr-1 lg:mr-2" />
              <SelectValue placeholder="Курс" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Все курсы</SelectItem>
              {courses.map(course => (
                <SelectItem key={course.id} value={course.id}>{course.title}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={v => setStatusFilter(v as any)}>
            <SelectTrigger className="w-28 lg:w-44 rounded-xl shrink-0 text-xs lg:text-sm">
              <Filter className="w-4 h-4 mr-1 lg:mr-2" />
              <SelectValue placeholder="Статус" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Все</SelectItem>
              <SelectItem value="active">Активные</SelectItem>
              <SelectItem value="completed">Завершили</SelectItem>
              <SelectItem value="not_enrolled">Не зачислены</SelectItem>
            </SelectContent>
          </Select>
          <Select value={docsFilter} onValueChange={v => setDocsFilter(v as any)}>
            <SelectTrigger className="w-32 lg:w-48 rounded-xl shrink-0 text-xs lg:text-sm">
              <FileCheck className="w-4 h-4 mr-1 lg:mr-2" />
              <SelectValue placeholder="Документы" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Все</SelectItem>
              <SelectItem value="complete">Все загружены</SelectItem>
              <SelectItem value="incomplete">Недостающие</SelectItem>
              <SelectItem value="no_passport">Нет паспорта</SelectItem>
              <SelectItem value="no_snils">Нет СНИЛС</SelectItem>
              <SelectItem value="no_education">Нет образования</SelectItem>
            </SelectContent>
          </Select>
          <Select value={groupFilter} onValueChange={setGroupFilter}>
            <SelectTrigger className="w-32 lg:w-48 rounded-xl shrink-0 text-xs lg:text-sm">
              <FolderOpen className="w-4 h-4 mr-1 lg:mr-2" />
              <SelectValue placeholder="Группа" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Все группы</SelectItem>
              <SelectItem value="no_group">Без группы</SelectItem>
              {studentGroups.map(g => (
                <SelectItem key={g.id} value={g.id}>
                  <span className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: g.color }} />
                    {g.name}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="rounded-xl gap-1 shrink-0 text-xs lg:text-sm"
                onClick={() => setShowGroupDialog(true)}
              >
                <FolderOpen className="w-4 h-4" />
                <span className="hidden sm:inline">Группы</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent>Управление группами учеников</TooltipContent>
          </Tooltip>
        </TooltipProvider>
          {/* Desktop search */}
          <div className="relative hidden lg:block">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input 
              placeholder="Поиск по имени или email..." 
              value={searchQuery} 
              onChange={e => setSearchQuery(e.target.value)} 
              className="pl-10 w-64 rounded-xl" 
            />
          </div>
        </div>
      </div>

      {/* Groups section - displayed as cards above students */}
      {studentGroups.length > 0 && groupFilter === "all" && (
        <div className="px-4 lg:px-6 pt-4 pb-2 border-b border-border">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <FolderOpen className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm font-medium text-muted-foreground">{studentGroups.length} групп</span>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="rounded-xl gap-1 text-xs"
              onClick={() => setShowGroupDialog(true)}
            >
              <Plus className="w-3 h-3" />
              Создать группу
            </Button>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 lg:gap-3">
            {studentGroups.map(group => {
              const count = Array.from(studentGroupMap.values()).filter(v => v === group.id).length;
              return (
                <div
                  key={group.id}
                  className="relative text-left p-3 lg:p-4 rounded-xl border border-border hover:border-primary/30 hover:bg-primary/5 transition-colors group/card"
                >
                  <button
                    onClick={() => setGroupFilter(group.id)}
                    className="w-full text-left"
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: group.color }} />
                      <span className="font-medium text-sm truncate">{group.name}</span>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Users className="w-3 h-3" />
                        {count}
                      </span>
                      <span>
                        {format(new Date(group.created_at), "dd.MM.yyyy", { locale: ru })}
                      </span>
                    </div>
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); setSettingsGroupId(group.id); }}
                    className="absolute top-2 right-2 p-1.5 rounded-lg opacity-0 group-hover/card:opacity-100 transition-opacity hover:bg-muted"
                  >
                    <Settings className="w-3.5 h-3.5 text-muted-foreground" />
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <SigmaSpinner size="lg" />
        </div>
      ) : filteredStudents.length === 0 ? (
        <div className="py-8">
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary/10 mb-4">
              <GraduationCap className="w-8 h-8 text-primary" />
            </div>
            <h2 className="text-2xl font-bold text-foreground">Управляйте обучением эффективно</h2>
            <p className="text-muted-foreground mt-2 max-w-lg mx-auto">
              Добавьте учеников и начните отслеживать их прогресс, документы и результаты
            </p>
            <Button
              variant="outline"
              className="rounded-xl gap-2 mt-4"
              onClick={() => {
                localStorage.setItem('previewStudentDashboard', 'true');
                window.open('/student', '_blank');
              }}
            >
              <Eye className="w-4 h-4" />
              Посмотрите, как выглядит кабинет ученика
            </Button>
          </div>

          <div className="grid md:grid-cols-3 gap-6 max-w-5xl mx-auto">
            {/* Add student card */}
            <div className="relative overflow-hidden rounded-xl border-2 border-dashed border-primary/30 hover:border-primary/60 transition-all group">
              <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-primary/10 opacity-0 group-hover:opacity-100 transition-opacity" />
              <div className="relative p-6 space-y-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                    <Plus className="w-5 h-5 text-primary" />
                  </div>
                  <h3 className="text-lg font-semibold text-foreground">Добавить ученика</h3>
                </div>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  Создайте профиль ученика с автоматической генерацией логина и пароля для входа в систему.
                </p>
                <ul className="space-y-2.5">
                  <li className="flex items-center gap-2.5 text-sm text-muted-foreground">
                    <Key className="w-4 h-4 text-primary/70 shrink-0" />
                    <span>Автогенерация учётных данных</span>
                  </li>
                  <li className="flex items-center gap-2.5 text-sm text-muted-foreground">
                    <Mail className="w-4 h-4 text-primary/70 shrink-0" />
                    <span>Отправка доступа на почту</span>
                  </li>
                  <li className="flex items-center gap-2.5 text-sm text-muted-foreground">
                    <GraduationCap className="w-4 h-4 text-primary/70 shrink-0" />
                    <span>Зачисление на курсы</span>
                  </li>
                </ul>
                {onAddStudent && (
                  <Button onClick={onAddStudent} className="w-full rounded-xl gap-2 btn-gradient mt-2">
                    <Plus className="w-4 h-4" />
                    Добавить ученика
                  </Button>
                )}
              </div>
            </div>

            {/* Progress tracking card */}
            <div className="relative overflow-hidden rounded-xl border-2 border-dashed border-accent/30 hover:border-accent/60 transition-all group">
              <div className="absolute inset-0 bg-gradient-to-br from-accent/5 via-transparent to-accent/10 opacity-0 group-hover:opacity-100 transition-opacity" />
              <div className="relative p-6 space-y-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-accent/20 flex items-center justify-center">
                    <BookOpen className="w-5 h-5 text-accent-foreground" />
                  </div>
                  <h3 className="text-lg font-semibold text-foreground">Контроль обучения</h3>
                </div>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  Отслеживайте прогресс, результаты тестов и время обучения каждого ученика в реальном времени.
                </p>
                <ul className="space-y-2.5">
                  <li className="flex items-center gap-2.5 text-sm text-muted-foreground">
                    <CheckCircle2 className="w-4 h-4 text-primary/70 shrink-0" />
                    <span>Прогресс по каждому уроку</span>
                  </li>
                  <li className="flex items-center gap-2.5 text-sm text-muted-foreground">
                    <FileCheck className="w-4 h-4 text-primary/70 shrink-0" />
                    <span>Результаты тестирования</span>
                  </li>
                  <li className="flex items-center gap-2.5 text-sm text-muted-foreground">
                    <FolderOpen className="w-4 h-4 text-primary/70 shrink-0" />
                    <span>Группировка по группам</span>
                  </li>
                </ul>
                {onImportStudents && (
                  <Button onClick={onImportStudents} variant="outline" className="w-full rounded-xl gap-2 mt-2">
                    <FileSpreadsheet className="w-4 h-4" />
                    Импорт учеников
                  </Button>
                )}
              </div>
            </div>

            {/* Documents card */}
            <div className="relative overflow-hidden rounded-xl border-2 border-dashed border-muted-foreground/20 hover:border-muted-foreground/40 transition-all group">
              <div className="absolute inset-0 bg-gradient-to-br from-muted/30 via-transparent to-muted/10 opacity-0 group-hover:opacity-100 transition-opacity" />
              <div className="relative p-6 space-y-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center">
                    <FileText className="w-5 h-5 text-muted-foreground" />
                  </div>
                  <h3 className="text-lg font-semibold text-foreground">Документооборот</h3>
                </div>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  Собирайте документы учеников, формируйте приказы, протоколы и выгружайте данные в ФРДО.
                </p>
                <ul className="space-y-2.5">
                  <li className="flex items-center gap-2.5 text-sm text-muted-foreground">
                    <FileSpreadsheet className="w-4 h-4 text-primary/70 shrink-0" />
                    <span>Экспорт в Excel и ФРДО</span>
                  </li>
                  <li className="flex items-center gap-2.5 text-sm text-muted-foreground">
                    <FileText className="w-4 h-4 text-primary/70 shrink-0" />
                    <span>Приказы и протоколы</span>
                  </li>
                  <li className="flex items-center gap-2.5 text-sm text-muted-foreground">
                    <MessageCircle className="w-4 h-4 text-primary/70 shrink-0" />
                    <span>Напоминания о документах</span>
                  </li>
                </ul>
                {onNavigateToFRDO && (
                  <Button onClick={onNavigateToFRDO} variant="outline" className="w-full rounded-xl gap-2 mt-2">
                    <FileText className="w-4 h-4" />
                    Перейти в ФИС ФРДО
                  </Button>
                )}
              </div>
            </div>
          </div>
        </div>
      ) : (
        <>
          {/* Mobile view - cards */}
          <div className="lg:hidden divide-y divide-border">
            {paginatedStudents.map(student => {
              const isSelected = selectedStudentIds.has(student.user_id);
              const userDocs = studentDocsByUser.get(student.user_id) || [];
              const hasPassport = userDocs.some(t => t === "passport" || t === "birth_certificate");
              const hasSnils = userDocs.includes("snils");
              const hasEducation = userDocs.some(t => t === "education_document" || t === "diploma" || t === "attestat");
              const enrollmentsCount = student.enrollments?.length || 0;
              
              return (
                <div 
                  key={student.user_id} 
                  className={`p-4 ${isSelected ? 'bg-primary/5' : ''}`}
                  onClick={() => onViewStudent(student)}
                >
                  <div className="flex items-start gap-3">
                    <div onClick={e => e.stopPropagation()}>
                      <input 
                        type="checkbox" 
                        checked={isSelected} 
                        onChange={() => toggleSelection(student.user_id)} 
                        className="w-4 h-4 rounded border-border mt-1" 
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="font-medium truncate">{student.name}</div>
                          {student.login && (
                            <div className="flex items-center gap-1 mt-1">
                              <span className="bg-primary/10 text-primary px-1.5 py-0.5 rounded text-xs font-mono">{student.login}</span>
                              {student.generated_password && (
                                <button 
                                  onClick={e => {
                                    e.stopPropagation();
                                    onCopyCredentials(student.login!, student.generated_password!);
                                  }} 
                                  className="p-1 hover:bg-muted rounded transition-colors"
                                >
                                  <Copy className="w-3 h-3 text-muted-foreground" />
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                        <span className={`shrink-0 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                          student.status === 'completed' ? 'bg-sigma-green/10 text-sigma-green' : 
                          student.status === 'active' ? 'bg-primary/10 text-primary' : 
                          'bg-muted text-muted-foreground'
                        }`}>
                          {student.status === 'completed' ? 'Завершил' : student.status === 'active' ? 'Активный' : '—'}
                        </span>
                      </div>
                      
                      <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                        <span className="truncate">
                          {enrollmentsCount === 0 ? 'Не зачислен' : 
                           enrollmentsCount === 1 ? student.course : 
                           `${enrollmentsCount} курс(а)`}
                        </span>
                        <span className="shrink-0">{Math.min(student.progress, 100)}%</span>
                      </div>
                      
                      <div className="flex items-center gap-1 mt-2">
                        <div className={`w-5 h-5 rounded flex items-center justify-center ${hasPassport ? 'bg-green-500/10' : 'bg-red-500/10'}`}>
                          {hasPassport ? <CheckCircle2 className="w-3 h-3 text-green-500" /> : <XCircle className="w-3 h-3 text-red-500" />}
                        </div>
                        <div className={`w-5 h-5 rounded flex items-center justify-center ${hasSnils ? 'bg-green-500/10' : 'bg-red-500/10'}`}>
                          {hasSnils ? <CheckCircle2 className="w-3 h-3 text-green-500" /> : <XCircle className="w-3 h-3 text-red-500" />}
                        </div>
                        <div className={`w-5 h-5 rounded flex items-center justify-center ${hasEducation ? 'bg-green-500/10' : 'bg-red-500/10'}`}>
                          {hasEducation ? <CheckCircle2 className="w-3 h-3 text-green-500" /> : <XCircle className="w-3 h-3 text-red-500" />}
                        </div>
                      </div>
                    </div>
                    <ChevronRight className="w-5 h-5 text-muted-foreground shrink-0" />
                  </div>
                </div>
              );
            })}
          </div>
          
          {/* Desktop view - table */}
          <div className="hidden lg:block overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left px-4 py-4 text-sm font-medium text-muted-foreground w-12">
                    <input 
                      type="checkbox" 
                      checked={paginatedStudents.length > 0 && paginatedStudents.every(s => selectedStudentIds.has(s.user_id))} 
                      onChange={() => toggleSelectAll(paginatedStudents)} 
                      className="w-4 h-4 rounded border-border" 
                    />
                  </th>
                   <th className="text-left px-6 py-4 text-sm font-medium text-muted-foreground">Ученик</th>
                  <th className="text-left px-3 py-4 text-sm font-medium text-muted-foreground w-24">Онлайн</th>
                  <th className="text-left px-3 py-4 text-sm font-medium text-muted-foreground">Группа</th>
                  <th className="text-left px-4 py-4 text-sm font-medium text-muted-foreground">Документы</th>
                  <th className="text-left px-3 py-4 text-sm font-medium text-muted-foreground">ФРДО</th>
                  <th className="text-left px-6 py-4 text-sm font-medium text-muted-foreground">Курсы</th>
                  <th className="text-left px-6 py-4 text-sm font-medium text-muted-foreground">Прогресс</th>
                  <th className="text-left px-6 py-4 text-sm font-medium text-muted-foreground">Статус</th>
                  <th className="text-left px-6 py-4 text-sm font-medium text-muted-foreground">Действия</th>
                </tr>
              </thead>
              <tbody>
                {paginatedStudents.map(student => {
                  const isSelected = selectedStudentIds.has(student.user_id);
                  const enrollmentsCount = student.enrollments?.length || 0;
                  
                  return (
                    <tr 
                      key={student.user_id} 
                      className={`border-b border-border last:border-0 hover:bg-secondary/50 transition-colors cursor-pointer ${isSelected ? 'bg-primary/5' : ''}`} 
                      onClick={() => onViewStudent(student)}
                    >
                      <td className="px-4 py-4" onClick={e => e.stopPropagation()}>
                        <input 
                          type="checkbox" 
                          checked={isSelected} 
                          onChange={() => toggleSelection(student.user_id)} 
                          className="w-4 h-4 rounded border-border" 
                        />
                      </td>
                      <td className="px-6 py-4">
                        <div>
                          <div className="font-medium">{student.name}</div>
                          <div className="text-sm text-muted-foreground">
                            {student.login ? (
                              <div className="flex flex-col gap-0.5">
                                <span className="inline-flex items-center gap-2">
                                  <span className="bg-primary/10 text-primary px-1.5 py-0.5 rounded text-xs font-mono">{student.login}</span>
                                  {student.generated_password && (
                                    <span className="bg-muted text-muted-foreground px-1.5 py-0.5 rounded text-xs font-mono">{student.generated_password}</span>
                                  )}
                                  {student.login && student.generated_password && (
                                    <button 
                                      onClick={e => {
                                        e.stopPropagation();
                                        onCopyCredentials(student.login!, student.generated_password!);
                                      }} 
                                      className="p-1 hover:bg-muted rounded transition-colors" 
                                      title="Копировать логин и пароль"
                                    >
                                      <Copy className="w-3 h-3 text-muted-foreground" />
                                    </button>
                                  )}
                                </span>
                                {student.email && <span className="text-muted-foreground/50 text-xs">{student.email}</span>}
                              </div>
                            ) : (
                              student.email
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-4">
                        {(() => {
                          const isOnline = student.last_visit_at && (Date.now() - new Date(student.last_visit_at).getTime()) < 5 * 60 * 1000;
                          return (
                            <div className="flex items-center gap-1.5">
                              <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${isOnline ? 'bg-green-500' : 'bg-muted-foreground/30'}`} />
                              <span className="text-xs text-muted-foreground">
                                {isOnline ? 'онлайн' : student.last_visit_at ? formatTimeAgo(student.last_visit_at) : '—'}
                              </span>
                            </div>
                          );
                        })()}
                      </td>
                      <td className="px-3 py-4" onClick={e => e.stopPropagation()}>
                        {(() => {
                          const gId = studentGroupMap.get(student.user_id);
                          const group = studentGroups.find(g => g.id === gId);
                          return (
                            <Select
                              value={gId || "none"}
                              onValueChange={v => handleAssignGroup(student.user_id, v === "none" ? null : v)}
                            >
                              <SelectTrigger className="w-28 h-7 text-xs rounded-lg">
                                <SelectValue placeholder="—" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="none">—</SelectItem>
                                {studentGroups.map(g => (
                                  <SelectItem key={g.id} value={g.id}>
                                    <span className="flex items-center gap-1.5">
                                      <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: g.color }} />
                                      {g.name}
                                    </span>
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          );
                        })()}
                      </td>
                      <td className="px-4 py-4">
                        {renderDocumentStatus(student)}
                      </td>
                      <td className="px-3 py-4">
                        {renderFRDOStatus(student)}
                      </td>
                      <td className="px-6 py-4 text-sm max-w-[200px]">
                        {enrollmentsCount === 0 ? (
                          <span className="text-muted-foreground italic">Не зачислен</span>
                        ) : enrollmentsCount === 1 ? (
                          <span className="truncate block">{student.course}</span>
                        ) : (
                          <div className="space-y-1">
                            {student.enrollments?.slice(0, 2).map((e, i) => (
                              <span key={e.id} className="block truncate text-xs">{e.course_title}</span>
                            ))}
                            {enrollmentsCount > 2 && (
                              <span className="text-xs text-muted-foreground">+{enrollmentsCount - 2} ещё</span>
                            )}
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <Progress value={Math.min(student.progress, 100)} className="w-20 h-2" />
                          <span className="text-sm font-medium">{Math.min(student.progress, 100)}%</span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${
                          student.status === 'completed' ? 'bg-sigma-green/10 text-sigma-green' : 
                          student.status === 'active' ? 'bg-primary/10 text-primary' : 
                          'bg-muted text-muted-foreground'
                        }`}>
                          {student.status === 'completed' ? 'Завершил' : student.status === 'active' ? 'Активный' : '—'}
                        </span>
                      </td>
                      <td className="px-6 py-4" onClick={e => e.stopPropagation()}>
                        <div className="flex gap-2">
                          {student.login && student.generated_password && (
                            <Button 
                              variant="outline" 
                              size="sm" 
                              className="rounded-lg gap-1" 
                              onClick={() => onCopyCredentials(student.login!, student.generated_password!)} 
                              title="Копировать логин и пароль"
                            >
                              <Copy className="w-4 h-4" />
                            </Button>
                          )}
                          <Button 
                            variant="outline" 
                            size="sm" 
                            className="rounded-lg text-destructive hover:text-destructive" 
                            onClick={() => removeStudent(student.user_id)} 
                            title="Удалить ученика"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <LoadMoreControls
            visibleCount={paginatedStudents.length}
            totalCount={filteredStudents.length}
            onLoadMore={(n) => setVisibleCount(prev => prev + n)}
          />
        </>
      )}

      {/* Group Management Dialog */}
      <Dialog open={showGroupDialog} onOpenChange={setShowGroupDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Управление группами</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex gap-2">
              <Input
                placeholder="Название группы..."
                value={newGroupName}
                onChange={e => setNewGroupName(e.target.value)}
                className="flex-1"
                onKeyDown={e => e.key === "Enter" && handleCreateGroup()}
              />
              <input
                type="color"
                value={newGroupColor}
                onChange={e => setNewGroupColor(e.target.value)}
                className="w-10 h-10 rounded border border-border cursor-pointer"
              />
            </div>
            <div className="flex gap-2">
              <div className="flex-1">
                <label className="text-xs text-muted-foreground mb-1 block">Дата начала</label>
                <Input
                  type="date"
                  value={newGroupStartDate}
                  onChange={e => setNewGroupStartDate(e.target.value)}
                />
              </div>
              <div className="flex-1">
                <label className="text-xs text-muted-foreground mb-1 block">Дата окончания</label>
                <Input
                  type="date"
                  value={newGroupEndDate}
                  onChange={e => setNewGroupEndDate(e.target.value)}
                />
              </div>
            </div>
            <Button onClick={handleCreateGroup} className="w-full rounded-xl gap-2">
              <Plus className="w-4 h-4" />
              Создать группу
            </Button>
            
            {studentGroups.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">Нет групп</p>
            ) : (
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {studentGroups.map(group => {
                  const count = Array.from(studentGroupMap.values()).filter(v => v === group.id).length;
                  return (
                    <div key={group.id} className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                      <div className="flex items-center gap-3">
                        <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: group.color }} />
                        <div>
                          <div className="font-medium text-sm">{group.name}</div>
                          <div className="text-xs text-muted-foreground">
                            {count} уч.
                            {group.start_date && ` · с ${format(new Date(group.start_date), "d MMM", { locale: ru })}`}
                            {group.end_date && ` по ${format(new Date(group.end_date), "d MMM yyyy", { locale: ru })}`}
                          </div>
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-destructive hover:text-destructive h-8 w-8"
                        onClick={() => handleDeleteGroup(group.id)}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {settingsGroupId && (
        <GroupSettingsDialog
          open={!!settingsGroupId}
          onOpenChange={(v) => { if (!v) setSettingsGroupId(null); }}
          groupId={settingsGroupId}
          organizationId={organizationId}
          onDeleted={() => { setSettingsGroupId(null); if (groupFilter === settingsGroupId) setGroupFilter("all"); refreshGroups(); }}
          onUpdated={() => refreshGroups()}
        />
      )}

      <AlertDialog open={showSendConfirm} onOpenChange={setShowSendConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Отправка данных на почту</AlertDialogTitle>
            <AlertDialogDescription>
              Вы действительно хотите отправить данные для входа на почту{" "}
              <strong>{selectedStudentIds.size}</strong>{" "}
              {selectedStudentIds.size === 1 ? "ученику" : selectedStudentIds.size < 5 ? "ученикам" : "ученикам"}?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Нет</AlertDialogCancel>
            <AlertDialogAction onClick={() => {
              onBulkSendCredentials?.(getSelectedUserIds());
              setShowSendConfirm(false);
            }}>
              Да, отправить
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={showLoginsConfirm} onOpenChange={setShowLoginsConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Генерация логинов и паролей</AlertDialogTitle>
            <AlertDialogDescription>
              Вы действительно хотите сгенерировать логины и пароли для{" "}
              <strong>{selectedStudentIds.size}</strong>{" "}
              {selectedStudentIds.size === 1 ? "ученика" : "учеников"}?
              Существующие данные будут перезаписаны.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Нет</AlertDialogCancel>
            <AlertDialogAction onClick={() => {
              onBulkCreateCredentials?.(getSelectedUserIds());
              setShowLoginsConfirm(false);
            }}>
              Да, сгенерировать
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={showRemindConfirm} onOpenChange={setShowRemindConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Отправка напоминаний</AlertDialogTitle>
            <AlertDialogDescription>
              Вы действительно хотите отправить напоминание о загрузке документов всем ученикам?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Нет</AlertDialogCancel>
            <AlertDialogAction onClick={() => {
              onBulkSendDocReminders?.();
              setShowRemindConfirm(false);
            }}>
              Да, отправить
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Удаление учеников</AlertDialogTitle>
            <AlertDialogDescription>
              Вы действительно хотите удалить{" "}
              <strong>{selectedStudentIds.size}</strong>{" "}
              {selectedStudentIds.size === 1 ? "ученика" : "учеников"}?
              Это действие нельзя отменить.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Нет</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                onShowBulkDeleteConfirm?.(getSelectedUserIds());
                setShowDeleteConfirm(false);
              }}
            >
              Да, удалить
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
});