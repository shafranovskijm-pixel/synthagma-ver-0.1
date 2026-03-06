import { useState, useRef, useCallback } from "react";
import { Play, Square, CheckCircle2, Loader2, AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";

interface PipelineCourse {
  id: string;
  course_id: string;
  course?: { id: string; title: string; description: string | null; duration: string | null };
}

interface LogEntry {
  courseName: string;
  status: "ok" | "error";
  message?: string;
}

interface Props {
  courses: PipelineCourse[];
  onComplete: () => void;
}

export function BulkPipelineWidget({ courses, onComplete }: Props) {
  const [isRunning, setIsRunning] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [currentPhase, setCurrentPhase] = useState("");
  const [completedLog, setCompletedLog] = useState<LogEntry[]>([]);
  const stopRef = useRef(false);

  const totalCount = courses.length;
  const completedCount = completedLog.length;
  const progressPercent = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  const processCourse = useCallback(async (course: PipelineCourse) => {
    const courseId = course.course_id;
    const courseTitle = course.course?.title || "";

    // 1. Fetch lessons
    setCurrentPhase("Загрузка уроков...");
    let { data: lessons } = await supabase
      .from("lessons").select("id, title, type, content, order_index").eq("course_id", courseId).order("order_index");

    const currentLessons = lessons || [];
    const textPracticeLessons = currentLessons.filter(l => l.type === "text" || l.type === "practice");
    const needsStructure = textPracticeLessons.length === 0 || currentLessons.length < 3;

    // 2. Generate structure if needed (no tests)
    if (needsStructure) {
      setCurrentPhase("Генерация структуры...");
      try {
        const { data: structData, error: structErr } = await supabase.functions.invoke("generate-course-structure", {
          body: { title: courseTitle, description: "" },
        });
        if (structErr) throw structErr;
        const generatedLessons: Array<{ title: string; type: string }> = structData?.lessons || [];
        if (generatedLessons.length > 0) {
          const maxOrder = currentLessons.reduce((mx, l) => Math.max(mx, l.order_index ?? 0), -1);
          const existingTitles = new Set(currentLessons.map(l => l.title.toLowerCase()));
          const newLessons = generatedLessons
            .filter(gl => !existingTitles.has(gl.title.toLowerCase()))
            .filter(gl => gl.type !== "test");
          if (newLessons.length > 0) {
            await supabase.from("lessons").insert(
              newLessons.map((gl, i) => ({
                course_id: courseId, title: gl.title, type: gl.type || "text",
                order_index: maxOrder + 1 + i, content: null,
              }))
            );
          }
          const { data: refreshed } = await supabase
            .from("lessons").select("id, title, type, content, order_index").eq("course_id", courseId).order("order_index");
          lessons = refreshed;
        }
      } catch (e) {
        console.error("Structure generation failed:", e);
      }
    }

    const allLessons = lessons || [];

    // 3. Fill empty text/practice lessons
    const emptyLessons = allLessons.filter(l =>
      (l.type === "text" || l.type === "practice") && (!l.content || l.content === "[]" || l.content === "" || l.content.length < 50)
    );

    for (let i = 0; i < emptyLessons.length; i++) {
      if (stopRef.current) return false;
      const lesson = emptyLessons[i];
      setCurrentPhase(`Контент: "${lesson.title}" (${i + 1}/${emptyLessons.length})`);
      try {
        const { data, error } = await supabase.functions.invoke("gigachat", {
          body: { action: "generate_content", courseTitle, lessonTitle: lesson.title, existingContent: null },
        });
        if (error) throw error;
        if (data?.content) {
          await supabase.from("lessons").update({ content: data.content }).eq("id", lesson.id);
        }
      } catch (e) {
        console.error(`Content gen failed for ${lesson.id}:`, e);
      }
    }

    // 4. Solve unanswered test questions
    const testIds = allLessons.filter(l => l.type === "test").map(l => l.id);
    if (testIds.length > 0) {
      const { data: questions } = await supabase
        .from("test_questions").select("id, lesson_id, correct_answer, question, options").in("lesson_id", testIds);
      const unanswered = (questions || []).filter((q: any) => q.correct_answer === null || q.correct_answer === undefined);

      if (unanswered.length > 0) {
        setCurrentPhase(`Решаю тесты: ${unanswered.length} вопросов`);
        const byLesson = new Map<string, typeof unanswered>();
        for (const q of unanswered) {
          const arr = byLesson.get(q.lesson_id) || [];
          arr.push(q);
          byLesson.set(q.lesson_id, arr);
        }
        for (const [lessonId, qs] of byLesson) {
          if (stopRef.current) return false;
          const lessonInfo = allLessons.find(l => l.id === lessonId);
          const batchSize = 20;
          for (let i = 0; i < qs.length; i += batchSize) {
            const batch = qs.slice(i, i + batchSize);
            try {
              const { data, error } = await supabase.functions.invoke("gigachat", {
                body: {
                  action: "generate_answers", courseTitle,
                  lessonTitle: lessonInfo?.title || "Тест",
                  questions: batch.map(q => ({ question: q.question, options: q.options || [] })),
                },
              });
              if (error) throw error;
              if (data?.answers && !data.parseError) {
                for (const ans of data.answers) {
                  const q = batch[ans.questionIndex];
                  if (q && ans.correctAnswer !== undefined) {
                    await supabase.from("test_questions")
                      .update({ correct_answer: ans.correctAnswer, explanation: ans.explanation || null })
                      .eq("id", q.id);
                  }
                }
              }
            } catch (e) {
              console.error(`Test solve failed for lesson ${lessonId}:`, e);
            }
          }
        }
      }
    }

    // 5. Fix duplicate titles
    const titleCounts = new Map<string, Array<{ id: string; title: string }>>();
    for (const l of allLessons) {
      const arr = titleCounts.get(l.title) || [];
      arr.push(l);
      titleCounts.set(l.title, arr);
    }
    for (const group of titleCounts.values()) {
      if (group.length > 1) {
        for (let i = 1; i < group.length; i++) {
          await supabase.from("lessons").update({ title: `${group[i].title} (${i + 1})` }).eq("id", group[i].id);
        }
      }
    }

    // 6. Mark as validated
    setCurrentPhase("Валидация...");
    await supabase.from("marketplace_courses").update({ is_validated: true } as any).eq("id", course.id);

    return true;
  }, []);

  const handleStart = useCallback(async () => {
    stopRef.current = false;
    setIsRunning(true);
    setCompletedLog([]);
    setCurrentIndex(0);

    for (let i = 0; i < courses.length; i++) {
      if (stopRef.current) break;
      setCurrentIndex(i);
      const course = courses[i];
      const name = course.course?.title || `Курс ${i + 1}`;

      try {
        const ok = await processCourse(course);
        if (ok === false && stopRef.current) {
          setCompletedLog(prev => [...prev, { courseName: name, status: "error", message: "Остановлено" }]);
          break;
        }
        setCompletedLog(prev => [...prev, { courseName: name, status: "ok" }]);
      } catch (e: any) {
        console.error(`Pipeline error for course ${course.course_id}:`, e);
        setCompletedLog(prev => [...prev, { courseName: name, status: "error", message: e?.message || "Ошибка" }]);
      }
    }

    setIsRunning(false);
    setCurrentPhase("");
    onComplete();
    toast.success("Конвейер завершён!");
  }, [courses, processCourse, onComplete]);

  const handleStop = useCallback(() => {
    stopRef.current = true;
    setCurrentPhase("Остановка...");
  }, []);

  if (totalCount === 0) return null;

  const currentCourseName = isRunning ? (courses[currentIndex]?.course?.title || "") : "";

  return (
    <Card className="border-primary/20 bg-primary/5">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Loader2 className={`w-4 h-4 ${isRunning ? "animate-spin" : "hidden"}`} />
            Конвейер заполнения
            <Badge variant="secondary" className="ml-1">{totalCount} курсов</Badge>
          </CardTitle>
          {!isRunning ? (
            <Button size="sm" onClick={handleStart} className="gap-1.5">
              <Play className="w-3.5 h-3.5" />Запустить
            </Button>
          ) : (
            <Button size="sm" variant="destructive" onClick={handleStop} className="gap-1.5">
              <Square className="w-3.5 h-3.5" />Стоп
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Progress */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">
              {completedCount} / {totalCount} готово
            </span>
            <span className="font-medium">{progressPercent}%</span>
          </div>
          <Progress value={progressPercent} className="h-2" />
        </div>

        {/* Current status */}
        {isRunning && currentCourseName && (
          <div className="text-sm space-y-0.5">
            <p className="font-medium truncate">▶ {currentCourseName}</p>
            <p className="text-muted-foreground text-xs truncate">{currentPhase}</p>
          </div>
        )}

        {/* Log */}
        {completedLog.length > 0 && (
          <ScrollArea className="max-h-40">
            <div className="space-y-1">
              {completedLog.map((entry, i) => (
                <div key={i} className="flex items-center gap-2 text-xs py-0.5">
                  {entry.status === "ok" ? (
                    <CheckCircle2 className="w-3.5 h-3.5 text-green-500 shrink-0" />
                  ) : (
                    <AlertTriangle className="w-3.5 h-3.5 text-red-500 shrink-0" />
                  )}
                  <span className="truncate">{entry.courseName}</span>
                  {entry.message && <span className="text-muted-foreground">— {entry.message}</span>}
                </div>
              ))}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}
