import { useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  Search, Eye, Package, BookOpen, Upload, List, LayoutGrid, ChevronDown,
  FolderPlus, FolderInput, FolderOpen, CheckCircle2, AlertTriangle, X, Edit, Trash2, MoveRight
} from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy, arrayMove } from "@dnd-kit/sortable";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { renderGroupedCourses, SortableCategoryItem } from "./MarketplaceCourseTable";
import { programTypeMetaAdmin, subCategoryMetaAdmin, iconMap } from "./marketplaceConstants";
import { MarketplaceHeroCards } from "./MarketplaceHeroCards";
import { AdminMarketplaceGridView } from "./AdminMarketplaceCatalogView";
import { SigmaSpinner } from "@/components/ui/SigmaSpinner";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface AdminMarketplaceCatalogTabProps {
  h: any;
  validation: any;
  selectedCourses: Set<string>;
  setSelectedCourses: (v: Set<string> | ((prev: Set<string>) => Set<string>)) => void;
  toggleCourseSelect: (id: string) => void;
  onBulkGenerate: (item: any) => void;
  converting: boolean;
  setConverting: (v: boolean) => void;
  onShowBulkMoveDialog: () => void;
}

export function AdminMarketplaceCatalogTab({
  h, validation, selectedCourses, setSelectedCourses, toggleCourseSelect,
  onBulkGenerate, converting, setConverting, onShowBulkMoveDialog
}: AdminMarketplaceCatalogTabProps) {
  const navigate = useNavigate();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }), useSensor(KeyboardSensor));
  const [selectedUncategorized, setSelectedUncategorized] = useState<Set<string>>(new Set());
  const [bulkMoveTarget, setBulkMoveTarget] = useState("");

  return (
    <div className="space-y-4">
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
                  {validation.validationReport.map((r: any) => (
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
          <Input placeholder="Поиск курсов..." value={h.searchQuery} onChange={(e: any) => h.setSearchQuery(e.target.value)} className="pl-10 pr-8 rounded-xl" />
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
              <Button size="sm" variant="outline" className="ml-auto gap-1.5" onClick={onShowBulkMoveDialog}>
                <FolderInput className="w-3.5 h-3.5" />Переместить
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setSelectedCourses(new Set())}>
                <X className="w-3.5 h-3.5 mr-1" />Снять выделение
              </Button>
            </div>
          )}

          <div className="grid gap-6">
            {h.groupedCourses.map((group: any) => {
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
                            onClick={(e: any) => { e.stopPropagation(); validation.handleBulkValidate(group); }}
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
                          const parentCats = h.dbCategories.filter((c: any) => (c.parent_type || "Повышение квалификации") === group.category);
                          const oldIdx = parentCats.findIndex((c: any) => c.id === active.id);
                          const newIdx = parentCats.findIndex((c: any) => c.id === over.id);
                          if (oldIdx === -1 || newIdx === -1) return;
                          const reorderedParent = arrayMove(parentCats, oldIdx, newIdx).map((c: any, i: number) => ({ ...c, order_index: i }));
                          const otherCats = h.dbCategories.filter((c: any) => (c.parent_type || "Повышение квалификации") !== group.category);
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
                                      renderGroupedCourses(sub.courses, h, onBulkGenerate, validation.validatedCourses, validation.handleValidateCourse, validation.validatingId, selectedCourses, toggleCourseSelect)
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
        <AdminMarketplaceGridView courses={h.filteredCourses} dbCategories={h.dbCategories} h={h} onBulkGenerate={onBulkGenerate} />
      )}
    </div>
  );
}
