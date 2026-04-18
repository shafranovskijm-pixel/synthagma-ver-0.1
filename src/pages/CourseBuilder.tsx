import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { useNavigate, useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { SigmaLogo } from "@/components/ui/SigmaLogo";
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from "@/components/ui/tooltip";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { ArrowLeft, Save, Eye, Plus, FileUp, Wand2, Check, AlertCircle, FileText, Video, CheckSquare, Sparkles, Presentation, Headphones, BookOpen, Layers, MessageSquare, BookCheck, SearchCheck } from "lucide-react";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { DndContext, closestCenter, useSensor, useSensors, PointerSensor, KeyboardSensor } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy, sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { SortableLessonItem } from "@/components/course-builder/SortableLessonItem";
import { CourseBuilderLessonsNav } from "@/components/course-builder/CourseBuilderLessonsNav";
import { AIGenerateDialog } from "@/components/course-builder/AIGenerateDialog";
import { CourseReviewDialog } from "@/components/course-builder/CourseReviewDialog";
import { useCourseBuilder } from "@/hooks/useCourseBuilder";
import { useCourseReview } from "@/hooks/useCourseReview";
import { LessonType } from "@/components/course-builder/LessonTypeConfig";
import { SigmaSpinner } from "@/components/ui/SigmaSpinner";

interface CourseBuilderProps {
  embedded?: boolean;
  embeddedCourseId?: string;
  onExitEditor?: () => void;
}

function AddLessonGrid({
  addLesson,
  openAIDialog,
}: {
  addLesson: (type: LessonType) => void;
  openAIDialog: () => void;
}) {
  return (
    <div className="grid grid-cols-3 sm:grid-cols-2 gap-2 sm:gap-3">
      <Button variant="outline" className="h-auto py-3 sm:py-4 flex flex-col gap-1 sm:gap-2 rounded-xl hover:shadow-md hover:-translate-y-0.5 transition-all hover:border-primary/30" onClick={() => addLesson('text')}>
        <div className="p-1.5 sm:p-2 rounded-full bg-primary/10"><FileText className="w-4 h-4 sm:w-5 sm:h-5 text-primary" /></div>
        <span className="text-[10px] sm:text-xs font-semibold">Текст</span>
        <span className="text-[9px] sm:text-[10px] text-muted-foreground leading-tight text-center hidden sm:block">Блочный редактор с медиа</span>
      </Button>
      <Button variant="outline" className="h-auto py-3 sm:py-4 flex flex-col gap-1 sm:gap-2 rounded-xl hover:shadow-md hover:-translate-y-0.5 transition-all hover:border-purple-400/30" onClick={() => addLesson('video')}>
        <div className="p-1.5 sm:p-2 rounded-full bg-purple-500/10"><Video className="w-4 h-4 sm:w-5 sm:h-5 text-purple-500" /></div>
        <span className="text-[10px] sm:text-xs font-semibold">Видео</span>
        <span className="text-[9px] sm:text-[10px] text-muted-foreground leading-tight text-center hidden sm:block">MP4, WebM · YouTube, VK</span>
      </Button>
      <Button variant="outline" className="h-auto py-3 sm:py-4 flex flex-col gap-1 sm:gap-2 rounded-xl hover:shadow-md hover:-translate-y-0.5 transition-all hover:border-orange-400/30" onClick={() => addLesson('test')}>
        <div className="p-1.5 sm:p-2 rounded-full bg-orange-500/10"><CheckSquare className="w-4 h-4 sm:w-5 sm:h-5 text-orange-500" /></div>
        <span className="text-[10px] sm:text-xs font-semibold">Тест</span>
        <span className="text-[9px] sm:text-[10px] text-muted-foreground leading-tight text-center hidden sm:block">Вопросы с вариантами</span>
      </Button>
      <Button variant="outline" className="h-auto py-3 sm:py-4 flex flex-col gap-1 sm:gap-2 rounded-xl hover:shadow-md hover:-translate-y-0.5 transition-all hover:border-primary/30" onClick={openAIDialog}>
        <div className="p-1.5 sm:p-2 rounded-full bg-primary/10"><Sparkles className="w-4 h-4 sm:w-5 sm:h-5 text-primary" /></div>
        <span className="text-[10px] sm:text-xs font-semibold">AI</span>
        <span className="text-[9px] sm:text-[10px] text-muted-foreground leading-tight text-center hidden sm:block">Создать с помощью ИИ</span>
      </Button>
      <Button variant="outline" className="h-auto py-3 sm:py-4 flex flex-col gap-1 sm:gap-2 rounded-xl hover:shadow-md hover:-translate-y-0.5 transition-all hover:border-amber-400/30" onClick={() => addLesson('slider')}>
        <div className="p-1.5 sm:p-2 rounded-full bg-amber-500/10"><Presentation className="w-4 h-4 sm:w-5 sm:h-5 text-amber-500" /></div>
        <span className="text-[10px] sm:text-xs font-semibold">Слайды</span>
        <span className="text-[9px] sm:text-[10px] text-muted-foreground leading-tight text-center hidden sm:block">PPTX или вручную</span>
      </Button>
      <Button variant="outline" className="h-auto py-3 sm:py-4 flex flex-col gap-1 sm:gap-2 rounded-xl hover:shadow-md hover:-translate-y-0.5 transition-all hover:border-green-400/30" onClick={() => addLesson('audio')}>
        <div className="p-1.5 sm:p-2 rounded-full bg-green-500/10"><Headphones className="w-4 h-4 sm:w-5 sm:h-5 text-green-500" /></div>
        <span className="text-[10px] sm:text-xs font-semibold">Аудио</span>
        <span className="text-[9px] sm:text-[10px] text-muted-foreground leading-tight text-center hidden sm:block">MP3, WAV, OGG</span>
      </Button>
      <Button variant="outline" className="h-auto py-3 sm:py-4 flex flex-col gap-1 sm:gap-2 rounded-xl hover:shadow-md hover:-translate-y-0.5 transition-all hover:border-blue-400/30" onClick={() => addLesson('feedback')}>
        <div className="p-1.5 sm:p-2 rounded-full bg-blue-500/10"><MessageSquare className="w-4 h-4 sm:w-5 sm:h-5 text-blue-500" /></div>
        <span className="text-[10px] sm:text-xs font-semibold">Обратная связь</span>
        <span className="text-[9px] sm:text-[10px] text-muted-foreground leading-tight text-center hidden sm:block">Вопрос → чат</span>
      </Button>
      <Button variant="outline" className="h-auto py-3 sm:py-4 flex flex-col gap-1 sm:gap-2 rounded-xl hover:shadow-md hover:-translate-y-0.5 transition-all hover:border-indigo-400/30" onClick={() => addLesson('homework')}>
        <div className="p-1.5 sm:p-2 rounded-full bg-indigo-500/10"><BookCheck className="w-4 h-4 sm:w-5 sm:h-5 text-indigo-500" /></div>
        <span className="text-[10px] sm:text-xs font-semibold">Задание</span>
        <span className="text-[9px] sm:text-[10px] text-muted-foreground leading-tight text-center hidden sm:block">Домашняя работа</span>
      </Button>
    </div>
  );
}

export default function CourseBuilder({ embedded, embeddedCourseId, onExitEditor }: CourseBuilderProps = {}) {
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isSavingForPreview, setIsSavingForPreview] = useState(false);

  const {
    courseTitle, setCourseTitle, courseDescription, setCourseDescription,
    lessons, isLoading, isGenerating, isSaving, isImporting, hasUnsavedChanges,
    showExitDialog, setShowExitDialog, showAIGenerateDialog, setShowAIGenerateDialog,
    addLesson, updateLesson, deleteLesson, toggleLesson,
    handleAIGenerate, handleGenerateStructure, handleFileImport,
    handleSaveAndExit, handleExitWithoutSave, handleBackClick,
    sensors, handleDragEnd, saveCourse, autoSaveStatus,
    courseId: resolvedCourseId,
    organizationId,
    activeLessonId, setActiveLessonId, scrollToLesson } = useCourseBuilder(embeddedCourseId);

  const {
    isReviewing, reviewResult, activeFindings, dismissedIds,
    startReview, dismissFinding, dismissAll, resetReview } = useCourseReview();
  const [showReviewDialog, setShowReviewDialog] = useState(false);
  const [addLessonSheetOpen, setAddLessonSheetOpen] = useState(false);

  // IntersectionObserver — track which lesson is currently visible
  useEffect(() => {
    if (lessons.length === 0) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio);
        if (visible[0]) {
          const id = (visible[0].target as HTMLElement).dataset.lessonId;
          if (id) setActiveLessonId(id);
        }
      },
      { rootMargin: "-100px 0px -50% 0px", threshold: [0, 0.25, 0.5, 0.75, 1] },
    );
    const els = document.querySelectorAll<HTMLElement>("[data-lesson-id]");
    els.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [lessons.length, setActiveLessonId]);

  const handleStartReview = async () => {
    if (!resolvedCourseId) {
      toast.error("Сначала сохраните курс");
      return;
    }
    setShowReviewDialog(true);
    await startReview(resolvedCourseId);
  };

  const handlePreview = async () => {
    if (resolvedCourseId && !hasUnsavedChanges) {
      navigate(`/course-preview/${resolvedCourseId}`);
      return;
    }
    setIsSavingForPreview(true);
    const success = await saveCourse(true);
    setIsSavingForPreview(false);
    if (success) {
      // resolvedCourseId may have been set during save for new courses
      // Use a small delay to let state update
      setTimeout(() => {
        const id = resolvedCourseId || window.location.pathname.split('/course-builder/')[1];
        if (id) {
          toast.success("Курс сохранён");
          navigate(`/course-preview/${id}`);
        } else {
          toast.error("Не удалось определить ID курса");
        }
      }, 100);
    }
  };

  if (isLoading) return <div className={cn(embedded ? "py-16" : "min-h-screen", "bg-background flex items-center justify-center")}><SigmaSpinner size="lg" /></div>;

  return (
    <TooltipProvider delayDuration={300}>
    <div className={cn(embedded ? "" : "min-h-screen", "bg-background")}>
      {!embedded && (
        <header className="bg-card border-b border-border sticky top-0 z-10">
          <div className="container mx-auto px-3 sm:px-6 py-3 sm:py-4 flex items-center justify-between backdrop-blur-sm bg-card/80">
            <div className="flex items-center gap-2 sm:gap-4">
              <Tooltip><TooltipTrigger asChild>
                <Button variant="ghost" size="sm" onClick={handleBackClick} className="rounded-xl"><ArrowLeft className="w-4 h-4 mr-2" />Назад</Button>
              </TooltipTrigger><TooltipContent>Вернуться к списку курсов</TooltipContent></Tooltip>
              <SigmaLogo size="sm" />
            </div>
            <div className="flex items-center gap-3">
              <Tooltip><TooltipTrigger asChild>
                <Button variant="outline" onClick={handlePreview} disabled={isSavingForPreview} className="rounded-xl gap-2">
                  {isSavingForPreview ? <SigmaSpinner size="sm" /> : <Eye className="w-4 h-4" />}
                  <span className="hidden sm:inline">{isSavingForPreview ? 'Сохранение...' : 'Предпросмотр'}</span>
                </Button>
              </TooltipTrigger><TooltipContent>Посмотреть курс глазами ученика</TooltipContent></Tooltip>
            </div>
          </div>
        </header>
      )}

      <div className={cn(embedded ? "sticky bottom-0 z-40" : "fixed bottom-0 inset-x-0 z-50", "bg-gradient-to-t from-background via-background to-transparent pb-3 sm:pb-4 pt-6 sm:pt-8 pointer-events-none")}>
        <div className="container mx-auto px-3 sm:px-6 pointer-events-auto flex flex-col items-center gap-2">
          <Tooltip><TooltipTrigger asChild>
            <Button onClick={() => saveCourse()} disabled={isSaving} size="lg" className="btn-gradient rounded-2xl gap-2 sm:gap-3 px-6 sm:px-8 py-5 sm:py-6 text-base sm:text-lg font-semibold shadow-2xl hover:scale-105 transition-transform w-full sm:w-auto">
              {isSaving ? <SigmaSpinner /> : <Save className="w-5 h-5" />}
              {isSaving ? "Сохранение..." : "Сохранить курс"}
              {hasUnsavedChanges && !isSaving && <span className="ml-1 w-2 h-2 rounded-full bg-white/80 animate-pulse" />}
            </Button>
          </TooltipTrigger><TooltipContent>Сохранить все изменения курса</TooltipContent></Tooltip>
          {autoSaveStatus === 'saved' && (
            <span className="text-xs text-sigma-green flex items-center gap-1 animate-in fade-in">
              <Check className="w-3 h-3" /> Сохранено
            </span>
          )}
          {autoSaveStatus === 'saving' && (
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <SigmaSpinner size="xs" /> Автосохранение...
            </span>
          )}
          {autoSaveStatus === 'error' && (
            <span className="text-xs text-destructive flex items-center gap-1">
              <AlertCircle className="w-3 h-3" /> Ошибка сохранения
            </span>
          )}
        </div>
      </div>

      <div className="container mx-auto px-3 sm:px-6 py-4 sm:py-8 pb-28 sm:pb-32">
        <div className="flex gap-4 lg:gap-6 items-start">
          {/* LEFT: sticky lessons navigation (desktop) */}
          <CourseBuilderLessonsNav
            lessons={lessons}
            activeLessonId={activeLessonId}
            sensors={sensors}
            onDragEnd={handleDragEnd}
            onLessonClick={scrollToLesson}
          />

          {/* CENTER: main content */}
          <div className="flex-1 min-w-0 space-y-6">
            <div className="bg-card rounded-2xl border border-border border-t-2 border-t-primary/30 p-4 sm:p-6 space-y-4">
              <h2 className="font-display text-xl font-semibold mb-4 flex items-center gap-2"><BookOpen className="w-5 h-5 text-primary" />Информация о курсе</h2>
              <div className="space-y-2"><Label>Название курса</Label><Input value={courseTitle} onChange={e => setCourseTitle(e.target.value)} placeholder="Введите название курса" className="text-lg font-medium" /></div>
              <div className="space-y-2"><Label>Описание</Label><Textarea value={courseDescription} onChange={e => setCourseDescription(e.target.value)} placeholder="О чем этот курс?" className="min-h-[100px]" /></div>
            </div>

            <div className="bg-card rounded-2xl border border-border p-4 sm:p-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-4 sm:mb-6 gap-3">
                <h2 className="font-display text-lg sm:text-xl font-semibold">Содержание курса</h2>
                <div className="flex gap-2 sm:gap-3">
                  <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()} disabled={isImporting} className="h-auto py-2 px-3 flex flex-col items-center gap-0.5">
                    <span className="flex items-center gap-1.5"><FileUp className="w-4 h-4" />{isImporting ? 'Импорт...' : 'Импорт'}</span>
                    <span className="text-[10px] text-muted-foreground font-normal">DOCX, TXT, MD, HTML</span>
                  </Button>
                  <input type="file" ref={fileInputRef} onChange={handleFileImport} multiple accept=".docx,.txt,.md,.html,.htm" className="hidden" />
                  <Button variant="outline" size="sm" onClick={handleGenerateStructure} disabled={isGenerating} className="h-auto py-2 px-3 flex flex-col items-center gap-0.5">
                    <span className="flex items-center gap-1.5"><Wand2 className="w-4 h-4" />{isGenerating ? 'Генерация...' : 'AI Структура'}</span>
                     <span className="text-[10px] text-muted-foreground font-normal">По названию и описанию курса</span>
                  </Button>
                  <Button variant="outline" size="sm" onClick={handleStartReview} disabled={isReviewing || !resolvedCourseId || lessons.length === 0} className="h-auto py-2 px-3 flex flex-col items-center gap-0.5">
                    <span className="flex items-center gap-1.5"><SearchCheck className="w-4 h-4" />{isReviewing ? 'Проверка...' : 'AI Проверка'}</span>
                    <span className="text-[10px] text-muted-foreground font-normal">Актуальность и ошибки</span>
                  </Button>
                </div>
              </div>

              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                <SortableContext items={lessons.map(l => l.id)} strategy={verticalListSortingStrategy}>
                  <div className="space-y-4">
                    {lessons.map((lesson, index) => (
                      <SortableLessonItem
                        key={lesson.id}
                        lesson={lesson}
                        index={index}
                        onUpdate={(updates) => updateLesson(lesson.id, updates)}
                        onDelete={() => deleteLesson(lesson.id)}
                        onToggle={() => toggleLesson(lesson.id)}
                        courseId={resolvedCourseId}
                        courseTitle={courseTitle}
                        courseDescription={courseDescription}
                        organizationId={organizationId}
                      />
                    ))}
                  </div>
                </SortableContext>
              </DndContext>

              {lessons.length === 0 && (
                <div className="text-center py-10 sm:py-16 border-2 border-dashed border-border rounded-xl">
                  <Layers className="w-12 h-12 sm:w-16 sm:h-16 mx-auto text-primary/20 mb-4" />
                  <h3 className="text-lg font-semibold mb-2">Начните создавать курс</h3>
                  <p className="text-muted-foreground mb-6 max-w-md mx-auto text-sm">Добавьте уроки вручную, импортируйте из файлов или сгенерируйте структуру с помощью AI</p>
                  <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 justify-center px-4">
                    <Button variant="outline" onClick={() => addLesson('text')} className="gap-2" size="sm"><Plus className="w-4 h-4" />Добавить урок</Button>
                    <Button variant="outline" onClick={() => fileInputRef.current?.click()} className="gap-2" size="sm"><FileUp className="w-4 h-4" />Импорт</Button>
                    <Button onClick={handleGenerateStructure} variant="outline" className="gap-2" size="sm"><Wand2 className="w-4 h-4" />AI Структура</Button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* RIGHT: sticky "Добавить урок" panel (desktop) */}
          <aside className="hidden lg:block sticky top-24 self-start w-72 shrink-0">
            <div className="bg-card rounded-2xl border border-border p-4 sm:p-6 shadow-sm max-h-[calc(100vh-7rem)] overflow-y-auto">
              <h3 className="font-semibold mb-3 sm:mb-4">Добавить урок</h3>
              <AddLessonGrid
                addLesson={addLesson}
                openAIDialog={() => setShowAIGenerateDialog(true)}
              />
            </div>
          </aside>
        </div>
      </div>

      {/* Mobile floating "+" trigger for Add Lesson */}
      <div className="lg:hidden fixed bottom-24 right-4 z-40">
        <Sheet open={addLessonSheetOpen} onOpenChange={setAddLessonSheetOpen}>
          <SheetTrigger asChild>
            <Button size="sm" className="btn-gradient shadow-lg gap-2 rounded-full">
              <Plus className="w-4 h-4" /> Добавить
            </Button>
          </SheetTrigger>
          <SheetContent side="right" className="w-80 p-6">
            <h3 className="font-semibold mb-4 mt-6">Добавить урок</h3>
            <AddLessonGrid
              addLesson={(t) => { addLesson(t); setAddLessonSheetOpen(false); }}
              openAIDialog={() => { setShowAIGenerateDialog(true); setAddLessonSheetOpen(false); }}
            />
          </SheetContent>
        </Sheet>
      </div>

      <AlertDialog open={showExitDialog} onOpenChange={setShowExitDialog}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Есть несохраненные изменения</AlertDialogTitle><AlertDialogDescription>Вы хотите сохранить изменения перед выходом?</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setShowExitDialog(false)}>Отмена</AlertDialogCancel>
            <Button variant="destructive" onClick={handleExitWithoutSave}>Не сохранять</Button>
            <AlertDialogAction onClick={handleSaveAndExit}>Сохранить и выйти</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AIGenerateDialog open={showAIGenerateDialog} onOpenChange={setShowAIGenerateDialog} onGenerate={handleAIGenerate} courseTitle={courseTitle} courseDescription={courseDescription} />

      <CourseReviewDialog
        open={showReviewDialog}
        onOpenChange={setShowReviewDialog}
        isReviewing={isReviewing}
        reviewResult={reviewResult}
        activeFindings={activeFindings}
        dismissedCount={dismissedIds.size}
        onDismiss={dismissFinding}
        onDismissAll={dismissAll}
      />
    </div>
    </TooltipProvider>
  );
}
