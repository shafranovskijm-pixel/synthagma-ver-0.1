import React, { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Users, Search, BookOpen, Filter, FileCheck, FileSpreadsheet, GraduationCap, Key, Mail, XCircle, X, Trash2, FileText, FolderOpen, Plus, Settings, Archive, ChevronDown, ChevronRight } from "lucide-react";
import { GroupSettingsDialog } from "@/components/organization/GroupSettingsDialog";
import { useOrgDashboard } from "@/contexts/OrgDashboardContext";
import { useStudents } from "@/hooks/useStudents";

import { toast } from "sonner";
import type { Student, Course } from "@/types";
import { useWordDocumentGenerator } from "@/hooks/useWordDocumentGenerator";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { ru } from "date-fns/locale";
import { SigmaSpinner } from "@/components/ui/SigmaSpinner";
import { StudentTableRow } from "./students/StudentTableRow";
import { StudentMobileCard } from "./students/StudentMobileCard";
import { StudentsEmptyState } from "./students/StudentsEmptyState";
import { StudentConfirmDialogs } from "./students/StudentConfirmDialogs";

interface StudentsTabProps {
  organizationId: string;
  courses: Course[];
  studentDocsByUser: Map<string, string[]>;
  onViewStudent: (student: Student) => void;
  onCopyCredentials: (login: string, password: string) => void;
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

type PanelMode = "active" | "archive" | "groups";

export const StudentsTab = React.memo(function StudentsTab(props: StudentsTabProps) {
  const { organizationId, courses, studentDocsByUser, onViewStudent, onCopyCredentials, isCreatingBulkCredentials = false, isSendingBulkCredentials = false } = props;
  const courseIds = courses.map(c => c.id);
  const dash = useOrgDashboard();

  const { generateDocument, isGenerating } = useWordDocumentGenerator();
  const { filteredStudents, isLoading, isError, error, frdoStatus, selectedStudentIds, setSelectedStudentIds, toggleSelection, toggleSelectAll, getSelectedUserIds, statusFilter, setStatusFilter, courseFilter, setCourseFilter, groupFilter, setGroupFilter, studentGroups, refreshGroups, studentGroupMap, docsFilter, setDocsFilter, searchQuery, setSearchQuery, removeStudent, viewMode, setViewMode, archivedStudents, activeStudentsCount, archiveByMonth, archiveStudent, unarchiveStudent, refresh } = useStudents(organizationId, courseIds, studentDocsByUser);

  const [panelMode, setPanelModeState] = useState<PanelMode>(() => {
    if (typeof window === "undefined") return "groups";
    const url = new URLSearchParams(window.location.search);
    const v = url.get("studentsView");
    if (v === "active" || v === "archive" || v === "groups") return v;
    const stored = window.localStorage.getItem("orgStudentsPanelMode");
    if (stored === "active" || stored === "archive" || stored === "groups") return stored;
    return "groups";
  });
  const setPanelMode = useCallback((mode: PanelMode) => {
    setPanelModeState(mode);
    if (mode === "active" || mode === "archive") setViewMode(mode);
    try { window.localStorage.setItem("orgStudentsPanelMode", mode); } catch {}
    try {
      const url = new URL(window.location.href);
      if (mode === "groups") url.searchParams.delete("studentsView");
      else url.searchParams.set("studentsView", mode);
      window.history.replaceState({}, "", url.toString());
    } catch {}
  }, [setViewMode]);
  React.useEffect(() => {
    if (panelMode === "active" || panelMode === "archive") setViewMode(panelMode);
  }, [panelMode, setViewMode]);


  const [showGroupDialog, setShowGroupDialog] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");
  const [newGroupColor, setNewGroupColor] = useState("#6366f1");
  const [newGroupStartDate, setNewGroupStartDate] = useState("");
  const [newGroupEndDate, setNewGroupEndDate] = useState("");
  const [settingsGroupId, setSettingsGroupId] = useState<string | null>(null);
  const [showSendConfirm, setShowSendConfirm] = useState(false);
  const [showLoginsConfirm, setShowLoginsConfirm] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [visibleCount, setVisibleCount] = useState(10);
  const [expandedMonths, setExpandedMonths] = useState<Set<string>>(new Set());
  React.useEffect(() => {
    if (panelMode === "archive" && archiveByMonth.length > 0) {
      setExpandedMonths(prev => {
        if (prev.size > 0) return prev;
        return new Set([archiveByMonth[0].key]);
      });
    }
  }, [panelMode, archiveByMonth]);
  const toggleMonth = useCallback((key: string) => {
    setExpandedMonths(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }, []);

  const handleCreateGroup = async () => {
    if (!newGroupName.trim()) return;
    try {
      const { error } = await supabase.from("student_groups").insert({ name: newGroupName.trim(), color: newGroupColor, organization_id: organizationId, start_date: newGroupStartDate || null, end_date: newGroupEndDate || null } as any);
      if (error) throw error;
      toast.success("Группа создана");
      setNewGroupName(""); setNewGroupStartDate(""); setNewGroupEndDate("");
      refreshGroups();
    } catch { toast.error("Ошибка создания группы"); }
  };

  const handleDeleteGroup = async (groupId: string) => {
    try {
      const { error } = await supabase.from("student_groups").delete().eq("id", groupId);
      if (error) throw error;
      toast.success("Группа удалена");
      if (groupFilter === groupId) setGroupFilter("all");
      refreshGroups();
    } catch { toast.error("Ошибка удаления группы"); }
  };

  const handleAssignGroup = async (userId: string, groupId: string | null) => {
    try {
      const { error } = await supabase.from("profiles").update({ student_group_id: groupId } as any).eq("user_id", userId);
      if (error) throw error;
      refreshGroups();
    } catch { toast.error("Ошибка назначения группы"); }
  };

  const getSelectedEnrollmentsCount = useCallback(() => {
    let count = 0;
    for (const id of selectedStudentIds) {
      const student = filteredStudents.find(s => s.user_id === id);
      if (student?.enrollments?.length) count += student.enrollments.length;
    }
    return count;
  }, [selectedStudentIds, filteredStudents]);

  const handleExportStudents = useCallback(async () => {
    const XLSX = await import('xlsx');
    const data = filteredStudents.map(s => ({ 'ФИО': s.name, 'Email': s.email || '', 'Логин': s.login || '', 'Пароль': s.generated_password || '', 'Курсы': s.course || 'Не зачислен', 'Прогресс (%)': s.progress, 'Статус': s.status === 'completed' ? 'Завершил' : s.status === 'active' ? 'Активный' : '—' }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Ученики');
    XLSX.writeFile(wb, `ученики_${new Date().toISOString().split('T')[0]}.xlsx`);
    toast.success('Список учеников экспортирован');
  }, [filteredStudents]);

  const handleGeneratePrikaz = useCallback(() => {
    const students = filteredStudents.filter(s => selectedStudentIds.has(s.user_id));
    if (!students.length) { toast.error("Выберите учеников"); return; }
    generateDocument({ templateType: "prikaz", persons: students.map(s => ({ fullName: s.name })) });
  }, [filteredStudents, selectedStudentIds, generateDocument]);

  const handleGenerateProtokol = useCallback(() => {
    const students = filteredStudents.filter(s => selectedStudentIds.has(s.user_id));
    if (!students.length) { toast.error("Выберите учеников"); return; }
    generateDocument({ templateType: "protokol", persons: students.map(s => ({ fullName: s.name, isPassed: s.status === 'completed' })) });
  }, [filteredStudents, selectedStudentIds, generateDocument]);

  const paginatedStudents = filteredStudents.slice(0, visibleCount);
  React.useEffect(() => { setVisibleCount(10); }, [searchQuery, statusFilter, courseFilter, groupFilter, docsFilter]);

  const bulkBusy = isCreatingBulkCredentials || isSendingBulkCredentials;
  const enrollmentsCount = getSelectedEnrollmentsCount();

  return (
    <div className="bg-card rounded-xl lg:rounded-2xl border border-border">
      {/* Active / Archive / Groups tabs */}
      <div className="px-4 lg:px-6 pt-4">
        <div className="inline-flex items-center rounded-xl border border-border bg-muted/30 p-1 text-sm w-full sm:w-auto">
          <button
            type="button"
            onClick={() => setPanelMode("groups")}
            className={`flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2 rounded-lg transition-colors ${panelMode === "groups" ? "bg-background shadow-sm font-semibold text-foreground" : "text-muted-foreground hover:text-foreground"}`}
          >
            <FolderOpen className="w-4 h-4" />
            Группы
            <span className={`ml-1 text-xs px-2 py-0.5 rounded-full ${panelMode === "groups" ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"}`}>
              {studentGroups.length}
            </span>
          </button>
          <button
            type="button"
            onClick={() => setPanelMode("active")}
            className={`flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2 rounded-lg transition-colors ${panelMode === "active" ? "bg-background shadow-sm font-semibold text-foreground" : "text-muted-foreground hover:text-foreground"}`}
          >
            <Users className="w-4 h-4" />
            Ученики
            <span className={`ml-1 text-xs px-2 py-0.5 rounded-full ${panelMode === "active" ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"}`}>
              {activeStudentsCount}
            </span>
          </button>
          <button
            type="button"
            onClick={() => setPanelMode("archive")}
            className={`flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2 rounded-lg transition-colors ${panelMode === "archive" ? "bg-background shadow-sm font-semibold text-foreground" : "text-muted-foreground hover:text-foreground"}`}
          >
            <Archive className="w-4 h-4" />
            Архив
            <span className={`ml-1 text-xs px-2 py-0.5 rounded-full ${panelMode === "archive" ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"}`}>
              {archivedStudents.length}
            </span>
          </button>
        </div>

        {panelMode === "archive" && (
          <p className="mt-2 text-xs text-muted-foreground flex items-center gap-1.5">
            <Archive className="w-3 h-3" />
            В архиве отображаются только ученики, явно перенесённые сюда вручную или через действие «Удалить» (мягкое удаление). Завершившие обучение остаются в активном списке.
          </p>
        )}
      </div>

      {panelMode === "groups" ? (
        /* Groups panel */
        <div className="p-4 lg:p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <FolderOpen className="w-4 h-4 text-muted-foreground" />
              <h2 className="font-display text-lg lg:text-xl font-semibold">Группы учеников</h2>
              <span className="text-sm text-muted-foreground">· {studentGroups.length}</span>
            </div>
            <Button variant="outline" size="sm" className="rounded-xl gap-1 text-xs" onClick={() => setShowGroupDialog(true)}>
              <Plus className="w-3.5 h-3.5" />Создать группу
            </Button>
          </div>
          {studentGroups.length === 0 ? (
            <div className="py-16 text-center text-muted-foreground">
              <FolderOpen className="w-10 h-10 mx-auto mb-3 opacity-40" />
              <p className="font-medium">Пока нет групп</p>
              <p className="text-sm mt-1">Создайте первую группу, чтобы объединять учеников.</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 lg:gap-3">
              {studentGroups.map(group => {
                const count = Array.from(studentGroupMap.values()).filter(v => v === group.id).length;
                return (
                  <div key={group.id} className="relative text-left p-3 lg:p-4 rounded-xl border border-border hover:border-primary/30 hover:bg-primary/5 transition-colors group/card">
                    <button onClick={() => dash.tabNavigation.openGroupFolder(group.id)} className="w-full text-left" title="Открыть папку группы">
                      <div className="flex items-center gap-2 mb-1"><FolderOpen className="w-4 h-4 shrink-0" style={{ color: group.color }} /><span className="font-medium text-sm truncate">{group.name}</span></div>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground"><span className="flex items-center gap-1"><Users className="w-3 h-3" />{count}</span><span>{format(new Date(group.created_at), "dd.MM.yyyy", { locale: ru })}</span></div>
                    </button>
                    <div className="absolute top-2 right-2 flex items-center gap-1 opacity-0 group-hover/card:opacity-100 transition-opacity">
                      <button onClick={e => { e.stopPropagation(); setPanelMode("active"); setGroupFilter(group.id); }} className="p-1.5 rounded-lg hover:bg-muted" title="Показать учеников группы"><Filter className="w-3.5 h-3.5 text-muted-foreground" /></button>
                      <button onClick={e => { e.stopPropagation(); setSettingsGroupId(group.id); }} className="p-1.5 rounded-lg hover:bg-muted" title="Настройки группы"><Settings className="w-3.5 h-3.5 text-muted-foreground" /></button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        <>
          {/* Header + Filters */}
          <div className="p-4 lg:p-6 border-b border-border space-y-3">
            {/* Row 1: search (left) + filters (right) */}
            <div className="flex items-center gap-2 flex-wrap">
              <div className="relative flex-1 min-w-[200px] max-w-xl">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input placeholder="Поиск по имени или email..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="pl-10 w-full rounded-xl" />
              </div>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="rounded-xl gap-2 shrink-0 text-xs lg:text-sm">
                    <Filter className="w-4 h-4" />
                    Фильтры
                    {(() => {
                      const active = [courseFilter, statusFilter, docsFilter, groupFilter].filter(v => v && v !== "all").length;
                      return active > 0 ? <span className="ml-1 text-xs px-2 py-0.5 rounded-full bg-primary/15 text-primary">{active}</span> : null;
                    })()}
                    <ChevronDown className="w-3.5 h-3.5 opacity-70" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent align="end" className="w-72 p-3 space-y-3">
                  <div>
                    <label className="text-xs font-medium text-muted-foreground mb-1 flex items-center gap-1.5"><BookOpen className="w-3.5 h-3.5" />Курс</label>
                    <Select value={courseFilter} onValueChange={setCourseFilter}><SelectTrigger className="w-full rounded-lg text-sm"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Все курсы</SelectItem>{courses.map(c => <SelectItem key={c.id} value={c.id}>{c.title}</SelectItem>)}</SelectContent></Select>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground mb-1 flex items-center gap-1.5"><Filter className="w-3.5 h-3.5" />Статус</label>
                    <Select value={statusFilter} onValueChange={v => setStatusFilter(v as any)}><SelectTrigger className="w-full rounded-lg text-sm"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Все</SelectItem><SelectItem value="active">Активные</SelectItem><SelectItem value="completed">Завершили</SelectItem><SelectItem value="not_enrolled">Не зачислены</SelectItem></SelectContent></Select>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground mb-1 flex items-center gap-1.5"><FileCheck className="w-3.5 h-3.5" />Документы</label>
                    <Select value={docsFilter} onValueChange={v => setDocsFilter(v as any)}><SelectTrigger className="w-full rounded-lg text-sm"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Все</SelectItem><SelectItem value="complete">Все загружены</SelectItem><SelectItem value="incomplete">Недостающие</SelectItem><SelectItem value="no_passport">Нет паспорта</SelectItem><SelectItem value="no_snils">Нет СНИЛС</SelectItem><SelectItem value="no_education">Нет образования</SelectItem></SelectContent></Select>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground mb-1 flex items-center gap-1.5"><FolderOpen className="w-3.5 h-3.5" />Группа</label>
                    <Select value={groupFilter} onValueChange={setGroupFilter}><SelectTrigger className="w-full rounded-lg text-sm"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Все группы</SelectItem><SelectItem value="no_group">Без группы</SelectItem>{studentGroups.map(g => <SelectItem key={g.id} value={g.id}><span className="flex items-center gap-2"><span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: g.color }} />{g.name}</span></SelectItem>)}</SelectContent></Select>
                  </div>
                  {[courseFilter, statusFilter, docsFilter, groupFilter].some(v => v && v !== "all") && (
                    <Button variant="ghost" size="sm" className="w-full rounded-lg gap-1 text-muted-foreground" onClick={() => { setCourseFilter("all"); setStatusFilter("all" as any); setDocsFilter("all" as any); setGroupFilter("all"); }}>
                      <X className="w-3.5 h-3.5" />Сбросить фильтры
                    </Button>
                  )}
                </PopoverContent>
              </Popover>
              {courseFilter !== "all" && (
                <Button variant="ghost" size="sm" onClick={() => setCourseFilter("all")} className="rounded-xl gap-1 text-muted-foreground hover:text-foreground shrink-0">
                  <X className="w-4 h-4" /><span className="hidden sm:inline">Сбросить курс</span>
                </Button>
              )}
            </div>


            {/* Row 3: bulk actions (sticky, only when selection exists) */}
            {selectedStudentIds.size > 0 && (
              <div className="sticky top-0 z-10 -mx-4 lg:-mx-6 px-4 lg:px-6 py-2 bg-card/95 backdrop-blur border-t border-border/60 flex items-center gap-2 flex-wrap">
                <span className="text-xs lg:text-sm font-medium text-foreground mr-1">Выбрано {selectedStudentIds.size}</span>
                <Button variant="ghost" size="sm" className="rounded-xl gap-1 text-xs text-muted-foreground hover:text-foreground" onClick={() => setSelectedStudentIds(new Set())}><X className="w-3.5 h-3.5" />Сбросить</Button>
                <div className="h-6 w-px bg-border mx-1" />
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button size="sm" className="btn-gradient rounded-xl gap-2 shrink-0 text-xs lg:text-sm" disabled={bulkBusy || isGenerating}>
                      {(bulkBusy || isGenerating) ? <SigmaSpinner size="sm" /> : <Settings className="w-4 h-4" />}
                      Действие
                      <ChevronDown className="w-3.5 h-3.5 opacity-70" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="w-64">
                    <DropdownMenuItem onClick={() => props.onShowEnrollDialog?.(Array.from(selectedStudentIds))}>
                      <GraduationCap className="w-4 h-4 mr-2" />Зачислить на курс
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setShowLoginsConfirm(true)} disabled={isCreatingBulkCredentials}>
                      <Key className="w-4 h-4 mr-2" />Создать логины и пароли
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setShowSendConfirm(true)} disabled={isSendingBulkCredentials}>
                      <Mail className="w-4 h-4 mr-2" />Отправить логины и пароли на почту
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={handleGeneratePrikaz} disabled={isGenerating}>
                      <FileText className="w-4 h-4 mr-2" />Сгенерировать приказ о зачислении
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={handleGenerateProtokol} disabled={isGenerating}>
                      <FileText className="w-4 h-4 mr-2" />Сгенерировать протокол
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => props.onShowBulkFRDOExport?.(Array.from(selectedStudentIds))}>
                      <FileSpreadsheet className="w-4 h-4 mr-2" />Экспорт в ФРДО
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={handleExportStudents}>
                      <FileSpreadsheet className="w-4 h-4 mr-2" />Выгрузить в Excel
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    {enrollmentsCount > 0 && (
                      <DropdownMenuItem onClick={() => props.onShowUnenrollConfirm?.(Array.from(selectedStudentIds))} className="text-destructive focus:text-destructive">
                        <XCircle className="w-4 h-4 mr-2" />Отчислить с курса ({enrollmentsCount})
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuItem onClick={() => setShowDeleteConfirm(true)} className="text-destructive focus:text-destructive">
                      <Trash2 className="w-4 h-4 mr-2" />Удалить учеников
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            )}
          </div>

          {/* Content */}
          {isLoading ? (
            <div className="flex items-center justify-center py-12"><SigmaSpinner size="lg" /></div>
          ) : isError ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground">
              <XCircle className="w-10 h-10 opacity-60" />
              <p className="font-medium text-foreground">Не удалось загрузить учеников</p>
              <p className="text-sm max-w-md text-center">
                {(() => {
                  const msg = error instanceof Error ? error.message : String((error as any)?.message ?? "");
                  if (/permission denied|row-level security/i.test(msg)) {
                    return "Недостаточно прав. Обратитесь к владельцу организации.";
                  }
                  if (/failed to fetch|network|timeout/i.test(msg)) {
                    return "Проблема с сетью или прокси. Проверьте подключение и повторите.";
                  }
                  return "Ошибка загрузки данных. Повторите попытку.";
                })()}
              </p>
              <Button variant="outline" size="sm" className="rounded-xl" onClick={refresh}>Повторить</Button>
            </div>
          ) : filteredStudents.length === 0 ? (
            panelMode === "archive" ? (
              <div className="py-16 text-center text-muted-foreground">
                <Archive className="w-10 h-10 mx-auto mb-3 opacity-40" />
                <p className="font-medium">Архив пуст</p>
                <p className="text-sm mt-1">Сюда автоматически попадают ученики, прошедшие все курсы на 100%.</p>
              </div>
            ) : (
              <StudentsEmptyState onAddStudent={props.onAddStudent} onImportStudents={props.onImportStudents} onNavigateToFRDO={props.onNavigateToFRDO} />
            )
          ) : panelMode === "archive" ? (
            <div className="divide-y divide-border">
              {archiveByMonth.map(group => {
                const isOpen = expandedMonths.has(group.key);
                return (
                  <div key={group.key}>
                    <button
                      type="button"
                      onClick={() => toggleMonth(group.key)}
                      className="w-full flex items-center justify-between px-4 lg:px-6 py-3 hover:bg-muted/40 transition-colors"
                    >
                      <div className="flex items-center gap-2">
                        {isOpen ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
                        <span className="font-medium">{group.label}</span>
                        <span className="text-xs text-muted-foreground">— {group.students.length} учен.</span>
                      </div>
                    </button>
                    {isOpen && (
                      <div className="hidden lg:block overflow-x-auto border-t border-border bg-muted/10">
                        <table className="w-full">
                          <thead><tr className="border-b border-border">
                            <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground w-12"></th>
                            <th className="text-left px-6 py-3 text-xs font-medium text-muted-foreground">Ученик</th>
                            <th className="text-left px-3 py-3 text-xs font-medium text-muted-foreground w-24">Онлайн</th>
                            <th className="text-left px-3 py-3 text-xs font-medium text-muted-foreground">Группа</th>
                            <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">Документы</th>
                            <th className="text-left px-3 py-3 text-xs font-medium text-muted-foreground">ФРДО</th>
                            <th className="text-left px-6 py-3 text-xs font-medium text-muted-foreground">Курсы</th>
                            <th className="text-left px-6 py-3 text-xs font-medium text-muted-foreground">Прогресс</th>
                            <th className="text-left px-6 py-3 text-xs font-medium text-muted-foreground">Статус</th>
                            <th className="text-left px-6 py-3 text-xs font-medium text-muted-foreground">Действия</th>
                          </tr></thead>
                          <tbody>
                            {group.students.map(student => (
                              <StudentTableRow key={student.user_id} student={student} isSelected={selectedStudentIds.has(student.user_id)} onToggleSelection={() => toggleSelection(student.user_id)} onViewStudent={() => onViewStudent(student)} onCopyCredentials={onCopyCredentials} onRemoveStudent={removeStudent} studentDocsByUser={studentDocsByUser} frdoStatus={frdoStatus} studentGroups={studentGroups} studentGroupMap={studentGroupMap} onAssignGroup={handleAssignGroup} isArchiveView onUnarchive={unarchiveStudent} />
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                    {isOpen && (
                      <div className="lg:hidden divide-y divide-border border-t border-border bg-muted/10">
                        {group.students.map(student => (
                          <StudentMobileCard key={student.user_id} student={student} isSelected={selectedStudentIds.has(student.user_id)} onToggleSelection={() => toggleSelection(student.user_id)} onViewStudent={() => onViewStudent(student)} onCopyCredentials={onCopyCredentials} studentDocsByUser={studentDocsByUser} />
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <>
              <div className="lg:hidden divide-y divide-border">
                {paginatedStudents.map(student => (
                  <StudentMobileCard key={student.user_id} student={student} isSelected={selectedStudentIds.has(student.user_id)} onToggleSelection={() => toggleSelection(student.user_id)} onViewStudent={() => onViewStudent(student)} onCopyCredentials={onCopyCredentials} studentDocsByUser={studentDocsByUser} />
                ))}
              </div>
              <div className="hidden lg:block overflow-x-auto">
                <table className="w-full">
                  <thead><tr className="border-b border-border">
                    <th className="text-left px-4 py-4 text-sm font-medium text-muted-foreground w-12"><input type="checkbox" checked={paginatedStudents.length > 0 && paginatedStudents.every(s => selectedStudentIds.has(s.user_id))} onChange={() => toggleSelectAll(paginatedStudents)} className="w-4 h-4 rounded border-border" /></th>
                    <th className="text-left px-6 py-4 text-sm font-medium text-muted-foreground">Ученик</th>
                    <th className="text-left px-3 py-4 text-sm font-medium text-muted-foreground w-24">Онлайн</th>
                    <th className="text-left px-3 py-4 text-sm font-medium text-muted-foreground">Группа</th>
                    <th className="text-left px-4 py-4 text-sm font-medium text-muted-foreground">Документы</th>
                    <th className="text-left px-3 py-4 text-sm font-medium text-muted-foreground">ФРДО</th>
                    <th className="text-left px-6 py-4 text-sm font-medium text-muted-foreground">Курсы</th>
                    <th className="text-left px-6 py-4 text-sm font-medium text-muted-foreground">Прогресс</th>
                    <th className="text-left px-6 py-4 text-sm font-medium text-muted-foreground">Статус</th>
                    <th className="text-left px-6 py-4 text-sm font-medium text-muted-foreground">Действия</th>
                  </tr></thead>
                  <tbody>
                    {paginatedStudents.map(student => (
                      <StudentTableRow key={student.user_id} student={student} isSelected={selectedStudentIds.has(student.user_id)} onToggleSelection={() => toggleSelection(student.user_id)} onViewStudent={() => onViewStudent(student)} onCopyCredentials={onCopyCredentials} onRemoveStudent={removeStudent} studentDocsByUser={studentDocsByUser} frdoStatus={frdoStatus} studentGroups={studentGroups} studentGroupMap={studentGroupMap} onAssignGroup={handleAssignGroup} onArchive={archiveStudent} />
                    ))}
                  </tbody>
                </table>
              </div>
              <LoadMoreControls visibleCount={paginatedStudents.length} totalCount={filteredStudents.length} onLoadMore={n => setVisibleCount(prev => prev + n)} />
            </>
          )}
        </>
      )}

      {/* Dialogs */}
      <Dialog open={showGroupDialog} onOpenChange={setShowGroupDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Управление группами</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="flex gap-2"><Input placeholder="Название группы..." value={newGroupName} onChange={e => setNewGroupName(e.target.value)} className="flex-1" onKeyDown={e => e.key === "Enter" && handleCreateGroup()} /><input type="color" value={newGroupColor} onChange={e => setNewGroupColor(e.target.value)} className="w-10 h-10 rounded border border-border cursor-pointer" /></div>
            <div className="flex gap-2"><div className="flex-1"><label className="text-xs text-muted-foreground mb-1 block">Дата начала</label><Input type="date" value={newGroupStartDate} onChange={e => setNewGroupStartDate(e.target.value)} /></div><div className="flex-1"><label className="text-xs text-muted-foreground mb-1 block">Дата окончания</label><Input type="date" value={newGroupEndDate} onChange={e => setNewGroupEndDate(e.target.value)} /></div></div>
            <Button onClick={handleCreateGroup} className="w-full rounded-xl gap-2"><Plus className="w-4 h-4" />Создать группу</Button>
            {studentGroups.length === 0 ? <p className="text-sm text-muted-foreground text-center py-4">Нет групп</p> : (
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {studentGroups.map(group => {
                  const count = Array.from(studentGroupMap.values()).filter(v => v === group.id).length;
                  return <div key={group.id} className="flex items-center justify-between p-3 bg-muted/50 rounded-lg"><div className="flex items-center gap-3"><span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: group.color }} /><div><div className="font-medium text-sm">{group.name}</div><div className="text-xs text-muted-foreground">{count} уч.{group.start_date && ` · с ${format(new Date(group.start_date), "d MMM", { locale: ru })}`}{group.end_date && ` по ${format(new Date(group.end_date), "d MMM yyyy", { locale: ru })}`}</div></div></div><Button variant="ghost" size="icon" className="text-destructive hover:text-destructive h-8 w-8" onClick={() => handleDeleteGroup(group.id)}><Trash2 className="w-4 h-4" /></Button></div>;
                })}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {settingsGroupId && <GroupSettingsDialog open={!!settingsGroupId} onOpenChange={v => { if (!v) setSettingsGroupId(null); }} groupId={settingsGroupId} organizationId={organizationId} onDeleted={() => { setSettingsGroupId(null); if (groupFilter === settingsGroupId) setGroupFilter("all"); refreshGroups(); }} onUpdated={() => refreshGroups()} />}

      <StudentConfirmDialogs showSendConfirm={showSendConfirm} setShowSendConfirm={setShowSendConfirm} showLoginsConfirm={showLoginsConfirm} setShowLoginsConfirm={setShowLoginsConfirm} showDeleteConfirm={showDeleteConfirm} setShowDeleteConfirm={setShowDeleteConfirm} selectedCount={selectedStudentIds.size} getSelectedUserIds={getSelectedUserIds} onBulkSendCredentials={props.onBulkSendCredentials} onBulkCreateCredentials={props.onBulkCreateCredentials} onShowBulkDeleteConfirm={props.onShowBulkDeleteConfirm} />
    </div>
  );
});
