import React, { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { HelpCircle, Trash2, Settings, BookOpen, Eye, MessageCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { SigmaSpinner } from "@/components/ui/SigmaSpinner";

interface GroupSettings {
  id: string;
  name: string;
  color: string | null;
  start_date: string | null;
  end_date: string | null;
  max_seats: number | null;
  curator_id: string | null;
  strict_order: boolean;
  limit_access_time: boolean;
  schedule_access: boolean;
  block_resubmit: boolean;
  show_locked_lessons: boolean;
  enable_channel: boolean;
  enable_group_chat: boolean;
  block_student_dialogs: boolean;
}

interface GroupSettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  groupId: string;
  organizationId: string;
  onDeleted?: () => void;
  onUpdated?: () => void;
}

const tabs = [
  { id: "general", label: "Общие", icon: Settings },
  { id: "learning", label: "Обучение", icon: BookOpen },
  { id: "access", label: "Доступ", icon: Eye },
  { id: "chat", label: "Чат", icon: MessageCircle },
] as const;

type TabId = typeof tabs[number]["id"];

function HelpTip({ text }: { text: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <HelpCircle className="w-4 h-4 text-muted-foreground cursor-help shrink-0" />
      </TooltipTrigger>
      <TooltipContent side="right" className="max-w-[250px]">
        <p className="text-xs">{text}</p>
      </TooltipContent>
    </Tooltip>
  );
}

function SettingRow({ label, help, checked, onCheckedChange, children }: {
  label: string;
  help: string;
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
  children?: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-sm font-medium">{label}</span>
          <HelpTip text={help} />
        </div>
        <Switch checked={checked} onCheckedChange={onCheckedChange} />
      </div>
      {checked && children && <div className="pl-1">{children}</div>}
    </div>
  );
}

export function GroupSettingsDialog({ open, onOpenChange, groupId, organizationId, onDeleted, onUpdated }: GroupSettingsDialogProps) {
  const [activeTab, setActiveTab] = useState<TabId>("general");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState<GroupSettings | null>(null);
  const [seatLimitEnabled, setSeatLimitEnabled] = useState(false);

  useEffect(() => {
    if (!open || !groupId) return;
    setActiveTab("general");
    loadSettings();
  }, [open, groupId]);

  const loadSettings = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("student_groups")
        .select("*")
        .eq("id", groupId)
        .single();
      if (error) throw error;
      const s = data as any as GroupSettings;
      setSettings(s);
      setSeatLimitEnabled(s.max_seats !== null && s.max_seats > 0);
    } catch {
      toast.error("Ошибка загрузки настроек группы");
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!settings) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from("student_groups")
        .update({
          name: settings.name,
          color: settings.color,
          start_date: settings.start_date,
          end_date: settings.end_date,
          max_seats: seatLimitEnabled ? (settings.max_seats || 30) : null,
          strict_order: settings.strict_order,
          limit_access_time: settings.limit_access_time,
          schedule_access: settings.schedule_access,
          block_resubmit: settings.block_resubmit,
          show_locked_lessons: settings.show_locked_lessons,
          enable_channel: settings.enable_channel,
          enable_group_chat: settings.enable_group_chat,
          block_student_dialogs: settings.block_student_dialogs } as any)
        .eq("id", groupId);
      if (error) throw error;
      toast.success("Настройки сохранены");
      onUpdated?.();
      onOpenChange(false);
    } catch {
      toast.error("Ошибка сохранения");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm("Удалить группу? Ученики останутся без группы.")) return;
    try {
      const { error } = await supabase.from("student_groups").delete().eq("id", groupId);
      if (error) throw error;
      toast.success("Группа удалена");
      onDeleted?.();
      onOpenChange(false);
    } catch {
      toast.error("Ошибка удаления группы");
    }
  };

  const update = (patch: Partial<GroupSettings>) => {
    setSettings(prev => prev ? { ...prev, ...patch } : prev);
  };

  if (!open) return null;

  return (
    <TooltipProvider delayDuration={200}>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl p-0 gap-0">
          <DialogHeader className="p-6 pb-0">
            <DialogTitle>Настройки группы</DialogTitle>
          </DialogHeader>

          {loading || !settings ? (
            <div className="flex items-center justify-center py-16">
              <SigmaSpinner />
            </div>
          ) : (
            <div className="flex min-h-[400px]">
              {/* Sidebar tabs */}
              <div className="w-48 border-r border-border p-3 space-y-1 shrink-0">
                {tabs.map(tab => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={cn(
                      "w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors text-left",
                      activeTab === tab.id
                        ? "bg-primary/10 text-primary"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground"
                    )}
                  >
                    <tab.icon className="w-4 h-4" />
                    {tab.label}
                  </button>
                ))}
              </div>

              {/* Content */}
              <div className="flex-1 p-6 flex flex-col">
                <div className="flex-1 space-y-5">
                  {activeTab === "general" && (
                    <>
                      <div>
                        <label className="text-sm font-medium mb-1.5 block">Название группы</label>
                        <Input
                          value={settings.name}
                          onChange={e => update({ name: e.target.value })}
                          className="rounded-lg"
                        />
                      </div>
                      <div className="flex gap-4">
                        <div>
                          <label className="text-sm font-medium mb-1.5 block">Цвет</label>
                          <input
                            type="color"
                            value={settings.color || "#6366f1"}
                            onChange={e => update({ color: e.target.value })}
                            className="w-10 h-10 rounded border border-border cursor-pointer"
                          />
                        </div>
                        <div className="flex-1">
                          <label className="text-sm font-medium mb-1.5 block">Дата начала</label>
                          <Input
                            type="date"
                            value={settings.start_date || ""}
                            onChange={e => update({ start_date: e.target.value || null })}
                            className="rounded-lg"
                          />
                        </div>
                        <div className="flex-1">
                          <label className="text-sm font-medium mb-1.5 block">Дата окончания</label>
                          <Input
                            type="date"
                            value={settings.end_date || ""}
                            onChange={e => update({ end_date: e.target.value || null })}
                            className="rounded-lg"
                          />
                        </div>
                      </div>

                      <SettingRow
                        label="Ограничить кол-во мест"
                        help="Ограничьте максимальное количество учеников, которые могут быть добавлены в эту группу"
                        checked={seatLimitEnabled}
                        onCheckedChange={v => { setSeatLimitEnabled(v); if (v && !settings.max_seats) update({ max_seats: 30 }); }}
                      >
                        <Input
                          type="number"
                          min={1}
                          value={settings.max_seats || 30}
                          onChange={e => update({ max_seats: parseInt(e.target.value) || null })}
                          className="w-32 rounded-lg"
                          placeholder="Макс. мест"
                        />
                      </SettingRow>

                      <div className="pt-4 border-t border-border">
                        <Button
                          variant="destructive"
                          size="sm"
                          className="rounded-lg gap-2"
                          onClick={handleDelete}
                        >
                          <Trash2 className="w-4 h-4" />
                          Удалить группу
                        </Button>
                      </div>
                    </>
                  )}

                  {activeTab === "learning" && (
                    <>
                      <SettingRow
                        label="Ограничить время доступа к курсу"
                        help="Ограничьте доступ учеников к курсу по времени. После истечения срока доступ будет закрыт"
                        checked={settings.limit_access_time}
                        onCheckedChange={v => update({ limit_access_time: v })}
                      />
                      <SettingRow
                        label="Открывать доступы по расписанию"
                        help="Занятия будут открываться автоматически по указанному расписанию, а не сразу все"
                        checked={settings.schedule_access}
                        onCheckedChange={v => update({ schedule_access: v })}
                      />
                      <SettingRow
                        label="Строгая последовательность занятий"
                        help="Ученик сможет приступить к следующему занятию только после прохождения предыдущего"
                        checked={settings.strict_order}
                        onCheckedChange={v => update({ strict_order: v })}
                      />
                      <SettingRow
                        label="Заблокировать повторные ответы"
                        help="Ученики не смогут повторно отправлять ответы на задания после первой отправки"
                        checked={settings.block_resubmit}
                        onCheckedChange={v => update({ block_resubmit: v })}
                      />
                    </>
                  )}

                  {activeTab === "access" && (
                    <>
                      <SettingRow
                        label="Отображать недоступные занятия"
                        help="Ученики будут видеть заблокированные занятия в списке, но не смогут их открыть"
                        checked={settings.show_locked_lessons}
                        onCheckedChange={v => update({ show_locked_lessons: v })}
                      />
                      <div className="pt-3 border-t border-border">
                        <p className="text-sm text-muted-foreground">
                          Индивидуальная настройка доступа к занятиям будет доступна в следующих обновлениях.
                        </p>
                      </div>
                    </>
                  )}

                  {activeTab === "chat" && (
                    <>
                      <SettingRow
                        label="Канал в сообщениях"
                        help="Создать канал для односторонних уведомлений от организации для учеников этой группы"
                        checked={settings.enable_channel}
                        onCheckedChange={v => update({ enable_channel: v })}
                      />
                      <SettingRow
                        label="Групповой чат"
                        help="Создать общий чат, в котором ученики и сотрудники смогут общаться"
                        checked={settings.enable_group_chat}
                        onCheckedChange={v => update({ enable_group_chat: v })}
                      />
                      <SettingRow
                        label="Запретить новые диалоги"
                        help="Ученики не смогут начинать новые диалоги с сотрудниками организации"
                        checked={settings.block_student_dialogs}
                        onCheckedChange={v => update({ block_student_dialogs: v })}
                      />
                    </>
                  )}
                </div>

                <div className="pt-4 mt-4 border-t border-border flex justify-end">
                  <Button onClick={handleSave} disabled={saving} className="rounded-xl gap-2">
                    {saving && <SigmaSpinner size="sm" />}
                    Сохранить
                  </Button>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </TooltipProvider>
  );
}
