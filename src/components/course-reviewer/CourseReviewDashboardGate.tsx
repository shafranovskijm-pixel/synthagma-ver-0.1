import { useEffect, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { BookOpen, ClipboardCheck } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { SigmaLogo } from "@/components/ui/SigmaLogo";
import { SigmaSpinner } from "@/components/ui/SigmaSpinner";
import { activeCourseReviews, fetchMyCourseReviews, type MyCourseReview } from "@/api/myCourseReviews";

type State = { userId: string; reviews: MyCourseReview[] | null; error: boolean };
// This entry screen is scoped to the designated licensing account. The UUID is
// a routing preference only; the RPC independently checks the caller's grant.
const LICENSING_REVIEWER_USER_ID = "5061292a-7614-489e-b908-3a7160103809";

export function CourseReviewDashboardGate({ children }: { children: ReactNode }) {
  const { user, loading: authLoading, signOut } = useAuth();
  const [state, setState] = useState<State | null>(null);
  const [revision, setRevision] = useState(0);
  const ownReviewerSession = user?.id === LICENSING_REVIEWER_USER_ID;

  useEffect(() => {
    if (!ownReviewerSession || !user) return;
    let cancelled = false;
    const userId = user.id;
    setState({ userId, reviews: null, error: false });
    const timeout = window.setTimeout(() => {
      if (!cancelled) setState({ userId, reviews: null, error: true });
    }, 15000);
    fetchMyCourseReviews().then((reviews) => {
      if (!cancelled) setState({ userId, reviews, error: false });
    }).catch(() => {
      if (!cancelled) setState({ userId, reviews: null, error: true });
    }).finally(() => window.clearTimeout(timeout));
    const refresh = () => setRevision((value) => value + 1);
    window.addEventListener("focus", refresh);
    return () => { cancelled = true; window.clearTimeout(timeout); window.removeEventListener("focus", refresh); };
  }, [ownReviewerSession, user?.id, revision]);

  useEffect(() => {
    const dated = (state?.reviews || []).map((item) => Date.parse(item.grant_expires_at)).filter(Number.isFinite);
    if (!dated.length) return;
    const delay = Math.max(1, Math.min(Math.min(...dated) - Date.now() + 1, 2_147_483_647));
    const timer = window.setTimeout(() => setRevision((value) => value + 1), delay);
    return () => window.clearTimeout(timer);
  }, [state]);

  if (user?.id !== LICENSING_REVIEWER_USER_ID) return <>{children}</>;
  if (authLoading) return <div className="flex min-h-screen items-center justify-center"><SigmaSpinner /></div>;
  if (!ownReviewerSession) return <>{children}</>;
  if (!state || state.userId !== user?.id || (!state.reviews && !state.error)) {
    return <div className="flex min-h-screen items-center justify-center" aria-label="Загрузка доступных курсов"><SigmaSpinner /></div>;
  }
  if (state.error) {
    return <main className="mx-auto max-w-xl p-8 text-center"><h1 className="text-xl font-semibold">Не удалось загрузить доступные курсы</h1><Button className="mt-4" onClick={() => setRevision((value) => value + 1)}>Повторить</Button></main>;
  }
  const reviews = activeCourseReviews(state.reviews);
  if (!reviews.length) {
    return <main className="mx-auto max-w-xl p-8 text-center"><h1 className="text-xl font-semibold">Доступ для проверки отсутствует</h1><p className="mt-3 text-muted-foreground">Уточните назначение и срок доступа у администратора СИНТАГМЫ.</p><div className="mt-5 flex justify-center gap-3"><Button onClick={() => setRevision((value) => value + 1)}>Обновить</Button><Button variant="outline" onClick={() => { void signOut(); }}>Выйти</Button></div></main>;
  }

  return (
    <main className="min-h-screen bg-background">
      <header className="border-b border-border bg-card"><div className="mx-auto flex max-w-5xl items-center justify-between p-5"><SigmaLogo /><Button variant="outline" onClick={() => { void signOut(); }}>Выйти</Button></div></header>
      <section className="mx-auto max-w-5xl space-y-6 px-5 py-10" aria-label="Курсы для проверки">
        <div><h1 className="text-2xl font-semibold">Проверка образовательной программы</h1><p className="mt-2 text-muted-foreground">Учебные материалы, задания, тесты и электронная библиотека.</p></div>
        {reviews.map((review) => (
          <article key={review.course_id} className="rounded-2xl border border-border bg-card p-6">
            <p className="mb-3 inline-flex items-center gap-2 text-sm text-muted-foreground"><ClipboardCheck className="h-4 w-4" />Доступ для проверки</p>
            <h2 className="text-xl font-semibold">{review.title}</h2>
            {review.duration && <p className="mt-2 text-muted-foreground">{review.duration}</p>}
            <div className="mt-5 flex flex-wrap gap-3">
              <Button asChild><Link to={`/review/course/${review.course_id}`}>Открыть курс</Link></Button>
              <Button asChild variant="outline"><Link to={`/review/course/${review.course_id}#course-library`}><BookOpen className="mr-2 h-4 w-4" />Библиотека</Link></Button>
            </div>
          </article>
        ))}
      </section>
    </main>
  );
}
