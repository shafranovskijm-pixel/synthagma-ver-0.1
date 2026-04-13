import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Button } from "@/components/ui/button";
import { 
  GripVertical, 
  FileText, 
  Video, 
  HelpCircle, 
  Trash2, 
  Edit,
  ChevronDown,
  ChevronUp,
  Lock,
  Unlock
} from "lucide-react";
import { cn } from "@/lib/utils";

interface Lesson {
  id: string;
  title: string;
  type: string;
  content: string | null;
  order_index: number;
  is_locked?: boolean;
}

interface LessonItemProps {
  lesson: Lesson;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onToggleLock?: () => void;
}

const lessonTypeConfig = {
  text: { 
    icon: FileText, 
    label: "Текст", 
    color: "bg-sigma-blue/10 text-sigma-blue" 
  },
  video: { 
    icon: Video, 
    label: "Видео", 
    color: "bg-sigma-purple/10 text-sigma-purple" 
  },
  test: { 
    icon: HelpCircle, 
    label: "Тест", 
    color: "bg-sigma-green/10 text-sigma-green" 
  },
};

export const LessonItem = ({ 
  lesson, 
  isExpanded, 
  onToggleExpand, 
  onEdit, 
  onDelete,
  onToggleLock
}: LessonItemProps) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: lesson.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const config = lessonTypeConfig[lesson.type as keyof typeof lessonTypeConfig] || lessonTypeConfig.text;
  const Icon = config.icon;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "feature-card border border-border rounded-xl transition-all",
        isDragging && "opacity-50 shadow-lg"
      )}
    >
      <div className="flex items-center gap-3 p-4">
        <button
          {...attributes}
          {...listeners}
          className="cursor-grab active:cursor-grabbing p-1 hover:bg-muted rounded"
        >
          <GripVertical className="w-5 h-5 text-muted-foreground" />
        </button>

        <div className={cn("w-10 h-10 rounded-lg flex items-center justify-center", config.color)}>
          <Icon className="w-5 h-5" />
        </div>

        <div className="flex-1 min-w-0">
          <h4 className="font-medium truncate">{lesson.title}</h4>
          <span className={cn("text-xs px-2 py-0.5 rounded-full", config.color)}>
            {config.label}
          </span>
        </div>

        <div className="flex items-center gap-1">
          {onToggleLock && (
            <Button variant="ghost" size="icon" onClick={onToggleLock} title={lesson.is_locked ? "Разблокировать урок" : "Заблокировать урок"}>
              {lesson.is_locked ? (
                <Lock className="w-4 h-4 text-amber-500" />
              ) : (
                <Unlock className="w-4 h-4 text-muted-foreground" />
              )}
            </Button>
          )}
          <Button variant="ghost" size="icon" onClick={onToggleExpand}>
            {isExpanded ? (
              <ChevronUp className="w-4 h-4" />
            ) : (
              <ChevronDown className="w-4 h-4" />
            )}
          </Button>
          <Button variant="ghost" size="icon" onClick={onEdit}>
            <Edit className="w-4 h-4" />
          </Button>
          <Button variant="ghost" size="icon" onClick={onDelete} className="text-destructive hover:text-destructive">
            <Trash2 className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {isExpanded && lesson.content && (
        <div className="px-4 pb-4 pt-0">
          <div className="bg-muted/50 rounded-lg p-4 text-sm text-muted-foreground">
            {lesson.type === "video" ? (
              <div className="aspect-video bg-background rounded-lg flex items-center justify-center">
                <Video className="w-12 h-12 text-muted-foreground/50" />
                <span className="ml-2">Видео: {lesson.content}</span>
              </div>
            ) : lesson.type === "test" ? (
              <span>Тест с вопросами</span>
            ) : (
              <div 
                className="prose prose-sm dark:prose-invert max-w-none"
                dangerouslySetInnerHTML={{ __html: lesson.content.slice(0, 200) + "..." }}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
};
