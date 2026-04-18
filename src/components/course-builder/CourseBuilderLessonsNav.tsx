import { useState } from "react";
import { DndContext, closestCenter, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { GripVertical, Menu, FileText, ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import { lessonIcons, lessonColors, type Lesson } from "@/components/course-builder/LessonTypeConfig";

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

function NavList({ lessons, activeLessonId, sensors, onDragEnd, onLessonClick, onBack, backLabel }: Props) {
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

  // Embedded режим: нет глобальной шапки над редактором → меньший top.
  // Standalone: есть собственный sticky header → top-24.
  const stickyTop = props.embedded ? "top-4" : "top-24";
  const stickyMaxH = props.embedded ? "max-h-[calc(100vh-2rem)]" : "max-h-[calc(100vh-7rem)]";

  return (
    <>
      {/* Desktop sticky panel — в стиле штатного сайдбара курса */}
      <aside
        className={cn(
          "hidden lg:flex sticky self-start w-72 shrink-0 rounded-2xl border border-border/60 bg-gradient-to-b from-card to-muted/20 shadow-sm overflow-hidden",
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
              <NavList {...props} onLessonClick={handleClick} />
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </>
  );
}
