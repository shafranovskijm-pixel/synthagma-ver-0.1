import { useMemo, useState } from "react";
import {
  AlertTriangle,
  BookOpen,
  ExternalLink,
  FileText,
  Loader2,
  RefreshCw,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCourseLibrary } from "@/hooks/useCourseLibrary";
import {
  filterResourcesByModule,
  sortLibraryResources,
  type CourseLibraryCategory,
} from "@/lib/courseLibrary";
import type { CourseLibraryResource } from "@/api/courseLibrary";

const CATEGORY_ORDER: CourseLibraryCategory[] = [
  "legal_acts",
  "educational_materials",
  "manufacturer_guides",
  "additional_resources",
];

const CATEGORY_LABELS: Record<CourseLibraryCategory, string> = {
  legal_acts: "Нормативные правовые акты",
  educational_materials: "Учебно-методические материалы",
  manufacturer_guides: "Инструкции и руководства изготовителей",
  additional_resources: "Дополнительные информационные ресурсы",
};

function formatDate(value: string | null): string | null {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString("ru-RU");
}

function LibraryResourceCard({
  resource,
  onOpen,
}: {
  resource: CourseLibraryResource;
  onOpen: (resource: CourseLibraryResource) => Promise<void>;
}) {
  const [opening, setOpening] = useState(false);
  const temporarilyUnavailable = !resource.externalUrl && !resource.storagePath;

  const handleOpen = async () => {
    if (opening || temporarilyUnavailable) return;
    setOpening(true);
    try {
      await onOpen(resource);
    } finally {
      setOpening(false);
    }
  };

  return (
    <article className="rounded-2xl border bg-card p-4 shadow-sm" data-testid={`library-resource-${resource.libraryDocumentId}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-semibold leading-snug">{resource.title}</h3>
          {resource.description && (
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{resource.description}</p>
          )}
        </div>
        {resource.status === "needs_review" && (
          <Badge variant="outline" className="shrink-0 border-amber-300 bg-amber-50 text-amber-800">
            Требует проверки
          </Badge>
        )}
      </div>

      <dl className="mt-3 grid gap-1.5 text-xs text-muted-foreground sm:grid-cols-2">
        <div><dt className="inline font-medium text-foreground">Источник: </dt><dd className="inline">{resource.sourceName}</dd></div>
        {resource.editionLabel && <div><dt className="inline font-medium text-foreground">Редакция: </dt><dd className="inline">{resource.editionLabel}</dd></div>}
        {resource.moduleTitle && <div><dt className="inline font-medium text-foreground">Модуль: </dt><dd className="inline">{resource.moduleTitle}</dd></div>}
        {!resource.moduleTitle && <div><dt className="inline font-medium text-foreground">Раздел: </dt><dd className="inline">Весь курс</dd></div>}
        {resource.lastCheckedAt && <div><dt className="inline font-medium text-foreground">Проверено: </dt><dd className="inline">{formatDate(resource.lastCheckedAt)}</dd></div>}
      </dl>

      {temporarilyUnavailable ? (
        <div className="mt-4 flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          Ресурс временно недоступен. Обратитесь в учебный центр.
        </div>
      ) : (
        <Button type="button" variant="outline" className="mt-4 w-full sm:w-auto" onClick={handleOpen} disabled={opening}>
          {opening ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : resource.externalUrl ? <ExternalLink className="mr-2 h-4 w-4" /> : <FileText className="mr-2 h-4 w-4" />}
          {opening ? "Открываем…" : resource.externalUrl ? "Перейти к источнику" : "Открыть материал"}
        </Button>
      )}
    </article>
  );
}

export function CourseLibraryReader({
  courseId,
  previewData,
}: {
  courseId: string;
  previewData?: {
    resources: CourseLibraryResource[];
    modules: Array<{ id: string; title: string; orderIndex: number }>;
  };
}) {
  const live = useCourseLibrary(previewData ? undefined : courseId);
  const resources = previewData?.resources ?? live.resources;
  const modules = previewData?.modules ?? live.modules;
  const loading = previewData ? false : live.loading;
  const error = previewData ? null : live.error;
  const refresh = live.refresh;
  const getOpenUrl = live.getOpenUrl;
  const [moduleFilter, setModuleFilter] = useState("all");

  const visibleResources = useMemo(() => {
    const activeResources = resources.filter((resource) => resource.status === "active");
    return sortLibraryResources(filterResourcesByModule(activeResources, moduleFilter));
  }, [moduleFilter, resources]);

  const byCategory = useMemo(() => {
    const result = new Map<CourseLibraryCategory, CourseLibraryResource[]>();
    for (const category of CATEGORY_ORDER) result.set(category, []);
    for (const resource of visibleResources) result.get(resource.category)?.push(resource);
    return result;
  }, [visibleResources]);

  const openResource = async (resource: CourseLibraryResource) => {
    const pendingWindow = window.open("about:blank", "_blank");
    if (pendingWindow) pendingWindow.opener = null;
    try {
      if (!pendingWindow) throw new Error("Браузер заблокировал новое окно");
      const url = await getOpenUrl(resource);
      pendingWindow.location.replace(url);
    } catch (caught) {
      pendingWindow?.close();
      const message = caught instanceof Error ? caught.message : "Ресурс временно недоступен";
      toast.error(message);
    }
  };

  if (loading) {
    return <div className="flex min-h-64 items-center justify-center text-muted-foreground"><Loader2 className="mr-2 h-5 w-5 animate-spin" />Загружаем библиотеку…</div>;
  }

  if (error) {
    return (
      <div className="mx-auto max-w-xl rounded-2xl border border-destructive/30 bg-destructive/5 p-6 text-center">
        <AlertTriangle className="mx-auto mb-3 h-8 w-8 text-destructive" />
        <p>{error}</p>
        <Button type="button" variant="outline" className="mt-4" onClick={() => void refresh()}><RefreshCw className="mr-2 h-4 w-4" />Повторить</Button>
      </div>
    );
  }

  return (
    <section className="mx-auto max-w-5xl space-y-6" aria-labelledby="course-library-title">
      <div className="rounded-2xl border bg-gradient-to-br from-primary/10 via-background to-background p-5 sm:p-6">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <div className="mb-2 flex items-center gap-2 text-primary"><BookOpen className="h-5 w-5" /><span className="text-sm font-medium">Материалы курса</span></div>
            <h1 id="course-library-title" className="text-2xl font-bold">Электронная библиотека</h1>
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground">Официальные источники и учебные материалы, предусмотренные программой курса.</p>
          </div>
          {modules.length > 0 && (
            <div className="w-full sm:w-72">
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground" htmlFor="library-module-filter">Фильтр по модулю</label>
              <Select value={moduleFilter} onValueChange={setModuleFilter}>
                <SelectTrigger id="library-module-filter"><SelectValue placeholder="Все модули" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Все модули</SelectItem>
                  {modules.map((module) => <SelectItem key={module.id} value={module.id}>{module.title}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
      </div>

      {visibleResources.length === 0 ? (
        <div className="rounded-2xl border border-dashed p-10 text-center text-muted-foreground">
          <BookOpen className="mx-auto mb-3 h-10 w-10 opacity-50" />
          <p className="font-medium text-foreground">Материалы пока не добавлены</p>
          <p className="mt-1 text-sm">Учебный центр наполнит библиотеку только проверенными ресурсами.</p>
        </div>
      ) : (
        CATEGORY_ORDER.map((category) => {
          const categoryResources = byCategory.get(category) ?? [];
          if (categoryResources.length === 0) return null;
          return (
            <section key={category} className="space-y-3" aria-labelledby={`library-category-${category}`}>
              <div className="flex items-center justify-between gap-3">
                <h2 id={`library-category-${category}`} className="text-lg font-semibold">{CATEGORY_LABELS[category]}</h2>
                <Badge variant="secondary">{categoryResources.length}</Badge>
              </div>
              <div className="grid gap-3 lg:grid-cols-2">
                {categoryResources.map((resource) => <LibraryResourceCard key={resource.assignmentId} resource={resource} onOpen={openResource} />)}
              </div>
            </section>
          );
        })
      )}
    </section>
  );
}
