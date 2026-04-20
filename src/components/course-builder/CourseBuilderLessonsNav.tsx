import { useState, useMemo } from "react";
import { DndContext, closestCenter, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { GripVertical, Menu, FileText, ArrowLeft, Plus, CheckSquare, Presentation, Headphones, MessageSquare, BookCheck, Sparkles, ChevronDown, ChevronRight, MoreVertical, Pencil, Trash2, FolderPlus, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { lessonIcons, lessonColors, type Lesson, type LessonType, type CourseModule } from "@/components/course-builder/LessonTypeConfig";

type LessonTypeOption = { type: LessonType; icon: LucideIcon; label: string; description: string; iconClass: string };

const LESSON_TYPE_OPTIONS: LessonTypeOption[] = [
  { type: "text", icon: FileText, label: "Текст", description: "Форматированный текст с видео, аудио и изображениями. Прикрепляйте файлы для скачивания.", iconClass: "text-primary bg-primary/10" },
  { type: "test", icon: CheckSquare, label: "Тест", description: "Проверка знаний с вариантами ответов, изображениями и пояснениями. Настраиваемый проходной балл.", iconClass: "text-sigma-orange bg-sigma-orange/10" },
  { type: "slider", icon: Presentation, label: "Слайды", description: "Презентация с переключаемыми слайдами. Удобно для пошагового объяснения материала.", iconClass: "text-amber-500 bg-amber-500/10" },
  { type: "audio", icon: Headphones, label: "Аудио", description: "Аудиоурок: подкаст, лекция или интервью. Поддержка фоновой обложки и описания.", iconClass: "text-green-500 bg-green-500/10" },
  { type: "feedback", icon: MessageSquare, label: "Обратная связь", description: "Студент отправляет текстовый ответ — он попадает в чат организации. Урок засчитывается автоматически.", iconClass: "text-blue-500 bg-blue-500/10" },
  { type: "homework", icon: BookCheck, label: "Задание", description: "Домашнее задание с проверкой преподавателем. Студент прикрепляет текст и файлы, ждёт одобрения.", iconClass: "text-indigo-500 bg-indigo-500/10" },
  { type: "ai_avatar", icon: Sparkles, label: "ИИ-преподаватель", description: "Голосовой диалог с ИИ-аватаром на тему урока. По умолчанию ограничен 5 минутами.", iconClass: "text-fuchsia-500 bg-gradient-to-br from-fuchsia-500/10 to-pink-500/10" },
];

interface Props {
  lessons: Lesson[];
  modules?: CourseModule[];
  activeLessonId: string | null;
  sensors: any;
  onDragEnd: (e: DragEndEvent) => void;
  onLessonClick: (id: string) => void;
  onBack?: () => void;
  backLabel?: string;
  embedded?: boolean;
  onAddLesson?: (type: LessonType, moduleId?: string | null) => void;
  onOpenAIDialog?: () => void;
  // Module CRUD
  onCreateModule?: () => void;
  onRenameModule?: (id: string, title: string) => void;
  onDeleteModule?: (id: string, deleteLessons: boolean) => void;
  onToggleModuleCollapsed?: (id: string) => void;
  onCollapseAll?: () => void;
  onExpandAll?: () => void;
}

function SortableNavRow({
  lesson,
  index,
  isActive,
  onClick,
}: {
  lesson: Lesson;
  index: number;
  isActive: boolean;
  onClick: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: lesson.id });
  const Icon = lessonIcons[lesson.type] || FileText;
  const colorClass = lessonColors[lesson.type] || "text-primary bg-primary/10";

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        "group flex items-start gap-2 rounded-xl px-2.5 py-2.5 text-sm transition-all",
        "hover:bg-primary/10 hover:text-primary hover:translate-x-0.5",
        isActive && "bg-primary/15 text-primary",
        isDragging && "opacity-50 shadow-md",
      )}
    >
      <button
        {...attributes}
        {...listeners}
        className="cursor-grab active:cursor-grabbing p-0.5 mt-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
        aria-label="Перетащить"
        onClick={(e) => e.stopPropagation()}
      >
        <GripVertical className="w-3.5 h-3.5 text-muted-foreground" />
      </button>
      <span className="text-xs text-muted-foreground tabular-nums w-5 text-right shrink-0 mt-0.5">{index + 1}.</span>
      <div className={cn("w-6 h-6 rounded-lg flex items-center justify-center shrink-0 mt-0.5", colorClass)}>
        <Icon className="w-3.5 h-3.5" />
      </div>
      <button
        onClick={onClick}
        className="flex-1 text-left font-medium leading-snug min-w-0 line-clamp-2 break-words"
        title={lesson.title}
      >
        {lesson.title || "Без названия"}
      </button>
    </div>
  );
}

function AddLessonButton({
  onAddLesson,
  onOpenAIDialog,
  afterAction,
  variant = "primary",
  moduleId = null,
  label = "Добавить урок",
}: {
  onAddLesson?: (type: LessonType, moduleId?: string | null) => void;
  onOpenAIDialog?: () => void;
  afterAction?: () => void;
  variant?: "primary" | "ghost";
  moduleId?: string | null;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const [selectedType, setSelectedType] = useState<LessonType>("text");

  if (!onAddLesson && !onOpenAIDialog) return null;

  const selected = LESSON_TYPE_OPTIONS.find((o) => o.type === selectedType) ?? LESSON_TYPE_OPTIONS[0];

  const handleConfirm = () => {
    onAddLesson?.(selectedType, moduleId);
    setOpen(false);
    afterAction?.();
  };

  const handleAI = () => {
    onOpenAIDialog?.();
    setOpen(false);
    afterAction?.();
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {variant === "primary" ? (
        <Button size="sm" className="btn-gradient w-full gap-2 rounded-xl shadow-sm" onClick={() => setOpen(true)}>
          <Plus className="w-4 h-4" /> {label}
        </Button>
      ) : (
        <Button
          size="sm"
          variant="ghost"
          className="w-full justify-start gap-2 text-xs text-muted-foreground hover:text-primary hover:bg-primary/5 rounded-lg"
          onClick={() => setOpen(true)}
        >
          <Plus className="w-3.5 h-3.5" /> {label}
        </Button>
      )}

      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Выберите тип занятия</DialogTitle>
          <DialogDescription>
            Каждый тип урока подходит для своих задач — выберите подходящий формат.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {LESSON_TYPE_OPTIONS.map((opt) => {
            const Icon = opt.icon;
            const isActive = opt.type === selectedType;
            return (
              <button
                key={opt.type}
                type="button"
                onClick={() => setSelectedType(opt.type)}
                className={cn(
                  "group flex flex-col items-center justify-center gap-2 rounded-xl border-2 p-4 text-center transition-all",
                  "hover:border-primary/40 hover:bg-primary/5",
                  isActive ? "border-primary bg-primary/10 shadow-sm" : "border-border/60 bg-card",
                )}
              >
                <div className={cn("w-11 h-11 rounded-xl flex items-center justify-center", opt.iconClass)}>
                  <Icon className="w-5 h-5" />
                </div>
                <span className={cn("text-sm font-medium leading-tight", isActive ? "text-primary" : "text-foreground")}>
                  {opt.label}
                </span>
              </button>
            );
          })}
        </div>

        <div className="rounded-xl border border-border/60 bg-muted/30 p-4">
          <p className="text-sm font-semibold text-foreground mb-1">{selected.label}</p>
          <p className="text-sm text-muted-foreground leading-relaxed">{selected.description}</p>
        </div>

        {onOpenAIDialog && (
          <button
            type="button"
            onClick={handleAI}
            className="inline-flex items-center justify-center gap-2 text-sm font-medium text-primary hover:text-primary/80 transition-colors"
          >
            <Sparkles className="w-4 h-4" /> Создать урок с помощью ИИ
          </button>
        )}

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" onClick={() => setOpen(false)}>Отмена</Button>
          <Button className="btn-gradient" onClick={handleConfirm} disabled={!onAddLesson}>Далее</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ModuleHeaderRow({
  module,
  lessonCount,
  onToggle,
  onRename,
  onDelete,
  onCollapseAll,
  onExpandAll,
}: {
  module: CourseModule;
  lessonCount: number;
  onToggle: () => void;
  onRename: (title: string) => void;
  onDelete: (deleteLessons: boolean) => void;
  onCollapseAll?: () => void;
  onExpandAll?: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(module.title);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleteWithLessons, setDeleteWithLessons] = useState(false);

  const commitRename = () => {
    const t = draft.trim() || "Без названия";
    if (t !== module.title) onRename(t);
    setEditing(false);
  };

  return (
    <>
      <div
        className={cn(
          "group flex items-center gap-1 rounded-xl px-2 py-2 text-sm transition-colors",
          "bg-muted/40 hover:bg-muted/60",
        )}
      >
        <button
          onClick={onToggle}
          className="p-1 shrink-0 text-muted-foreground hover:text-primary transition-colors"
          aria-label={module.collapsed ? "Развернуть модуль" : "Свернуть модуль"}
        >
          {module.collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>

        {editing ? (
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commitRename}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitRename();
              if (e.key === "Escape") { setDraft(module.title); setEditing(false); }
            }}
            autoFocus
            className="flex-1 bg-background border border-primary/40 rounded-md px-2 py-1 text-sm font-semibold focus:outline-none focus:ring-1 focus:ring-primary"
          />
        ) : (
          <button
            onClick={onToggle}
            onDoubleClick={() => { setDraft(module.title); setEditing(true); }}
            className="flex-1 text-left font-semibold text-foreground min-w-0 truncate"
            title={module.title}
          >
            {module.title}
          </button>
        )}

        <span className="text-xs text-muted-foreground tabular-nums shrink-0 px-1">{lessonCount}</span>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className="p-1 rounded-md opacity-0 group-hover:opacity-100 hover:bg-background transition-opacity shrink-0"
              onClick={(e) => e.stopPropagation()}
              aria-label="Меню модуля"
            >
              <MoreVertical className="w-4 h-4 text-muted-foreground" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => { setDraft(module.title); setEditing(true); }}>
              <Pencil className="w-4 h-4 mr-2" /> Переименовать
            </DropdownMenuItem>
            {onCollapseAll && (
              <DropdownMenuItem onClick={onCollapseAll}>
                <ChevronRight className="w-4 h-4 mr-2" /> Свернуть все модули
              </DropdownMenuItem>
            )}
            {onExpandAll && (
              <DropdownMenuItem onClick={onExpandAll}>
                <ChevronDown className="w-4 h-4 mr-2" /> Развернуть все модули
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => { setDeleteWithLessons(false); setConfirmOpen(true); }}
              className="text-destructive focus:text-destructive"
            >
              <Trash2 className="w-4 h-4 mr-2" /> Удалить модуль
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Удалить модуль «{module.title}»?</AlertDialogTitle>
            <AlertDialogDescription>
              {lessonCount > 0
                ? `В модуле ${lessonCount} уроков. Выберите, что с ними сделать.`
                : "В модуле нет уроков."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {lessonCount > 0 && (
            <div className="space-y-2 pt-2">
              <label className="flex items-start gap-2 text-sm cursor-pointer">
                <input
                  type="radio"
                  name="del-mode"
                  checked={!deleteWithLessons}
                  onChange={() => setDeleteWithLessons(false)}
                  className="mt-1"
                />
                <span><b>Перенести уроки в корень</b> — модуль удалится, уроки останутся.</span>
              </label>
              <label className="flex items-start gap-2 text-sm cursor-pointer">
                <input
                  type="radio"
                  name="del-mode"
                  checked={deleteWithLessons}
                  onChange={() => setDeleteWithLessons(true)}
                  className="mt-1"
                />
                <span className="text-destructive"><b>Удалить модуль вместе с уроками</b> — действие необратимо.</span>
              </label>
            </div>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel>Отмена</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => { onDelete(deleteWithLessons); setConfirmOpen(false); }}
              className={deleteWithLessons ? "bg-destructive text-destructive-foreground hover:bg-destructive/90" : ""}
            >
              Удалить
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function NavList(props: Props & { afterAction?: () => void }) {
  const {
    lessons, modules = [], activeLessonId, sensors, onDragEnd, onLessonClick,
    onBack, backLabel, onAddLesson, onOpenAIDialog, afterAction,
    onCreateModule, onRenameModule, onDeleteModule, onToggleModuleCollapsed,
    onCollapseAll, onExpandAll,
  } = props;

  const handleClick = (id: string) => {
    onLessonClick(id);
    afterAction?.();
  };

  // Группировка: уроки без модуля + по каждому модулю
  const grouped = useMemo(() => {
    const orphans = lessons.filter(l => !l.module_id);
    const byModule = new Map<string, Lesson[]>();
    for (const m of modules) byModule.set(m.id, []);
    for (const l of lessons) {
      if (l.module_id && byModule.has(l.module_id)) byModule.get(l.module_id)!.push(l);
    }
    return { orphans, byModule };
  }, [lessons, modules]);

  // Глобальный индекс урока в общем списке (для нумерации)
  const lessonIndex = useMemo(() => {
    const map = new Map<string, number>();
    let i = 0;
    grouped.orphans.forEach(l => map.set(l.id, i++));
    for (const m of modules) {
      const arr = grouped.byModule.get(m.id) ?? [];
      arr.forEach(l => map.set(l.id, i++));
    }
    return map;
  }, [grouped, modules]);

  return (
    <div className="flex flex-col h-full">
      {onBack && (
        <button
          onClick={onBack}
          className="flex items-center gap-2 px-4 py-3 border-b border-border/50 text-sm font-medium text-muted-foreground hover:text-primary hover:bg-primary/5 transition-colors shrink-0"
        >
          <ArrowLeft className="w-4 h-4" />
          {backLabel || "Назад к разделам"}
        </button>
      )}

      <div className="px-4 py-3 border-b border-border/50 shrink-0">
        <p className="text-[11px] font-semibold text-muted-foreground/70 uppercase tracking-wider">
          Уроки ({lessons.length})
          {modules.length > 0 && <span className="ml-2 normal-case font-normal">· модулей: {modules.length}</span>}
        </p>
      </div>

      <ScrollArea className="flex-1 min-h-0">
        <div className="p-2 space-y-3">
          {modules.length === 0 ? (
            <div className="flex flex-col items-center justify-center text-center py-10 px-4 gap-3">
              <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center">
                <FolderPlus className="w-6 h-6 text-primary" />
              </div>
              <p className="text-sm font-medium text-foreground">Создайте первый модуль</p>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Уроки добавляются внутрь модулей. Сначала создайте модуль, затем — занятия в нём.
              </p>
            </div>
          ) : (
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
              <SortableContext items={lessons.map((l) => l.id)} strategy={verticalListSortingStrategy}>
                {modules.map((m) => {
                  const items = grouped.byModule.get(m.id) ?? [];
                  return (
                    <div key={m.id} className="space-y-1">
                      <ModuleHeaderRow
                        module={m}
                        lessonCount={items.length}
                        onToggle={() => onToggleModuleCollapsed?.(m.id)}
                        onRename={(title) => onRenameModule?.(m.id, title)}
                        onDelete={(del) => onDeleteModule?.(m.id, del)}
                        onCollapseAll={onCollapseAll}
                        onExpandAll={onExpandAll}
                      />
                      {!m.collapsed && (
                        <div className="pl-3 space-y-0.5 border-l-2 border-border/40 ml-3">
                          {items.map((lesson) => (
                            <SortableNavRow
                              key={lesson.id}
                              lesson={lesson}
                              index={lessonIndex.get(lesson.id) ?? 0}
                              isActive={activeLessonId === lesson.id}
                              onClick={() => handleClick(lesson.id)}
                            />
                          ))}
                          {onAddLesson && (
                            <div className="pt-1.5">
                              <AddLessonButton
                                onAddLesson={onAddLesson}
                                afterAction={afterAction}
                                variant="ghost"
                                moduleId={m.id}
                                label="Занятие"
                              />
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </SortableContext>
            </DndContext>
          )}
        </div>
      </ScrollArea>

      {onCreateModule && (
        <div className="px-3 py-3 border-t border-border/50 shrink-0">
          <Button
            size="lg"
            className="btn-gradient w-full gap-2 rounded-xl shadow-sm h-11 font-semibold"
            onClick={() => { onCreateModule(); afterAction?.(); }}
          >
            <FolderPlus className="w-4 h-4" /> Модуль
          </Button>
        </div>
      )}
    </div>
  );
}

export function CourseBuilderLessonsNav(props: Props) {
  const [mobileOpen, setMobileOpen] = useState(false);

  const stickyTop = props.embedded ? "top-[180px]" : "top-24";
  const stickyMaxH = props.embedded ? "max-h-[calc(100dvh-200px)]" : "max-h-[calc(100dvh-7rem)]";

  return (
    <>
      <aside
        className={cn(
          "hidden lg:flex flex-col sticky self-start w-72 shrink-0 rounded-2xl border border-border/60 bg-gradient-to-b from-card to-muted/20 shadow-sm overflow-hidden",
          stickyTop,
          stickyMaxH,
        )}
      >
        <NavList {...props} />
      </aside>

      <div className="lg:hidden fixed bottom-24 left-4 z-40">
        <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
          <SheetTrigger asChild>
            <Button size="sm" variant="secondary" className="shadow-lg gap-2 rounded-full">
              <Menu className="w-4 h-4" /> Уроки ({props.lessons.length})
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-80 p-0">
            <div className="h-full pt-6">
              <NavList {...props} afterAction={() => setMobileOpen(false)} />
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </>
  );
}
