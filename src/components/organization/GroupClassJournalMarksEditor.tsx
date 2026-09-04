import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useStaffPermissions } from "@/hooks/useStaffPermissions";
import { groupFolderPath } from "@/lib/groups/groupContext";
import {
  fetchGroupClassJournalMarks, saveGroupClassJournalMark, isCurrentGroupClassJournalMark,
  GroupClassJournalMarksError, type GroupClassJournalMarksContext,
} from "@/lib/groups/groupClassJournalMarks";

interface Props { organizationId: string; groupId: string; onClose: () => void; }
const slots = [1, 2, 3, 4] as const;
const displayDate = (value: string | undefined) => value ? value.split("-").reverse().join(".") : "Дата не указана";

function MarksEditor({ organizationId, groupId, onClose, canWrite }: Props & { canWrite: boolean }) {
  const [context, setContext] = useState<GroupClassJournalMarksContext | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadRequired, setReloadRequired] = useState(false);
  const [editing, setEditing] = useState<{ userId: string; slot: number } | null>(null);
  const [draft, setDraft] = useState("");
  const [savedNotice, setSavedNotice] = useState("");
  const activeRef = useRef(false);
  const busyRef = useRef(false);
  const blockedRef = useRef(true);
  const requestRef = useRef(0);
  const contextRef = useRef(context);

  const load = useCallback(async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    blockedRef.current = true;
    const request = ++requestRef.current;
    setLoading(true); setError(null); setSavedNotice("");
    try {
      const fresh = await fetchGroupClassJournalMarks({ organizationId, groupId });
      if (!activeRef.current || requestRef.current !== request) return;
      contextRef.current = fresh;
      setContext(fresh); setEditing(null); setDraft(""); setReloadRequired(false);
      blockedRef.current = false;
    } catch (cause) {
      if (!activeRef.current || requestRef.current !== request) return;
      setError(cause instanceof GroupClassJournalMarksError ? cause.message : "Не удалось загрузить отметки группы. Повторите загрузку.");
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
    const baseline = contextRef.current;
    if (!baseline || !editing || busyRef.current || blockedRef.current || !canWrite) return;
    busyRef.current = true;
    const request = ++requestRef.current;
    setSaving(true); setError(null); setSavedNotice("");
    try {
      const fresh = await saveGroupClassJournalMark({ organizationId, groupId, context: baseline, ...editing, mark: draft });
      if (!activeRef.current || requestRef.current !== request) return;
      contextRef.current = fresh;
      setContext(fresh); setEditing(null); setDraft("");
      setSavedNotice("Отметка сохранена и проверена в базе.");
    } catch (cause) {
      if (!activeRef.current || requestRef.current !== request) return;
      const mustReload = !(cause instanceof GroupClassJournalMarksError) || cause.requiresReload;
      blockedRef.current = mustReload;
      setReloadRequired(mustReload);
      setError(cause instanceof GroupClassJournalMarksError ? cause.message : "Сохранение не подтверждено. Перезагрузите журнал перед повтором.");
    } finally {
      if (activeRef.current && requestRef.current === request) { busyRef.current = false; setSaving(false); }
    }
  };

  const busy = loading || saving;
  const staleMarks = context?.marks.filter(mark => !isCurrentGroupClassJournalMark(mark, context)) ?? [];
  const selectedStudent = context?.students.find(student => student.user_id === editing?.userId);
  return <section className="space-y-4" aria-label="Посещаемость очных занятий группы">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><h2 className="text-xl font-semibold">Посещаемость очных занятий <span className="text-sm text-amber-700">Бета</span></h2><p className="text-sm text-muted-foreground">{context?.group.name || "Журнал выбранной группы"}</p></div>
      <Button variant="outline" onClick={onClose}>К списку журналов</Button>
    </div>
    <p className="text-sm text-muted-foreground">Это ручной учёт очных занятий, а не автоматический прогресс курса. В исходном Word-журнале ГОРЭЛТЕХ четыре колонки дат. Подтверждённые отметки передаются в эти колонки без изменения текста шаблона.</p>
    <div className="flex flex-wrap gap-2">
      <Button variant="outline" disabled={busy || Boolean(editing && !reloadRequired)} onClick={() => void load()}>Перезагрузить отметки</Button>
      <Button variant="outline" asChild><Link to={groupFolderPath(groupId, null, { settings: true })}>Настроить даты группы</Link></Button>
      <Button variant="outline" asChild><Link to={groupFolderPath(groupId, "docs")}>Документы группы</Link></Button>
    </div>
    {loading && <p role="status">Загружаем сохранённые отметки…</p>}
    {error && <div role="alert" className="rounded-xl border border-destructive/30 p-3 text-sm text-destructive">{error}{reloadRequired && <p>Изменения отключены до успешной перезагрузки. Последняя отметка могла сохраниться.</p>}</div>}
    {savedNotice && <p role="status" className="text-sm text-green-700">{savedNotice}</p>}
    {context && context.group.training_dates.length > 4 && <p role="alert" className="text-sm text-amber-700">У группы больше четырёх дат. Этот исходный бланк содержит только первые четыре колонки; дополнительные даты в него не попадут. Даты группы не изменены.</p>}
    {staleMarks.length > 0 && <details className="rounded-xl border border-amber-300 p-3 text-sm">
      <summary>Не используются в текущем Word-журнале: {staleMarks.length} отметок</summary>
      <p>Изменились курс, дата колонки или состав группы. Старые записи сохранены; они не переносятся автоматически.</p>
      <ul className="mt-2 list-disc pl-5">{staleMarks.map(mark => <li key={mark.id}>{context?.students.find(student => student.user_id === mark.user_id)?.full_name || "Ученик больше не входит в активный состав"}: колонка {mark.slot}, {displayDate(mark.source_date)}, отметка «{mark.mark || "пусто"}».</li>)}</ul>
    </details>}
    {context && !loading && (context.students.length ? <div className="overflow-x-auto rounded-xl border">
      <table className="w-full text-sm"><thead><tr className="border-b bg-muted/40"><th className="p-3 text-left">Ученик</th>{slots.map(slot => <th key={slot} className="p-3 text-center">{displayDate(context.group.training_dates[slot - 1])}<span className="block text-xs font-normal text-muted-foreground">Колонка {slot}</span></th>)}</tr></thead>
        <tbody>{context.students.map(student => <tr key={student.user_id} className="border-b last:border-0"><th className="p-3 text-left font-medium">{student.full_name || "Имя не заполнено"}</th>{slots.map(slot => {
          const mark = context.marks.find(row => row.user_id === student.user_id && row.slot === slot && isCurrentGroupClassJournalMark(row, context));
          return <td key={slot} className="p-2 text-center"><Button variant="outline" className="min-w-12" disabled={busy || reloadRequired || !canWrite || Boolean(editing) || !context.group.training_dates[slot - 1]}
            aria-label={`${student.full_name || "Ученик"}, колонка ${slot}, ${displayDate(context.group.training_dates[slot - 1])}: ${mark?.mark || "не отмечено"}`}
            onClick={() => { setEditing({ userId: student.user_id, slot }); setDraft(mark?.mark || ""); setSavedNotice(""); }}>{mark?.mark || "—"}</Button></td>;
        })}</tr>)}</tbody>
      </table>
    </div> : <p className="rounded-xl border p-4 text-sm">В группе нет активных учеников. Добавьте учеников в группу — они появятся в журнале.</p>)}
    {editing && <div className="space-y-3 rounded-xl border p-4" aria-label="Редактирование отметки">
      <p className="font-medium">{selectedStudent?.full_name || "Ученик"} · колонка {editing.slot} · {displayDate(context?.group.training_dates[editing.slot - 1])}</p>
      <label className="block space-y-1 text-sm"><span>Отметка в Word-журнале</span><Input aria-label="Отметка в Word-журнале" value={draft} disabled={busy || reloadRequired || !canWrite} onChange={event => setDraft([...event.target.value].slice(0, 12).join(""))} /></label>
      <p className="text-xs text-muted-foreground">В исходном образце присутствие обозначено V. Другие обозначения введите по правилам вашего учебного центра: система не заменяет и не придумывает их.</p>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" disabled={busy || reloadRequired || !canWrite} onClick={() => setDraft("V")}>Присутствие — V</Button>
        <Button variant="outline" disabled={busy || reloadRequired || !canWrite} onClick={() => setDraft("")}>Очистить отметку</Button>
        <Button disabled={busy || reloadRequired || !canWrite} onClick={() => void save()}>{saving ? "Сохраняем…" : "Сохранить отметку"}</Button>
        <Button variant="ghost" disabled={saving} onClick={() => { setEditing(null); setDraft(""); }}>Отменить</Button>
      </div>
    </div>}
    {!canWrite && <p className="text-sm text-muted-foreground">Журнал доступен только для просмотра: нет разрешения на изменение документов.</p>}
  </section>;
}

export function GroupClassJournalMarksEditor(props: Props) {
  const { can, loading } = useStaffPermissions();
  if (loading) return <p role="status">Проверяем доступ к журналу…</p>;
  if (!can("documents.read") && !can("documents.write")) return <div role="alert"><p>Нет доступа к документам этой организации.</p><Button variant="outline" onClick={props.onClose}>К списку журналов</Button></div>;
  return <MarksEditor key={`${props.organizationId}:${props.groupId}`} {...props} canWrite={can("documents.write")} />;
}
