import { useEffect, useRef, useState } from "react";
import { BarChart3, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SigmaSpinner } from "@/components/ui/SigmaSpinner";
import { fetchStudentLearningResults, type StudentLearningCourse } from "@/api/studentLearningResults";

function dateLabel(value: string | null): string {
  return value ? new Date(value).toLocaleString("ru-RU") : "—";
}

export function LearningResultsTab({ organizationId, userId }: { organizationId: string; userId: string }) {
  const scope = `${organizationId}:${userId}`;
  const currentScope = useRef(scope);
  currentScope.current = scope;
  const [revision, setRevision] = useState(0);
  const [state, setState] = useState<{ scope: string; rows: StudentLearningCourse[]; loading: boolean; error: string | null }>(
    { scope, rows: [], loading: true, error: null },
  );
  useEffect(() => {
    let cancelled = false;
    setState({ scope, rows: [], loading: true, error: null });
    fetchStudentLearningResults(organizationId, userId).then(rows => {
      if (!cancelled && currentScope.current === scope) setState({ scope, rows, loading: false, error: null });
    }).catch(() => {
      if (!cancelled && currentScope.current === scope) setState({ scope, rows: [], loading: false, error: "Не удалось загрузить результаты обучения. Повторите попытку." });
    });
    return () => { cancelled = true; };
  }, [organizationId, userId, scope, revision]);
  const loading = state.scope !== scope || state.loading;
  const rows = state.scope === scope ? state.rows : [];
  const error = state.scope === scope ? state.error : null;
  return <section className="space-y-4" aria-label="Результаты обучения ученика">
    <div className="flex items-start justify-between gap-3">
      <div>
        <h3 className="font-semibold flex items-center gap-2"><BarChart3 className="w-5 h-5 text-primary" />Результаты обучения</h3>
        <p className="text-sm text-muted-foreground mt-1">Все назначенные курсы, последние результаты тестов и очные зачёты в одной карточке.</p>
      </div>
      <Button variant="outline" onClick={() => setRevision(v => v + 1)} disabled={loading}><RefreshCw className="w-4 h-4 mr-2" />Обновить</Button>
    </div>
    {loading ? <div className="py-12 flex justify-center"><SigmaSpinner size="lg" /></div>
      : error ? <div role="alert" className="rounded-xl border p-6"><p>{error}</p><Button variant="outline" className="mt-3" onClick={() => setRevision(v => v + 1)}>Повторить</Button></div>
        : rows.length === 0 ? <p className="text-muted-foreground py-8">Ученик не зачислен на курсы.</p>
          : rows.map(course => <article key={course.enrollment_id} className="rounded-xl border bg-card p-4 space-y-3">
            <div className="flex flex-wrap justify-between gap-2"><h4 className="font-semibold">{course.course_title}</h4><span className="text-sm">{course.manual_credited_at ? "Зачтено организацией" : course.status === "completed" ? "Курс завершён" : course.status === "active" ? "Обучается" : course.status === "cancelled" ? "Назначение отменено" : "Не завершён"}</span></div>
            <p className="text-sm text-muted-foreground">Прогресс: {course.progress}% · Время: {Math.floor(course.time_spent / 60)} мин{course.completed_at ? ` · Завершён: ${dateLabel(course.completed_at)}` : ""}</p>
            {course.tests.length === 0 ? <p className="text-sm text-muted-foreground">В курсе нет тестов.</p> : <div className="overflow-x-auto"><table className="w-full min-w-[640px] text-sm">
              <thead><tr className="border-b text-left text-muted-foreground"><th className="py-2 pr-3">Тест</th><th className="pr-3">Результат</th><th className="pr-3">Статус</th><th className="pr-3">Попытки</th><th>Дата</th></tr></thead>
              <tbody>{course.tests.map(test => <tr key={test.lesson_id} className="border-b last:border-0">
                <td className="py-3 pr-3">{test.lesson_title}</td>
                <td className="pr-3">{test.percent === null ? "—" : `${test.score}/${test.max_score} · ${test.percent}%`}<div className="text-xs text-muted-foreground">Проходной: {test.passing_score}%</div></td>
                <td className="pr-3">{test.manual_credited_at ? "Зачтено организацией" : test.attempts_used === 0 ? "Не начат" : test.passed ? "Сдан" : "Не сдан"}</td>
                <td className="pr-3">{test.attempts_used}</td><td>{dateLabel(test.manual_credited_at || test.completed_at)}</td>
              </tr>)}</tbody>
            </table></div>}
          </article>)}
  </section>;
}
