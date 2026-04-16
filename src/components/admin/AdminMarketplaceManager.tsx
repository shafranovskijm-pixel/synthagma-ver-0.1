import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  Store, Plus, Search, Eye,
  Package, ShoppingCart, Building2, Users, Tag, Sparkles, BookOpen, Upload,
  List, LayoutGrid, ChevronDown, FolderPlus, FolderInput, CheckCircle2, AlertTriangle,
  FolderOpen, Library, X, GraduationCap, Award, ShieldCheck,
  Factory, Flame, Droplets, HardHat, Leaf, Zap, Lightbulb, MoveRight, Settings, History,
  DollarSign, Briefcase, TrendingUp, Edit, Trash2 } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy, arrayMove } from "@dnd-kit/sortable";
import type { DbCategory } from "@/hooks/useAdminMarketplace";
import { BulkCourseImporter } from "./BulkCourseImporter";
import { BulkContentGenerator } from "./BulkContentGenerator";
import { ContentGeneratorTab } from "./ContentGeneratorTab";
import { GenerationHistoryTab } from "./GenerationHistoryTab";
import { ProgramListImporter } from "./ProgramListImporter";
import { KnowledgeBankTab } from "./KnowledgeBankTab";
import { MarketplaceSettingsTab, type ValidationRules, type AiPrompts } from "./MarketplaceSettingsTab";
import { ProgramsTab } from "./ProgramsTab";
import { MarketplaceOrdersList } from "./MarketplaceOrdersList";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useAdminMarketplace } from "@/hooks/useAdminMarketplace";

// Extracted components
import { renderGroupedCourses, SortableCategoryItem } from "./marketplace/MarketplaceCourseTable";
import { useMarketplaceValidation } from "./marketplace/useMarketplaceValidation";
import { MarketplaceCourseForm } from "./marketplace/MarketplaceCourseForm";
import { MarketplaceHeroCards } from "./marketplace/MarketplaceHeroCards";
import { SigmaSpinner } from "@/components/ui/SigmaSpinner";
import {
  MarketplaceEditDialog,
  MarketplaceOrderDialog,
  MarketplaceCategoryDialog,
  MarketplaceMoveCategoryDialog,
  MarketplaceBulkMoveDialog } from "./marketplace/MarketplaceDialogs";

import { programTypeMetaAdmin, subCategoryMetaAdmin, ICON_OPTIONS, iconMap } from "./marketplace/marketplaceConstants";

export function AdminMarketplaceManager() {
  const navigate = useNavigate();
  const h = useAdminMarketplace();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }), useSensor(KeyboardSensor));
  const [bulkGenCourse, setBulkGenCourse] = useState<{ id: string; title: string; description?: string } | null>(null);
  const [converting, setConverting] = useState(false);
  const [selectedUncategorized, setSelectedUncategorized] = useState<Set<string>>(new Set());
  const [bulkMoveTarget, setBulkMoveTarget] = useState<string>("");
  const [valRules, setValRules] = useState<ValidationRules>({ minLessons: 3, minContentLength: 50, requireTest: true, requireText: true, checkDuplicateTitles: true });
  const [aiPrompts, setAiPrompts] = useState<AiPrompts>({});
  const [selectedCourses, setSelectedCourses] = useState<Set<string>>(new Set());
  const [showBulkMoveDialog, setShowBulkMoveDialog] = useState(false);
  const [bulkMoveTargetCategory, setBulkMoveTargetCategory] = useState("");

  const toggleCourseSelect = useCallback((courseId: string) => {
    setSelectedCourses(prev => {
      const next = new Set(prev);
      if (next.has(courseId)) next.delete(courseId); else next.add(courseId);
      return next;
    });
  }, []);

  const handleBulkMove = async () => {
    if (selectedCourses.size === 0 || !bulkMoveTargetCategory) return;
    await h.handleBulkMoveToCategory(Array.from(selectedCourses), bulkMoveTargetCategory);
    setSelectedCourses(new Set());
    setShowBulkMoveDialog(false);
    setBulkMoveTargetCategory("");
  };

  const [aiProvider, setAiProvider] = useState("gigachat");
  const [gigachatModel, setGigachatModel] = useState<string | undefined>();

  useEffect(() => {
    (async () => {
      try {
        const { data } = await supabase.from("ai_settings").select("provider, gigachat_model").eq("context", "pipeline").single();
        if (data) {
          setAiProvider(data.provider || "gigachat");
          setGigachatModel(data.gigachat_model || undefined);
        }
      } catch {}
    })();
  }, []);

  const handleSettingsLoaded = useCallback((rules: ValidationRules, prompts: AiPrompts) => {
    setValRules(rules);
    setAiPrompts(prompts);
  }, []);

  const validation = useMarketplaceValidation({
    courses: h.courses,
    dbCategories: h.dbCategories,
    fetchData: h.fetchData,
    aiProvider,
    gigachatModel,
    aiPrompts,
    valRules });

  const handleBulkGenerate = (item: any) => {
    setBulkGenCourse({ id: item.course_id, title: item.course?.title || "", description: item.course?.description || "" });
  };

  if (h.isLoading && h.courses.length === 0) {
    return (
      <div className="flex items-center justify-center py-12">
        <SigmaSpinner size="lg" />
      </div>
    );
  }

  const adminNavItems = [
    { value: "catalog", icon: Package, label: "Каталог" },
    { value: "programs", icon: BookOpen, label: "Программы" },
    { value: "create", icon: Plus, label: "Создать курс" },
    { value: "generator", icon: Sparkles, label: "Генератор" },
    { value: "import", icon: Upload, label: "Импорт" },
    { value: "knowledge", icon: Library, label: "Банк знаний" },
    { value: "orders", icon: ShoppingCart, label: "Заявки" },
    { value: "history", icon: History, label: "История" },
    { value: "settings", icon: Settings, label: "Настройки" },
  ];

  return (
    <div className="space-y-6">
      <Tabs value={h.activeTab} onValueChange={(v) => h.setActiveTab(v as any)} className="space-y-0">
        <div className="flex gap-6">
          {/* Vertical sidebar nav */}
          <div className="w-[200px] shrink-0">
            <TabsList className="flex flex-col gap-1 sticky top-4 h-auto bg-transparent p-0 w-full">
              {adminNavItems.map((item) => {
                const Icon = item.icon;
                const isActive = h.activeTab === item.value;
                return (
                  <TabsTrigger
                    key={item.value}
                    value={item.value}
                    className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium justify-start w-full transition-colors
                      ${isActive ? "bg-primary/10 text-primary shadow-sm" : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"}
                    `}
                  >
                    <Icon className="w-4 h-4 shrink-0" />
                    {item.label}
                  </TabsTrigger>
                );
              })}
            </TabsList>
          </div>

          {/* Main content */}
          <div className="flex-1 min-w-0 space-y-6">

        <TabsContent value="history" className="space-y-4"><GenerationHistoryTab /></TabsContent>
        <TabsContent value="settings" className="space-y-4"><MarketplaceSettingsTab onSettingsLoaded={handleSettingsLoaded} /></TabsContent>
        <TabsContent value="generator" className="space-y-4">
          <ContentGeneratorTab courses={h.courses} dbCategories={h.dbCategories} onComplete={() => h.fetchData()} />
        </TabsContent>

        {/* Catalog */}
        <TabsContent value="catalog" className="space-y-4">
          {/* Hero Cards */}
          <MarketplaceHeroCards onCardClick={(courseTitle) => h.setSearchQuery(courseTitle)} />

          {/* Tools */}
          <Card className="shadow-sm">
            <CardContent className="p-4">
              <Collapsible>
                <CollapsibleTrigger className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">
                  <ChevronDown className="w-3 h-3 transition-transform group-data-[state=closed]:-rotate-90" />
                  Инструменты
                </CollapsibleTrigger>
                <CollapsibleContent className="pt-2">
                  <Button variant="outline" size="sm" className="rounded-xl" disabled={converting}
                    onClick={async () => {
                      setConverting(true);
                      const toastId = toast.loading("Конвертирую Markdown → JSON блоки...", { duration: Infinity });
                      try {
                        let totalConverted = 0;
                        let totalFailed = 0;
                        const { safeInvoke } = await import("@/utils/safeInvoke");
                        for (let batch = 0; batch < 20; batch++) {
                          const { data, error } = await safeInvoke<any>("convert-lesson-content", { body: { batch_size: 500 } });
                          if (error) throw error;
                          totalConverted += data?.converted || 0;
                          totalFailed += data?.failed || 0;
                          if ((data?.converted || 0) === 0) break;
                          toast.loading(`Конвертировано: ${totalConverted}...`, { id: toastId });
                        }
                        toast.dismiss(toastId);
                        toast.success(`Конвертация завершена: ✅ ${totalConverted} уроков${totalFailed > 0 ? `, ❌ ${totalFailed} ошибок` : ""}`, { duration: 10000 });
                      } catch (e: any) {
                        toast.dismiss(toastId);
                        toast.error(`Ошибка конвертации: ${e.message}`);
                      } finally {
                        setConverting(false);
                      }
                    }}
                  >
                    {converting ? <SigmaSpinner size="sm" className="mr-1.5" /> : <BookOpen className="w-4 h-4 mr-1.5" />}
                    Конвертировать MD→JSON
                  </Button>
                </CollapsibleContent>
              </Collapsible>
            </CardContent>
          </Card>

          {/* Validation Report */}
          {validation.validationReport && (
            <Card className={`shadow-sm ${validation.validationReport.length > 0 ? "border-destructive/40 bg-destructive/5" : "border-green-500/40 bg-green-500/5"}`}>
              <CardHeader className="py-3 px-4">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    {validation.validationReport.length > 0 ? (
                      <><AlertTriangle className="w-4 h-4 text-destructive" />Результаты проверки</>
                    ) : (
                      <><CheckCircle2 className="w-4 h-4 text-green-600" />Все курсы готовы</>
                    )}
                  </CardTitle>
                  <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => validation.setValidationReport(null)}>
                    <X className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="px-4 pb-3 pt-0 space-y-2">
                {validation.validationReportOk > 0 && (
                  <p className="text-sm text-muted-foreground">✅ {validation.validationReportOk} курсов готово</p>
                )}
                {validation.validationReport.length > 0 && (
                  <>
                    <p className="text-sm font-medium text-destructive">❌ {validation.validationReport.length} курсов с проблемами:</p>
                    <ul className="space-y-1 max-h-48 overflow-y-auto">
                      {validation.validationReport.map((r) => (
                        <li key={r.courseId} className="text-xs flex gap-2">
                          <span className="font-medium truncate max-w-[200px]">{r.title}</span>
                          <span className="text-muted-foreground">{r.issues.join(" • ")}</span>
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </CardContent>
            </Card>
          )}

          {/* Search & view controls */}
          <div className="flex items-center gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input placeholder="Поиск курсов..." value={h.searchQuery} onChange={(e) => h.setSearchQuery(e.target.value)} className="pl-10 pr-8 rounded-xl" />
              {h.searchQuery && (
                <button className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors" onClick={() => h.setSearchQuery("")}>
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
            <div className="flex items-center gap-1 border rounded-lg p-0.5">
              <Button variant={h.viewMode === "list" ? "default" : "ghost"} size="icon" className="h-8 w-8" onClick={() => h.setViewMode("list")}><List className="w-4 h-4" /></Button>
              <Button variant={h.viewMode === "grid" ? "default" : "ghost"} size="icon" className="h-8 w-8" onClick={() => h.setViewMode("grid")}><LayoutGrid className="w-4 h-4" /></Button>
            </div>
            <Button variant="outline" size="sm" className="rounded-xl" onClick={() => h.setShowCategoryDialog(true)}>
              <FolderPlus className="w-4 h-4 mr-1.5" />Категория
            </Button>
            <Badge variant="secondary">{h.filteredCourses.length} курсов</Badge>
          </div>

          {h.filteredCourses.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="py-12 text-center">
                <Package className="w-12 h-12 text-muted-foreground/50 mx-auto mb-4" />
                <p className="text-muted-foreground">Курсы не найдены</p>
              </CardContent>
            </Card>
          ) : h.viewMode === "list" ? (
            <div className="space-y-4">

              {selectedCourses.size > 0 && (
                <div className="sticky top-0 z-10 flex items-center gap-3 bg-primary/10 border border-primary/20 rounded-lg p-3">
                  <Checkbox checked={true} onCheckedChange={() => setSelectedCourses(new Set())} />
                  <span className="text-sm font-medium">
                    Выбрано: {selectedCourses.size} {selectedCourses.size === 1 ? 'курс' : selectedCourses.size < 5 ? 'курса' : 'курсов'}
                  </span>
                  <Button size="sm" variant="outline" className="ml-auto gap-1.5" onClick={() => { setBulkMoveTargetCategory(""); setShowBulkMoveDialog(true); }}>
                    <FolderInput className="w-3.5 h-3.5" />Переместить
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setSelectedCourses(new Set())}>
                    <X className="w-3.5 h-3.5 mr-1" />Снять выделение
                  </Button>
                </div>
              )}

              <div className="grid gap-6">
                {h.groupedCourses.map((group) => {
                  const meta = programTypeMetaAdmin[group.category];
                  const CatIcon = meta?.icon || BookOpen;
                  const catColor = meta?.color || "text-primary";
                  const catBg = meta?.bgColor || "bg-primary/10";

                  if (group.subGroups && group.subGroups.length > 0) {
                    return (
                      <Collapsible key={group.category} defaultOpen={group.courses.length > 0}>
                        <CollapsibleTrigger className="flex items-center gap-3 w-full p-4 rounded-xl border border-border bg-card hover:bg-secondary/30 transition-colors">
                          <div className={`w-10 h-10 rounded-lg ${catBg} flex items-center justify-center shrink-0`}>
                            <CatIcon className={`w-5 h-5 ${catColor}`} />
                          </div>
                          <div className="flex-1 text-left">
                            <h3 className="font-display text-lg font-medium">{group.category}</h3>
                          </div>
                          <Badge variant="outline" className="text-[10px]">{group.badge}</Badge>
                          {group.courses.length > 0 && (
                            <>
                              <Badge className="bg-green-500/10 text-green-600 border-green-500/20 text-[10px]">
                                ✅ {group.courses.filter((c: any) => validation.validatedCourses[c.course_id] === 'ok').length} / ❌ {group.courses.filter((c: any) => validation.validatedCourses[c.course_id] === 'error').length}
                              </Badge>
                              <Button variant="ghost" size="sm" className="h-6 text-xs px-2" disabled={!!validation.bulkValidatingGroup}
                                onClick={(e) => { e.stopPropagation(); validation.handleBulkValidate(group); }}
                              >
                                {validation.bulkValidatingGroup === group.category
                                  ? <><SigmaSpinner size="xs" className="mr-1" />{validation.bulkValidateProgress}</>
                                  : <><CheckCircle2 className="w-3 h-3 mr-1" />Проверить все</>}
                              </Button>
                            </>
                          )}
                          <Badge variant="secondary">{group.courses.length} курсов</Badge>
                          <ChevronDown className="w-5 h-5 text-muted-foreground transition-transform group-data-[state=closed]:-rotate-90" />
                        </CollapsibleTrigger>
                        <CollapsibleContent className="space-y-3 mt-3 pl-2">
                          <DndContext sensors={sensors} collisionDetection={closestCenter}
                            onDragEnd={(event: DragEndEvent) => {
                              const { active, over } = event;
                              if (!over || active.id === over.id) return;
                              const parentCats = h.dbCategories.filter(c => (c.parent_type || "Повышение квалификации") === group.category);
                              const oldIdx = parentCats.findIndex(c => c.id === active.id);
                              const newIdx = parentCats.findIndex(c => c.id === over.id);
                              if (oldIdx === -1 || newIdx === -1) return;
                              const reorderedParent = arrayMove(parentCats, oldIdx, newIdx).map((c, i) => ({ ...c, order_index: i }));
                              const otherCats = h.dbCategories.filter(c => (c.parent_type || "Повышение квалификации") !== group.category);
                              h.handleReorderCategories([...otherCats, ...reorderedParent]);
                            }}
                          >
                            <SortableContext items={group.subGroups.map((s: any) => s.categoryId || s.category)} strategy={verticalListSortingStrategy}>
                              {group.subGroups.map((sub: any) => {
                                const dbIcon = sub.icon ? iconMap[sub.icon] : null;
                                const subMeta = subCategoryMetaAdmin[sub.category];
                                const SubIcon = dbIcon || subMeta?.icon || BookOpen;
                                const subColor = subMeta?.color || "text-primary";
                                const subBg = subMeta?.bgColor || "bg-primary/10";
                                return (
                                  <SortableCategoryItem key={sub.categoryId || sub.category} group={{ category: sub.category, categoryId: sub.categoryId }}>
                                    <Collapsible>
                                      <CollapsibleTrigger className="flex items-center gap-3 w-full p-3 rounded-lg border border-border/60 bg-card/80 hover:bg-secondary/20 transition-colors">
                                        <div className={`w-8 h-8 rounded-lg ${subBg} flex items-center justify-center shrink-0`}>
                                          <SubIcon className={`w-4 h-4 ${subColor}`} />
                                        </div>
                                        <span className="flex-1 text-left font-medium text-sm">{sub.category}</span>
                                        {sub.courses.length > 0 && (
                                          <Badge className="bg-green-500/10 text-green-600 border-green-500/20 text-[10px]">
                                            ✅ {sub.courses.filter((c: any) => validation.validatedCourses[c.course_id] === 'ok').length} / ❌ {sub.courses.filter((c: any) => validation.validatedCourses[c.course_id] === 'error').length}
                                          </Badge>
                                        )}
                                        <span className="text-xs text-muted-foreground">
                                          {sub.courses.length} {sub.courses.length === 1 ? 'курс' : sub.courses.length < 5 ? 'курса' : 'курсов'}
                                        </span>
                                        <ChevronDown className="w-4 h-4 text-muted-foreground transition-transform group-data-[state=closed]:-rotate-90" />
                                      </CollapsibleTrigger>
                                      <CollapsibleContent className="pt-2 pl-11">
                                        {sub.courses.length === 0 ? (
                                          <p className="text-xs text-muted-foreground py-2 italic">Курсы ещё не добавлены</p>
                                        ) : (
                                          renderGroupedCourses(sub.courses, h, handleBulkGenerate, validation.validatedCourses, validation.handleValidateCourse, validation.validatingId, selectedCourses, toggleCourseSelect)
                                        )}
                                      </CollapsibleContent>
                                    </Collapsible>
                                  </SortableCategoryItem>
                                );
                              })}
                            </SortableContext>
                          </DndContext>

                          {group.uncategorized.length > 0 && (
                            <Collapsible>
                              <CollapsibleTrigger className="flex items-center gap-3 w-full p-3 rounded-lg border border-dashed border-border/60 bg-muted/30 hover:bg-secondary/20 transition-colors">
                                <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center shrink-0">
                                  <FolderOpen className="w-4 h-4 text-muted-foreground" />
                                </div>
                                <span className="flex-1 text-left font-medium text-sm text-muted-foreground">Без категории</span>
                                <span className="text-xs text-muted-foreground">
                                  {group.uncategorized.length} {group.uncategorized.length === 1 ? 'курс' : group.uncategorized.length < 5 ? 'курса' : 'курсов'}
                                </span>
                                <ChevronDown className="w-4 h-4 text-muted-foreground transition-transform group-data-[state=closed]:-rotate-90" />
                              </CollapsibleTrigger>
                              <CollapsibleContent className="pt-2 pl-11">
                                {selectedUncategorized.size > 0 && (
                                  <div className="flex items-center gap-2 mb-2 p-2 rounded-lg bg-primary/5 border border-primary/20">
                                    <span className="text-xs text-muted-foreground">Выбрано: {selectedUncategorized.size}</span>
                                    <Select value={bulkMoveTarget} onValueChange={setBulkMoveTarget}>
                                      <SelectTrigger className="h-7 text-xs w-[200px]"><SelectValue placeholder="Категория..." /></SelectTrigger>
                                      <SelectContent>
                                        {h.groupedCourses.map((g: any) => {
                                          if (!g.subGroups || g.subGroups.length === 0) return null;
                                          return (
                                            <SelectGroup key={g.category}>
                                              <SelectLabel className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">{g.category}</SelectLabel>
                                              {g.subGroups.map((sg: any) => (
                                                <SelectItem key={sg.categoryId} value={sg.categoryId || sg.category}>{sg.category}</SelectItem>
                                              ))}
                                            </SelectGroup>
                                          );
                                        })}
                                      </SelectContent>
                                    </Select>
                                    <Button variant="default" size="sm" className="h-7 text-xs" disabled={!bulkMoveTarget}
                                      onClick={async () => {
                                        const ids = Array.from(selectedUncategorized);
                                        const courseIds = group.uncategorized.filter((c: any) => ids.includes(c.id)).map((c: any) => c.course_id);
                                        for (const cid of courseIds) {
                                          await supabase.from("courses").update({ category_id: bulkMoveTarget }).eq("id", cid);
                                        }
                                        toast.success(`Перемещено ${courseIds.length} курсов`);
                                        setSelectedUncategorized(new Set());
                                        setBulkMoveTarget("");
                                        h.fetchData();
                                      }}
                                    >
                                      <MoveRight className="w-3 h-3 mr-1" />Переместить
                                    </Button>
                                    <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setSelectedUncategorized(new Set())}>
                                      <X className="w-3 h-3" />
                                    </Button>
                                  </div>
                                )}
                                <Table>
                                  <TableBody>
                                    {group.uncategorized.map((item: any) => (
                                      <TableRow key={item.id} className={!item.is_active ? "opacity-60" : ""}>
                                        <TableCell className="w-[30px] pr-0">
                                          <Checkbox
                                            checked={selectedUncategorized.has(item.id)}
                                            onCheckedChange={(checked) => {
                                              setSelectedUncategorized(prev => {
                                                const next = new Set(prev);
                                                if (checked) next.add(item.id); else next.delete(item.id);
                                                return next;
                                              });
                                            }}
                                          />
                                        </TableCell>
                                        <TableCell>
                                          <span className="text-sm">{item.course?.title || ""}</span>
                                        </TableCell>
                                        <TableCell className="w-[100px] text-sm">{item.price_student?.toLocaleString()} ₽</TableCell>
                                        <TableCell className="w-[60px]">
                                          <Switch checked={item.is_active} onCheckedChange={() => h.handleToggleActive(item)} />
                                        </TableCell>
                                        <TableCell className="w-[120px]">
                                          <div className="flex items-center gap-1">
                                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => navigate(`/course-builder/${item.course_id}`)}>
                                              <Eye className="w-3.5 h-3.5" />
                                            </Button>
                                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { h.setMovingCourse(item); h.setTargetCategory(h.extractCategory(item.course?.title)); h.setShowMoveCategoryDialog(true); }}>
                                              <FolderInput className="w-3.5 h-3.5" />
                                            </Button>
                                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { h.setEditingCourse(item); h.setShowEditDialog(true); }}>
                                              <Edit className="w-3.5 h-3.5" />
                                            </Button>
                                            <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => h.handleDeleteCourse(item.id)}>
                                              <Trash2 className="w-3.5 h-3.5" />
                                            </Button>
                                          </div>
                                        </TableCell>
                                      </TableRow>
                                    ))}
                                  </TableBody>
                                </Table>
                              </CollapsibleContent>
                            </Collapsible>
                          )}
                        </CollapsibleContent>
                      </Collapsible>
                    );
                  }
                  return null;
                })}
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
              {h.filteredCourses.map((item: any) => {
                const catName = h.dbCategories.find((c: any) => c.id === item.course?.category_id)?.name;
                return (
                  <div key={item.id} className="group bg-card rounded-2xl border border-border overflow-hidden hover:shadow-lg transition-all flex flex-col">
                    {/* Cover */}
                    <div className="relative h-36 bg-muted overflow-hidden">
                      {item.course?.cover_image_url ? (
                        <img src={item.course.cover_image_url} alt={item.course?.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" loading="lazy" />
                      ) : (
                        <div className="w-full h-full bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center">
                          <BookOpen className="w-10 h-10 text-primary/40" />
                        </div>
                      )}
                      {catName && (
                        <Badge className="absolute top-2 left-2 text-[10px]">{catName}</Badge>
                      )}
                      <Badge variant={item.is_active ? "default" : "secondary"} className="absolute top-2 right-2 text-[10px]">
                        {item.is_active ? "Активен" : "Скрыт"}
                      </Badge>
                    </div>
                    {/* Content */}
                    <div className="p-3 flex flex-col flex-1">
                      <h3 className="font-semibold text-sm line-clamp-2 mb-1">{item.course?.title || ""}</h3>
                      {item.description_short && <p className="text-xs text-muted-foreground line-clamp-2 mb-2">{item.description_short}</p>}
                      <div className="mt-auto space-y-2">
                        <div className="flex items-center justify-between text-xs text-muted-foreground">
                          <span className="flex items-center gap-1"><Building2 className="w-3 h-3" />{item.organization?.name || "Платформа"}</span>
                          <span className="font-medium text-primary">
                            {item.price_student > 0 ? `${item.price_student.toLocaleString()} ₽` : "Бесплатно"}
                          </span>
                        </div>
                        <div className="flex items-center gap-1 pt-1 border-t border-border/50">
                          <Switch checked={item.is_active} onCheckedChange={() => h.handleToggleActive(item)} />
                          <span className="text-[10px] text-muted-foreground mr-auto">{item.is_active ? "Виден" : "Скрыт"}</span>
                          <Button variant="ghost" size="icon" className="h-7 w-7" title="AI контент" onClick={() => handleBulkGenerate(item)}>
                            <Sparkles className="w-3.5 h-3.5" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7" title="Уроки" onClick={() => navigate(`/course-builder/${item.course_id}`)}>
                            <BookOpen className="w-3.5 h-3.5" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7" title="Редактировать" onClick={() => { h.setEditingCourse(item); h.setShowEditDialog(true); }}>
                            <Edit className="w-3.5 h-3.5" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => h.handleDeleteCourse(item.id)}>
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* Create Course */}
        <TabsContent value="create" className="space-y-6">
          <MarketplaceCourseForm h={h} />
        </TabsContent>

        {/* Import */}
        <TabsContent value="import" className="space-y-6">
          <ProgramListImporter onComplete={() => { h.fetchData(); h.setActiveTab("catalog"); }} />
          <BulkCourseImporter onComplete={() => { h.fetchData(); h.setActiveTab("catalog"); }} />
        </TabsContent>

        <TabsContent value="programs" className="space-y-6"><ProgramsTab /></TabsContent>
        <TabsContent value="knowledge" className="space-y-6"><KnowledgeBankTab /></TabsContent>
        <TabsContent value="orders" className="space-y-6">
          <MarketplaceOrdersList orders={h.orders as any} onViewOrder={(order) => { h.setSelectedOrder(order as any); h.setShowOrderDialog(true); }} />
        </TabsContent>
          </div>{/* end main content */}
        </div>{/* end flex */}
      </Tabs>

      {/* Dialogs */}
      <MarketplaceEditDialog
        open={h.showEditDialog}
        onOpenChange={h.setShowEditDialog}
        editingCourse={h.editingCourse}
        setEditingCourse={h.setEditingCourse}
        onSave={h.handleEditCourse}
      />
      <MarketplaceOrderDialog
        open={h.showOrderDialog}
        onOpenChange={h.setShowOrderDialog}
        order={h.selectedOrder}
        onUpdateStatus={h.handleUpdateOrderStatus}
      />
      <MarketplaceCategoryDialog
        open={h.showCategoryDialog}
        onOpenChange={h.setShowCategoryDialog}
        h={h}
        iconOptions={ICON_OPTIONS}
      />
      <MarketplaceMoveCategoryDialog
        open={h.showMoveCategoryDialog}
        onOpenChange={h.setShowMoveCategoryDialog}
        courseName={h.movingCourse?.course?.title}
        targetCategory={h.targetCategory}
        setTargetCategory={h.setTargetCategory}
        dbCategories={h.dbCategories}
        onMove={() => h.movingCourse && h.handleMoveToCategory(h.movingCourse, h.targetCategory)}
      />
      <MarketplaceBulkMoveDialog
        open={showBulkMoveDialog}
        onOpenChange={setShowBulkMoveDialog}
        count={selectedCourses.size}
        targetCategory={bulkMoveTargetCategory}
        setTargetCategory={setBulkMoveTargetCategory}
        dbCategories={h.dbCategories}
        onMove={handleBulkMove}
      />

      {bulkGenCourse && (
        <BulkContentGenerator
          open={!!bulkGenCourse}
          onOpenChange={(v) => { if (!v) setBulkGenCourse(null); }}
          courseId={bulkGenCourse.id}
          courseTitle={bulkGenCourse.title}
          courseDescription={bulkGenCourse.description || ""}
        />
      )}
    </div>
  );
}
