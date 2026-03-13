import { useState, useCallback, useEffect } from "react";
import {
  ArrowLeft, Sparkles, Loader2, CheckCircle2, AlertTriangle,
  FolderOpen, Plus, Play, BookOpen, FileText, HelpCircle,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { safeInvoke } from "@/utils/safeInvoke";
import { toast } from "sonner";
import { MARKETPLACE_ORG_ID } from "@/constants/marketplace";
import { markdownToBlocks, blocksToJson } from "@/components/course-builder/BlockEditor";
import type { DbCategory } from "@/hooks/useAdminMarketplace";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown } from "lucide-react";

interface MarketplaceCourseWithDetails {
  id: string;
  course_id: string;
  organization_id: string | null;
  price_student: number;
  price_organization: number;
  is_active: boolean;
  is_validated?: boolean;
  description_short: string | null;
  preview_image_url: string | null;
  created_at: string;
  course?: { id: string; title: string; description: string | null; duration: string | null; category_id?: string | null };
  organization?: { name: string } | null;
}

interface Props {
  courses: MarketplaceCourseWithDetails[];
  dbCategories: DbCategory[];
  onComplete: () => void;
}

interface CourseAnalysis {
  courseId: string;
  totalLessons: number;
  emptyLessons: number;
  totalTests: number;
  unansweredQuestions: number;
}

type GeneratingPhase = "idle" | "structure" | "content" | "questions" | "answers";

const PHASE_LABELS: Record<GeneratingPhase, string> = {
  idle: "",
  structure: "Генерация структуры...",
  content: "Генерация контента уроков...",
  questions: "Генерация тестовых вопросов...",
  answers: "Решение тестов...",
};

const programTypes = [
  "Повышение квалификации",
  "Профессиональная переподготовка",
  "Охрана труда / Пожарная безопасность",
  "Рабочие профессии",
];

export function ContentGeneratorTab({ courses, dbCategories, onComplete }: Props) {
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [courseAnalyses, setCourseAnalyses] = useState<Record<string, CourseAnalysis>>({});
  const [analyzing, setAnalyzing] = useState(false);
  const [generatingCourseId, setGeneratingCourseId] = useState<string | null>(null);
  const [generatingPhase, setGeneratingPhase] = useState<GeneratingPhase>("idle");
  const [generatingProgress, setGeneratingProgress] = useState(0);
  const [newCourseName, setNewCourseName] = useState("");
  const [creatingCourse, setCreatingCourse] = useState(false);

  // AI settings
  const [aiProvider, setAiProvider] = useState("gigachat");
  const [gigachatModel, setGigachatModel] = useState<string | undefined>();
  const [lovableModel, setLovableModel] = useState<string | undefined>();

  useEffect(() => {
    const loadAiSettings = async () => {
      try {
        const { data } = await supabase
          .from("ai_settings")
          .select("provider, gigachat_model, lovable_model")
          .eq("context", "pipeline")
          .single();
        if (data) {
          setAiProvider(data.provider || "gigachat");
          setGigachatModel(data.gigachat_model || undefined);
          setLovableModel(data.lovable_model || undefined);
        }
      } catch {}
    };
    loadAiSettings();
  }, []);

  const selectedCategory = dbCategories.find(c => c.id === selectedCategoryId);
  const categoryCourses = selectedCategoryId
    ? courses.filter(c => c.course?.category_id === selectedCategoryId)
    : [];

  // Group categories by parent_type
  const categoryGroups = programTypes.map(pt => ({
    type: pt,
    categories: dbCategories.filter(c => (c.parent_type || "Повышение квалификации") === pt),
  })).filter(g => g.categories.length > 0);

  // Count courses per category
  const coursesPerCategory = (catId: string) =>
    courses.filter(c => c.course?.category_id === catId).length;

  // Analyze courses in selected category
  const analyzeCategory = useCallback(async () => {
    if (!selectedCategoryId || categoryCourses.length === 0) return;
    setAnalyzing(true);
    const analyses: Record<string, CourseAnalysis> = {};

    for (const mc of categoryCourses) {
      try {
        const { data: lessons } = await supabase
          .from("lessons")
          .select("id, type, content")
          .eq("course_id", mc.course_id);

        const textLessons = (lessons || []).filter(l => l.type === "text" || l.type === "practice");
        const testLessons = (lessons || []).filter(l => l.type === "test");
        const emptyLessons = textLessons.filter(l =>
          !l.content || l.content === "[]" || l.content === "" || l.content.length < 50
        );

        let unansweredQuestions = 0;
        if (testLessons.length > 0) {
          const testIds = testLessons.map(l => l.id);
          const { data: questions } = await supabase
            .from("test_questions")
            .select("id, correct_answer")
            .in("lesson_id", testIds);
          unansweredQuestions = (questions || []).filter(q =>
            q.correct_answer === null || q.correct_answer === undefined
          ).length;
        }

        analyses[mc.course_id] = {
          courseId: mc.course_id,
          totalLessons: (lessons || []).length,
          emptyLessons: emptyLessons.length,
          totalTests: testLessons.length,
          unansweredQuestions,
        };
      } catch (e) {
        console.error("Analysis error for", mc.course_id, e);
      }
    }

    setCourseAnalyses(prev => ({ ...prev, ...analyses }));
    setAnalyzing(false);
  }, [selectedCategoryId, categoryCourses]);

  useEffect(() => {
    if (selectedCategoryId) {
      analyzeCategory();
    }
  }, [selectedCategoryId]);

  // Generate content for a single course
  const handleGenerateCourse = async (courseId: string, courseTitle: string) => {
    if (generatingCourseId) return;
    setGeneratingCourseId(courseId);
    setGeneratingProgress(0);

    try {
      // 1. Check if course has lessons
      const { data: existingLessons } = await supabase
        .from("lessons")
        .select("id, type, content")
        .eq("course_id", courseId);

      const hasLessons = existingLessons && existingLessons.length > 0;
      const textLessons = (existingLessons || []).filter(l => l.type === "text" || l.type === "practice");
      const emptyTextLessons = textLessons.filter(l =>
        !l.content || l.content === "[]" || l.content === "" || l.content.length < 50
      );
      const testLessons = (existingLessons || []).filter(l => l.type === "test");

      // Step 1: Generate structure if no lessons
      if (!hasLessons) {
        setGeneratingPhase("structure");
        setGeneratingProgress(10);

        const { data: structData, error: structError } = await safeInvoke<any>("gigachat", {
          body: {
            action: "generate_structure",
            courseTitle,
            aiProvider,
            ...(aiProvider === "gigachat" ? { gigachatModel } : { lovableModel }),
          },
        });
        if (structError) throw structError;

        const lessons: { title: string; type: string }[] = structData?.lessons || [];
        for (let i = 0; i < lessons.length; i++) {
          await supabase.from("lessons").insert({
            course_id: courseId,
            title: lessons[i].title,
            type: lessons[i].type || "text",
            order_index: i,
          });
        }
        setGeneratingProgress(25);

        // Re-fetch lessons
        const { data: freshLessons } = await supabase
          .from("lessons")
          .select("id, type, content, title")
          .eq("course_id", courseId);

        if (!freshLessons) throw new Error("Failed to fetch lessons after structure generation");

        // Step 2: Generate content
        await generateContent(courseId, courseTitle, freshLessons);
      } else if (emptyTextLessons.length > 0) {
        // Has structure but missing content
        await generateContent(courseId, courseTitle, existingLessons);
      } else {
        // Has content, check tests
        setGeneratingProgress(60);
      }

      // Step 3: Generate test questions if needed
      const { data: freshLessons2 } = await supabase
        .from("lessons")
        .select("id, type, title")
        .eq("course_id", courseId);

      const freshTests = (freshLessons2 || []).filter(l => l.type === "test");
      for (const test of freshTests) {
        const { data: existingQ } = await supabase
          .from("test_questions")
          .select("id")
          .eq("lesson_id", test.id);

        if (!existingQ || existingQ.length === 0) {
          setGeneratingPhase("questions");
          setGeneratingProgress(70);

          const { data: qData, error: qError } = await safeInvoke<any>("gigachat", {
            body: {
              action: "generate_questions",
              courseTitle,
              lessonTitle: test.title,
              questionsCount: 10,
              aiProvider,
              ...(aiProvider === "gigachat" ? { gigachatModel } : { lovableModel }),
            },
          });
          if (!qError && qData?.questions) {
            for (const q of qData.questions) {
              await supabase.from("test_questions").insert({
                lesson_id: test.id,
                question: q.question,
                options: q.options,
                correct_answer: q.correctAnswer ?? q.correct_answer ?? null,
              });
            }
          }
        }
      }

      // Step 4: Solve unanswered questions
      setGeneratingPhase("answers");
      setGeneratingProgress(85);

      const testIds2 = freshTests.map(t => t.id);
      if (testIds2.length > 0) {
        const { data: allQuestions } = await supabase
          .from("test_questions")
          .select("id, question, options, correct_answer, lesson_id")
          .in("lesson_id", testIds2);

        const unanswered = (allQuestions || []).filter(q =>
          q.correct_answer === null || q.correct_answer === undefined
        );

        if (unanswered.length > 0) {
          // Batch solve
          const BATCH_SIZE = 60;
          for (let i = 0; i < unanswered.length; i += BATCH_SIZE) {
            const batch = unanswered.slice(i, i + BATCH_SIZE);
            const { data: ansData, error: ansError } = await safeInvoke<any>("gigachat", {
              body: {
                action: "generate_answers",
                questions: batch.map(q => ({
                  id: q.id,
                  question: q.question,
                  options: q.options,
                })),
                aiProvider,
                ...(aiProvider === "gigachat" ? { gigachatModel } : { lovableModel }),
              },
            });

            if (!ansError && ansData?.answers) {
              for (const ans of ansData.answers) {
                if (ans.correct_answer !== null && ans.correct_answer !== undefined) {
                  await supabase
                    .from("test_questions")
                    .update({ correct_answer: ans.correct_answer })
                    .eq("id", ans.id);
                }
              }
            }
          }
        }
      }

      // Mark as validated
      const mpCourse = courses.find(c => c.course_id === courseId);
      if (mpCourse) {
        await supabase.from("marketplace_courses").update({ is_validated: true } as any).eq("id", mpCourse.id);
      }

      setGeneratingProgress(100);
      setGeneratingPhase("idle");
      toast.success(`Курс «${courseTitle}» сгенерирован!`);
      onComplete();
      // Re-analyze
      analyzeCategory();
    } catch (e: any) {
      console.error("Generation error:", e);
      toast.error(`Ошибка генерации: ${e.message || "неизвестная ошибка"}`);
      setGeneratingPhase("idle");
    } finally {
      setGeneratingCourseId(null);
      setGeneratingProgress(0);
    }
  };

  const generateContent = async (courseId: string, courseTitle: string, lessons: any[]) => {
    setGeneratingPhase("content");
    const textLessons = lessons.filter((l: any) => (l.type === "text" || l.type === "practice"));
    const emptyOnes = textLessons.filter((l: any) =>
      !l.content || l.content === "[]" || l.content === "" || (l.content && l.content.length < 50)
    );

    for (let i = 0; i < emptyOnes.length; i++) {
      const lesson = emptyOnes[i];
      setGeneratingProgress(25 + Math.round((i / emptyOnes.length) * 35));

      const { data: contentData, error: contentError } = await safeInvoke<any>("gigachat", {
        body: {
          action: "generate_content",
          courseTitle,
          lessonTitle: lesson.title,
          aiProvider,
          ...(aiProvider === "gigachat" ? { gigachatModel } : { lovableModel }),
        },
      });

      if (!contentError && contentData?.content) {
        const blocks = markdownToBlocks(contentData.content);
        const jsonContent = blocksToJson(blocks);
        await supabase
          .from("lessons")
          .update({ content: jsonContent })
          .eq("id", lesson.id);
      }
    }
  };

  // Create new course in category
  const handleCreateCourse = async () => {
    if (!newCourseName.trim() || !selectedCategoryId) return;
    setCreatingCourse(true);
    try {
      // Get or create platform org
      const { data: existingOrg } = await supabase
        .from("organizations")
        .select("id")
        .eq("name", "Платформа Синтагма")
        .maybeSingle();

      const orgId = existingOrg?.id;
      if (!orgId) throw new Error("Organization not found");

      const { data: courseData, error: courseError } = await supabase
        .from("courses")
        .insert({
          title: newCourseName.trim(),
          organization_id: orgId,
          category_id: selectedCategoryId,
          is_published: true,
        })
        .select("id")
        .single();
      if (courseError) throw courseError;

      await supabase.from("marketplace_courses").insert({
        course_id: courseData.id,
        organization_id: orgId,
        price_student: 0,
        price_organization: 0,
        is_active: true,
      });

      toast.success("Курс создан!");
      setNewCourseName("");
      onComplete();
    } catch (e: any) {
      toast.error(`Ошибка: ${e.message}`);
    } finally {
      setCreatingCourse(false);
    }
  };

  // Generate all empty courses in category
  const handleGenerateAll = async () => {
    const emptyOrPartial = categoryCourses.filter(mc => {
      const a = courseAnalyses[mc.course_id];
      if (!a) return true;
      return a.totalLessons === 0 || a.emptyLessons > 0 || a.unansweredQuestions > 0;
    });

    if (emptyOrPartial.length === 0) {
      toast.info("Все курсы в категории уже заполнены");
      return;
    }

    for (const mc of emptyOrPartial) {
      await handleGenerateCourse(mc.course_id, mc.course?.title || "");
    }
  };

  // ── Category Overview ──
  if (!selectedCategoryId) {
    return (
      <div className="space-y-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-primary" />
              Генератор контента
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              Выберите категорию для просмотра и генерации курсов
            </p>
          </CardHeader>
        </Card>

        {categoryGroups.map(group => (
          <Collapsible key={group.type} defaultOpen>
            <Card>
              <CollapsibleTrigger className="w-full">
                <CardHeader className="pb-2 cursor-pointer hover:bg-muted/30 transition-colors">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <ChevronDown className="w-4 h-4 text-muted-foreground transition-transform" />
                      {group.type}
                    </CardTitle>
                    <Badge variant="secondary" className="text-xs">
                      {group.categories.length} категорий
                    </Badge>
                  </div>
                </CardHeader>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <CardContent className="pt-0">
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                    {group.categories.map(cat => {
                      const count = coursesPerCategory(cat.id);
                      return (
                        <button
                          key={cat.id}
                          onClick={() => setSelectedCategoryId(cat.id)}
                          className="flex items-center justify-between p-3 rounded-lg border hover:bg-accent/50 hover:border-primary/30 transition-colors text-left"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <FolderOpen className="w-4 h-4 text-muted-foreground shrink-0" />
                            <span className="text-sm truncate">{cat.name}</span>
                          </div>
                          <Badge variant={count > 0 ? "default" : "outline"} className="text-xs shrink-0 ml-2">
                            {count}
                          </Badge>
                        </button>
                      );
                    })}
                  </div>
                </CardContent>
              </CollapsibleContent>
            </Card>
          </Collapsible>
        ))}
      </div>
    );
  }

  // ── Category Detail View ──
  const totalEmpty = categoryCourses.reduce((sum, mc) => {
    const a = courseAnalyses[mc.course_id];
    return sum + (a ? (a.totalLessons === 0 ? 1 : 0) + a.emptyLessons : 0);
  }, 0);

  const totalUnanswered = categoryCourses.reduce((sum, mc) => {
    const a = courseAnalyses[mc.course_id];
    return sum + (a?.unansweredQuestions || 0);
  }, 0);

  return (
    <div className="space-y-4">
      {/* Header */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setSelectedCategoryId(null)}>
                <ArrowLeft className="w-4 h-4" />
              </Button>
              <div>
                <CardTitle className="text-base">{selectedCategory?.name}</CardTitle>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {categoryCourses.length} курсов
                  {!analyzing && totalEmpty > 0 && <span className="text-amber-600"> • {totalEmpty} без контента</span>}
                  {!analyzing && totalUnanswered > 0 && <span className="text-amber-600"> • {totalUnanswered} нерешённых вопросов</span>}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={analyzeCategory}
                disabled={analyzing}
              >
                {analyzing ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : null}
                Обновить
              </Button>
              <Button
                size="sm"
                onClick={handleGenerateAll}
                disabled={!!generatingCourseId || analyzing || categoryCourses.length === 0}
                className="gap-1.5"
              >
                <Sparkles className="w-3.5 h-3.5" />
                Сгенерировать все
              </Button>
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Generation progress */}
      {generatingCourseId && (
        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="p-4 space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                {PHASE_LABELS[generatingPhase]}
              </span>
              <span className="font-medium">{generatingProgress}%</span>
            </div>
            <Progress value={generatingProgress} className="h-2" />
          </CardContent>
        </Card>
      )}

      {/* Courses table */}
      <Card>
        <CardContent className="p-0">
          {analyzing ? (
            <div className="flex items-center justify-center py-8 text-sm text-muted-foreground gap-2">
              <Loader2 className="w-4 h-4 animate-spin" />
              Анализ курсов...
            </div>
          ) : categoryCourses.length === 0 ? (
            <div className="text-center py-8 text-sm text-muted-foreground">
              Нет курсов в этой категории
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Курс</TableHead>
                  <TableHead className="w-[80px] text-center">Уроки</TableHead>
                  <TableHead className="w-[80px] text-center">Пустые</TableHead>
                  <TableHead className="w-[80px] text-center">Тесты</TableHead>
                  <TableHead className="w-[100px] text-center">Нерешённые</TableHead>
                  <TableHead className="w-[100px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {categoryCourses.map(mc => {
                  const a = courseAnalyses[mc.course_id];
                  const isGenerating = generatingCourseId === mc.course_id;
                  const needsWork = a && (a.totalLessons === 0 || a.emptyLessons > 0 || a.unansweredQuestions > 0);
                  const isReady = a && !needsWork;

                  return (
                    <TableRow key={mc.id}>
                      <TableCell>
                        <div className="flex items-center gap-1.5">
                          {isReady && <CheckCircle2 className="w-3.5 h-3.5 text-green-500 shrink-0" />}
                          {needsWork && <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0" />}
                          <span className="text-sm truncate max-w-[300px]">{mc.course?.title || ""}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-center text-sm">
                        {a ? a.totalLessons : "—"}
                      </TableCell>
                      <TableCell className="text-center text-sm">
                        {a ? (
                          a.emptyLessons > 0 ? (
                            <span className="text-amber-600 font-medium">{a.emptyLessons}</span>
                          ) : (
                            <span className="text-green-600">0</span>
                          )
                        ) : "—"}
                      </TableCell>
                      <TableCell className="text-center text-sm">
                        {a ? a.totalTests : "—"}
                      </TableCell>
                      <TableCell className="text-center text-sm">
                        {a ? (
                          a.unansweredQuestions > 0 ? (
                            <span className="text-amber-600 font-medium">{a.unansweredQuestions}</span>
                          ) : (
                            <span className="text-green-600">0</span>
                          )
                        ) : "—"}
                      </TableCell>
                      <TableCell>
                        <Button
                          size="sm"
                          variant={needsWork ? "default" : "outline"}
                          onClick={() => handleGenerateCourse(mc.course_id, mc.course?.title || "")}
                          disabled={!!generatingCourseId}
                          className="gap-1 h-7 text-xs"
                        >
                          {isGenerating ? (
                            <Loader2 className="w-3 h-3 animate-spin" />
                          ) : (
                            <Sparkles className="w-3 h-3" />
                          )}
                          {a?.totalLessons === 0 ? "Создать" : "Заполнить"}
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Create new course */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center gap-2">
            <Plus className="w-4 h-4 text-muted-foreground shrink-0" />
            <Input
              placeholder="Название нового курса..."
              value={newCourseName}
              onChange={e => setNewCourseName(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleCreateCourse()}
              className="h-9"
            />
            <Button
              size="sm"
              onClick={handleCreateCourse}
              disabled={!newCourseName.trim() || creatingCourse}
              className="gap-1 shrink-0"
            >
              {creatingCourse ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
              Создать
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
