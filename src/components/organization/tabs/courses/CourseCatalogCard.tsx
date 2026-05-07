import React from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger, DropdownMenuSub, DropdownMenuSubTrigger, DropdownMenuSubContent, DropdownMenuPortal } from "@/components/ui/dropdown-menu";
import { BookOpen, Users, MoreVertical, Copy, ImagePlus, Wand2, CheckCircle, ArrowRightLeft, MoveRight, Check, FolderOpen } from "lucide-react";
import { SigmaSpinner } from "@/components/ui/SigmaSpinner";
import type { Course, CourseCategory } from "@/types";

interface Props {
  course: Course;
  onCourseClick: (course: Course) => void;
  onDuplicate: (courseId: string) => void;
  onCoverUpload: (courseId: string) => void;
  onGenerateCover: (courseId: string) => void;
  generatingCoverForCourse: string | null;
  getCategoryById: (id: string | null | undefined) => CourseCategory | undefined;
  isAdminView?: boolean;
  onTransfer?: (course: Course) => void;
  categories?: CourseCategory[];
  onMoveToCategory?: (course: Course, categoryId: string | null) => void;
}

export const CourseCatalogCard = React.memo(function CourseCatalogCard({ course, onCourseClick, onDuplicate, onCoverUpload, onGenerateCover, generatingCoverForCourse, getCategoryById, isAdminView, onTransfer, categories, onMoveToCategory }: Props) {
  const category = getCategoryById(course.category_id);

  return (
    <div
      className="bg-card rounded-2xl border border-border overflow-hidden hover:shadow-lg transition-all cursor-pointer relative group"
      onClick={() => onCourseClick(course)}
    >
      <div className="relative h-44 bg-gradient-to-br from-primary/10 via-muted to-accent/10 flex items-center justify-center overflow-hidden">
        {course.cover_image_url ? (
          <img src={course.cover_image_url} alt={course.title} className="w-full h-full object-cover" />
        ) : (
          <BookOpen className="w-12 h-12 text-primary/30" />
        )}
        <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
          <DropdownMenu>
            <DropdownMenuTrigger asChild onClick={e => e.stopPropagation()}>
              <Button variant="secondary" size="icon" className="h-8 w-8 rounded-lg shadow-md bg-card/90 backdrop-blur-sm">
                <MoreVertical className="w-4 h-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="rounded-xl">
              <DropdownMenuItem onClick={e => { e.stopPropagation(); onDuplicate(course.id); }}><Copy className="w-4 h-4 mr-2" />Дублировать</DropdownMenuItem>
              
              <DropdownMenuItem onClick={e => { e.stopPropagation(); onCoverUpload(course.id); }}><ImagePlus className="w-4 h-4 mr-2" />Изменить обложку</DropdownMenuItem>
              <DropdownMenuItem disabled={generatingCoverForCourse === course.id} onClick={e => { e.stopPropagation(); onGenerateCover(course.id); }}>
                {generatingCoverForCourse === course.id ? <SigmaSpinner size="sm" className="mr-2" /> : <Wand2 className="w-4 h-4 mr-2" />}
                {generatingCoverForCourse === course.id ? "Генерация..." : "Сгенерировать с ИИ"}
              </DropdownMenuItem>
              {categories && onMoveToCategory && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuSub>
                    <DropdownMenuSubTrigger>
                      <MoveRight className="w-4 h-4 mr-2" />Переместить в категорию
                    </DropdownMenuSubTrigger>
                    <DropdownMenuPortal>
                      <DropdownMenuSubContent className="rounded-xl max-h-72 overflow-y-auto">
                        <DropdownMenuItem
                          disabled={!course.category_id}
                          onClick={e => { e.stopPropagation(); onMoveToCategory(course, null); }}
                        >
                          <FolderOpen className="w-4 h-4 mr-2 text-muted-foreground" />
                          Без категории
                          {!course.category_id && <Check className="w-4 h-4 ml-auto" />}
                        </DropdownMenuItem>
                        {categories.length > 0 && <DropdownMenuSeparator />}
                        {categories.map(cat => {
                          const isCurrent = course.category_id === cat.id;
                          return (
                            <DropdownMenuItem
                              key={cat.id}
                              disabled={isCurrent}
                              onClick={e => { e.stopPropagation(); onMoveToCategory(course, cat.id); }}
                            >
                              <span className="w-3 h-3 rounded-full mr-2 shrink-0" style={{ backgroundColor: cat.color || 'var(--muted-foreground)' }} />
                              <span className="truncate">{cat.name}</span>
                              {isCurrent && <Check className="w-4 h-4 ml-auto shrink-0" />}
                            </DropdownMenuItem>
                          );
                        })}
                      </DropdownMenuSubContent>
                    </DropdownMenuPortal>
                  </DropdownMenuSub>
                </>
              )}
              {isAdminView && onTransfer && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem className="text-primary focus:text-primary" onClick={e => { e.stopPropagation(); onTransfer(course); }}>
                    <ArrowRightLeft className="w-4 h-4 mr-2" />Перенести в другую организацию
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        {isAdminView && onTransfer && (
          <button
            type="button"
            onClick={e => { e.stopPropagation(); onTransfer(course); }}
            className="absolute top-2 left-2 inline-flex items-center gap-1.5 h-8 px-2.5 rounded-lg shadow-md bg-primary text-primary-foreground hover:bg-primary/90 text-xs font-medium opacity-0 group-hover:opacity-100 transition-opacity"
            title="Перенести копию в другую организацию (админ)"
          >
            <ArrowRightLeft className="w-3.5 h-3.5" />
            Перенести
          </button>
        )}
      </div>

      <div className="p-4 space-y-2.5">
        <div className="flex items-center gap-2">
          <span className={`inline-flex items-center gap-1 text-xs font-medium ${course.is_published ? 'text-sigma-green' : 'text-muted-foreground'}`}>
            {course.is_published && <CheckCircle className="w-3.5 h-3.5" />}
            {course.is_published ? 'Опубликован' : 'Черновик'}
          </span>
        </div>
        <h3 className="font-semibold text-base leading-snug line-clamp-2">{course.title}</h3>
        {course.description && <p className="text-sm text-muted-foreground line-clamp-3">{course.description}</p>}
        {category && (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium text-white" style={{ backgroundColor: category.color }}>
            {category.name}
          </span>
        )}
        <div className="flex items-center gap-3 text-xs text-muted-foreground pt-1">
          <div className="flex items-center gap-1"><Users className="w-3.5 h-3.5" />{course.studentsCount || 0} учеников</div>
          <div className="flex items-center gap-1"><BookOpen className="w-3.5 h-3.5" />{course.lessonsCount || 0} уроков</div>
        </div>
      </div>
    </div>
  );
});
