import React from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { FolderOpen, Folder, ChevronDown, ChevronRight, MoreVertical, Pencil, Trash2, Eye, EyeOff } from "lucide-react";
import type { Course, CourseCategory } from "@/types";
import { CourseCard } from "./CourseCardView";

interface Props {
  categoryId: string;
  categoryName: string;
  categoryColor: string | null;
  courses: Course[];
  isSystem?: boolean;
  hiddenFromCatalog?: boolean;
  isExpanded: boolean;
  onToggleExpand: (id: string) => void;
  onEditCategory: (cat: CourseCategory) => void;
  onDeleteCategory: (id: string) => void;
  onToggleCategoryVisibility: (id: string, hidden: boolean, e: React.MouseEvent) => void;
  organizationId: string;
  // CourseCard props pass-through
  selectedCourseIds: Set<string>;
  onToggleCourseSelect: (courseId: string, e: React.MouseEvent) => void;
  onCourseClick: (course: Course) => void;
  onToggleCourseSetting: (course: Course, setting: any, e: React.MouseEvent) => void;
  onDuplicate: (courseId: string) => void;
  onMoveCourse: (course: Course, e?: React.MouseEvent) => void;
  isAdminView?: boolean;
  onTransfer?: (course: Course) => void;
  onCoverUpload?: (courseId: string) => void;
  onGenerateCover?: (courseId: string) => void;
  generatingCoverForCourse?: string | null;
  onDeleteCourse?: (courseId: string) => void;
}

export const CategoryFolder = React.memo(function CategoryFolder({
  categoryId, categoryName, categoryColor, courses, isSystem = false, hiddenFromCatalog = false,
  isExpanded, onToggleExpand, onEditCategory, onDeleteCategory, onToggleCategoryVisibility,
  organizationId, selectedCourseIds, onToggleCourseSelect, onCourseClick, onToggleCourseSetting, onDuplicate, onMoveCourse,
  isAdminView, onTransfer, onCoverUpload, onGenerateCover, generatingCoverForCourse, onDeleteCourse,
}: Props) {
  const courseCount = courses.length;

  return (
    <Collapsible open={isExpanded} onOpenChange={() => onToggleExpand(categoryId)}>
      <div className="bg-card rounded-xl border border-border overflow-hidden">
        <CollapsibleTrigger asChild>
          <div className="flex items-center justify-between p-3 hover:bg-secondary/50 cursor-pointer transition-colors">
            <div className="flex items-center gap-3">
              {isExpanded ? (
                <FolderOpen className="w-5 h-5" style={{ color: categoryColor || 'var(--muted-foreground)' }} />
              ) : (
                <Folder className="w-5 h-5" style={{ color: categoryColor || 'var(--muted-foreground)' }} />
              )}
              <span className="font-medium">{categoryName}</span>
              <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">{courseCount}</span>
              {isExpanded ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
            </div>

            <div className="flex items-center gap-1">
              {!isSystem && (
                <TooltipProvider delayDuration={200}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button variant="ghost" size="icon" className={`h-7 w-7 ${hiddenFromCatalog ? 'text-muted-foreground' : 'text-sigma-green'}`} onClick={e => onToggleCategoryVisibility(categoryId, hiddenFromCatalog, e)}>
                        {hiddenFromCatalog ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>{hiddenFromCatalog ? 'Категория скрыта из витрины' : 'Категория видна в витрине'}</TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}
              {!isSystem && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild onClick={e => e.stopPropagation()}>
                    <Button variant="ghost" size="icon" className="h-7 w-7"><MoreVertical className="w-4 h-4" /></Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => onEditCategory({ id: categoryId, name: categoryName, color: categoryColor || '#6366f1', organization_id: organizationId, created_at: '' })}>
                      <Pencil className="w-4 h-4 mr-2" />Редактировать
                    </DropdownMenuItem>
                    <DropdownMenuItem className="text-destructive" onClick={() => onDeleteCategory(categoryId)}>
                      <Trash2 className="w-4 h-4 mr-2" />Удалить
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
          </div>
        </CollapsibleTrigger>

        <CollapsibleContent>
          {courseCount === 0 ? (
            <div className="p-4 text-center text-muted-foreground text-sm border-t border-border">Нет курсов в этой категории</div>
          ) : (
            <div className="p-3 pt-0 grid gap-2">
              {courses.map(course => (
                <CourseCard
                  key={course.id}
                  course={course}
                  compact
                  isSelected={selectedCourseIds.has(course.id)}
                  onToggleSelect={onToggleCourseSelect}
                  onCourseClick={onCourseClick}
                  onToggleSetting={onToggleCourseSetting}
                  onDuplicate={onDuplicate}
                  onMove={onMoveCourse}
                  isAdminView={isAdminView}
                  onTransfer={onTransfer}
                  onCoverUpload={onCoverUpload}
                  onGenerateCover={onGenerateCover}
                  generatingCoverForCourse={generatingCoverForCourse}
                  onDelete={onDeleteCourse}
                />
              ))}
            </div>
          )}
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
});
