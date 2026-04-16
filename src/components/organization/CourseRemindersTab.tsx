import React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Switch } from "@/components/ui/switch";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Bell, Send, X, Calendar, Building2, User, Edit2, Copy, Eye, Pencil, MessageSquare, Clock } from "lucide-react";
import { REMINDER_TEMPLATES, RETRAINING_PERIOD_OPTIONS } from "@/constants/reminderTemplates";
import { format } from "date-fns";
import { ru } from "date-fns/locale";
import { SigmaSpinner } from "@/components/ui/SigmaSpinner";
import { useCourseReminders, ADVANCE_DAYS_OPTIONS } from "@/hooks/useCourseReminders";
import { toast } from "sonner";

interface CourseRemindersTabProps {
  courseId: string;
  organizationId: string;
  retrainingPeriodMonths: number | null;
  onPeriodChange: (months: number | null) => void;
  reminderAdvanceDays: number;
  onAdvanceDaysChange: (days: number) => void;
  notifyOnCompletion: boolean;
  completionNotifyEmails: string | null;
  onNotifyOnCompletionChange: (value: boolean) => void;
  onCompletionNotifyEmailsChange: (value: string) => void;
}

export function CourseRemindersTab({ courseId, organizationId, retrainingPeriodMonths, onPeriodChange, reminderAdvanceDays, onAdvanceDaysChange, notifyOnCompletion, completionNotifyEmails, onNotifyOnCompletionChange, onCompletionNotifyEmailsChange }: CourseRemindersTabProps) {
  const h = useCourseReminders({ courseId, retrainingPeriodMonths, onPeriodChange });

  return (
    <div className="space-y-4">
      <Tabs defaultValue="notifications" className="w-full">
        <TabsList className="w-full justify-start rounded-xl bg-secondary/50 p-1 h-auto flex-wrap">
          <TabsTrigger value="notifications" className="rounded-lg data-[state=active]:bg-background data-[state=active]:shadow-sm gap-1.5 text-sm">
            <Send className="w-4 h-4" />Уведомления
          </TabsTrigger>
          <TabsTrigger value="periodicity" className="rounded-lg data-[state=active]:bg-background data-[state=active]:shadow-sm gap-1.5 text-sm">
            <Calendar className="w-4 h-4" />Периодичность
          </TabsTrigger>
          <TabsTrigger value="templates" className="rounded-lg data-[state=active]:bg-background data-[state=active]:shadow-sm gap-1.5 text-sm">
            <MessageSquare className="w-4 h-4" />Шаблоны
          </TabsTrigger>
          <TabsTrigger value="upcoming" className="rounded-lg data-[state=active]:bg-background data-[state=active]:shadow-sm gap-1.5 text-sm">
            <Clock className="w-4 h-4" />Предстоящие
            {h.activeReminders.length > 0 && (
              <Badge variant="destructive" className="ml-1 h-5 min-w-5 text-xs px-1.5">{h.activeReminders.length}</Badge>
            )}
          </TabsTrigger>
        </TabsList>

        {/* Tab: Уведомления */}
        <TabsContent value="notifications" className="mt-4">
          <div className="bg-secondary/30 rounded-xl p-4 space-y-4">
            <div className="flex items-center gap-2 mb-2">
              <Send className="w-5 h-5 text-primary" />
              <h4 className="font-semibold">Уведомление о завершении курса</h4>
            </div>
            <p className="text-sm text-muted-foreground">При завершении курса слушателем на указанные адреса будет отправлено письмо с ФИО и результатами тестирования</p>
            <div className="flex items-center gap-3">
              <Switch checked={notifyOnCompletion} onCheckedChange={onNotifyOnCompletionChange} />
              <Label className="text-sm">Уведомлять о завершении курса по email</Label>
            </div>
            {notifyOnCompletion && (
              <div className="space-y-2 pt-3 border-t border-border/30">
                <Label className="text-sm">Дополнительные email-адреса (через запятую)</Label>
                <Input placeholder="admin@example.com, manager@example.com" value={completionNotifyEmails || ""} onChange={(e) => onCompletionNotifyEmailsChange(e.target.value)} className="rounded-xl" />
                <p className="text-xs text-muted-foreground">Письмо также отправляется на email организации. Укажите дополнительные адреса через запятую.</p>
              </div>
            )}
          </div>
        </TabsContent>

        {/* Tab: Периодичность */}
        <TabsContent value="periodicity" className="mt-4">
          <div className="bg-secondary/30 rounded-xl p-4 space-y-4">
            <div className="flex items-center gap-2 mb-2">
              <Calendar className="w-5 h-5 text-primary" />
              <h4 className="font-semibold">Периодичность переобучения</h4>
            </div>
            <p className="text-sm text-muted-foreground">При завершении курса автоматически будет создано напоминание о необходимости повторного обучения</p>
            <div className="flex items-center gap-3">
              <Select value={h.currentPeriodValue} onValueChange={h.handlePeriodSelect}>
                <SelectTrigger className="w-64 rounded-xl"><SelectValue placeholder="Выберите периодичность" /></SelectTrigger>
                <SelectContent>
                  {RETRAINING_PERIOD_OPTIONS.map(opt => (
                    <SelectItem key={opt.value} value={String(opt.value)}>{opt.label}</SelectItem>
                  ))}
                  <SelectItem value="custom">Ввести вручную...</SelectItem>
                </SelectContent>
              </Select>
              {retrainingPeriodMonths && !RETRAINING_PERIOD_OPTIONS.find(o => o.value === retrainingPeriodMonths) && (
                <span className="text-sm text-muted-foreground">{retrainingPeriodMonths} мес.</span>
              )}
            </div>
            {h.customPeriod && (
              <div className="flex items-center gap-2">
                <Input type="number" placeholder="Количество месяцев" value={h.customMonths} onChange={e => h.setCustomMonths(e.target.value)} className="w-48 rounded-xl" min={1} />
                <Button size="sm" className="rounded-xl" onClick={h.handleCustomPeriodSave}>Сохранить</Button>
              </div>
            )}
            {retrainingPeriodMonths && retrainingPeriodMonths > 0 && (
              <div className="space-y-2 pt-3 border-t border-border/30">
                <Label className="text-sm">За сколько дней до срока напоминать</Label>
                <Select value={String(reminderAdvanceDays)} onValueChange={v => onAdvanceDaysChange(parseInt(v))}>
                  <SelectTrigger className="w-64 rounded-xl"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {ADVANCE_DAYS_OPTIONS.map(opt => (
                      <SelectItem key={opt.value} value={String(opt.value)}>{opt.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">Напоминание будет отправлено за {reminderAdvanceDays} дней до даты переобучения</p>
              </div>
            )}
          </div>
        </TabsContent>

        {/* Tab: Шаблоны */}
        <TabsContent value="templates" className="mt-4">
          <div className="bg-secondary/30 rounded-xl p-4 space-y-3">
            <h4 className="font-semibold flex items-center gap-2">
              <MessageSquare className="w-5 h-5 text-primary" />Шаблоны комментариев
            </h4>
            <p className="text-sm text-muted-foreground">Готовые тексты уведомлений. Нажмите для предпросмотра.</p>
            <div className="flex flex-wrap gap-2">
              {REMINDER_TEMPLATES.map(t => (
                <Badge key={t.id} variant="outline" className="cursor-pointer hover:bg-primary/10 transition-colors py-1.5 px-3" onClick={() => h.setPreviewTemplate(t)}>
                  <Eye className="w-3 h-3 mr-1" />{t.name}
                </Badge>
              ))}
            </div>
          </div>
        </TabsContent>

        {/* Tab: Предстоящие */}
        <TabsContent value="upcoming" className="mt-4 space-y-6">
          <div>
            <h4 className="font-semibold mb-3 flex items-center gap-2">
              <Bell className="w-5 h-5 text-primary" />Предстоящие напоминания ({h.activeReminders.length})
            </h4>

            {h.loading ? (
              <div className="flex justify-center py-8"><SigmaSpinner /></div>
            ) : h.activeReminders.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Bell className="w-10 h-10 mx-auto mb-2 opacity-30" />
                <p className="text-sm">Нет предстоящих напоминаний</p>
                <p className="text-xs mt-1">Напоминания создаются автоматически при завершении курса</p>
              </div>
            ) : (
              <ScrollArea className="max-h-96">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Слушатель</TableHead>
                      <TableHead>Компания</TableHead>
                      <TableHead>Дата прохождения</TableHead>
                      <TableHead>Дата напоминания</TableHead>
                      <TableHead>Получатели</TableHead>
                      <TableHead className="text-right">Действия</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {h.activeReminders.map(r => (
                      <TableRow key={r.id}>
                        <TableCell>
                          <div>
                            <div className="font-medium text-sm">{r.student_name || "—"}</div>
                            <div className="text-xs text-muted-foreground">{r.student_email}</div>
                          </div>
                        </TableCell>
                        <TableCell className="text-sm">{r.company_name || "—"}</TableCell>
                        <TableCell className="text-sm">{format(new Date(r.completed_at), "dd.MM.yyyy", { locale: ru })}</TableCell>
                        <TableCell>
                          <Badge variant={new Date(r.reminder_date) <= new Date() ? "destructive" : "outline"}>
                            {format(new Date(r.reminder_date), "dd.MM.yyyy", { locale: ru })}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            {r.notify_organization && <Badge variant="secondary" className="text-xs"><Building2 className="w-3 h-3 mr-1" />Орг</Badge>}
                            {r.notify_company && r.company_id && <Badge variant="secondary" className="text-xs"><Building2 className="w-3 h-3 mr-1" />Комп</Badge>}
                            {r.notify_student && <Badge variant="secondary" className="text-xs"><User className="w-3 h-3 mr-1" />Уч</Badge>}
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => h.setEditingReminder(r)} title="Редактировать"><Edit2 className="w-4 h-4" /></Button>
                            <Button size="icon" variant="ghost" className="h-8 w-8 text-sigma-green" onClick={() => h.handleMarkSent(r.id)} title="Отметить отправленным"><Send className="w-4 h-4" /></Button>
                            <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" onClick={() => h.handleDismiss(r.id)} title="Отклонить"><X className="w-4 h-4" /></Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </ScrollArea>
            )}
          </div>

          {h.pastReminders.length > 0 && (
            <div>
              <h4 className="font-semibold mb-3 text-muted-foreground text-sm">Отправленные / отклонённые ({h.pastReminders.length})</h4>
              <ScrollArea className="max-h-48">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Слушатель</TableHead>
                      <TableHead>Дата напоминания</TableHead>
                      <TableHead>Статус</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {h.pastReminders.map(r => (
                      <TableRow key={r.id} className="opacity-60">
                        <TableCell className="text-sm">{r.student_name || "—"}</TableCell>
                        <TableCell className="text-sm">{format(new Date(r.reminder_date), "dd.MM.yyyy", { locale: ru })}</TableCell>
                        <TableCell><Badge variant={r.is_sent ? "default" : "secondary"}>{r.is_sent ? "Отправлено" : "Отклонено"}</Badge></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </ScrollArea>
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Edit Reminder Dialog */}
      <Dialog open={!!h.editingReminder} onOpenChange={open => !open && h.setEditingReminder(null)}>
        <DialogContent className="rounded-2xl">
          <DialogHeader><DialogTitle>Редактировать напоминание</DialogTitle></DialogHeader>
          {h.editingReminder && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Дата напоминания</Label>
                <Input type="date" value={h.editingReminder.reminder_date} onChange={e => h.setEditingReminder({ ...h.editingReminder!, reminder_date: e.target.value })} className="rounded-xl" />
              </div>
              <div className="space-y-2">
                <Label>Текст напоминания</Label>
                <Textarea value={h.editingReminder.reminder_text || ""} onChange={e => h.setEditingReminder({ ...h.editingReminder!, reminder_text: e.target.value })} className="rounded-xl min-h-[120px]" placeholder="Текст уведомления..." />
                <div className="flex flex-wrap gap-1">
                  {REMINDER_TEMPLATES.map(t => (
                    <Badge key={t.id} variant="outline" className="cursor-pointer hover:bg-primary/10 text-xs" onClick={() => h.setEditingReminder({ ...h.editingReminder!, reminder_text: t.text })}>
                      {t.name}
                    </Badge>
                  ))}
                </div>
              </div>
              <div className="space-y-3">
                <Label>Получатели</Label>
                <div className="flex items-center gap-2"><Switch checked={h.editingReminder.notify_organization} onCheckedChange={v => h.setEditingReminder({ ...h.editingReminder!, notify_organization: v })} /><span className="text-sm">Обучающая организация</span></div>
                <div className="flex items-center gap-2"><Switch checked={h.editingReminder.notify_company} onCheckedChange={v => h.setEditingReminder({ ...h.editingReminder!, notify_company: v })} /><span className="text-sm">Компания-заказчик</span></div>
                <div className="flex items-center gap-2"><Switch checked={h.editingReminder.notify_student} onCheckedChange={v => h.setEditingReminder({ ...h.editingReminder!, notify_student: v })} /><span className="text-sm">Слушатель</span></div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" className="rounded-xl" onClick={() => h.setEditingReminder(null)}>Отмена</Button>
            <Button className="rounded-xl btn-gradient" onClick={h.handleSaveReminderEdit} disabled={h.isSaving}>
              {h.isSaving ? <SigmaSpinner size="sm" className="mr-2" /> : null}Сохранить
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Template Preview Dialog */}
      <Dialog open={!!h.previewTemplate} onOpenChange={open => !open && h.setPreviewTemplate(null)}>
        <DialogContent className="rounded-2xl max-w-lg">
          <DialogHeader><DialogTitle>{h.previewTemplate?.name}</DialogTitle></DialogHeader>
          {h.previewTemplate && (
            <div className="space-y-4">
              <Badge variant="secondary" className="text-sm">Периодичность: {h.previewTemplate.periodMonths} мес.</Badge>
              <div className="bg-muted/50 rounded-xl p-4 max-h-80 overflow-y-auto">
                <p className="text-sm whitespace-pre-wrap leading-relaxed">{h.previewTemplate.text}</p>
              </div>
            </div>
          )}
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" className="rounded-xl" onClick={() => h.setPreviewTemplate(null)}>Закрыть</Button>
            <Button variant="outline" className="rounded-xl" onClick={() => { if (h.previewTemplate) { h.setEditingTemplate(h.previewTemplate); h.setEditedText(h.previewTemplate.text); h.setPreviewTemplate(null); } }}>
              <Pencil className="w-4 h-4 mr-2" />Редактировать
            </Button>
            <Button className="rounded-xl" onClick={() => { if (h.previewTemplate) { navigator.clipboard.writeText(h.previewTemplate.text); toast.success(`Шаблон "${h.previewTemplate.name}" скопирован`); } }}>
              <Copy className="w-4 h-4 mr-2" />Скопировать текст
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Template Edit Dialog */}
      <Dialog open={!!h.editingTemplate} onOpenChange={open => !open && h.setEditingTemplate(null)}>
        <DialogContent className="rounded-2xl max-w-lg">
          <DialogHeader><DialogTitle>Редактировать: {h.editingTemplate?.name}</DialogTitle></DialogHeader>
          {h.editingTemplate && (
            <div className="space-y-4">
              <Badge variant="secondary" className="text-sm">Периодичность: {h.editingTemplate.periodMonths} мес.</Badge>
              <Textarea value={h.editedText} onChange={e => h.setEditedText(e.target.value)} className="rounded-xl min-h-[200px] text-sm" />
            </div>
          )}
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" className="rounded-xl" onClick={() => h.setEditingTemplate(null)}>Отмена</Button>
            <Button className="rounded-xl" onClick={() => { navigator.clipboard.writeText(h.editedText); toast.success("Отредактированный текст скопирован"); h.setEditingTemplate(null); }}>
              <Copy className="w-4 h-4 mr-2" />Скопировать
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
