import React, { useState, useMemo, useCallback } from "react";
import { useOrgDashboard } from "@/contexts/OrgDashboardContext";
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
  MoveRight, Pencil, Video, VideoOff, Lock, Unlock, FastForward,
  Sparkles, ShoppingCart, GripVertical, CheckCircle, Palette, Play, Copy, ImagePlus
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { useCourses } from "@/hooks/useCourses";
import { useSubscriptionLimits } from "@/hooks/useSubscriptionLimits";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { showLimitToast } from "@/utils/limitToast";
import type { Course, CourseCategory, CourseFilter, CourseViewMode } from "@/types";
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors, DragEndEvent } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

interface CoursesTabProps {
  organizationId: string;
  onCourseClick?: (course: Course) => void;
  onOpenCourseDetails?: (course: Course) => void;
  onCoursesDeleted?: () => void;
}

function CoursesEmptyState({ onCreateCourse }: { onCreateCourse: () => void }) {
  let dashboard: ReturnType<typeof useOrgDashboard> | null = null;
  try { dashboard = useOrgDashboard(); } catch {}

  const features = [
    { icon: GripVertical, text: "Drag-and-drop конструктор уроков" },
    { icon: CheckCircle, text: "Тесты с автоматической проверкой" },
    { icon: Play, text: "Видеоуроки с контролем просмотра" },
    { icon: Lock, text: "Последовательное прохождение уроков" },
    { icon: Palette, text: "Брендирование и настройка внешнего вида" },
  ];

  return (
    <div className="py-8">
      <div className="text-center mb-8">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary/10 mb-4">
          <Sparkles className="w-8 h-8 text-primary" />
        </div>
        <h2 className="text-2xl font-bold text-foreground">Начните обучение прямо сейчас</h2>
        <p className="text-muted-foreground mt-2 max-w-lg mx-auto">
          Создайте свой первый курс или выберите из каталога готовых программ
        </p>
      </div>

      <div className="grid md:grid-cols-2 gap-6 max-w-4xl mx-auto">
        {/* Create course card */}
        <Card className="relative overflow-hidden border-2 border-dashed border-primary/30 hover:border-primary/60 transition-all group">
          <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-primary/10 opacity-0 group-hover:opacity-100 transition-opacity" />
          <div className="relative p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                <Edit className="w-5 h-5 text-primary" />
              </div>
              <h3 className="text-lg font-semibold text-foreground">Создать свой курс</h3>
            </div>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Мощный и интуитивный конструктор курсов — создавайте профессиональные учебные программы за минуты, а не дни.
            </p>
            <ul className="space-y-2.5">
              {features.map((f, i) => (
                <li key={i} className="flex items-center gap-2.5 text-sm text-muted-foreground">
                  <f.icon className="w-4 h-4 text-primary/70 shrink-0" />
                  <span>{f.text}</span>
                </li>
              ))}
            </ul>
            <Button className="w-full rounded-xl gap-2 mt-2" onClick={onCreateCourse}>
              <Plus className="w-4 h-4" />
              Создать курс
            </Button>
          </div>
        </Card>

        {/* Marketplace card */}
        <Card className="relative overflow-hidden border-2 border-dashed border-accent/30 hover:border-accent/60 transition-all group">
          <div className="absolute inset-0 bg-gradient-to-br from-accent/5 via-transparent to-accent/10 opacity-0 group-hover:opacity-100 transition-opacity" />
          <div className="relative p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-accent/20 flex items-center justify-center">
                <ShoppingCart className="w-5 h-5 text-accent-foreground" />
              </div>
              <h3 className="text-lg font-semibold text-foreground">Магазин готовых курсов</h3>
            </div>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Более <span className="font-semibold text-foreground">200 готовых курсов</span> уже ждут вас — по охране труда, пожарной безопасности, экологии и другим направлениям.
            </p>
            <div className="rounded-xl bg-accent/10 p-4 space-y-1">
              <p className="text-sm font-medium text-foreground">🎁 Бесплатно для вашей организации</p>
              <p className="text-xs text-muted-foreground">
                Добавляйте курсы из каталога в один клик — без дополнительных затрат
              </p>
            </div>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li className="flex items-center gap-2"><BookOpen className="w-4 h-4 text-primary/70" /> Программы от экспертов отрасли</li>
              <li className="flex items-center gap-2"><Users className="w-4 h-4 text-primary/70" /> Готовы к назначению слушателям</li>
            </ul>
            <Button 
              variant="outline" 
              className="w-full rounded-xl gap-2 mt-2"
              onClick={() => dashboard?.tabNavigation.setActiveTab("services" as any)}
            >
              <ShoppingCart className="w-4 h-4" />
              Перейти в магазин
            </Button>
          </div>
        </Card>
      </div>
    </div>
  );
}

interface SortableCourseListRowProps {
  course: Course;
  isSelected: boolean;
  onToggleSelect: () => void;
  onClick: () => void;
  onEdit: (e: React.MouseEvent) => void;
  onPreview: (e: React.MouseEvent) => void;
  onMove: (e: React.MouseEvent) => void;
  category?: CourseCategory;
}

function SortableCourseListRow({ course, isSelected, onToggleSelect, onClick, onEdit, onPreview, onMove, category }: SortableCourseListRowProps) {
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

export const CoursesTab = React.memo(function CoursesTab({ organizationId, onCourseClick, onOpenCourseDetails, onCoursesDeleted }: CoursesTabProps) {
  const navigate = useNavigate();
  const dashboard = useOrgDashboard();
  const { checkLimit, hasCourseSettings, refetch: refetchLimits } = useSubscriptionLimits(organizationId);
  
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
    duplicate,
    createCat,
    updateCat,
    removeCat,
    refresh,
    updateCourseLocally,
    reorderCourses,
  } = useCourses(organizationId);

  const dndSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  const handleDragEnd = useCallback(async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    await reorderCourses(active.id as string, over.id as string);
  }, [reorderCourses]);
  const [isDuplicating, setIsDuplicating] = useState(false);
  const coverInputRef = React.useRef<HTMLInputElement>(null);
  const [coverUploadCourseId, setCoverUploadCourseId] = useState<string | null>(null);

  const handleCoverUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    const courseId = coverUploadCourseId;
    if (!file || !courseId) return;
    const ext = file.name.split(".").pop();
    const path = `${courseId}/cover.${ext}`;
    const { error } = await supabase.storage.from("course-files").upload(path, file, { upsert: true });
    if (error) { toast.error("Ошибка загрузки обложки"); return; }
    const { data: urlData } = supabase.storage.from("course-files").getPublicUrl(path);
    const { error: updateError } = await supabase.from("courses").update({ cover_image_url: urlData.publicUrl }).eq("id", courseId);
    if (updateError) { toast.error("Ошибка сохранения"); return; }
    toast.success("Обложка обновлена");
    refresh();
    e.target.value = "";
  };

  const handleDuplicate = async (courseId: string) => {
    if (isDuplicating) return;
    setIsDuplicating(true);
    try {
      await duplicate(courseId);
    } finally {
      setIsDuplicating(false);
    }
  };

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
  const menuSettings = dashboard?.dashboardSettings.menuSettings;

  // Initialize view modes from persisted menu_settings
  const initializedRef = React.useRef(false);

  const [folderViewMode, setFolderViewModeLocal] = useState<"folders" | "flat">(
    (menuSettings?.courseFolderMode as "folders" | "flat") || "folders"
  );

  React.useEffect(() => {
    if (menuSettings && !initializedRef.current) {
      initializedRef.current = true;
      if (menuSettings.courseViewMode) setViewMode(menuSettings.courseViewMode as CourseViewMode);
      if (menuSettings.courseFolderMode) setFolderViewModeLocal(menuSettings.courseFolderMode as "folders" | "flat");
    }
  }, [menuSettings]);

  // Save view mode to DB
  const saveViewPrefs = React.useCallback(async (courseViewMode: string, courseFolderMode: string) => {
    if (!organizationId) return;
    try {
      const { data } = await supabase
        .from('organizations')
        .select('menu_settings')
        .eq('id', organizationId)
        .single();
      const current = (data?.menu_settings as Record<string, unknown>) || {};
      const { error } = await supabase
        .from('organizations')
        .update({ menu_settings: { ...current, courseViewMode, courseFolderMode } as any })
        .eq('id', organizationId);
      if (error) {
        console.error('Error saving view prefs:', error);
        toast.error("Ошибка сохранения вида");
      } else {
        toast.success("Вид отображения сохранён");
      }
    } catch (e) {
      console.error('Error saving view prefs:', e);
      toast.error("Ошибка сохранения вида");
    }
  }, [organizationId]);

  const setFolderViewMode = React.useCallback((mode: "folders" | "flat") => {
    setFolderViewModeLocal(mode);
    saveViewPrefs(mode === "folders" ? viewMode : viewMode, mode);
  }, [viewMode, saveViewPrefs]);

  // Combined handler for view mode buttons that change both at once
  const setViewAndFolder = React.useCallback((vm: CourseViewMode, fm: "folders" | "flat") => {
    setViewMode(vm);
    setFolderViewModeLocal(fm);
    saveViewPrefs(vm, fm);
  }, [setViewMode, saveViewPrefs]);

  // Wrap setViewMode to also persist (for folder-mode button only)
  const persistedSetViewMode = React.useCallback((mode: CourseViewMode) => {
    setViewMode(mode);
    saveViewPrefs(mode, folderViewMode);
  }, [setViewMode, folderViewMode, saveViewPrefs]);

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

  const handleOpenCreateCourseDialog = () => {
    const result = checkLimit('course');
    if (!result.allowed) {
      showLimitToast(result.message);
      return;
    }
    setShowCreateCourseDialog(true);
  };

  const handleCreateCourse = async () => {
    if (!newCourseTitle.trim()) return;
    
    // Double-check limit at creation time (not just dialog open)
    const result = checkLimit('course');
    if (!result.allowed) {
      showLimitToast(result.message);
      setShowCreateCourseDialog(false);
      return;
    }
    
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
      refetchLimits(); // Update course count
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
    if (!hasCourseSettings) {
      showLimitToast('Настройки курсов доступны начиная с тарифа «Старт». Перейдите на следующий тариф.');
      return;
    }
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
                        className={`h-7 w-7 ${!hasCourseSettings ? 'opacity-40 cursor-not-allowed' : ''} ${course.skip_video_identification ? 'text-muted-foreground' : 'text-sigma-green'}`}
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
                        className={`h-7 w-7 ${!hasCourseSettings ? 'opacity-40 cursor-not-allowed' : ''} ${course.sequential_lessons ? 'text-amber-500' : 'text-muted-foreground'}`}
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
                        className={`h-7 w-7 ${!hasCourseSettings ? 'opacity-40 cursor-not-allowed' : ''} ${course.allow_video_seek === false ? 'text-destructive' : 'text-muted-foreground'}`}
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
                      <DropdownMenuItem onClick={e => { e.stopPropagation(); handleDuplicate(course.id); }}>
                        <Copy className="w-4 h-4 mr-2" />
                        Дублировать курс
                      </DropdownMenuItem>
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
                  className={`h-7 w-7 bg-background/80 backdrop-blur-sm ${!hasCourseSettings ? 'opacity-40 cursor-not-allowed' : ''} ${course.skip_video_identification ? 'text-muted-foreground' : 'text-sigma-green'}`}
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
                  className={`h-7 w-7 bg-background/80 backdrop-blur-sm ${!hasCourseSettings ? 'opacity-40 cursor-not-allowed' : ''} ${course.sequential_lessons ? 'text-amber-500' : 'text-muted-foreground'}`}
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
                  className={`h-7 w-7 bg-background/80 backdrop-blur-sm ${!hasCourseSettings ? 'opacity-40 cursor-not-allowed' : ''} ${course.allow_video_seek === false ? 'text-destructive' : 'text-muted-foreground'}`}
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
                <DropdownMenuItem onClick={e => { e.stopPropagation(); handleDuplicate(course.id); }}>
                  <Copy className="w-4 h-4 mr-2" />
                  Дублировать курс
                </DropdownMenuItem>
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

  // Catalog view: group by category
  const catalogCoursesByCategory = useMemo(() => {
    const groups: { category: CourseCategory | null; courses: Course[] }[] = [];
    const catMap = new Map<string, Course[]>();
    const uncategorized: Course[] = [];

    filteredCourses.forEach(course => {
      if (course.category_id) {
        if (!catMap.has(course.category_id)) catMap.set(course.category_id, []);
        catMap.get(course.category_id)!.push(course);
      } else {
        uncategorized.push(course);
      }
    });

    categories.forEach(cat => {
      const courses = catMap.get(cat.id);
      if (courses && courses.length > 0) {
        groups.push({ category: cat, courses });
      }
    });
    if (uncategorized.length > 0) {
      groups.push({ category: null, courses: uncategorized });
    }
    return groups;
  }, [filteredCourses, categories]);

  // Catalog-style course card
  const renderCatalogCard = (course: Course) => (
    <div
      key={course.id}
      className="bg-card rounded-2xl border border-border overflow-hidden hover:shadow-lg transition-all cursor-pointer relative group"
      onClick={() => handleCourseClick(course)}
    >
      {/* Cover image */}
      <div className="relative h-44 bg-gradient-to-br from-primary/10 via-muted to-accent/10 flex items-center justify-center overflow-hidden">
        {course.cover_image_url ? (
          <img src={course.cover_image_url} alt={course.title} className="w-full h-full object-cover" />
        ) : (
          <BookOpen className="w-12 h-12 text-primary/30" />
        )}
        {/* Hover three-dot menu */}
        <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
          <DropdownMenu>
            <DropdownMenuTrigger asChild onClick={e => e.stopPropagation()}>
              <Button variant="secondary" size="icon" className="h-8 w-8 rounded-lg shadow-md bg-card/90 backdrop-blur-sm">
                <MoreVertical className="w-4 h-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="rounded-xl">
              <DropdownMenuItem onClick={e => { e.stopPropagation(); handleDuplicate(course.id); }}>
                <Copy className="w-4 h-4 mr-2" />
                Дублировать
              </DropdownMenuItem>
              <DropdownMenuItem onClick={e => { e.stopPropagation(); navigate(`/course-builder/${course.id}`); }}>
                <Edit className="w-4 h-4 mr-2" />
                Настроить
              </DropdownMenuItem>
              <DropdownMenuItem onClick={e => { e.stopPropagation(); setCoverUploadCourseId(course.id); setTimeout(() => coverInputRef.current?.click(), 100); }}>
                <ImagePlus className="w-4 h-4 mr-2" />
                Изменить обложку
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <div className="p-4 space-y-2.5">
        {/* Status badge */}
        <div className="flex items-center gap-2">
          <span className={`inline-flex items-center gap-1 text-xs font-medium ${
            course.is_published ? 'text-sigma-green' : 'text-muted-foreground'
          }`}>
            {course.is_published && <CheckCircle className="w-3.5 h-3.5" />}
            {course.is_published ? 'Опубликован' : 'Черновик'}
          </span>
        </div>

        {/* Title */}
        <h3 className="font-semibold text-base leading-snug line-clamp-2">{course.title}</h3>

        {/* Description */}
        {course.description && (
          <p className="text-sm text-muted-foreground line-clamp-3">{course.description}</p>
        )}

        {/* Category badge */}
        {getCategoryById(course.category_id) && (
          <span
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium text-white"
            style={{ backgroundColor: getCategoryById(course.category_id)?.color }}
          >
            {getCategoryById(course.category_id)?.name}
          </span>
        )}

        {/* Stats */}
        <div className="flex items-center gap-3 text-xs text-muted-foreground pt-1">
          <div className="flex items-center gap-1">
            <Users className="w-3.5 h-3.5" />
            {course.studentsCount || 0} учеников
          </div>
          <div className="flex items-center gap-1">
            <BookOpen className="w-3.5 h-3.5" />
            {course.lessonsCount || 0} уроков
          </div>
        </div>

        {/* Edit button */}
        <Button
          variant="outline"
          className="w-full rounded-xl text-primary border-primary/30 hover:bg-primary/5 mt-1"
          onClick={e => { e.stopPropagation(); navigate(`/course-builder/${course.id}`); }}
        >
          Редактировать курс
        </Button>
      </div>
    </div>
  );

  return (
    <div className="space-y-4 lg:space-y-6">
      {/* Filters */}
      <div className="bg-card rounded-xl lg:rounded-2xl border border-border p-3 lg:p-4">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3 lg:gap-4">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 lg:gap-3">
            <div className="relative flex-1 sm:flex-none">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input 
                placeholder="Поиск..." 
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
              <TooltipProvider delayDuration={300}>
                <Tooltip>
                  <TooltipTrigger asChild>
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
                  </TooltipTrigger>
                  <TooltipContent>Создать новую категорию курсов</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
          </div>
          <div className="flex items-center gap-2 self-end lg:self-auto">
            {/* Настроить каталог */}
            <Button
              variant="outline"
              size="sm"
              className="rounded-xl gap-1.5 text-xs hidden sm:flex"
              onClick={() => {
                setEditingCategory(null);
                setNewCategoryName("");
                setNewCategoryColor("#6366f1");
                setShowCategoryDialog(true);
              }}
            >
              <Filter className="w-4 h-4" />
              Настроить каталог
            </Button>
            <TooltipProvider delayDuration={300}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button 
                    variant={folderViewMode === "folders" ? "secondary" : "ghost"} 
                    size="icon" 
                    className="h-8 w-8" 
                    onClick={() => setViewAndFolder(viewMode, "folders")}
                  >
                    <Folder className="w-4 h-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Вид папками</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button 
                    variant={folderViewMode === "flat" && viewMode === "grid" ? "secondary" : "ghost"} 
                    size="icon" 
                    className="h-8 w-8" 
                    onClick={() => setViewAndFolder("grid", "flat")}
                  >
                    <LayoutGrid className="w-4 h-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Вид сеткой</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button 
                    variant={folderViewMode === "flat" && viewMode === "list" ? "secondary" : "ghost"} 
                    size="icon" 
                    className="h-8 w-8" 
                    onClick={() => setViewAndFolder("list", "flat")}
                  >
                    <List className="w-4 h-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Вид списком</TooltipContent>
              </Tooltip>
            </TooltipProvider>
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
          <TooltipProvider delayDuration={300}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="destructive"
                  size="sm"
                  className="rounded-xl gap-2"
                  onClick={() => setShowBulkDeleteConfirm(true)}
                >
                  <Trash2 className="w-4 h-4" />
                  Удалить выбранные
                </Button>
              </TooltipTrigger>
              <TooltipContent>Удалить выбранные курсы</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      )}

      {/* Course List */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      ) : filteredCourses.length === 0 ? (
        <CoursesEmptyState onCreateCourse={handleOpenCreateCourseDialog} />
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
        <div className="space-y-8">
          {catalogCoursesByCategory.map(({ category, courses: groupCourses }) => (
            <div key={category?.id || "uncategorized"}>
              {/* Category header */}
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2.5">
                  {category && (
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: category.color }} />
                  )}
                  <h3 className="font-semibold text-lg">{category?.name || "Без категории"}</h3>
                  <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">{groupCourses.length}</span>
                </div>
                {category && (
                  <div className="flex items-center gap-1.5">
                    <Button variant="ghost" size="sm" className="text-xs rounded-lg gap-1" onClick={() => openEditCategory(category)}>
                      <Pencil className="w-3.5 h-3.5" />
                      Порядок курсов
                    </Button>
                    <Button variant="ghost" size="sm" className="text-xs rounded-lg gap-1 text-destructive hover:text-destructive" onClick={() => handleDeleteCategory(category.id)}>
                      <Trash2 className="w-3.5 h-3.5" />
                      Удалить категорию
                    </Button>
                  </div>
                )}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
                {groupCourses.map(course => renderCatalogCard(course))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <DndContext sensors={dndSensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <div className="bg-card rounded-2xl border border-border overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border">
                  <th className="w-10 px-2 py-4"></th>
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
                <SortableContext items={filteredCourses.map(c => c.id)} strategy={verticalListSortingStrategy}>
                  {filteredCourses.map(course => (
                    <SortableCourseListRow
                      key={course.id}
                      course={course}
                      isSelected={selectedCourseIds.has(course.id)}
                      onToggleSelect={() => toggleCourseSelection(course.id, { stopPropagation: () => {} } as React.MouseEvent)}
                      onClick={() => handleCourseClick(course)}
                      onEdit={e => { e.stopPropagation(); navigate(`/course-builder/${course.id}`); }}
                      onPreview={e => { e.stopPropagation(); navigate(`/course-preview/${course.id}`); }}
                      onMove={e => openMoveCourseDialog(course, e)}
                      category={getCategoryById(course.category_id)}
                    />
                  ))}
                </SortableContext>
              </tbody>
            </table>
          </div>
        </DndContext>
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
});
