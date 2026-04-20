import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { CalendarClock, ChevronDown, Plus, Trash2, Users, X } from "lucide-react";
import { format } from "date-fns";
import { ru } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { useModuleAccessManager } from "@/hooks/useModuleAccess";
import { ModuleAccessStudentPicker, type PickerStudent } from "./ModuleAccessStudentPicker";

interface CourseStudent {
  id?: string;
  user_id?: string;
  name?: string;
  full_name?: string;
  email?: string;
}

interface Props {
  courseId: string;
  courseStudents: CourseStudent[];
}

interface ModuleRow {
  id: string;
  title: string;
  order_index: number;
}

export function ModuleAccessSchedule({ courseId, courseStudents }: Props) {
  const [modules, setModules] = useState<ModuleRow[]>([]);
  const [modulesLoading, setModulesLoading] = useState(true);
  const [pickerModule, setPickerModule] = useState<ModuleRow | null>(null);
  const [datePickerOpen, setDatePickerOpen] = useState<string | null>(null);
  const [confirmReset, setConfirmReset] = useState<ModuleRow | null>(null);

  const moduleIds = useMemo(() => modules.map(m => m.id), [modules]);

  const {
    schedules, overrides, saving,
    setModuleSchedule, upsertOverrides, removeOverride,
  } = useModuleAccessManager(courseId, moduleIds);

  useEffect(() => {
    let cancel = false;
    (async () => {
      setModulesLoading(true);
      const { data, error } = await supabase
        .from("course_modules")
        .select("id, title, order_index")
        .eq("course_id", courseId)
        .order("order_index", { ascending: true });
      if (cancel) return;
      if (error) {
        console.error(error);
        setModules([]);
      } else {
        setModules((data || []) as ModuleRow[]);
      }
      setModulesLoading(false);
    })();
    return () => { cancel = true; };
  }, [courseId]);

  const studentsForPicker: PickerStudent[] = useMemo(() => {
    return courseStudents
      .map(s => ({
        user_id: (s.user_id || s.id || "") as string,
        name: (s.full_name || s.name || s.email || "Без имени") as string,
        email: s.email,
      }))
      .filter(s => !!s.user_id);
  }, [courseStudents]);

  const studentNameById = useMemo(() => {
    const m = new Map<string, string>();
    studentsForPicker.forEach(s => m.set(s.user_id, s.name));
    return m;
  }, [studentsForPicker]);

  const scheduleByModule = useMemo(() => {
    const m = new Map<string, typeof schedules[number]>();
    schedules.forEach(s => m.set(s.module_id, s));
    return m;
  }, [schedules]);

  const overridesByModule = useMemo(() => {
    const m = new Map<string, typeof overrides>();
    for (const o of overrides) {
      if (!m.has(o.module_id)) m.set(o.module_id, []);
      m.get(o.module_id)!.push(o);
    }
    return m;
  }, [overrides]);

  if (modulesLoading) {
    return (
      <div className="bg-secondary/30 rounded-xl p-4 text-sm text-muted-foreground">
        Загрузка модулей...
      </div>
    );
  }

  if (modules.length === 0) {
    return (
      <div className="bg-secondary/30 rounded-xl p-4 text-sm text-muted-foreground">
        В этом курсе пока нет модулей. Создайте модули в редакторе курса, чтобы настроить даты их открытия.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3">
        <div className="p-2 rounded-lg bg-violet-500/10 mt-0.5 shrink-0">
          <CalendarClock className="w-5 h-5 text-violet-500" />
        </div>
        <div>
          <div className="text-sm font-medium">Расписание открытия модулей</div>
          <p className="text-xs text-muted-foreground mt-1">
            Задайте дату, с которой модуль (и все его уроки) станут доступны ученикам.
            По умолчанию все модули открыты сразу. Можно переопределить дату для отдельных учеников.
          </p>
        </div>
      </div>

      <div className="space-y-3">
        {modules.map(m => {
          const schedule = scheduleByModule.get(m.id);
          const mods = overridesByModule.get(m.id) || [];
          return (
            <div key={m.id} className="bg-background border border-border rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="font-medium text-sm">
                  Модуль {m.order_index + 1}: {m.title || "Без названия"}
                </div>
                <div className="flex items-center gap-2">
                  <Popover open={datePickerOpen === m.id} onOpenChange={(o) => setDatePickerOpen(o ? m.id : null)}>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        size="sm"
                        className={cn("rounded-lg gap-2", !schedule && "text-muted-foreground")}
                        disabled={saving}
                      >
                        <CalendarClock className="w-4 h-4" />
                        {schedule
                          ? `Откроется ${format(new Date(schedule.unlock_at), "dd.MM.yyyy", { locale: ru })}`
                          : "Открыт сразу"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="end">
                      <Calendar
                        mode="single"
                        selected={schedule ? new Date(schedule.unlock_at) : undefined}
                        onSelect={async (d) => {
                          if (!d) return;
                          await setModuleSchedule(m.id, d);
                          setDatePickerOpen(null);
                        }}
                        initialFocus
                        className={cn("p-3 pointer-events-auto")}
                      />
                    </PopoverContent>
                  </Popover>
                  {schedule && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setConfirmReset(m)}
                      className="rounded-lg text-muted-foreground hover:text-destructive"
                      disabled={saving}
                    >
                      Сбросить
                    </Button>
                  )}
                </div>
              </div>

              <Collapsible>
                <CollapsibleTrigger asChild>
                  <button className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors">
                    <Users className="w-3.5 h-3.5" />
                    Индивидуально для {mods.length} учеников
                    <ChevronDown className="w-3.5 h-3.5" />
                  </button>
                </CollapsibleTrigger>
                <CollapsibleContent className="pt-3 space-y-2">
                  {mods.length > 0 && (
                    <div className="space-y-1">
                      {mods.map(o => (
                        <div key={o.id} className="flex items-center justify-between gap-2 text-sm bg-muted/50 rounded-lg px-3 py-2">
                          <div className="min-w-0 truncate">
                            <span className="font-medium">{studentNameById.get(o.user_id) || o.user_id.slice(0, 8)}</span>
                            <span className="text-muted-foreground ml-2">
                              {o.unlock_at
                                ? `→ ${format(new Date(o.unlock_at), "dd.MM.yyyy", { locale: ru })}`
                                : "→ открыт сразу"}
                            </span>
                          </div>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => removeOverride(o.id)}
                            disabled={saving}
                            className="h-7 w-7 text-muted-foreground hover:text-destructive"
                          >
                            <X className="w-4 h-4" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPickerModule(m)}
                    className="rounded-lg gap-2"
                    disabled={saving}
                  >
                    <Plus className="w-4 h-4" />
                    Добавить учеников
                  </Button>
                </CollapsibleContent>
              </Collapsible>
            </div>
          );
        })}
      </div>

      {pickerModule && (
        <ModuleAccessStudentPicker
          open={!!pickerModule}
          onOpenChange={(o) => { if (!o) setPickerModule(null); }}
          students={studentsForPicker}
          excludeUserIds={(overridesByModule.get(pickerModule.id) || []).map(o => o.user_id)}
          moduleTitle={pickerModule.title || "Без названия"}
          onConfirm={(userIds, unlockAt) => upsertOverrides(pickerModule.id, userIds, unlockAt)}
        />
      )}

      <AlertDialog open={!!confirmReset} onOpenChange={(o) => !o && setConfirmReset(null)}>
        <AlertDialogContent className="rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Сбросить дату открытия?</AlertDialogTitle>
            <AlertDialogDescription>
              Модуль «{confirmReset?.title}» снова станет открыт сразу всем зачисленным.
              Индивидуальные переопределения сохранятся.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-xl">Отмена</AlertDialogCancel>
            <AlertDialogAction
              className="rounded-xl"
              onClick={async () => {
                if (confirmReset) await setModuleSchedule(confirmReset.id, null);
                setConfirmReset(null);
              }}
            >
              <Trash2 className="w-4 h-4 mr-2" />
              Сбросить
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
