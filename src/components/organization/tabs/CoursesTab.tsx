import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Label } from "@/components/ui/label";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
import { 
  Search, Filter, Tag, Plus, LayoutGrid, List, Loader2, 
  BookOpen, Users, Edit, Eye, Trash2, FolderOpen, Folder,
  ChevronDown, ChevronRight, MoreVertical, FolderPlus, 
  MoveRight, Pencil, Video, VideoOff, Lock, Unlock, FastForward
} from "lucide-react";
import { useCourses } from "@/hooks/useCourses";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { Course, CourseCategory, CourseFilter, CourseViewMode } from "@/types";

interface CoursesTabProps {
  organizationId: string;
  onCourseClick?: (course: Course) => void;
  onOpenCourseDetails?: (course: Course) => void;
  onCoursesDeleted?: () => void;
}

export function CoursesTab({ organizationId, onCourseClick, onOpenCourseDetails, onCoursesDeleted }: CoursesTabProps) {
  const navigate = useNavigate();
  
  const {
    courses,
    categories,
    isLoading,
    filter,
    setFilter,
    categoryFilter,
    setCategoryFilter,
    searchQuery,
    setSearchQuery,
    viewMode,
    setViewMode,
    filteredCourses,
    create,
    update,
    createCat,
    updateCat,
    removeCat,
    refresh,
    updateCourseLocally,
  } = useCourses(organizationId);

  // Category dialog state
  const [showCategoryDialog, setShowCategoryDialog] = useState(false);
  const [editingCategory, setEditingCategory] = useState<CourseCategory | null>(null);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [newCategoryColor, setNewCategoryColor] = useState("#6366f1");
  const [isCreatingCategory, setIsCreatingCategory] = useState(false);

  // Create course dialog state
  const [showCreateCourseDialog, setShowCreateCourseDialog] = useState(false);
  const [newCourseTitle, setNewCourseTitle] = useState("");
  const [newCourseDescription, setNewCourseDescription] = useState("");
  const [newCourseCategoryId, setNewCourseCategoryId] = useState<string>("");
  const [isCreatingCourse, setIsCreatingCourse] = useState(false);
  const [showInlineNewCategory, setShowInlineNewCategory] = useState(false);
  const [inlineNewCategoryName, setInlineNewCategoryName] = useState("");
  const [inlineNewCategoryColor, setInlineNewCategoryColor] = useState("#6366f1");

  // Move course dialog state
  const [showMoveCourseDialog, setShowMoveCourseDialog] = useState(false);
  const [movingCourse, setMovingCourse] = useState<Course | null>(null);
  const [targetCategoryId, setTargetCategoryId] = useState<string>("");
  const [isMovingCourse, setIsMovingCourse] = useState(false);

  // Bulk selection state
  const [selectedCourseIds, setSelectedCourseIds] = useState<Set<string>>(new Set());
  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false);
  const [isDeletingCourses, setIsDeletingCourses] = useState(false);

  // Folder view state - expanded categories
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set(["uncategorized"]));
  const [folderViewMode, setFolderViewMode] = useState<"folders" | "flat">("folders");

  // Group courses by category
  const coursesByCategory = useMemo(() => {
    const grouped: Record<string, Course[]> = { uncategorized: [] };
    categories.forEach(cat => { grouped[cat.id] = []; });
    
    filteredCourses.forEach(course => {
      if (course.category_id && grouped[course.category_id]) {
        grouped[course.category_id].push(course);
      } else {
        grouped.uncategorized.push(course);
      }
    });
    
    return grouped;
  }, [filteredCourses, categories]);

  const getCategoryById = (categoryId: string | null | undefined): CourseCategory | undefined => {
    if (!categoryId) return undefined;
    return categories.find(c => c.id === categoryId);
  };

  const toggleCategoryExpand = (categoryId: string) => {
    setExpandedCategories(prev => {
      const newSet = new Set(prev);
      if (newSet.has(categoryId)) {
        newSet.delete(categoryId);
      } else {
        newSet.add(categoryId);
      }
      return newSet;
    });
  };

  const handleCreateCategory = async () => {
    if (!newCategoryName.trim()) return;
    setIsCreatingCategory(true);
    
    if (editingCategory) {
      await updateCat(editingCategory.id, { name: newCategoryName.trim(), color: newCategoryColor });
    } else {
      await createCat(newCategoryName.trim(), newCategoryColor);
    }
    
    setNewCategoryName("");
    setNewCategoryColor("#6366f1");
    setEditingCategory(null);
    setShowCategoryDialog(false);
    setIsCreatingCategory(false);
  };

  const handleDeleteCategory = async (categoryId: string) => {
    if (confirm("Удалить категорию? Курсы не будут удалены, только перемещены в 'Без категории'.")) {
      await removeCat(categoryId);
    }
  };

  const openEditCategory = (category: CourseCategory) => {
    setEditingCategory(category);
    setNewCategoryName(category.name);
    setNewCategoryColor(category.color);
    setShowCategoryDialog(true);
  };

  const handleCreateCourse = async () => {
    if (!newCourseTitle.trim()) return;
    setIsCreatingCourse(true);
    
    let categoryId = newCourseCategoryId;
    
    // If creating new category inline
    if (showInlineNewCategory && inlineNewCategoryName.trim()) {
      const newCategory = await createCat(inlineNewCategoryName.trim(), inlineNewCategoryColor);
      if (newCategory) {
        categoryId = newCategory.id;
      }
    }
    
    const course = await create(
      newCourseTitle.trim(), 
      newCourseDescription.trim() || undefined,
      categoryId || undefined
    );
    
    if (course) {
      setNewCourseTitle("");
      setNewCourseDescription("");
      setNewCourseCategoryId("");
      setShowInlineNewCategory(false);
      setInlineNewCategoryName("");
      setInlineNewCategoryColor("#6366f1");
      setShowCreateCourseDialog(false);
      navigate(`/course-builder/${course.id}`);
    }
    
    setIsCreatingCourse(false);
  };

  const handleMoveCourse = async () => {
    if (!movingCourse) return;
    setIsMovingCourse(true);
    
    const success = await update(movingCourse.id, { 
      category_id: targetCategoryId === "none" ? null : targetCategoryId || null 
    });
    
    if (success) {
      toast.success("Курс перемещён");
    }
    
    setShowMoveCourseDialog(false);
    setMovingCourse(null);
    setTargetCategoryId("");
    setIsMovingCourse(false);
  };

  const openMoveCourseDialog = (course: Course, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setMovingCourse(course);
    setTargetCategoryId(course.category_id || "none");
    setShowMoveCourseDialog(true);
  };

  const handleCourseClick = (course: Course) => {
    if (onOpenCourseDetails) {
      onOpenCourseDetails(course);
    } else if (onCourseClick) {
      onCourseClick(course);
    }
  };

  const toggleCourseSelection = (courseId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedCourseIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(courseId)) {
        newSet.delete(courseId);
      } else {
        newSet.add(courseId);
      }
      return newSet;
    });
  };

  const toggleAllCourses = () => {
    if (selectedCourseIds.size === filteredCourses.length) {
      setSelectedCourseIds(new Set());
    } else {
      setSelectedCourseIds(new Set(filteredCourses.map(c => c.id)));
    }
  };

  const handleBulkDelete = async () => {
    if (selectedCourseIds.size === 0) return;
    
    setIsDeletingCourses(true);
    try {
      const courseIds = Array.from(selectedCourseIds);
      
      await supabase.from("enrollments").delete().in("course_id", courseIds);
      await supabase.from("lessons").delete().in("course_id", courseIds);
      await supabase.from("course_documents").delete().in("course_id", courseIds);
      
      const { error } = await supabase.from("courses").delete().in("id", courseIds);
      if (error) throw error;
      
      toast.success(`Удалено курсов: ${courseIds.length}`);
      setSelectedCourseIds(new Set());
      setShowBulkDeleteConfirm(false);
      refresh();
      onCoursesDeleted?.();
    } catch (error) {
      console.error("Error deleting courses:", error);
      toast.error("Ошибка удаления курсов");
    } finally {
      setIsDeletingCourses(false);
    }
  };

  // Toggle course settings with optimistic update
  const handleToggleCourseSetting = async (course: Course, setting: 'skip_video_identification' | 'sequential_lessons' | 'allow_video_seek', e: React.MouseEvent) => {
    e.stopPropagation();
    const currentValue = course[setting] ?? (setting === 'allow_video_seek' ? true : false);
    const newValue = !currentValue;
    
    // Optimistic update for instant UI feedback
    updateCourseLocally(course.id, { [setting]: newValue });
    
    const { error } = await supabase
      .from('courses')
      .update({ [setting]: newValue })
      .eq('id', course.id);
    
    if (!error) {
      const messages: Record<string, [string, string]> = {
        skip_video_identification: ['Видеоидентификация отключена', 'Видеоидентификация включена'],
        sequential_lessons: ['Последовательность уроков включена', 'Последовательность уроков отключена'],
        allow_video_seek: ['Перемотка видео включена', 'Перемотка видео отключена'],
      };
      const [onMsg, offMsg] = messages[setting];
      toast.success(newValue ? onMsg : offMsg);
    } else {
      toast.error('Ошибка сохранения');
      // Revert on error
      updateCourseLocally(course.id, { [setting]: currentValue });
    }
  };

  // Render course card
  const renderCourseCard = (course: Course, compact = false) => (
    <TooltipProvider delayDuration={200}>
      <div 
        key={course.id} 
        className={`bg-card rounded-xl border overflow-hidden hover:shadow-md transition-all cursor-pointer relative group ${
          selectedCourseIds.has(course.id) ? 'border-primary ring-2 ring-primary/20' : 'border-border'
        } ${compact ? 'p-3' : ''}`}
        onClick={() => handleCourseClick(course)}
      >
        {!compact && (
          <>
            {/* Selection Checkbox - desktop only on non-compact */}
            <div className="absolute top-3 left-3 z-10" onClick={e => toggleCourseSelection(course.id, e)}>
              <Checkbox 
                checked={selectedCourseIds.has(course.id)}
                className="bg-background/80 backdrop-blur-sm"
              />
            </div>
            <div className="h-24 bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center">
              <BookOpen className="w-10 h-10 text-primary/50" />
            </div>
          </>
        )}
        
        <div className={compact ? "" : "p-4"}>
          {/* Compact mobile layout - stacked */}
          {compact ? (
            <div className="space-y-2">
              {/* Row 1: Checkbox + Title + Status */}
              <div className="flex items-center gap-2">
                <div onClick={e => toggleCourseSelection(course.id, e)} className="shrink-0">
                  <Checkbox 
                    checked={selectedCourseIds.has(course.id)}
                    className="bg-background/80"
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full shrink-0 ${
                      course.is_published ? 'bg-sigma-green/10 text-sigma-green' : 'bg-muted text-muted-foreground'
                    }`}>
                      {course.is_published ? 'Опубл.' : 'Черновик'}
                    </span>
                    <h3 className="font-medium text-sm line-clamp-1 flex-1">{course.title}</h3>
                  </div>
                </div>
              </div>
              
              {/* Row 2: Stats + Action buttons */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  <div className="flex items-center gap-1">
                    <Users className="w-3 h-3" />
                    {course.studentsCount || 0}
                  </div>
                  <div className="flex items-center gap-1">
                    <BookOpen className="w-3 h-3" />
                    {course.lessonsCount || 0}
                  </div>
                </div>
                
                {/* Action buttons - always visible on mobile */}
                <div className="flex items-center gap-0.5">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        className="h-7 w-7"
                        onClick={e => { e.stopPropagation(); navigate(`/course-builder/${course.id}`); }}
                      >
                        <Edit className="w-3.5 h-3.5" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Редактировать</TooltipContent>
                  </Tooltip>
                  
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        className="h-7 w-7"
                        onClick={e => { e.stopPropagation(); navigate(`/course-preview/${course.id}`); }}
                      >
                        <Eye className="w-3.5 h-3.5" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Просмотр</TooltipContent>
                  </Tooltip>

                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        className={`h-7 w-7 ${course.skip_video_identification ? 'text-muted-foreground' : 'text-sigma-green'}`}
                        onClick={e => handleToggleCourseSetting(course, 'skip_video_identification', e)}
                      >
                        {course.skip_video_identification ? <VideoOff className="w-3.5 h-3.5" /> : <Video className="w-3.5 h-3.5" />}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      {course.skip_video_identification ? 'Видеоидентификация выкл.' : 'Видеоидентификация вкл.'}
                    </TooltipContent>
                  </Tooltip>

                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        className={`h-7 w-7 ${course.sequential_lessons ? 'text-amber-500' : 'text-muted-foreground'}`}
                        onClick={e => handleToggleCourseSetting(course, 'sequential_lessons', e)}
                      >
                        {course.sequential_lessons ? <Lock className="w-3.5 h-3.5" /> : <Unlock className="w-3.5 h-3.5" />}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      {course.sequential_lessons ? 'Последовательность уроков вкл.' : 'Последовательность уроков выкл.'}
                    </TooltipContent>
                  </Tooltip>

                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        className={`h-7 w-7 ${course.allow_video_seek === false ? 'text-destructive' : 'text-muted-foreground'}`}
                        onClick={e => handleToggleCourseSetting(course, 'allow_video_seek', e)}
                      >
                        <FastForward className="w-3.5 h-3.5" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      {course.allow_video_seek === false ? 'Перемотка видео запрещена' : 'Перемотка видео разрешена'}
                    </TooltipContent>
                  </Tooltip>
                  
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild onClick={e => e.stopPropagation()}>
                      <Button variant="ghost" size="icon" className="h-7 w-7">
                        <MoreVertical className="w-4 h-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={e => { e.stopPropagation(); navigate(`/course-builder/${course.id}`); }}>
                        <Edit className="w-4 h-4 mr-2" />
                        Редактировать
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={e => { e.stopPropagation(); navigate(`/course-preview/${course.id}`); }}>
                        <Eye className="w-4 h-4 mr-2" />
                        Просмотр
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={e => openMoveCourseDialog(course, e)}>
                        <MoveRight className="w-4 h-4 mr-2" />
                        Переместить в категорию
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            </div>
          ) : (
            <>
              {/* Desktop/Grid layout */}
              <div className="flex items-start justify-between gap-2 mb-1">
                <h3 className="font-medium line-clamp-1 text-base">{course.title}</h3>
                <div className="flex items-center gap-1 shrink-0">
                  <span className={`text-xs px-2 py-0.5 rounded-full ${
                    course.is_published ? 'bg-sigma-green/10 text-sigma-green' : 'bg-muted text-muted-foreground'
                  }`}>
                    {course.is_published ? 'Опубликован' : 'Черновик'}
                  </span>
                </div>
              </div>
              
              {course.description && (
                <p className="text-xs text-muted-foreground line-clamp-2 mb-2">{course.description}</p>
              )}
              
              <div className="flex items-center gap-3 text-xs text-muted-foreground mt-2">
                <div className="flex items-center gap-1">
                  <Users className="w-3 h-3" />
                  {course.studentsCount || 0}
                </div>
                <div className="flex items-center gap-1">
                  <BookOpen className="w-3 h-3" />
                  {course.lessonsCount || 0}
                </div>
              </div>
            </>
          )}
        </div>
        
        {/* Quick action buttons - desktop grid view only */}
        {!compact && (
          <div className="absolute top-3 right-12 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="h-7 w-7 bg-background/80 backdrop-blur-sm"
                  onClick={e => { e.stopPropagation(); navigate(`/course-builder/${course.id}`); }}
                >
                  <Edit className="w-3.5 h-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Редактировать</TooltipContent>
            </Tooltip>
            
            <Tooltip>
              <TooltipTrigger asChild>
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="h-7 w-7 bg-background/80 backdrop-blur-sm"
                  onClick={e => { e.stopPropagation(); navigate(`/course-preview/${course.id}`); }}
                >
                  <Eye className="w-3.5 h-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Просмотр</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className={`h-7 w-7 bg-background/80 backdrop-blur-sm ${course.skip_video_identification ? 'text-muted-foreground' : 'text-sigma-green'}`}
                  onClick={e => handleToggleCourseSetting(course, 'skip_video_identification', e)}
                >
                  {course.skip_video_identification ? <VideoOff className="w-3.5 h-3.5" /> : <Video className="w-3.5 h-3.5" />}
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                {course.skip_video_identification ? 'Видеоидентификация выкл.' : 'Видеоидентификация вкл.'}
              </TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className={`h-7 w-7 bg-background/80 backdrop-blur-sm ${course.sequential_lessons ? 'text-amber-500' : 'text-muted-foreground'}`}
                  onClick={e => handleToggleCourseSetting(course, 'sequential_lessons', e)}
                >
                  {course.sequential_lessons ? <Lock className="w-3.5 h-3.5" /> : <Unlock className="w-3.5 h-3.5" />}
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                {course.sequential_lessons ? 'Последовательность уроков вкл.' : 'Последовательность уроков выкл.'}
              </TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className={`h-7 w-7 bg-background/80 backdrop-blur-sm ${course.allow_video_seek === false ? 'text-destructive' : 'text-muted-foreground'}`}
                  onClick={e => handleToggleCourseSetting(course, 'allow_video_seek', e)}
                >
                  <FastForward className="w-3.5 h-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                {course.allow_video_seek === false ? 'Перемотка видео запрещена' : 'Перемотка видео разрешена'}
              </TooltipContent>
            </Tooltip>
          </div>
        )}
        
        {/* Context menu - desktop grid view only */}
        {!compact && (
          <div className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity">
            <DropdownMenu>
              <DropdownMenuTrigger asChild onClick={e => e.stopPropagation()}>
                <Button variant="ghost" size="icon" className="h-7 w-7 bg-background/80 backdrop-blur-sm">
                  <MoreVertical className="w-4 h-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={e => { e.stopPropagation(); navigate(`/course-builder/${course.id}`); }}>
                  <Edit className="w-4 h-4 mr-2" />
                  Редактировать
                </DropdownMenuItem>
                <DropdownMenuItem onClick={e => { e.stopPropagation(); navigate(`/course-preview/${course.id}`); }}>
                  <Eye className="w-4 h-4 mr-2" />
                  Просмотр
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={e => openMoveCourseDialog(course, e)}>
                  <MoveRight className="w-4 h-4 mr-2" />
                  Переместить в категорию
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}
      </div>
    </TooltipProvider>
  );

  // Render folder with courses
  const renderCategoryFolder = (categoryId: string, categoryName: string, categoryColor: string | null, coursesInCategory: Course[], isSystem = false) => {
    const isExpanded = expandedCategories.has(categoryId);
    const courseCount = coursesInCategory.length;
    
    if (courseCount === 0 && categoryFilter !== "all" && categoryFilter !== categoryId) return null;
    
    return (
      <Collapsible key={categoryId} open={isExpanded} onOpenChange={() => toggleCategoryExpand(categoryId)}>
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
                <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                  {courseCount}
                </span>
                {isExpanded ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
              </div>
              
              {!isSystem && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild onClick={e => e.stopPropagation()}>
                    <Button variant="ghost" size="icon" className="h-7 w-7">
                      <MoreVertical className="w-4 h-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => openEditCategory({ id: categoryId, name: categoryName, color: categoryColor || '#6366f1', organization_id: organizationId, created_at: '' })}>
                      <Pencil className="w-4 h-4 mr-2" />
                      Редактировать
                    </DropdownMenuItem>
                    <DropdownMenuItem 
                      className="text-destructive"
                      onClick={() => handleDeleteCategory(categoryId)}
                    >
                      <Trash2 className="w-4 h-4 mr-2" />
                      Удалить
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
          </CollapsibleTrigger>
          
          <CollapsibleContent>
            {courseCount === 0 ? (
              <div className="p-4 text-center text-muted-foreground text-sm border-t border-border">
                Нет курсов в этой категории
              </div>
            ) : (
              <div className="p-3 pt-0 grid gap-2">
                {coursesInCategory.map(course => renderCourseCard(course, true))}
              </div>
            )}
          </CollapsibleContent>
        </div>
      </Collapsible>
    );
  };

  return (
    <div className="space-y-4 lg:space-y-6">
      {/* Filters */}
      <div className="bg-card rounded-xl lg:rounded-2xl border border-border p-3 lg:p-4">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3 lg:gap-4">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 lg:gap-3">
            <div className="relative flex-1 sm:flex-none">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input 
                placeholder="Поиск курсов..." 
                value={searchQuery} 
                onChange={e => setSearchQuery(e.target.value)} 
                className="pl-10 w-full sm:w-48 lg:w-64 rounded-xl text-sm" 
              />
            </div>
            <div className="flex items-center gap-2 overflow-x-auto pb-1 lg:pb-0">
              <Select value={filter} onValueChange={v => setFilter(v as CourseFilter)}>
                <SelectTrigger className="w-32 lg:w-40 rounded-xl text-xs lg:text-sm shrink-0">
                  <Filter className="w-4 h-4 mr-1 lg:mr-2" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Все курсы</SelectItem>
                  <SelectItem value="published">Опубликованные</SelectItem>
                  <SelectItem value="draft">Черновики</SelectItem>
                </SelectContent>
              </Select>
              <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                <SelectTrigger className="w-36 lg:w-48 rounded-xl text-xs lg:text-sm shrink-0">
                  <Tag className="w-4 h-4 mr-1 lg:mr-2" />
                  <SelectValue placeholder="Категория" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Все категории</SelectItem>
                  <SelectItem value="none">Без категории</SelectItem>
                  {categories.map(cat => (
                    <SelectItem key={cat.id} value={cat.id}>
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full" style={{ backgroundColor: cat.color }} />
                        {cat.name}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button 
                variant="outline" 
                size="sm" 
                className="rounded-lg gap-1 text-xs shrink-0" 
                onClick={() => {
                  setEditingCategory(null);
                  setNewCategoryName("");
                  setNewCategoryColor("#6366f1");
                  setShowCategoryDialog(true);
                }}
              >
                <FolderPlus className="w-4 h-4" />
                <span className="hidden sm:inline">Категория</span>
              </Button>
            </div>
          </div>
          <div className="flex items-center gap-2 self-end lg:self-auto">
            <Button 
              variant={folderViewMode === "folders" ? "secondary" : "ghost"} 
              size="icon" 
              className="h-8 w-8" 
              onClick={() => setFolderViewMode("folders")}
              title="Папки"
            >
              <Folder className="w-4 h-4" />
            </Button>
            <Button 
              variant={folderViewMode === "flat" && viewMode === "grid" ? "secondary" : "ghost"} 
              size="icon" 
              className="h-8 w-8" 
              onClick={() => { setFolderViewMode("flat"); setViewMode("grid"); }}
              title="Сетка"
            >
              <LayoutGrid className="w-4 h-4" />
            </Button>
            <Button 
              variant={folderViewMode === "flat" && viewMode === "list" ? "secondary" : "ghost"} 
              size="icon" 
              className="h-8 w-8" 
              onClick={() => { setFolderViewMode("flat"); setViewMode("list"); }}
              title="Список"
            >
              <List className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* Bulk Actions Bar */}
      {selectedCourseIds.size > 0 && (
        <div className="bg-primary/10 border border-primary/20 rounded-xl p-3 lg:p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-sm font-medium">
              Выбрано: {selectedCourseIds.size}
            </span>
            <Button
              variant="ghost"
              size="sm"
              className="text-xs"
              onClick={() => setSelectedCourseIds(new Set())}
            >
              Снять выделение
            </Button>
          </div>
          <Button
            variant="destructive"
            size="sm"
            className="rounded-xl gap-2"
            onClick={() => setShowBulkDeleteConfirm(true)}
          >
            <Trash2 className="w-4 h-4" />
            Удалить выбранные
          </Button>
        </div>
      )}

      {/* Course List */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      ) : filteredCourses.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <BookOpen className="w-12 h-12 mx-auto mb-4 opacity-50" />
          <p>Нет курсов</p>
          <Button 
            className="mt-4 rounded-xl gap-2"
            onClick={() => setShowCreateCourseDialog(true)}
          >
            <Plus className="w-4 h-4" />
            Создать первый курс
          </Button>
        </div>
      ) : folderViewMode === "folders" ? (
        <div className="space-y-3">
          {/* Render categories as folders */}
          {categories.map(cat => 
            renderCategoryFolder(cat.id, cat.name, cat.color, coursesByCategory[cat.id] || [])
          )}
          {/* Uncategorized folder */}
          {coursesByCategory.uncategorized.length > 0 && (
            renderCategoryFolder("uncategorized", "Без категории", null, coursesByCategory.uncategorized, true)
          )}
        </div>
      ) : viewMode === "grid" ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 lg:gap-6">
          {filteredCourses.map(course => (
            <div 
              key={course.id} 
              className={`bg-card rounded-2xl border overflow-hidden hover:shadow-lg transition-shadow cursor-pointer relative ${
                selectedCourseIds.has(course.id) ? 'border-primary ring-2 ring-primary/20' : 'border-border'
              }`}
              onClick={() => handleCourseClick(course)}
            >
              {/* Selection Checkbox */}
              <div 
                className="absolute top-3 left-3 z-10"
                onClick={e => toggleCourseSelection(course.id, e)}
              >
                <Checkbox 
                  checked={selectedCourseIds.has(course.id)}
                  className="bg-background/80 backdrop-blur-sm"
                />
              </div>
              <div className="h-32 bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center">
                <BookOpen className="w-12 h-12 text-primary/50" />
              </div>
              <div className="p-5">
                <div className="flex items-start justify-between mb-2">
                  <h3 className="font-semibold text-lg line-clamp-1">{course.title}</h3>
                  <span className={`text-xs px-2 py-1 rounded-full ${
                    course.is_published ? 'bg-sigma-green/10 text-sigma-green' : 'bg-muted text-muted-foreground'
                  }`}>
                    {course.is_published ? 'Опубликован' : 'Черновик'}
                  </span>
                </div>
                {course.description && (
                  <p className="text-sm text-muted-foreground line-clamp-2 mb-3">{course.description}</p>
                )}
                {getCategoryById(course.category_id) && (
                  <span 
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium text-white mb-3" 
                    style={{ backgroundColor: getCategoryById(course.category_id)?.color }}
                  >
                    {getCategoryById(course.category_id)?.name}
                  </span>
                )}
                <div className="flex items-center gap-4 text-sm text-muted-foreground">
                  <div className="flex items-center gap-1">
                    <Users className="w-4 h-4" />
                    {course.studentsCount || 0} учеников
                  </div>
                  <div className="flex items-center gap-1">
                    <BookOpen className="w-4 h-4" />
                    {course.lessonsCount || 0} уроков
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="bg-card rounded-2xl border border-border overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border">
                <th className="w-12 px-4 py-4">
                  <Checkbox 
                    checked={selectedCourseIds.size === filteredCourses.length && filteredCourses.length > 0}
                    onCheckedChange={toggleAllCourses}
                  />
                </th>
                <th className="text-left px-6 py-4 text-sm font-medium text-muted-foreground">Курс</th>
                <th className="text-left px-6 py-4 text-sm font-medium text-muted-foreground">Категория</th>
                <th className="text-left px-6 py-4 text-sm font-medium text-muted-foreground">Статус</th>
                <th className="text-left px-6 py-4 text-sm font-medium text-muted-foreground">Ученики</th>
                <th className="text-left px-6 py-4 text-sm font-medium text-muted-foreground">Уроки</th>
                <th className="text-left px-6 py-4 text-sm font-medium text-muted-foreground">Действия</th>
              </tr>
            </thead>
            <tbody>
              {filteredCourses.map(course => (
                <tr 
                  key={course.id} 
                  className={`border-b border-border last:border-0 hover:bg-secondary/50 transition-colors cursor-pointer ${
                    selectedCourseIds.has(course.id) ? 'bg-primary/5' : ''
                  }`}
                  onClick={() => handleCourseClick(course)}
                >
                  <td className="px-4 py-4" onClick={e => e.stopPropagation()}>
                    <Checkbox 
                      checked={selectedCourseIds.has(course.id)}
                      onCheckedChange={() => toggleCourseSelection(course.id, { stopPropagation: () => {} } as React.MouseEvent)}
                    />
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
                    {getCategoryById(course.category_id) ? (
                      <div className="flex items-center gap-2">
                        <div 
                          className="w-3 h-3 rounded-full" 
                          style={{ backgroundColor: getCategoryById(course.category_id)?.color }} 
                        />
                        <span className="text-sm">{getCategoryById(course.category_id)?.name}</span>
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
                    <div className="flex gap-2">
                      <Button 
                        variant="outline" 
                        size="sm" 
                        className="rounded-lg" 
                        onClick={e => {
                          e.stopPropagation();
                          navigate(`/course-builder/${course.id}`);
                        }}
                      >
                        <Edit className="w-4 h-4" />
                      </Button>
                      <Button 
                        variant="outline" 
                        size="sm" 
                        className="rounded-lg" 
                        onClick={e => {
                          e.stopPropagation();
                          navigate(`/course-preview/${course.id}`);
                        }}
                      >
                        <Eye className="w-4 h-4" />
                      </Button>
                      <Button 
                        variant="outline" 
                        size="sm" 
                        className="rounded-lg" 
                        onClick={e => openMoveCourseDialog(course, e)}
                      >
                        <MoveRight className="w-4 h-4" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Category Dialog */}
      <Dialog open={showCategoryDialog} onOpenChange={setShowCategoryDialog}>
        <DialogContent className="rounded-2xl">
          <DialogHeader>
            <DialogTitle>{editingCategory ? 'Редактировать категорию' : 'Новая категория'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Название</Label>
              <Input
                value={newCategoryName}
                onChange={e => setNewCategoryName(e.target.value)}
                placeholder="Название категории"
                className="rounded-xl"
              />
            </div>
            <div className="space-y-2">
              <Label>Цвет</Label>
              <div className="flex items-center gap-3">
                <input
                  type="color"
                  value={newCategoryColor}
                  onChange={e => setNewCategoryColor(e.target.value)}
                  className="w-12 h-10 rounded-lg cursor-pointer border-0"
                />
                <Input
                  value={newCategoryColor}
                  onChange={e => setNewCategoryColor(e.target.value)}
                  className="rounded-xl flex-1"
                />
              </div>
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <Button variant="outline" onClick={() => setShowCategoryDialog(false)} className="rounded-xl">
              Отмена
            </Button>
            <Button onClick={handleCreateCategory} disabled={isCreatingCategory || !newCategoryName.trim()} className="rounded-xl">
              {isCreatingCategory && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {editingCategory ? 'Сохранить' : 'Создать'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Create Course Dialog */}
      <Dialog open={showCreateCourseDialog} onOpenChange={setShowCreateCourseDialog}>
        <DialogContent className="rounded-2xl">
          <DialogHeader>
            <DialogTitle>Создать курс</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Название курса *</Label>
              <Input
                value={newCourseTitle}
                onChange={e => setNewCourseTitle(e.target.value)}
                placeholder="Введите название"
                className="rounded-xl"
              />
            </div>
            <div className="space-y-2">
              <Label>Описание</Label>
              <Textarea
                value={newCourseDescription}
                onChange={e => setNewCourseDescription(e.target.value)}
                placeholder="Краткое описание курса"
                className="rounded-xl resize-none"
                rows={3}
              />
            </div>
            <div className="space-y-2">
              <Label>Категория</Label>
              {!showInlineNewCategory ? (
                <div className="flex gap-2">
                  <Select value={newCourseCategoryId} onValueChange={setNewCourseCategoryId}>
                    <SelectTrigger className="rounded-xl flex-1">
                      <SelectValue placeholder="Без категории" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Без категории</SelectItem>
                      {categories.map(cat => (
                        <SelectItem key={cat.id} value={cat.id}>
                          <div className="flex items-center gap-2">
                            <div className="w-3 h-3 rounded-full" style={{ backgroundColor: cat.color }} />
                            {cat.name}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button variant="outline" size="icon" onClick={() => setShowInlineNewCategory(true)} className="rounded-xl shrink-0">
                    <Plus className="w-4 h-4" />
                  </Button>
                </div>
              ) : (
                <div className="space-y-2 p-3 bg-secondary/50 rounded-xl">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Новая категория</span>
                    <Button variant="ghost" size="sm" onClick={() => setShowInlineNewCategory(false)}>
                      Отмена
                    </Button>
                  </div>
                  <Input
                    value={inlineNewCategoryName}
                    onChange={e => setInlineNewCategoryName(e.target.value)}
                    placeholder="Название категории"
                    className="rounded-lg"
                  />
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={inlineNewCategoryColor}
                      onChange={e => setInlineNewCategoryColor(e.target.value)}
                      className="w-8 h-8 rounded cursor-pointer border-0"
                    />
                    <span className="text-xs text-muted-foreground">Выберите цвет</span>
                  </div>
                </div>
              )}
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <Button variant="outline" onClick={() => setShowCreateCourseDialog(false)} className="rounded-xl">
              Отмена
            </Button>
            <Button onClick={handleCreateCourse} disabled={isCreatingCourse || !newCourseTitle.trim()} className="rounded-xl">
              {isCreatingCourse && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Создать и редактировать
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Move Course Dialog */}
      <Dialog open={showMoveCourseDialog} onOpenChange={setShowMoveCourseDialog}>
        <DialogContent className="rounded-2xl">
          <DialogHeader>
            <DialogTitle>Переместить курс</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <p className="text-sm text-muted-foreground">
              Курс: <span className="font-medium text-foreground">{movingCourse?.title}</span>
            </p>
            <div className="space-y-2">
              <Label>Выберите категорию</Label>
              <Select value={targetCategoryId} onValueChange={setTargetCategoryId}>
                <SelectTrigger className="rounded-xl">
                  <SelectValue placeholder="Выберите категорию" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Без категории</SelectItem>
                  {categories.map(cat => (
                    <SelectItem key={cat.id} value={cat.id}>
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full" style={{ backgroundColor: cat.color }} />
                        {cat.name}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <Button variant="outline" onClick={() => setShowMoveCourseDialog(false)} className="rounded-xl">
              Отмена
            </Button>
            <Button onClick={handleMoveCourse} disabled={isMovingCourse} className="rounded-xl">
              {isMovingCourse && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Переместить
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Bulk Delete Confirmation */}
      <AlertDialog open={showBulkDeleteConfirm} onOpenChange={setShowBulkDeleteConfirm}>
        <AlertDialogContent className="rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Удалить выбранные курсы?</AlertDialogTitle>
            <AlertDialogDescription>
              Будет удалено {selectedCourseIds.size} курсов со всеми уроками, записями учеников и документами. Это действие нельзя отменить.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-xl">Отмена</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleBulkDelete} 
              disabled={isDeletingCourses}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90 rounded-xl"
            >
              {isDeletingCourses && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Удалить
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
