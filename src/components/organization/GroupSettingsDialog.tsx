import React, { useState, useEffect, useMemo, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { AlertTriangle, CalendarDays, HelpCircle, Trash2, Settings, BookOpen, Eye, MessageCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { SigmaSpinner } from "@/components/ui/SigmaSpinner";
import {
  buildGroupSettingsPatch,
  canonicalCourseHours,
  collectTrainingDates,
  programHoursMismatch,
  suggestTrainingDates,
  verifySavedSettings,
} from "@/lib/groups/groupSettings";


interface GroupSettings {
  id: string;
  name: string;
  color: string | null;
  start_date: string | null;
  end_date: string | null;
  group_number: string | null;
  program_title: string | null;
  program_hours: number | null;
  program_form: string | null;
  default_price: number | null;
  training_address: string | null;
  schedule_text: string | null;
  instructor_name: string | null;
  training_dates: string[];
  course_id: string | null;
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

interface CourseOption {
  id: string;
  title: string;
  duration: number | null;
  frdo_duration_hours: number | null;
  training_form: string | null;
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
  const [courses, setCourses] = useState<CourseOption[]>([]);
  const trainingDateRefs = useRef<Array<HTMLInputElement | null>>([]);
  const loadSequenceRef = useRef(0);
  const saveSequenceRef = useRef(0);
  const loadedGroupIdentityRef = useRef<string | null>(null);
  const groupIdentity = `${organizationId}:${groupId}`;
  const activeGroupIdentityRef = useRef(groupIdentity);
  // Update during render, before effects run. This closes the short window in
  // which groupId=B is rendered while state loaded for A is still visible.
  activeGroupIdentityRef.current = groupIdentity;

  const linkedCourse = useMemo(
    () => courses.find(course => course.id === settings?.course_id) ?? null,
    [courses, settings?.course_id],
  );
  const linkedCourseHours = canonicalCourseHours(linkedCourse);
  const hasHoursMismatch = programHoursMismatch(settings?.program_hours, linkedCourse);

  useEffect(() => {
    const requestSequence = ++loadSequenceRef.current;
    saveSequenceRef.current += 1;
    loadedGroupIdentityRef.current = null;
    setSettings(null);
    setCourses([]);
    setSeatLimitEnabled(false);
    setSaving(false);

    if (!open || !groupId || !organizationId) {
      setLoading(false);
      return;
    }

    let cancelled = false;
    const requestedIdentity = `${organizationId}:${groupId}`;
    const isCurrentRequest = () => (
      !cancelled
      && loadSequenceRef.current === requestSequence
      && activeGroupIdentityRef.current === requestedIdentity
    );

    setActiveTab("general");
    setLoading(true);

    void (async () => {
      try {
        const { data, error } = await supabase
          .from("student_groups")
          .select("*")
          .eq("id", groupId)
          .eq("organization_id", organizationId)
          .single();
        if (!isCurrentRequest()) return;
        if (error) throw error;
        const nextSettings = data as any as GroupSettings;
        loadedGroupIdentityRef.current = requestedIdentity;
        setSettings(nextSettings);
        setSeatLimitEnabled(nextSettings.max_seats !== null && nextSettings.max_seats > 0);
      } catch {
        if (isCurrentRequest()) toast.error("Ошибка загрузки настроек группы");
      } finally {
        if (isCurrentRequest()) setLoading(false);
      }
    })();

    void (async () => {
      const { data, error } = await supabase
        .from("courses")
        .select("id, title, duration, frdo_duration_hours, training_form")
        .eq("organization_id", organizationId)
        .order("title");
      if (!isCurrentRequest()) return;
      if (error) {
        console.error("[GroupSettings] courses load failed", error);
        return;
      }
      setCourses((data || []) as any as CourseOption[]);
    })();

    return () => {
      cancelled = true;
      if (loadSequenceRef.current === requestSequence) {
        loadSequenceRef.current += 1;
      }
    };
  }, [open, groupId, organizationId]);

  /** Курс является мастер-источником программы/часов/формы при новой привязке. */
  const applyCourse = (courseId: string | null) => {
    const course = courses.find(c => c.id === courseId);
    setSettings(prev => {
      if (!prev) return prev;
      if (!course) return { ...prev, course_id: null };
      return {
        ...prev,
        course_id: course.id,
        program_title: course.title || null,
        program_hours: canonicalCourseHours(course),
        program_form: course.training_form || null,
      };
    });
  };

  const handleSave = async () => {
    if (!settings) return;
    if (loadedGroupIdentityRef.current !== groupIdentity) {
      toast.error("Дождитесь загрузки настроек выбранной группы");
      return;
    }
    if (!settings.name.trim()) {
      toast.error("Укажите название группы");
      return;
    }
    const saveSequence = ++saveSequenceRef.current;
    const saveIdentity = groupIdentity;
    const saveGroupId = groupId;
    const saveOrganizationId = organizationId;
    const isCurrentSave = () => (
      saveSequenceRef.current === saveSequence
      && activeGroupIdentityRef.current === saveIdentity
      && loadedGroupIdentityRef.current === saveIdentity
    );
    setSaving(true);
    const visibleTrainingDates = Array.from({ length: 4 }, (_, index) => trainingDateRefs.current[index]?.value);
    const settingsForSave = {
      ...settings,
      training_dates: collectTrainingDates(visibleTrainingDates, settings.training_dates),
    };
    const patch = buildGroupSettingsPatch(settingsForSave as any, seatLimitEnabled);
    try {
      // Сохранение через серверную функцию: она сама проверяет права и
      // возвращает обновлённую строку, поэтому «тихий» отказ RLS невозможен.
      const { data, error } = await (supabase as any).rpc("update_student_group_settings", {
        p_group_id: saveGroupId,
        p_patch: patch,
      });
      if (!isCurrentSave()) return;
      if (error) {
        console.error("[GroupSettings] save failed", { groupId: saveGroupId, organizationId: saveOrganizationId, patch, error });
        toast.error("Не удалось сохранить настройки", {
          description:
            error.message?.includes("access_denied")
              ? "Нет прав на изменение этой группы."
              : error.message || undefined,
        });
        return;
      }
      const saved = Array.isArray(data) ? data[0] : data;
      if (!saved) {
        console.error("[GroupSettings] save returned no row", { groupId: saveGroupId, patch });
        toast.error("Не удалось сохранить настройки", { description: "Группа не найдена. Обновите страницу." });
        return;
      }
      const notPersisted = verifySavedSettings(patch, saved as any);
      if (notPersisted.length > 0) {
        console.error("[GroupSettings] fields not persisted", { groupId: saveGroupId, notPersisted, patch, saved });
        toast.error("Часть полей не сохранилась", { description: notPersisted.join(", ") });
        return;
      }
      // Контрольное перечитывание строки из БД: закрываем диалог только если
      // значения реально лежат в таблице (защита от «тихого» откате апдейта).
      const { data: fresh, error: refetchError } = await supabase
        .from("student_groups")
        .select("*")
        .eq("id", saveGroupId)
        .eq("organization_id", saveOrganizationId)
        .maybeSingle();
      if (!isCurrentSave()) return;
      if (refetchError || !fresh) {
        console.error("[GroupSettings] refetch after save failed", { groupId: saveGroupId, refetchError });
        toast.error("Не удалось перечитать настройки", { description: refetchError?.message || "Обновите страницу." });
        return;
      }
      const stillMissing = verifySavedSettings(patch, fresh as any);
      if (stillMissing.length > 0) {
        console.error("[GroupSettings] fields missing after refetch", { groupId: saveGroupId, stillMissing, patch, fresh });
        toast.error("Часть полей не сохранилась", { description: stillMissing.join(", ") });
        return;
      }
      setSettings(fresh as any as GroupSettings);
      setSeatLimitEnabled(!!(fresh as any).max_seats && (fresh as any).max_seats > 0);
      toast.success("Настройки сохранены");
      onUpdated?.();
      onOpenChange(false);

    } catch (e: any) {
      if (isCurrentSave()) {
        console.error("[GroupSettings] save exception", { groupId: saveGroupId, patch, e });
        toast.error("Ошибка сохранения", { description: e?.message || undefined });
      }
    } finally {
      if (saveSequenceRef.current === saveSequence) setSaving(false);
    }
  };



  const handleDelete = async () => {
    if (!confirm("Удалить группу? Ученики останутся без группы.")) return;
    try {
      const { error } = await supabase
        .from("student_groups")
        .delete()
        .eq("id", groupId)
        .eq("organization_id", organizationId);
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
        <DialogContent className="max-w-2xl max-h-[calc(100vh-2rem)] overflow-hidden p-0 gap-0">
          <DialogHeader className="shrink-0 border-b border-border p-6 py-4">
            <DialogTitle>Настройки группы</DialogTitle>
          </DialogHeader>

          {loading || !settings ? (
            <div className="flex items-center justify-center py-16">
              <SigmaSpinner />
            </div>
          ) : (
            <div className="flex min-h-0 max-h-[calc(100vh-6.5rem)] flex-col sm:flex-row">
              {/* Sidebar tabs */}
              <div className="flex w-full shrink-0 gap-1 overflow-x-auto border-b border-border p-3 sm:block sm:w-48 sm:space-y-1 sm:overflow-y-auto sm:border-b-0 sm:border-r">
                {tabs.map(tab => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={cn(
                      "flex w-auto shrink-0 items-center gap-2 whitespace-nowrap rounded-lg px-3 py-2 text-left text-sm font-medium transition-colors sm:w-full",
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
              <div className="flex min-h-0 min-w-0 flex-1 flex-col">
                <div className="flex-1 space-y-5 overflow-y-auto p-6">
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

                      {/* Данные программы — используются при генерации документов группы */}
                      <div className="rounded-xl border border-border p-4 space-y-3">
                        <div>
                          <div className="text-sm font-medium">Данные для документов группы</div>
                          <div className="text-xs text-muted-foreground">Подставляются в договоры, приказы, журналы и ведомости</div>
                        </div>
                        <div>
                          <label className="text-sm font-medium mb-1.5 block">Курс (программа) группы</label>
                          <select
                            value={settings.course_id || ""}
                            onChange={e => applyCourse(e.target.value || null)}
                            className="w-full h-10 rounded-lg border border-input bg-background px-3 text-sm"
                          >
                            <option value="">Не выбран</option>
                            {courses.map(c => (
                              <option key={c.id} value={c.id}>{c.title}</option>
                            ))}
                          </select>
                          <p className="text-xs text-muted-foreground mt-1">
                            Используется в документах группы: название программы, объём часов и форма обучения подтягиваются автоматически.
                          </p>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">

                          <div>
                            <label className="text-sm font-medium mb-1.5 block">Номер группы</label>
                            <Input
                              value={settings.group_number || ""}
                              onChange={e => update({ group_number: e.target.value || null })}
                              placeholder="УЦ-4/2026"
                              className="rounded-lg"
                            />
                          </div>
                          <div>
                            <label className="text-sm font-medium mb-1.5 block">Объём программы, часов</label>
                            <Input
                              type="number"
                              min={0}
                              value={settings.program_hours ?? ""}
                              onChange={e => update({ program_hours: e.target.value ? Number(e.target.value) : null })}
                              placeholder="72"
                              className="rounded-lg"
                            />
                            {linkedCourseHours && (
                              <p className={cn("mt-1 text-xs", hasHoursMismatch ? "text-destructive" : "text-muted-foreground")}>
                                В курсе указано: {linkedCourseHours} ч.
                              </p>
                            )}
                          </div>
                          {hasHoursMismatch && (
                            <div className="sm:col-span-2 flex items-start justify-between gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-3">
                              <div className="flex items-start gap-2 text-sm text-destructive">
                                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                                <span>Часы группы не совпадают с курсом. До синхронизации выпуск документов будет заблокирован.</span>
                              </div>
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                className="shrink-0 rounded-lg"
                                onClick={() => update({ program_hours: linkedCourseHours })}
                              >
                                Взять {linkedCourseHours} ч.
                              </Button>
                            </div>
                          )}
                          <div className="sm:col-span-2">
                            <label className="text-sm font-medium mb-1.5 block">Название программы</label>
                            <Input
                              value={settings.program_title || ""}
                              onChange={e => update({ program_title: e.target.value || null })}
                              placeholder="Охрана труда для руководителей и специалистов"
                              className="rounded-lg"
                            />
                          </div>
                          <div>
                            <label className="text-sm font-medium mb-1.5 block">Форма обучения</label>
                            <Input
                              value={settings.program_form || ""}
                              onChange={e => update({ program_form: e.target.value || null })}
                              placeholder="Очно-заочная с применением ДОТ"
                              className="rounded-lg"
                            />
                          </div>
                          <div className="sm:col-span-2">
                            <label className="text-sm font-medium mb-1.5 block">Место обучения (адрес)</label>
                            <Input
                              value={settings.training_address || ""}
                              onChange={e => update({ training_address: e.target.value || null })}
                              placeholder="г. Москва, ул. Примерная, д. 1"
                              className="rounded-lg"
                            />
                            <p className="text-xs text-muted-foreground mt-1">Подставляется в договоры как место оказания услуг.</p>
                          </div>
                          <div className="sm:col-span-2">
                            <label className="text-sm font-medium mb-1.5 block">Режим занятий</label>
                            <Input
                              value={settings.schedule_text || ""}
                              onChange={e => update({ schedule_text: e.target.value || null })}
                              placeholder="Пн–Пт, 10:00–17:00, 8 часов в день"
                              className="rounded-lg"
                            />
                          </div>
                          <div className="sm:col-span-2">
                            <label className="text-sm font-medium mb-1.5 block">Преподаватель</label>
                            <Input
                              value={settings.instructor_name || ""}
                              onChange={e => update({ instructor_name: e.target.value || null })}
                              placeholder="Дроздов Дмитрий Викторович"
                              className="rounded-lg"
                            />
                            <p className="text-xs text-muted-foreground mt-1">
                              Подставляется в журнал. Руководитель учебного центра не используется как замена.
                            </p>
                          </div>
                          <div className="sm:col-span-2">
                            <div className="mb-1.5 flex items-center justify-between gap-3">
                              <label className="text-sm font-medium">Даты занятий для журнала</label>
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                className="h-8 rounded-lg gap-1.5"
                                disabled={!settings.start_date || !settings.end_date}
                                onClick={() => {
                                  const dates = suggestTrainingDates(settings.start_date, settings.end_date);
                                  update({ training_dates: dates });
                                }}
                              >
                                <CalendarDays className="h-3.5 w-3.5" />
                                Заполнить из периода
                              </Button>
                            </div>
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                              {Array.from({ length: 4 }, (_, index) => (
                                <Input
                                  key={index}
                                  ref={element => { trainingDateRefs.current[index] = element; }}
                                  type="date"
                                  aria-label={`Дата занятий ${index + 1}`}
                                  value={settings.training_dates?.[index] || ""}
                                  onChange={e => {
                                    const dates = Array.from({ length: 4 }, (_, i) => settings.training_dates?.[i] || "");
                                    dates[index] = e.target.value;
                                    // Keep the four visible slots stable while the manager is editing.
                                    // The RPC removes blanks and sorts the final date[] on save.
                                    update({ training_dates: dates });
                                  }}
                                  className="rounded-lg"
                                />
                              ))}
                            </div>
                            <p className="text-xs text-muted-foreground mt-1">
                              В форме клиента четыре колонки: для итогового Word-журнала нужно заполнить все четыре.
                            </p>
                          </div>
                          <div>
                            <label className="text-sm font-medium mb-1.5 block">Стоимость обучения, ₽</label>
                            <Input
                              type="number"
                              min={0}
                              value={settings.default_price ?? ""}
                              onChange={e => update({ default_price: e.target.value ? Number(e.target.value) : null })}
                              placeholder="0"
                              className="rounded-lg"
                            />
                          </div>
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

                <div className="flex shrink-0 justify-end border-t border-border bg-background p-4">
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
