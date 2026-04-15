import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import {
  ArrowLeft, Calendar as CalendarIcon, Search, FileSpreadsheet, FileText,
  Plus, Pencil, Trash2, Hash, User, GraduationCap, Award, Mail, Users, CheckCircle2, Sparkles, Printer } from "lucide-react";
import { format, parseISO } from "date-fns";
import { ru } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  useEducationDocumentsJournal,
  DOCUMENT_TYPES,
  DELIVERY_METHODS } from "@/hooks/useEducationDocumentsJournal";
import { generateEducationDocumentHtml } from "@/utils/generateEducationDocument";
import { printHtmlContent } from "@/utils/printHtmlToPdf";
import { SigmaSpinner } from "@/components/ui/SigmaSpinner";

interface EducationDocumentsJournalProps {
  organizationId: string;
  onClose: () => void;
  documentTypeFilter?: "certificate" | "diploma" | "qualification";
}

export function EducationDocumentsJournal({
  organizationId,
  onClose,
  documentTypeFilter }: EducationDocumentsJournalProps) {
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
    getJournalTitle, getJournalSubtitle,
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
            <h2 className="text-xl font-semibold">{getJournalTitle()}</h2>
            <p className="text-sm text-muted-foreground">{getJournalSubtitle()}</p>
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

      {/* Add/Edit Dialog */}
      <Dialog open={showAddDialog || !!editingRecord} onOpenChange={() => { setShowAddDialog(false); setEditingRecord(null); resetForm(); }}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingRecord ? "Редактирование записи" : "Добавление записи в журнал"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-6 py-4">
            {/* Registration Number */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Регистрационный номер *</Label>
                <div className="flex gap-2">
                  <Input value={formData.reg_number} onChange={(e) => setFormData((prev) => ({ ...prev, reg_number: e.target.value }))} placeholder="ДОК-2025/0001" className="rounded-xl" />
                  <Button type="button" variant="outline" onClick={generateRegNumber} className="rounded-xl shrink-0"><Hash className="w-4 h-4 mr-1" />Генерировать</Button>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Дата выдачи документа *</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className={cn("w-full justify-start text-left font-normal rounded-xl", !formData.issue_date && "text-muted-foreground")}>
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {formData.issue_date ? format(formData.issue_date, "dd MMMM yyyy", { locale: ru }) : "Выберите дату"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar mode="single" selected={formData.issue_date} onSelect={(date) => setFormData((prev) => ({ ...prev, issue_date: date || new Date() }))} locale={ru} initialFocus />
                  </PopoverContent>
                </Popover>
              </div>
            </div>

            {/* Graduate Info */}
            <div className="space-y-4">
              <h4 className="font-medium flex items-center gap-2"><User className="w-4 h-4" />Данные выпускника</h4>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>ФИО выпускника (как в паспорте) *</Label>
                  <Input value={formData.full_name} onChange={(e) => setFormData((prev) => ({ ...prev, full_name: e.target.value }))} placeholder="Иванов Иван Иванович" className="rounded-xl" />
                </div>
                <div className="space-y-2">
                  <Label>Дата рождения</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className={cn("w-full justify-start text-left font-normal rounded-xl", !formData.birth_date && "text-muted-foreground")}>
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {formData.birth_date ? format(formData.birth_date, "dd MMMM yyyy", { locale: ru }) : "Выберите дату"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar mode="single" selected={formData.birth_date || undefined} onSelect={(date) => setFormData((prev) => ({ ...prev, birth_date: date || null }))} locale={ru} captionLayout="dropdown-buttons" fromYear={1940} toYear={new Date().getFullYear()} initialFocus />
                    </PopoverContent>
                  </Popover>
                </div>
              </div>
            </div>

            {/* Document Info */}
            <div className="space-y-4">
              <h4 className="font-medium flex items-center gap-2"><Award className="w-4 h-4" />Данные документа</h4>
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>Тип документа *</Label>
                  <Select value={formData.document_type} onValueChange={(value) => setFormData((prev) => ({ ...prev, document_type: value as any }))}>
                    <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
                    <SelectContent>{DOCUMENT_TYPES.map((type) => (<SelectItem key={type.value} value={type.value}>{type.label}</SelectItem>))}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Серия документа</Label>
                  <Input value={formData.document_series} onChange={(e) => setFormData((prev) => ({ ...prev, document_series: e.target.value }))} placeholder="ПП" className="rounded-xl" />
                </div>
                <div className="space-y-2">
                  <Label>Номер документа *</Label>
                  <Input value={formData.document_number} onChange={(e) => setFormData((prev) => ({ ...prev, document_number: e.target.value }))} placeholder="0000001" className="rounded-xl" />
                </div>
              </div>
            </div>

            {/* Education Info */}
            <div className="space-y-4">
              <h4 className="font-medium flex items-center gap-2"><GraduationCap className="w-4 h-4" />Сведения об образовании</h4>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Наименование специальности / направления подготовки / профессии *</Label>
                  <Textarea value={formData.specialty_name} onChange={(e) => setFormData((prev) => ({ ...prev, specialty_name: e.target.value }))} placeholder="Охрана труда" className="rounded-xl min-h-[80px]" />
                </div>
                <div className="space-y-2">
                  <Label>Присвоенная квалификация</Label>
                  <Textarea value={formData.qualification_name} onChange={(e) => setFormData((prev) => ({ ...prev, qualification_name: e.target.value }))} placeholder="Специалист по охране труда" className="rounded-xl min-h-[80px]" />
                </div>
              </div>
            </div>

            {/* Protocol & Order */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Номер протокола ГЭК</Label>
                <Input value={formData.protocol_number} onChange={(e) => setFormData((prev) => ({ ...prev, protocol_number: e.target.value }))} placeholder="№ 1" className="rounded-xl" />
              </div>
              <div className="space-y-2">
                <Label>Дата протокола</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className={cn("w-full justify-start text-left font-normal rounded-xl", !formData.protocol_date && "text-muted-foreground")}>
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {formData.protocol_date ? format(formData.protocol_date, "dd MMMM yyyy", { locale: ru }) : "Выберите дату"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar mode="single" selected={formData.protocol_date || undefined} onSelect={(date) => setFormData((prev) => ({ ...prev, protocol_date: date || null }))} locale={ru} initialFocus />
                  </PopoverContent>
                </Popover>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Номер приказа об отчислении</Label>
                <Input value={formData.order_number} onChange={(e) => setFormData((prev) => ({ ...prev, order_number: e.target.value }))} placeholder="ПР-001" className="rounded-xl" />
              </div>
              <div className="space-y-2">
                <Label>Дата приказа</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className={cn("w-full justify-start text-left font-normal rounded-xl", !formData.order_date && "text-muted-foreground")}>
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {formData.order_date ? format(formData.order_date, "dd MMMM yyyy", { locale: ru }) : "Выберите дату"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar mode="single" selected={formData.order_date || undefined} onSelect={(date) => setFormData((prev) => ({ ...prev, order_date: date || null }))} locale={ru} initialFocus />
                  </PopoverContent>
                </Popover>
              </div>
            </div>

            {/* Document Status */}
            <div className="space-y-3">
              <Label>Статус документа</Label>
              <RadioGroup value={formData.document_status} onValueChange={(value) => setFormData((prev) => ({ ...prev, document_status: value as "original" | "duplicate" }))} className="flex gap-4">
                <div className="flex items-center space-x-2"><RadioGroupItem value="original" id="original" /><Label htmlFor="original">Оригинал</Label></div>
                <div className="flex items-center space-x-2"><RadioGroupItem value="duplicate" id="duplicate" /><Label htmlFor="duplicate">Дубликат</Label></div>
              </RadioGroup>
              {formData.document_status === "duplicate" && (
                <div className="space-y-2">
                  <Label>Данные оригинала документа</Label>
                  <Textarea value={formData.original_document_data} onChange={(e) => setFormData((prev) => ({ ...prev, original_document_data: e.target.value }))} placeholder="Серия, номер и дата выдачи оригинала" className="rounded-xl" />
                </div>
              )}
            </div>

            {/* Delivery */}
            <div className="space-y-3">
              <Label>Способ получения документа</Label>
              <Select value={formData.delivery_method} onValueChange={(value) => setFormData((prev) => ({ ...prev, delivery_method: value as any }))}>
                <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
                <SelectContent>{DELIVERY_METHODS.map((m) => (<SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>))}</SelectContent>
              </Select>
              {formData.delivery_method !== "personal" && (
                <div className="space-y-2">
                  <Label>{formData.delivery_method === "representative" ? "Данные представителя (ФИО, доверенность)" : "Почтовый адрес и номер отправления"}</Label>
                  <Textarea value={formData.delivery_details} onChange={(e) => setFormData((prev) => ({ ...prev, delivery_details: e.target.value }))} className="rounded-xl" />
                </div>
              )}
            </div>

            {/* Notes */}
            <div className="space-y-2">
              <Label>Примечания</Label>
              <Textarea value={formData.notes} onChange={(e) => setFormData((prev) => ({ ...prev, notes: e.target.value }))} placeholder="Дополнительные сведения..." className="rounded-xl" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowAddDialog(false); setEditingRecord(null); resetForm(); }} className="rounded-xl">Отмена</Button>
            <Button onClick={handleSave} disabled={saving} className="rounded-xl">
              {saving && <SigmaSpinner size="sm" className="mr-2" />}
              {editingRecord ? "Сохранить" : "Добавить"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Select Students Dialog */}
      <Dialog open={showSelectStudentsDialog} onOpenChange={setShowSelectStudentsDialog}>
        <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col overflow-hidden">
          <DialogHeader className="shrink-0">
            <DialogTitle>Выбор выпускников для добавления</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 flex-1 min-h-0 overflow-y-auto">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input placeholder="Поиск по ФИО или курсу..." value={studentSearchQuery} onChange={(e) => setStudentSearchQuery(e.target.value)} className="pl-10 rounded-xl" />
            </div>
            {loadingStudents ? (
              <div className="flex justify-center py-8"><SigmaSpinner /></div>
            ) : filteredStudents.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">Нет завершивших студентов для добавления</div>
            ) : (
              <>
                <div className="flex items-center justify-between">
                  <Button variant="ghost" size="sm" onClick={selectAllStudents} className="rounded-lg">
                    {selectedStudents.size === filteredStudents.filter((s) => !s.already_added).length ? "Снять всё" : "Выбрать всё"}
                  </Button>
                  <span className="text-sm text-muted-foreground">Выбрано: {selectedStudents.size}</span>
                </div>
                <ScrollArea className="h-[400px] pr-4">
                  <div className="space-y-2">
                    {filteredStudents.map((student) => (
                      <div key={student.enrollment_id} className={cn("flex items-center gap-3 p-3 rounded-xl border transition-colors overflow-hidden", student.already_added ? "opacity-50 bg-muted/30" : "hover:bg-secondary/30 cursor-pointer", selectedStudents.has(student.enrollment_id) && "border-primary/50 bg-primary/5")} onClick={() => !student.already_added && toggleStudentSelection(student.enrollment_id)}>
                        <Checkbox checked={student.already_added || selectedStudents.has(student.enrollment_id)} disabled={student.already_added} className="shrink-0" />
                        <div className="flex-1 min-w-0 overflow-hidden">
                          <div className="font-medium text-sm truncate">{student.full_name}</div>
                          <div className="text-xs text-muted-foreground truncate">{student.course_title}</div>
                        </div>
                        {student.already_added ? (
                          <Badge variant="secondary" className="text-xs">Добавлен</Badge>
                        ) : (
                          <span className="text-xs text-muted-foreground">{format(parseISO(student.completed_at), "dd.MM.yyyy")}</span>
                        )}
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </>
            )}
          </div>
          <DialogFooter className="shrink-0">
            <Button variant="outline" onClick={() => setShowSelectStudentsDialog(false)} className="rounded-xl">Отмена</Button>
            <Button onClick={handleCreateFromStudents} disabled={saving || selectedStudents.size === 0} className="rounded-xl">
              {saving && <SigmaSpinner size="sm" className="mr-2" />}
              Добавить ({selectedStudents.size})
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
