import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { useCourseProgramBinding, type useGroupProgramFacts } from "@/hooks/useProgramFacts";
import { ProgramFactsSummary } from "./ProgramFactsPanel";

type GroupResource = ReturnType<typeof useGroupProgramFacts>;
interface Props {
  organizationId: string; groupId: string; courseId: string | null; courseTitle?: string | null;
  students: Array<{ user_id: string; full_name: string }>;
  resource: GroupResource; canConfigure: boolean;
}
const actionClass = "max-w-full h-auto min-h-9 whitespace-normal";

export function GroupProgramFactsPanel({ organizationId, groupId, courseId, courseTitle, students, resource: h }: Props) {
  const [selectedEnrollments, setSelectedEnrollments] = useState<string[]>([]);
  const mayBind = !!h.data?.capabilities.can_bind;
  const course = useCourseProgramBinding(mayBind ? organizationId : null, courseId);
  useEffect(() => { setSelectedEnrollments([]); }, [organizationId, groupId, courseId]);
  useEffect(() => { setSelectedEnrollments([]); }, [h.data?.binding?.id, h.data?.binding?.revision]);
  const version = course.data?.version;
  const names = new Map(students.map(s => [s.user_id, s.full_name]));
  const pending = h.data?.enrollments.filter(e => e.state === "unconfirmed") ?? [];
  const selected = selectedEnrollments.filter(id => pending.some(e => e.enrollment_id === id && names.has(e.user_id)));
  const busy = h.loading || h.saving || h.conflict || h.denied;
  const confirm = async () => { if (await h.confirmExisting(selected)) setSelectedEnrollments([]); };
  return <Card><CardContent className="py-4 space-y-3">
    <h2 className="font-semibold">Программа этой группы</h2>
    <p className="text-sm text-muted-foreground">Версия программы сохраняется отдельно для группы и обучения каждого участника. Смена программы курса не меняет уже зафиксированные сведения.</p>
    {h.loading && <p role="status" className="text-sm">Загрузка программы группы…</p>}
    {h.error && <div role="alert" className="text-sm space-y-2"><p>{h.error}</p><Button variant="outline" size="sm" disabled={h.saving} onClick={() => void h.reload()}>Обновить программу группы</Button></div>}
    {!h.loading && h.data && <>
      {h.data.binding ? <>
        <ProgramFactsSummary version={h.data.binding.program_snapshot} />
        {!h.data.capabilities.can_bind && <p className="text-xs text-muted-foreground">Версия закреплена. После фиксации сведений обучения менять программу этой группы нельзя.</p>}
        <p className="text-xs text-muted-foreground">Связь группы записана {h.data.binding.recorded_at}. Это не дата приказа о зачислении.</p>
      </> : <p className="text-sm text-muted-foreground">Версия программы группы пока не подтверждена. Доступ к существующему обучению сохраняется; документы не получают статус утверждённой программы автоматически.</p>}
      {mayBind && <div className="border-t pt-3 space-y-3">
        <p className="text-sm font-medium">Курс группы</p>
        <p className="text-sm">{courseId ? courseTitle || "Выбранный курс группы" : "Сначала выберите курс в настройках группы."}</p>
        {course.error && <div role="alert" className="text-sm space-y-2"><p>{course.error}</p><Button variant="outline" size="sm" disabled={busy} onClick={() => void course.reload()}>Повторить загрузку доступной программы</Button></div>}
        {course.loading && <p role="status" className="text-sm">Загрузка версии курса…</p>}
        {version && <div className="rounded-lg border p-3 space-y-2"><p className="text-sm font-medium">Версия курса, которую можно закрепить за группой</p><ProgramFactsSummary version={version} /></div>}
        {courseId && course.data && !course.loading && !version && <p className="text-sm text-muted-foreground">Для этого курса нет доступной утверждённой версии программы. Ответственный за программы центра может выбрать её в разделе «Программы».</p>}
        <Button className={actionClass} disabled={busy || course.loading || !!course.error || !version || !courseId || version.id === h.data.binding?.version_id && courseId === h.data.binding?.course_id} onClick={() => { if (version && courseId) void h.bind(courseId, version.id); }}>Закрепить эту версию за группой</Button>
        <p className="text-xs text-muted-foreground">Участники, добавленные ранее, требуют отдельного подтверждения ниже. Автоматического переноса старых сведений не будет.</p>
      </div>}
      {h.data.binding && <div className="border-t pt-3 space-y-3">
        <h3 className="text-sm font-medium">Сведения уже обучающихся участников</h3>
        <p className="text-xs text-muted-foreground">Подтвердите только проверенные связи с этой программой. Запись будет сделана текущим временем, без выдуманной даты зачисления или утверждения задним числом.</p>
        {h.data.enrollments.length === 0 ? <p className="text-sm text-muted-foreground">Связей обучения с курсом этой группы пока нет.</p> : <div className="space-y-2">{h.data.enrollments.map(e => <div key={e.enrollment_id} className="flex items-start gap-2 text-sm">
          {e.state === "unconfirmed" && h.data.capabilities.can_confirm_existing && <Checkbox id={`program-enrollment-${e.enrollment_id}`} checked={selected.includes(e.enrollment_id)} disabled={busy || !names.has(e.user_id)} onCheckedChange={checked => setSelectedEnrollments(ids => checked === true ? [...new Set([...ids, e.enrollment_id])] : ids.filter(id => id !== e.enrollment_id))} />}
          <Label htmlFor={`program-enrollment-${e.enrollment_id}`} className="text-sm font-normal">{names.get(e.user_id) || "Участник без доступного имени"} — {e.state === "confirmed" ? "сведения зафиксированы" : "нужно подтверждение"}</Label>
        </div>)}</div>}
        {h.data.capabilities.can_confirm_existing && <Button className={actionClass} disabled={busy || selected.length === 0} onClick={() => void confirm()}>Подтвердить программу выбранных участников ({selected.length})</Button>}
      </div>}
    </>}
  </CardContent></Card>;
}
