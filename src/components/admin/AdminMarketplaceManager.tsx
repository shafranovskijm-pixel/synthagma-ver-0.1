import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  Store, Plus, Search, Edit, Trash2, Eye, Loader2,
  Package, ShoppingCart, Building2, Users, Tag, Sparkles, BookOpen, Upload,
  List, LayoutGrid, ChevronDown, FolderPlus, FolderInput, CheckCircle2, AlertTriangle,
  FolderOpen,
} from "lucide-react";
import { BulkCourseImporter } from "./BulkCourseImporter";
import { BulkContentGenerator } from "./BulkContentGenerator";
import { BulkPipelineWidget } from "./BulkPipelineWidget";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { format } from "date-fns";
import { ru } from "date-fns/locale";
import { useAdminMarketplace } from "@/hooks/useAdminMarketplace";
import { markdownToBlocks, blocksToJson } from "@/components/course-builder/BlockEditor";

const statusLabels: Record<string, { label: string; color: string }> = {
  pending: { label: "Ожидает", color: "bg-yellow-500/10 text-yellow-600 border-yellow-500/20" },
  approved: { label: "Одобрена", color: "bg-blue-500/10 text-blue-600 border-blue-500/20" },
  paid: { label: "Оплачена", color: "bg-green-500/10 text-green-600 border-green-500/20" },
  completed: { label: "Завершена", color: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20" },
  cancelled: { label: "Отменена", color: "bg-red-500/10 text-red-600 border-red-500/20" },
};

function renderCourseRow(
  item: any, h: any, navigate: any, onBulkGenerate: (item: any) => void,
  validatedCourses: Record<string, 'ok' | 'error'>, onValidate: (courseId: string) => void, validatingId: string | null
) {
  const status = validatedCourses[item.course_id];
  return (
    <TableRow key={item.id} className={!item.is_active ? "opacity-60" : ""}>
      <TableCell>
        <button
          className="text-sm text-left hover:underline cursor-pointer inline-flex items-center gap-1.5"
          onClick={() => onValidate(item.course_id)}
          disabled={validatingId === item.course_id}
        >
          {validatingId === item.course_id && <Loader2 className="w-3 h-3 animate-spin" />}
          {status === 'ok' && <CheckCircle2 className="w-3.5 h-3.5 text-green-500 shrink-0" />}
          {status === 'error' && <AlertTriangle className="w-3.5 h-3.5 text-red-500 shrink-0" />}
          {h.extractShortTitle(item.course?.title)}
        </button>
      </TableCell>
      <TableCell className="w-[100px] text-sm">{item.price_student.toLocaleString()} ₽</TableCell>
      <TableCell className="w-[100px] text-sm">{item.price_organization.toLocaleString()} ₽</TableCell>
      <TableCell className="w-[60px]">
        <Switch checked={item.is_active} onCheckedChange={() => h.handleToggleActive(item)} />
      </TableCell>
      <TableCell className="w-[130px]">
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="h-8 w-8" title="Войти" onClick={() => navigate(`/course-builder/${item.course_id}`)}>
            <Eye className="w-3.5 h-3.5" />
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8" title="Просмотр" onClick={() => onBulkGenerate(item)}>
            <FolderOpen className="w-3.5 h-3.5" />
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8" title="Редактировать" onClick={() => { h.setEditingCourse(item); h.setShowEditDialog(true); }}>
            <Edit className="w-3.5 h-3.5" />
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => h.handleDeleteCourse(item.id)}>
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
}

export function AdminMarketplaceManager() {
  const navigate = useNavigate();
  const h = useAdminMarketplace();
  const [isGeneratingDesc, setIsGeneratingDesc] = useState(false);
  const [isGeneratingShortDesc, setIsGeneratingShortDesc] = useState(false);
  const [bulkGenCourse, setBulkGenCourse] = useState<{ id: string; title: string; description?: string } | null>(null);
  const [validatedCourses, setValidatedCourses] = useState<Record<string, 'ok' | 'error'>>({});
  const [validatingId, setValidatingId] = useState<string | null>(null);
  const [bulkValidatingGroup, setBulkValidatingGroup] = useState<string | null>(null);
  const [bulkValidateProgress, setBulkValidateProgress] = useState("");
  const [bulkFixing, setBulkFixing] = useState(false);
  const [converting, setConverting] = useState(false);

  // Initialize validated state from DB on courses load
  useEffect(() => {
    const init: Record<string, 'ok' | 'error'> = {};
    h.courses.forEach((c: any) => {
      if (c.is_validated) init[c.course_id] = 'ok';
    });
    setValidatedCourses(init);
  }, [h.courses]);

  const handleValidateCourse = async (courseId: string) => {
    setValidatingId(courseId);
    try {
      const { data: lessons } = await supabase
        .from("lessons").select("id, title, type, content").eq("course_id", courseId);
      const issues: string[] = [];

      if (!lessons?.length) {
        issues.push("Нет уроков");
      } else {
        // Check minimum structure: must have text/practice lessons AND tests
        const textLessons = lessons.filter(l => l.type === "text" || l.type === "practice");
        const testLessons = lessons.filter(l => l.type === "test");

        if (textLessons.length === 0) {
          issues.push("Нет учебных уроков (текст/практика)");
        }
        if (testLessons.length === 0) {
          issues.push("Нет тестов");
        }
        if (lessons.length < 3) {
          issues.push(`Слишком мало уроков (${lessons.length}, нужно минимум 3)`);
        }

        // Check empty content in text/practice lessons
        const emptyLessons = textLessons.filter(l =>
          !l.content || l.content === "[]" || l.content === "" || l.content.length < 50
        );
        if (emptyLessons.length) issues.push(`${emptyLessons.length} уроков без контента`);

        // Check filled lessons have substantial content
        const filledLessons = textLessons.filter(l =>
          l.content && l.content !== "[]" && l.content !== "" && l.content.length >= 50
        );
        if (textLessons.length > 0 && filledLessons.length === 0) {
          issues.push("Ни один урок не содержит учебного материала");
        }

        // Check duplicates
        const titles = lessons.map(l => l.title);
        const dupes = titles.filter((t, i) => titles.indexOf(t) !== i);
        if (dupes.length) issues.push(`Дубликаты: ${[...new Set(dupes)].join(", ")}`);

        // Check tests
        const testIds = testLessons.map(l => l.id);
        if (testIds.length) {
          const { data: questions } = await supabase
            .from("test_questions").select("id, lesson_id, correct_answer, explanation, question, options").in("lesson_id", testIds);
          const testsWithNoQ = testIds.filter(id => !questions?.some(q => q.lesson_id === id));
          
          // Detect suspicious: all same answer + no explanations in a lesson
          const byL = new Map<string, any[]>();
          for (const q of questions || []) { const a = byL.get(q.lesson_id) || []; a.push(q); byL.set(q.lesson_id, a); }
          const susL = new Set<string>();
          for (const [lid, qs] of byL) {
            if (qs.length > 3 && qs.every((q: any) => q.correct_answer === qs[0]?.correct_answer) && qs.every((q: any) => !q.explanation)) susL.add(lid);
          }
          const unansweredQuestions = questions?.filter(q => q.correct_answer === null || q.correct_answer === undefined || susL.has(q.lesson_id)) || [];
          
          if (testsWithNoQ.length) issues.push(`${testsWithNoQ.length} тестов без вопросов`);
          if (unansweredQuestions.length) issues.push(`${unansweredQuestions.length} вопросов без ответа`);
        }
      }

      const isOk = issues.length === 0;
      setValidatedCourses(prev => ({ ...prev, [courseId]: isOk ? 'ok' : 'error' }));
      
      // Persist to DB
      const mpCourse = h.courses.find((c: any) => c.course_id === courseId);
      if (mpCourse) {
        await supabase.from("marketplace_courses").update({ is_validated: isOk } as any).eq("id", mpCourse.id);
      }
      
      if (issues.length > 0) {
        const mpItem = h.courses.find((c: any) => c.course_id === courseId);
        toast.error("Проблемы курса", {
          description: issues.join(" • "),
          duration: 12000,
          action: {
            label: "Исправить ИИ",
            onClick: () => {
              autoFixCourse(courseId, mpItem?.course?.title || "");
            },
          },
        });
      } else {
        toast.success("Курс готов ✅");
      }
      // Refresh to move course between folders
      h.fetchData();
    } catch (e) {
      console.error(e);
      toast.error("Ошибка проверки");
    } finally {
      setValidatingId(null);
    }
  };

  const handleBulkValidate = async (group: any) => {
    if (bulkValidatingGroup) return;
    setBulkValidatingGroup(group.category);
    let okCount = 0;
    let errCount = 0;
    const total = group.courses.length;
    const failedCourses: { courseId: string; title: string }[] = [];

    for (let i = 0; i < total; i++) {
      const item = group.courses[i];
      setBulkValidateProgress(`${i + 1}/${total}...`);
      try {
        const { data: lessons } = await supabase
          .from("lessons").select("id, title, type, content").eq("course_id", item.course_id);
        const issues: string[] = [];

        if (!lessons?.length) {
          issues.push("Нет уроков");
        } else {
          const textLessons = lessons.filter(l => l.type === "text" || l.type === "practice");
          const testLessons = lessons.filter(l => l.type === "test");
          if (textLessons.length === 0) issues.push("Нет учебных уроков");
          if (testLessons.length === 0) issues.push("Нет тестов");
          if (lessons.length < 3) issues.push("Мало уроков");
          const emptyLessons = textLessons.filter(l => !l.content || l.content === "[]" || l.content === "" || l.content.length < 50);
          if (emptyLessons.length) issues.push(`${emptyLessons.length} без контента`);
          const titles = lessons.map(l => l.title);
          const dupes = titles.filter((t, i) => titles.indexOf(t) !== i);
          if (dupes.length) issues.push("Дубликаты");
          const testIds = testLessons.map(l => l.id);
          if (testIds.length) {
            const { data: questions } = await supabase
              .from("test_questions").select("id, lesson_id, correct_answer, explanation").in("lesson_id", testIds);
            const testsWithNoQ = testIds.filter(id => !questions?.some(q => q.lesson_id === id));
            const byL = new Map<string, any[]>();
            for (const q of questions || []) { const a = byL.get(q.lesson_id) || []; a.push(q); byL.set(q.lesson_id, a); }
            const susL = new Set<string>();
            for (const [lid, qs] of byL) {
              if (qs.length > 3 && qs.every((q: any) => q.correct_answer === qs[0]?.correct_answer) && qs.every((q: any) => !q.explanation)) susL.add(lid);
            }
            const unanswered = questions?.filter(q => q.correct_answer === null || q.correct_answer === undefined || susL.has(q.lesson_id)) || [];
            if (testsWithNoQ.length) issues.push(`${testsWithNoQ.length} тестов без вопросов`);
            if (unanswered.length) issues.push(`${unanswered.length} без ответа`);
          }
        }

        const isOk = issues.length === 0;
        setValidatedCourses(prev => ({ ...prev, [item.course_id]: isOk ? 'ok' : 'error' }));
        await supabase.from("marketplace_courses").update({ is_validated: isOk } as any).eq("id", item.id);
        if (isOk) {
          okCount++;
        } else {
          errCount++;
          failedCourses.push({ courseId: item.course_id, title: item.course?.title || "" });
        }
      } catch (e) {
        console.error("Bulk validate error for", item.course_id, e);
        setValidatedCourses(prev => ({ ...prev, [item.course_id]: 'error' }));
        errCount++;
        failedCourses.push({ courseId: item.course_id, title: item.course?.title || "" });
      }
    }

    setBulkValidatingGroup(null);
    setBulkValidateProgress("");

    if (errCount > 0) {
      toast.info(`Проверено ${total}: ✅ ${okCount}, ❌ ${errCount}. Запускаем авто-исправление...`);
      handleBulkAutoFix(failedCourses);
    } else {
      toast.success(`Проверено ${total}: ✅ ${okCount} готово`);
    }
    h.fetchData();
  };


  const handleBulkAutoFix = async (courses: { courseId: string; title: string }[]) => {
    if (bulkFixing) return;
    setBulkFixing(true);
    const total = courses.length;
    let fixed = 0;
    let failed = 0;

    for (let i = 0; i < total; i++) {
      const { courseId, title } = courses[i];
      toast.loading(`Исправляю ${i + 1}/${total}: ${title.slice(0, 40)}...`, { id: "bulk-fix-progress", duration: Infinity });
      try {
        await autoFixCourse(courseId, title);
        fixed++;
      } catch (e) {
        console.error("Bulk fix error for", courseId, e);
        failed++;
      }
    }

    toast.dismiss("bulk-fix-progress");
    setBulkFixing(false);
    toast.success(`Исправление завершено: ✅ ${fixed} исправлено${failed > 0 ? `, ❌ ${failed} с ошибками` : ""}`, { duration: 10000 });
    h.fetchData();
  };

  const autoFixCourse = async (courseId: string, courseTitle: string) => {
    const toastId = toast.loading("Анализирую курс...", { duration: Infinity });

    try {
      // 1. Fetch fresh data from DB
      let { data: lessons } = await supabase
        .from("lessons").select("id, title, type, content, order_index").eq("course_id", courseId).order("order_index");

      const currentLessons = lessons || [];
      const textPracticeLessons = currentLessons.filter(l => l.type === "text" || l.type === "practice");
      const testLessons = currentLessons.filter(l => l.type === "test");
      const needsStructure = textPracticeLessons.length === 0 || currentLessons.length < 3;

      // If course needs structural fix (missing text lessons or too few lessons), generate structure first
      if (needsStructure) {
        toast.loading("Генерирую структуру курса...", { id: toastId });
        try {
          const { data: structData, error: structErr } = await supabase.functions.invoke("generate-course-structure", {
            body: { title: courseTitle, description: "" },
          });
          if (structErr) throw structErr;
          const generatedLessons: Array<{ title: string; type: string }> = structData?.lessons || [];
          if (generatedLessons.length > 0) {
            // Determine max order_index
            const maxOrder = currentLessons.reduce((mx, l) => Math.max(mx, l.order_index ?? 0), -1);
            // Filter out lessons that would be duplicates by title
            const existingTitles = new Set(currentLessons.map(l => l.title.toLowerCase()));
            const newLessons = generatedLessons
              .filter(gl => !existingTitles.has(gl.title.toLowerCase()))
              .filter(gl => gl.type !== "test"); // Never create new test lessons
            if (newLessons.length > 0) {
              const toInsert = newLessons.map((gl, i) => ({
                course_id: courseId,
                title: gl.title,
                type: gl.type || "text",
                order_index: maxOrder + 1 + i,
                content: null,
              }));
              await supabase.from("lessons").insert(toInsert);
            }
            // Re-fetch lessons after structural changes
            const { data: refreshed } = await supabase
              .from("lessons").select("id, title, type, content, order_index").eq("course_id", courseId).order("order_index");
            lessons = refreshed;
          }
        } catch (e) {
          console.error("Structure generation failed:", e);
        }
      }

      const allLessons = lessons || [];
      const emptyLessons = allLessons.filter(l =>
        (l.type === "text" || l.type === "practice") && (!l.content || l.content === "[]" || l.content === "" || l.content.length < 50)
      );

      const testIds = allLessons.filter(l => l.type === "test").map(l => l.id);
      let allQuestions: Array<{ id: string; lesson_id: string; correct_answer: number | null; explanation?: string | null; question: string; options: any }> = [];

      if (testIds.length) {
        const { data: questions } = await supabase
          .from("test_questions").select("id, lesson_id, correct_answer, explanation, question, options").in("lesson_id", testIds);
        allQuestions = (questions || []) as typeof allQuestions;
      }


      // Find unanswered questions (including suspicious: all same answer, no explanations)
      const byLessonFix = new Map<string, any[]>();
      for (const q of allQuestions) { const a = byLessonFix.get(q.lesson_id) || []; a.push(q); byLessonFix.set(q.lesson_id, a); }
      const suspiciousFix = new Set<string>();
      for (const [lid, qs] of byLessonFix) {
        if (qs.length > 3 && qs.every((q: any) => q.correct_answer === qs[0]?.correct_answer) && qs.every((q: any) => !q.explanation)) suspiciousFix.add(lid);
      }
      const unansweredQuestions = allQuestions.filter(q => q.correct_answer === null || q.correct_answer === undefined || suspiciousFix.has(q.lesson_id));

      // Find duplicate titles
      const titleCounts = new Map<string, Array<{ id: string; title: string }>>();
      for (const l of allLessons) {
        const arr = titleCounts.get(l.title) || [];
        arr.push(l);
        titleCounts.set(l.title, arr);
      }
      const duplicateGroups = [...titleCounts.values()].filter(g => g.length > 1);

      const totalTasks = emptyLessons.length + (unansweredQuestions.length > 0 ? 1 : 0) + (duplicateGroups.length > 0 ? 1 : 0);
      if (totalTasks === 0 && !needsStructure) { toast.info("Нечего исправлять", { id: toastId, duration: 3000 }); return; }
      if (totalTasks === 0) { toast.success("Структура создана! Повторная проверка...", { id: toastId, duration: 3000 }); setTimeout(() => handleValidateCourse(courseId), 1000); return; }

      let completed = 0;

      // 2. Generate content for empty lessons (parallel, concurrency=2)
      const CONCURRENCY = 2;
      for (let i = 0; i < emptyLessons.length; i += CONCURRENCY) {
        const chunk = emptyLessons.slice(i, i + CONCURRENCY);
        const promises = chunk.map(async (lesson) => {
          completed++;
          toast.loading(`Генерирую контент: "${lesson.title}" (${completed}/${totalTasks})`, { id: toastId });
          try {
            const { data, error } = await supabase.functions.invoke("gigachat", {
              body: {
                action: "generate_content",
                courseTitle,
                lessonTitle: lesson.title,
                existingContent: null,
              },
            });
            if (error) throw error;
            if (data?.content) {
              const blocks = markdownToBlocks(data.content);
              const jsonContent = blocks.length > 0 ? blocksToJson(blocks) : data.content;
              await supabase.from("lessons").update({ content: jsonContent }).eq("id", lesson.id);
            }
          } catch (e) {
            console.error(`Failed to generate content for lesson ${lesson.id}:`, e);
          }
        });
        await Promise.allSettled(promises);
      }

      // 3. Solve existing unanswered test questions (parallel, concurrency=2)
      if (unansweredQuestions.length > 0) {
        completed++;
        toast.loading(`Решаю тесты: ${unansweredQuestions.length} вопросов (${completed}/${totalTasks})`, { id: toastId });

        const byLesson = new Map<string, typeof unansweredQuestions>();
        for (const q of unansweredQuestions) {
          const arr = byLesson.get(q.lesson_id) || [];
          arr.push(q);
          byLesson.set(q.lesson_id, arr);
        }

        const lessonEntries = Array.from(byLesson.entries());
        for (let i = 0; i < lessonEntries.length; i += CONCURRENCY) {
          const chunk = lessonEntries.slice(i, i + CONCURRENCY);
          const promises = chunk.map(async ([lessonId, questions]) => {
            const lessonInfo = lessons?.find(l => l.id === lessonId);
            const batchSize = 20;
            for (let j = 0; j < questions.length; j += batchSize) {
              const batch = questions.slice(j, j + batchSize);
              try {
                const { data, error } = await supabase.functions.invoke("gigachat", {
                  body: {
                    action: "generate_answers",
                    courseTitle,
                    lessonTitle: lessonInfo?.title || "Тест",
                    questions: batch.map(q => ({
                      question: q.question,
                      options: q.options || [],
                    })),
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
                console.error(`Failed to solve test batch for lesson ${lessonId}:`, e);
              }
            }
          });
          await Promise.allSettled(promises);
        }
      }

      // 5. Fix duplicate titles
      if (duplicateGroups.length > 0) {
        completed++;
        toast.loading(`Исправляю дубликаты заголовков (${completed}/${totalTasks})`, { id: toastId });
        for (const group of duplicateGroups) {
          for (let i = 1; i < group.length; i++) {
            const newTitle = `${group[i].title} (${i + 1})`;
            await supabase.from("lessons").update({ title: newTitle }).eq("id", group[i].id);
          }
        }
      }

      toast.success(`Курс исправлен! Повторная проверка...`, { id: toastId, duration: 3000 });
      // Re-validate
      setTimeout(() => handleValidateCourse(courseId), 1000);
    } catch (e) {
      console.error("Auto-fix error:", e);
      toast.error("Ошибка автоисправления", { id: toastId, duration: 5000 });
    }
  };

  const handleBulkGenerate = (item: any) => {
    setBulkGenCourse({ id: item.course_id, title: item.course?.title || "", description: item.course?.description || "" });
  };

  const handleGenerateDescription = async () => {
    if (!h.newTitle.trim()) { toast.error("Сначала введите название курса"); return; }
    setIsGeneratingDesc(true);
    try {
      const { data, error } = await supabase.functions.invoke("generate-course-content", {
        body: { contentType: "description", courseTitle: h.newTitle },
      });
      if (error) throw error;
      if (data?.content) h.setNewDescription(data.content);
    } catch (e: any) {
      console.error(e);
      toast.error("Ошибка генерации описания");
    } finally {
      setIsGeneratingDesc(false);
    }
  };

  const handleGenerateShortDesc = async () => {
    if (!h.newTitle.trim()) { toast.error("Сначала введите название курса"); return; }
    setIsGeneratingShortDesc(true);
    try {
      const { data, error } = await supabase.functions.invoke("generate-course-content", {
        body: { contentType: "short_description", courseTitle: h.newTitle, courseDescription: h.newDescription },
      });
      if (error) throw error;
      if (data?.content) h.setNewShortDesc(data.content);
    } catch (e: any) {
      console.error(e);
      toast.error("Ошибка генерации описания");
    } finally {
      setIsGeneratingShortDesc(false);
    }
  };

  if (h.isLoading && h.courses.length === 0) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Tabs value={h.activeTab} onValueChange={(v) => h.setActiveTab(v as any)} className="space-y-6">
        <TabsList className="grid w-full grid-cols-4 max-w-2xl">
          <TabsTrigger value="catalog" className="flex items-center gap-2">
            <Package className="w-4 h-4" />Каталог
          </TabsTrigger>
          <TabsTrigger value="create" className="flex items-center gap-2">
            <Plus className="w-4 h-4" />Создать курс
          </TabsTrigger>
          <TabsTrigger value="import" className="flex items-center gap-2">
            <Upload className="w-4 h-4" />Импорт
          </TabsTrigger>
          <TabsTrigger value="orders" className="flex items-center gap-2">
            <ShoppingCart className="w-4 h-4" />Заявки
          </TabsTrigger>
        </TabsList>

        {/* Catalog */}
        <TabsContent value="catalog" className="space-y-4">
          {/* Pipeline widget */}
          <BulkPipelineWidget
            courses={h.courses.filter((c: any) => !c.is_validated)}
            readyCourses={h.courses.filter((c: any) => c.is_validated === true)}
            allCourses={h.courses}
            onComplete={() => h.fetchData()}
          />
          {/* Search + view toggle */}
          <div className="flex items-center gap-4">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Поиск курсов..."
                value={h.searchQuery}
                onChange={(e) => h.setSearchQuery(e.target.value)}
                className="pl-10 rounded-xl"
              />
            </div>
            <div className="flex items-center gap-1 border rounded-lg p-0.5">
              <Button variant={h.viewMode === "list" ? "default" : "ghost"} size="icon" className="h-8 w-8" onClick={() => h.setViewMode("list")}>
                <List className="w-4 h-4" />
              </Button>
              <Button variant={h.viewMode === "grid" ? "default" : "ghost"} size="icon" className="h-8 w-8" onClick={() => h.setViewMode("grid")}>
                <LayoutGrid className="w-4 h-4" />
              </Button>
            </div>
            <Button variant="outline" size="sm" className="rounded-xl" onClick={() => h.setShowCategoryDialog(true)}>
              <FolderPlus className="w-4 h-4 mr-1.5" />Категория
            </Button>
            <Badge variant="secondary">{h.filteredCourses.length} курсов</Badge>
          </div>

          {h.filteredCourses.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="py-12 text-center">
                <Package className="w-12 h-12 text-muted-foreground/50 mx-auto mb-4" />
                <p className="text-muted-foreground">Курсы не найдены</p>
              </CardContent>
            </Card>
          ) : h.viewMode === "list" ? (
            /* Grouped accordion list view */
            <div className="space-y-2">
              {h.groupedCourses.map((group) => (
                <Collapsible key={group.category}>
                  <Card>
              <CollapsibleTrigger className="flex items-center justify-between w-full px-4 py-3 hover:bg-secondary/30 transition-colors rounded-t-xl group">
                       <div className="flex items-center gap-3">
                         <ChevronDown className="w-4 h-4 text-muted-foreground transition-transform group-data-[state=closed]:-rotate-90" />
                         <span className="font-semibold text-sm text-left">{group.category}</span>
                         {group.status === 'ready' && (
                           <>
                             <Badge className="bg-green-500/10 text-green-600 border-green-500/20 text-[10px]">Готово</Badge>
                             <Button
                               variant="ghost"
                               size="sm"
                               className="h-6 text-xs px-2"
                               disabled={!!bulkValidatingGroup}
                               onClick={(e) => { e.stopPropagation(); handleBulkValidate(group); }}
                             >
                               {bulkValidatingGroup === group.category
                                 ? <><Loader2 className="w-3 h-3 animate-spin mr-1" />{bulkValidateProgress}</>
                                 : <><CheckCircle2 className="w-3 h-3 mr-1" />Проверить все</>}
                             </Button>
                           </>
                         )}
                         {group.status === 'progress' && (
                           <Badge className="bg-yellow-500/10 text-yellow-600 border-yellow-500/20 text-[10px]">В работе</Badge>
                         )}
                       </div>
                       <Badge variant="secondary" className="shrink-0">{group.courses.length}</Badge>
                     </CollapsibleTrigger>
                    <CollapsibleContent>
                      {group.subGroups ? (
                        <div className="space-y-1 pb-2">
                          {group.subGroups.map((sub) => (
                            <Collapsible key={sub.category}>
                              <CollapsibleTrigger className="flex items-center justify-between w-full px-6 py-2 hover:bg-secondary/20 transition-colors group">
                                <div className="flex items-center gap-2">
                                  <ChevronDown className="w-3.5 h-3.5 text-muted-foreground transition-transform group-data-[state=closed]:-rotate-90" />
                                  <span className="text-sm font-medium text-left">{sub.category}</span>
                                </div>
                                <Badge variant="outline" className="shrink-0 text-xs">{sub.courses.length}</Badge>
                              </CollapsibleTrigger>
                              <CollapsibleContent>
                                <Table>
                                  <TableBody>
                                    {sub.courses.map((item) => renderCourseRow(item, h, navigate, handleBulkGenerate, validatedCourses, handleValidateCourse, validatingId))}
                                  </TableBody>
                                </Table>
                              </CollapsibleContent>
                            </Collapsible>
                          ))}
                        </div>
                      ) : (
                        <Table>
                          <TableBody>
                            {group.courses.map((item) => renderCourseRow(item, h, navigate, handleBulkGenerate, validatedCourses, handleValidateCourse, validatingId))}
                          </TableBody>
                        </Table>
                      )}
                    </CollapsibleContent>
                  </Card>
                </Collapsible>
              ))}
            </div>
          ) : (
            /* Grid view */
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
              {h.filteredCourses.map((item) => (
                <Card key={item.id} className={`overflow-hidden ${!item.is_active ? "opacity-60" : ""}`}>
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between gap-2">
                      <CardTitle className="text-base leading-tight flex-1">{item.course?.title}</CardTitle>
                      <Badge variant={item.is_active ? "default" : "secondary"} className="shrink-0">
                        {item.is_active ? "Активен" : "Скрыт"}
                      </Badge>
                    </div>
                    <CardDescription className="flex items-center gap-1 text-xs">
                      <Building2 className="w-3 h-3" />
                      {item.organization?.name || "Платформа"}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {item.description_short && (
                      <p className="text-sm text-muted-foreground line-clamp-2">{item.description_short}</p>
                    )}
                    <div className="grid grid-cols-2 gap-2">
                      <div className="text-center p-2 bg-secondary/50 rounded-lg">
                        <div className="text-[10px] text-muted-foreground">Студенты</div>
                        <div className="font-semibold text-sm">{item.price_student.toLocaleString()} ₽</div>
                      </div>
                      <div className="text-center p-2 bg-secondary/50 rounded-lg">
                        <div className="text-[10px] text-muted-foreground">Организации</div>
                        <div className="font-semibold text-sm">{item.price_organization.toLocaleString()} ₽</div>
                      </div>
                    </div>
                    <div className="flex items-center justify-between pt-1">
                      <div className="flex items-center gap-2">
                        <Switch checked={item.is_active} onCheckedChange={() => h.handleToggleActive(item)} />
                        <span className="text-xs text-muted-foreground">{item.is_active ? "Виден" : "Скрыт"}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <Button variant="ghost" size="icon" className="h-8 w-8" title="AI контент" onClick={() => handleBulkGenerate(item)}>
                          <Sparkles className="w-3.5 h-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8" title="Переместить в категорию" onClick={() => { h.setMovingCourse(item); h.setTargetCategory(h.extractCategory(item.course?.title)); h.setShowMoveCategoryDialog(true); }}>
                          <FolderInput className="w-3.5 h-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8" title="Редактировать уроки" onClick={() => navigate(`/course-builder/${item.course_id}`)}>
                          <BookOpen className="w-3.5 h-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8" title="Редактировать курс" onClick={() => { h.setEditingCourse(item); h.setShowEditDialog(true); }}>
                          <Edit className="w-3.5 h-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => h.handleDeleteCourse(item.id)}>
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* Create Course */}
        <TabsContent value="create" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="font-display">Создать курс для маркетплейса</CardTitle>
              <CardDescription>Курс будет создан от имени платформы</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Название курса *</Label>
                <Input value={h.newTitle} onChange={(e) => h.setNewTitle(e.target.value)} placeholder="Название курса" className="rounded-xl" />
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Описание</Label>
                  <Button variant="ghost" size="sm" onClick={handleGenerateDescription} disabled={isGeneratingDesc || !h.newTitle.trim()}>
                    {isGeneratingDesc ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : <Sparkles className="w-3.5 h-3.5 mr-1" />}
                    Сгенерировать с ИИ
                  </Button>
                </div>
                <Textarea value={h.newDescription} onChange={(e) => h.setNewDescription(e.target.value)} placeholder="Подробное описание курса..." className="rounded-xl" rows={3} />
              </div>
              <div className="space-y-2">
                <Label>Длительность</Label>
                <Input value={h.newDuration} onChange={(e) => h.setNewDuration(e.target.value)} placeholder="40 часов" className="rounded-xl" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Цена для студентов (₽) *</Label>
                  <Input type="number" value={h.newPriceStudent} onChange={(e) => h.setNewPriceStudent(e.target.value)} placeholder="5000" className="rounded-xl" />
                </div>
                <div className="space-y-2">
                  <Label>Цена для организаций (₽) *</Label>
                  <Input type="number" value={h.newPriceOrg} onChange={(e) => h.setNewPriceOrg(e.target.value)} placeholder="3000" className="rounded-xl" />
                </div>
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Краткое описание для каталога</Label>
                  <Button variant="ghost" size="sm" onClick={handleGenerateShortDesc} disabled={isGeneratingShortDesc || !h.newTitle.trim()}>
                    {isGeneratingShortDesc ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : <Sparkles className="w-3.5 h-3.5 mr-1" />}
                    Сгенерировать с ИИ
                  </Button>
                </div>
                <Textarea value={h.newShortDesc} onChange={(e) => h.setNewShortDesc(e.target.value)} placeholder="Краткое описание..." className="rounded-xl" rows={2} />
              </div>
              <Button
                className="w-full btn-gradient rounded-xl"
                onClick={async () => {
                  const courseId = await h.handleCreateCourse();
                  if (courseId) {
                    navigate(`/course-builder/${courseId}`);
                  }
                }}
                disabled={h.isCreating || !h.newTitle.trim() || !h.newPriceStudent || !h.newPriceOrg}
              >
                {h.isCreating ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Создание...</> : <><Plus className="w-4 h-4 mr-2" />Создать и перейти к редактированию</>}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Import */}
        <TabsContent value="import" className="space-y-6">
          <BulkCourseImporter onComplete={() => {
            h.fetchData();
            h.setActiveTab("catalog");
          }} />
        </TabsContent>

        {/* Orders */}
        <TabsContent value="orders" className="space-y-6">
          {h.orders.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="py-12 text-center">
                <ShoppingCart className="w-12 h-12 text-muted-foreground/50 mx-auto mb-4" />
                <p className="text-muted-foreground">Заявок пока нет</p>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Курс</TableHead>
                    <TableHead>Продавец</TableHead>
                    <TableHead>Покупатель</TableHead>
                    <TableHead>Сумма</TableHead>
                    <TableHead>Статус</TableHead>
                    <TableHead>Дата</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {h.orders.map((order) => (
                    <TableRow key={order.id}>
                      <TableCell className="font-medium">{order.marketplace_course?.course?.title || "—"}</TableCell>
                      <TableCell className="text-muted-foreground">{order.marketplace_course?.organization?.name || "Платформа"}</TableCell>
                      <TableCell>
                        {order.buyer_organization ? order.buyer_organization.name : order.buyer_type === "student" ? "Студент" : "—"}
                      </TableCell>
                      <TableCell className="font-semibold">{order.price.toLocaleString()} ₽</TableCell>
                      <TableCell>
                        <Badge className={statusLabels[order.status]?.color || ""}>
                          {statusLabels[order.status]?.label || order.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {format(new Date(order.created_at), "dd.MM.yyyy", { locale: ru })}
                      </TableCell>
                      <TableCell>
                        <Button variant="ghost" size="sm" onClick={() => { h.setSelectedOrder(order); h.setShowOrderDialog(true); }}>
                          <Eye className="w-4 h-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          )}
        </TabsContent>


      </Tabs>

      {/* Edit Dialog */}
      <Dialog open={h.showEditDialog} onOpenChange={h.setShowEditDialog}>
        <DialogContent className="rounded-2xl max-w-md">
          <DialogHeader>
            <DialogTitle>Редактировать курс</DialogTitle>
          </DialogHeader>
          {h.editingCourse && (
            <div className="space-y-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Цена для студентов (₽)</Label>
                  <Input
                    type="number"
                    value={h.editingCourse.price_student}
                    onChange={(e) => h.setEditingCourse({ ...h.editingCourse!, price_student: parseFloat(e.target.value) || 0 })}
                    className="rounded-xl"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Цена для организаций (₽)</Label>
                  <Input
                    type="number"
                    value={h.editingCourse.price_organization}
                    onChange={(e) => h.setEditingCourse({ ...h.editingCourse!, price_organization: parseFloat(e.target.value) || 0 })}
                    className="rounded-xl"
                  />
              </div>
              </div>
              <div className="space-y-2">
                <Label>Длительность</Label>
                <Input
                  value={h.editingCourse.course?.duration || ""}
                  onChange={(e) => h.setEditingCourse({ ...h.editingCourse!, course: { ...h.editingCourse!.course!, duration: e.target.value } })}
                  placeholder="40 часов"
                  className="rounded-xl"
                />
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Краткое описание</Label>
                  <Button variant="ghost" size="sm" onClick={async () => {
                    if (!h.editingCourse?.course?.title) { toast.error("Нет названия курса"); return; }
                    setIsGeneratingShortDesc(true);
                    try {
                      const { data, error } = await supabase.functions.invoke("generate-course-content", {
                        body: { contentType: "short_description", courseTitle: h.editingCourse.course.title, courseDescription: h.editingCourse.course.description },
                      });
                      if (error) throw error;
                      if (data?.content) h.setEditingCourse({ ...h.editingCourse!, description_short: data.content });
                    } catch { toast.error("Ошибка генерации"); } finally { setIsGeneratingShortDesc(false); }
                  }} disabled={isGeneratingShortDesc}>
                    {isGeneratingShortDesc ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : <Sparkles className="w-3.5 h-3.5 mr-1" />}
                    Сгенерировать с ИИ
                  </Button>
                </div>
                <Textarea
                  value={h.editingCourse.description_short || ""}
                  onChange={(e) => h.setEditingCourse({ ...h.editingCourse!, description_short: e.target.value })}
                  className="rounded-xl"
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button className="w-full btn-gradient rounded-xl" onClick={h.handleEditCourse}>Сохранить</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Order Details Dialog */}
      <Dialog open={h.showOrderDialog} onOpenChange={h.setShowOrderDialog}>
        <DialogContent className="rounded-2xl max-w-md">
          <DialogHeader>
            <DialogTitle>Детали заявки</DialogTitle>
          </DialogHeader>
          {h.selectedOrder && (
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">Курс</p>
                <p className="font-medium">{h.selectedOrder.marketplace_course?.course?.title}</p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">Сумма</p>
                  <p className="font-semibold">{h.selectedOrder.price.toLocaleString()} ₽</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Статус</p>
                  <Badge className={statusLabels[h.selectedOrder.status]?.color}>
                    {statusLabels[h.selectedOrder.status]?.label}
                  </Badge>
                </div>
              </div>
              {h.selectedOrder.notes && (
                <div>
                  <p className="text-sm text-muted-foreground">Комментарий</p>
                  <p className="text-sm">{h.selectedOrder.notes}</p>
                </div>
              )}
              <div className="space-y-2">
                <Label>Изменить статус</Label>
                <Select onValueChange={(v) => h.handleUpdateOrderStatus(h.selectedOrder!.id, v)}>
                  <SelectTrigger className="rounded-xl"><SelectValue placeholder="Выберите статус" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="approved">Одобрить</SelectItem>
                    <SelectItem value="paid">Оплачена</SelectItem>
                    <SelectItem value="completed">Завершена</SelectItem>
                    <SelectItem value="cancelled">Отменить</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
      {/* Create Category Dialog */}
      <Dialog open={h.showCategoryDialog} onOpenChange={h.setShowCategoryDialog}>
        <DialogContent className="rounded-2xl max-w-sm">
          <DialogHeader>
            <DialogTitle>Создать категорию</DialogTitle>
            <DialogDescription>Введите название новой категории для группировки курсов</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Название категории</Label>
              <Input
                value={h.newCategoryName}
                onChange={(e) => h.setNewCategoryName(e.target.value)}
                placeholder="Например: Охрана труда"
                className="rounded-xl"
                autoFocus
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              className="w-full btn-gradient rounded-xl"
              disabled={!h.newCategoryName.trim()}
              onClick={() => h.handleCreateCategory(h.newCategoryName)}
            >
              <FolderPlus className="w-4 h-4 mr-2" />Создать
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Move to Category Dialog */}
      <Dialog open={h.showMoveCategoryDialog} onOpenChange={h.setShowMoveCategoryDialog}>
        <DialogContent className="rounded-2xl max-w-sm">
          <DialogHeader>
            <DialogTitle>Переместить в категорию</DialogTitle>
            <DialogDescription className="truncate">
              {h.movingCourse?.course?.title}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Категория</Label>
              <Select value={h.targetCategory} onValueChange={h.setTargetCategory}>
                <SelectTrigger className="rounded-xl"><SelectValue placeholder="Выберите категорию" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Без категории</SelectItem>
                  {h.categories.filter(c => c !== "Без категории").map(cat => (
                    <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Или введите новую</Label>
              <Input
                value={h.newMoveCategoryInput}
                placeholder="Новая категория..."
                className="rounded-xl"
                onChange={(e) => {
                  h.setNewMoveCategoryInput(e.target.value);
                  if (e.target.value.trim()) {
                    h.setTargetCategory(e.target.value.trim());
                  }
                }}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              className="w-full btn-gradient rounded-xl"
              disabled={!h.targetCategory}
              onClick={() => h.movingCourse && h.handleMoveToCategory(h.movingCourse, h.targetCategory)}
            >
              <FolderInput className="w-4 h-4 mr-2" />Переместить
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {bulkGenCourse && (
        <BulkContentGenerator
          open={!!bulkGenCourse}
          onOpenChange={(v) => { if (!v) setBulkGenCourse(null); }}
          courseId={bulkGenCourse.id}
          courseTitle={bulkGenCourse.title}
          courseDescription={bulkGenCourse.description || ""}
        />
      )}
    </div>
  );
}
