import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useOrgDashboard } from "@/contexts/OrgDashboardContext";
import { useCourses } from "@/hooks/useCourses";
import { useSubscriptionLimits } from "@/hooks/useSubscriptionLimits";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { showLimitToast } from "@/utils/limitToast";
import type { Course, CourseCategory, CourseFilter, CourseViewMode } from "@/types";
import { useSensor, useSensors, PointerSensor, DragEndEvent } from "@dnd-kit/core";

export function useCoursesTabLogic(organizationId: string) {
  const navigate = useNavigate();
  const dashboard = useOrgDashboard();
  const { checkLimit, hasCourseSettings, refetch: refetchLimits } = useSubscriptionLimits(organizationId);

  const {
    courses, categories, isLoading, error: loadError,
    filter, setFilter, categoryFilter, setCategoryFilter,
    searchQuery, setSearchQuery, viewMode, setViewMode,
    filteredCourses, create, update, duplicate,
    createCat, updateCat, removeCat, refresh,
    updateCourseLocally, reorderCourses,
  } = useCourses(organizationId, {
    initialCourses: dashboard.courses,
    initialCategories: dashboard.categories as CourseCategory[],
    parentReady: !dashboard.isLoadingCourses,
  });

  const dndSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  const handleDragEnd = useCallback(async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    await reorderCourses(active.id as string, over.id as string);
  }, [reorderCourses]);

  const [isDuplicating, setIsDuplicating] = useState(false);
  const coverInputRef = useRef<HTMLInputElement>(null);
  const [coverUploadCourseId, setCoverUploadCourseId] = useState<string | null>(null);
  const [generatingCoverForCourse, setGeneratingCoverForCourse] = useState<string | null>(null);

  const handleGenerateCourseCover = useCallback(async (courseId: string) => {
    if (generatingCoverForCourse) return;
    setGeneratingCoverForCourse(courseId);
    toast.info("Генерируем обложку с ИИ...", { duration: 10000 });
    try {
      const { data, error } = await supabase.functions.invoke("generate-cover", {
        body: { courseId, type: "course" },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast.success("Обложка курса сгенерирована!");
      if (data?.url) updateCourseLocally(courseId, { cover_image_url: data.url });
    } catch (e: any) {
      console.error("AI course cover error:", e);
      toast.error(e?.message || "Ошибка генерации обложки");
    } finally {
      setGeneratingCoverForCourse(null);
    }
  }, [generatingCoverForCourse, updateCourseLocally]);

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
    try { await duplicate(courseId); } finally { setIsDuplicating(false); }
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

  // Folder view state
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set(["uncategorized"]));
  const menuSettings = dashboard?.dashboardSettings.menuSettings;

  const initializedRef = useRef(false);
  const [folderViewMode, setFolderViewModeLocal] = useState<"folders" | "flat">(
    (menuSettings?.courseFolderMode as "folders" | "flat") || "folders"
  );

  useEffect(() => {
    if (menuSettings && !initializedRef.current) {
      initializedRef.current = true;
      if (menuSettings.courseViewMode) setViewMode(menuSettings.courseViewMode as CourseViewMode);
      if (menuSettings.courseFolderMode) setFolderViewModeLocal(menuSettings.courseFolderMode as "folders" | "flat");
    }
  }, [menuSettings]);

  const saveViewPrefs = useCallback(async (courseViewMode: string, courseFolderMode: string) => {
    if (!organizationId) return;
    try {
      const { data } = await supabase.from('organizations').select('menu_settings').eq('id', organizationId).single();
      const current = (data?.menu_settings as Record<string, unknown>) || {};
      const { error } = await supabase.from('organizations').update({ menu_settings: { ...current, courseViewMode, courseFolderMode } as any }).eq('id', organizationId);
      if (error) { console.error('Error saving view prefs:', error); toast.error("Ошибка сохранения вида"); }
      else { toast.success("Вид отображения сохранён"); }
    } catch (e) { console.error('Error saving view prefs:', e); toast.error("Ошибка сохранения вида"); }
  }, [organizationId]);

  const setFolderViewMode = useCallback((mode: "folders" | "flat") => {
    setFolderViewModeLocal(mode);
    saveViewPrefs(mode === "folders" ? viewMode : viewMode, mode);
  }, [viewMode, saveViewPrefs]);

  const setViewAndFolder = useCallback((vm: CourseViewMode, fm: "folders" | "flat") => {
    setViewMode(vm);
    setFolderViewModeLocal(fm);
    saveViewPrefs(vm, fm);
  }, [setViewMode, saveViewPrefs]);

  const persistedSetViewMode = useCallback((mode: CourseViewMode) => {
    setViewMode(mode);
    saveViewPrefs(mode, folderViewMode);
  }, [setViewMode, folderViewMode, saveViewPrefs]);

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
      if (newSet.has(categoryId)) newSet.delete(categoryId);
      else newSet.add(categoryId);
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
    setNewCategoryName(""); setNewCategoryColor("#6366f1"); setEditingCategory(null);
    setShowCategoryDialog(false); setIsCreatingCategory(false);
  };

  const handleDeleteCategory = async (categoryId: string) => {
    if (confirm("Удалить категорию? Курсы не будут удалены, только перемещены в 'Без категории'.")) {
      await removeCat(categoryId);
    }
  };

  const openCourseOrderMode = useCallback((category: CourseCategory) => {
    setCategoryFilter(category.id);
    setViewAndFolder("list", "flat");
    toast.info(`Порядок курсов: ${category.name}`, {
      description: "Перетаскивайте курс за иконку слева, чтобы изменить порядок внутри категории.",
    });
  }, [setCategoryFilter, setViewAndFolder]);

  const openEditCategory = (category: CourseCategory) => {
    setEditingCategory(category);
    setNewCategoryName(category.name);
    setNewCategoryColor(category.color);
    setShowCategoryDialog(true);
  };

  const handleOpenCreateCourseDialog = () => {
    const result = checkLimit('course');
    if (!result.allowed) { showLimitToast(result.message); return; }
    setShowCreateCourseDialog(true);
  };

  const handleCreateCourse = async () => {
    if (!newCourseTitle.trim()) return;
    const result = checkLimit('course');
    if (!result.allowed) { showLimitToast(result.message); setShowCreateCourseDialog(false); return; }
    setIsCreatingCourse(true);
    let categoryId = newCourseCategoryId;
    if (showInlineNewCategory && inlineNewCategoryName.trim()) {
      const newCategory = await createCat(inlineNewCategoryName.trim(), inlineNewCategoryColor);
      if (newCategory) categoryId = newCategory.id;
    }
    const course = await create(newCourseTitle.trim(), newCourseDescription.trim() || undefined, categoryId || undefined);
    if (course) {
      setNewCourseTitle(""); setNewCourseDescription(""); setNewCourseCategoryId("");
      setShowInlineNewCategory(false); setInlineNewCategoryName(""); setInlineNewCategoryColor("#6366f1");
      setShowCreateCourseDialog(false); refetchLimits();
      navigate(`/course-builder/${course.id}`);
    }
    setIsCreatingCourse(false);
  };

  const handleMoveCourse = async () => {
    if (!movingCourse) return;
    setIsMovingCourse(true);
    const success = await update(movingCourse.id, { category_id: targetCategoryId === "none" ? null : targetCategoryId || null });
    if (success) toast.success("Курс перемещён");
    setShowMoveCourseDialog(false); setMovingCourse(null); setTargetCategoryId(""); setIsMovingCourse(false);
  };

  const openMoveCourseDialog = (course: Course, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setMovingCourse(course);
    setTargetCategoryId(course.category_id || "none");
    setShowMoveCourseDialog(true);
  };

  const toggleCourseSelection = (courseId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedCourseIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(courseId)) newSet.delete(courseId); else newSet.add(courseId);
      return newSet;
    });
  };

  const toggleAllCourses = () => {
    if (selectedCourseIds.size === filteredCourses.length) setSelectedCourseIds(new Set());
    else setSelectedCourseIds(new Set(filteredCourses.map(c => c.id)));
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
      setSelectedCourseIds(new Set()); setShowBulkDeleteConfirm(false); refresh();
    } catch (error) {
      console.error("Error deleting courses:", error);
      toast.error("Ошибка удаления курсов");
    } finally {
      setIsDeletingCourses(false);
    }
  };

  const handleToggleCourseSetting = async (course: Course, setting: 'skip_video_identification' | 'sequential_lessons' | 'allow_video_seek' | 'hidden_from_catalog', e: React.MouseEvent) => {
    e.stopPropagation();
    if (setting !== 'hidden_from_catalog' && !hasCourseSettings) {
      showLimitToast('Настройки курсов доступны начиная с тарифа «Старт». Перейдите на следующий тариф.');
      return;
    }
    const currentValue = course[setting] ?? (setting === 'allow_video_seek' ? true : false);
    const newValue = !currentValue;
    updateCourseLocally(course.id, { [setting]: newValue });
    const { error } = await supabase.from('courses').update({ [setting]: newValue }).eq('id', course.id);
    if (!error) {
      const messages: Record<string, [string, string]> = {
        skip_video_identification: ['Видеоидентификация отключена', 'Видеоидентификация включена'],
        sequential_lessons: ['Последовательность уроков включена', 'Последовательность уроков отключена'],
        allow_video_seek: ['Перемотка видео включена', 'Перемотка видео отключена'],
        hidden_from_catalog: ['Курс скрыт из витрины', 'Курс показан в витрине'],
      };
      const [onMsg, offMsg] = messages[setting];
      toast.success(newValue ? onMsg : offMsg);
    } else {
      toast.error('Ошибка сохранения');
      updateCourseLocally(course.id, { [setting]: currentValue });
    }
  };

  const handleToggleCategoryVisibility = async (categoryId: string, currentHidden: boolean, e: React.MouseEvent) => {
    e.stopPropagation();
    const newValue = !currentHidden;
    const { error } = await supabase.from('course_categories').update({ hidden_from_catalog: newValue }).eq('id', categoryId);
    if (!error) {
      toast.success(newValue ? 'Категория скрыта из витрины' : 'Категория показана в витрине');
      refresh();
    } else {
      toast.error('Ошибка сохранения');
    }
  };

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
      if (courses && courses.length > 0) groups.push({ category: cat, courses });
    });
    if (uncategorized.length > 0) groups.push({ category: null, courses: uncategorized });
    return groups;
  }, [filteredCourses, categories]);

  const [contentTab, setContentTab] = useState<"courses" | "webinars" | "3d">("courses");

  return {
    // Data
    courses, categories, isLoading, loadError, filteredCourses, dashboard, navigate,
    // Filters
    filter, setFilter, categoryFilter, setCategoryFilter,
    searchQuery, setSearchQuery, viewMode,
    // DnD
    dndSensors, handleDragEnd,
    // Cover
    coverInputRef, setCoverUploadCourseId, generatingCoverForCourse,
    handleGenerateCourseCover, handleCoverUpload,
    // Course actions
    handleDuplicate, isDuplicating, handleToggleCourseSetting, handleToggleCategoryVisibility,
    // Category dialog
    showCategoryDialog, setShowCategoryDialog, editingCategory, setEditingCategory,
    newCategoryName, setNewCategoryName, newCategoryColor, setNewCategoryColor,
    isCreatingCategory, handleCreateCategory, handleDeleteCategory,
    openEditCategory, openCourseOrderMode,
    // Create course dialog
    showCreateCourseDialog, setShowCreateCourseDialog,
    newCourseTitle, setNewCourseTitle, newCourseDescription, setNewCourseDescription,
    newCourseCategoryId, setNewCourseCategoryId, isCreatingCourse,
    showInlineNewCategory, setShowInlineNewCategory,
    inlineNewCategoryName, setInlineNewCategoryName,
    inlineNewCategoryColor, setInlineNewCategoryColor,
    handleOpenCreateCourseDialog, handleCreateCourse,
    // Move course dialog
    showMoveCourseDialog, setShowMoveCourseDialog,
    movingCourse, targetCategoryId, setTargetCategoryId,
    isMovingCourse, handleMoveCourse, openMoveCourseDialog,
    // Bulk
    selectedCourseIds, setSelectedCourseIds,
    showBulkDeleteConfirm, setShowBulkDeleteConfirm,
    isDeletingCourses, handleBulkDelete,
    toggleCourseSelection, toggleAllCourses,
    // View
    expandedCategories, toggleCategoryExpand,
    folderViewMode, setFolderViewMode, setViewAndFolder, persistedSetViewMode,
    coursesByCategory, getCategoryById, catalogCoursesByCategory,
    // Content tab
    contentTab, setContentTab,
    // Misc
    hasCourseSettings, refresh, updateCourseLocally,
    handleCourseClick: (course: Course, onOpenCourseDetails?: (course: Course) => void, onCourseClick?: (course: Course) => void) => {
      if (onOpenCourseDetails) onOpenCourseDetails(course);
      else if (onCourseClick) onCourseClick(course);
    },
  };
}
