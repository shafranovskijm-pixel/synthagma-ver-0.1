import { useState, useCallback, useMemo } from "react";
import React from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { showLimitToast } from "@/utils/limitToast";
import type { Course, CourseCategory, CourseViewMode } from "@/types";

interface UseCoursesTabOptions {
  organizationId: string;
  checkLimit: (type: string) => { allowed: boolean; message: string };
  hasCourseSettings: boolean;
  refetchLimits: () => void;
  courses: {
    create: (title: string, description?: string, categoryId?: string) => Promise<Course | null>;
    update: (id: string, updates: Partial<Course>) => Promise<boolean>;
    duplicate: (id: string) => Promise<void>;
    createCat: (name: string, color: string) => Promise<CourseCategory | null>;
    updateCat: (id: string, updates: Partial<CourseCategory>) => Promise<void>;
    removeCat: (id: string) => Promise<void>;
    refresh: () => void;
    updateCourseLocally: (id: string, updates: Partial<Course>) => void;
    filteredCourses: Course[];
    categories: CourseCategory[];
  };
  navigate: (path: string) => void;
  onCoursesDeleted?: () => void;
  menuSettings?: Record<string, unknown> | null;
  setViewMode: (mode: CourseViewMode) => void;
}

export function useCoursesTab(opts: UseCoursesTabOptions) {
  const {
    organizationId, checkLimit, hasCourseSettings, refetchLimits,
    courses, navigate, onCoursesDeleted, menuSettings, setViewMode,
  } = opts;

  const [isDuplicating, setIsDuplicating] = useState(false);
  const coverInputRef = React.useRef<HTMLInputElement>(null);
  const [coverUploadCourseId, setCoverUploadCourseId] = useState<string | null>(null);
  const [generatingCoverForCourse, setGeneratingCoverForCourse] = useState<string | null>(null);

  // Dialog states
  const [showCategoryDialog, setShowCategoryDialog] = useState(false);
  const [editingCategory, setEditingCategory] = useState<CourseCategory | null>(null);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [newCategoryColor, setNewCategoryColor] = useState("#6366f1");
  const [isCreatingCategory, setIsCreatingCategory] = useState(false);
  const [showCreateCourseDialog, setShowCreateCourseDialog] = useState(false);
  const [newCourseTitle, setNewCourseTitle] = useState("");
  const [newCourseDescription, setNewCourseDescription] = useState("");
  const [newCourseCategoryId, setNewCourseCategoryId] = useState<string>("");
  const [isCreatingCourse, setIsCreatingCourse] = useState(false);
  const [showInlineNewCategory, setShowInlineNewCategory] = useState(false);
  const [inlineNewCategoryName, setInlineNewCategoryName] = useState("");
  const [inlineNewCategoryColor, setInlineNewCategoryColor] = useState("#6366f1");
  const [showMoveCourseDialog, setShowMoveCourseDialog] = useState(false);
  const [movingCourse, setMovingCourse] = useState<Course | null>(null);
  const [targetCategoryId, setTargetCategoryId] = useState<string>("");
  const [isMovingCourse, setIsMovingCourse] = useState(false);
  const [selectedCourseIds, setSelectedCourseIds] = useState<Set<string>>(new Set());
  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false);
  const [isDeletingCourses, setIsDeletingCourses] = useState(false);
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set(["uncategorized"]));

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

  const saveViewPrefs = React.useCallback(async (courseViewMode: string, courseFolderMode: string) => {
    if (!organizationId) return;
    try {
      const { data } = await supabase.from('organizations').select('menu_settings').eq('id', organizationId).single();
      const current = (data?.menu_settings as Record<string, unknown>) || {};
      const { error } = await supabase.from('organizations').update({ menu_settings: { ...current, courseViewMode, courseFolderMode } as any }).eq('id', organizationId);
      if (error) { toast.error("Ошибка сохранения вида"); } else { toast.success("Вид отображения сохранён"); }
    } catch { toast.error("Ошибка сохранения вида"); }
  }, [organizationId]);

  const setViewAndFolder = React.useCallback((vm: CourseViewMode, fm: "folders" | "flat") => {
    setViewMode(vm); setFolderViewModeLocal(fm); saveViewPrefs(vm, fm);
  }, [setViewMode, saveViewPrefs]);

  const handleGenerateCourseCover = useCallback(async (courseId: string) => {
    if (generatingCoverForCourse) return;
    setGeneratingCoverForCourse(courseId);
    toast.info("Генерируем обложку с ИИ...", { duration: 10000 });
    try {
      const { data, error } = await supabase.functions.invoke("generate-cover", { body: { courseId, type: "course" } });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast.success("Обложка курса сгенерирована!");
      if (data?.url) courses.updateCourseLocally(courseId, { cover_image_url: data.url });
    } catch (e: any) {
      console.error("AI course cover error:", e);
      toast.error(e?.message || "Ошибка генерации обложки");
    } finally { setGeneratingCoverForCourse(null); }
  }, [generatingCoverForCourse, courses.updateCourseLocally]);

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
    courses.refresh();
    e.target.value = "";
  };

  const handleDuplicate = async (courseId: string) => {
    if (isDuplicating) return;
    setIsDuplicating(true);
    try { await courses.duplicate(courseId); } finally { setIsDuplicating(false); }
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
      const newCategory = await courses.createCat(inlineNewCategoryName.trim(), inlineNewCategoryColor);
      if (newCategory) categoryId = newCategory.id;
    }
    const course = await courses.create(newCourseTitle.trim(), newCourseDescription.trim() || undefined, categoryId || undefined);
    if (course) {
      setNewCourseTitle(""); setNewCourseDescription(""); setNewCourseCategoryId(""); setShowInlineNewCategory(false);
      setInlineNewCategoryName(""); setInlineNewCategoryColor("#6366f1"); setShowCreateCourseDialog(false);
      refetchLimits();
      navigate(`/course-builder/${course.id}`);
    }
    setIsCreatingCourse(false);
  };

  const handleCreateCategory = async () => {
    if (!newCategoryName.trim()) return;
    setIsCreatingCategory(true);
    if (editingCategory) await courses.updateCat(editingCategory.id, { name: newCategoryName.trim(), color: newCategoryColor });
    else await courses.createCat(newCategoryName.trim(), newCategoryColor);
    setNewCategoryName(""); setNewCategoryColor("#6366f1"); setEditingCategory(null); setShowCategoryDialog(false); setIsCreatingCategory(false);
  };

  const handleDeleteCategory = async (categoryId: string) => {
    if (confirm("Удалить категорию? Курсы не будут удалены, только перемещены в 'Без категории'.")) await courses.removeCat(categoryId);
  };

  const handleMoveCourse = async () => {
    if (!movingCourse) return;
    setIsMovingCourse(true);
    const success = await courses.update(movingCourse.id, { category_id: targetCategoryId === "none" ? null : targetCategoryId || null });
    if (success) toast.success("Курс перемещён");
    setShowMoveCourseDialog(false); setMovingCourse(null); setTargetCategoryId(""); setIsMovingCourse(false);
  };

  const openMoveCourseDialog = (course: Course, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setMovingCourse(course); setTargetCategoryId(course.category_id || "none"); setShowMoveCourseDialog(true);
  };

  const openCourseOrderMode = useCallback((category: CourseCategory) => {
    opts.courses.filteredCourses; // trigger dependency
    setViewAndFolder("list", "flat");
    toast.info(`Порядок курсов: ${category.name}`, { description: "Перетаскивайте курс за иконку слева, чтобы изменить порядок внутри категории." });
  }, [setViewAndFolder]);

  const openEditCategory = (category: CourseCategory) => {
    setEditingCategory(category); setNewCategoryName(category.name); setNewCategoryColor(category.color); setShowCategoryDialog(true);
  };

  const toggleCourseSelection = (courseId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedCourseIds(prev => { const s = new Set(prev); s.has(courseId) ? s.delete(courseId) : s.add(courseId); return s; });
  };

  const toggleAllCourses = () => {
    setSelectedCourseIds(selectedCourseIds.size === courses.filteredCourses.length ? new Set() : new Set(courses.filteredCourses.map(c => c.id)));
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
      setSelectedCourseIds(new Set()); setShowBulkDeleteConfirm(false); courses.refresh(); onCoursesDeleted?.();
    } catch { toast.error("Ошибка удаления курсов"); }
    finally { setIsDeletingCourses(false); }
  };

  const handleToggleCourseSetting = async (course: Course, setting: 'skip_video_identification' | 'sequential_lessons' | 'allow_video_seek' | 'hidden_from_catalog', e: React.MouseEvent) => {
    e.stopPropagation();
    if (setting !== 'hidden_from_catalog' && !hasCourseSettings) { showLimitToast('Настройки курсов доступны начиная с тарифа «Старт». Перейдите на следующий тариф.'); return; }
    const currentValue = course[setting] ?? (setting === 'allow_video_seek' ? true : false);
    const newValue = !currentValue;
    courses.updateCourseLocally(course.id, { [setting]: newValue });
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
    } else { toast.error('Ошибка сохранения'); courses.updateCourseLocally(course.id, { [setting]: currentValue }); }
  };

  const handleToggleCategoryVisibility = async (categoryId: string, currentHidden: boolean, e: React.MouseEvent) => {
    e.stopPropagation();
    const { error } = await supabase.from('course_categories').update({ hidden_from_catalog: !currentHidden }).eq('id', categoryId);
    if (!error) { toast.success(!currentHidden ? 'Категория скрыта из витрины' : 'Категория показана в витрине'); courses.refresh(); }
    else toast.error('Ошибка сохранения');
  };

  const toggleCategoryExpand = (categoryId: string) => {
    setExpandedCategories(prev => { const s = new Set(prev); s.has(categoryId) ? s.delete(categoryId) : s.add(categoryId); return s; });
  };

  const coursesByCategory = useMemo(() => {
    const grouped: Record<string, Course[]> = { uncategorized: [] };
    courses.categories.forEach(cat => { grouped[cat.id] = []; });
    courses.filteredCourses.forEach(course => {
      if (course.category_id && grouped[course.category_id]) grouped[course.category_id].push(course);
      else grouped.uncategorized.push(course);
    });
    return grouped;
  }, [courses.filteredCourses, courses.categories]);

  const catalogCoursesByCategory = useMemo(() => {
    const groups: { category: CourseCategory | null; courses: Course[] }[] = [];
    const catMap = new Map<string, Course[]>();
    const uncategorized: Course[] = [];
    courses.filteredCourses.forEach(course => {
      if (course.category_id) { if (!catMap.has(course.category_id)) catMap.set(course.category_id, []); catMap.get(course.category_id)!.push(course); }
      else uncategorized.push(course);
    });
    courses.categories.forEach(cat => { const c = catMap.get(cat.id); if (c && c.length > 0) groups.push({ category: cat, courses: c }); });
    if (uncategorized.length > 0) groups.push({ category: null, courses: uncategorized });
    return groups;
  }, [courses.filteredCourses, courses.categories]);

  const getCategoryById = (categoryId: string | null | undefined): CourseCategory | undefined => {
    if (!categoryId) return undefined;
    return courses.categories.find(c => c.id === categoryId);
  };

  return {
    // Refs
    coverInputRef, coverUploadCourseId, setCoverUploadCourseId,
    // Flags
    isDuplicating, generatingCoverForCourse,
    // Category dialog
    showCategoryDialog, setShowCategoryDialog, editingCategory,
    newCategoryName, setNewCategoryName, newCategoryColor, setNewCategoryColor, isCreatingCategory,
    // Create course dialog
    showCreateCourseDialog, setShowCreateCourseDialog,
    newCourseTitle, setNewCourseTitle, newCourseDescription, setNewCourseDescription,
    newCourseCategoryId, setNewCourseCategoryId, isCreatingCourse,
    showInlineNewCategory, setShowInlineNewCategory,
    inlineNewCategoryName, setInlineNewCategoryName, inlineNewCategoryColor, setInlineNewCategoryColor,
    // Move course dialog
    showMoveCourseDialog, movingCourse, targetCategoryId, setTargetCategoryId, isMovingCourse,
    // Bulk delete
    selectedCourseIds, showBulkDeleteConfirm, setShowBulkDeleteConfirm, isDeletingCourses,
    // Expand/collapse
    expandedCategories, folderViewMode,
    // Computed
    coursesByCategory, catalogCoursesByCategory, getCategoryById,
    // Handlers
    handleGenerateCourseCover, handleCoverUpload, handleDuplicate,
    handleOpenCreateCourseDialog, handleCreateCourse, handleCreateCategory,
    handleDeleteCategory, handleMoveCourse, openMoveCourseDialog,
    openCourseOrderMode, openEditCategory,
    toggleCourseSelection, toggleAllCourses, handleBulkDelete,
    handleToggleCourseSetting, handleToggleCategoryVisibility,
    toggleCategoryExpand, setViewAndFolder,
  };
}
