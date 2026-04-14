import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import {
  Store, Plus, Search, Edit, Trash2, Eye, Loader2,
  Package, ShoppingCart, Building2, Users, Tag, Sparkles, BookOpen, Upload,
  List, LayoutGrid, ChevronDown, FolderPlus, FolderInput, CheckCircle2, AlertTriangle,
  FolderOpen, Library, X, GripVertical, GraduationCap, Award, ShieldCheck, Wand2,
  Factory, Flame, Droplets, HardHat, Leaf, Zap, Lightbulb, MoveRight, Settings, History,
  DollarSign, Briefcase, TrendingUp,
} from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy, useSortable, arrayMove } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
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
import { safeInvoke } from "@/utils/safeInvoke";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { format } from "date-fns";
import { ru } from "date-fns/locale";
import { useAdminMarketplace } from "@/hooks/useAdminMarketplace";
import { markdownToBlocks, blocksToJson } from "@/components/course-builder/BlockEditor";

const statusLabels: Record<string, { label: string; color: string }> = {
  pending: { label: "Ожидает", color: "bg-yellow-500/10 text-yellow-600 border-yellow-500/20" },
  approved: { label: "Одобрена", color: "bg-blue-500/10 text-blue-600 border-blue-500/20" },
  paid: { label: "Оплачена", color: "bg-green-500/10 text-green-600 border-green-500/20" },
  completed: { label: "Завершена", color: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20" },
  cancelled: { label: "Отменена", color: "bg-red-500/10 text-red-600 border-red-500/20" },
};

const programTypeMetaAdmin: Record<string, { icon: React.ElementType; color: string; bgColor: string }> = {
  "Повышение квалификации": { icon: GraduationCap, color: "text-blue-600", bgColor: "bg-blue-500/10" },
  "Профессиональная переподготовка": { icon: Award, color: "text-violet-600", bgColor: "bg-violet-500/10" },
  "Охрана труда / Пожарная безопасность": { icon: ShieldCheck, color: "text-amber-600", bgColor: "bg-amber-500/10" },
  "Рабочие профессии": { icon: Store, color: "text-emerald-600", bgColor: "bg-emerald-500/10" },
};

const subCategoryMetaAdmin: Record<string, { icon: React.ElementType; color: string; bgColor: string }> = {
  "Промышленная безопасность": { icon: Factory, color: "text-orange-500", bgColor: "bg-orange-500/10" },
  "Электробезопасность": { icon: Zap, color: "text-yellow-500", bgColor: "bg-yellow-500/10" },
  "Энергетика": { icon: Flame, color: "text-red-500", bgColor: "bg-red-500/10" },
  "Экологическая безопасность": { icon: Leaf, color: "text-green-500", bgColor: "bg-green-500/10" },
  "Гидротехнические сооружения": { icon: Droplets, color: "text-blue-500", bgColor: "bg-blue-500/10" },
  "Строительный контроль": { icon: HardHat, color: "text-accent", bgColor: "bg-accent/10" },
};

const ICON_OPTIONS: { name: string; icon: React.ElementType; label: string }[] = [
  { name: "Factory", icon: Factory, label: "Промышленность" },
  { name: "Zap", icon: Zap, label: "Электричество" },
  { name: "Flame", icon: Flame, label: "Огонь" },
  { name: "Leaf", icon: Leaf, label: "Экология" },
  { name: "Droplets", icon: Droplets, label: "Вода" },
  { name: "HardHat", icon: HardHat, label: "Стройка" },
  { name: "ShieldCheck", icon: ShieldCheck, label: "Защита" },
  { name: "BookOpen", icon: BookOpen, label: "Книга" },
  { name: "Award", icon: Award, label: "Награда" },
  { name: "Lightbulb", icon: Lightbulb, label: "Идея" },
  { name: "Building2", icon: Building2, label: "Здание" },
  { name: "GraduationCap", icon: GraduationCap, label: "Учёба" },
  { name: "DollarSign", icon: DollarSign, label: "Финансы" },
  { name: "Briefcase", icon: Briefcase, label: "Бизнес" },
  { name: "TrendingUp", icon: TrendingUp, label: "Рост" },
];

const iconMap: Record<string, React.ElementType> = {
  Factory, Zap, Flame, Leaf, Droplets, HardHat, ShieldCheck, BookOpen, Award, Lightbulb, Building2, GraduationCap,
  DollarSign, Briefcase, TrendingUp,
};

type CourseGroup = { baseTitle: string; items: any[]; suffix: (item: any) => string };

function groupSimilarCourses(courses: any[]): (any | CourseGroup)[] {
  const map = new Map<string, any[]>();
  const order: string[] = [];
  for (const c of courses) {
    const title: string = c.course?.title || "";
    const dashIdx = title.indexOf(" — ");
    const base = dashIdx > 0 ? title.substring(0, dashIdx) : title;
    if (!map.has(base)) {
      map.set(base, []);
      order.push(base);
    }
    map.get(base)!.push(c);
  }
  const result: (any | CourseGroup)[] = [];
  for (const base of order) {
    const items = map.get(base)!;
    if (items.length >= 2) {
      result.push({
        baseTitle: base,
        items,
        suffix: (item: any) => {
          const title: string = item.course?.title || "";
          const dashIdx = title.indexOf(" — ");
          return dashIdx > 0 ? title.substring(dashIdx) : "";
        },
      });
    } else {
      result.push(items[0]);
    }
  }
  return result;
}

function isGroup(entry: any): entry is CourseGroup {
  return entry && Array.isArray(entry.items);
}

function renderCourseRow(
  item: any, h: any, navigate: any, onBulkGenerate: (item: any) => void,
  validatedCourses: Record<string, 'ok' | 'error'>, onValidate: (courseId: string) => void, validatingId: string | null,
  selectedCourses?: Set<string>, onToggleSelect?: (id: string) => void
) {
  const status = validatedCourses[item.course_id];
  return (
    <TableRow key={item.id} className={!item.is_active ? "opacity-60" : ""}>
      {selectedCourses && onToggleSelect && (
        <TableCell className="w-[40px] pr-0">
          <Checkbox
            checked={selectedCourses.has(item.course_id)}
            onCheckedChange={() => onToggleSelect(item.course_id)}
          />
        </TableCell>
      )}
      <TableCell>
        <button
          className="text-sm text-left hover:underline cursor-pointer inline-flex items-center gap-1.5"
          onClick={() => onValidate(item.course_id)}
          disabled={validatingId === item.course_id}
        >
          {validatingId === item.course_id && <Loader2 className="w-3 h-3 animate-spin" />}
          {status === 'ok' && <CheckCircle2 className="w-3.5 h-3.5 text-green-500 shrink-0" />}
          {status === 'error' && <AlertTriangle className="w-3.5 h-3.5 text-red-500 shrink-0" />}
          {item.course?.title || ""}
        </button>
      </TableCell>
      <TableCell className="w-[100px] text-sm">{item.price_student.toLocaleString()} ₽</TableCell>
      <TableCell className="w-[100px] text-sm">{item.price_organization.toLocaleString()} ₽</TableCell>
      <TableCell className="w-[60px]">
        <Switch checked={item.is_active} onCheckedChange={() => h.handleToggleActive(item)} />
      </TableCell>
      <TableCell className="w-[160px]">
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="h-8 w-8" title="Войти" onClick={() => navigate(`/course-builder/${item.course_id}`)}>
            <Eye className="w-3.5 h-3.5" />
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8" title="Переместить в категорию" onClick={() => { h.setMovingCourse(item); h.setTargetCategory(h.extractCategory(item.course?.title)); h.setShowMoveCategoryDialog(true); }}>
            <FolderInput className="w-3.5 h-3.5" />
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8" title="Просмотр" onClick={() => onBulkGenerate(item)}>
            <FolderOpen className="w-3.5 h-3.5" />
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8" title="Редактировать" onClick={() => { h.setEditingCourse(item); h.setShowEditDialog(true); }}>
            <Edit className="w-3.5 h-3.5" />
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => h.handleDeleteCourse(item.id)}>
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
}

function renderVariantRow(
  item: any, suffix: string, h: any, navigate: any, onBulkGenerate: (item: any) => void,
  validatedCourses: Record<string, 'ok' | 'error'>, onValidate: (courseId: string) => void, validatingId: string | null,
  selectedCourses?: Set<string>, onToggleSelect?: (id: string) => void
) {
  const status = validatedCourses[item.course_id];
  return (
    <TableRow key={item.id} className={!item.is_active ? "opacity-60" : ""}>
      {selectedCourses && onToggleSelect && (
        <TableCell className="w-[40px] pr-0">
          <Checkbox
            checked={selectedCourses.has(item.course_id)}
            onCheckedChange={() => onToggleSelect(item.course_id)}
          />
        </TableCell>
      )}
      <TableCell>
        <button
          className="text-sm text-left hover:underline cursor-pointer inline-flex items-center gap-1.5 pl-2"
          onClick={() => onValidate(item.course_id)}
          disabled={validatingId === item.course_id}
        >
          {validatingId === item.course_id && <Loader2 className="w-3 h-3 animate-spin" />}
          {status === 'ok' && <CheckCircle2 className="w-3.5 h-3.5 text-green-500 shrink-0" />}
          {status === 'error' && <AlertTriangle className="w-3.5 h-3.5 text-red-500 shrink-0" />}
          {suffix || item.course?.title || ""}
        </button>
      </TableCell>
      <TableCell className="w-[100px] text-sm">{item.price_student.toLocaleString()} ₽</TableCell>
      <TableCell className="w-[100px] text-sm">{item.price_organization.toLocaleString()} ₽</TableCell>
      <TableCell className="w-[60px]">
        <Switch checked={item.is_active} onCheckedChange={() => h.handleToggleActive(item)} />
      </TableCell>
      <TableCell className="w-[160px]">
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="h-8 w-8" title="Войти" onClick={() => navigate(`/course-builder/${item.course_id}`)}>
            <Eye className="w-3.5 h-3.5" />
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8" title="Переместить в категорию" onClick={() => { h.setMovingCourse(item); h.setTargetCategory(h.extractCategory(item.course?.title)); h.setShowMoveCategoryDialog(true); }}>
            <FolderInput className="w-3.5 h-3.5" />
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8" title="Просмотр" onClick={() => onBulkGenerate(item)}>
            <FolderOpen className="w-3.5 h-3.5" />
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8" title="Редактировать" onClick={() => { h.setEditingCourse(item); h.setShowEditDialog(true); }}>
            <Edit className="w-3.5 h-3.5" />
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => h.handleDeleteCourse(item.id)}>
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
}

function renderGroupedCourses(
  courses: any[], h: any, navigate: any, onBulkGenerate: (item: any) => void,
  validatedCourses: Record<string, 'ok' | 'error'>, onValidate: (courseId: string) => void, validatingId: string | null,
  selectedCourses?: Set<string>, onToggleSelect?: (id: string) => void
) {
  const grouped = groupSimilarCourses(courses);
  return (
    <Table>
      <TableBody>
        {grouped.map((entry, idx) => {
          if (isGroup(entry)) {
            const g = entry as CourseGroup;
            return (
              <TableRow key={`group-${idx}`} className="hover:bg-transparent">
                <TableCell colSpan={selectedCourses ? 6 : 5} className="p-0">
                  <Collapsible>
                    <CollapsibleTrigger className="flex items-center gap-2 w-full px-4 py-2.5 hover:bg-secondary/30 transition-colors text-sm font-medium text-left">
                      <ChevronDown className="w-4 h-4 text-muted-foreground transition-transform [&[data-state=closed]]:-rotate-90 shrink-0" />
                      <span className="flex-1">{g.baseTitle}</span>
                      <Badge variant="secondary" className="text-[10px] shrink-0">
                        {g.items.length} {g.items.length < 5 ? 'варианта' : 'вариантов'}
                      </Badge>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <Table>
                        <TableBody>
                          {g.items.map(item => renderVariantRow(item, g.suffix(item), h, navigate, onBulkGenerate, validatedCourses, onValidate, validatingId, selectedCourses, onToggleSelect))}
                        </TableBody>
                      </Table>
                    </CollapsibleContent>
                  </Collapsible>
                </TableCell>
              </TableRow>
            );
          }
          return renderCourseRow(entry, h, navigate, onBulkGenerate, validatedCourses, onValidate, validatingId, selectedCourses, onToggleSelect);
        })}
      </TableBody>
    </Table>
  );
}

function SortableCategoryItem({ group, children }: { group: { category: string; categoryId?: string }; children: React.ReactNode }) {
  const id = group.categoryId || group.category;
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };
  return (
    <div ref={setNodeRef} style={style}>
      <div className="flex items-center">
        <button {...attributes} {...listeners} className="p-1 cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground shrink-0">
          <GripVertical className="w-4 h-4" />
        </button>
        <div className="flex-1 min-w-0">{children}</div>
      </div>
    </div>
  );
}

export function AdminMarketplaceManager() {
  const navigate = useNavigate();
  const h = useAdminMarketplace();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }), useSensor(KeyboardSensor));
  const [isGeneratingDesc, setIsGeneratingDesc] = useState(false);
  const [isGeneratingShortDesc, setIsGeneratingShortDesc] = useState(false);
  const [bulkGenCourse, setBulkGenCourse] = useState<{ id: string; title: string; description?: string } | null>(null);
  const [validatedCourses, setValidatedCourses] = useState<Record<string, 'ok' | 'error'>>({});
  const [validatingId, setValidatingId] = useState<string | null>(null);
  const [bulkValidatingGroup, setBulkValidatingGroup] = useState<string | null>(null);
  const [bulkValidateProgress, setBulkValidateProgress] = useState("");
  const [bulkFixing, setBulkFixing] = useState(false);
  const [converting, setConverting] = useState(false);
  const [autoCategorizing, setAutoCategorizing] = useState(false);
  const [selectedUncategorized, setSelectedUncategorized] = useState<Set<string>>(new Set());
  const [bulkMoveTarget, setBulkMoveTarget] = useState<string>("");
  const [validationReport, setValidationReport] = useState<{ courseId: string; title: string; issues: string[] }[] | null>(null);
  const [validationReportOk, setValidationReportOk] = useState(0);
  const [valRules, setValRules] = useState<ValidationRules>({ minLessons: 3, minContentLength: 50, requireTest: true, requireText: true, checkDuplicateTitles: true });
  const [aiPrompts, setAiPrompts] = useState<AiPrompts>({});
  const [selectedCourses, setSelectedCourses] = useState<Set<string>>(new Set());
  const [showBulkMoveDialog, setShowBulkMoveDialog] = useState(false);
  const [bulkMoveTargetCategory, setBulkMoveTargetCategory] = useState("");
  const autoFixCycleCount = useRef<Map<string, number>>(new Map());
  const autoFixCriticalError = useRef<Set<string>>(new Set());

  const toggleCourseSelect = useCallback((courseId: string) => {
    setSelectedCourses(prev => {
      const next = new Set(prev);
      if (next.has(courseId)) next.delete(courseId);
      else next.add(courseId);
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

  // AI settings for 3-slot routing
  const [aiProvider, setAiProvider] = useState("gigachat");
  const [gigachatModel, setGigachatModel] = useState<string | undefined>();

  useEffect(() => {
    (async () => {
      try {
        const { data } = await supabase
          .from("ai_settings")
          .select("provider, gigachat_model")
          .eq("context", "pipeline")
          .single();
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

  // Initialize validated state from DB on courses load (preserve existing error statuses)
  useEffect(() => {
    setValidatedCourses(prev => {
      const init = { ...prev };
      h.courses.forEach((c: any) => {
        if (c.is_validated && !init[c.course_id]) init[c.course_id] = 'ok';
      });
      return init;
    });
  }, [h.courses]);

  const handleValidateCourse = async (courseId: string, isAutoRetry = false) => {
    if (!isAutoRetry) {
      // Manual trigger — reset cycle counter and critical error flag
      autoFixCycleCount.current.delete(courseId);
      autoFixCriticalError.current.delete(courseId);
    }
    setValidatingId(courseId);
    try {
      const { data: lessons } = await supabase
        .from("lessons").select("id, title, type, content").eq("course_id", courseId);
      const issues: string[] = [];

      if (!lessons?.length) {
        issues.push("Нет уроков");
      } else {
        // Check minimum structure: must have text/practice lessons AND tests
        const textLessons = lessons.filter(l => l.type === "text" || l.type === "practice");
        const testLessons = lessons.filter(l => l.type === "test");

        if (valRules.requireText && textLessons.length === 0) {
          issues.push("Нет учебных уроков (текст/практика)");
        }
        if (valRules.requireTest && testLessons.length === 0) {
          issues.push("Нет тестов");
        }
        if (lessons.length < valRules.minLessons) {
          issues.push(`Слишком мало уроков (${lessons.length}, нужно минимум ${valRules.minLessons})`);
        }

        // Check empty content in text/practice lessons
        const emptyLessons = textLessons.filter(l =>
          !l.content || l.content === "[]" || l.content === "" || l.content.length < valRules.minContentLength
        );
        if (emptyLessons.length) issues.push(`${emptyLessons.length} уроков без контента`);

        // Check filled lessons have substantial content
        const filledLessons = textLessons.filter(l =>
          l.content && l.content !== "[]" && l.content !== "" && l.content.length >= valRules.minContentLength
        );
        if (textLessons.length > 0 && filledLessons.length === 0) {
          issues.push("Ни один урок не содержит учебного материала");
        }

        // Check if any text lesson has image blocks
        if (filledLessons.length > 0) {
          let hasAnyImage = false;
          for (const l of filledLessons) {
            try {
              const blocks = JSON.parse(l.content!);
              if (Array.isArray(blocks) && blocks.some((b: any) => b.type === "image" || b.type === "slider")) {
                hasAnyImage = true;
                break;
              }
            } catch { /* skip */ }
          }
          if (!hasAnyImage) issues.push("Нет изображений в уроках");
        }

        // Check duplicates
        if (valRules.checkDuplicateTitles) {
          const titles = lessons.map(l => l.title);
          const dupes = titles.filter((t, i) => titles.indexOf(t) !== i);
          if (dupes.length) issues.push(`Дубликаты: ${[...new Set(dupes)].join(", ")}`);
        }

        // Check tests
        const testIds = testLessons.map(l => l.id);
        if (testIds.length) {
          const { data: questions } = await supabase
            .from("test_questions").select("id, lesson_id, correct_answer").in("lesson_id", testIds);
          const testsWithNoQ = testIds.filter(id => !questions?.some(q => q.lesson_id === id));
          const unansweredQuestions = questions?.filter(q => q.correct_answer === null || q.correct_answer === undefined) || [];
          
          if (testsWithNoQ.length) issues.push(`${testsWithNoQ.length} тестов без вопросов`);
          if (unansweredQuestions.length) issues.push(`${unansweredQuestions.length} вопросов без ответа`);
        }
      }

      const isOk = issues.length === 0;
      setValidatedCourses(prev => ({ ...prev, [courseId]: isOk ? 'ok' : 'error' }));
      
      // Persist to DB
      const mpCourse = h.courses.find((c: any) => c.course_id === courseId);
      if (mpCourse) {
        await supabase.from("marketplace_courses").update({ is_validated: isOk } as any).eq("id", mpCourse.id);
      }
      
      if (issues.length > 0) {
        const mpItem = h.courses.find((c: any) => c.course_id === courseId);
        const title = mpItem?.course?.title || "";
        const cycles = autoFixCycleCount.current.get(courseId) || 0;
        const hadCritical = autoFixCriticalError.current.has(courseId);
        if (hadCritical) {
          toast.warning(`Проблемы: ${issues.join(" • ")}. Автоисправление остановлено — ошибка API (402/429). Запустите вручную.`, { duration: 8000 });
        } else if (cycles >= 2) {
          toast.warning(`Проблемы: ${issues.join(" • ")}. Лимит автоисправлений (${cycles}) достигнут. Запустите вручную.`, { duration: 8000 });
        } else {
          toast.info(`Найдены проблемы: ${issues.join(" • ")}. Запускаю исправление (${cycles + 1}/2)...`, { duration: 6000 });
          autoFixCourse(courseId, title);
        }
      } else {
        toast.success("Курс готов ✅");
      }
      // Refresh to move course between folders
      h.fetchData();
    } catch (e) {
      console.error(e);
      toast.error("Ошибка проверки");
    } finally {
      setValidatingId(null);
    }
  };

  const handleBulkValidate = async (group: any) => {
    if (bulkValidatingGroup) return;
    setBulkValidatingGroup(group.category);
    let okCount = 0;
    let errCount = 0;
    const total = group.courses.length;
    const failedCourses: { courseId: string; title: string; issues: string[] }[] = [];

    const validateOne = async (item: any) => {
      try {
        const { data: lessons } = await supabase
          .from("lessons").select("id, title, type, content").eq("course_id", item.course_id);
        const issues: string[] = [];

        if (!lessons?.length) {
          issues.push("Нет уроков");
        } else {
          const textLessons = lessons.filter(l => l.type === "text" || l.type === "practice");
          const testLessons = lessons.filter(l => l.type === "test");
          if (valRules.requireText && textLessons.length === 0) issues.push("Нет учебных уроков");
          if (valRules.requireTest && testLessons.length === 0) issues.push("Нет тестов");
          if (lessons.length < valRules.minLessons) issues.push("Мало уроков");
          const emptyLessons = textLessons.filter(l => !l.content || l.content === "[]" || l.content === "" || l.content.length < valRules.minContentLength);
          if (emptyLessons.length) issues.push(`${emptyLessons.length} без контента`);
          if (valRules.checkDuplicateTitles) {
            const titles = lessons.map(l => l.title);
            const dupes = titles.filter((t, i) => titles.indexOf(t) !== i);
            if (dupes.length) issues.push("Дубликаты");
          }
          const testIds = testLessons.map(l => l.id);
          if (testIds.length) {
            const { data: questions } = await supabase
              .from("test_questions").select("id, lesson_id, correct_answer").in("lesson_id", testIds);
            const testsWithNoQ = testIds.filter(id => !questions?.some(q => q.lesson_id === id));
            const unanswered = questions?.filter(q => q.correct_answer === null || q.correct_answer === undefined) || [];
            if (testsWithNoQ.length) issues.push(`${testsWithNoQ.length} тестов без вопросов`);
            if (unanswered.length) issues.push(`${unanswered.length} без ответа`);
          }
        }

        const isOk = issues.length === 0;
        setValidatedCourses(prev => ({ ...prev, [item.course_id]: isOk ? 'ok' : 'error' }));
        await supabase.from("marketplace_courses").update({ is_validated: isOk } as any).eq("id", item.id);
        return { ok: isOk, courseId: item.course_id, title: item.course?.title || "", issues };
      } catch (e) {
        console.error("Bulk validate error for", item.course_id, e);
        setValidatedCourses(prev => ({ ...prev, [item.course_id]: 'error' }));
        return { ok: false, courseId: item.course_id, title: item.course?.title || "", issues: ["Ошибка проверки"] };
      }
    };

    // Process in parallel chunks of 5
    const CHUNK_SIZE = 5;
    for (let i = 0; i < total; i += CHUNK_SIZE) {
      const chunk = group.courses.slice(i, i + CHUNK_SIZE);
      setBulkValidateProgress(`${Math.min(i + CHUNK_SIZE, total)}/${total}...`);
      const results = await Promise.all(chunk.map(validateOne));
      for (const r of results) {
        if (r.ok) {
          okCount++;
        } else {
          errCount++;
          failedCourses.push({ courseId: r.courseId, title: r.title, issues: r.issues });
        }
      }
    }

    setBulkValidatingGroup(null);
    setBulkValidateProgress("");
    setValidationReportOk(okCount);
    setValidationReport(errCount > 0 ? failedCourses : null);

    if (errCount > 0) {
      toast.info(`Проверено ${total}: ✅ ${okCount}, ❌ ${errCount}. Запускаю авто-исправление...`);
      handleBulkAutoFix(failedCourses.map(r => ({ courseId: r.courseId, title: r.title })));
    } else {
      toast.success(`Проверено ${total}: ✅ ${okCount} готово`);
    }
  };

  const handleBulkAutoFix = async (courses: { courseId: string; title: string }[]) => {
    if (bulkFixing) return;
    setBulkFixing(true);
    const total = courses.length;
    let fixed = 0;
    let failed = 0;

    for (let i = 0; i < total; i++) {
      const { courseId, title } = courses[i];
      toast.loading(`Исправляю ${i + 1}/${total}: ${title.slice(0, 40)}...`, { id: "bulk-fix-progress", duration: Infinity });
      try {
        await autoFixCourse(courseId, title);
        fixed++;
      } catch (e) {
        console.error("Bulk fix error for", courseId, e);
        failed++;
      }
    }

    toast.dismiss("bulk-fix-progress");
    setBulkFixing(false);
    toast.success(`Исправление завершено: ✅ ${fixed} исправлено${failed > 0 ? `, ❌ ${failed} с ошибками` : ""}`, { duration: 10000 });
    h.fetchData();
  };

  const autoFixCourse = async (courseId: string, courseTitle: string) => {
    const toastId = toast.loading("Анализирую курс...", { duration: Infinity });
    let hadCriticalError = false;

    const checkCriticalError = (error: any) => {
      const msg = String(error?.message || error || "");
      if (msg.includes("402") || msg.includes("429") || msg.includes("Insufficient") || msg.includes("rate limit") || msg.includes("MODERATION")) {
        hadCriticalError = true;
        autoFixCriticalError.current.add(courseId);
      }
    };

    // Determine program type from course category
    let programType: string | undefined;
    try {
      const { data: courseData } = await supabase.from("courses").select("category_id").eq("id", courseId).single();
      if (courseData?.category_id) {
        const cat = h.dbCategories.find(c => c.id === courseData.category_id);
        if (cat?.parent_type) programType = cat.parent_type;
      }
    } catch {}

    try {
      // 1. Fetch fresh data from DB
      let { data: lessons } = await supabase
        .from("lessons").select("id, title, type, content, order_index").eq("course_id", courseId).order("order_index");

      const currentLessons = lessons || [];
      const textPracticeLessons = currentLessons.filter(l => l.type === "text" || l.type === "practice");
      const testLessons = currentLessons.filter(l => l.type === "test");
      const needsStructure = textPracticeLessons.length === 0 || currentLessons.length < valRules.minLessons || (valRules.requireTest && testLessons.length === 0);

      // If course needs structural fix (missing text lessons or too few lessons), generate structure first
      if (needsStructure) {
        toast.loading("Генерирую структуру курса...", { id: toastId });
        try {
          const { data: structData, error: structErr } = await safeInvoke<any>("generate-course-structure", {
            body: { title: courseTitle, description: "" },
          });
          if (structErr) throw structErr;
          const generatedLessons: Array<{ title: string; type: string }> = structData?.lessons || [];
          if (generatedLessons.length > 0) {
            // Determine max order_index
            const maxOrder = currentLessons.reduce((mx, l) => Math.max(mx, l.order_index ?? 0), -1);
            // Filter out lessons that would be duplicates by title
            const existingTitles = new Set(currentLessons.map(l => l.title.toLowerCase()));
            const newLessons = generatedLessons
              .filter(gl => !existingTitles.has(gl.title.toLowerCase()))
              ; // Allow test lessons to be created from AI structure
            if (newLessons.length > 0) {
              const toInsert = newLessons.map((gl, i) => ({
                course_id: courseId,
                title: gl.title,
                type: gl.type || "text",
                order_index: maxOrder + 1 + i,
                content: null,
              }));
              await supabase.from("lessons").insert(toInsert);
            }
            // Re-fetch lessons after structural changes
            const { data: refreshed } = await supabase
              .from("lessons").select("id, title, type, content, order_index").eq("course_id", courseId).order("order_index");
            lessons = refreshed;
          }
        } catch (e) {
          console.error("Structure generation failed:", e);
          checkCriticalError(e);
        }
      }

      let allLessons = lessons || [];

      // If tests are required but missing, create a test lesson manually
      if (valRules.requireTest && allLessons.filter(l => l.type === "test").length === 0) {
        toast.loading("Создаю тестовый урок...", { id: toastId });
        const maxOrder = allLessons.reduce((mx, l) => Math.max(mx, l.order_index ?? 0), -1);
        await supabase.from("lessons").insert({
          course_id: courseId,
          title: "Итоговый тест",
          type: "test",
          order_index: maxOrder + 1,
          content: null,
        });
        const { data: refreshed2 } = await supabase
          .from("lessons").select("id, title, type, content, order_index").eq("course_id", courseId).order("order_index");
        allLessons = refreshed2 || allLessons;
      }

      const emptyLessons = allLessons.filter(l =>
        (l.type === "text" || l.type === "practice") && (!l.content || l.content === "[]" || l.content === "" || l.content.length < valRules.minContentLength)
      );

      const testIds = allLessons.filter(l => l.type === "test").map(l => l.id);
      let allQuestions: Array<{ id: string; lesson_id: string; correct_answer: number | null; explanation?: string | null; question: string; options: any }> = [];

      if (testIds.length) {
        const { data: questions } = await supabase
          .from("test_questions").select("id, lesson_id, correct_answer, explanation, question, options").in("lesson_id", testIds);
        allQuestions = (questions || []) as typeof allQuestions;
      }

      // Find tests with no questions at all
      const testQuestionsByLesson = new Set(allQuestions.map(q => q.lesson_id));
      const emptyTests = allLessons.filter(l => l.type === "test" && !testQuestionsByLesson.has(l.id));

      const unansweredQuestions = allQuestions.filter(q => q.correct_answer === null || q.correct_answer === undefined);

      // Find duplicate titles
      const titleCounts = new Map<string, Array<{ id: string; title: string }>>();
      for (const l of allLessons) {
        const arr = titleCounts.get(l.title) || [];
        arr.push(l);
        titleCounts.set(l.title, arr);
      }
      const duplicateGroups = [...titleCounts.values()].filter(g => g.length > 1);

      // Pre-check lessons needing media (moved here so totalTasks accounts for it)
      const allTextLessonsEarly = allLessons.filter(l => l.type === "text" || l.type === "practice");
      const lessonsNeedingMediaEarly: typeof allTextLessonsEarly = [];
      const freshLessonsEarly = await Promise.all(
        allTextLessonsEarly.map(async (lesson) => {
          const { data } = await supabase.from("lessons").select("content").eq("id", lesson.id).single();
          return { lesson, content: data?.content };
        })
      );
      for (const { lesson, content } of freshLessonsEarly) {
        if (!content || content === "[]") continue;
        try {
          const blocks = JSON.parse(content);
          if (!Array.isArray(blocks) || blocks.length < 3) continue;
          const hasMedia = blocks.some((b: any) => b.type === "image" || b.type === "slider");
          if (!hasMedia) lessonsNeedingMediaEarly.push({ ...lesson, content });
        } catch { continue; }
      }

      const totalTasks = emptyLessons.length + (unansweredQuestions.length > 0 ? 1 : 0) + (duplicateGroups.length > 0 ? 1 : 0) + emptyTests.length + (lessonsNeedingMediaEarly.length > 0 ? 1 : 0);
      if (totalTasks === 0 && !needsStructure) { toast.info("Нечего исправлять", { id: toastId, duration: 3000 }); return; }
      if (totalTasks === 0) { toast.success("Структура создана! Повторная проверка...", { id: toastId, duration: 3000 }); setTimeout(() => handleValidateCourse(courseId), 1000); return; }

      let completed = 0;

      // 2. Generate content for empty lessons (parallel, concurrency=3)
      const CONCURRENCY = 3;
      for (let i = 0; i < emptyLessons.length; i += CONCURRENCY) {
        const chunk = emptyLessons.slice(i, i + CONCURRENCY);
        const promises = chunk.map(async (lesson, idxInChunk) => {
          completed++;
          const streamIndex = i + idxInChunk;
          toast.loading(`Генерирую контент: "${lesson.title}" (${completed}/${totalTasks})`, { id: toastId });
          const startMs = Date.now();
          try {
            const { data, error } = await safeInvoke<any>("gigachat", {
              body: {
                action: "generate_content",
                courseTitle,
                lessonTitle: lesson.title,
                lessonType: lesson.type,
                existingContent: null,
                ai_provider: aiProvider,
                stream_index: streamIndex,
                ...(programType ? { programType } : {}),
                ...(aiProvider === "gigachat" && gigachatModel ? { gigachat_model: gigachatModel } : {}),
                ...(aiPrompts.content ? { customSystemPrompt: aiPrompts.content } : {}),
              },
            });
            if (error) throw error;
            let itemsCount = 0;
            if (data?.content) {
              const blocks = markdownToBlocks(data.content);
              itemsCount = blocks.length;
              const jsonContent = blocks.length > 0 ? blocksToJson(blocks) : data.content;
              await supabase.from("lessons").update({ content: jsonContent }).eq("id", lesson.id);
            }
            await supabase.from("generation_history").insert({
              course_id: courseId,
              course_title: courseTitle,
              action: "content",
              details: `Auto-fix: "${lesson.title}"`,
              items_count: itemsCount,
              stream_index: streamIndex,
              duration_ms: Date.now() - startMs,
            });
          } catch (e) {
            console.error(`Failed to generate content for lesson ${lesson.id}:`, e);
            checkCriticalError(e);
          }
        });
        await Promise.allSettled(promises);
      }
      if (hadCriticalError) throw new Error("Critical API error during content generation");

      // 2b. Generate questions for empty tests (before media enrichment)
      if (emptyTests.length > 0) {
        for (let i = 0; i < emptyTests.length; i += CONCURRENCY) {
          const chunk = emptyTests.slice(i, i + CONCURRENCY);
          const promises = chunk.map(async (test, idxInChunk) => {
            completed++;
            const streamIndex = i + idxInChunk;
            toast.loading(`Генерирую вопросы: "${test.title}" (${completed}/${totalTasks})`, { id: toastId });
            const startMs = Date.now();
            try {
              const { data, error } = await safeInvoke<any>("gigachat", {
                body: {
                  action: "generate_questions",
                  courseTitle,
                  lessonTitle: test.title,
                  ai_provider: aiProvider,
                  stream_index: streamIndex,
                  ...(programType ? { programType } : {}),
                  ...(aiProvider === "gigachat" && gigachatModel ? { gigachat_model: gigachatModel } : {}),
                  ...(aiPrompts.questions ? { customSystemPrompt: aiPrompts.questions } : {}),
                },
              });
              if (error) throw error;
              let itemsCount = 0;
              if (data?.questions && !data.parseError && data.questions.length > 0) {
                itemsCount = data.questions.length;
                const toInsert = data.questions.map((q: any, idx: number) => ({
                  lesson_id: test.id,
                  question: q.question,
                  options: q.options,
                  correct_answer: q.correctAnswer ?? null,
                  explanation: q.explanation || null,
                  order_index: idx,
                }));
                await supabase.from("test_questions").insert(toInsert);
              }
              await supabase.from("generation_history").insert({
                course_id: courseId,
                course_title: courseTitle,
                action: "questions",
                details: `Auto-fix: "${test.title}"`,
                items_count: itemsCount,
                stream_index: streamIndex,
                duration_ms: Date.now() - startMs,
              });
            } catch (e) {
              console.error(`Failed to generate questions for test ${test.id}:`, e);
              checkCriticalError(e);
            }
          });
          await Promise.allSettled(promises);
        }
      }

      // 2c. Solve existing unanswered test questions (parallel, concurrency=2)
      if (unansweredQuestions.length > 0) {
        completed++;
        toast.loading(`Решаю тесты: ${unansweredQuestions.length} вопросов (${completed}/${totalTasks})`, { id: toastId });

        const byLesson = new Map<string, typeof unansweredQuestions>();
        for (const q of unansweredQuestions) {
          const arr = byLesson.get(q.lesson_id) || [];
          arr.push(q);
          byLesson.set(q.lesson_id, arr);
        }

        const lessonEntries = Array.from(byLesson.entries());
        for (let i = 0; i < lessonEntries.length; i += CONCURRENCY) {
          const chunk = lessonEntries.slice(i, i + CONCURRENCY);
          const promises = chunk.map(async ([lessonId, questions], idxInChunk) => {
            const lessonInfo = lessons?.find(l => l.id === lessonId);
            const streamIndex = i + idxInChunk;
            const batchSize = 20;
            const startMs = Date.now();
            let answeredCount = 0;
            for (let j = 0; j < questions.length; j += batchSize) {
              const batch = questions.slice(j, j + batchSize);
              try {
                const { data, error } = await safeInvoke<any>("gigachat", {
                  body: {
                    action: "generate_answers",
                    courseTitle,
                    lessonTitle: lessonInfo?.title || "Тест",
                    questions: batch.map(q => ({
                      question: q.question,
                      options: q.options || [],
                    })),
                    ai_provider: aiProvider,
                    stream_index: streamIndex,
                    ...(aiProvider === "gigachat" && gigachatModel ? { gigachat_model: gigachatModel } : {}),
                    ...(aiPrompts.answers ? { customSystemPrompt: aiPrompts.answers } : {}),
                  },
                });
                if (error) throw error;
                if (data?.answers && !data.parseError) {
                  for (const ans of data.answers) {
                    const q = batch[ans.questionIndex];
                    if (q && ans.correctAnswer !== undefined) {
                      answeredCount++;
                      await supabase.from("test_questions")
                        .update({ correct_answer: ans.correctAnswer, explanation: ans.explanation || null })
                        .eq("id", q.id);
                    }
                  }
                }
              } catch (e) {
                console.error(`Failed to solve test batch for lesson ${lessonId}:`, e);
                checkCriticalError(e);
              }
            }
            await supabase.from("generation_history").insert({
              course_id: courseId,
              course_title: courseTitle,
              action: "answers",
              details: `Auto-fix: "${lessonInfo?.title || "Тест"}"`,
              items_count: answeredCount,
              stream_index: streamIndex,
              duration_ms: Date.now() - startMs,
            }).then(() => {}, () => {});
          });
          await Promise.allSettled(promises);
        }
      }
      if (hadCriticalError) throw new Error("Critical API error during test generation");

      // 2d. Enrich text/practice lessons with images
      // RECOMPUTE lessons needing media AFTER content/tests generation (content may have changed)
      const allTextLessonsPost = allLessons.filter(l => l.type === "text" || l.type === "practice");
      const lessonsNeedingMedia: typeof allTextLessonsPost = [];
      const freshLessonsPost = await Promise.all(
        allTextLessonsPost.map(async (lesson) => {
          const { data } = await supabase.from("lessons").select("content").eq("id", lesson.id).single();
          return { lesson, content: data?.content };
        })
      );
      for (const { lesson, content } of freshLessonsPost) {
        if (!content || content === "[]") continue;
        try {
          const blocks = JSON.parse(content);
          if (!Array.isArray(blocks) || blocks.length < 3) continue;
          const hasMedia = blocks.some((b: any) => b.type === "image" || b.type === "slider");
          if (!hasMedia) lessonsNeedingMedia.push({ ...lesson, content });
        } catch { continue; }
      }

      // Для рабочих профессий — до 9 изображений, для остальных — 3
      const mediaLimit = programType === "Рабочие профессии" ? 9 : 3;
      const lessonsToEnrich = lessonsNeedingMedia.slice(0, mediaLimit);
      // Media recompute: enriching lessons that need media
      if (lessonsToEnrich.length > 0) {
        let enrichedCount = 0;

        // === PHASE 1: Analyze all lessons in parallel ===
        toast.loading(`Анализирую уроки: 0/${lessonsToEnrich.length}...`, { id: toastId });
        type AnalysisResult = {
          lesson: typeof lessonsToEnrich[0];
          streamIndex: number;
          blocks: any[];
          imageVisual: { prompt: string; after_block_index: number; format: "image" | "slider"; slides?: string[] };
          startMs: number;
        };
        const analysisResults: AnalysisResult[] = [];
        let analyzedCount = 0;

        const ANALYSIS_BATCH_SIZE = CONCURRENCY; // 3 — match API slot count
        const ANALYSIS_COOLDOWN_MS = 5000;
        for (let batchStart = 0; batchStart < lessonsToEnrich.length; batchStart += ANALYSIS_BATCH_SIZE) {
          const batch = lessonsToEnrich.slice(batchStart, batchStart + ANALYSIS_BATCH_SIZE);
          if (batchStart > 0) {
            await new Promise(r => setTimeout(r, ANALYSIS_COOLDOWN_MS));
          }
          const batchPromises = batch.map(async (lesson, idxInBatch) => {
            const idx = batchStart + idxInBatch;
            const streamIndex = idx;
            const startMs = Date.now();
            try {
              let blocks: any[];
              try { blocks = JSON.parse(lesson.content!); } catch { return; }
              const textContent = blocks
                .filter((b: any) => b.type === "paragraph" || b.type?.startsWith("heading"))
                .map((b: any) => b.content || "").join("\n").slice(0, 4000);
              if (textContent.length < 50) {
                console.warn(`[Enrichment] Skipping "${lesson.title}": text too short (${textContent.length} chars)`);
                await supabase.from("generation_history").insert({
                  course_id: courseId, course_title: courseTitle,
                  action: "media", details: `Пропущен: "${lesson.title}" — текст < 50 символов`,
                  items_count: 0, stream_index: streamIndex,
                }).then(() => {}, () => {});
                return;
              }

              const { data: analysisData, error: analysisErr } = await safeInvoke<any>("gigachat", {
                body: {
                  action: "analyze_visuals",
                  courseTitle,
                  lessonTitle: lesson.title,
                  lessonContent: textContent,
                  blocksCount: blocks.length,
                  ai_provider: aiProvider,
                  stream_index: streamIndex,
                  ...(aiProvider === "gigachat" && gigachatModel ? { gigachat_model: gigachatModel } : {}),
                },
              });

              analyzedCount++;
              toast.loading(`Анализирую уроки: ${analyzedCount}/${lessonsToEnrich.length}...`, { id: toastId });

              if (analysisErr || !analysisData?.visuals || analysisData.visuals.length === 0) {
                return;
              }

              const visuals = analysisData.visuals as Array<{
                prompt: string; after_block_index: number; format: "image" | "slider"; slides?: string[];
              }>;
              const imageVisual = visuals.find(v => v.format === "image");
              if (imageVisual) {
                analysisResults.push({ lesson, streamIndex, blocks, imageVisual, startMs });
              }
            } catch (e) {
              console.error(`Enrichment analysis error for ${lesson.id}:`, e);
              checkCriticalError(e);
            }
          });
          await Promise.allSettled(batchPromises);
        }

        // === PHASE 2: Generate images in batches with retry waves for failures ===
        if (analysisResults.length > 0) {
          let successCount = 0;
          let skipCount = 0;
          const totalLessons = analysisResults.length;
          toast.loading(`Генерирую изображения: 0/${totalLessons}...`, { id: toastId });

          const BATCH_SIZE = 2; // Reduced to avoid 429 rate limits
          const BATCH_COOLDOWN_MS = 30000; // 30s cooldown between batches

          // Track which items still need images
          type PendingItem = typeof analysisResults[0];
          let pending: PendingItem[] = [...analysisResults];
          const MAX_WAVES = 3; // up to 3 waves of retries

          for (let wave = 0; wave < MAX_WAVES && pending.length > 0; wave++) {
            if (wave > 0) {
              const waveCooldown = 20000 * wave; // 20s, 40s
              // Retrying failed items in next wave
              toast.loading(`Повторная генерация (волна ${wave + 1}): ${pending.length} изображений...`, { id: toastId });
              await new Promise(r => setTimeout(r, waveCooldown));
            }

            const isLastWave = wave === MAX_WAVES - 1;
            const failedThisWave: PendingItem[] = [];

            for (let batchStart = 0; batchStart < pending.length; batchStart += BATCH_SIZE) {
              // Early exit: already got enough images
              if (successCount >= mediaLimit) {
                // Reached media limit, stopping
                break;
              }

              const batch = pending.slice(batchStart, batchStart + BATCH_SIZE);
              if (batchStart > 0) {
                // Cooldown between batches
                await new Promise(r => setTimeout(r, BATCH_COOLDOWN_MS));
              }

              const batchPromises = batch.map(async (item) => {
                // Skip if we already hit the limit
                if (successCount >= mediaLimit) return;

                const { lesson, streamIndex, blocks, imageVisual, startMs } = item;
                try {
                  let imgUrl: string | null = null;
                  let lastImgErr: any = null;

                  // Single attempt per wave (waves handle retries)
                  const { data: imgData, error: imgErr } = await safeInvoke<any>("generate-image", {
                    body: { prompt: imageVisual.prompt, provider: "gigachat", slotIndex: streamIndex },
                  });

                  if (!imgErr && imgData?.url) {
                    imgUrl = imgData.url;
                  } else {
                    lastImgErr = imgErr;
                  }

                  let insertedCount = 0;
                  if (imgUrl) {
                    const insertIdx = Math.min(imageVisual.after_block_index + 1, blocks.length);
                    blocks.splice(insertIdx, 0, {
                      id: crypto.randomUUID(), type: "image", content: imageVisual.prompt, imageSrc: imgUrl, imageAlt: imageVisual.prompt,
                    });
                    insertedCount++;
                    await supabase.from("lessons").update({ content: JSON.stringify(blocks) }).eq("id", lesson.id);
                    enrichedCount += insertedCount;
                    successCount++;
                    toast.loading(`Генерирую изображения: ${successCount + skipCount}/${totalLessons}...`, { id: toastId });
                  } else {
                    if (isLastWave) {
                      // Final wave — count as processed (skipped)
                      skipCount++;
                      toast.loading(`Генерирую изображения: ${successCount + skipCount}/${totalLessons}...`, { id: toastId });
                    } else {
                      // Will retry in next wave — don't increment counter
                      failedThisWave.push(item);
                    }
                  }

                  const errDetail = lastImgErr ? ` [err: ${lastImgErr?.message?.slice(0, 60)}]` : "";
                  await supabase.from("generation_history").insert({
                    course_id: courseId, course_title: courseTitle,
                    action: "media",
                    details: `Wave ${wave + 1}: "${lesson.title}" (+${insertedCount} img)${errDetail}`,
                    items_count: insertedCount, stream_index: streamIndex,
                    duration_ms: Date.now() - startMs,
                  }).then(() => {}, () => {});
                } catch (e) {
                  console.error(`Auto-fix enrichment error for ${lesson.id}:`, e);
                  checkCriticalError(e);
                  if (isLastWave) {
                    skipCount++;
                  } else {
                    failedThisWave.push(item);
                  }
                }
              });
              await Promise.allSettled(batchPromises);
            }

            if (successCount >= mediaLimit) break;
            pending = failedThisWave;
            if (pending.length === 0) {
              // All images generated successfully
              break;
            }
          }

          if (pending.length > 0) {
            await supabase.from("generation_history").insert({
              course_id: courseId, course_title: courseTitle,
              action: "media",
              details: `${pending.length} изображений не удалось сгенерировать после ${MAX_WAVES} волн`,
              items_count: 0,
            }).then(() => {}, () => {});
          }
        }
        if (enrichedCount > 0) {
          // Enrichment complete
        }
      } else if (allTextLessonsPost.length > 0) {
        // All lessons already have images — log and skip
        // All text lessons already contain images, skipping enrichment
        await supabase.from("generation_history").insert({
          course_id: courseId, course_title: courseTitle,
          action: "media",
          details: "Все уроки уже содержат изображения — пропуск",
          items_count: 0,
        }).then(() => {}, () => {});
      }

      // 5. Remove duplicate lessons (keep first, delete rest)
      if (duplicateGroups.length > 0) {
        completed++;
        toast.loading(`Удаляю дубликаты (${completed}/${totalTasks})`, { id: toastId });
        const idsToDelete: string[] = [];
        for (const group of duplicateGroups) {
          for (let i = 1; i < group.length; i++) {
            idsToDelete.push(group[i].id);
          }
        }
        if (idsToDelete.length > 0) {
          await supabase.from("test_questions").delete().in("lesson_id", idsToDelete);
          await supabase.from("lesson_progress").delete().in("lesson_id", idsToDelete);
          await supabase.from("lesson_attachments").delete().in("lesson_id", idsToDelete);
          await supabase.from("lessons").delete().in("id", idsToDelete);
        }
      }

      if (hadCriticalError) {
        toast.warning("Автоисправление прервано: ошибка API (402/429). Оставшиеся проблемы требуют ручного запуска.", { id: toastId, duration: 8000 });
        return;
      }

      toast.success(`Курс исправлен! Повторная проверка...`, { id: toastId, duration: 3000 });
      // Increment cycle counter before re-validation
      const prevCycles = autoFixCycleCount.current.get(courseId) || 0;
      autoFixCycleCount.current.set(courseId, prevCycles + 1);
      // Re-validate
      setTimeout(() => handleValidateCourse(courseId, true), 1000);
    } catch (e: any) {
      console.error("Auto-fix error:", e);
      checkCriticalError(e);
      if (hadCriticalError) {
        toast.warning("Автоисправление прервано: ошибка API. Запустите вручную позже.", { id: toastId, duration: 8000 });
      } else {
        toast.error("Ошибка автоисправления", { id: toastId, duration: 5000 });
      }
    }
  };

  const handleBulkGenerate = (item: any) => {
    setBulkGenCourse({ id: item.course_id, title: item.course?.title || "", description: item.course?.description || "" });
  };

  const handleGenerateDescription = async () => {
    if (!h.newTitle.trim()) { toast.error("Сначала введите название курса"); return; }
    setIsGeneratingDesc(true);
    try {
      const { data, error } = await safeInvoke<any>("generate-course-content", {
        body: { contentType: "description", courseTitle: h.newTitle },
      });
      if (error) throw error;
      if (data?.content) h.setNewDescription(data.content);
    } catch (e: any) {
      console.error(e);
      toast.error("Ошибка генерации описания");
    } finally {
      setIsGeneratingDesc(false);
    }
  };

  const handleGenerateShortDesc = async () => {
    if (!h.newTitle.trim()) { toast.error("Сначала введите название курса"); return; }
    setIsGeneratingShortDesc(true);
    try {
      const { data, error } = await safeInvoke<any>("generate-course-content", {
        body: { contentType: "short_description", courseTitle: h.newTitle, courseDescription: h.newDescription },
      });
      if (error) throw error;
      if (data?.content) h.setNewShortDesc(data.content);
    } catch (e: any) {
      console.error(e);
      toast.error("Ошибка генерации описания");
    } finally {
      setIsGeneratingShortDesc(false);
    }
  };

  if (h.isLoading && h.courses.length === 0) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Tabs value={h.activeTab} onValueChange={(v) => h.setActiveTab(v as any)} className="space-y-6">
        <div className="overflow-x-auto -mx-1 px-1">
          <TabsList className="inline-flex h-11 w-auto min-w-full gap-1 p-1">
            <TabsTrigger value="catalog" className="flex items-center gap-2 px-4 whitespace-nowrap">
              <Package className="w-4 h-4 shrink-0" />Каталог
            </TabsTrigger>
            <TabsTrigger value="programs" className="flex items-center gap-2 px-4 whitespace-nowrap">
              <BookOpen className="w-4 h-4 shrink-0" />Программы
            </TabsTrigger>
            <TabsTrigger value="create" className="flex items-center gap-2 px-4 whitespace-nowrap">
              <Plus className="w-4 h-4 shrink-0" />Создать курс
            </TabsTrigger>
            <TabsTrigger value="generator" className="flex items-center gap-2 px-4 whitespace-nowrap">
              <Sparkles className="w-4 h-4 shrink-0" />Генератор
            </TabsTrigger>
            <TabsTrigger value="import" className="flex items-center gap-2 px-4 whitespace-nowrap">
              <Upload className="w-4 h-4 shrink-0" />Импорт
            </TabsTrigger>
            <TabsTrigger value="knowledge" className="flex items-center gap-2 px-4 whitespace-nowrap">
              <Library className="w-4 h-4 shrink-0" />Банк знаний
            </TabsTrigger>
             <TabsTrigger value="orders" className="flex items-center gap-2 px-4 whitespace-nowrap">
               <ShoppingCart className="w-4 h-4 shrink-0" />Заявки
             </TabsTrigger>
             <TabsTrigger value="history" className="flex items-center gap-2 px-4 whitespace-nowrap">
               <History className="w-4 h-4 shrink-0" />История
             </TabsTrigger>
             <TabsTrigger value="settings" className="flex items-center gap-2 px-4 whitespace-nowrap">
               <Settings className="w-4 h-4 shrink-0" />Настройки
             </TabsTrigger>
          </TabsList>
        </div>

        {/* History */}
        <TabsContent value="history" className="space-y-4">
          <GenerationHistoryTab />
        </TabsContent>

        {/* Settings */}
        <TabsContent value="settings" className="space-y-4">
          <MarketplaceSettingsTab onSettingsLoaded={handleSettingsLoaded} />
        </TabsContent>

        {/* Generator */}
        <TabsContent value="generator" className="space-y-4">
          <ContentGeneratorTab
            courses={h.courses}
            dbCategories={h.dbCategories}
            onComplete={() => h.fetchData()}
          />
        </TabsContent>

        {/* Catalog */}
        <TabsContent value="catalog" className="space-y-4">
          {/* Tools */}
          <Card className="shadow-sm">
            <CardContent className="p-4">
              <Collapsible>
                <CollapsibleTrigger className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">
                  <ChevronDown className="w-3 h-3 transition-transform group-data-[state=closed]:-rotate-90" />
                  Инструменты
                </CollapsibleTrigger>
                <CollapsibleContent className="pt-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="rounded-xl"
                    disabled={converting}
                    onClick={async () => {
                      setConverting(true);
                      const toastId = toast.loading("Конвертирую Markdown → JSON блоки...", { duration: Infinity });
                      try {
                        let totalConverted = 0;
                        let totalFailed = 0;
                        for (let batch = 0; batch < 20; batch++) {
                          const { data, error } = await safeInvoke<any>("convert-lesson-content", {
                            body: { batch_size: 500 },
                          });
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
                    {converting ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <BookOpen className="w-4 h-4 mr-1.5" />}
                    Конвертировать MD→JSON
                  </Button>
                </CollapsibleContent>
              </Collapsible>
            </CardContent>
          </Card>

          {/* Validation Report Panel */}
          {validationReport && (
            <Card className={`shadow-sm ${validationReport.length > 0 ? "border-destructive/40 bg-destructive/5" : "border-green-500/40 bg-green-500/5"}`}>
              <CardHeader className="py-3 px-4">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    {validationReport.length > 0 ? (
                      <><AlertTriangle className="w-4 h-4 text-destructive" />Результаты проверки</>
                    ) : (
                      <><CheckCircle2 className="w-4 h-4 text-green-600" />Все курсы готовы</>
                    )}
                  </CardTitle>
                  <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setValidationReport(null)}>
                    <X className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="px-4 pb-3 pt-0 space-y-2">
                {validationReportOk > 0 && (
                  <p className="text-sm text-muted-foreground">✅ {validationReportOk} курсов готово</p>
                )}
                {validationReport.length > 0 && (
                  <>
                    <p className="text-sm font-medium text-destructive">❌ {validationReport.length} курсов с проблемами:</p>
                    <ul className="space-y-1 max-h-48 overflow-y-auto">
                      {validationReport.map((r) => (
                        <li key={r.courseId} className="text-xs text-muted-foreground flex items-start gap-1.5">
                          <AlertTriangle className="w-3 h-3 text-destructive shrink-0 mt-0.5" />
                          <span>{r.title}{r.issues.length > 0 ? ` — ${r.issues.join(", ")}` : ""}</span>
                        </li>
                      ))}
                    </ul>
                    <Button
                      size="sm"
                      variant="destructive"
                      className="mt-2 rounded-xl"
                      disabled={bulkFixing}
                      onClick={() => {
                        handleBulkAutoFix(validationReport.map(r => ({ courseId: r.courseId, title: r.title })));
                        setValidationReport(null);
                      }}
                    >
                      {bulkFixing ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" /> : <Sparkles className="w-3.5 h-3.5 mr-1.5" />}
                      🔧 Исправить все ({validationReport.length})
                    </Button>
                  </>
                )}
              </CardContent>
            </Card>
          )}
          {/* Search + view toggle */}
          <div className="flex items-center gap-4">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Поиск курсов..."
                value={h.searchQuery}
                onChange={(e) => h.setSearchQuery(e.target.value)}
                className="pl-10 pr-8 rounded-xl"
              />
              {h.searchQuery && (
                <button
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  onClick={() => h.setSearchQuery("")}
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
            <div className="flex items-center gap-1 border rounded-lg p-0.5">
              <Button variant={h.viewMode === "list" ? "default" : "ghost"} size="icon" className="h-8 w-8" onClick={() => h.setViewMode("list")}>
                <List className="w-4 h-4" />
              </Button>
              <Button variant={h.viewMode === "grid" ? "default" : "ghost"} size="icon" className="h-8 w-8" onClick={() => h.setViewMode("grid")}>
                <LayoutGrid className="w-4 h-4" />
              </Button>
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
              {/* Info banner — same as store */}
              <div className="bg-gradient-to-r from-primary/5 via-accent/5 to-primary/3 border border-border rounded-lg p-4">
                <div className="flex gap-3 items-start">
                  <ShieldCheck className="w-5 h-5 text-primary mt-0.5 shrink-0" />
                  <div>
                    <h4 className="font-semibold text-sm text-foreground mb-1">Курсы ДПО и профессионального обучения</h4>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      Повышение квалификации, профпереподготовка, охрана труда и рабочие профессии. Тесты соответствуют требованиям аттестации.
                    </p>
                    <div className="flex gap-2 mt-2">
                      <Badge variant="secondary" className="text-xs">ДПО</Badge>
                      <Badge variant="secondary" className="text-xs">ОТ / ПБ</Badge>
                      <Badge variant="secondary" className="text-xs">Бесплатно</Badge>
                    </div>
                    <div className="flex items-start gap-1.5 mt-3 pt-3 border-t border-border/50">
                      <Lightbulb className="w-3.5 h-3.5 text-amber-500 mt-0.5 shrink-0" />
                      <p className="text-xs text-muted-foreground">
                        Порядок категорий и курсов здесь = порядок в магазине. Перетаскивайте подкатегории для изменения порядка.
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Bulk selection toolbar */}
              {selectedCourses.size > 0 && (
                <div className="sticky top-0 z-10 flex items-center gap-3 bg-primary/10 border border-primary/20 rounded-lg p-3">
                  <Checkbox
                    checked={true}
                    onCheckedChange={() => setSelectedCourses(new Set())}
                  />
                  <span className="text-sm font-medium">
                    Выбрано: {selectedCourses.size} {selectedCourses.size === 1 ? 'курс' : selectedCourses.size < 5 ? 'курса' : 'курсов'}
                  </span>
                  <Button
                    size="sm"
                    variant="outline"
                    className="ml-auto gap-1.5"
                    onClick={() => { setBulkMoveTargetCategory(""); setShowBulkMoveDialog(true); }}
                  >
                    <FolderInput className="w-3.5 h-3.5" />
                    Переместить
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setSelectedCourses(new Set())}
                  >
                    <X className="w-3.5 h-3.5 mr-1" />
                    Снять выделение
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
                                ✅ {group.courses.filter(c => validatedCourses[c.course_id] === 'ok').length} / ❌ {group.courses.filter(c => validatedCourses[c.course_id] === 'error').length}
                              </Badge>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 text-xs px-2"
                                disabled={!!bulkValidatingGroup}
                                onClick={(e) => { e.stopPropagation(); handleBulkValidate(group); }}
                              >
                                {bulkValidatingGroup === group.category
                                  ? <><Loader2 className="w-3 h-3 animate-spin mr-1" />{bulkValidateProgress}</>
                                  : <><CheckCircle2 className="w-3 h-3 mr-1" />Проверить все</>}
                              </Button>
                            </>
                          )}
                          <Badge variant="secondary">{group.courses.length} курсов</Badge>
                          <ChevronDown className="w-5 h-5 text-muted-foreground transition-transform group-data-[state=closed]:-rotate-90" />
                        </CollapsibleTrigger>
                        <CollapsibleContent className="space-y-3 mt-3 pl-2">
                          {/* DnD for sub-categories */}
                          <DndContext
                            sensors={sensors}
                            collisionDetection={closestCenter}
                            onDragEnd={(event: DragEndEvent) => {
                              const { active, over } = event;
                              if (!over || active.id === over.id) return;
                              // Scope reorder to categories within this parent_type
                              const parentCats = h.dbCategories.filter(c => (c.parent_type || "Повышение квалификации") === group.category);
                              const oldIdx = parentCats.findIndex(c => c.id === active.id);
                              const newIdx = parentCats.findIndex(c => c.id === over.id);
                              if (oldIdx === -1 || newIdx === -1) return;
                              const reorderedParent = arrayMove(parentCats, oldIdx, newIdx).map((c, i) => ({ ...c, order_index: i }));
                              // Merge back with other parent_type categories
                              const otherCats = h.dbCategories.filter(c => (c.parent_type || "Повышение квалификации") !== group.category);
                              h.handleReorderCategories([...otherCats, ...reorderedParent]);
                            }}
                          >
                            <SortableContext items={group.subGroups.map(s => s.categoryId || s.category)} strategy={verticalListSortingStrategy}>
                              {group.subGroups.map((sub) => {
                                const dbIcon = (sub as any).icon ? iconMap[(sub as any).icon] : null;
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
                                            ✅ {sub.courses.filter(c => validatedCourses[c.course_id] === 'ok').length} / ❌ {sub.courses.filter(c => validatedCourses[c.course_id] === 'error').length}
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
                                          renderGroupedCourses(sub.courses, h, navigate, handleBulkGenerate, validatedCourses, handleValidateCourse, validatingId, selectedCourses, toggleCourseSelect)
                                        )}
                                      </CollapsibleContent>
                                    </Collapsible>
                                  </SortableCategoryItem>
                                );
                              })}
                            </SortableContext>
                          </DndContext>

                          {/* Uncategorized courses in this group */}
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
                                {/* Bulk move controls */}
                                {selectedUncategorized.size > 0 && (
                                  <div className="flex items-center gap-2 mb-2 p-2 rounded-lg bg-primary/5 border border-primary/20">
                                    <span className="text-xs text-muted-foreground">Выбрано: {selectedUncategorized.size}</span>
                                    <Select value={bulkMoveTarget} onValueChange={setBulkMoveTarget}>
                                      <SelectTrigger className="h-7 text-xs w-[200px]">
                                        <SelectValue placeholder="Категория..." />
                                      </SelectTrigger>
                                      <SelectContent>
                                        {h.groupedCourses.map(g => {
                                          if (!g.subGroups || g.subGroups.length === 0) return null;
                                          return (
                                            <SelectGroup key={g.category}>
                                              <SelectLabel className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">{g.category}</SelectLabel>
                                              {g.subGroups.map(sg => (
                                                <SelectItem key={sg.categoryId} value={sg.categoryId || sg.category}>{sg.category}</SelectItem>
                                              ))}
                                            </SelectGroup>
                                          );
                                        })}
                                      </SelectContent>
                                    </Select>
                                    <Button
                                      variant="default"
                                      size="sm"
                                      className="h-7 text-xs"
                                      disabled={!bulkMoveTarget}
                                      onClick={async () => {
                                        const ids = Array.from(selectedUncategorized);
                                        const courseIds = group.uncategorized
                                          .filter(c => ids.includes(c.id))
                                          .map(c => c.course_id);
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
                                    {group.uncategorized.map((item) => (
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
                                          <button
                                            className="text-sm text-left hover:underline cursor-pointer inline-flex items-center gap-1.5"
                                            onClick={() => handleValidateCourse(item.course_id)}
                                            disabled={validatingId === item.course_id}
                                          >
                                            {validatingId === item.course_id && <Loader2 className="w-3 h-3 animate-spin" />}
                                            {validatedCourses[item.course_id] === 'ok' && <CheckCircle2 className="w-3.5 h-3.5 text-green-500 shrink-0" />}
                                            {validatedCourses[item.course_id] === 'error' && <AlertTriangle className="w-3.5 h-3.5 text-red-500 shrink-0" />}
                                            {item.course?.title || ""}
                                          </button>
                                        </TableCell>
                                        <TableCell className="w-[100px] text-sm">{item.price_student.toLocaleString()} ₽</TableCell>
                                        <TableCell className="w-[60px]">
                                          <Switch checked={item.is_active} onCheckedChange={() => h.handleToggleActive(item)} />
                                        </TableCell>
                                        <TableCell className="w-[80px]">
                                          <div className="flex items-center gap-1">
                                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => navigate(`/course-builder/${item.course_id}`)}>
                                              <Eye className="w-3.5 h-3.5" />
                                            </Button>
                                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => { h.setEditingCourse(item); h.setShowEditDialog(true); }}>
                                              <Edit className="w-3.5 h-3.5" />
                                            </Button>
                                          </div>
                                        </TableCell>
                                      </TableRow>
                                    ))}
                                  </TableBody>
                                </Table>
                                {/* Select all toggle */}
                                <div className="flex items-center gap-2 mt-2">
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="text-xs h-7"
                                    onClick={() => {
                                      if (selectedUncategorized.size === group.uncategorized.length) {
                                        setSelectedUncategorized(new Set());
                                      } else {
                                        setSelectedUncategorized(new Set(group.uncategorized.map(c => c.id)));
                                      }
                                    }}
                                  >
                                    {selectedUncategorized.size === group.uncategorized.length ? "Снять всё" : "Выбрать все"}
                                  </Button>
                                </div>
                              </CollapsibleContent>
                            </Collapsible>
                          )}

                          {/* Auto-categorize button */}
                          {group.uncategorized.length > 0 && (
                            <Button
                              variant="outline"
                              size="sm"
                              className="text-xs ml-5"
                              disabled={autoCategorizing}
                              onClick={async () => {
                                setAutoCategorizing(true);
                                await h.handleAutoCategorize();
                                setAutoCategorizing(false);
                              }}
                            >
                              {autoCategorizing
                                ? <><Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />Распределение...</>
                                : <><Wand2 className="w-3.5 h-3.5 mr-1" />Авто-распределить</>}
                            </Button>
                          )}

                          {/* Add subcategory button */}
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-xs text-muted-foreground hover:text-foreground ml-5"
                            onClick={() => {
                              h.setNewCategoryParentType(group.category);
                              h.setNewCategoryIcon(null);
                              h.setNewCategoryName("");
                              h.setShowCategoryDialog(true);
                            }}
                          >
                            <FolderPlus className="w-3.5 h-3.5 mr-1" />Добавить подкатегорию
                          </Button>
                        </CollapsibleContent>
                      </Collapsible>
                    );
                  }

                  // Groups without subGroups — still show add button
                  return (
                    <Collapsible key={group.category} defaultOpen={false}>
                      <CollapsibleTrigger className="flex items-center gap-3 w-full p-4 rounded-xl border border-border bg-card hover:bg-secondary/30 transition-colors">
                        <div className={`w-10 h-10 rounded-lg ${catBg} flex items-center justify-center shrink-0`}>
                          <CatIcon className={`w-5 h-5 ${catColor}`} />
                        </div>
                        <span className="flex-1 text-left font-display text-lg font-medium">{group.category}</span>
                        <Badge variant="outline" className="text-[10px]">{group.badge}</Badge>
                        <Badge variant="secondary">
                          {group.courses.length} {group.courses.length === 1 ? 'курс' : group.courses.length < 5 ? 'курса' : 'курсов'}
                        </Badge>
                        <ChevronDown className="w-5 h-5 text-muted-foreground transition-transform group-data-[state=closed]:-rotate-90" />
                      </CollapsibleTrigger>
                      <CollapsibleContent className="pt-3 pl-13">
                        {group.courses.length === 0 ? (
                          <p className="text-xs text-muted-foreground py-2 italic">Курсы ещё не добавлены</p>
                        ) : (
                        renderGroupedCourses(group.courses, h, navigate, handleBulkGenerate, validatedCourses, handleValidateCourse, validatingId, selectedCourses, toggleCourseSelect)
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-xs text-muted-foreground hover:text-foreground mt-2"
                          onClick={() => {
                            h.setNewCategoryParentType(group.category);
                            h.setNewCategoryIcon(null);
                            h.setNewCategoryName("");
                            h.setShowCategoryDialog(true);
                          }}
                        >
                          <FolderPlus className="w-3.5 h-3.5 mr-1" />Добавить подкатегорию
                        </Button>
                      </CollapsibleContent>
                    </Collapsible>
                  );
                })}
              </div>
            </div>
          ) : (
            /* Grid view */
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
              {h.filteredCourses.map((item) => (
                <Card key={item.id} className={`overflow-hidden ${!item.is_active ? "opacity-60" : ""}`}>
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between gap-2">
                      <CardTitle className="text-base leading-tight flex-1">{item.course?.title}</CardTitle>
                      <Badge variant={item.is_active ? "default" : "secondary"} className="shrink-0">
                        {item.is_active ? "Активен" : "Скрыт"}
                      </Badge>
                    </div>
                    <CardDescription className="flex items-center gap-1 text-xs">
                      <Building2 className="w-3 h-3" />
                      {item.organization?.name || "Платформа"}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {item.description_short && (
                      <p className="text-sm text-muted-foreground line-clamp-2">{item.description_short}</p>
                    )}
                    <div className="grid grid-cols-2 gap-2">
                      <div className="text-center p-2 bg-secondary/50 rounded-lg">
                        <div className="text-[10px] text-muted-foreground">Студенты</div>
                        <div className="font-semibold text-sm">{item.price_student.toLocaleString()} ₽</div>
                      </div>
                      <div className="text-center p-2 bg-secondary/50 rounded-lg">
                        <div className="text-[10px] text-muted-foreground">Организации</div>
                        <div className="font-semibold text-sm">{item.price_organization.toLocaleString()} ₽</div>
                      </div>
                    </div>
                    <div className="flex items-center justify-between pt-1">
                      <div className="flex items-center gap-2">
                        <Switch checked={item.is_active} onCheckedChange={() => h.handleToggleActive(item)} />
                        <span className="text-xs text-muted-foreground">{item.is_active ? "Виден" : "Скрыт"}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <Button variant="ghost" size="icon" className="h-8 w-8" title="AI контент" onClick={() => handleBulkGenerate(item)}>
                          <Sparkles className="w-3.5 h-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8" title="Переместить в категорию" onClick={() => { h.setMovingCourse(item); h.setTargetCategory(h.extractCategory(item.course?.title)); h.setShowMoveCategoryDialog(true); }}>
                          <FolderInput className="w-3.5 h-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8" title="Редактировать уроки" onClick={() => navigate(`/course-builder/${item.course_id}`)}>
                          <BookOpen className="w-3.5 h-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8" title="Редактировать курс" onClick={() => { h.setEditingCourse(item); h.setShowEditDialog(true); }}>
                          <Edit className="w-3.5 h-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => h.handleDeleteCourse(item.id)}>
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* Create Course */}
        <TabsContent value="create" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="font-display">Создать курс для маркетплейса</CardTitle>
              <CardDescription>Курс будет создан от имени платформы</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Название курса *</Label>
                <Input value={h.newTitle} onChange={(e) => h.setNewTitle(e.target.value)} placeholder="Название курса" className="rounded-xl" />
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Описание</Label>
                  <Button variant="ghost" size="sm" onClick={handleGenerateDescription} disabled={isGeneratingDesc || !h.newTitle.trim()}>
                    {isGeneratingDesc ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : <Sparkles className="w-3.5 h-3.5 mr-1" />}
                    Сгенерировать с ИИ
                  </Button>
                </div>
                <Textarea value={h.newDescription} onChange={(e) => h.setNewDescription(e.target.value)} placeholder="Подробное описание курса..." className="rounded-xl" rows={3} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Категория</Label>
                  <Select value={h.newCategoryId} onValueChange={h.setNewCategoryId}>
                    <SelectTrigger className="rounded-xl">
                      <SelectValue placeholder="Выберите категорию" />
                    </SelectTrigger>
                    <SelectContent>
                      {h.dbCategories.map((cat) => (
                        <SelectItem key={cat.id} value={cat.id}>
                          <div className="flex items-center gap-2">
                            <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: cat.color || '#888' }} />
                            {cat.name}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Длительность</Label>
                  <Input value={h.newDuration} onChange={(e) => h.setNewDuration(e.target.value)} placeholder="40 часов" className="rounded-xl" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Цена для студентов (₽) *</Label>
                  <Input type="number" value={h.newPriceStudent} onChange={(e) => h.setNewPriceStudent(e.target.value)} placeholder="5000" className="rounded-xl" />
                </div>
                <div className="space-y-2">
                  <Label>Цена для организаций (₽) *</Label>
                  <Input type="number" value={h.newPriceOrg} onChange={(e) => h.setNewPriceOrg(e.target.value)} placeholder="3000" className="rounded-xl" />
                </div>
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Краткое описание для каталога</Label>
                  <Button variant="ghost" size="sm" onClick={handleGenerateShortDesc} disabled={isGeneratingShortDesc || !h.newTitle.trim()}>
                    {isGeneratingShortDesc ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : <Sparkles className="w-3.5 h-3.5 mr-1" />}
                    Сгенерировать с ИИ
                  </Button>
                </div>
                <Textarea value={h.newShortDesc} onChange={(e) => h.setNewShortDesc(e.target.value)} placeholder="Краткое описание..." className="rounded-xl" rows={2} />
              </div>
              <Button
                className="w-full btn-gradient rounded-xl"
                onClick={async () => {
                  const courseId = await h.handleCreateCourse();
                  if (courseId) {
                    navigate(`/course-builder/${courseId}`);
                  }
                }}
                disabled={h.isCreating || !h.newTitle.trim() || !h.newPriceStudent || !h.newPriceOrg}
              >
                {h.isCreating ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Создание...</> : <><Plus className="w-4 h-4 mr-2" />Создать и перейти к редактированию</>}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Import */}
        <TabsContent value="import" className="space-y-6">
          <ProgramListImporter onComplete={() => {
            h.fetchData();
            h.setActiveTab("catalog");
          }} />
          <BulkCourseImporter onComplete={() => {
            h.fetchData();
            h.setActiveTab("catalog");
          }} />
        </TabsContent>

        {/* Programs */}
        <TabsContent value="programs" className="space-y-6">
          <ProgramsTab />
        </TabsContent>

        {/* Knowledge Bank */}
        <TabsContent value="knowledge" className="space-y-6">
          <KnowledgeBankTab />
        </TabsContent>
        <TabsContent value="orders" className="space-y-6">
          <MarketplaceOrdersList orders={h.orders as any} onViewOrder={(order) => { h.setSelectedOrder(order as any); h.setShowOrderDialog(true); }} />
        </TabsContent>


      </Tabs>

      {/* Edit Dialog */}
      <Dialog open={h.showEditDialog} onOpenChange={h.setShowEditDialog}>
        <DialogContent className="rounded-2xl max-w-md">
          <DialogHeader>
            <DialogTitle>Редактировать курс</DialogTitle>
          </DialogHeader>
          {h.editingCourse && (
            <div className="space-y-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Цена для студентов (₽)</Label>
                  <Input
                    type="number"
                    value={h.editingCourse.price_student}
                    onChange={(e) => h.setEditingCourse({ ...h.editingCourse!, price_student: parseFloat(e.target.value) || 0 })}
                    className="rounded-xl"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Цена для организаций (₽)</Label>
                  <Input
                    type="number"
                    value={h.editingCourse.price_organization}
                    onChange={(e) => h.setEditingCourse({ ...h.editingCourse!, price_organization: parseFloat(e.target.value) || 0 })}
                    className="rounded-xl"
                  />
              </div>
              </div>
              <div className="space-y-2">
                <Label>Длительность</Label>
                <Input
                  value={h.editingCourse.course?.duration || ""}
                  onChange={(e) => h.setEditingCourse({ ...h.editingCourse!, course: { ...h.editingCourse!.course!, duration: e.target.value } })}
                  placeholder="40 часов"
                  className="rounded-xl"
                />
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Краткое описание</Label>
                  <Button variant="ghost" size="sm" onClick={async () => {
                    if (!h.editingCourse?.course?.title) { toast.error("Нет названия курса"); return; }
                    setIsGeneratingShortDesc(true);
                    try {
                      const { data, error } = await safeInvoke<any>("generate-course-content", {
                        body: { contentType: "short_description", courseTitle: h.editingCourse.course.title, courseDescription: h.editingCourse.course.description },
                      });
                      if (error) throw error;
                      if (data?.content) h.setEditingCourse({ ...h.editingCourse!, description_short: data.content });
                    } catch { toast.error("Ошибка генерации"); } finally { setIsGeneratingShortDesc(false); }
                  }} disabled={isGeneratingShortDesc}>
                    {isGeneratingShortDesc ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : <Sparkles className="w-3.5 h-3.5 mr-1" />}
                    Сгенерировать с ИИ
                  </Button>
                </div>
                <Textarea
                  value={h.editingCourse.description_short || ""}
                  onChange={(e) => h.setEditingCourse({ ...h.editingCourse!, description_short: e.target.value })}
                  className="rounded-xl"
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button className="w-full btn-gradient rounded-xl" onClick={h.handleEditCourse}>Сохранить</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Order Details Dialog */}
      <Dialog open={h.showOrderDialog} onOpenChange={h.setShowOrderDialog}>
        <DialogContent className="rounded-2xl max-w-md">
          <DialogHeader>
            <DialogTitle>Детали заявки</DialogTitle>
          </DialogHeader>
          {h.selectedOrder && (
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">Курс</p>
                <p className="font-medium">{h.selectedOrder.marketplace_course?.course?.title}</p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">Сумма</p>
                  <p className="font-semibold">{h.selectedOrder.price.toLocaleString()} ₽</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Статус</p>
                  <Badge className={statusLabels[h.selectedOrder.status]?.color}>
                    {statusLabels[h.selectedOrder.status]?.label}
                  </Badge>
                </div>
              </div>
              {h.selectedOrder.notes && (
                <div>
                  <p className="text-sm text-muted-foreground">Комментарий</p>
                  <p className="text-sm">{h.selectedOrder.notes}</p>
                </div>
              )}
              <div className="space-y-2">
                <Label>Изменить статус</Label>
                <Select onValueChange={(v) => h.handleUpdateOrderStatus(h.selectedOrder!.id, v)}>
                  <SelectTrigger className="rounded-xl"><SelectValue placeholder="Выберите статус" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="approved">Одобрить</SelectItem>
                    <SelectItem value="paid">Оплачена</SelectItem>
                    <SelectItem value="completed">Завершена</SelectItem>
                    <SelectItem value="cancelled">Отменить</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
      {/* Create Category Dialog */}
      <Dialog open={h.showCategoryDialog} onOpenChange={h.setShowCategoryDialog}>
        <DialogContent className="rounded-2xl max-w-md">
          <DialogHeader>
            <DialogTitle>Создать категорию</DialogTitle>
            <DialogDescription>Выберите тип программы, введите название и иконку</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Тип программы</Label>
              <Select value={h.newCategoryParentType} onValueChange={h.setNewCategoryParentType}>
                <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Повышение квалификации">Повышение квалификации</SelectItem>
                  <SelectItem value="Профессиональная переподготовка">Профессиональная переподготовка</SelectItem>
                  <SelectItem value="Охрана труда / Пожарная безопасность">Охрана труда / Пожарная безопасность</SelectItem>
                  <SelectItem value="Рабочие профессии">Рабочие профессии</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Название категории</Label>
              <Input
                value={h.newCategoryName}
                onChange={(e) => h.setNewCategoryName(e.target.value)}
                placeholder="Например: Охрана труда"
                className="rounded-xl"
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <Label>Иконка</Label>
              <div className="grid grid-cols-6 gap-2">
                {ICON_OPTIONS.map(opt => {
                  const IconComp = opt.icon;
                  const selected = h.newCategoryIcon === opt.name;
                  return (
                    <button
                      key={opt.name}
                      type="button"
                      className={`flex flex-col items-center gap-1 p-2 rounded-lg border transition-colors ${selected ? 'border-primary bg-primary/10' : 'border-border hover:bg-secondary/50'}`}
                      onClick={() => h.setNewCategoryIcon(selected ? null : opt.name)}
                      title={opt.label}
                    >
                      <IconComp className="w-5 h-5" />
                      <span className="text-[9px] text-muted-foreground leading-tight">{opt.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button
              className="w-full btn-gradient rounded-xl"
              disabled={!h.newCategoryName.trim()}
              onClick={() => h.handleCreateCategory(h.newCategoryName)}
            >
              <FolderPlus className="w-4 h-4 mr-2" />Создать
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Move to Category Dialog */}
      <Dialog open={h.showMoveCategoryDialog} onOpenChange={h.setShowMoveCategoryDialog}>
        <DialogContent className="rounded-2xl max-w-sm">
          <DialogHeader>
            <DialogTitle>Переместить в категорию</DialogTitle>
            <DialogDescription className="truncate">
              {h.movingCourse?.course?.title}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Категория</Label>
              <Select value={h.targetCategory} onValueChange={h.setTargetCategory}>
                <SelectTrigger className="rounded-xl"><SelectValue placeholder="Выберите категорию" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Без категории</SelectItem>
                  {h.dbCategories.map(cat => (
                    <SelectItem key={cat.id} value={cat.id}>
                      <div className="flex items-center gap-2">
                        <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: cat.color || '#888' }} />
                        {cat.name}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button
              className="w-full btn-gradient rounded-xl"
              disabled={!h.targetCategory}
              onClick={() => h.movingCourse && h.handleMoveToCategory(h.movingCourse, h.targetCategory)}
            >
              <FolderInput className="w-4 h-4 mr-2" />Переместить
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk Move Dialog */}
      <Dialog open={showBulkMoveDialog} onOpenChange={setShowBulkMoveDialog}>
        <DialogContent className="rounded-2xl max-w-sm">
          <DialogHeader>
            <DialogTitle>Переместить {selectedCourses.size} {selectedCourses.size === 1 ? 'курс' : selectedCourses.size < 5 ? 'курса' : 'курсов'}</DialogTitle>
            <DialogDescription>
              Выберите категорию для перемещения выбранных курсов
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Категория</Label>
              <Select value={bulkMoveTargetCategory} onValueChange={setBulkMoveTargetCategory}>
                <SelectTrigger className="rounded-xl"><SelectValue placeholder="Выберите категорию" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Без категории</SelectItem>
                  {h.dbCategories.map(cat => (
                    <SelectItem key={cat.id} value={cat.id}>
                      <div className="flex items-center gap-2">
                        <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: cat.color || '#888' }} />
                        {cat.name}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button
              className="w-full btn-gradient rounded-xl"
              disabled={!bulkMoveTargetCategory}
              onClick={handleBulkMove}
            >
              <FolderInput className="w-4 h-4 mr-2" />Переместить ({selectedCourses.size})
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
