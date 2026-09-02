import { useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { CourseLibraryModule, CourseLibraryResource, CourseLibraryResourceInput } from "@/api/courseLibrary";
import { isValidHttpsUrl, type CourseLibraryCategory, type CourseLibraryStatus, type CourseLibraryUsageBasis } from "@/lib/courseLibrary";

type EditableInput = Omit<CourseLibraryResourceInput, "courseId" | "organizationId">;

interface CourseLibraryResourceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  modules: CourseLibraryModule[];
  resource?: CourseLibraryResource | null;
  onSubmit: (input: EditableInput) => Promise<void>;
}
const CATEGORY_OPTIONS: Array<{ value: CourseLibraryCategory; label: string }> = [
  { value: "legal_acts", label: "Нормативные правовые акты" },
  { value: "educational_materials", label: "Учебно-методические материалы" },
  { value: "manufacturer_guides", label: "Инструкции и руководства изготовителей" },
  { value: "additional_resources", label: "Дополнительные информационные ресурсы" },
];

const USAGE_OPTIONS: Array<{ value: CourseLibraryUsageBasis; label: string }> = [
  { value: "official_open_source", label: "Официальный открытый источник" },
  { value: "own_material", label: "Собственный материал" },
  { value: "rights_holder_permission", label: "Разрешение правообладателя" },
];

const STATUS_OPTIONS: Array<{ value: CourseLibraryStatus; label: string }> = [
  { value: "active", label: "Действует" },
  { value: "needs_review", label: "Требует проверки" },
  { value: "archive", label: "Архив" },
];

function toDateInput(value: string | null | undefined): string {
  if (!value) return "";
  return value.slice(0, 10);
}

export function CourseLibraryResourceDialog({
  open,
  onOpenChange,
  modules,
  resource,
  onSubmit,
}: CourseLibraryResourceDialogProps) {
  const editing = Boolean(resource);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<CourseLibraryCategory>("legal_acts");
  const [sourceName, setSourceName] = useState("");
  const [sourceKind, setSourceKind] = useState<"external" | "file">("external");
  const [externalUrl, setExternalUrl] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [moduleId, setModuleId] = useState("course-wide");
  const [editionLabel, setEditionLabel] = useState("");
  const [lastCheckedAt, setLastCheckedAt] = useState("");
  const [usageBasis, setUsageBasis] = useState<CourseLibraryUsageBasis>("official_open_source");
  const [status, setStatus] = useState<CourseLibraryStatus>("active");
  const [sortOrder, setSortOrder] = useState("0");
  const [allowDownload, setAllowDownload] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setTitle(resource?.title ?? "");
    setDescription(resource?.description ?? "");
    setCategory(resource?.category ?? "legal_acts");
    setSourceName(resource?.sourceName ?? "");
    setSourceKind(resource?.storagePath ? "file" : "external");
    setExternalUrl(resource?.externalUrl ?? "");
    setFile(null);
    setModuleId(resource?.moduleId ?? "course-wide");
    setEditionLabel(resource?.editionLabel ?? "");
    setLastCheckedAt(toDateInput(resource?.lastCheckedAt));
    setUsageBasis(resource?.usageBasis ?? "official_open_source");
    setStatus(resource?.status ?? "active");
    setSortOrder(String(resource?.sortOrder ?? 0));
    setAllowDownload(resource?.allowDownload ?? true);
    setError(null);
    setSubmitting(false);
  }, [open, resource]);

  const fileAlreadyStored = editing && Boolean(resource?.storagePath);
  const canSubmit = useMemo(() => {
    if (!title.trim() || !sourceName.trim()) return false;
    if (sourceKind === "external") return isValidHttpsUrl(externalUrl.trim());
    return fileAlreadyStored || Boolean(file);
  }, [externalUrl, file, fileAlreadyStored, sourceKind, sourceName, title]);

  const handleSubmit = async () => {
    if (!canSubmit || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      await onSubmit({
        title: title.trim(),
        description: description.trim() || null,
        category,
        sourceName: sourceName.trim(),
        externalUrl: sourceKind === "external" ? externalUrl.trim() : null,
        file: sourceKind === "file" ? file : null,
        moduleId: moduleId === "course-wide" ? null : moduleId,
        editionLabel: editionLabel.trim() || null,
        lastCheckedAt: lastCheckedAt || null,
        usageBasis,
        status,
        sortOrder: Number.isFinite(Number(sortOrder)) ? Number(sortOrder) : 0,
        allowDownload,
      });
      onOpenChange(false);
    } catch (caught) {
      console.error("[course-library] save failed", caught);
      setError(caught instanceof Error ? caught.message : "Не удалось сохранить ресурс");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !submitting && onOpenChange(next)}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editing ? "Редактировать ресурс" : "Добавить ресурс в библиотеку"}</DialogTitle>
          <DialogDescription>Добавляйте только реально доступные материалы, совпадающие с образовательной программой.</DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2 sm:grid-cols-2">
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="library-title">Название *</Label>
            <Input id="library-title" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Полное название материала" />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="library-description">Краткое описание</Label>
            <Textarea id="library-description" value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Как материал используется в программе" rows={3} />
          </div>

          <div className="space-y-2">
            <Label>Категория *</Label>
            <Select value={category} onValueChange={(value) => setCategory(value as CourseLibraryCategory)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{CATEGORY_OPTIONS.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Связанный модуль</Label>
            <Select value={moduleId} onValueChange={setModuleId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="course-wide">Весь курс</SelectItem>
                {modules.map((module) => <SelectItem key={module.id} value={module.id}>{module.title}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="library-source">Организация или автор источника *</Label>
            <Input id="library-source" value={sourceName} onChange={(event) => setSourceName(event.target.value)} placeholder="МЧС России, учебный центр или изготовитель" />
          </div>

          <div className="space-y-2">
            <Label>Вид ресурса *</Label>
            <Select value={sourceKind} onValueChange={(value) => setSourceKind(value as "external" | "file")} disabled={editing}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="external">Внешняя HTTPS-ссылка</SelectItem>
                <SelectItem value="file">Внутренний файл</SelectItem>
              </SelectContent>
            </Select>
            {editing && <p className="text-xs text-muted-foreground">Тип источника нельзя менять при редактировании. При необходимости архивируйте карточку и создайте новую.</p>}
          </div>
          <div className="space-y-2">
            {sourceKind === "external" ? (
              <>
                <Label htmlFor="library-url">HTTPS-ссылка *</Label>
                <Input id="library-url" type="url" value={externalUrl} onChange={(event) => setExternalUrl(event.target.value)} placeholder="https://..." />
                {externalUrl && !isValidHttpsUrl(externalUrl.trim()) && <p className="text-xs text-destructive">Разрешены только корректные HTTPS-ссылки.</p>}
              </>
            ) : (
              <>
                <Label htmlFor="library-file">Файл *</Label>
                {fileAlreadyStored ? (
                  <p className="rounded-lg border bg-muted/40 px-3 py-2 text-sm">{resource?.originalFilename || "Файл уже загружен"}</p>
                ) : (
                  <Input id="library-file" type="file" onChange={(event) => setFile(event.target.files?.[0] ?? null)} />
                )}
              </>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="library-edition">Дата или редакция документа</Label>
            <Input id="library-edition" value={editionLabel} onChange={(event) => setEditionLabel(event.target.value)} placeholder="Редакция от 01.09.2026" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="library-checked">Последняя проверка доступности</Label>
            <Input id="library-checked" type="date" value={lastCheckedAt} onChange={(event) => setLastCheckedAt(event.target.value)} />
          </div>

          <div className="space-y-2">
            <Label>Основание использования *</Label>
            <Select value={usageBasis} onValueChange={(value) => setUsageBasis(value as CourseLibraryUsageBasis)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{USAGE_OPTIONS.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Статус *</Label>
            <Select value={status} onValueChange={(value) => setStatus(value as CourseLibraryStatus)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{STATUS_OPTIONS.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="library-order">Порядок отображения</Label>
            <Input id="library-order" type="number" value={sortOrder} onChange={(event) => setSortOrder(event.target.value)} />
          </div>
          <label className="flex items-center gap-2 self-end rounded-xl border p-3 text-sm">
            <Checkbox checked={allowDownload} onCheckedChange={(value) => setAllowDownload(value === true)} />
            Разрешить скачивание внутреннего файла
          </label>
        </div>

        {error && <p role="alert" className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>Отмена</Button>
          <Button type="button" onClick={() => void handleSubmit()} disabled={!canSubmit || submitting}>
            {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {editing ? "Сохранить" : "Добавить ресурс"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
