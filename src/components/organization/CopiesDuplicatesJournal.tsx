import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { ArrowLeft, Calendar as CalendarIcon, Search, FileSpreadsheet, Copy, FileText, Plus, Pencil, Trash2, Hash, User } from "lucide-react";
import { format, parseISO } from "date-fns";
import { ru } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { SigmaSpinner } from "@/components/ui/SigmaSpinner";
import { useCopiesDuplicatesJournal, DOCUMENT_TYPES, ISSUE_REASONS } from "@/hooks/useCopiesDuplicatesJournal";

interface CopiesDuplicatesJournalProps { organizationId: string; onClose: () => void; }

export function CopiesDuplicatesJournal({ organizationId, onClose }: CopiesDuplicatesJournalProps) {
  const h = useCopiesDuplicatesJournal(organizationId);

  if (h.loading) return <div className="flex items-center justify-center h-64"><SigmaSpinner size="lg" /></div>;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={onClose} className="rounded-xl"><ArrowLeft className="w-5 h-5" /></Button>
          <div><h2 className="text-xl font-semibold">Журнал учёта выдачи копий / дубликатов</h2><p className="text-sm text-muted-foreground">Учёт выдачи копий и дубликатов документов об образовании</p></div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={h.handleOpenAdd} className="rounded-xl"><Plus className="w-4 h-4 mr-2" />Добавить</Button>
          <Button onClick={h.exportToExcel} className="rounded-xl"><FileSpreadsheet className="w-4 h-4 mr-2" />Экспорт в Excel</Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { icon: FileText, color: "blue", label: "Всего записей", value: h.stats.total },
          { icon: Copy, color: "green", label: "Копий", value: h.stats.copies },
          { icon: FileText, color: "amber", label: "Дубликатов", value: h.stats.duplicates },
        ].map((s, i) => (
          <div key={i} className="bg-card rounded-xl border border-border p-4"><div className="flex items-center gap-3"><div className={`w-10 h-10 rounded-lg bg-${s.color}-500/10 flex items-center justify-center`}><s.icon className={`w-5 h-5 text-${s.color}-500`} /></div><div><p className="text-2xl font-bold">{s.value}</p><p className="text-xs text-muted-foreground">{s.label}</p></div></div></div>
        ))}
      </div>

      {/* Filters */}
      <div className="bg-card rounded-2xl border border-border p-4">
        <div className="flex flex-wrap items-center gap-4">
          <div className="relative flex-1 min-w-[200px]"><Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" /><Input placeholder="Поиск по ФИО, номеру..." value={h.searchQuery} onChange={(e) => h.setSearchQuery(e.target.value)} className="pl-10 rounded-xl" /></div>
          <Select value={h.selectedCopyType} onValueChange={h.setSelectedCopyType}><SelectTrigger className="w-[180px] rounded-xl"><SelectValue placeholder="Все типы" /></SelectTrigger><SelectContent><SelectItem value="all">Все типы</SelectItem><SelectItem value="copy">Копии</SelectItem><SelectItem value="duplicate">Дубликаты</SelectItem></SelectContent></Select>
          <Popover><PopoverTrigger asChild><Button variant="outline" className="rounded-xl"><CalendarIcon className="w-4 h-4 mr-2" />{format(h.dateRange.from, "dd.MM.yy")} - {format(h.dateRange.to, "dd.MM.yy")}</Button></PopoverTrigger><PopoverContent className="w-auto p-0" align="end"><Calendar mode="range" selected={{ from: h.dateRange.from, to: h.dateRange.to }} onSelect={(range) => { if (range?.from && range?.to) h.setDateRange({ from: range.from, to: range.to }); }} locale={ru} numberOfMonths={2} /></PopoverContent></Popover>
        </div>
      </div>

      {/* Table */}
      {h.filteredRecords.length > 0 ? (
        <div className="bg-card rounded-2xl border border-border overflow-hidden"><div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead className="w-12 text-center">№</TableHead><TableHead className="w-28">Рег. номер</TableHead><TableHead>Тип</TableHead><TableHead>Получатель</TableHead><TableHead>Оригинал документа</TableHead><TableHead className="text-center">Дата выдачи</TableHead><TableHead>Причина</TableHead><TableHead className="w-20"></TableHead></TableRow></TableHeader>
        <TableBody>{h.filteredRecords.map((r, i) => (
          <TableRow key={r.id}>
            <TableCell className="text-center text-muted-foreground">{i + 1}</TableCell>
            <TableCell><Badge variant="outline" className="rounded font-mono">{r.reg_number}</Badge></TableCell>
            <TableCell><Badge variant="outline" className={cn("rounded", r.copy_type === "copy" ? "border-green-500/50 text-green-600 bg-green-500/10" : "border-amber-500/50 text-amber-600 bg-amber-500/10")}>{r.copy_type === "copy" ? "Копия" : "Дубликат"}</Badge></TableCell>
            <TableCell><div className="flex items-center gap-2"><User className="w-4 h-4 text-muted-foreground" /><span className="font-medium">{r.recipient_name}</span></div></TableCell>
            <TableCell><div><p className="text-sm font-medium">{DOCUMENT_TYPES.find(t => t.value === r.original_document_type)?.label}</p><p className="text-xs text-muted-foreground">№ {r.original_document_number} от {format(parseISO(r.original_issue_date), "dd.MM.yyyy", { locale: ru })}</p></div></TableCell>
            <TableCell className="text-center">{format(parseISO(r.issue_date), "dd.MM.yyyy", { locale: ru })}</TableCell>
            <TableCell><span className="text-sm">{ISSUE_REASONS.find(x => x.value === r.issue_reason)?.label}</span></TableCell>
            <TableCell><div className="flex items-center gap-1"><Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => h.handleOpenEdit(r)}><Pencil className="w-4 h-4" /></Button><Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => h.setDeletingRecord(r)}><Trash2 className="w-4 h-4" /></Button></div></TableCell>
          </TableRow>
        ))}</TableBody></Table></div></div>
      ) : (
        <div className="bg-card rounded-2xl border border-border p-12 text-center"><Copy className="w-12 h-12 mx-auto text-muted-foreground mb-4" /><h3 className="font-semibold mb-2">Нет записей</h3><p className="text-muted-foreground mb-4">{h.records.length === 0 ? "Добавьте первую запись" : "Нет записей по фильтрам"}</p>{h.records.length === 0 && <Button onClick={h.handleOpenAdd} className="rounded-xl"><Plus className="w-4 h-4 mr-2" />Добавить запись</Button>}</div>
      )}

      {/* Add/Edit Dialog */}
      <Dialog open={h.showAddDialog || !!h.editingRecord} onOpenChange={(open) => { if (!open) { h.setShowAddDialog(false); h.setEditingRecord(null); h.resetForm(); } }}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto"><DialogHeader><DialogTitle>{h.editingRecord ? "Редактировать запись" : "Добавить запись"}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2"><Label>Тип выдачи *</Label><Select value={h.formData.copy_type} onValueChange={(v: "copy" | "duplicate") => h.setFormData(p => ({ ...p, copy_type: v }))}><SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="copy">Копия</SelectItem><SelectItem value="duplicate">Дубликат</SelectItem></SelectContent></Select></div>
            <div className="space-y-2"><Label>Регистрационный номер *</Label><div className="flex gap-2"><Input value={h.formData.reg_number} onChange={(e) => h.setFormData(p => ({ ...p, reg_number: e.target.value }))} placeholder="КОП-2025/001" className="flex-1 rounded-xl" /><Button type="button" variant="outline" onClick={h.generateRegNumber} className="shrink-0 rounded-xl"><Hash className="w-4 h-4 mr-1" />Авто</Button></div></div>
            <div className="space-y-2"><Label>ФИО получателя *</Label><Input value={h.formData.recipient_name} onChange={(e) => h.setFormData(p => ({ ...p, recipient_name: e.target.value }))} placeholder="Иванов Иван Иванович" className="rounded-xl" /></div>
            <div className="space-y-2"><Label>Тип оригинала документа</Label><Select value={h.formData.original_document_type} onValueChange={(v) => h.setFormData(p => ({ ...p, original_document_type: v }))}><SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger><SelectContent>{DOCUMENT_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent></Select></div>
            <div className="space-y-2"><Label>Номер оригинала *</Label><Input value={h.formData.original_document_number} onChange={(e) => h.setFormData(p => ({ ...p, original_document_number: e.target.value }))} placeholder="УД-2024/123" className="rounded-xl" /></div>
            <div className="space-y-2"><Label>Дата выдачи оригинала</Label><Popover><PopoverTrigger asChild><Button variant="outline" className="w-full justify-start rounded-xl"><CalendarIcon className="w-4 h-4 mr-2" />{format(h.formData.original_issue_date, "dd MMMM yyyy", { locale: ru })}</Button></PopoverTrigger><PopoverContent className="w-auto p-0" align="start"><Calendar mode="single" selected={h.formData.original_issue_date} onSelect={(d) => d && h.setFormData(p => ({ ...p, original_issue_date: d }))} locale={ru} initialFocus /></PopoverContent></Popover></div>
            <div className="space-y-2"><Label>Дата выдачи копии/дубликата</Label><Popover><PopoverTrigger asChild><Button variant="outline" className="w-full justify-start rounded-xl"><CalendarIcon className="w-4 h-4 mr-2" />{format(h.formData.issue_date, "dd MMMM yyyy", { locale: ru })}</Button></PopoverTrigger><PopoverContent className="w-auto p-0" align="start"><Calendar mode="single" selected={h.formData.issue_date} onSelect={(d) => d && h.setFormData(p => ({ ...p, issue_date: d }))} locale={ru} initialFocus /></PopoverContent></Popover></div>
            <div className="space-y-2"><Label>Причина выдачи</Label><Select value={h.formData.issue_reason} onValueChange={(v) => h.setFormData(p => ({ ...p, issue_reason: v }))}><SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger><SelectContent>{ISSUE_REASONS.map(r => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}</SelectContent></Select></div>
            <div className="space-y-2"><Label>Примечание</Label><Textarea value={h.formData.notes} onChange={(e) => h.setFormData(p => ({ ...p, notes: e.target.value }))} placeholder="Дополнительная информация" className="rounded-xl resize-none" rows={3} /></div>
          </div>
          <DialogFooter className="flex gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => { h.setShowAddDialog(false); h.setEditingRecord(null); h.resetForm(); }} disabled={h.saving}>Отмена</Button>
            <Button onClick={h.handleSave} disabled={h.saving}>{h.saving ? <><SigmaSpinner size="sm" className="mr-2" />Сохранение...</> : h.editingRecord ? "Сохранить" : <><Plus className="w-4 h-4 mr-2" />Добавить</>}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!h.deletingRecord} onOpenChange={() => h.setDeletingRecord(null)}>
        <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Удалить запись?</AlertDialogTitle><AlertDialogDescription>Удалить запись о выдаче {h.deletingRecord?.copy_type === "copy" ? "копии" : "дубликата"} для <strong>{h.deletingRecord?.recipient_name}</strong>?</AlertDialogDescription></AlertDialogHeader>
        <AlertDialogFooter><AlertDialogCancel>Отмена</AlertDialogCancel><AlertDialogAction onClick={h.handleDelete} className="bg-destructive hover:bg-destructive/90">Удалить</AlertDialogAction></AlertDialogFooter></AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
