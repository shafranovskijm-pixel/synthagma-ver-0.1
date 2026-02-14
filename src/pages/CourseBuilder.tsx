import { useRef } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { SigmaLogo } from "@/components/ui/SigmaLogo";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { ArrowLeft, Save, Loader2, Eye, Plus, FileUp, Wand2 } from "lucide-react";
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

  const {
    courseTitle, setCourseTitle, courseDescription, setCourseDescription,
    lessons, isLoading, isGenerating, isSaving, isImporting, hasUnsavedChanges,
    showExitDialog, setShowExitDialog, showAIGenerateDialog, setShowAIGenerateDialog,
    addLesson, updateLesson, deleteLesson, toggleLesson,
    handleAIGenerate, handleGenerateStructure, handleFileImport,
    handleSaveAndExit, handleExitWithoutSave, handleBackClick,
    sensors, handleDragEnd, saveCourse
  } = useCourseBuilder();

  if (isLoading) return <div className="min-h-screen bg-background flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;

  return (
    <div className="min-h-screen bg-background">
      <header className="bg-card border-b border-border sticky top-0 z-10">
        <div className="container mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="sm" onClick={handleBackClick} className="rounded-xl"><ArrowLeft className="w-4 h-4 mr-2" />Назад</Button>
            <SigmaLogo size="sm" />
          </div>
          <div className="flex items-center gap-3">
            <Button variant="outline" onClick={() => courseId ? navigate(`/course-preview/${courseId}`) : toast.error("Сначала сохраните курс")} disabled={!courseId} className="rounded-xl gap-2"><Eye className="w-4 h-4" /><span className="hidden sm:inline">Предпросмотр</span></Button>
          </div>
        </div>
      </header>

      <div className="fixed bottom-0 inset-x-0 z-50 bg-gradient-to-t from-background via-background to-transparent pb-4 pt-8 pointer-events-none">
        <div className="container mx-auto px-6 pointer-events-auto flex justify-center">
          <Button onClick={saveCourse} disabled={isSaving} size="lg" className="btn-gradient rounded-2xl gap-3 px-8 py-6 text-lg font-semibold shadow-2xl hover:scale-105 transition-transform">
            {isSaving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
            {isSaving ? "Сохранение..." : "Сохранить курс"}
            {hasUnsavedChanges && !isSaving && <span className="ml-1 w-2 h-2 rounded-full bg-white/80 animate-pulse" />}
          </Button>
        </div>
      </div>

      <div className="container mx-auto px-6 py-8 pb-32">
        <div className="grid lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-6">
            <div className="bg-card rounded-2xl border border-border p-6 space-y-4">
              <h2 className="font-display text-xl font-semibold mb-4">Информация о курсе</h2>
              <div className="space-y-2"><Label>Название курса</Label><Input value={courseTitle} onChange={e => setCourseTitle(e.target.value)} placeholder="Введите название курса" className="text-lg font-medium" /></div>
              <div className="space-y-2"><Label>Описание</Label><Textarea value={courseDescription} onChange={e => setCourseDescription(e.target.value)} placeholder="О чем этот курс?" className="min-h-[100px]" /></div>
            </div>

            <div className="bg-card rounded-2xl border border-border p-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className="font-display text-xl font-semibold">Содержание курса</h2>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()} disabled={isImporting}><FileUp className="w-4 h-4 mr-2" />{isImporting ? 'Импорт...' : 'Импорт'}</Button>
                  <input type="file" ref={fileInputRef} onChange={handleFileImport} multiple accept=".docx,.txt,.md,.html,.htm" className="hidden" />
                  <Button variant="outline" size="sm" onClick={handleGenerateStructure} disabled={isGenerating}><Wand2 className="w-4 h-4 mr-2" />{isGenerating ? 'Генерация...' : 'AI Структура'}</Button>
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
                        courseId={courseId}
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
                <Button variant="outline" className="h-auto py-4 flex flex-col gap-2 hover:bg-primary/5 hover:border-primary/30" onClick={() => addLesson('text')}>
                  <span className="text-2xl">📝</span><span className="text-xs">Текст</span>
                </Button>
                <Button variant="outline" className="h-auto py-4 flex flex-col gap-2 hover:bg-primary/5 hover:border-primary/30" onClick={() => addLesson('video')}>
                  <span className="text-2xl">🎥</span><span className="text-xs">Видео</span>
                </Button>
                <Button variant="outline" className="h-auto py-4 flex flex-col gap-2 hover:bg-primary/5 hover:border-primary/30" onClick={() => addLesson('test')}>
                  <span className="text-2xl">✅</span><span className="text-xs">Тест</span>
                </Button>
                <Button variant="outline" className="h-auto py-4 flex flex-col gap-2 hover:bg-primary/5 hover:border-primary/30" onClick={() => setShowAIGenerateDialog(true)}>
                  <span className="text-2xl">✨</span><span className="text-xs">AI Генерация</span>
                </Button>
                <Button variant="outline" className="h-auto py-4 flex flex-col gap-2 hover:bg-primary/5 hover:border-primary/30" onClick={() => addLesson('slider')}>
                  <span className="text-2xl">🖼️</span><span className="text-xs">Слайды</span>
                </Button>
                <Button variant="outline" className="h-auto py-4 flex flex-col gap-2 hover:bg-primary/5 hover:border-primary/30" onClick={() => addLesson('audio')}>
                  <span className="text-2xl">🎧</span><span className="text-xs">Аудио</span>
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
  );
}
