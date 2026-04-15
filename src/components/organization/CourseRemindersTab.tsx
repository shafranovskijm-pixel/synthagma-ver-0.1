import React, { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter } from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Bell, Plus, Send, Check, X, Calendar, Building2, User, Edit2, Copy, Eye, Pencil } from "lucide-react";
import { REMINDER_TEMPLATES, RETRAINING_PERIOD_OPTIONS, ReminderTemplate } from "@/constants/reminderTemplates";
import { format } from "date-fns";
import { ru } from "date-fns/locale";

interface CourseReminder {
  id: string;
  course_id: string;
  enrollment_id: string;
  user_id: string;
  organization_id: string;
  company_id: string | null;
  completed_at: string;
  reminder_date: string;
  reminder_text: string | null;
  notify_organization: boolean;
  notify_company: boolean;
  notify_student: boolean;
  is_sent: boolean;
  is_dismissed: boolean;
  created_at: string;
  // Joined data
  student_name?: string;
  student_email?: string;
  company_name?: string;
}

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

const ADVANCE_DAYS_OPTIONS = [
  { value: 7, label: "За 7 дней" },
  { value: 14, label: "За 14 дней" },
  { value: 30, label: "За 30 дней" },
  { value: 60, label: "За 60 дней" },
  { value: 90, label: "За 90 дней" },
];

export function CourseRemindersTab({ courseId, organizationId, retrainingPeriodMonths, onPeriodChange, reminderAdvanceDays, onAdvanceDaysChange, notifyOnCompletion, completionNotifyEmails, onNotifyOnCompletionChange, onCompletionNotifyEmailsChange }: CourseRemindersTabProps) {
  const [reminders, setReminders] = useState<CourseReminder[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [editingReminder, setEditingReminder] = useState<CourseReminder | null>(null);
  const [customPeriod, setCustomPeriod] = useState(false);
  const [customMonths, setCustomMonths] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [previewTemplate, setPreviewTemplate] = useState<ReminderTemplate | null>(null);
  const [editingTemplate, setEditingTemplate] = useState<ReminderTemplate | null>(null);
  const [editedText, setEditedText] = useState("");

  const fetchReminders = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("course_reminders")
        .select("*")
        .eq("course_id", courseId)
        .order("reminder_date", { ascending: true });

      if (error) throw error;

      // Enrich with student names and company names
      const enriched: CourseReminder[] = [];
      for (const r of data || []) {
        const item: CourseReminder = { ...r, student_name: undefined, student_email: undefined, company_name: undefined };
        
        // Get student info
        const { data: profile } = await supabase
          .from("profiles")
          .select("full_name, email")
          .eq("user_id", r.user_id)
          .maybeSingle();
        
        if (profile) {
          item.student_name = profile.full_name || "Без имени";
          item.student_email = profile.email || "";
        }

        // Get company name
        if (r.company_id) {
          const { data: company } = await supabase
            .from("companies")
            .select("name")
            .eq("id", r.company_id)
            .maybeSingle();
          item.company_name = company?.name || null;
        }

        enriched.push(item);
      }

      setReminders(enriched);
    } catch (error) {
      console.error("Error fetching reminders:", error);
      toast.error("Ошибка загрузки напоминаний");
    } finally {
      setLoading(false);
    }
  }, [courseId]);

  useEffect(() => {
    fetchReminders();
  }, [fetchReminders]);

  const handlePeriodSelect = (value: string) => {
    if (value === "custom") {
      setCustomPeriod(true);
      return;
    }
    const months = parseInt(value);
    setCustomPeriod(false);
    onPeriodChange(months === 0 ? null : months);
  };

  const handleCustomPeriodSave = () => {
    const months = parseInt(customMonths);
    if (months > 0) {
      onPeriodChange(months);
      setCustomPeriod(false);
    }
  };

  const handleDismiss = async (reminderId: string) => {
    try {
      const { error } = await supabase
        .from("course_reminders")
        .update({ is_dismissed: true } as any)
        .eq("id", reminderId);
      if (error) throw error;
      toast.success("Напоминание отклонено");
      fetchReminders();
    } catch (error) {
      console.error("Error dismissing reminder:", error);
      toast.error("Ошибка");
    }
  };

  const handleMarkSent = async (reminderId: string) => {
    try {
      const { error } = await supabase
        .from("course_reminders")
        .update({ is_sent: true } as any)
        .eq("id", reminderId);
      if (error) throw error;
      toast.success("Отмечено как отправленное");
      fetchReminders();
    } catch (error) {
      console.error("Error marking sent:", error);
      toast.error("Ошибка");
    }
  };

  const handleSaveReminderEdit = async () => {
    if (!editingReminder) return;
    setIsSaving(true);
    try {
      const { error } = await supabase
        .from("course_reminders")
        .update({
          reminder_date: editingReminder.reminder_date,
          reminder_text: editingReminder.reminder_text,
          notify_organization: editingReminder.notify_organization,
          notify_company: editingReminder.notify_company,
          notify_student: editingReminder.notify_student } as any)
        .eq("id", editingReminder.id);
      if (error) throw error;
      toast.success("Напоминание обновлено");
      setEditingReminder(null);
      fetchReminders();
    } catch (error) {
      console.error("Error updating reminder:", error);
      toast.error("Ошибка сохранения");
    } finally {
      setIsSaving(false);
    }
  };

  const currentPeriodValue = retrainingPeriodMonths 
    ? (RETRAINING_PERIOD_OPTIONS.find(o => o.value === retrainingPeriodMonths) 
        ? String(retrainingPeriodMonths)
        : "custom")
    : "0";

  const activeReminders = reminders.filter(r => !r.is_dismissed && !r.is_sent);
  const pastReminders = reminders.filter(r => r.is_dismissed || r.is_sent);

  return (
    <div className="space-y-6">
      {/* Completion Notification Setting */}
      <div className="bg-secondary/30 rounded-xl p-4 space-y-4">
        <div className="flex items-center gap-2 mb-2">
          <Send className="w-5 h-5 text-primary" />
          <h4 className="font-semibold">Уведомление о завершении курса</h4>
        </div>
        <p className="text-sm text-muted-foreground">
          При завершении курса слушателем на указанные адреса будет отправлено письмо с ФИО и результатами тестирования
        </p>
        <div className="flex items-center gap-3">
          <Switch
            checked={notifyOnCompletion}
            onCheckedChange={onNotifyOnCompletionChange}
          />
          <Label className="text-sm">Уведомлять о завершении курса по email</Label>
        </div>
        {notifyOnCompletion && (
          <div className="space-y-2 pt-3 border-t border-border/30">
            <Label className="text-sm">Дополнительные email-адреса (через запятую)</Label>
            <Input
              placeholder="admin@example.com, manager@example.com"
              value={completionNotifyEmails || ""}
              onChange={(e) => onCompletionNotifyEmailsChange(e.target.value)}
              className="rounded-xl"
            />
            <p className="text-xs text-muted-foreground">
              Письмо также отправляется на email организации. Укажите дополнительные адреса через запятую.
            </p>
          </div>
        )}
      </div>

      {/* Period Setting */}
      <div className="bg-secondary/30 rounded-xl p-4 space-y-4">
        <div className="flex items-center gap-2 mb-2">
          <Calendar className="w-5 h-5 text-primary" />
          <h4 className="font-semibold">Периодичность переобучения</h4>
        </div>
        <p className="text-sm text-muted-foreground">
          При завершении курса автоматически будет создано напоминание о необходимости повторного обучения
        </p>
        <div className="flex items-center gap-3">
          <Select value={currentPeriodValue} onValueChange={handlePeriodSelect}>
            <SelectTrigger className="w-64 rounded-xl">
              <SelectValue placeholder="Выберите периодичность" />
            </SelectTrigger>
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
        {customPeriod && (
          <div className="flex items-center gap-2">
            <Input
              type="number"
              placeholder="Количество месяцев"
              value={customMonths}
              onChange={e => setCustomMonths(e.target.value)}
              className="w-48 rounded-xl"
              min={1}
            />
            <Button size="sm" className="rounded-xl" onClick={handleCustomPeriodSave}>Сохранить</Button>
          </div>
        )}

        {/* Advance Days Setting */}
        {retrainingPeriodMonths && retrainingPeriodMonths > 0 && (
          <div className="space-y-2 pt-3 border-t border-border/30">
            <Label className="text-sm">За сколько дней до срока напоминать</Label>
            <Select value={String(reminderAdvanceDays)} onValueChange={v => onAdvanceDaysChange(parseInt(v))}>
              <SelectTrigger className="w-64 rounded-xl">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ADVANCE_DAYS_OPTIONS.map(opt => (
                  <SelectItem key={opt.value} value={String(opt.value)}>{opt.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Напоминание будет отправлено за {reminderAdvanceDays} дней до даты переобучения
            </p>
          </div>
        )}
      </div>
      {/* Reminder Templates */}
      <div className="bg-secondary/30 rounded-xl p-4 space-y-3">
        <h4 className="font-semibold flex items-center gap-2">
          <Bell className="w-5 h-5 text-primary" />
          Шаблоны комментариев
        </h4>
        <p className="text-sm text-muted-foreground">
          Готовые тексты уведомлений. Нажмите для предпросмотра.
        </p>
        <div className="flex flex-wrap gap-2">
          {REMINDER_TEMPLATES.map(t => (
            <Badge
              key={t.id}
              variant="outline"
              className="cursor-pointer hover:bg-primary/10 transition-colors py-1.5 px-3"
              onClick={() => setPreviewTemplate(t)}
            >
              <Eye className="w-3 h-3 mr-1" />
              {t.name}
            </Badge>
          ))}
        </div>
      </div>

      {/* Reminders Table */}
      <div>
        <h4 className="font-semibold mb-3 flex items-center gap-2">
          <Bell className="w-5 h-5 text-primary" />
          Предстоящие напоминания ({activeReminders.length})
        </h4>

        {loading ? (
          <div className="flex justify-center py-8">
            <SigmaSpinner />
          </div>
        ) : activeReminders.length === 0 ? (
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
                {activeReminders.map(r => (
                  <TableRow key={r.id}>
                    <TableCell>
                      <div>
                        <div className="font-medium text-sm">{r.student_name || "—"}</div>
                        <div className="text-xs text-muted-foreground">{r.student_email}</div>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm">{r.company_name || "—"}</TableCell>
                    <TableCell className="text-sm">
                      {format(new Date(r.completed_at), "dd.MM.yyyy", { locale: ru })}
                    </TableCell>
                    <TableCell>
                      <Badge variant={new Date(r.reminder_date) <= new Date() ? "destructive" : "outline"}>
                        {format(new Date(r.reminder_date), "dd.MM.yyyy", { locale: ru })}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        {r.notify_organization && (
                          <Badge variant="secondary" className="text-xs"><Building2 className="w-3 h-3 mr-1" />Орг</Badge>
                        )}
                        {r.notify_company && r.company_id && (
                          <Badge variant="secondary" className="text-xs"><Building2 className="w-3 h-3 mr-1" />Комп</Badge>
                        )}
                        {r.notify_student && (
                          <Badge variant="secondary" className="text-xs"><User className="w-3 h-3 mr-1" />Уч</Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setEditingReminder(r)} title="Редактировать">
                          <Edit2 className="w-4 h-4" />
                        </Button>
                        <Button size="icon" variant="ghost" className="h-8 w-8 text-sigma-green" onClick={() => handleMarkSent(r.id)} title="Отметить отправленным">
                          <Send className="w-4 h-4" />
                        </Button>
                        <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" onClick={() => handleDismiss(r.id)} title="Отклонить">
                          <X className="w-4 h-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </ScrollArea>
        )}
      </div>

      {/* Past/sent reminders */}
      {pastReminders.length > 0 && (
        <div>
          <h4 className="font-semibold mb-3 text-muted-foreground text-sm">
            Отправленные / отклонённые ({pastReminders.length})
          </h4>
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
                {pastReminders.map(r => (
                  <TableRow key={r.id} className="opacity-60">
                    <TableCell className="text-sm">{r.student_name || "—"}</TableCell>
                    <TableCell className="text-sm">{format(new Date(r.reminder_date), "dd.MM.yyyy", { locale: ru })}</TableCell>
                    <TableCell>
                      <Badge variant={r.is_sent ? "default" : "secondary"}>
                        {r.is_sent ? "Отправлено" : "Отклонено"}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </ScrollArea>
        </div>
      )}

      {/* Edit Reminder Dialog */}
      <Dialog open={!!editingReminder} onOpenChange={open => !open && setEditingReminder(null)}>
        <DialogContent className="rounded-2xl">
          <DialogHeader>
            <DialogTitle>Редактировать напоминание</DialogTitle>
          </DialogHeader>
          {editingReminder && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Дата напоминания</Label>
                <Input
                  type="date"
                  value={editingReminder.reminder_date}
                  onChange={e => setEditingReminder({ ...editingReminder, reminder_date: e.target.value })}
                  className="rounded-xl"
                />
              </div>
              <div className="space-y-2">
                <Label>Текст напоминания</Label>
                <Textarea
                  value={editingReminder.reminder_text || ""}
                  onChange={e => setEditingReminder({ ...editingReminder, reminder_text: e.target.value })}
                  className="rounded-xl min-h-[120px]"
                  placeholder="Текст уведомления..."
                />
                <div className="flex flex-wrap gap-1">
                  {REMINDER_TEMPLATES.map(t => (
                    <Badge
                      key={t.id}
                      variant="outline"
                      className="cursor-pointer hover:bg-primary/10 text-xs"
                      onClick={() => setEditingReminder({ ...editingReminder, reminder_text: t.text })}
                    >
                      {t.name}
                    </Badge>
                  ))}
                </div>
              </div>
              <div className="space-y-3">
                <Label>Получатели</Label>
                <div className="flex items-center gap-2">
                  <Switch
                    checked={editingReminder.notify_organization}
                    onCheckedChange={v => setEditingReminder({ ...editingReminder, notify_organization: v })}
                  />
                  <span className="text-sm">Обучающая организация</span>
                </div>
                <div className="flex items-center gap-2">
                  <Switch
                    checked={editingReminder.notify_company}
                    onCheckedChange={v => setEditingReminder({ ...editingReminder, notify_company: v })}
                  />
                  <span className="text-sm">Компания-заказчик</span>
                </div>
                <div className="flex items-center gap-2">
                  <Switch
                    checked={editingReminder.notify_student}
                    onCheckedChange={v => setEditingReminder({ ...editingReminder, notify_student: v })}
                  />
                  <span className="text-sm">Слушатель</span>
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" className="rounded-xl" onClick={() => setEditingReminder(null)}>Отмена</Button>
            <Button className="rounded-xl btn-gradient" onClick={handleSaveReminderEdit} disabled={isSaving}>
              {isSaving ? <SigmaSpinner size="sm" className="mr-2" /> : null}
              Сохранить
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Template Preview Dialog */}
      <Dialog open={!!previewTemplate} onOpenChange={open => !open && setPreviewTemplate(null)}>
        <DialogContent className="rounded-2xl max-w-lg">
          <DialogHeader>
            <DialogTitle>{previewTemplate?.name}</DialogTitle>
          </DialogHeader>
          {previewTemplate && (
            <div className="space-y-4">
              <Badge variant="secondary" className="text-sm">
                Периодичность: {previewTemplate.periodMonths} мес.
              </Badge>
              <div className="bg-muted/50 rounded-xl p-4 max-h-80 overflow-y-auto">
                <p className="text-sm whitespace-pre-wrap leading-relaxed">{previewTemplate.text}</p>
              </div>
            </div>
          )}
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              className="rounded-xl"
              onClick={() => setPreviewTemplate(null)}
            >
              Закрыть
            </Button>
            <Button
              variant="outline"
              className="rounded-xl"
              onClick={() => {
                if (previewTemplate) {
                  setEditingTemplate(previewTemplate);
                  setEditedText(previewTemplate.text);
                  setPreviewTemplate(null);
                }
              }}
            >
              <Pencil className="w-4 h-4 mr-2" />
              Редактировать
            </Button>
            <Button
              className="rounded-xl"
              onClick={() => {
                if (previewTemplate) {
                  navigator.clipboard.writeText(previewTemplate.text);
                  toast.success(`Шаблон "${previewTemplate.name}" скопирован`);
                }
              }}
            >
              <Copy className="w-4 h-4 mr-2" />
              Скопировать текст
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Template Edit Dialog */}
      <Dialog open={!!editingTemplate} onOpenChange={open => !open && setEditingTemplate(null)}>
        <DialogContent className="rounded-2xl max-w-lg">
          <DialogHeader>
            <DialogTitle>Редактировать: {editingTemplate?.name}</DialogTitle>
          </DialogHeader>
          {editingTemplate && (
            <div className="space-y-4">
              <Badge variant="secondary" className="text-sm">
                Периодичность: {editingTemplate.periodMonths} мес.
              </Badge>
              <Textarea
                value={editedText}
                onChange={e => setEditedText(e.target.value)}
                className="rounded-xl min-h-[200px] text-sm"
              />
            </div>
          )}
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              className="rounded-xl"
              onClick={() => setEditingTemplate(null)}
            >
              Отмена
            </Button>
            <Button
              className="rounded-xl"
              onClick={() => {
                navigator.clipboard.writeText(editedText);
                toast.success("Отредактированный текст скопирован");
                setEditingTemplate(null);
              }}
            >
              <Copy className="w-4 h-4 mr-2" />
              Скопировать
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
