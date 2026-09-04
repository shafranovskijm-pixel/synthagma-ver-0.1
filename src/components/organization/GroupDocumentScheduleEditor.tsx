import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useStaffPermissions } from "@/hooks/useStaffPermissions";
import {
  expandGroupDocumentScheduleSlots,
  fetchGroupDocumentSchedule,
  GroupDocumentScheduleError,
  sameGroupDocumentScheduleSlots,
  saveGroupDocumentSchedule,
  type GroupDocumentScheduleContext,
  type GroupDocumentScheduleSlot,
} from "@/lib/groups/groupDocumentSchedule";

interface Props {
  organizationId: string;
  groupId: string;
  onDirtyChange?: (dirty: boolean) => void;
  onSavingChange?: (saving: boolean) => void;
}

function ScheduleEditorContent({ organizationId, groupId, onDirtyChange, onSavingChange, canWrite }: Props & { canWrite: boolean }) {
  const [context, setContext] = useState<GroupDocumentScheduleContext | null>(null);
  const [slots, setSlots] = useState(() => expandGroupDocumentScheduleSlots([]));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadRequired, setReloadRequired] = useState(false);
  const [confirmReload, setConfirmReload] = useState(false);
  const [reviewedCourseChange, setReviewedCourseChange] = useState(false);
  const activeRef = useRef(false);
  const requestRef = useRef(0);
  const busyRef = useRef(false);
  const courseChanged = Boolean(context?.schedule && context.schedule.course_id !== context.group.course_id);
  const baseline = expandGroupDocumentScheduleSlots(context?.schedule?.slots ?? []);
  const dirty = !sameGroupDocumentScheduleSlots(slots, baseline) || (courseChanged && reviewedCourseChange);

  useEffect(() => { onDirtyChange?.(dirty); }, [dirty, onDirtyChange]);
  useEffect(() => () => { onDirtyChange?.(false); }, [onDirtyChange]);
  useEffect(() => { onSavingChange?.(saving); }, [saving, onSavingChange]);
  useEffect(() => () => { onSavingChange?.(false); }, [onSavingChange]);

  const load = useCallback(async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    const request = ++requestRef.current;
    setLoading(true);
    setConfirmReload(false);
    setError(null);
    try {
      const fresh = await fetchGroupDocumentSchedule({ organizationId, groupId });
      if (!activeRef.current || requestRef.current !== request) return;
      setContext(fresh);
      setSlots(expandGroupDocumentScheduleSlots(fresh.schedule?.slots ?? []));
      setReviewedCourseChange(false);
      setReloadRequired(false);
    } catch (cause) {
      if (!activeRef.current || requestRef.current !== request) return;
      setError(cause instanceof GroupDocumentScheduleError ? cause.message : "Не удалось загрузить расписание. Повторите загрузку.");
      setReloadRequired(true);
    } finally {
      if (activeRef.current && requestRef.current === request) { busyRef.current = false; setLoading(false); }
    }
  }, [organizationId, groupId]);

  useEffect(() => {
    activeRef.current = true;
    void load();
    return () => { activeRef.current = false; requestRef.current += 1; busyRef.current = false; };
  }, [load]);

  const save = async () => {
    if (!context || busyRef.current || !canWrite || reloadRequired || !dirty || (courseChanged && !reviewedCourseChange)) return;
    busyRef.current = true;
    const request = ++requestRef.current;
    setSaving(true);
    setError(null);
    try {
      const fresh = await saveGroupDocumentSchedule({ organizationId, groupId, context, slots, reviewedCourseChange });
      if (!activeRef.current || requestRef.current !== request) return;
      setContext(fresh);
      setSlots(expandGroupDocumentScheduleSlots(fresh.schedule?.slots ?? []));
      setReviewedCourseChange(false);
      toast.success("Расписание сохранено и проверено в базе");
    } catch (cause) {
      if (!activeRef.current || requestRef.current !== request) return;
      setError(cause instanceof GroupDocumentScheduleError ? cause.message : "Сохранение не подтверждено. Обновите данные перед повторной попыткой.");
      setReloadRequired(!(cause instanceof GroupDocumentScheduleError) || cause.requiresReload);
    } finally {
      if (activeRef.current && requestRef.current === request) { busyRef.current = false; setSaving(false); }
    }
  };

  const updateSlot = (slot: number, patch: Partial<GroupDocumentScheduleSlot>) => {
    setSlots(current => current.map(entry => entry.slot === slot ? { ...entry, ...patch } : entry));
  };
  const busy = loading || saving;

  return (
    <section className="space-y-3 rounded-xl border p-4" aria-label="Расписание для документов группы">
      <h3 className="text-sm font-semibold">Данные для документов — расписание</h3>
      <p className="text-xs text-muted-foreground">
        Исходный Word-шаблон содержит четыре блока: дата, время и тема каждого блока. Это не четыре дня с неограниченным числом занятий.
        Часы и преподаватели для отдельных занятий здесь не поддерживаются.
      </p>
      <p className="text-xs text-muted-foreground">
        Расписание сохраняется отдельно и не меняет даты занятий или режим доступа к обучению.
        Если меняете курс или период группы, сначала сохраните настройки группы, затем откройте их снова и обновите расписание.
      </p>
      {context && <p className="text-xs text-muted-foreground">
        Сохранённый период группы: {context.group.start_date || "не указан"} — {context.group.end_date || "не указан"}.
        {context.schedule ? ` Версия расписания: ${context.schedule.revision}.` : " Расписание ещё не сохранено."}
      </p>}
      {loading && <p role="status">Загружаем сохранённые данные расписания…</p>}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {courseChanged && <div className="space-y-2 rounded-lg border border-amber-300 p-3 text-sm">
        <p>Расписание сохранено для другого курса. Оно не будет автоматически перенесено. Проверьте все четыре блока.</p>
        <label className="flex items-start gap-2">
          <input type="checkbox" checked={reviewedCourseChange} disabled={busy || !canWrite || reloadRequired}
            onChange={event => setReviewedCourseChange(event.target.checked)} />
          Я проверил расписание и хочу сохранить его для текущего сохранённого курса группы
        </label>
      </div>}
      {context && <fieldset disabled={busy || !canWrite || reloadRequired} className="space-y-3">
        <legend className="sr-only">Четыре блока расписания</legend>
        {slots.map(entry => <div className="space-y-2 rounded-lg border p-3" key={entry.slot}>
          <div className="flex items-center justify-between gap-2">
            <h4 className="text-sm font-medium">Блок {entry.slot}</h4>
            <Button type="button" size="sm" variant="ghost" onClick={() => updateSlot(entry.slot, { date: "", time_from: "", time_to: "", topic: "" })} aria-label={`Очистить блок ${entry.slot}`}>Очистить</Button>
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <label className="text-xs">Дата<Input type="date" aria-label={`Дата блока ${entry.slot}`} value={entry.date} min={context.group.start_date ?? undefined} max={context.group.end_date ?? undefined} onChange={event => updateSlot(entry.slot, { date: event.target.value })} /></label>
            <label className="text-xs">Начало<Input type="time" aria-label={`Начало блока ${entry.slot}`} value={entry.time_from} onChange={event => updateSlot(entry.slot, { time_from: event.target.value })} /></label>
            <label className="text-xs">Окончание<Input type="time" aria-label={`Окончание блока ${entry.slot}`} value={entry.time_to} onChange={event => updateSlot(entry.slot, { time_to: event.target.value })} /></label>
          </div>
          <label className="block text-xs">Тема<Textarea aria-label={`Тема блока ${entry.slot}`} value={entry.topic} rows={2} onChange={event => updateSlot(entry.slot, { topic: event.target.value })} /></label>
        </div>)}
      </fieldset>}
      {!canWrite && <p className="text-xs text-muted-foreground">Нет прав на изменение документов. Расписание доступно только для просмотра.</p>}
      {confirmReload && <div className="space-y-2 rounded-lg border p-3" role="alert">
        <p className="text-sm">Обновление заменит несохранённое расписание данными из базы. Продолжить?</p>
        <Button type="button" variant="outline" onClick={() => setConfirmReload(false)}>Оставить изменения</Button>{" "}
        <Button type="button" onClick={() => void load()}>Загрузить вместо изменений</Button>
      </div>}
      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" disabled={busy || !context || !canWrite || !dirty || reloadRequired || (courseChanged && !reviewedCourseChange)} onClick={() => void save()}>{saving ? "Сохраняем расписание…" : "Сохранить расписание"}</Button>
        <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => { if (dirty) setConfirmReload(true); else void load(); }}>Обновить расписание</Button>
        {dirty && <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => { setSlots(baseline); setReviewedCourseChange(false); if (!reloadRequired) setError(null); }}>Отменить изменения расписания</Button>}
      </div>
      {dirty && <p role="status" className="text-xs text-amber-700">Есть несохранённые изменения расписания. Сохраните или отмените их перед общим сохранением настроек группы.</p>}
    </section>
  );
}

export function GroupDocumentScheduleEditor(props: Props) {
  const { can, loading } = useStaffPermissions();
  if (loading || (!can("documents.read") && !can("documents.write"))) return null;
  return <ScheduleEditorContent key={`${props.organizationId}:${props.groupId}`} {...props} canWrite={can("documents.write")} />;
}
