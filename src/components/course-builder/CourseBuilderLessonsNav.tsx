import { useState } from "react";
import { DndContext, closestCenter, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { GripVertical, Menu, FileText, ArrowLeft, Plus, CheckSquare, Presentation, Headphones, MessageSquare, BookCheck, Sparkles, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { lessonIcons, lessonColors, type Lesson, type LessonType } from "@/components/course-builder/LessonTypeConfig";

type LessonTypeOption = { type: LessonType; icon: LucideIcon; label: string; description: string; iconClass: string };

const LESSON_TYPE_OPTIONS: LessonTypeOption[] = [
  { type: "text", icon: FileText, label: "Текст", description: "Форматированный текст с видео, аудио и изображениями. Прикрепляйте файлы для скачивания.", iconClass: "text-primary bg-primary/10" },
  { type: "test", icon: CheckSquare, label: "Тест", description: "Проверка знаний с вариантами ответов, изображениями и пояснениями. Настраиваемый проходной балл.", iconClass: "text-sigma-orange bg-sigma-orange/10" },
  { type: "slider", icon: Presentation, label: "Слайды", description: "Презентация с переключаемыми слайдами. Удобно для пошагового объяснения материала.", iconClass: "text-amber-500 bg-amber-500/10" },
  { type: "audio", icon: Headphones, label: "Аудио", description: "Аудиоурок: подкаст, лекция или интервью. Поддержка фоновой обложки и описания.", iconClass: "text-green-500 bg-green-500/10" },
  { type: "feedback", icon: MessageSquare, label: "Обратная связь", description: "Студент отправляет текстовый ответ — он попадает в чат организации. Урок засчитывается автоматически.", iconClass: "text-blue-500 bg-blue-500/10" },
  { type: "homework", icon: BookCheck, label: "Задание", description: "Домашнее задание с проверкой преподавателем. Студент прикрепляет текст и файлы, ждёт одобрения.", iconClass: "text-indigo-500 bg-indigo-500/10" },
  { type: "ai_avatar", icon: Sparkles, label: "ИИ-преподаватель", description: "Голосовой диалог с ИИ-аватаром на тему урока. По умолчанию ограничен 5 минутами.", iconClass: "text-fuchsia-500 bg-gradient-to-br from-fuchsia-500/10 to-pink-500/10" },
];

interface Props {
  lessons: Lesson[];
  activeLessonId: string | null;
  sensors: any;
  onDragEnd: (e: DragEndEvent) => void;
  onLessonClick: (id: string) => void;
  onBack?: () => void;
  backLabel?: string;
  /** When true, sidebar uses embedded offsets (no global header above) */
  embedded?: boolean;
  onAddLesson?: (type: LessonType) => void;
  onOpenAIDialog?: () => void;
}

function SortableNavRow({
  lesson,
  index,
  isActive,
  onClick,
}: {
  lesson: Lesson;
  index: number;
  isActive: boolean;
  onClick: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: lesson.id });
  const Icon = lessonIcons[lesson.type] || FileText;
  const colorClass = lessonColors[lesson.type] || "text-primary bg-primary/10";

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        "group flex items-start gap-2 rounded-xl px-2.5 py-2.5 text-sm transition-all",
        "hover:bg-primary/10 hover:text-primary hover:translate-x-0.5",
        isActive && "bg-primary/15 text-primary",
        isDragging && "opacity-50 shadow-md",
      )}
    >
      <button
        {...attributes}
        {...listeners}
        className="cursor-grab active:cursor-grabbing p-0.5 mt-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
        aria-label="Перетащить"
        onClick={(e) => e.stopPropagation()}
      >
        <GripVertical className="w-3.5 h-3.5 text-muted-foreground" />
      </button>
      <span className="text-xs text-muted-foreground tabular-nums w-5 text-right shrink-0 mt-0.5">{index + 1}.</span>
      <div className={cn("w-6 h-6 rounded-lg flex items-center justify-center shrink-0 mt-0.5", colorClass)}>
        <Icon className="w-3.5 h-3.5" />
      </div>
      <button
        onClick={onClick}
        className="flex-1 text-left font-medium leading-snug min-w-0 line-clamp-2 break-words"
        title={lesson.title}
      >
        {lesson.title || "Без названия"}
      </button>
    </div>
  );
}

function AddLessonButton({
  onAddLesson,
  onOpenAIDialog,
  afterAction,
}: {
  onAddLesson?: (type: LessonType) => void;
  onOpenAIDialog?: () => void;
  afterAction?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [selectedType, setSelectedType] = useState<LessonType>("text");

  if (!onAddLesson && !onOpenAIDialog) return null;

  const selected = LESSON_TYPE_OPTIONS.find((o) => o.type === selectedType) ?? LESSON_TYPE_OPTIONS[0];

  const handleConfirm = () => {
    onAddLesson?.(selectedType);
    setOpen(false);
    afterAction?.();
  };

  const handleAI = () => {
    onOpenAIDialog?.();
    setOpen(false);
    afterAction?.();
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button
        size="sm"
        className="btn-gradient w-full gap-2 rounded-xl shadow-sm"
        onClick={() => setOpen(true)}
      >
        <Plus className="w-4 h-4" /> Добавить урок
      </Button>

      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Выберите тип занятия</DialogTitle>
          <DialogDescription>
            Каждый тип урока подходит для своих задач — выберите подходящий формат.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {LESSON_TYPE_OPTIONS.map((opt) => {
            const Icon = opt.icon;
            const isActive = opt.type === selectedType;
            return (
              <button
                key={opt.type}
                type="button"
                onClick={() => setSelectedType(opt.type)}
                className={cn(
                  "group flex flex-col items-center justify-center gap-2 rounded-xl border-2 p-4 text-center transition-all",
                  "hover:border-primary/40 hover:bg-primary/5",
                  isActive
                    ? "border-primary bg-primary/10 shadow-sm"
                    : "border-border/60 bg-card",
                )}
              >
                <div className={cn("w-11 h-11 rounded-xl flex items-center justify-center", opt.iconClass)}>
                  <Icon className="w-5 h-5" />
                </div>
                <span className={cn("text-sm font-medium leading-tight", isActive ? "text-primary" : "text-foreground")}>
                  {opt.label}
                </span>
              </button>
            );
          })}
        </div>

        <div className="rounded-xl border border-border/60 bg-muted/30 p-4">
          <p className="text-sm font-semibold text-foreground mb-1">{selected.label}</p>
          <p className="text-sm text-muted-foreground leading-relaxed">{selected.description}</p>
        </div>

        {onOpenAIDialog && (
          <button
            type="button"
            onClick={handleAI}
            className="inline-flex items-center justify-center gap-2 text-sm font-medium text-primary hover:text-primary/80 transition-colors"
          >
            <Sparkles className="w-4 h-4" /> Создать урок с помощью ИИ
          </button>
        )}

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" onClick={() => setOpen(false)}>
            Отмена
          </Button>
          <Button className="btn-gradient" onClick={handleConfirm} disabled={!onAddLesson}>
            Далее
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function NavList({ lessons, activeLessonId, sensors, onDragEnd, onLessonClick, onBack, backLabel, onAddLesson, onOpenAIDialog, afterAction }: Props & { afterAction?: () => void }) {
  return (
    <div className="flex flex-col h-full">
      {onBack && (
        <button
          onClick={onBack}
          className="flex items-center gap-2 px-4 py-3 border-b border-border/50 text-sm font-medium text-muted-foreground hover:text-primary hover:bg-primary/5 transition-colors shrink-0"
        >
          <ArrowLeft className="w-4 h-4" />
          {backLabel || "Назад к разделам"}
        </button>
      )}
      {(onAddLesson || onOpenAIDialog) && (
        <div className="px-3 pt-3 pb-2 shrink-0">
          <AddLessonButton onAddLesson={onAddLesson} onOpenAIDialog={onOpenAIDialog} afterAction={afterAction} />
        </div>
      )}
      <div className="px-4 py-3 border-b border-border/50 shrink-0">
        <p className="text-[11px] font-semibold text-muted-foreground/70 uppercase tracking-wider">
          Уроки ({lessons.length})
        </p>
      </div>
      <ScrollArea className="flex-1 min-h-0">
        <div className="p-2">
          {lessons.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-6 px-4">
              Уроков пока нет. Добавьте первый — он появится здесь.
            </p>
          ) : (
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
              <SortableContext items={lessons.map((l) => l.id)} strategy={verticalListSortingStrategy}>
                <div className="space-y-0.5">
                  {lessons.map((lesson, i) => (
                    <SortableNavRow
                      key={lesson.id}
                      lesson={lesson}
                      index={i}
                      isActive={activeLessonId === lesson.id}
                      onClick={() => onLessonClick(lesson.id)}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

export function CourseBuilderLessonsNav(props: Props) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const handleClick = (id: string) => {
    props.onLessonClick(id);
    setMobileOpen(false);
  };

  // Embedded: панель встроена в /organization, над ней sticky-хедер ~316px.
  // Standalone: только собственный sticky-хедер ~96px.
  // Используем dvh с минимальным запасом, чтобы длинные списки уроков (40+) полностью скроллились.
  const stickyTop = props.embedded ? "top-[180px]" : "top-24";
  const stickyMaxH = props.embedded ? "max-h-[calc(100dvh-200px)]" : "max-h-[calc(100dvh-7rem)]";

  return (
    <>
      {/* Desktop sticky panel — в стиле штатного сайдбара курса */}
      <aside
        className={cn(
          "hidden lg:flex flex-col sticky self-start w-72 shrink-0 rounded-2xl border border-border/60 bg-gradient-to-b from-card to-muted/20 shadow-sm overflow-hidden",
          stickyTop,
          stickyMaxH,
        )}
      >
        <NavList {...props} onLessonClick={handleClick} />
      </aside>

      {/* Mobile floating trigger + sheet */}
      <div className="lg:hidden fixed bottom-24 left-4 z-40">
        <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
          <SheetTrigger asChild>
            <Button size="sm" variant="secondary" className="shadow-lg gap-2 rounded-full">
              <Menu className="w-4 h-4" /> Уроки ({props.lessons.length})
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-80 p-0">
            <div className="h-full pt-6">
              <NavList {...props} onLessonClick={handleClick} afterAction={() => setMobileOpen(false)} />
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </>
  );
}
