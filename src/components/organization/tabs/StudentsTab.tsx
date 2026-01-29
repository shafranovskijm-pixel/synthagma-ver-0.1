import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { 
  Users, Search, BookOpen, Filter, FileCheck, FileSpreadsheet, 
  GraduationCap, Key, Mail, XCircle, X, Loader2, Copy, Trash2, 
  CheckCircle2, ChevronRight, AlertCircle, FileText
} from "lucide-react";
import { useStudents } from "@/hooks/useStudents";
import { toast } from "sonner";
import type { Student, Course, StudentFRDOStatus } from "@/types";

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
}

export function StudentsTab({
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
}: StudentsTabProps) {
  const courseIds = courses.map(c => c.id);
  
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
    docsFilter,
    setDocsFilter,
    searchQuery,
    setSearchQuery,
    removeStudent,
    unenrollFromCourse,
  } = useStudents(organizationId, courseIds, studentDocsByUser);

  const getSelectedEnrollmentsCount = useCallback(() => {
    let count = 0;
    for (const id of selectedStudentIds) {
      const student = filteredStudents.find(s => s.enrollment_id === id);
      if (student?.enrollment_id) count++;
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
      'Курс': s.course || 'Не зачислен',
      'Прогресс (%)': s.progress,
      'Статус': s.status === 'completed' ? 'Завершил' : s.status === 'active' ? 'Активный' : '—'
    }));
    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Ученики');
    XLSX.writeFile(wb, `ученики_${new Date().toISOString().split('T')[0]}.xlsx`);
    toast.success('Список учеников экспортирован');
  }, [filteredStudents]);

  // If student has enrollment, unenroll from course; otherwise delete profile entirely
  const handleDeleteOrUnenroll = useCallback(async (student: Student) => {
    if (student.enrollment_id) {
      // Student is enrolled in a course - just unenroll from this course
      await unenrollFromCourse(student.enrollment_id);
    } else {
      // Student has no enrollments - delete the profile
      await removeStudent(student.user_id);
    }
  }, [removeStudent, unenrollFromCourse]);

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
          {selectedStudentIds.size > 0 && (
            <>
              <Button 
                onClick={() => onShowEnrollDialog?.(Array.from(selectedStudentIds))} 
                className="btn-gradient rounded-xl gap-2 shrink-0 text-xs lg:text-sm"
              >
                <GraduationCap className="w-4 h-4" />
                <span className="hidden sm:inline">Зачислить</span> ({selectedStudentIds.size})
              </Button>
              <Button 
                onClick={() => onBulkCreateCredentials?.(getSelectedUserIds())} 
                variant="outline" 
                className="rounded-xl gap-2 shrink-0 text-xs lg:text-sm" 
                disabled={isCreatingBulkCredentials}
              >
                {isCreatingBulkCredentials ? <Loader2 className="w-4 h-4 animate-spin" /> : <Key className="w-4 h-4" />}
                <span className="hidden sm:inline">Логины</span>
              </Button>
              <Button 
                onClick={() => onBulkSendCredentials?.(getSelectedUserIds())} 
                variant="outline" 
                className="rounded-xl gap-2 shrink-0 text-xs lg:text-sm" 
                disabled={isSendingBulkCredentials}
              >
                {isSendingBulkCredentials ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />}
                <span className="hidden sm:inline">На почту</span>
              </Button>
              {getSelectedEnrollmentsCount() > 0 && (
                <Button 
                  onClick={() => onShowUnenrollConfirm?.(Array.from(selectedStudentIds))} 
                  variant="outline" 
                  className="rounded-xl gap-2 text-destructive hover:text-destructive hover:bg-destructive/10 shrink-0 text-xs lg:text-sm"
                >
                  <XCircle className="w-4 h-4" />
                  <span className="hidden sm:inline">Отчислить</span> ({getSelectedEnrollmentsCount()})
                </Button>
              )}
              <Button 
                onClick={() => onShowBulkFRDOExport?.(Array.from(selectedStudentIds))} 
                variant="outline" 
                className="rounded-xl gap-2 shrink-0 text-xs lg:text-sm"
              >
                <FileSpreadsheet className="w-4 h-4" />
                <span className="hidden sm:inline">ФРДО</span> ({selectedStudentIds.size})
              </Button>
              <Button 
                onClick={() => onShowBulkDeleteConfirm?.(getSelectedUserIds())} 
                variant="outline" 
                className="rounded-xl gap-2 text-destructive hover:text-destructive hover:bg-destructive/10 shrink-0 text-xs lg:text-sm"
              >
                <Trash2 className="w-4 h-4" />
                <span className="hidden sm:inline">Удалить</span> ({selectedStudentIds.size})
              </Button>
            </>
          )}
          <Button 
            variant="outline" 
            className="rounded-xl gap-2 shrink-0 text-xs lg:text-sm" 
            onClick={onBulkSendDocReminders}
            disabled={isSendingBulkDocReminders}
          >
            {isSendingBulkDocReminders ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
            <span className="hidden sm:inline">Напомнить</span>
          </Button>
          <Button 
            variant="outline" 
            className="rounded-xl gap-2 shrink-0 text-xs lg:text-sm" 
            onClick={handleExportStudents}
          >
            <FileSpreadsheet className="w-4 h-4" />
            <span className="hidden sm:inline">Экспорт</span>
          </Button>
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

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      ) : filteredStudents.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <Users className="w-12 h-12 mx-auto mb-4 opacity-50" />
          <p>Нет учеников</p>
        </div>
      ) : (
        <>
          {/* Mobile view - cards */}
          <div className="lg:hidden divide-y divide-border">
            {filteredStudents.map(student => {
              const uniqueId = student.enrollment_id || student.user_id;
              const isSelected = selectedStudentIds.has(uniqueId);
              const userDocs = studentDocsByUser.get(student.user_id) || [];
              const hasPassport = userDocs.some(t => t === "passport" || t === "birth_certificate");
              const hasSnils = userDocs.includes("snils");
              const hasEducation = userDocs.some(t => t === "education_document" || t === "diploma" || t === "attestat");
              
              return (
                <div 
                  key={uniqueId} 
                  className={`p-4 ${isSelected ? 'bg-primary/5' : ''}`}
                  onClick={() => onViewStudent(student)}
                >
                  <div className="flex items-start gap-3">
                    <div onClick={e => e.stopPropagation()}>
                      <input 
                        type="checkbox" 
                        checked={isSelected} 
                        onChange={() => toggleSelection(uniqueId)} 
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
                        <span className="truncate">{student.course || 'Не зачислен'}</span>
                        <span className="shrink-0">{student.progress}%</span>
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
                      checked={filteredStudents.length > 0 && filteredStudents.every(s => selectedStudentIds.has(s.enrollment_id || s.user_id))} 
                      onChange={() => toggleSelectAll(filteredStudents)} 
                      className="w-4 h-4 rounded border-border" 
                    />
                  </th>
                  <th className="text-left px-6 py-4 text-sm font-medium text-muted-foreground">Ученик</th>
                  <th className="text-left px-4 py-4 text-sm font-medium text-muted-foreground">Документы</th>
                  <th className="text-left px-3 py-4 text-sm font-medium text-muted-foreground">ФРДО</th>
                  <th className="text-left px-6 py-4 text-sm font-medium text-muted-foreground">Курс</th>
                  <th className="text-left px-6 py-4 text-sm font-medium text-muted-foreground">Прогресс</th>
                  <th className="text-left px-6 py-4 text-sm font-medium text-muted-foreground">Статус</th>
                  <th className="text-left px-6 py-4 text-sm font-medium text-muted-foreground">Действия</th>
                </tr>
              </thead>
              <tbody>
                {filteredStudents.map(student => {
                  const uniqueId = student.enrollment_id || student.user_id;
                  const isSelected = selectedStudentIds.has(uniqueId);
                  
                  return (
                    <tr 
                      key={uniqueId} 
                      className={`border-b border-border last:border-0 hover:bg-secondary/50 transition-colors cursor-pointer ${isSelected ? 'bg-primary/5' : ''}`} 
                      onClick={() => onViewStudent(student)}
                    >
                      <td className="px-4 py-4" onClick={e => e.stopPropagation()}>
                        <input 
                          type="checkbox" 
                          checked={isSelected} 
                          onChange={() => toggleSelection(uniqueId)} 
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
                      <td className="px-4 py-4">
                        {renderDocumentStatus(student)}
                      </td>
                      <td className="px-3 py-4">
                        {renderFRDOStatus(student)}
                      </td>
                      <td className="px-6 py-4 text-sm">
                        {student.course || <span className="text-muted-foreground italic">Не зачислен</span>}
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <Progress value={student.progress} className="w-20 h-2" />
                          <span className="text-sm font-medium">{student.progress}%</span>
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
                            onClick={() => handleDeleteOrUnenroll(student)} 
                            title={student.enrollment_id ? "Отчислить с курса" : "Удалить ученика"}
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
        </>
      )}
    </div>
  );
}