import React from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
import { BookOpen, Users, Edit, Eye, EyeOff, MoreVertical, MoveRight, Video, VideoOff, Lock, Unlock, FastForward, Copy, ArrowRightLeft } from "lucide-react";
import type { Course } from "@/types";

interface Props {
  course: Course;
  compact?: boolean;
  isSelected: boolean;
  onToggleSelect: (courseId: string, e: React.MouseEvent) => void;
  onCourseClick: (course: Course) => void;
  onToggleSetting: (course: Course, setting: 'skip_video_identification' | 'sequential_lessons' | 'allow_video_seek' | 'hidden_from_catalog', e: React.MouseEvent) => void;
  onDuplicate: (courseId: string) => void;
  onMove: (course: Course, e?: React.MouseEvent) => void;
  isAdminView?: boolean;
  onTransfer?: (course: Course) => void;
}

export const CourseCard = React.memo(function CourseCard({ course, compact = false, isSelected, onToggleSelect, onCourseClick, onToggleSetting, onDuplicate, onMove, isAdminView = false, onTransfer }: Props) {
  const navigate = useNavigate();

  return (
    <TooltipProvider delayDuration={200}>
      <div
        className={`bg-card rounded-xl border overflow-hidden hover:shadow-md transition-all cursor-pointer relative group ${
          isSelected ? 'border-primary ring-2 ring-primary/20' : 'border-border'
        } ${compact ? 'p-3' : ''}`}
        onClick={() => onCourseClick(course)}
      >
        {!compact && (
          <>
            <div className="absolute top-3 left-3 z-10" onClick={e => onToggleSelect(course.id, e)}>
              <Checkbox checked={isSelected} className="bg-background/80 backdrop-blur-sm" />
            </div>
            <div className="h-24 bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center">
              <BookOpen className="w-10 h-10 text-primary/50" />
            </div>
          </>
        )}

        <div className={compact ? "" : "p-4"}>
          {compact ? (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <div onClick={e => onToggleSelect(course.id, e)} className="shrink-0">
                  <Checkbox checked={isSelected} className="bg-background/80" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full shrink-0 ${course.is_published ? 'bg-sigma-green/10 text-sigma-green' : 'bg-muted text-muted-foreground'}`}>
                      {course.is_published ? 'Опубл.' : 'Черновик'}
                    </span>
                    <h3 className="font-medium text-sm line-clamp-1 flex-1">{course.title}</h3>
                  </div>
                </div>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  <div className="flex items-center gap-1"><Users className="w-3 h-3" />{course.studentsCount || 0}</div>
                  <div className="flex items-center gap-1"><BookOpen className="w-3 h-3" />{course.lessonsCount || 0}</div>
                </div>
                <div className="flex items-center gap-0.5">
                  <Tooltip><TooltipTrigger asChild><Button variant="ghost" size="icon" className="h-7 w-7" onClick={e => { e.stopPropagation(); navigate(`/course-builder/${course.id}`); }}><Edit className="w-3.5 h-3.5" /></Button></TooltipTrigger><TooltipContent>Редактировать</TooltipContent></Tooltip>
                  <Tooltip><TooltipTrigger asChild><Button variant="ghost" size="icon" className="h-7 w-7" onClick={e => { e.stopPropagation(); navigate(`/course-preview/${course.id}`); }}><Eye className="w-3.5 h-3.5" /></Button></TooltipTrigger><TooltipContent>Просмотр</TooltipContent></Tooltip>
                  <Tooltip><TooltipTrigger asChild><Button variant="ghost" size="icon" className={`h-7 w-7 ${course.hidden_from_catalog ? 'text-muted-foreground' : 'text-sigma-green'}`} onClick={e => onToggleSetting(course, 'hidden_from_catalog', e)}>{course.hidden_from_catalog ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}</Button></TooltipTrigger><TooltipContent>{course.hidden_from_catalog ? 'Скрыт из витрины' : 'Виден в витрине'}</TooltipContent></Tooltip>
                  <CourseDropdownMenu course={course} onToggleSetting={onToggleSetting} onDuplicate={onDuplicate} onMove={onMove} />
                </div>
              </div>
            </div>
          ) : (
            <>
              <div className="flex items-start justify-between gap-2 mb-1">
                <h3 className="font-medium line-clamp-1 text-base">{course.title}</h3>
                <span className={`text-xs px-2 py-0.5 rounded-full shrink-0 ${course.is_published ? 'bg-sigma-green/10 text-sigma-green' : 'bg-muted text-muted-foreground'}`}>
                  {course.is_published ? 'Опубликован' : 'Черновик'}
                </span>
              </div>
              {course.description && <p className="text-xs text-muted-foreground line-clamp-2 mb-2">{course.description}</p>}
              <div className="flex items-center gap-3 text-xs text-muted-foreground mt-2">
                <div className="flex items-center gap-1"><Users className="w-3 h-3" />{course.studentsCount || 0}</div>
                <div className="flex items-center gap-1"><BookOpen className="w-3 h-3" />{course.lessonsCount || 0}</div>
              </div>
            </>
          )}
        </div>

        {!compact && (
          <>
            <div className="absolute top-3 right-12 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1">
              <Tooltip><TooltipTrigger asChild><Button variant="ghost" size="icon" className="h-7 w-7 bg-background/80 backdrop-blur-sm" onClick={e => { e.stopPropagation(); navigate(`/course-builder/${course.id}`); }}><Edit className="w-3.5 h-3.5" /></Button></TooltipTrigger><TooltipContent>Редактировать</TooltipContent></Tooltip>
              <Tooltip><TooltipTrigger asChild><Button variant="ghost" size="icon" className={`h-7 w-7 bg-background/80 backdrop-blur-sm ${course.hidden_from_catalog ? 'text-muted-foreground' : 'text-sigma-green'}`} onClick={e => onToggleSetting(course, 'hidden_from_catalog', e)}>{course.hidden_from_catalog ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}</Button></TooltipTrigger><TooltipContent>{course.hidden_from_catalog ? 'Скрыт из витрины' : 'Виден в витрине'}</TooltipContent></Tooltip>
            </div>
            <div className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity">
              <CourseDropdownMenu course={course} onToggleSetting={onToggleSetting} onDuplicate={onDuplicate} onMove={onMove} />
            </div>
          </>
        )}
      </div>
    </TooltipProvider>
  );
});

function CourseDropdownMenu({ course, onToggleSetting, onDuplicate, onMove }: {
  course: Course;
  onToggleSetting: (course: Course, setting: any, e: React.MouseEvent) => void;
  onDuplicate: (courseId: string) => void;
  onMove: (course: Course, e?: React.MouseEvent) => void;
}) {
  const navigate = useNavigate();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild onClick={e => e.stopPropagation()}>
        <Button variant="ghost" size="icon" className="h-7 w-7 bg-background/80 backdrop-blur-sm"><MoreVertical className="w-4 h-4" /></Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={e => { e.stopPropagation(); navigate(`/course-builder/${course.id}`); }}><Edit className="w-4 h-4 mr-2" />Редактировать</DropdownMenuItem>
        <DropdownMenuItem onClick={e => { e.stopPropagation(); navigate(`/course-preview/${course.id}`); }}><Eye className="w-4 h-4 mr-2" />Просмотр</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={e => onToggleSetting(course, 'skip_video_identification', e)}>{course.skip_video_identification ? <VideoOff className="w-4 h-4 mr-2" /> : <Video className="w-4 h-4 mr-2" />}{course.skip_video_identification ? 'Включить видеоидент.' : 'Отключить видеоидент.'}</DropdownMenuItem>
        <DropdownMenuItem onClick={e => onToggleSetting(course, 'sequential_lessons', e)}>{course.sequential_lessons ? <Lock className="w-4 h-4 mr-2" /> : <Unlock className="w-4 h-4 mr-2" />}{course.sequential_lessons ? 'Отключить послед. уроков' : 'Включить послед. уроков'}</DropdownMenuItem>
        <DropdownMenuItem onClick={e => onToggleSetting(course, 'allow_video_seek', e)}><FastForward className="w-4 h-4 mr-2" />{course.allow_video_seek === false ? 'Разрешить перемотку' : 'Запретить перемотку'}</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={e => { e.stopPropagation(); onDuplicate(course.id); }}><Copy className="w-4 h-4 mr-2" />Дублировать курс</DropdownMenuItem>
        <DropdownMenuItem onClick={e => onMove(course, e)}><MoveRight className="w-4 h-4 mr-2" />Переместить в категорию</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
