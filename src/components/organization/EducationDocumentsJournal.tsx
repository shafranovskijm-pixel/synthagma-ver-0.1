import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import {
  ArrowLeft, Calendar as CalendarIcon, Search, FileSpreadsheet, FileText,
  Plus, Pencil, Trash2, User, GraduationCap, Award, Users, CheckCircle2, Sparkles, Printer } from "lucide-react";
import { format, parseISO } from "date-fns";
import { ru } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import {
  useEducationDocumentsJournal,
  DOCUMENT_TYPES } from "@/hooks/useEducationDocumentsJournal";
import { generateEducationDocumentHtml } from "@/utils/generateEducationDocument";
import { printHtmlContent } from "@/utils/printHtmlToPdf";
import { SigmaSpinner } from "@/components/ui/SigmaSpinner";
import { DocumentFormDialog } from "./education-documents/DocumentFormDialog";
import { SelectStudentsDialog } from "./education-documents/SelectStudentsDialog";
import { FrdoReadinessBanner } from "./FrdoReadinessBanner";

interface EducationDocumentsJournalProps {
  organizationId: string;
  onClose: () => void;
  documentTypeFilter?: "certificate" | "diploma" | "qualification";
  onOpenFrdoTab?: () => void;
}

export function EducationDocumentsJournal({
  organizationId,
  onClose,
  documentTypeFilter,
  onOpenFrdoTab }: EducationDocumentsJournalProps) {
  const {
    loading, saving, searchQuery, setSearchQuery,
    selectedDocType, setSelectedDocType, selectedStatus, setSelectedStatus,
    dateRange, setDateRange, orgData,
    showAddDialog, setShowAddDialog, showSelectStudentsDialog, setShowSelectStudentsDialog,
    editingRecord, setEditingRecord, deletingRecord, setDeletingRecord,
    loadingStudents, selectedStudents,
    studentSearchQuery, setStudentSearchQuery,
    formData, setFormData,
    filteredRecords, stats, filteredStudents, newGraduatesCount,
    journalTitle, journalSubtitle,
    resetForm, generateRegNumber, handleOpenAdd, handleOpenEdit,
    handleOpenSelectStudents, handleAutoAddAllGraduates, handleCreateFromStudents,
    toggleStudentSelection, selectAllStudents,
    handleSave, handleDelete, exportToExcel } = useEducationDocumentsJournal({ organizationId, documentTypeFilter });

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <SigmaSpinner size="lg" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          {!documentTypeFilter && (
            <Button variant="ghost" size="icon" onClick={onClose} className="rounded-xl">
              <ArrowLeft className="w-5 h-5" />
            </Button>
          )}
          <div>
            <h2 className="text-xl font-semibold">{journalTitle}</h2>
            <p className="text-sm text-muted-foreground">{journalSubtitle}</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="default" onClick={handleOpenSelectStudents} className="rounded-xl bg-gradient-to-r from-primary to-primary/80">
            <Sparkles className="w-4 h-4 mr-2" />Из выпускников
          </Button>
          <Button variant="outline" onClick={handleOpenAdd} className="rounded-xl">
            <Plus className="w-4 h-4 mr-2" />Добавить вручную
          </Button>
          <Button variant="outline" onClick={exportToExcel} className="rounded-xl">
            <FileSpreadsheet className="w-4 h-4 mr-2" />Excel
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-card rounded-xl border border-border p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center">
              <FileText className="w-5 h-5 text-blue-500" />
            </div>
            <div><p className="text-2xl font-bold">{stats.total}</p><p className="text-xs text-muted-foreground">Всего записей</p></div>
          </div>
        </div>
        <div className="bg-card rounded-xl border border-border p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-green-500/10 flex items-center justify-center">
              <Award className="w-5 h-5 text-green-500" />
            </div>
            <div><p className="text-2xl font-bold">{stats.certificates}</p><p className="text-xs text-muted-foreground">Удостоверений</p></div>
          </div>
        </div>
        <div className="bg-card rounded-xl border border-border p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-purple-500/10 flex items-center justify-center">
              <GraduationCap className="w-5 h-5 text-purple-500" />
            </div>
            <div><p className="text-2xl font-bold">{stats.diplomas}</p><p className="text-xs text-muted-foreground">Дипломов</p></div>
          </div>
        </div>
        <div className="bg-card rounded-xl border border-border p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-amber-500/10 flex items-center justify-center">
              <CheckCircle2 className="w-5 h-5 text-amber-500" />
            </div>
            <div><p className="text-2xl font-bold">{stats.originals}/{stats.duplicates}</p><p className="text-xs text-muted-foreground">Ориг./Дубл.</p></div>
      </div>

      {/* FRDO export readiness */}
      <FrdoReadinessBanner organizationId={organizationId} onOpenFrdo={onOpenFrdoTab} />
        </div>
      </div>

      {/* Auto-add banner */}
      {newGraduatesCount > 0 && (
        <div className="bg-gradient-to-r from-primary/10 to-primary/5 border border-primary/20 rounded-2xl p-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center">
                <Sparkles className="w-5 h-5 text-primary" />
              </div>
              <div>
                <p className="font-medium">Новые выпускники: {newGraduatesCount}</p>
                <p className="text-sm text-muted-foreground">Студенты, завершившие курсы, но ещё не добавленные в журнал</p>
              </div>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={handleOpenSelectStudents} className="rounded-xl">
                <Users className="w-4 h-4 mr-2" />Выбрать
              </Button>
              <Button onClick={handleAutoAddAllGraduates} disabled={saving} className="rounded-xl">
                {saving ? <SigmaSpinner size="sm" className="mr-2" /> : <Plus className="w-4 h-4 mr-1" />}
                Добавить всех
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="bg-card rounded-2xl border border-border p-4">
        <div className="flex flex-wrap items-center gap-4">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input placeholder="Поиск по ФИО, номеру документа..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-10 rounded-xl" />
          </div>
          <Select value={selectedDocType} onValueChange={setSelectedDocType}>
            <SelectTrigger className="w-[200px] rounded-xl"><SelectValue placeholder="Тип документа" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Все типы</SelectItem>
              {DOCUMENT_TYPES.map((type) => (<SelectItem key={type.value} value={type.value}>{type.label}</SelectItem>))}
            </SelectContent>
          </Select>
          <Select value={selectedStatus} onValueChange={setSelectedStatus}>
            <SelectTrigger className="w-[160px] rounded-xl"><SelectValue placeholder="Статус" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Все статусы</SelectItem>
              <SelectItem value="original">Оригиналы</SelectItem>
              <SelectItem value="duplicate">Дубликаты</SelectItem>
            </SelectContent>
          </Select>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className="rounded-xl">
                <CalendarIcon className="w-4 h-4 mr-2" />
                {format(dateRange.from, "dd.MM.yy")} - {format(dateRange.to, "dd.MM.yy")}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="end">
              <Calendar mode="range" selected={{ from: dateRange.from, to: dateRange.to }} onSelect={(range) => { if (range?.from && range?.to) setDateRange({ from: range.from, to: range.to }); }} locale={ru} numberOfMonths={2} />
            </PopoverContent>
          </Popover>
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
                  <TableHead className="w-32">Рег. номер</TableHead>
                  <TableHead>ФИО выпускника</TableHead>
                  <TableHead>Документ</TableHead>
                  <TableHead>Специальность</TableHead>
                  <TableHead className="text-center">Дата выдачи</TableHead>
                  <TableHead>Статус</TableHead>
                  <TableHead className="w-20"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredRecords.map((record, index) => (
                  <TableRow key={record.id}>
                    <TableCell className="text-center text-muted-foreground">{index + 1}</TableCell>
                    <TableCell><Badge variant="outline" className="rounded font-mono">{record.reg_number}</Badge></TableCell>
                    <TableCell>
                      <div>
                        <div className="font-medium">{record.full_name}</div>
                        {record.birth_date && <div className="text-xs text-muted-foreground">Дата рождения: {format(parseISO(record.birth_date), "dd.MM.yyyy")}</div>}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div>
                        <Badge variant="secondary" className="rounded mb-1">{DOCUMENT_TYPES.find((t) => t.value === record.document_type)?.label}</Badge>
                        <div className="text-xs text-muted-foreground">{record.document_series && `Серия: ${record.document_series}, `}№ {record.document_number}</div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="max-w-[200px]">
                        <div className="text-sm truncate">{record.specialty_name}</div>
                        {record.qualification_name && <div className="text-xs text-muted-foreground truncate">{record.qualification_name}</div>}
                      </div>
                    </TableCell>
                    <TableCell className="text-center">{format(parseISO(record.issue_date), "dd.MM.yyyy")}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={cn("rounded", record.document_status === "original" ? "bg-green-500/10 text-green-600 border-green-500/30" : "bg-amber-500/10 text-amber-600 border-amber-500/30")}>
                        {record.document_status === "original" ? "Оригинал" : "Дубликат"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Button variant="ghost" size="icon" className="rounded-lg h-8 w-8" title="Печать документа" onClick={() => { const html = generateEducationDocumentHtml(record, orgData); printHtmlContent(html, `${record.document_type === "certificate" ? "Удостоверение" : record.document_type === "diploma" ? "Диплом" : "Свидетельство"} ${record.document_number}`); }}><Printer className="w-4 h-4" /></Button>
                        <Button variant="ghost" size="icon" className="rounded-lg h-8 w-8" onClick={() => handleOpenEdit(record)}><Pencil className="w-4 h-4" /></Button>
                        <Button variant="ghost" size="icon" className="rounded-lg h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10" onClick={() => setDeletingRecord(record)}><Trash2 className="w-4 h-4" /></Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      ) : (
        <div className="bg-card rounded-2xl border border-border p-12">
          <div className="text-center">
            <div className="w-16 h-16 rounded-full bg-muted/50 flex items-center justify-center mx-auto mb-4"><GraduationCap className="w-8 h-8 text-muted-foreground" /></div>
            <h3 className="text-lg font-medium mb-2">Записей не найдено</h3>
            <p className="text-sm text-muted-foreground mb-4">{searchQuery || selectedDocType !== "all" || selectedStatus !== "all" ? "Попробуйте изменить параметры поиска" : "Добавьте первую запись в журнал"}</p>
            {!searchQuery && selectedDocType === "all" && selectedStatus === "all" && (
              <Button onClick={handleOpenAdd} className="rounded-xl"><Plus className="w-4 h-4 mr-2" />Добавить запись</Button>
            )}
          </div>
        </div>
      )}

      {/* Extracted Dialogs */}
      <DocumentFormDialog
        open={showAddDialog || !!editingRecord}
        onClose={() => { setShowAddDialog(false); setEditingRecord(null); resetForm(); }}
        isEditing={!!editingRecord}
        formData={formData}
        setFormData={setFormData}
        saving={saving}
        onSave={handleSave}
        onGenerateRegNumber={generateRegNumber}
      />

      <SelectStudentsDialog
        open={showSelectStudentsDialog}
        onOpenChange={setShowSelectStudentsDialog}
        studentSearchQuery={studentSearchQuery}
        setStudentSearchQuery={setStudentSearchQuery}
        loadingStudents={loadingStudents}
        filteredStudents={filteredStudents}
        selectedStudents={selectedStudents}
        toggleStudentSelection={toggleStudentSelection}
        selectAllStudents={selectAllStudents}
        saving={saving}
        onSubmit={handleCreateFromStudents}
      />

      {/* Delete Confirm */}
      <AlertDialog open={!!deletingRecord} onOpenChange={() => setDeletingRecord(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Удалить запись?</AlertDialogTitle>
            <AlertDialogDescription>Запись "{deletingRecord?.full_name}" будет удалена из журнала. Это действие нельзя отменить.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Отмена</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Удалить</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
