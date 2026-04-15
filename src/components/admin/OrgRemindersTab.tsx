import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import { Bell, Plus, Trash2, Calendar, Mail, CheckCircle2, Send } from "lucide-react";
import { format, isPast, isToday } from "date-fns";
import { ru } from "date-fns/locale";
import { useAuth } from "@/hooks/useAuth";
import { SigmaSpinner } from "@/components/ui/SigmaSpinner";

interface Reminder {
  id: string;
  title: string;
  description: string | null;
  reminder_date: string;
  send_email: boolean;
  is_completed: boolean;
  created_at: string;
  telegram_chat_id: string | null;
}

interface OrgRemindersTabProps {
  organizationId: string;
}

export function OrgRemindersTab({ organizationId }: OrgRemindersTabProps) {
  const { user } = useAuth();
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [loading, setLoading] = useState(true);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState({
    title: "",
    description: "",
    reminder_date: "",
    send_email: true,
    telegram_chat_id: "" });

  useEffect(() => {
    fetchReminders();
  }, [organizationId]);

  const fetchReminders = async () => {
    try {
      const { data, error } = await supabase
        .from("organization_reminders")
        .select("*")
        .eq("organization_id", organizationId)
        .order("reminder_date", { ascending: true });

      if (error) throw error;
      setReminders(data || []);
    } catch (error) {
      console.error("Error fetching reminders:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async () => {
    if (!formData.title.trim() || !formData.reminder_date) {
      toast.error("Заполните обязательные поля");
      return;
    }

    setSaving(true);
    try {
      const { error } = await supabase
        .from("organization_reminders")
        .insert({
          organization_id: organizationId,
          title: formData.title.trim(),
          description: formData.description.trim() || null,
          reminder_date: formData.reminder_date,
          send_email: formData.send_email,
          telegram_chat_id: formData.telegram_chat_id.trim() || null,
          created_by: user?.id });

      if (error) throw error;

      toast.success("Напоминание создано");
      setFormData({ title: "", description: "", reminder_date: "", send_email: true, telegram_chat_id: "" });
      setIsCreateOpen(false);
      fetchReminders();
    } catch (error) {
      console.error("Error creating reminder:", error);
      toast.error("Ошибка создания напоминания");
    } finally {
      setSaving(false);
    }
  };

  const handleToggleComplete = async (reminder: Reminder) => {
    try {
      const { error } = await supabase
        .from("organization_reminders")
        .update({ is_completed: !reminder.is_completed })
        .eq("id", reminder.id);

      if (error) throw error;

      fetchReminders();
    } catch (error) {
      console.error("Error updating reminder:", error);
      toast.error("Ошибка обновления");
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Удалить напоминание?")) return;

    try {
      const { error } = await supabase
        .from("organization_reminders")
        .delete()
        .eq("id", id);

      if (error) throw error;

      toast.success("Напоминание удалено");
      fetchReminders();
    } catch (error) {
      console.error("Error deleting reminder:", error);
      toast.error("Ошибка удаления напоминания");
    }
  };

  const getStatusBadge = (reminder: Reminder) => {
    if (reminder.is_completed) {
      return <Badge variant="default" className="bg-green-500">Выполнено</Badge>;
    }
    const date = new Date(reminder.reminder_date);
    if (isPast(date) && !isToday(date)) {
      return <Badge variant="destructive">Просрочено</Badge>;
    }
    if (isToday(date)) {
      return <Badge variant="secondary" className="bg-yellow-500/20 text-yellow-600">Сегодня</Badge>;
    }
    return <Badge variant="outline">Запланировано</Badge>;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <SigmaSpinner size="lg" />
      </div>
    );
  }

  const activeReminders = reminders.filter(r => !r.is_completed);
  const completedReminders = reminders.filter(r => r.is_completed);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Bell className="w-5 h-5 text-primary" />
          <span className="font-medium">
            {activeReminders.length} активных напоминаний
          </span>
        </div>
        <Button onClick={() => setIsCreateOpen(true)} className="btn-gradient">
          <Plus className="w-4 h-4 mr-2" />
          Добавить
        </Button>
      </div>

      {/* Active Reminders */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Активные напоминания</CardTitle>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-[300px]">
            <div className="space-y-3">
              {activeReminders.map((reminder) => (
                <div
                  key={reminder.id}
                  className="flex items-start gap-3 p-3 bg-muted/50 rounded-lg"
                >
                  <Checkbox
                    checked={reminder.is_completed}
                    onCheckedChange={() => handleToggleComplete(reminder)}
                    className="mt-1"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-medium">{reminder.title}</p>
                      {getStatusBadge(reminder)}
                      {reminder.send_email && (
                        <span title="Email уведомление">
                          <Mail className="w-3 h-3 text-muted-foreground" />
                        </span>
                      )}
                      {reminder.telegram_chat_id && (
                        <span title="Telegram уведомление">
                          <Send className="w-3 h-3 text-blue-500" />
                        </span>
                      )}
                    </div>
                    {reminder.description && (
                      <p className="text-sm text-muted-foreground mt-1">
                        {reminder.description}
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      {format(new Date(reminder.reminder_date), "d MMMM yyyy", { locale: ru })}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-destructive shrink-0"
                    onClick={() => handleDelete(reminder.id)}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              ))}
              {activeReminders.length === 0 && (
                <p className="text-center text-muted-foreground py-8">
                  Нет активных напоминаний
                </p>
              )}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>

      {/* Completed Reminders */}
      {completedReminders.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-green-500" />
              Выполненные ({completedReminders.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[200px]">
              <div className="space-y-2">
                {completedReminders.map((reminder) => (
                  <div
                    key={reminder.id}
                    className="flex items-center gap-3 p-3 bg-muted/30 rounded-lg opacity-60"
                  >
                    <Checkbox
                      checked={reminder.is_completed}
                      onCheckedChange={() => handleToggleComplete(reminder)}
                    />
                    <div className="flex-1">
                      <p className="line-through">{reminder.title}</p>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-destructive"
                      onClick={() => handleDelete(reminder.id)}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      )}

      {/* Create Dialog */}
      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Новое напоминание</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-4">
            <div className="space-y-2">
              <Label>Заголовок *</Label>
              <Input
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                placeholder="Напомнить о..."
              />
            </div>
            <div className="space-y-2">
              <Label>Описание</Label>
              <Textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Дополнительная информация..."
                rows={3}
              />
            </div>
            <div className="space-y-2">
              <Label>Дата напоминания *</Label>
              <Input
                type="date"
                value={formData.reminder_date}
                onChange={(e) => setFormData({ ...formData, reminder_date: e.target.value })}
              />
            </div>
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <Label>Отправить на email</Label>
                <p className="text-sm text-muted-foreground">
                  Отправить уведомление на email организации
                </p>
              </div>
              <Switch
                checked={formData.send_email}
                onCheckedChange={(checked) => setFormData({ ...formData, send_email: checked })}
              />
            </div>
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <Send className="w-4 h-4 text-blue-500" />
                Telegram Chat ID
              </Label>
              <Input
                value={formData.telegram_chat_id}
                onChange={(e) => setFormData({ ...formData, telegram_chat_id: e.target.value })}
                placeholder="Например: 123456789"
              />
              <p className="text-xs text-muted-foreground">
                Получите ID через @userinfobot в Telegram
              </p>
            </div>
            <Button onClick={handleCreate} disabled={saving} className="w-full">
              {saving ? <SigmaSpinner size="sm" className="mr-2" /> : <Plus className="w-4 h-4 mr-2" />}
              Создать напоминание
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
