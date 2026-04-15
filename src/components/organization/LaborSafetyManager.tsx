import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Card, CardContent } from "@/components/ui/card";
import {
  Plus, Download, Trash2, Edit, Users, Search, CheckCircle, FileText, X,
  GraduationCap, ArrowLeft, MoreHorizontal, SortAsc, SortDesc, FolderOpen, Calendar,
  Shield, ChevronRight, User, Key, RefreshCw, ClipboardCheck, BarChart3, BookOpen } from "lucide-react";
import { format } from "date-fns";
import { LaborSafetyStudentDetailCard } from "./LaborSafetyStudentDetailCard";
import { useLaborSafetyManager } from "@/hooks/useLaborSafetyManager";
import { Progress } from "@/components/ui/progress";
import { SigmaSpinner } from "@/components/ui/SigmaSpinner";

interface LaborSafetyManagerProps {
  organizationId: string;
}

export function LaborSafetyManager({ organizationId }: LaborSafetyManagerProps) {
  const h = useLaborSafetyManager({ organizationId });

  if (h.isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <SigmaSpinner size="lg" />
      </div>
    );
  }

  // Groups list view
  if (!h.selectedGroup) {
    return (
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold flex items-center gap-2">
              <Shield className="h-5 w-5 text-primary" />Охрана труда
            </h2>
            <p className="text-sm text-muted-foreground">
              {h.groups.length} {h.groups.length === 1 ? 'группа' : h.groups.length < 5 ? 'группы' : 'групп'}
            </p>
          </div>
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <Popover open={h.isGroupSearchOpen} onOpenChange={h.setIsGroupSearchOpen}>
              <PopoverTrigger asChild>
                <Button variant="outline" className="w-full sm:w-[260px] justify-start">
                  <Search className="mr-2 h-4 w-4 shrink-0" />
                  <span className="truncate text-muted-foreground">{h.groupSearch || "Найти группу..."}</span>
                </Button>
              </PopoverTrigger>
              <PopoverContent className="p-0 w-[300px]" align="end">
                <Command>
                  <CommandInput placeholder="Поиск по названию..." value={h.groupSearch} onValueChange={h.setGroupSearch} />
                  <CommandList>
                    <CommandEmpty>Группы не найдены</CommandEmpty>
                    <CommandGroup heading={`Найдено: ${h.filteredGroups.length}`}>
                      {h.filteredGroups.slice(0, 15).map(group => (
                        <CommandItem key={group.id} onSelect={() => { h.setSelectedGroup(group); h.setIsGroupSearchOpen(false); h.setGroupSearch(""); }} className="cursor-pointer">
                          <FolderOpen className="mr-2 h-4 w-4 shrink-0" />
                          <span className="flex-1 truncate">{group.name}</span>
                          <Badge variant="secondary" className="ml-2 shrink-0">{group.records_count || 0}</Badge>
                        </CommandItem>
                      ))}
                      {h.filteredGroups.length > 15 && <div className="px-2 py-1.5 text-xs text-muted-foreground">И ещё {h.filteredGroups.length - 15}...</div>}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
            <Button onClick={() => { h.setEditingGroup(null); h.setGroupName(""); h.setGroupDescription(""); h.setShowGroupDialog(true); }}>
              <Plus className="h-4 w-4 mr-2" /><span className="hidden sm:inline">Создать группу</span><span className="sm:hidden">Создать</span>
            </Button>
          </div>
        </div>

        {/* Sorting */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm text-muted-foreground">Сортировка:</span>
          {(['name', 'created_at', 'records_count'] as const).map(field => {
            const labels = { name: 'По названию', created_at: 'По дате', records_count: 'По кол-ву записей' };
            return (
              <Button key={field} variant={h.groupSortField === field ? 'secondary' : 'ghost'} size="sm" onClick={() => {
                if (h.groupSortField === field) h.setGroupSortDirection(d => d === 'asc' ? 'desc' : 'asc');
                else { h.setGroupSortField(field); h.setGroupSortDirection(field === 'name' ? 'asc' : 'desc'); }
              }}>
                {labels[field]}
                {h.groupSortField === field && (h.groupSortDirection === 'asc' ? <SortAsc className="ml-1 h-3 w-3" /> : <SortDesc className="ml-1 h-3 w-3" />)}
              </Button>
            );
          })}
          {h.groupSearch && <Button variant="ghost" size="sm" onClick={() => h.setGroupSearch("")}><X className="h-3 w-3 mr-1" />Сбросить фильтр</Button>}
        </div>

        {/* Groups grid */}
        {h.filteredGroups.length === 0 ? (
          h.groups.length === 0 && !h.groupSearch ? (
            <div className="bg-card rounded-2xl border border-border overflow-hidden">
              <div className="bg-gradient-to-br from-primary/10 via-primary/5 to-transparent p-6">
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                  <div>
                    <h2 className="text-xl font-bold flex items-center gap-2">
                      <Shield className="w-6 h-6 text-primary" />
                      Организуйте обучение по охране труда
                    </h2>
                    <p className="text-muted-foreground text-sm mt-1">Изолированный модуль для работы с группами слушателей по программам ОТ</p>
                  </div>
                </div>
              </div>
              <div className="p-6 pt-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {[
                    { icon: Users, title: "Группы слушателей", desc: "Массовое зачисление на несколько курсов одновременно" },
                    { icon: RefreshCw, title: "Автосинхронизация", desc: "Профили и результаты автоматически синхронизируются с основной системой" },
                    { icon: ClipboardCheck, title: "Протоколы", desc: "Генерация протоколов проверки знаний с полями для подписей комиссии (Word)" },
                    { icon: FileText, title: "Сокращённый чек-лист", desc: "Только Договор, Паспорт и СНИЛС — ничего лишнего" },
                    { icon: BarChart3, title: "Статусы обучения", desc: "Динамический прогресс: «Сдано», «Обучение: X%», «Не начато»" },
                    { icon: BookOpen, title: "Курсы по ОТ", desc: "Список ограничен программами категории «Охрана труда»" },
                  ].map((f, i) => (
                    <div key={i} className="flex items-start gap-3 p-3 rounded-xl bg-muted/30">
                      <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                        <f.icon className="w-4 h-4 text-primary" />
                      </div>
                      <div>
                        <div className="font-medium text-sm">{f.title}</div>
                        <div className="text-xs text-muted-foreground">{f.desc}</div>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="mt-6 flex justify-center">
                  <Button className="rounded-xl gap-2" onClick={() => h.setShowGroupDialog(true)}>
                    <Plus className="h-4 w-4" />
                    Создать первую группу
                  </Button>
                </div>
              </div>
            </div>
          ) : (
            <Card className="border-dashed">
              <CardContent className="flex flex-col items-center justify-center py-12">
                <FolderOpen className="h-12 w-12 text-muted-foreground/50 mb-4" />
                <p className="text-muted-foreground text-center">Группы не найдены по заданным критериям.</p>
              </CardContent>
            </Card>
          )
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {h.filteredGroups.map(group => (
              <Card key={group.id} className="cursor-pointer hover:border-primary/50 hover:shadow-md transition-all group" onClick={() => h.setSelectedGroup(group)}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <h3 className="font-medium truncate group-hover:text-primary transition-colors flex items-center gap-2">
                        {group.name}<ChevronRight className="h-4 w-4 opacity-0 group-hover:opacity-100 transition-opacity" />
                      </h3>
                      <div className="flex items-center gap-3 mt-2 text-sm text-muted-foreground">
                        <span className="flex items-center gap-1"><Users className="h-3.5 w-3.5" />{group.records_count || 0}</span>
                        <span className="flex items-center gap-1"><Calendar className="h-3.5 w-3.5" />{format(new Date(group.created_at), 'dd.MM.yyyy')}</span>
                      </div>
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild onClick={e => e.stopPropagation()}>
                        <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"><MoreHorizontal className="h-4 w-4" /></Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={(e) => { e.stopPropagation(); h.setEditingGroup(group); h.setGroupName(group.name); h.setShowGroupDialog(true); }}><Edit className="h-4 w-4 mr-2" />Редактировать</DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={(e) => { e.stopPropagation(); h.setGroupToDelete(group); h.setShowDeleteGroupConfirm(true); }}><Trash2 className="h-4 w-4 mr-2" />Удалить</DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Group Dialog */}
        <Dialog open={h.showGroupDialog} onOpenChange={h.setShowGroupDialog}>
          <DialogContent>
            <DialogHeader><DialogTitle>{h.editingGroup ? 'Редактировать группу' : 'Создать группу'}</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div><Label>Название группы *</Label><Input value={h.groupName} onChange={e => h.setGroupName(e.target.value)} placeholder="Например: Инженеры 2024" /></div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => h.setShowGroupDialog(false)}>Отмена</Button>
              <Button onClick={h.handleCreateGroup} disabled={h.isCreatingGroup}>{h.isCreatingGroup && <SigmaSpinner size="sm" className="mr-2" />}{h.editingGroup ? 'Сохранить' : 'Создать'}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <AlertDialog open={h.showDeleteGroupConfirm} onOpenChange={h.setShowDeleteGroupConfirm}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Удалить группу?</AlertDialogTitle>
              <AlertDialogDescription>Группа "{h.groupToDelete?.name}" и все записи ({h.groupToDelete?.records_count || 0}) в ней будут удалены.</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Отмена</AlertDialogCancel>
              <AlertDialogAction onClick={h.handleDeleteGroup} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Удалить</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    );
  }

  // Records view
  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => h.setSelectedGroup(null)} className="shrink-0"><ArrowLeft className="h-4 w-4" /></Button>
          <div>
            <h2 className="text-xl font-semibold">{h.selectedGroup.name}</h2>
            <p className="text-sm text-muted-foreground">{h.records.length} {h.records.length === 1 ? 'запись' : h.records.length < 5 ? 'записи' : 'записей'}</p>
          </div>
        </div>
        <Button onClick={() => { h.resetRecordForm(); h.setShowRecordDialog(true); }}><Plus className="h-4 w-4 mr-2" />Добавить запись</Button>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="flex-1 relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Поиск по ФИО..." value={h.searchName} onChange={e => h.setSearchName(e.target.value)} className="pl-8 w-full" />
            </div>
            <div className="flex gap-2 items-center">
              <Input type="date" value={h.dateFrom} onChange={e => h.setDateFrom(e.target.value)} className="w-[130px]" />
              <span className="text-muted-foreground">—</span>
              <Input type="date" value={h.dateTo} onChange={e => h.setDateTo(e.target.value)} className="w-[130px]" />
              {(h.searchName || h.dateFrom || h.dateTo) && <Button variant="ghost" size="icon" onClick={h.clearFilters}><X className="h-4 w-4" /></Button>}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Bulk actions */}
      {h.selectedRecordIds.size > 0 && (
        <Card className="border-primary/50 bg-primary/5">
          <CardContent className="p-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary">Выбрано: {h.selectedRecordIds.size}</Badge>
              <Separator orientation="vertical" className="h-6" />
              <Button variant="outline" size="sm" onClick={h.exportSelectedToXML} disabled={h.isBulkUpdating}><Download className="h-4 w-4 mr-2" />Экспорт XML</Button>
              <Button variant="outline" size="sm" onClick={h.markSelectedAsPassed} disabled={h.isBulkUpdating}><CheckCircle className="h-4 w-4 mr-2" />Сдал</Button>
              <Button variant="outline" size="sm" onClick={h.generateProtocolForSelected}><FileText className="h-4 w-4 mr-2" />Протокол (HTML)</Button>
              <Button variant="outline" size="sm" onClick={h.handleGenerateProtokol} disabled={h.isGenerating}><FileText className="h-4 w-4 mr-2" />Протокол (Word)</Button>
              <Button variant="outline" size="sm" onClick={h.handleGeneratePrikaz} disabled={h.isGenerating}><FileText className="h-4 w-4 mr-2" />Приказ</Button>
              <Button variant="outline" size="sm" onClick={h.openEnrollDialog}><GraduationCap className="h-4 w-4 mr-2" />На курс</Button>
              <Button variant="outline" size="sm" onClick={h.generateCredentialsForSelected} disabled={h.isGeneratingCredentials}>
                {h.isGeneratingCredentials ? <SigmaSpinner size="sm" className="mr-2" /> : <Key className="h-4 w-4 mr-2" />}Доступы
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Records table */}
      {h.isLoadingRecords ? (
        <div className="flex justify-center py-8"><SigmaSpinner /></div>
      ) : h.filteredRecords.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Users className="h-12 w-12 text-muted-foreground/50 mb-4" />
            <p className="text-muted-foreground">{h.records.length === 0 ? "Нет записей. Добавьте первого сотрудника." : "Записи не найдены по заданным критериям."}</p>
          </CardContent>
        </Card>
      ) : (
        <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10"><Checkbox checked={h.allFilteredSelected} onCheckedChange={h.toggleAllFiltered} /></TableHead>
                  <TableHead>ФИО</TableHead>
                  <TableHead>Должность</TableHead>
                  <TableHead>Организация</TableHead>
                  <TableHead>Курсы</TableHead>
                  <TableHead className="text-center">Результат</TableHead>
                  <TableHead className="w-20"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {h.filteredRecords.map(record => (
                  <TableRow key={record.id} className="cursor-pointer" onClick={() => { h.setSelectedRecordForDetail(record); h.setShowStudentDetailCard(true); }}>
                    <TableCell onClick={e => e.stopPropagation()}><Checkbox checked={h.selectedRecordIds.has(record.id)} onCheckedChange={() => h.toggleRecordSelection(record.id)} /></TableCell>
                    <TableCell>
                      <div><div className="font-medium">{record.full_name}</div>{record.snils && <div className="text-xs text-muted-foreground">СНИЛС: {record.snils}</div>}</div>
                    </TableCell>
                    <TableCell className="text-sm">{record.position || '—'}</TableCell>
                    <TableCell className="text-sm">{record.organization_name || '—'}</TableCell>
                    <TableCell>
                      {record.courses && record.courses.length > 0 ? (
                        <div className="space-y-1">
                          {record.courses.slice(0, 2).map(c => <Badge key={c.id} variant="outline" className="text-xs mr-1">{c.title.length > 20 ? c.title.slice(0, 20) + '...' : c.title}</Badge>)}
                          {record.courses.length > 2 && <Badge variant="secondary" className="text-xs">+{record.courses.length - 2}</Badge>}
                          {record.averageProgress !== undefined && record.averageProgress > 0 && (
                            <div className="flex items-center gap-2 mt-1"><Progress value={record.averageProgress} className="h-1.5 w-16" /><span className="text-xs text-muted-foreground">{record.averageProgress}%</span></div>
                          )}
                        </div>
                      ) : <span className="text-xs text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge variant={record.is_passed ? "default" : "secondary"} className={record.is_passed ? "bg-green-500/10 text-green-600 border-green-500/20" : ""}>
                        {record.is_passed ? 'Сдал' : 'Не сдал'}
                      </Badge>
                    </TableCell>
                    <TableCell onClick={e => e.stopPropagation()}>
                      <div className="flex items-center gap-1">
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => h.openEditRecord(record)}><Edit className="h-4 w-4" /></Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => h.handleDeleteRecord(record.id)}><Trash2 className="h-4 w-4" /></Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
        </Card>
      )}

      {/* Record Dialog */}
      <Dialog open={h.showRecordDialog} onOpenChange={h.setShowRecordDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{h.editingRecord ? 'Редактировать запись' : 'Добавить запись'}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div><Label>ФИО *</Label><Input value={h.recordForm.full_name} onChange={e => h.setRecordForm(p => ({ ...p, full_name: e.target.value }))} /></div>
            <div className="grid grid-cols-2 gap-4">
              <div><Label>СНИЛС</Label><Input value={h.recordForm.snils} onChange={e => h.setRecordForm(p => ({ ...p, snils: e.target.value }))} /></div>
              <div><Label>ИНН</Label><Input value={h.recordForm.inn} onChange={e => h.setRecordForm(p => ({ ...p, inn: e.target.value }))} /></div>
            </div>
            <div><Label>Должность</Label><Input value={h.recordForm.position} onChange={e => h.setRecordForm(p => ({ ...p, position: e.target.value }))} /></div>
            <div><Label>Организация</Label><Input value={h.recordForm.organization_name} onChange={e => h.setRecordForm(p => ({ ...p, organization_name: e.target.value }))} /></div>
            <div><Label>Программа обучения</Label><Input value={h.recordForm.program_name} onChange={e => h.setRecordForm(p => ({ ...p, program_name: e.target.value }))} /></div>
            <div className="grid grid-cols-2 gap-4">
              <div><Label>Номер протокола</Label><Input value={h.recordForm.protocol_number} onChange={e => h.setRecordForm(p => ({ ...p, protocol_number: e.target.value }))} /></div>
              <div><Label>Дата экзамена</Label><Input type="date" value={h.recordForm.exam_date} onChange={e => h.setRecordForm(p => ({ ...p, exam_date: e.target.value }))} /></div>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox checked={h.recordForm.is_passed} onCheckedChange={(v) => h.setRecordForm(p => ({ ...p, is_passed: !!v }))} id="is_passed" />
              <Label htmlFor="is_passed">Проверку знаний прошёл</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => h.setShowRecordDialog(false)}>Отмена</Button>
            <Button onClick={h.handleSaveRecord} disabled={h.isSavingRecord}>{h.isSavingRecord && <SigmaSpinner size="sm" className="mr-2" />}{h.editingRecord ? 'Сохранить' : 'Добавить'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Enroll Dialog */}
      <Dialog open={h.showEnrollDialog} onOpenChange={h.setShowEnrollDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>Зачисление на курс</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">Выбрано записей: {h.selectedRecordIds.size}. Выберите курсы для зачисления.</p>
            {h.isLoadingCourses ? (
              <div className="flex justify-center py-4"><SigmaSpinner /></div>
            ) : h.courses.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">Нет доступных курсов</p>
            ) : (
              <ScrollArea className="h-[300px]">
                <div className="space-y-2">
                  {h.courses.map(course => (
                    <div key={course.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-secondary/30 cursor-pointer" onClick={() => {
                      h.setSelectedCourseIds(prev => prev.includes(course.id) ? prev.filter(id => id !== course.id) : [...prev, course.id]);
                    }}>
                      <Checkbox checked={h.selectedCourseIds.includes(course.id)} />
                      <div className="flex-1"><div className="text-sm font-medium">{course.title}</div></div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => h.setShowEnrollDialog(false)}>Отмена</Button>
            <Button onClick={h.enrollSelectedToCourse} disabled={h.isEnrolling || h.selectedCourseIds.length === 0}>
              {h.isEnrolling && <SigmaSpinner size="sm" className="mr-2" />}Зачислить ({h.selectedCourseIds.length})
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Student Detail Card */}
      {h.selectedRecordForDetail && (
        <LaborSafetyStudentDetailCard
          record={h.selectedRecordForDetail}
          organizationId={organizationId}
          isOpen={h.showStudentDetailCard}
          onOpenChange={h.setShowStudentDetailCard}
          onRecordUpdated={() => { if (h.selectedGroup) h.fetchRecords(h.selectedGroup.id); }}
        />
      )}
    </div>
  );
}
