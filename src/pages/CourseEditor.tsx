import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { SigmaLogo } from "@/components/ui/SigmaLogo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  ArrowLeft,
  Plus,
  Save,
  Eye,
  EyeOff,
  Globe,
  FileText,
  Video,
  HelpCircle,
  Loader2,
  Github,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { getAdminAwareBackPath } from "@/lib/utils";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { LessonItem } from "@/components/course-editor/LessonItem";
import { LessonEditor } from "@/components/course-editor/LessonEditor";
import { GitHubImportDialog } from "@/components/course-editor/GitHubImportDialog";
import { CoursePageSettingsDialog } from "@/components/course-editor/CoursePageSettingsDialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface Course {
  id: string;
  title: string;
  description: string | null;
  duration: string | null;
  is_published: boolean;
  sequential_lessons: boolean;
  allow_video_seek: boolean;
  price?: number;
}

interface Lesson {
  id: string;
  title: string;
  type: string;
  content: string | null;
  order_index: number;
  course_id: string;
  test_questions_count?: number | null;
}

interface TestQuestion {
  id?: string;
  question: string;
  options: string[];
  correct_answer: number;
  order_index: number;
  lesson_id?: string;
}

const CourseEditor = () => {
  const { courseId } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user } = useAuth();

  const [course, setCourse] = useState<Course | null>(null);
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [expandedLessonId, setExpandedLessonId] = useState<string | null>(null);

  // Editor state
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [duration, setDuration] = useState("");
  const [durationHours, setDurationHours] = useState<number | null>(null);
  const [sequentialLessons, setSequentialLessons] = useState(false);
  const [allowVideoSeek, setAllowVideoSeek] = useState(true);
  const [price, setPrice] = useState<number>(0);

  // Lesson editor
  const [isLessonEditorOpen, setIsLessonEditorOpen] = useState(false);
  const [editingLesson, setEditingLesson] = useState<Lesson | null>(null);
  const [editingQuestions, setEditingQuestions] = useState<TestQuestion[]>([]);

  // Delete confirmation
  const [deletingLessonId, setDeletingLessonId] = useState<string | null>(null);

  // Page settings
  const [isPageSettingsOpen, setIsPageSettingsOpen] = useState(false);

  // GitHub import
  const [isGitHubImportOpen, setIsGitHubImportOpen] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  useEffect(() => {
    if (courseId) {
      fetchCourseData();
    }
  }, [courseId]);

  const fetchCourseData = async () => {
    setIsLoading(true);

    const [courseResult, lessonsResult] = await Promise.all([
      supabase.from("courses").select("*").eq("id", courseId).single(),
      supabase
        .from("lessons")
        .select("*")
        .eq("course_id", courseId)
        .order("order_index"),
    ]);

    if (courseResult.data) {
      setCourse(courseResult.data);
      setTitle(courseResult.data.title);
      setDescription(courseResult.data.description || "");
      setDuration(courseResult.data.duration || "");
      setDurationHours(courseResult.data.frdo_duration_hours ?? null);
      setSequentialLessons(courseResult.data.sequential_lessons ?? false);
      setAllowVideoSeek(courseResult.data.allow_video_seek ?? true);
      setPrice(courseResult.data.price ?? 0);
    }

    if (lessonsResult.data) {
      setLessons(lessonsResult.data);
    }

    setIsLoading(false);
  };

  const handleSaveCourse = async () => {
    if (!courseId || !title.trim()) return;

    setIsSaving(true);
    const { error } = await supabase
      .from("courses")
      .update({
        title,
        description: description || null,
        duration: duration || null,
        frdo_duration_hours: durationHours,
        sequential_lessons: sequentialLessons,
        allow_video_seek: allowVideoSeek,
        price: price || 0,
      })
      .eq("id", courseId);

    setIsSaving(false);

    if (error) {
      toast({
        title: "Ошибка",
        description: "Не удалось сохранить курс",
        variant: "destructive",
      });
    } else {
      toast({
        title: "Сохранено",
        description: "Изменения курса сохранены",
      });
    }
  };

  const handleTogglePublish = async () => {
    if (!course) return;

    const { error } = await supabase
      .from("courses")
      .update({ is_published: !course.is_published })
      .eq("id", course.id);

    if (!error) {
      setCourse({ ...course, is_published: !course.is_published });
      toast({
        title: course.is_published ? "Снято с публикации" : "Опубликовано",
        description: course.is_published
          ? "Курс больше не доступен ученикам"
          : "Курс теперь доступен ученикам",
      });
    }
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      const oldIndex = lessons.findIndex((l) => l.id === active.id);
      const newIndex = lessons.findIndex((l) => l.id === over.id);

      const newLessons = arrayMove(lessons, oldIndex, newIndex);
      setLessons(newLessons);

      // Update order in database
      const updates = newLessons.map((lesson, index) => ({
        id: lesson.id,
        order_index: index,
        course_id: lesson.course_id,
        title: lesson.title,
        type: lesson.type,
      }));

      for (const update of updates) {
        await supabase
          .from("lessons")
          .update({ order_index: update.order_index })
          .eq("id", update.id);
      }
    }
  };

  const handleAddLesson = (type: string) => {
    setEditingLesson(null);
    setEditingQuestions([]);
    setIsLessonEditorOpen(true);
  };

  const handleEditLesson = async (lesson: Lesson) => {
    setEditingLesson(lesson);
    
    if (lesson.type === "test") {
      const { data: questions } = await supabase
        .from("test_questions")
        .select("*")
        .eq("lesson_id", lesson.id)
        .order("order_index");

      if (questions) {
        setEditingQuestions(
          questions.map((q) => ({
            id: q.id,
            question: q.question,
            options: q.options as string[],
            correct_answer: q.correct_answer,
            order_index: q.order_index,
            lesson_id: q.lesson_id,
          }))
        );
      }
    } else {
      setEditingQuestions([]);
    }

    setIsLessonEditorOpen(true);
  };

  const handleSaveLesson = async (data: {
    title: string;
    type: string;
    content: string;
    questions?: TestQuestion[];
    test_questions_count?: number;
  }) => {
    if (!courseId) return;

    if (editingLesson) {
      // Update existing lesson
      const { error } = await supabase
        .from("lessons")
        .update({
          title: data.title,
          type: data.type,
          content: data.content || null,
          test_questions_count: data.test_questions_count || null,
        })
        .eq("id", editingLesson.id);

      if (!error) {
        // Update questions if it's a test
        if (data.type === "test" && data.questions) {
          // Delete old questions
          await supabase
            .from("test_questions")
            .delete()
            .eq("lesson_id", editingLesson.id);

          // Insert new questions
          if (data.questions.length > 0) {
            await supabase.from("test_questions").insert(
              data.questions.map((q, index) => ({
                lesson_id: editingLesson.id,
                question: q.question,
                options: q.options,
                correct_answer: q.correct_answer,
                order_index: index,
              }))
            );
          }
        }

        setLessons(
          lessons.map((l) =>
            l.id === editingLesson.id
              ? { ...l, title: data.title, type: data.type, content: data.content }
              : l
          )
        );
        toast({ title: "Урок обновлён" });
      }
    } else {
      // Create new lesson
      const { data: newLesson, error } = await supabase
        .from("lessons")
        .insert({
          course_id: courseId,
          title: data.title,
          type: data.type,
          content: data.content || null,
          order_index: lessons.length,
          test_questions_count: data.test_questions_count || null,
        })
        .select()
        .single();

      if (!error && newLesson) {
        // Add questions if it's a test
        if (data.type === "test" && data.questions && data.questions.length > 0) {
          await supabase.from("test_questions").insert(
            data.questions.map((q, index) => ({
              lesson_id: newLesson.id,
              question: q.question,
              options: q.options,
              correct_answer: q.correct_answer,
              order_index: index,
            }))
          );
        }

        setLessons([...lessons, newLesson]);
        toast({ title: "Урок создан" });
      }
    }

    setIsLessonEditorOpen(false);
    setEditingLesson(null);
    setEditingQuestions([]);
  };

  const handleDeleteLesson = async () => {
    if (!deletingLessonId) return;

    const { error } = await supabase
      .from("lessons")
      .delete()
      .eq("id", deletingLessonId);

    if (!error) {
      setLessons(lessons.filter((l) => l.id !== deletingLessonId));
      toast({ title: "Урок удалён" });
    }

    setDeletingLessonId(null);
  };

  const handleGitHubImport = async (data: {
    title: string;
    description: string;
    lessons: { title: string; content: string; type: string }[];
  }) => {
    if (!courseId) return;

    // Update course info
    if (data.title || data.description) {
      setTitle(data.title || title);
      setDescription(data.description || description);
    }

    // Create lessons
    for (let i = 0; i < data.lessons.length; i++) {
      const lessonData = data.lessons[i];
      const { data: newLesson, error } = await supabase
        .from("lessons")
        .insert({
          course_id: courseId,
          title: lessonData.title,
          type: lessonData.type,
          content: lessonData.content,
          order_index: lessons.length + i,
        })
        .select()
        .single();

      if (!error && newLesson) {
        setLessons((prev) => [...prev, newLesson]);
      }
    }

    toast({
      title: "Импорт завершён",
      description: `Импортировано ${data.lessons.length} уроков`,
    });

    setIsGitHubImportOpen(false);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!course) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-4">Курс не найден</h1>
          <Button onClick={() => navigate(getAdminAwareBackPath())}>
            Вернуться к курсам
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card px-6 py-4 sticky top-0 z-10">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate(getAdminAwareBackPath())}
            >
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <SigmaLogo size="sm" />
          </div>

          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              size="icon"
              onClick={() => navigate(`/course/${courseId}/landing-editor`)}
              title="Редактор страницы курса"
            >
              <Globe className="w-4 h-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              onClick={() => setIsPageSettingsOpen(true)}
              title="Настройки страницы курса"
            >
              <Eye className="w-4 h-4" />
            </Button>
            <Button
              variant="outline"
              onClick={handleTogglePublish}
              className="gap-2"
            >
              {course.is_published ? (
                <>
                  <EyeOff className="w-4 h-4" />
                  <span className="hidden sm:inline">Снять с публикации</span>
                </>
              ) : (
                <>
                  <Eye className="w-4 h-4" />
                  <span className="hidden sm:inline">Опубликовать</span>
                </>
              )}
            </Button>
          </div>
        </div>
      </header>

      {/* Fixed Save Button at bottom */}
      <div className="fixed bottom-0 left-0 right-0 z-50 bg-gradient-to-t from-background via-background to-transparent pb-4 pt-8 pointer-events-none">
        <div className="max-w-5xl mx-auto px-6 pointer-events-auto">
          <div className="flex justify-center">
            <Button
              onClick={handleSaveCourse}
              disabled={isSaving}
              size="lg"
              className="btn-gradient rounded-2xl gap-3 px-8 py-6 text-lg font-semibold shadow-2xl hover:scale-105 transition-transform"
            >
              {isSaving ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <Save className="w-5 h-5" />
              )}
              {isSaving ? "Сохранение..." : "Сохранить курс"}
            </Button>
          </div>
        </div>
      </div>

      {/* Content */}
      <main className="max-w-5xl mx-auto p-6 pb-32">
        {/* Course info */}
        <div className="feature-card rounded-2xl p-6 mb-8">
          <h2 className="font-display text-xl font-semibold mb-6">
            Информация о курсе
          </h2>
          <div className="grid sm:grid-cols-2 gap-6">
            <div className="space-y-2 sm:col-span-2">
              <Label>Название курса *</Label>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Введите название курса"
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label>Описание</Label>
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Краткое описание курса"
                className="min-h-[100px]"
              />
            </div>
            <div className="space-y-2">
              <Label>Продолжительность</Label>
              <Input
                value={duration}
                onChange={(e) => setDuration(e.target.value)}
                placeholder="Например: 2 недели"
              />
            </div>
            <div className="space-y-2">
              <Label>Академические часы</Label>
              <Input
                type="number"
                min="0"
                value={durationHours ?? ""}
                onChange={(e) => setDurationHours(e.target.value ? parseInt(e.target.value) : null)}
                placeholder="Например: 40"
              />
            </div>
            <div className="space-y-2">
              <Label>Стоимость (₽)</Label>
              <Input
                type="number"
                min="0"
                value={price || ""}
                onChange={(e) => setPrice(e.target.value ? parseFloat(e.target.value) : 0)}
                placeholder="0 — бесплатный"
              />
              <p className="text-xs text-muted-foreground">Оставьте 0 для бесплатного курса</p>
            </div>
            <div className="space-y-2">
              <Label>Статус</Label>
              <div
                className={`inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium ${
                  course.is_published
                    ? "bg-sigma-green/10 text-sigma-green"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                {course.is_published ? (
                  <>
                    <Eye className="w-4 h-4" />
                    Опубликован
                  </>
                ) : (
                  <>
                    <EyeOff className="w-4 h-4" />
                    Черновик
                  </>
                )}
              </div>
            </div>
          </div>
          
          {/* Sequential lessons settings */}
          <div className="mt-6 pt-6 border-t border-border space-y-4">
            <h3 className="font-medium text-sm text-muted-foreground">Настройки прохождения</h3>
            
            <div className="flex items-center justify-between gap-4 p-4 bg-muted/50 rounded-xl">
              <div className="space-y-0.5">
                <Label htmlFor="sequential-lessons" className="font-medium">
                  Последовательное прохождение
                </Label>
                <p className="text-sm text-muted-foreground">
                  Студенты должны пройти все уроки по порядку
                </p>
              </div>
              <Switch
                id="sequential-lessons"
                checked={sequentialLessons}
                onCheckedChange={setSequentialLessons}
              />
            </div>
            
            {sequentialLessons && (
              <div className="flex items-center justify-between gap-4 p-4 bg-muted/50 rounded-xl">
                <div className="space-y-0.5">
                  <Label htmlFor="allow-video-seek" className="font-medium">
                    Разрешить перемотку видео
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    Если выключено, студенты не смогут перематывать видео
                  </p>
                </div>
                <Switch
                  id="allow-video-seek"
                  checked={allowVideoSeek}
                  onCheckedChange={setAllowVideoSeek}
                />
              </div>
            )}
          </div>
        </div>

        {/* Lessons */}
        <div className="feature-card rounded-2xl p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="font-display text-xl font-semibold">
              Уроки ({lessons.length})
            </h2>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button className="btn-gradient gap-2">
                  <Plus className="w-4 h-4" />
                  Добавить урок
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => handleAddLesson("text")}>
                  <FileText className="w-4 h-4 mr-2" />
                  Текстовый урок
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleAddLesson("video")}>
                  <Video className="w-4 h-4 mr-2" />
                  Видео урок
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleAddLesson("test")}>
                  <HelpCircle className="w-4 h-4 mr-2" />
                  Тест
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => setIsGitHubImportOpen(true)}>
                  <Github className="w-4 h-4 mr-2" />
                  Импорт с GitHub
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {lessons.length === 0 ? (
            <div className="text-center py-12 bg-muted/30 rounded-xl">
              <FileText className="w-12 h-12 text-muted-foreground/50 mx-auto mb-4" />
              <h3 className="font-semibold mb-2">Нет уроков</h3>
              <p className="text-muted-foreground mb-4">
                Добавьте первый урок в курс
              </p>
              <Button
                variant="outline"
                onClick={() => handleAddLesson("text")}
                className="gap-2"
              >
                <Plus className="w-4 h-4" />
                Добавить урок
              </Button>
            </div>
          ) : (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              <SortableContext
                items={lessons.map((l) => l.id)}
                strategy={verticalListSortingStrategy}
              >
                <div className="space-y-3">
                  {lessons.map((lesson) => (
                    <LessonItem
                      key={lesson.id}
                      lesson={lesson}
                      isExpanded={expandedLessonId === lesson.id}
                      onToggleExpand={() =>
                        setExpandedLessonId(
                          expandedLessonId === lesson.id ? null : lesson.id
                        )
                      }
                      onEdit={() => handleEditLesson(lesson)}
                      onDelete={() => setDeletingLessonId(lesson.id)}
                      onToggleLock={async () => {
                        const newVal = !lesson.is_locked;
                        const { error } = await supabase.from("lessons").update({ is_locked: newVal }).eq("id", lesson.id);
                        if (error) { toast.error("Ошибка сохранения"); return; }
                        setLessons(prev => prev.map(l => l.id === lesson.id ? { ...l, is_locked: newVal } : l));
                        toast.success(newVal ? "Урок заблокирован" : "Урок разблокирован");
                      }}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          )}
        </div>
      </main>

      {/* Lesson Editor Dialog */}
      <LessonEditor
        lesson={editingLesson}
        isOpen={isLessonEditorOpen}
        onClose={() => {
          setIsLessonEditorOpen(false);
          setEditingLesson(null);
          setEditingQuestions([]);
        }}
        onSave={handleSaveLesson}
        existingQuestions={editingQuestions}
        courseId={courseId}
        courseTitle={title}
        courseDescription={description}
      />

      {/* Page Settings Dialog */}
      {courseId && (
        <CoursePageSettingsDialog
          open={isPageSettingsOpen}
          onOpenChange={setIsPageSettingsOpen}
          courseId={courseId}
          courseTitle={title}
        />
      )}


      <GitHubImportDialog
        isOpen={isGitHubImportOpen}
        onClose={() => setIsGitHubImportOpen(false)}
        onImport={handleGitHubImport}
      />

      {/* Delete Confirmation */}
      <AlertDialog
        open={!!deletingLessonId}
        onOpenChange={() => setDeletingLessonId(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Удалить урок?</AlertDialogTitle>
            <AlertDialogDescription>
              Это действие нельзя отменить. Урок и все связанные с ним данные
              будут удалены.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Отмена</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteLesson}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Удалить
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default CourseEditor;
