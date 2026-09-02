import { useMemo, useState } from "react";
import {
  Archive,
  BookOpen,
  Download,
  ExternalLink,
  FileText,
  Loader2,
  Pencil,
  Plus,
  Printer,
  RefreshCw,
} from "lucide-react";
import { toast } from "sonner";
import {
  archiveCourseLibraryResource,
  createCourseLibraryResource,
  updateCourseLibraryResource,
  type CourseLibraryResource,
  type CourseLibraryResourceInput,
} from "@/api/courseLibrary";
import { CourseLibraryResourceDialog } from "@/components/course-library/CourseLibraryResourceDialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useCourseLibrary } from "@/hooks/useCourseLibrary";
import { useStaffPermissions } from "@/hooks/useStaffPermissions";
import { courseLibraryToCsv, sortLibraryResources } from "@/lib/courseLibrary";

const CATEGORY_LABELS: Record<string, string> = {
  legal_acts: "Нормативные правовые акты",
  educational_materials: "Учебно-методические материалы",
  manufacturer_guides: "Инструкции и руководства изготовителей",
  additional_resources: "Дополнительные информационные ресурсы",
};

const STATUS_LABELS: Record<string, string> = {
  active: "Действует",
  needs_review: "Требует проверки",
  archive: "Архив",
};

type DialogInput = Omit<CourseLibraryResourceInput, "courseId" | "organizationId">;

function downloadCsv(filename: string, csv: string) {
  const blob = new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function printLibrary(courseName: string, resources: CourseLibraryResource[]) {
  const printWindow = window.open("about:blank", "_blank");
  if (!printWindow) throw new Error("Браузер заблокировал окно печати");
  printWindow.opener = null;
  const doc = printWindow.document;
  doc.title = `Электронная библиотека — ${courseName}`;
  const style = doc.createElement("style");
  style.textContent = "body{font-family:Arial,sans-serif;margin:24px;color:#111}h1{font-size:20px}table{width:100%;border-collapse:collapse;font-size:11px}th,td{border:1px solid #aaa;padding:6px;vertical-align:top}th{background:#eee;text-align:left}@media print{body{margin:0}}";
  doc.head.appendChild(style);
  const heading = doc.createElement("h1");
  heading.textContent = `Электронная библиотека — ${courseName}`;
  doc.body.appendChild(heading);
  const note = doc.createElement("p");
  note.textContent = `Сформировано: ${new Date().toLocaleDateString("ru-RU")}. Ресурсов: ${resources.length}.`;
  doc.body.appendChild(note);
  const table = doc.createElement("table");
  const headers = ["№", "Название", "Категория", "Источник", "Модуль", "Редакция", "Проверено", "Статус", "Ссылка/файл"];
  const headerRow = table.insertRow();
  for (const header of headers) {
    const cell = doc.createElement("th");
    cell.textContent = header;
    headerRow.appendChild(cell);
  }
  resources.forEach((resource, index) => {
    const row = table.insertRow();
    const values = [
      String(index + 1),
      resource.title,
      CATEGORY_LABELS[resource.category] ?? resource.category,
      resource.sourceName,
      resource.moduleTitle ?? "Весь курс",
      resource.editionLabel ?? "",
      resource.lastCheckedAt?.slice(0, 10) ?? "",
      STATUS_LABELS[resource.status] ?? resource.status,
      resource.externalUrl ?? resource.originalFilename ?? resource.storagePath ?? "Недоступно",
    ];
    for (const value of values) {
      const cell = row.insertCell();
      cell.textContent = value;
    }
  });
  doc.body.appendChild(table);
  printWindow.focus();
  printWindow.print();
}

export function CourseLibraryManager({
  courseId,
  courseName,
  organizationId,
  previewData,
  previewCanWrite,
}: {
  courseId: string;
  courseName: string;
  organizationId: string;
  previewData?: {
    resources: CourseLibraryResource[];
    modules: Array<{ id: string; title: string; orderIndex: number }>;
  };
  previewCanWrite?: boolean;
}) {
  const { can } = useStaffPermissions();
  const canWrite = previewCanWrite ?? can("library.write");
  const live = useCourseLibrary(previewData ? undefined : courseId);
  const resources = previewData?.resources ?? live.resources;
  const modules = previewData?.modules ?? live.modules;
  const loading = previewData ? false : live.loading;
  const error = previewData ? null : live.error;
  const refresh = live.refresh;
  const getOpenUrl = live.getOpenUrl;
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<CourseLibraryResource | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const orderedResources = useMemo(() => sortLibraryResources(resources), [resources]);

  const openCreate = () => {
    setEditing(null);
    setDialogOpen(true);
  };

  const openEdit = (resource: CourseLibraryResource) => {
    setEditing(resource);
    setDialogOpen(true);
  };

  const saveResource = async (input: DialogInput) => {
    if (previewData) {
      toast.info("Демонстрационный экран: данные не изменены");
      return;
    }
    if (editing) {
      await updateCourseLibraryResource(editing, input);
      toast.success("Ресурс обновлён");
    } else {
      await createCourseLibraryResource({ ...input, courseId, organizationId });
      toast.success("Ресурс добавлен в библиотеку");
    }
    await refresh();
  };

  const openResource = async (resource: CourseLibraryResource) => {
    setBusyId(resource.assignmentId);
    const pendingWindow = window.open("about:blank", "_blank");
    if (pendingWindow) pendingWindow.opener = null;
    try {
      if (!pendingWindow) throw new Error("Браузер заблокировал новое окно");
      const url = await getOpenUrl(resource);
      pendingWindow.location.replace(url);
    } catch (caught) {
      pendingWindow?.close();
      toast.error(caught instanceof Error ? caught.message : "Ресурс временно недоступен");
    } finally {
      setBusyId(null);
    }
  };

  const archiveResource = async (resource: CourseLibraryResource) => {
    if (previewData) {
      toast.info("Демонстрационный экран: ресурс не архивирован");
      return;
    }
    setBusyId(resource.assignmentId);
    try {
      await archiveCourseLibraryResource(resource);
      toast.success("Ресурс перенесён в архив и больше не виден слушателям");
      await refresh();
    } catch (caught) {
      console.error("[course-library] archive failed", caught);
      toast.error("Не удалось архивировать ресурс");
    } finally {
      setBusyId(null);
    }
  };

  const exportCsv = () => {
    const csv = courseLibraryToCsv(orderedResources, { includeBom: false });
    downloadCsv(`electronic-library-${courseId}.csv`, csv);
  };

  return (
    <section className="space-y-5" aria-labelledby="course-library-manager-title">
      <div className="flex flex-col justify-between gap-4 rounded-2xl border bg-gradient-to-br from-primary/10 via-background to-background p-5 sm:flex-row sm:items-center">
        <div>
          <div className="mb-1 flex items-center gap-2 text-primary"><BookOpen className="h-5 w-5" /><span className="text-sm font-medium">Раздел курса</span></div>
          <h2 id="course-library-manager-title" className="text-2xl font-bold">Электронная библиотека</h2>
          <p className="mt-1 text-sm text-muted-foreground">Один проверяемый перечень ресурсов для курса, образовательной программы и документов ЭИОС.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" onClick={exportCsv} disabled={loading || orderedResources.length === 0}><Download className="mr-2 h-4 w-4" />CSV</Button>
          <Button type="button" variant="outline" onClick={() => printLibrary(courseName, orderedResources)} disabled={loading || orderedResources.length === 0}><Printer className="mr-2 h-4 w-4" />Печать</Button>
          {canWrite && <Button type="button" onClick={openCreate}><Plus className="mr-2 h-4 w-4" />Добавить ресурс</Button>}
        </div>
      </div>

      {!canWrite && (
        <div className="rounded-xl border bg-muted/40 p-3 text-sm text-muted-foreground">Доступ только для чтения. Изменять библиотеку может администратор или редактор курса.</div>
      )}

      {loading && <div className="flex min-h-48 items-center justify-center text-muted-foreground"><Loader2 className="mr-2 h-5 w-5 animate-spin" />Загружаем библиотеку…</div>}
      {!loading && error && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-5 text-center">
          <p>{error}</p>
          <Button type="button" variant="outline" className="mt-3" onClick={() => void refresh()}><RefreshCw className="mr-2 h-4 w-4" />Повторить</Button>
        </div>
      )}
      {!loading && !error && orderedResources.length === 0 && (
        <div className="rounded-2xl border border-dashed p-10 text-center text-muted-foreground">
          <BookOpen className="mx-auto mb-3 h-10 w-10 opacity-50" />
          <p className="font-medium text-foreground">Библиотека курса пока пуста</p>
          <p className="mt-1 text-sm">Добавьте только согласованные и доступные материалы.</p>
          {canWrite && <Button type="button" className="mt-4" onClick={openCreate}><Plus className="mr-2 h-4 w-4" />Добавить первый ресурс</Button>}
        </div>
      )}

      {!loading && !error && orderedResources.length > 0 && (
        <div className="space-y-3">
          {orderedResources.map((resource) => (
            <article key={resource.assignmentId} className="rounded-2xl border bg-card p-4 shadow-sm">
              <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-start">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-semibold">{resource.title}</h3>
                    <Badge variant={resource.status === "archive" ? "secondary" : resource.status === "needs_review" ? "outline" : "default"}>{STATUS_LABELS[resource.status] ?? resource.status}</Badge>
                    <Badge variant="secondary">{CATEGORY_LABELS[resource.category] ?? resource.category}</Badge>
                  </div>
                  {resource.description && <p className="mt-2 text-sm text-muted-foreground">{resource.description}</p>}
                  <div className="mt-3 grid gap-1 text-xs text-muted-foreground sm:grid-cols-2 xl:grid-cols-4">
                    <span><strong className="text-foreground">Источник:</strong> {resource.sourceName}</span>
                    <span><strong className="text-foreground">Модуль:</strong> {resource.moduleTitle ?? "Весь курс"}</span>
                    <span><strong className="text-foreground">Редакция:</strong> {resource.editionLabel || "не указана"}</span>
                    <span><strong className="text-foreground">Проверено:</strong> {resource.lastCheckedAt?.slice(0, 10) || "не проверено"}</span>
                  </div>
                </div>
                <div className="flex shrink-0 flex-wrap gap-2">
                  <Button type="button" variant="outline" size="sm" onClick={() => void openResource(resource)} disabled={busyId === resource.assignmentId || (!resource.externalUrl && !resource.storagePath)}>
                    {busyId === resource.assignmentId ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : resource.externalUrl ? <ExternalLink className="mr-2 h-4 w-4" /> : <FileText className="mr-2 h-4 w-4" />}
                    Проверить
                  </Button>
                  {canWrite && <Button type="button" variant="outline" size="sm" onClick={() => openEdit(resource)}><Pencil className="mr-2 h-4 w-4" />Изменить</Button>}
                  {canWrite && resource.status !== "archive" && <Button type="button" variant="outline" size="sm" onClick={() => void archiveResource(resource)} disabled={busyId === resource.assignmentId}><Archive className="mr-2 h-4 w-4" />В архив</Button>}
                </div>
              </div>
            </article>
          ))}
        </div>
      )}

      <CourseLibraryResourceDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        modules={modules}
        resource={editing}
        onSubmit={saveResource}
      />
    </section>
  );
}
