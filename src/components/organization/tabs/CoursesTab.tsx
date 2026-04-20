import React, { useState, useMemo, useCallback } from "react";
import { useOrgDashboard } from "@/contexts/OrgDashboardContext";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { BookOpen, Trash2, GripVertical, Video, Box, Sparkles } from "lucide-react";
import { AIAvatarManager } from "@/components/organization/AIAvatarManager";
import { WebinarsContent, ThreeDContent } from "./courses/ContentTabPlaceholders";
import { CoursesToolbar } from "./courses/CoursesToolbar";
import { useCourses } from "@/hooks/useCourses";
import { useSubscriptionLimits } from "@/hooks/useSubscriptionLimits";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { showLimitToast } from "@/utils/limitToast";
import type { Course, CourseCategory, CourseFilter, CourseViewMode } from "@/types";
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors, DragEndEvent } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CoursesEmptyState } from "./courses/CoursesEmptyState";
import { SortableCourseListRow } from "./courses/CourseListRow";
import { CategoryDialog, CreateCourseDialog, MoveCourseDialog, BulkDeleteDialog } from "./courses/CourseDialogs";
import { CourseCard } from "./courses/CourseCardView";
import { CourseCatalogCard } from "./courses/CourseCatalogCard";
import { CategoryFolder } from "./courses/CategoryFolder";
import { TransferCourseDialog } from "@/components/organization/dialogs/TransferCourseDialog";
import { SigmaSpinner } from "@/components/ui/SigmaSpinner";

interface CoursesTabProps {
  organizationId: string;
  onCourseClick?: (course: Course) => void;
  onOpenCourseDetails?: (course: Course) => void;
  onCoursesDeleted?: () => void;
}

export const CoursesTab = React.memo(function CoursesTab({ organizationId, onCourseClick, onOpenCourseDetails, onCoursesDeleted }: CoursesTabProps) {
  const navigate = useNavigate();
  const dashboard = useOrgDashboard();
  const { checkLimit, hasCourseSettings, refetch: refetchLimits } = useSubscriptionLimits(organizationId);
  
  const {
    courses, categories, isLoading, error: loadError, filter, setFilter,
    categoryFilter, setCategoryFilter, searchQuery, setSearchQuery,
    viewMode, setViewMode, filteredCourses, create, update, duplicate,
    createCat, updateCat, removeCat, refresh, updateCourseLocally, reorderCourses
  } = useCourses(organizationId, {
    initialCourses: dashboard.courses,
    initialCategories: dashboard.categories as CourseCategory[],
    parentReady: !dashboard.isLoadingCourses
  });

  const dndSensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));
  const handleDragEnd = useCallback(async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    await reorderCourses(active.id as string, over.id as string);
  }, [reorderCourses]);

  const [isDuplicating, setIsDuplicating] = useState(false);
  const coverInputRef = React.useRef<HTMLInputElement>(null);
  const [coverUploadCourseId, setCoverUploadCourseId] = useState<string | null>(null);
  const [generatingCoverForCourse, setGeneratingCoverForCourse] = useState<string | null>(null);

  const handleGenerateCourseCover = useCallback(async (courseId: string) => {
    if (generatingCoverForCourse) return;
    setGeneratingCoverForCourse(courseId);
    toast.info("Генерируем обложку с ИИ...", { duration: 10000 });
    try {
      const { data, error } = await supabase.functions.invoke("generate-cover", { body: { courseId, type: "course" } });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast.success("Обложка курса сгенерирована!");
      if (data?.url) updateCourseLocally(courseId, { cover_image_url: data.url });
    } catch (e: any) {
      console.error("AI course cover error:", e);
      toast.error(e?.message || "Ошибка генерации обложки");
    } finally { setGeneratingCoverForCourse(null); }
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

  // Transfer course (admin-only)
  const isAdminView = !!dashboard.isAdminView;
  const [transferCourse, setTransferCourse] = useState<Course | null>(null);
  const handleTransfer = useCallback((course: Course) => {
    setTransferCourse(course);
  }, []);

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
  const menuSettings = dashboard?.dashboardSettings.menuSettings;

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

  // Grouping
  const coursesByCategory = useMemo(() => {
    const grouped: Record<string, Course[]> = { uncategorized: [] };
    categories.forEach(cat => { grouped[cat.id] = []; });
    filteredCourses.forEach(course => {
      if (course.category_id && grouped[course.category_id]) grouped[course.category_id].push(course);
      else grouped.uncategorized.push(course);
    });
    return grouped;
  }, [filteredCourses, categories]);

  const getCategoryById = (categoryId: string | null | undefined): CourseCategory | undefined => {
    if (!categoryId) return undefined;
    return categories.find(c => c.id === categoryId);
  };

  const toggleCategoryExpand = (categoryId: string) => {
    setExpandedCategories(prev => { const s = new Set(prev); s.has(categoryId) ? s.delete(categoryId) : s.add(categoryId); return s; });
  };

  // Handlers
  const handleCreateCategory = async () => {
    if (!newCategoryName.trim()) return;
    setIsCreatingCategory(true);
    if (editingCategory) await updateCat(editingCategory.id, { name: newCategoryName.trim(), color: newCategoryColor });
    else await createCat(newCategoryName.trim(), newCategoryColor);
    setNewCategoryName(""); setNewCategoryColor("#6366f1"); setEditingCategory(null); setShowCategoryDialog(false); setIsCreatingCategory(false);
  };

  const handleDeleteCategory = async (categoryId: string) => {
    if (confirm("Удалить категорию? Курсы не будут удалены, только перемещены в 'Без категории'.")) await removeCat(categoryId);
  };

  const openCourseOrderMode = useCallback((category: CourseCategory) => {
    setCategoryFilter(category.id);
    setViewAndFolder("list", "flat");
    toast.info(`Порядок курсов: ${category.name}`, { description: "Перетаскивайте курс за иконку слева, чтобы изменить порядок внутри категории." });
  }, [setCategoryFilter, setViewAndFolder]);

  const openEditCategory = (category: CourseCategory) => {
    setEditingCategory(category); setNewCategoryName(category.name); setNewCategoryColor(category.color); setShowCategoryDialog(true);
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
      setNewCourseTitle(""); setNewCourseDescription(""); setNewCourseCategoryId(""); setShowInlineNewCategory(false);
      setInlineNewCategoryName(""); setInlineNewCategoryColor("#6366f1"); setShowCreateCourseDialog(false);
      refetchLimits();
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
    setMovingCourse(course); setTargetCategoryId(course.category_id || "none"); setShowMoveCourseDialog(true);
  };

  const handleCourseClick = (course: Course) => {
    if (onOpenCourseDetails) onOpenCourseDetails(course);
    else if (onCourseClick) onCourseClick(course);
  };

  const toggleCourseSelection = (courseId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedCourseIds(prev => { const s = new Set(prev); s.has(courseId) ? s.delete(courseId) : s.add(courseId); return s; });
  };

  const toggleAllCourses = () => {
    setSelectedCourseIds(selectedCourseIds.size === filteredCourses.length ? new Set() : new Set(filteredCourses.map(c => c.id)));
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
      setSelectedCourseIds(new Set()); setShowBulkDeleteConfirm(false); refresh(); onCoursesDeleted?.();
    } catch { toast.error("Ошибка удаления курсов"); }
    finally { setIsDeletingCourses(false); }
  };

  const handleToggleCourseSetting = async (course: Course, setting: 'skip_video_identification' | 'sequential_lessons' | 'allow_video_seek' | 'hidden_from_catalog', e: React.MouseEvent) => {
    e.stopPropagation();
    if (setting !== 'hidden_from_catalog' && !hasCourseSettings) { showLimitToast('Настройки курсов доступны начиная с тарифа «Старт». Перейдите на следующий тариф.'); return; }
    const currentValue = course[setting] ?? (setting === 'allow_video_seek' ? true : false);
    const newValue = !currentValue;
    updateCourseLocally(course.id, { [setting]: newValue });
    const { error } = await supabase.from('courses').update({ [setting]: newValue }).eq('id', course.id);
    if (!error) {
      const messages: Record<string, [string, string]> = {
        skip_video_identification: ['Видеоидентификация отключена', 'Видеоидентификация включена'],
        sequential_lessons: ['Последовательность уроков включена', 'Последовательность уроков отключена'],
        allow_video_seek: ['Перемотка видео включена', 'Перемотка видео отключена'],
        hidden_from_catalog: ['Курс скрыт из витрины', 'Курс показан в витрине']
      };
      const [onMsg, offMsg] = messages[setting];
      toast.success(newValue ? onMsg : offMsg);
    } else { toast.error('Ошибка сохранения'); updateCourseLocally(course.id, { [setting]: currentValue }); }
  };

  const handleToggleCategoryVisibility = async (categoryId: string, currentHidden: boolean, e: React.MouseEvent) => {
    e.stopPropagation();
    const { error } = await supabase.from('course_categories').update({ hidden_from_catalog: !currentHidden }).eq('id', categoryId);
    if (!error) { toast.success(!currentHidden ? 'Категория скрыта из витрины' : 'Категория показана в витрине'); refresh(); }
    else toast.error('Ошибка сохранения');
  };

  const catalogCoursesByCategory = useMemo(() => {
    const groups: { category: CourseCategory | null; courses: Course[] }[] = [];
    const catMap = new Map<string, Course[]>();
    const uncategorized: Course[] = [];
    filteredCourses.forEach(course => {
      if (course.category_id) { if (!catMap.has(course.category_id)) catMap.set(course.category_id, []); catMap.get(course.category_id)!.push(course); }
      else uncategorized.push(course);
    });
    categories.forEach(cat => { const c = catMap.get(cat.id); if (c && c.length > 0) groups.push({ category: cat, courses: c }); });
    if (uncategorized.length > 0) groups.push({ category: null, courses: uncategorized });
    return groups;
  }, [filteredCourses, categories]);

  const [contentTab, setContentTab] = useState<"courses" | "webinars" | "3d" | "ai-tutor">("courses");

  return (
    <div className="space-y-4 lg:space-y-6">
      <input ref={coverInputRef} type="file" accept="image/*" className="hidden" onChange={handleCoverUpload} />

      {/* Content type tabs */}
      <div className="flex items-center gap-1 bg-muted rounded-xl p-1 w-fit">
        {[
          { key: "courses" as const, icon: BookOpen, label: "Курсы" },
          { key: "webinars" as const, icon: Video, label: "Вебинары" },
          { key: "3d" as const, icon: Box, label: "3D-тренажёры" },
          { key: "ai-tutor" as const, icon: Sparkles, label: "ИИ-преподаватель" },
        ].map(tab => (
          <button key={tab.key} onClick={() => setContentTab(tab.key)} className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${contentTab === tab.key ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
            <tab.icon className="w-4 h-4 inline-block mr-2" />{tab.label}
          </button>
        ))}
      </div>

      {/* Webinars */}
      {contentTab === "webinars" && (
        <WebinarsContent
          organizationId={organizationId}
          isEnabled={dashboard.isEnabled('webinars')}
          onNavigateToTariffs={() => dashboard.tabNavigation.setActiveTab("subscription" as any)}
        />
      )}

      {/* 3D */}
      {contentTab === "3d" && <ThreeDContent />}

      {/* AI Tutor */}
      {contentTab === "ai-tutor" && <AIAvatarManager organizationId={organizationId} />}

      {/* Courses content */}
      {contentTab === "courses" && <>
      {/* Filters */}
      <CoursesToolbar
        searchQuery={searchQuery} setSearchQuery={setSearchQuery}
        filter={filter} setFilter={setFilter}
        categoryFilter={categoryFilter} setCategoryFilter={setCategoryFilter}
        categories={categories} viewMode={viewMode} folderViewMode={folderViewMode}
        setViewAndFolder={setViewAndFolder}
        onNewCategory={() => { setEditingCategory(null); setNewCategoryName(""); setNewCategoryColor("#6366f1"); setShowCategoryDialog(true); }}
      />

      {/* Bulk Actions */}
      {selectedCourseIds.size > 0 && (
        <div className="bg-primary/10 border border-primary/20 rounded-xl p-3 lg:p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-sm font-medium">Выбрано: {selectedCourseIds.size}</span>
            <Button variant="ghost" size="sm" className="text-xs" onClick={() => setSelectedCourseIds(new Set())}>Снять выделение</Button>
          </div>
          <Button variant="destructive" size="sm" className="rounded-xl gap-2" onClick={() => setShowBulkDeleteConfirm(true)}>
            <Trash2 className="w-4 h-4" />Удалить выбранные
          </Button>
        </div>
      )}

      {/* Course List */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12"><SigmaSpinner size="lg" /></div>
      ) : loadError ? (
        <div className="py-12 text-center space-y-4">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-destructive/10 mb-2"><BookOpen className="w-8 h-8 text-destructive" /></div>
          <h3 className="text-lg font-semibold text-foreground">Не удалось загрузить курсы</h3>
          <p className="text-sm text-muted-foreground max-w-md mx-auto">Произошла ошибка при загрузке. Попробуйте обновить страницу.</p>
          <Button variant="outline" onClick={refresh} className="gap-2">Попробовать снова</Button>
        </div>
      ) : filteredCourses.length === 0 && courses.length === 0 ? (
        <CoursesEmptyState onCreateCourse={handleOpenCreateCourseDialog} />
      ) : filteredCourses.length === 0 ? (
        <div className="py-12 text-center"><p className="text-muted-foreground">Нет курсов, соответствующих фильтрам</p></div>
      ) : folderViewMode === "folders" ? (
        <div className="space-y-3">
          {categories.map(cat => (
            <CategoryFolder
              key={cat.id}
              categoryId={cat.id} categoryName={cat.name} categoryColor={cat.color}
              courses={coursesByCategory[cat.id] || []}
              hiddenFromCatalog={!!(cat as any).hidden_from_catalog}
              isExpanded={expandedCategories.has(cat.id)}
              onToggleExpand={toggleCategoryExpand}
              onEditCategory={openEditCategory}
              onDeleteCategory={handleDeleteCategory}
              onToggleCategoryVisibility={handleToggleCategoryVisibility}
              organizationId={organizationId}
              selectedCourseIds={selectedCourseIds}
              onToggleCourseSelect={toggleCourseSelection}
              onCourseClick={handleCourseClick}
              onToggleCourseSetting={handleToggleCourseSetting}
              onDuplicate={handleDuplicate}
              onMoveCourse={openMoveCourseDialog}
              isAdminView={isAdminView}
              onTransfer={handleTransfer}
            />
          ))}
          {coursesByCategory.uncategorized.length > 0 && (
            <CategoryFolder
              categoryId="uncategorized" categoryName="Без категории" categoryColor={null}
              courses={coursesByCategory.uncategorized} isSystem
              isExpanded={expandedCategories.has("uncategorized")}
              onToggleExpand={toggleCategoryExpand}
              onEditCategory={() => {}} onDeleteCategory={() => {}}
              onToggleCategoryVisibility={() => {}}
              organizationId={organizationId}
              selectedCourseIds={selectedCourseIds}
              onToggleCourseSelect={toggleCourseSelection}
              onCourseClick={handleCourseClick}
              onToggleCourseSetting={handleToggleCourseSetting}
              onDuplicate={handleDuplicate}
              onMoveCourse={openMoveCourseDialog}
              isAdminView={isAdminView}
              onTransfer={handleTransfer}
            />
          )}
        </div>
      ) : viewMode === "grid" ? (
        <div className="space-y-8">
          {catalogCoursesByCategory.map(({ category, courses: groupCourses }) => (
            <div key={category?.id || "uncategorized"}>
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2.5">
                  {category && <div className="w-3 h-3 rounded-full" style={{ backgroundColor: category.color }} />}
                  <h3 className="font-semibold text-lg">{category?.name || "Без категории"}</h3>
                  <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">{groupCourses.length}</span>
                </div>
                {category && (
                  <div className="flex items-center gap-1.5">
                    <Button variant="ghost" size="sm" className="text-xs rounded-lg gap-1" onClick={() => openCourseOrderMode(category)}><GripVertical className="w-3.5 h-3.5" />Порядок курсов</Button>
                    <Button variant="ghost" size="sm" className="text-xs rounded-lg gap-1 text-destructive hover:text-destructive" onClick={() => handleDeleteCategory(category.id)}><Trash2 className="w-3.5 h-3.5" />Удалить категорию</Button>
                  </div>
                )}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
                {groupCourses.map(course => (
                  <CourseCatalogCard
                    key={course.id} course={course} onCourseClick={handleCourseClick} onDuplicate={handleDuplicate}
                    onCoverUpload={(id) => { setCoverUploadCourseId(id); setTimeout(() => coverInputRef.current?.click(), 100); }}
                    onGenerateCover={handleGenerateCourseCover} generatingCoverForCourse={generatingCoverForCourse}
                    getCategoryById={getCategoryById}
                    isAdminView={isAdminView}
                    onTransfer={handleTransfer}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <DndContext sensors={dndSensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <div className="bg-card rounded-2xl border border-border overflow-hidden">
            <table className="w-full">
              <thead><tr className="border-b border-border">
                <th className="w-10 px-2 py-4"></th>
                <th className="w-12 px-4 py-4"><Checkbox checked={selectedCourseIds.size === filteredCourses.length && filteredCourses.length > 0} onCheckedChange={toggleAllCourses} /></th>
                <th className="text-left px-6 py-4 text-sm font-medium text-muted-foreground">Курс</th>
                <th className="text-left px-6 py-4 text-sm font-medium text-muted-foreground">Категория</th>
                <th className="text-left px-6 py-4 text-sm font-medium text-muted-foreground">Статус</th>
                <th className="text-left px-6 py-4 text-sm font-medium text-muted-foreground">Ученики</th>
                <th className="text-left px-6 py-4 text-sm font-medium text-muted-foreground">Уроки</th>
                <th className="text-left px-6 py-4 text-sm font-medium text-muted-foreground">Действия</th>
              </tr></thead>
              <tbody>
                <SortableContext items={filteredCourses.map(c => c.id)} strategy={verticalListSortingStrategy}>
                  {filteredCourses.map(course => (
                    <SortableCourseListRow key={course.id} course={course} isSelected={selectedCourseIds.has(course.id)}
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

      <CategoryDialog open={showCategoryDialog} onOpenChange={setShowCategoryDialog} editingCategory={editingCategory} name={newCategoryName} setName={setNewCategoryName} color={newCategoryColor} setColor={setNewCategoryColor} isCreating={isCreatingCategory} onSubmit={handleCreateCategory} />
      <CreateCourseDialog open={showCreateCourseDialog} onOpenChange={setShowCreateCourseDialog} title={newCourseTitle} setTitle={setNewCourseTitle} description={newCourseDescription} setDescription={setNewCourseDescription} categoryId={newCourseCategoryId} setCategoryId={setNewCourseCategoryId} categories={categories} showInlineNewCategory={showInlineNewCategory} setShowInlineNewCategory={setShowInlineNewCategory} inlineNewCategoryName={inlineNewCategoryName} setInlineNewCategoryName={setInlineNewCategoryName} inlineNewCategoryColor={inlineNewCategoryColor} setInlineNewCategoryColor={setInlineNewCategoryColor} isCreating={isCreatingCourse} onSubmit={handleCreateCourse} />
      <MoveCourseDialog open={showMoveCourseDialog} onOpenChange={setShowMoveCourseDialog} movingCourse={movingCourse} targetCategoryId={targetCategoryId} setTargetCategoryId={setTargetCategoryId} categories={categories} isMoving={isMovingCourse} onSubmit={handleMoveCourse} />
      <BulkDeleteDialog open={showBulkDeleteConfirm} onOpenChange={setShowBulkDeleteConfirm} count={selectedCourseIds.size} isDeleting={isDeletingCourses} onConfirm={handleBulkDelete} />
      <TransferCourseDialog
        open={!!transferCourse}
        onOpenChange={(o) => { if (!o) setTransferCourse(null); }}
        courseId={transferCourse?.id || null}
        courseTitle={transferCourse?.title || null}
        currentOrganizationId={organizationId}
        onTransferred={refresh}
      />
      </>}
    </div>
  );
});
