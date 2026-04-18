import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { ArrowLeft, Plus, Save, Eye, EyeOff, Globe, FileText, Video, HelpCircle, Github } from "lucide-react";
import { SigmaLogo } from "@/components/ui/SigmaLogo";
import { getAdminAwareBackPath } from "@/lib/utils";
import { DndContext, closestCenter } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { LessonItem } from "@/components/course-editor/LessonItem";
import { LessonEditor } from "@/components/course-editor/LessonEditor";
import { GitHubImportDialog } from "@/components/course-editor/GitHubImportDialog";
import { CoursePageSettingsDialog } from "@/components/course-editor/CoursePageSettingsDialog";
import { CourseLessonsSidebar } from "@/components/course-editor/CourseLessonsSidebar";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { SigmaSpinner } from "@/components/ui/SigmaSpinner";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useCourseEditor } from "@/hooks/useCourseEditor";
import { useEffect } from "react";

const CourseEditor = () => {
  const h = useCourseEditor();

  // Track which lesson is in viewport → highlight in sidebar
  useEffect(() => {
    if (!h.lessons.length) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio);
        if (visible[0]) {
          const id = (visible[0].target as HTMLElement).dataset.lessonId;
          if (id) h.setActiveLessonId(id);
        }
      },
      { rootMargin: "-100px 0px -50% 0px", threshold: [0, 0.25, 0.5, 0.75, 1] },
    );
    h.lessons.forEach((l) => {
      const el = document.querySelector(`[data-lesson-id="${l.id}"]`);
      if (el) observer.observe(el);
    });
    return () => observer.disconnect();
  }, [h.lessons.length]);

  if (h.isLoading) return <div className="min-h-screen bg-background flex items-center justify-center"><SigmaSpinner size="lg" /></div>;
  if (!h.course) return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="text-center"><h1 className="text-2xl font-bold mb-4">Курс не найден</h1><Button onClick={() => h.navigate(getAdminAwareBackPath())}>Вернуться к курсам</Button></div>
    </div>
  );

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card px-6 py-4 sticky top-0 z-10">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => h.navigate(getAdminAwareBackPath())}><ArrowLeft className="w-5 h-5" /></Button>
            <SigmaLogo size="sm" />
          </div>
          <div className="flex items-center gap-3">
            <Button variant="outline" size="icon" onClick={() => h.navigate(`/course/${h.courseId}/landing-editor`)} title="Редактор страницы курса"><Globe className="w-4 h-4" /></Button>
            <Button variant="outline" size="icon" onClick={() => h.setIsPageSettingsOpen(true)} title="Настройки страницы курса"><Eye className="w-4 h-4" /></Button>
            <Button variant="outline" onClick={h.handleTogglePublish} className="gap-2">
              {h.course.is_published ? <><EyeOff className="w-4 h-4" /><span className="hidden sm:inline">Снять с публикации</span></> : <><Eye className="w-4 h-4" /><span className="hidden sm:inline">Опубликовать</span></>}
            </Button>
          </div>
        </div>
      </header>

      <div className="fixed bottom-0 left-0 right-0 z-50 bg-gradient-to-t from-background via-background to-transparent pb-4 pt-8 pointer-events-none">
        <div className="max-w-5xl mx-auto px-6 pointer-events-auto">
          <div className="flex justify-center">
            <Button onClick={h.handleSaveCourse} disabled={h.isSaving} size="lg" className="btn-gradient rounded-2xl gap-3 px-8 py-6 text-lg font-semibold shadow-2xl hover:scale-105 transition-transform">
              {h.isSaving ? <SigmaSpinner /> : <Save className="w-5 h-5" />}{h.isSaving ? "Сохранение..." : "Сохранить курс"}
            </Button>
          </div>
        </div>
      </div>

      <main className="max-w-5xl mx-auto p-6 pb-32">
        <div className="feature-card rounded-2xl p-6 mb-8">
          <h2 className="font-display text-xl font-semibold mb-6">Информация о курсе</h2>
          <div className="grid sm:grid-cols-2 gap-6">
            <div className="space-y-2 sm:col-span-2"><Label>Название курса *</Label><Input value={h.title} onChange={e => h.setTitle(e.target.value)} placeholder="Введите название курса" /></div>
            <div className="space-y-2 sm:col-span-2"><Label>Описание</Label><Textarea value={h.description} onChange={e => h.setDescription(e.target.value)} placeholder="Краткое описание курса" className="min-h-[100px]" /></div>
            <div className="space-y-2"><Label>Продолжительность</Label><Input value={h.duration} onChange={e => h.setDuration(e.target.value)} placeholder="Например: 2 недели" /></div>
            <div className="space-y-2"><Label>Академические часы</Label><Input type="number" min="0" value={h.durationHours ?? ""} onChange={e => h.setDurationHours(e.target.value ? parseInt(e.target.value) : null)} placeholder="Например: 40" /></div>
            <div className="space-y-2"><Label>Стоимость (₽)</Label><Input type="number" min="0" value={h.price || ""} onChange={e => h.setPrice(e.target.value ? parseFloat(e.target.value) : 0)} placeholder="0 — бесплатный" /><p className="text-xs text-muted-foreground">Оставьте 0 для бесплатного курса</p></div>
            <div className="space-y-2"><Label>Статус</Label><div className={`inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium ${h.course.is_published ? "bg-sigma-green/10 text-sigma-green" : "bg-muted text-muted-foreground"}`}>{h.course.is_published ? <><Eye className="w-4 h-4" />Опубликован</> : <><EyeOff className="w-4 h-4" />Черновик</>}</div></div>
          </div>
          <div className="mt-6 pt-6 border-t border-border space-y-4">
            <h3 className="font-medium text-sm text-muted-foreground">Настройки прохождения</h3>
            <div className="flex items-center justify-between gap-4 p-4 bg-muted/50 rounded-xl">
              <div className="space-y-0.5"><Label htmlFor="sequential-lessons" className="font-medium">Последовательное прохождение</Label><p className="text-sm text-muted-foreground">Студенты должны пройти все уроки по порядку</p></div>
              <Switch id="sequential-lessons" checked={h.sequentialLessons} onCheckedChange={h.setSequentialLessons} />
            </div>
            {h.sequentialLessons && (
              <div className="flex items-center justify-between gap-4 p-4 bg-muted/50 rounded-xl">
                <div className="space-y-0.5"><Label htmlFor="allow-video-seek" className="font-medium">Разрешить перемотку видео</Label><p className="text-sm text-muted-foreground">Если выключено, студенты не смогут перематывать видео</p></div>
                <Switch id="allow-video-seek" checked={h.allowVideoSeek} onCheckedChange={h.setAllowVideoSeek} />
              </div>
            )}
          </div>
        </div>

        <div className="feature-card rounded-2xl p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="font-display text-xl font-semibold">Уроки ({h.lessons.length})</h2>
            <DropdownMenu>
              <DropdownMenuTrigger asChild><Button className="btn-gradient gap-2"><Plus className="w-4 h-4" />Добавить урок</Button></DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => h.handleAddLesson()}><FileText className="w-4 h-4 mr-2" />Текстовый урок</DropdownMenuItem>
                <DropdownMenuItem onClick={() => h.handleAddLesson()}><Video className="w-4 h-4 mr-2" />Видео урок</DropdownMenuItem>
                <DropdownMenuItem onClick={() => h.handleAddLesson()}><HelpCircle className="w-4 h-4 mr-2" />Тест</DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => h.setIsGitHubImportOpen(true)}><Github className="w-4 h-4 mr-2" />Импорт с GitHub</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {h.lessons.length === 0 ? (
            <div className="text-center py-12 bg-muted/30 rounded-xl">
              <FileText className="w-12 h-12 text-muted-foreground/50 mx-auto mb-4" /><h3 className="font-semibold mb-2">Нет уроков</h3>
              <p className="text-muted-foreground mb-4">Добавьте первый урок в курс</p>
              <Button variant="outline" onClick={() => h.handleAddLesson()} className="gap-2"><Plus className="w-4 h-4" />Добавить урок</Button>
            </div>
          ) : (
            <DndContext sensors={h.sensors} collisionDetection={closestCenter} onDragEnd={h.handleDragEnd}>
              <SortableContext items={h.lessons.map(l => l.id)} strategy={verticalListSortingStrategy}>
                <div className="space-y-3">
                  {h.lessons.map(lesson => (
                    <LessonItem key={lesson.id} lesson={lesson} isExpanded={h.expandedLessonId === lesson.id}
                      onToggleExpand={() => h.setExpandedLessonId(h.expandedLessonId === lesson.id ? null : lesson.id)}
                      onEdit={() => h.handleEditLesson(lesson)} onDelete={() => h.setDeletingLessonId(lesson.id)}
                      onToggleLock={() => h.handleToggleLock(lesson)} />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          )}
        </div>
      </main>

      <LessonEditor lesson={h.editingLesson} isOpen={h.isLessonEditorOpen} onClose={() => { h.setIsLessonEditorOpen(false); h.setEditingLesson(null); h.setEditingQuestions([]); }}
        onSave={h.handleSaveLesson} existingQuestions={h.editingQuestions} courseId={h.courseId} courseTitle={h.title} courseDescription={h.description} organizationId={h.course?.organization_id} />

      {h.courseId && <CoursePageSettingsDialog open={h.isPageSettingsOpen} onOpenChange={h.setIsPageSettingsOpen} courseId={h.courseId} courseTitle={h.title} />}
      <GitHubImportDialog isOpen={h.isGitHubImportOpen} onClose={() => h.setIsGitHubImportOpen(false)} onImport={h.handleGitHubImport} />

      <AlertDialog open={!!h.deletingLessonId} onOpenChange={() => h.setDeletingLessonId(null)}>
        <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Удалить урок?</AlertDialogTitle><AlertDialogDescription>Это действие нельзя отменить. Урок и все связанные с ним данные будут удалены.</AlertDialogDescription></AlertDialogHeader>
        <AlertDialogFooter><AlertDialogCancel>Отмена</AlertDialogCancel><AlertDialogAction onClick={h.handleDeleteLesson} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Удалить</AlertDialogAction></AlertDialogFooter></AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default CourseEditor;
