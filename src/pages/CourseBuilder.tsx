import { useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { SigmaLogo } from "@/components/ui/SigmaLogo";
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from "@/components/ui/tooltip";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { ArrowLeft, Save, Loader2, Eye, Plus, FileUp, Wand2, Check, AlertCircle, FileText, Video, CheckSquare, Sparkles, Presentation, Headphones, BookOpen, Layers } from "lucide-react";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { DndContext, closestCenter, useSensor, useSensors, PointerSensor, KeyboardSensor } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy, sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { SortableLessonItem } from "@/components/course-builder/SortableLessonItem";
import { AIGenerateDialog } from "@/components/course-builder/AIGenerateDialog";
import { useCourseBuilder } from "@/hooks/useCourseBuilder";
import { LessonType } from "@/components/course-builder/LessonTypeConfig";

export default function CourseBuilder() {
  const navigate = useNavigate();
  const { courseId } = useParams();
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
  } = useCourseBuilder();

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

  if (isLoading) return <div className="min-h-screen bg-background flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;

  return (
    <TooltipProvider delayDuration={300}>
    <div className="min-h-screen bg-background">
      <header className="bg-card border-b border-border sticky top-0 z-10">
        <div className="container mx-auto px-6 py-4 flex items-center justify-between backdrop-blur-sm bg-card/80">
          <div className="flex items-center gap-4">
            <Tooltip><TooltipTrigger asChild>
              <Button variant="ghost" size="sm" onClick={handleBackClick} className="rounded-xl"><ArrowLeft className="w-4 h-4 mr-2" />Назад</Button>
            </TooltipTrigger><TooltipContent>Вернуться к списку курсов</TooltipContent></Tooltip>
            <SigmaLogo size="sm" />
          </div>
          <div className="flex items-center gap-3">
            <Tooltip><TooltipTrigger asChild>
              <Button variant="outline" onClick={handlePreview} disabled={isSavingForPreview} className="rounded-xl gap-2">
                {isSavingForPreview ? <Loader2 className="w-4 h-4 animate-spin" /> : <Eye className="w-4 h-4" />}
                <span className="hidden sm:inline">{isSavingForPreview ? 'Сохранение...' : 'Предпросмотр'}</span>
              </Button>
            </TooltipTrigger><TooltipContent>Посмотреть курс глазами ученика</TooltipContent></Tooltip>
          </div>
        </div>
      </header>

      <div className="fixed bottom-0 inset-x-0 z-50 bg-gradient-to-t from-background via-background to-transparent pb-4 pt-8 pointer-events-none">
        <div className="container mx-auto px-6 pointer-events-auto flex flex-col items-center gap-2">
          <Tooltip><TooltipTrigger asChild>
            <Button onClick={() => saveCourse()} disabled={isSaving} size="lg" className="btn-gradient rounded-2xl gap-3 px-8 py-6 text-lg font-semibold shadow-2xl hover:scale-105 transition-transform">
              {isSaving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
              {isSaving ? "Сохранение..." : "Сохранить курс"}
              {hasUnsavedChanges && !isSaving && <span className="ml-1 w-2 h-2 rounded-full bg-white/80 animate-pulse" />}
            </Button>
          </TooltipTrigger><TooltipContent>Сохранить все изменения курса</TooltipContent></Tooltip>
          {autoSaveStatus === 'saved' && (
            <span className="text-xs text-green-600 dark:text-green-400 flex items-center gap-1 animate-in fade-in">
              <Check className="w-3 h-3" /> Сохранено
            </span>
          )}
          {autoSaveStatus === 'saving' && (
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <Loader2 className="w-3 h-3 animate-spin" /> Автосохранение...
            </span>
          )}
          {autoSaveStatus === 'error' && (
            <span className="text-xs text-destructive flex items-center gap-1">
              <AlertCircle className="w-3 h-3" /> Ошибка сохранения
            </span>
          )}
        </div>
      </div>

      <div className="container mx-auto px-6 py-8 pb-32">
        <div className="grid lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-6">
            <div className="bg-card rounded-2xl border border-border border-t-2 border-t-primary/30 p-6 space-y-4">
              <h2 className="font-display text-xl font-semibold mb-4 flex items-center gap-2"><BookOpen className="w-5 h-5 text-primary" />Информация о курсе</h2>
              <div className="space-y-2"><Label>Название курса</Label><Input value={courseTitle} onChange={e => setCourseTitle(e.target.value)} placeholder="Введите название курса" className="text-lg font-medium" /></div>
              <div className="space-y-2"><Label>Описание</Label><Textarea value={courseDescription} onChange={e => setCourseDescription(e.target.value)} placeholder="О чем этот курс?" className="min-h-[100px]" /></div>
            </div>

            <div className="bg-card rounded-2xl border border-border p-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className="font-display text-xl font-semibold">Содержание курса</h2>
                <div className="flex gap-3">
                  <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()} disabled={isImporting} className="h-auto py-2 px-3 flex flex-col items-center gap-0.5">
                    <span className="flex items-center gap-1.5"><FileUp className="w-4 h-4" />{isImporting ? 'Импорт...' : 'Импорт'}</span>
                    <span className="text-[10px] text-muted-foreground font-normal">DOCX, TXT, MD, HTML</span>
                  </Button>
                  <input type="file" ref={fileInputRef} onChange={handleFileImport} multiple accept=".docx,.txt,.md,.html,.htm" className="hidden" />
                  <Button variant="outline" size="sm" onClick={handleGenerateStructure} disabled={isGenerating} className="h-auto py-2 px-3 flex flex-col items-center gap-0.5">
                    <span className="flex items-center gap-1.5"><Wand2 className="w-4 h-4" />{isGenerating ? 'Генерация...' : 'AI Структура'}</span>
                    <span className="text-[10px] text-muted-foreground font-normal">По названию и описанию курса</span>
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
                      />
                    ))}
                  </div>
                </SortableContext>
              </DndContext>

              {lessons.length === 0 && (
                <div className="text-center py-12 border-2 border-dashed border-border rounded-xl">
                  <p className="text-muted-foreground mb-4">В курсе пока нет уроков</p>
                  <Button onClick={handleGenerateStructure} variant="outline" className="gap-2"><Wand2 className="w-4 h-4" />Сгенерировать структуру с AI</Button>
                </div>
              )}
            </div>
          </div>

          <div className="space-y-6">
            <div className="bg-card rounded-2xl border border-border p-6 sticky top-24">
              <h3 className="font-semibold mb-4">Добавить урок</h3>
              <div className="grid grid-cols-2 gap-3">
                <Button variant="outline" className="h-auto py-4 flex flex-col gap-1 hover:bg-primary/5 hover:border-primary/30" onClick={() => addLesson('text')}>
                  <span className="text-2xl">📝</span><span className="text-xs font-medium">Текст</span>
                  <span className="text-[10px] text-muted-foreground leading-tight text-center">Блочный редактор с медиа</span>
                </Button>
                <Button variant="outline" className="h-auto py-4 flex flex-col gap-1 hover:bg-primary/5 hover:border-primary/30" onClick={() => addLesson('video')}>
                  <span className="text-2xl">🎥</span><span className="text-xs font-medium">Видео</span>
                  <span className="text-[10px] text-muted-foreground leading-tight text-center">MP4, WebM · YouTube, VK, Rutube</span>
                </Button>
                <Button variant="outline" className="h-auto py-4 flex flex-col gap-1 hover:bg-primary/5 hover:border-primary/30" onClick={() => addLesson('test')}>
                  <span className="text-2xl">✅</span><span className="text-xs font-medium">Тест</span>
                  <span className="text-[10px] text-muted-foreground leading-tight text-center">Вопросы с вариантами ответов</span>
                </Button>
                <Button variant="outline" className="h-auto py-4 flex flex-col gap-1 hover:bg-primary/5 hover:border-primary/30" onClick={() => setShowAIGenerateDialog(true)}>
                  <span className="text-2xl">✨</span><span className="text-xs font-medium">AI Генерация</span>
                  <span className="text-[10px] text-muted-foreground leading-tight text-center">Создать урок с помощью ИИ</span>
                </Button>
                <Button variant="outline" className="h-auto py-4 flex flex-col gap-1 hover:bg-primary/5 hover:border-primary/30" onClick={() => addLesson('slider')}>
                  <span className="text-2xl">🖼️</span><span className="text-xs font-medium">Слайды</span>
                  <span className="text-[10px] text-muted-foreground leading-tight text-center">PPTX или создать вручную</span>
                </Button>
                <Button variant="outline" className="h-auto py-4 flex flex-col gap-1 hover:bg-primary/5 hover:border-primary/30" onClick={() => addLesson('audio')}>
                  <span className="text-2xl">🎧</span><span className="text-xs font-medium">Аудио</span>
                  <span className="text-[10px] text-muted-foreground leading-tight text-center">MP3, WAV, OGG · или ссылка</span>
                </Button>
              </div>
            </div>
          </div>
        </div>
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
    </div>
    </TooltipProvider>
  );
}
