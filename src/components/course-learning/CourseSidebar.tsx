import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader,
  AlertDialogTitle, AlertDialogTrigger
} from "@/components/ui/alert-dialog";
import { ArrowLeft, CheckCircle2, Circle, Lock, Clock, Trophy, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";

interface Lesson {
  id: string;
  title: string;
  type: string;
  locked_until?: string | null;
}

interface CourseSidebarProps {
  courseTitle: string;
  lessons: Lesson[];
  currentLessonIndex: number;
  completedCount: number;
  progressPercent: number;
  getLessonIcon: (type: string) => any;
  isLessonCompleted: (id: string) => boolean;
  isLessonAccessible: (index: number) => boolean;
  goToLesson: (index: number) => void;
  resetCourseProgress: () => void;
  onNavigateBack: () => void;
  onNavigate?: () => void;
}

export function CourseSidebarContent({
  courseTitle, lessons, currentLessonIndex, completedCount, progressPercent,
  getLessonIcon, isLessonCompleted, isLessonAccessible, goToLesson,
  resetCourseProgress, onNavigateBack, onNavigate,
}: CourseSidebarProps) {
  return (
    <>
      <div className="p-4 border-b border-border">
        <Button variant="ghost" size="sm" onClick={onNavigateBack} className="mb-4 hover:bg-secondary">
          <ArrowLeft className="w-4 h-4 mr-2" />Назад
        </Button>
        <h2 className="font-bold text-lg line-clamp-2">{courseTitle}</h2>
        <div className="mt-4">
          <div className="flex justify-between text-sm text-muted-foreground mb-2">
            <span>Прогресс</span>
            <span className="font-medium">{completedCount}/{lessons.length}</span>
          </div>
          <Progress value={progressPercent} className="h-2" />
        </div>
      </div>
      <ScrollArea className="flex-1">
        <div className="p-2 space-y-1">
          {lessons.map((lesson, index) => {
            const completed = isLessonCompleted(lesson.id);
            const isCurrent = index === currentLessonIndex;
            const isAccessible = isLessonAccessible(index);
            return (
              <button key={lesson.id} onClick={() => { goToLesson(index); onNavigate?.(); }} disabled={!isAccessible}
                className={cn("w-full flex items-center gap-3 p-3 rounded-xl text-left transition-all duration-200", isCurrent ? "bg-primary/10 text-primary shadow-sm" : isAccessible ? "hover:bg-muted" : "opacity-50 cursor-not-allowed")}>
                {completed ? (
                  <div className="w-8 h-8 rounded-full bg-sigma-green/10 flex items-center justify-center shrink-0"><CheckCircle2 className="w-5 h-5 text-sigma-green" /></div>
                ) : !isAccessible ? (
                  <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center shrink-0"><Lock className="w-4 h-4 text-muted-foreground" /></div>
                ) : (
                  <div className={cn("w-8 h-8 rounded-full flex items-center justify-center shrink-0", isCurrent ? "bg-primary/10" : "bg-muted")}><Circle className={cn("w-5 h-5", isCurrent ? "text-primary" : "text-muted-foreground")} /></div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium line-clamp-2">{lesson.title}</div>
                  <div className="flex items-center gap-1 text-xs text-muted-foreground mt-1">
                    {lesson.type === 'text' && 'Текст'}
                    {lesson.type === 'video' && 'Видео'}
                    {lesson.type === 'test' && 'Тест'}
                    {lesson.type === 'audio' && 'Аудио'}
                    {lesson.type === 'feedback' && 'Обратная связь'}
                    {lesson.type === 'homework' && 'Задание'}
                    {!isAccessible && lesson.locked_until && new Date(lesson.locked_until).getTime() > Date.now() ? (
                      <span className="ml-1 text-amber-500">• Откроется {new Date(lesson.locked_until).toLocaleDateString('ru-RU')}</span>
                    ) : !isAccessible ? (
                      <span className="ml-1">• Заблокировано</span>
                    ) : null}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </ScrollArea>
      <div className="p-4 border-t border-border space-y-3">
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <div className="flex items-center gap-1"><Clock className="w-4 h-4" /><span>{lessons.length} уроков</span></div>
          <div className="flex items-center gap-1"><Trophy className="w-4 h-4 text-sigma-green" /><span>{completedCount} пройдено</span></div>
        </div>
        {completedCount > 0 && (
          <AlertDialog>
            <AlertDialogTrigger asChild><Button variant="outline" size="sm" className="w-full text-muted-foreground"><RotateCcw className="w-4 h-4 mr-2" />Сбросить прогресс</Button></AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader><AlertDialogTitle>Сбросить прогресс курса?</AlertDialogTitle><AlertDialogDescription>Все результаты тестов и отметки о прохождении уроков будут удалены.</AlertDialogDescription></AlertDialogHeader>
              <AlertDialogFooter><AlertDialogCancel>Отмена</AlertDialogCancel><AlertDialogAction onClick={resetCourseProgress}>Сбросить</AlertDialogAction></AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
      </div>
    </>
  );
}
