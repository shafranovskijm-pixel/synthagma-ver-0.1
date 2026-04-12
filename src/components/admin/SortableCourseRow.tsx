import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { TableRow, TableCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { BookOpen, ExternalLink, HardDrive, Loader2, CheckCircle2, XCircle, RefreshCw, Trash2, GripVertical } from "lucide-react";

interface SortableCourseRowProps {
  course: {
    id: string;
    title: string;
    is_published: boolean;
    lessons_count: number;
    students_count: number;
  };
  migratingCourseId: string | null;
  migrationResult: Record<string, { status: 'success' | 'error'; message: string }>;
  onMigrate: () => void;
  onUpdate: () => void;
  onDelete: () => void;
}

export function SortableCourseRow({ course, migratingCourseId, migrationResult, onMigrate, onUpdate, onDelete }: SortableCourseRowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: course.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <TableRow ref={setNodeRef} style={style} className="hover:bg-muted/40">
      <TableCell className="w-10 px-2">
        <button {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing p-1 text-muted-foreground hover:text-foreground">
          <GripVertical className="w-4 h-4" />
        </button>
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-2">
          <BookOpen className="w-4 h-4 text-primary" />
          <button
            onClick={() => window.open(`/course/${course.id}/edit`, '_blank')}
            className="font-medium text-primary hover:underline cursor-pointer flex items-center gap-1"
          >
            {course.title}
            <ExternalLink className="w-3 h-3" />
          </button>
        </div>
      </TableCell>
      <TableCell className="text-center">
        <Badge variant="secondary">{course.lessons_count}</Badge>
      </TableCell>
      <TableCell className="text-center">
        <Badge variant="secondary">{course.students_count}</Badge>
      </TableCell>
      <TableCell>
        <Badge variant={course.is_published ? "default" : "outline"}>
          {course.is_published ? "Опубликован" : "Черновик"}
        </Badge>
      </TableCell>
      <TableCell className="flex gap-1">
        <Button
          variant="ghost"
          size="icon"
          className={`h-8 w-8 ${
            migrationResult[course.id]?.status === 'success'
              ? 'text-emerald-500'
              : migrationResult[course.id]?.status === 'error'
              ? 'text-destructive'
              : 'text-muted-foreground hover:text-primary'
          }`}
          title={migrationResult[course.id]?.message || "Скачать медиа в хранилище"}
          disabled={migratingCourseId === course.id}
          onClick={onMigrate}
        >
          {migratingCourseId === course.id ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : migrationResult[course.id]?.status === 'success' ? (
            <CheckCircle2 className="w-4 h-4" />
          ) : migrationResult[course.id]?.status === 'error' ? (
            <XCircle className="w-4 h-4" />
          ) : (
            <HardDrive className="w-4 h-4" />
          )}
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-muted-foreground hover:text-primary"
          title="Обновить из SkillSpace (тесты + очистка контента)"
          onClick={onUpdate}
        >
          <RefreshCw className="w-4 h-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-muted-foreground hover:text-destructive"
          onClick={onDelete}
        >
          <Trash2 className="w-4 h-4" />
        </Button>
      </TableCell>
    </TableRow>
  );
}
