import { useMemo } from "react";
import { useParams } from "react-router-dom";
import {
  AlertTriangle,
  BookCheck,
  BookOpen,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  ExternalLink,
  FileText,
  LockKeyhole,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { SigmaLogo } from "@/components/ui/SigmaLogo";
import { SigmaSpinner } from "@/components/ui/SigmaSpinner";
import { cn } from "@/lib/utils";
import { useReviewerCoursePreview } from "@/hooks/useReviewerCoursePreview";
import { ReviewerLessonContent } from "@/components/course-reviewer/ReviewerLessonContent";
import type { CourseReviewLessonSummary } from "@/api/courseReviewer";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function safeExternalHref(value: string | null): string | undefined {
  if (!value) return undefined;
  try {
    const parsed = new URL(value, window.location.origin);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return undefined;
    return parsed.href;
  } catch {
    return undefined;
  }
}

function accessExpiryLabel(value: string): string {
  if (["infinity", "+infinity"].includes(value.trim().toLowerCase())) {
    return "Доступ без ограничения срока";
  }

  const date = new Date(value);
  const formatted = Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat("ru-RU", { dateStyle: "medium", timeStyle: "short" }).format(date);
  return `Доступ до ${formatted}`;
}

function lessonTypeLabel(type: string) {
  if (type === "test") return "Тест";
  if (type === "homework") return "Письменное задание";
  return "Учебный материал";
}

function AccessUnavailable({ invalidCourse = false }: { invalidCourse?: boolean }) {
  return (
    <main className="min-h-screen bg-background px-6 py-16">
      <div className="mx-auto max-w-xl rounded-2xl border border-border bg-card p-8 text-center">
        <AlertTriangle className="mx-auto mb-4 h-10 w-10 text-amber-600" />
        <h1 className="text-xl font-semibold">Доступ к проверке недоступен</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          {invalidCourse
            ? "Ссылка на курс имеет неверный формат."
            : "Проверьте срок и назначение доступа у администратора СИНТАГМЫ."}
        </p>
      </div>
    </main>
  );
}

export default function CourseReviewer() {
  const { courseId } = useParams();
  const validCourseId = Boolean(courseId && UUID_PATTERN.test(courseId));
  const review = useReviewerCoursePreview(validCourseId ? courseId : undefined);
  const snapshotLessons = review.snapshot?.lessons;

  const lessonsByModule = useMemo(() => {
    const result = new Map<string, CourseReviewLessonSummary[]>();
    for (const lesson of snapshotLessons ?? []) {
      const key = lesson.module_id || "unassigned";
      const current = result.get(key) || [];
      current.push(lesson);
      result.set(key, current);
    }
    return result;
  }, [snapshotLessons]);

  if (!validCourseId) return <AccessUnavailable invalidCourse />;

  if (review.snapshotLoading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background" role="status" aria-label="Загрузка курса для проверки">
        <div className="text-center"><SigmaSpinner size="xl" /><p className="mt-4 text-muted-foreground">Загружаем курс для проверки…</p></div>
      </main>
    );
  }

  if (review.snapshotError || !review.snapshot) {
    return <AccessUnavailable />;
  }

  const { course, counts, modules, lessons, library, grant_expires_at: grantExpiresAt } = review.snapshot;
  const currentLesson = review.lesson?.lesson;
  const unassignedLessons = lessonsByModule.get("unassigned") || [];
  const coverImageHref = safeExternalHref(course.cover_image_url);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border bg-card px-4 py-4 sm:px-6">
        <div className="mx-auto flex max-w-[1600px] flex-wrap items-center justify-between gap-4">
          <SigmaLogo size="sm" />
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary" className="gap-1"><LockKeyhole className="h-3.5 w-3.5" />Режим проверяющего</Badge>
            <Badge variant="outline">Только чтение</Badge>
            <span className="text-xs text-muted-foreground">{accessExpiryLabel(grantExpiresAt)}</span>
          </div>
        </div>
      </header>

      <section className="border-b border-border bg-muted/25 px-4 py-6 sm:px-6">
        <div className="mx-auto max-w-[1600px]">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="flex max-w-4xl gap-4">
              {coverImageHref && <img src={coverImageHref} alt="Обложка курса" className="hidden h-28 w-40 rounded-xl object-cover sm:block" />}
              <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-primary">Черновик курса</p>
              <h1 className="mt-1 text-2xl font-bold leading-tight sm:text-3xl">{course.title}</h1>
              {course.description && <p className="mt-3 whitespace-pre-wrap text-sm text-muted-foreground">{course.description}</p>}
              {course.duration && <p className="mt-2 text-sm font-medium">Объём: {course.duration}</p>}
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-5" aria-label="Состав курса">
              {[
                ["Модули", counts.modules],
                ["Элементы", counts.elements],
                ["Задания", counts.homework],
                ["Тесты", counts.tests],
                ["Вопросы", counts.questions],
              ].map(([label, value]) => (
                <div key={String(label)} className="min-w-20 rounded-xl border border-border bg-card px-3 py-2 text-center">
                  <div className="text-lg font-bold">{value}</div>
                  <div className="text-[11px] text-muted-foreground">{label}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <div className="mx-auto grid max-w-[1600px] lg:grid-cols-[390px_minmax(0,1fr)]">
        <aside className="border-b border-border bg-card lg:min-h-[calc(100vh-190px)] lg:border-b-0 lg:border-r">
          <div className="max-h-[calc(100vh-190px)] overflow-y-auto p-4">
            <h2 className="mb-3 flex items-center gap-2 font-semibold"><BookOpen className="h-4 w-4" />Структура курса</h2>
            <div className="space-y-4">
              {modules.map((module) => (
                <section key={module.id} aria-label={module.title}>
                  <h3 className="mb-1 text-xs font-semibold leading-snug text-muted-foreground">{module.title}</h3>
                  <div className="space-y-1">
                    {(lessonsByModule.get(module.id) || []).map((lesson) => (
                      <button
                        key={lesson.id}
                        type="button"
                        onClick={() => review.selectLesson(lesson.id)}
                        aria-current={review.activeLessonId === lesson.id ? "page" : undefined}
                        className={cn(
                          "w-full rounded-lg border px-3 py-2 text-left transition-colors",
                          review.activeLessonId === lesson.id
                            ? "border-primary bg-primary/5"
                            : "border-transparent hover:border-border hover:bg-muted/50",
                        )}
                      >
                        <span className="block text-sm font-medium leading-snug">{lesson.title}</span>
                        <span className="mt-1 block text-[11px] text-muted-foreground">
                          {lessonTypeLabel(lesson.type)}
                          {lesson.type === "test" ? ` · ${lesson.test_questions_count} вопросов` : ""}
                        </span>
                      </button>
                    ))}
                  </div>
                </section>
              ))}
              {unassignedLessons.length > 0 && (
                <section aria-label="Элементы без модуля">
                  <h3 className="mb-1 text-xs font-semibold text-muted-foreground">Без модуля</h3>
                  {unassignedLessons.map((lesson) => (
                    <button key={lesson.id} type="button" onClick={() => review.selectLesson(lesson.id)} className="w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-muted/50">{lesson.title}</button>
                  ))}
                </section>
              )}
            </div>
          </div>
        </aside>

        <main className="min-w-0 px-4 py-6 sm:px-8">
          {review.lessonLoading && (
            <div className="flex min-h-72 items-center justify-center" role="status" aria-label="Загрузка элемента курса">
              <SigmaSpinner size="lg" />
            </div>
          )}

          {review.lessonError && (
            <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-6" role="alert">
              <p className="font-semibold">Не удалось загрузить элемент курса.</p>
              <Button type="button" variant="outline" className="mt-4" onClick={() => review.retryLesson()}>Повторить загрузку</Button>
            </div>
          )}

          {!review.lessonLoading && !review.lessonError && currentLesson && (
            <article aria-label={currentLesson.title} className="mx-auto max-w-5xl">
              <div className="mb-6 flex flex-wrap items-start justify-between gap-3 border-b border-border pb-5">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-primary">{lessonTypeLabel(currentLesson.type)}</p>
                  <h2 className="mt-1 text-2xl font-bold">{currentLesson.title}</h2>
                </div>
                {currentLesson.type === "homework" && <Badge variant="outline" className="gap-1"><BookCheck className="h-3.5 w-3.5" />Без отправки ответа</Badge>}
                {currentLesson.type === "test" && (
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="outline" className="gap-1"><ClipboardList className="h-3.5 w-3.5" />Без прохождения теста</Badge>
                    {currentLesson.test_passing_score !== null && <Badge variant="secondary">Порог: {currentLesson.test_passing_score}%</Badge>}
                  </div>
                )}
              </div>

              {(currentLesson.type !== "test" || currentLesson.content) && <ReviewerLessonContent content={currentLesson.content} />}

              {currentLesson.type === "test" && (
                <section aria-label="Вопросы теста без ключей ответов" className="space-y-5">
                  {review.lesson?.questions.map((question, questionIndex) => (
                    <article key={question.id} className="rounded-2xl border border-border bg-card p-5">
                      <div className="flex items-start gap-3">
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-sm font-bold text-primary">{questionIndex + 1}</span>
                        <div className="min-w-0 flex-1">
                          <h3 className="font-semibold">{question.question}</h3>
                          {safeExternalHref(question.image_url) && <img src={safeExternalHref(question.image_url)} alt="Иллюстрация к вопросу" className="mt-3 max-h-72 rounded-lg object-contain" />}
                          <ol className="mt-4 list-[upper-alpha] space-y-2 pl-7">
                            {question.options.map((option, optionIndex) => <li key={`${question.id}-${optionIndex}`} className="pl-1">{option}</li>)}
                          </ol>
                        </div>
                      </div>
                    </article>
                  ))}
                  {review.lesson?.questions.length === 0 && <p className="text-muted-foreground">Вопросы отсутствуют.</p>}
                </section>
              )}

              {(review.lesson?.attachments.length ?? 0) > 0 && (
                <section className="mt-8 border-t border-border pt-6" aria-label="Вложения элемента">
                  <h3 className="mb-3 flex items-center gap-2 font-semibold"><FileText className="h-4 w-4" />Вложения</h3>
                  <ul className="space-y-2">
                    {review.lesson?.attachments.map((attachment) => {
                      const href = safeExternalHref(attachment.file_url);
                      return <li key={attachment.id}>{href ? <a href={href} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 text-primary underline">{attachment.name}<ExternalLink className="h-3.5 w-3.5" /></a> : attachment.name}</li>;
                    })}
                  </ul>
                </section>
              )}

              <nav className="mt-10 flex items-center justify-between border-t border-border pt-5" aria-label="Переход между элементами">
                <Button type="button" variant="outline" onClick={review.selectPreviousLesson} disabled={review.currentIndex <= 0}><ChevronLeft className="mr-1 h-4 w-4" />Предыдущий</Button>
                <span className="text-xs text-muted-foreground">{review.currentIndex + 1} из {lessons.length}</span>
                <Button type="button" variant="outline" onClick={review.selectNextLesson} disabled={review.currentIndex >= lessons.length - 1}>Следующий<ChevronRight className="ml-1 h-4 w-4" /></Button>
              </nav>
            </article>
          )}

          <section className="mx-auto mt-12 max-w-5xl border-t-2 border-border pt-8" aria-label="Электронная библиотека курса">
            <div className="mb-4 flex items-center justify-between gap-3">
              <h2 className="text-xl font-bold">Электронная библиотека</h2>
              <Badge variant="secondary">{library.length} материалов</Badge>
            </div>
            {library.length === 0 ? <p className="text-sm text-muted-foreground">Материалы библиотеки не прикреплены.</p> : (
              <div className="grid gap-3 sm:grid-cols-2">
                {library.map((resource) => {
                  const href = safeExternalHref(resource.resource_url);
                  return (
                    <article key={resource.id} className="rounded-xl border border-border bg-card p-4">
                      <p className="font-semibold">{resource.name}</p>
                      {resource.source_name && <p className="mt-1 text-xs text-muted-foreground">Источник: {resource.source_name}</p>}
                      {resource.edition_label && <p className="text-xs text-muted-foreground">Редакция: {resource.edition_label}</p>}
                      {resource.description && <p className="mt-2 text-sm text-muted-foreground">{resource.description}</p>}
                      {href && <a href={href} target="_blank" rel="noopener noreferrer" className="mt-3 inline-flex items-center gap-1 text-sm text-primary underline">Открыть материал<ExternalLink className="h-3.5 w-3.5" /></a>}
                      {!href && resource.storage_path && <p className="mt-3 text-xs text-muted-foreground">Файл находится в защищённом хранилище.</p>}
                    </article>
                  );
                })}
              </div>
            )}
          </section>
        </main>
      </div>
    </div>
  );
}
