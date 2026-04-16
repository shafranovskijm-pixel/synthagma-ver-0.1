import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, Calendar as CalendarIcon, Search, FileSpreadsheet, FileText, FileCheck, ArrowDownLeft, ArrowUpRight, Building2, User, Hash, Pencil, Plus, Eye, Download } from "lucide-react";
import { format, parseISO, startOfYear, endOfYear } from "date-fns";
import { ru } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { SigmaSpinner } from "@/components/ui/SigmaSpinner";
import { useDocumentRegistrationJournal, DOCUMENT_TYPE_LABELS } from "@/hooks/useDocumentRegistrationJournal";

interface AutoDocumentRegistrationJournalProps {
  organizationId: string;
  onClose: () => void;
}

export function AutoDocumentRegistrationJournal({ organizationId, onClose }: AutoDocumentRegistrationJournalProps) {
  const h = useDocumentRegistrationJournal(organizationId);

  if (h.loading) return <div className="flex items-center justify-center h-64"><SigmaSpinner size="lg" /></div>;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={onClose} className="rounded-xl"><ArrowLeft className="w-5 h-5" /></Button>
          <div><h2 className="text-xl font-semibold">Журнал регистрации документов</h2><p className="text-sm text-muted-foreground">Входящие и исходящие документы: договоры, приказы, счета</p></div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => h.setShowAddDialog(true)} className="rounded-xl"><Plus className="w-4 h-4 mr-2" />Добавить</Button>
          <Button onClick={h.exportToExcel} className="rounded-xl"><FileSpreadsheet className="w-4 h-4 mr-2" />Экспорт в Excel</Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {[
          { value: h.stats.total, label: "Всего", icon: FileText, color: "blue" },
          { value: h.stats.incoming, label: "Входящих", icon: ArrowDownLeft, color: "green" },
          { value: h.stats.outgoing, label: "Исходящих", icon: ArrowUpRight, color: "amber" },
          { value: h.stats.contracts, label: "Договоров", icon: FileCheck, color: "purple" },
          { value: h.stats.orders, label: "Приказов", icon: Hash, color: "indigo" },
        ].map(s => (
          <div key={s.label} className="bg-card rounded-xl border border-border p-4">
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-lg bg-${s.color}-500/10 flex items-center justify-center`}><s.icon className={`w-5 h-5 text-${s.color}-500`} /></div>
              <div><p className="text-2xl font-bold">{s.value}</p><p className="text-xs text-muted-foreground">{s.label}</p></div>
            </div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="bg-card rounded-2xl border border-border p-4">
        <div className="flex flex-wrap items-center gap-4">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input placeholder="Поиск по названию, номеру, контрагенту..." value={h.searchQuery} onChange={e => h.setSearchQuery(e.target.value)} className="pl-10 rounded-xl" />
          </div>
          <Select value={h.selectedType} onValueChange={h.setSelectedType}>
            <SelectTrigger className="w-[200px] rounded-xl"><SelectValue placeholder="Все типы" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Все типы</SelectItem>
              <SelectItem value="contract">Договоры</SelectItem>
              <SelectItem value="enrollment_order">Приказы о зачислении</SelectItem>
              <SelectItem value="expulsion_order">Приказы об отчислении</SelectItem>
              <SelectItem value="certificate">Удостоверения</SelectItem>
              <SelectItem value="diploma">Дипломы</SelectItem>
              <SelectItem value="invoice">Счета</SelectItem>
              <SelectItem value="act">Акты</SelectItem>
            </SelectContent>
          </Select>
          <Select value={h.selectedDirection} onValueChange={h.setSelectedDirection}>
            <SelectTrigger className="w-[160px] rounded-xl"><SelectValue placeholder="Все" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Все направления</SelectItem>
              <SelectItem value="incoming">Входящие</SelectItem>
              <SelectItem value="outgoing">Исходящие</SelectItem>
            </SelectContent>
          </Select>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className="rounded-xl gap-2"><CalendarIcon className="w-4 h-4" />{format(h.dateRange.from, "d MMM", { locale: ru })} — {format(h.dateRange.to, "d MMM yyyy", { locale: ru })}</Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="end">
              <Calendar mode="range" selected={{ from: h.dateRange.from, to: h.dateRange.to }} onSelect={range => { if (range?.from && range?.to) h.setDateRange({ from: range.from, to: range.to }); else if (range?.from) h.setDateRange({ from: range.from, to: range.from }); }} locale={ru} numberOfMonths={2} />
            </PopoverContent>
          </Popover>
          <Button variant="outline" size="sm" className="rounded-lg" onClick={() => { const now = new Date(); h.setDateRange({ from: startOfYear(now), to: endOfYear(now) }); }}>{new Date().getFullYear()} год</Button>
        </div>
      </div>

      {/* Table */}
      {h.filteredRecords.length > 0 ? (
        <div className="bg-card rounded-2xl border border-border overflow-hidden">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12 text-center">№</TableHead>
                  <TableHead className="w-28">Рег. номер</TableHead>
                  <TableHead>Документ</TableHead>
                  <TableHead className="text-center">Направление</TableHead>
                  <TableHead>Контрагент / Лицо</TableHead>
                  <TableHead className="text-center">Дата</TableHead>
                  <TableHead className="text-center w-24">Действия</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {h.filteredRecords.slice(0, 100).map((record, index) => {
                  const typeConfig = DOCUMENT_TYPE_LABELS[record.document_type] || DOCUMENT_TYPE_LABELS.other;
                  return (
                    <TableRow key={record.id}>
                      <TableCell className="text-center text-muted-foreground">{index + 1}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          {record.reg_number ? <Badge variant="outline" className="rounded font-mono">{record.reg_number}</Badge> : <span className="text-muted-foreground">—</span>}
                          {record.is_editable && <Button variant="ghost" size="icon" className="h-6 w-6 opacity-50 hover:opacity-100" onClick={() => h.handleEditClick(record)}><Pencil className="w-3 h-3" /></Button>}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-start gap-2">
                          <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0", record.document_type === "contract" && "bg-purple-500/10", record.document_type === "enrollment_order" && "bg-green-500/10", record.document_type === "expulsion_order" && "bg-red-500/10", record.document_type === "certificate" && "bg-blue-500/10", record.document_type === "diploma" && "bg-amber-500/10", !["contract", "enrollment_order", "expulsion_order", "certificate", "diploma"].includes(record.document_type) && "bg-secondary")}>
                            <FileText className={cn("w-4 h-4", record.document_type === "contract" && "text-purple-500", record.document_type === "enrollment_order" && "text-green-500", record.document_type === "expulsion_order" && "text-red-500", record.document_type === "certificate" && "text-blue-500", record.document_type === "diploma" && "text-amber-500", !["contract", "enrollment_order", "expulsion_order", "certificate", "diploma"].includes(record.document_type) && "text-muted-foreground")} />
                          </div>
                          <div><p className="font-medium text-sm">{record.document_name}</p><p className="text-xs text-muted-foreground">{typeConfig.label}</p>{record.notes && <p className="text-xs text-muted-foreground mt-0.5">{record.notes}</p>}</div>
                        </div>
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge variant="outline" className={cn("rounded", record.direction === "incoming" ? "border-green-500/50 text-green-600 bg-green-500/10" : "border-amber-500/50 text-amber-600 bg-amber-500/10")}>
                          {record.direction === "incoming" ? <><ArrowDownLeft className="w-3 h-3 mr-1" />Вх.</> : <><ArrowUpRight className="w-3 h-3 mr-1" />Исх.</>}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {record.related_entity ? <div className="flex items-center gap-2">{record.related_entity_type === "company" ? <Building2 className="w-4 h-4 text-muted-foreground" /> : <User className="w-4 h-4 text-muted-foreground" />}<span className="text-sm">{record.related_entity}</span></div> : <span className="text-muted-foreground">—</span>}
                      </TableCell>
                      <TableCell className="text-center"><span className="text-sm">{format(parseISO(record.date), "dd.MM.yyyy", { locale: ru })}</span></TableCell>
                      <TableCell className="text-center">
                        {record.file_url ? (
                          <div className="flex items-center justify-center gap-1">
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => h.handleViewDocument(record)} title="Просмотр"><Eye className="w-4 h-4" /></Button>
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => h.handleDownloadDocument(record)} title="Скачать PDF"><Download className="w-4 h-4" /></Button>
                          </div>
                        ) : <span className="text-muted-foreground">—</span>}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
          {h.filteredRecords.length > 100 && <div className="p-4 text-center text-sm text-muted-foreground border-t border-border">Показано 100 из {h.filteredRecords.length} записей.</div>}
        </div>
      ) : (
        <div className="bg-card rounded-2xl border border-border p-8 text-center">
          <FileText className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
          <h3 className="font-semibold mb-2">Нет документов</h3>
          <p className="text-muted-foreground">{h.records.length === 0 ? "Документы ещё не зарегистрированы" : "Нет документов, соответствующих фильтрам"}</p>
        </div>
      )}

      {/* Edit Dialog */}
      <Dialog open={!!h.editingRecord} onOpenChange={open => !open && h.setEditingRecord(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Редактирование рег. номера</DialogTitle></DialogHeader>
          {h.editingRecord && (
            <div className="space-y-4">
              <div className="bg-muted/50 rounded-lg p-3">
                <p className="text-sm font-medium">{h.editingRecord.document_name}</p>
                <p className="text-xs text-muted-foreground mt-1">{DOCUMENT_TYPE_LABELS[h.editingRecord.document_type]?.label || "Документ"} • {format(parseISO(h.editingRecord.date), "dd.MM.yyyy", { locale: ru })}</p>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Регистрационный номер</label>
                <div className="flex gap-2">
                  <Input value={h.editRegNumber} onChange={e => h.setEditRegNumber(e.target.value)} placeholder="Например: ДОГ-2025/001" className="flex-1" />
                  <Button type="button" variant="outline" onClick={h.generateSuggestedNumber} className="shrink-0"><Hash className="w-4 h-4 mr-1" />Авто</Button>
                </div>
              </div>
            </div>
          )}
          <DialogFooter className="flex gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => h.setEditingRecord(null)} disabled={h.saving}>Отмена</Button>
            <Button onClick={h.handleSaveRegNumber} disabled={h.saving}>{h.saving ? <><SigmaSpinner size="sm" className="mr-2" />Сохранение...</> : "Сохранить"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Dialog */}
      <Dialog open={h.showAddDialog} onOpenChange={h.setShowAddDialog}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Добавить документ</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2"><Label>Тип документа *</Label><Select value={h.newDocument.document_type} onValueChange={v => h.setNewDocument(p => ({ ...p, document_type: v }))}><SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger><SelectContent>{Object.entries(DOCUMENT_TYPE_LABELS).map(([key, { label }]) => <SelectItem key={key} value={key}>{label}</SelectItem>)}</SelectContent></Select></div>
            <div className="space-y-2"><Label>Наименование документа *</Label><Input value={h.newDocument.document_name} onChange={e => h.setNewDocument(p => ({ ...p, document_name: e.target.value }))} placeholder="Например: Договор №123" className="rounded-xl" /></div>
            <div className="space-y-2"><Label>Направление</Label><Select value={h.newDocument.direction} onValueChange={(v: "incoming" | "outgoing") => h.setNewDocument(p => ({ ...p, direction: v }))}><SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="incoming"><div className="flex items-center gap-2"><ArrowDownLeft className="w-4 h-4 text-green-500" />Входящий</div></SelectItem><SelectItem value="outgoing"><div className="flex items-center gap-2"><ArrowUpRight className="w-4 h-4 text-amber-500" />Исходящий</div></SelectItem></SelectContent></Select></div>
            <div className="space-y-2"><Label>Дата документа</Label><Popover><PopoverTrigger asChild><Button variant="outline" className="w-full justify-start rounded-xl"><CalendarIcon className="w-4 h-4 mr-2" />{format(h.newDocument.date, "dd MMMM yyyy", { locale: ru })}</Button></PopoverTrigger><PopoverContent className="w-auto p-0" align="start"><Calendar mode="single" selected={h.newDocument.date} onSelect={date => date && h.setNewDocument(p => ({ ...p, date }))} locale={ru} /></PopoverContent></Popover></div>
            <div className="space-y-2"><Label>Контрагент / Лицо</Label><Input value={h.newDocument.related_entity} onChange={e => h.setNewDocument(p => ({ ...p, related_entity: e.target.value }))} placeholder="ФИО или название организации" className="rounded-xl" /></div>
            <div className="space-y-2"><Label>Регистрационный номер</Label><div className="flex gap-2"><Input value={h.newDocument.reg_number} onChange={e => h.setNewDocument(p => ({ ...p, reg_number: e.target.value }))} placeholder="Например: ДОГ-2025/001" className="flex-1 rounded-xl" /><Button type="button" variant="outline" onClick={h.generateNewDocNumber} className="shrink-0 rounded-xl"><Hash className="w-4 h-4 mr-1" />Авто</Button></div></div>
            <div className="space-y-2"><Label>Примечание</Label><Textarea value={h.newDocument.notes} onChange={e => h.setNewDocument(p => ({ ...p, notes: e.target.value }))} placeholder="Дополнительная информация" className="rounded-xl resize-none" rows={3} /></div>
          </div>
          <DialogFooter className="flex gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => h.setShowAddDialog(false)} disabled={h.saving}>Отмена</Button>
            <Button onClick={h.handleAddDocument} disabled={h.saving}>{h.saving ? <><SigmaSpinner size="sm" className="mr-2" />Сохранение...</> : <><Plus className="w-4 h-4 mr-2" />Добавить</>}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
