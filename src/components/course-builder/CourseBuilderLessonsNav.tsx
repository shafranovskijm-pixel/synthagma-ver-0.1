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
        "group flex items-center gap-2 rounded-lg px-2 py-2 text-sm transition-all",
        "border border-transparent hover:border-border hover:bg-muted/60",
        isActive && "bg-primary/10 border-primary/30 text-foreground",
        isDragging && "opacity-50 shadow-md",
      )}
    >
      <button
        {...attributes}
        {...listeners}
        className="cursor-grab active:cursor-grabbing p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
        aria-label="Перетащить"
        onClick={(e) => e.stopPropagation()}
      >
        <GripVertical className="w-3.5 h-3.5 text-muted-foreground" />
      </button>
      <span className="text-xs text-muted-foreground tabular-nums w-5 text-right shrink-0">{index + 1}.</span>
      <div className={cn("w-5 h-5 rounded flex items-center justify-center shrink-0", colorClass)}>
        <Icon className="w-3 h-3" />
      </div>
      <button onClick={onClick} className="flex-1 text-left truncate font-medium" title={lesson.title}>
        {lesson.title || "Без названия"}
      </button>
    </div>
  );
}

function NavList({ lessons, activeLessonId, sensors, onDragEnd, onLessonClick }: Props) {
  return (
    <div className="flex flex-col h-full">
      <div className="px-3 py-3 border-b border-border">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
          Уроки ({lessons.length})
        </p>
      </div>
      <ScrollArea className="flex-1">
        <div className="p-2">
          {lessons.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-6 px-4">
              Уроков пока нет. Добавьте первый — он появится здесь.
            </p>
          ) : (
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
              <SortableContext items={lessons.map((l) => l.id)} strategy={verticalListSortingStrategy}>
                <div className="space-y-1">
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

  return (
    <>
      {/* Desktop sticky panel */}
      <aside className="hidden lg:flex sticky top-24 self-start w-64 shrink-0 h-[calc(100vh-7rem)] rounded-2xl border border-border bg-card shadow-sm overflow-hidden">
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
