import React from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
import { Eye, MoveRight, Users, BookOpen, GripVertical } from "lucide-react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { Course, CourseCategory } from "@/types";

interface SortableCourseListRowProps {
  course: Course;
  isSelected: boolean;
  onToggleSelect: () => void;
  onClick: () => void;
  
  onPreview: (e: React.MouseEvent) => void;
  onMove: (e: React.MouseEvent) => void;
  category?: CourseCategory;
}

export function SortableCourseListRow({ course, isSelected, onToggleSelect, onClick, onPreview, onMove, category }: SortableCourseListRowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: course.id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <tr
      ref={setNodeRef}
      style={style}
      className={`border-b border-border last:border-0 hover:bg-secondary/50 transition-colors cursor-pointer ${
        isSelected ? 'bg-primary/5' : ''
      }`}
      onClick={onClick}
    >
      <td className="px-2 py-4" onClick={e => e.stopPropagation()}>
        <button {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing p-1 text-muted-foreground hover:text-foreground">
          <GripVertical className="w-4 h-4" />
        </button>
      </td>
      <td className="px-4 py-4" onClick={e => e.stopPropagation()}>
        <Checkbox checked={isSelected} onCheckedChange={onToggleSelect} />
      </td>
      <td className="px-6 py-4">
        <div>
          <div className="font-medium">{course.title}</div>
          {course.description && (
            <div className="text-sm text-muted-foreground line-clamp-1">{course.description}</div>
          )}
        </div>
      </td>
      <td className="px-6 py-4">
        {category ? (
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full" style={{ backgroundColor: category.color || undefined }} />
            <span className="text-sm">{category.name}</span>
          </div>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </td>
      <td className="px-6 py-4">
        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${
          course.is_published ? 'bg-sigma-green/10 text-sigma-green' : 'bg-muted text-muted-foreground'
        }`}>
          {course.is_published ? 'Опубликован' : 'Черновик'}
        </span>
      </td>
      <td className="px-6 py-4">
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-primary/10 text-primary">
          <Users className="w-3 h-3" />
          {course.studentsCount || 0}
        </span>
      </td>
      <td className="px-6 py-4">
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-accent/10 text-accent">
          <BookOpen className="w-3 h-3" />
          {course.lessonsCount || 0}
        </span>
      </td>
      <td className="px-6 py-4">
        <TooltipProvider>
          <div className="flex gap-2">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="outline" size="sm" className="rounded-lg" onClick={onEdit}>
                  <Edit className="w-4 h-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Редактировать</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="outline" size="sm" className="rounded-lg" onClick={onPreview}>
                  <Eye className="w-4 h-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Предпросмотр</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="outline" size="sm" className="rounded-lg" onClick={onMove}>
                  <MoveRight className="w-4 h-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Переместить в категорию</TooltipContent>
            </Tooltip>
          </div>
        </TooltipProvider>
      </td>
    </tr>
  );
}
