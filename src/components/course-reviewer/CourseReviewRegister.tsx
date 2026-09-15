import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { fetchCourseReviewRegister } from "@/api/courseReviewRegister";
import { Button } from "@/components/ui/button";

const statusLabels: Record<string, string> = {
  active: "Обучается", completed: "Завершено", expired: "Срок доступа истёк",
  cancelled: "Отменено", pending: "Ожидает", submitted: "Отправлено",
  approved: "Принято", revision: "На доработке", rejected: "Не принято",
};

function dateLabel(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Дата недоступна" : new Intl.DateTimeFormat("ru-RU", {
    dateStyle: "short", timeStyle: "short",
  }).format(date);
}

export function CourseReviewRegister({ courseId }: { courseId: string }) {
  const { user } = useAuth();
  const query = useQuery({
    queryKey: ["reviewer-register", user?.id, courseId],
    queryFn: () => fetchCourseReviewRegister(courseId),
    enabled: Boolean(user?.id && courseId),
    staleTime: 0,
    retry: false,
  });

  return (
    <section className="mx-auto mt-12 max-w-5xl border-t-2 border-border pt-8" aria-label="Учёт слушателей">
      <h2 className="text-xl font-bold">Учёт слушателей</h2>
      <p className="mt-2 text-sm text-muted-foreground">Зачисления и результаты только этого курса. ФИО и контактные данные слушателей не отображаются.</p>
      {query.isLoading && <p className="mt-4" role="status">Загружаем данные учёта…</p>}
      {query.isError && <div className="mt-4" role="alert">
        <p>Не удалось получить данные учёта. Число слушателей и результаты не подтверждены.</p>
        <Button className="mt-3" variant="outline" onClick={() => query.refetch()}>Повторить загрузку учёта</Button>
      </div>}
      {!query.isError && query.data && <>
        <p className="mt-4 text-sm">Записей о зачислении: <strong>{query.data.enrollment_count}</strong>. Данные получены: {dateLabel(query.data.recorded_at)}.</p>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <caption className="sr-only">Зачисления и учебные результаты текущего курса</caption>
            <thead><tr className="border-b">
              {["Запись", "Статус / прогресс", "Начало / завершение", "Результаты тестов", "Письменные работы"].map((title) => <th key={title} className="p-3 align-top">{title}</th>)}
            </tr></thead>
            <tbody>
              {query.data.records.length === 0 && <tr><td colSpan={5} className="p-4 text-muted-foreground">На курс пока никто не зачислен. Результаты обучения отсутствуют.</td></tr>}
              {query.data.records.map((record) => <tr key={record.record_no} className="border-b align-top">
                <td className="p-3">№ {record.record_no}</td>
                <td className="p-3">{statusLabels[record.status] ?? record.status}<br />Прогресс: {record.progress}%</td>
                <td className="p-3">{dateLabel(record.started_at)}<br />{dateLabel(record.completed_at)}</td>
                <td className="p-3">{record.tests.length === 0 ? "Попыток нет" : <ul className="space-y-2">{record.tests.map((result, index) => <li key={index}>
                  {result.lesson_title}: {result.score} из {result.max_score}<br />{dateLabel(result.completed_at)}
                </li>)}</ul>}</td>
                <td className="p-3">{record.assignments.length === 0 ? "Работ нет" : <ul className="space-y-2">{record.assignments.map((result, index) => <li key={index}>
                  {result.lesson_title}: {statusLabels[result.status] ?? result.status}{result.score !== null ? `; балл: ${result.score}` : ""}<br />
                  Отправлено: {dateLabel(result.submitted_at)}; проверено: {dateLabel(result.reviewed_at)}
                </li>)}</ul>}</td>
              </tr>)}
            </tbody>
          </table>
        </div>
      </>}
    </section>
  );
}
