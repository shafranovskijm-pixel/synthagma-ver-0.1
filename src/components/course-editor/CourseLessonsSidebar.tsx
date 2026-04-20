import { useEffect, useState } from "react";
import { DndContext, closestCenter, DragEndEvent } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Plus,
  FileText,
  Video,
  HelpCircle,
  Github,
  GripVertical,
  Lock,
  Menu,
  Image as ImageIcon,
  Headphones,
  Presentation,
  ClipboardList,
  MessageSquare,
  BookCheck,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";

export type AddLessonType =
  | "text"
  | "video"
  | "test"
  | "ai_avatar"
  | "slider"
  | "audio"
  | "feedback"
  | "homework"
  | "image"
  | "practice";

interface Lesson {
  id: string;
  title: string;
  type: string;
  is_locked?: boolean;
}

interface Props {
  lessons: Lesson[];
  activeLessonId: string | null;
  sensors: any;
  onDragEnd: (e: DragEndEvent) => void;
  onLessonClick: (id: string) => void;
  onAddLesson: (type?: AddLessonType) => void;
  onOpenGitHubImport: () => void;
}

const typeIcon = (type: string) => {
  if (type === "video") return Video;
  if (type === "test") return HelpCircle;
  return FileText;
};

const typeColor = (type: string) => {
  if (type === "video") return "text-sigma-purple";
  if (type === "test") return "text-sigma-green";
  return "text-sigma-blue";
};

function SortableLessonRow({
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
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: lesson.id,
  });
  const Icon = typeIcon(lesson.type);
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };
  return (
    <div
      ref={setNodeRef}
      style={style}
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
      >
        <GripVertical className="w-3.5 h-3.5 text-muted-foreground" />
      </button>
      <span className="text-xs text-muted-foreground tabular-nums w-5 text-right shrink-0">
        {index + 1}.
      </span>
      <Icon className={cn("w-3.5 h-3.5 shrink-0", typeColor(lesson.type))} />
      <button
        onClick={onClick}
        className="flex-1 text-left truncate font-medium"
        title={lesson.title}
      >
        {lesson.title || "Без названия"}
      </button>
      {lesson.is_locked && <Lock className="w-3 h-3 text-amber-500 shrink-0" />}
    </div>
  );
}

function SidebarContent(props: Props) {
  const { lessons, activeLessonId, sensors, onDragEnd, onLessonClick, onAddLesson, onOpenGitHubImport } = props;
  return (
    <div className="flex flex-col h-full">
      <div className="px-3 py-3 border-b border-border">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button className="btn-gradient w-full gap-2" size="sm">
              <Plus className="w-4 h-4" /> Добавить урок
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-56">
            <DropdownMenuItem onClick={onAddLesson}>
              <FileText className="w-4 h-4 mr-2" /> Текстовый урок
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onAddLesson}>
              <Video className="w-4 h-4 mr-2" /> Видео урок
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onAddLesson}>
              <HelpCircle className="w-4 h-4 mr-2" /> Тест
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={onOpenGitHubImport}>
              <Github className="w-4 h-4 mr-2" /> Импорт с GitHub
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <p className="text-xs text-muted-foreground mt-2 px-1">
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
                    <SortableLessonRow
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

export function CourseLessonsSidebar(props: Props) {
  const [mobileOpen, setMobileOpen] = useState(false);

  // Close mobile sheet on lesson click
  const handleLessonClick = (id: string) => {
    props.onLessonClick(id);
    setMobileOpen(false);
  };

  return (
    <>
      {/* Desktop sticky sidebar */}
      <aside className="hidden lg:flex fixed left-0 top-[73px] bottom-0 w-72 border-r border-border bg-card/95 shadow-sm z-20 flex-col">
        <SidebarContent {...props} onLessonClick={handleLessonClick} />
      </aside>

      {/* Mobile trigger + sheet */}
      <div className="lg:hidden fixed bottom-24 left-4 z-40">
        <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
          <SheetTrigger asChild>
            <Button size="sm" variant="secondary" className="shadow-lg gap-2 rounded-full">
              <Menu className="w-4 h-4" /> Уроки ({props.lessons.length})
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-80 p-0">
            <div className="h-full pt-6">
              <SidebarContent {...props} onLessonClick={handleLessonClick} />
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </>
  );
}
