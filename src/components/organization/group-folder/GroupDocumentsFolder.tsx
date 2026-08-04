import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { FileText, Eye, Download, Trash2, Sparkles, ChevronDown, AlertTriangle } from "lucide-react";
import { format } from "date-fns";
import { ru } from "date-fns/locale";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { generateDocument, generatePackage, downloadHtml, previewHtml } from "@/lib/group-docs/generate";
import { reserveGroupDocumentNumbers } from "@/lib/group-docs/documentNumbers";
import { GROUP_DOCUMENT_TYPES } from "@/lib/group-docs/groupDocuments";
import {
  PACKAGE_DOC_TYPES,
  describePackagePlan,
  packageResultMessage,
  shouldGeneratePackageDocs,
  missingDocRequirements,
} from "@/lib/group-docs/packageTypes";
import type { DocType, GenerationContext } from "@/lib/group-docs/schema";
import { useGroupDocuments, type GroupDocumentRow } from "@/hooks/useGroupDocuments";
import { useGroupFactualData } from "@/hooks/useGroupFactualData";
import {
  LEGACY_LAYOUT_FORMAT,
  LEGACY_LAYOUT_NOTICE,
  documentDataReadiness,
  type DocumentFillMode,
} from "@/lib/group-docs/factualData";
import { batchStatusLabel, groupDocumentBatches } from "@/lib/group-docs/factualResolvers";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { GenerateContractDialog } from "./GenerateContractDialog";

interface FolderStudent { user_id: string; full_name: string; email?: string | null }

interface Props {
  organizationId: string;
  groupId: string;
  groupName: string;
  students: FolderStudent[];
  ctx: GenerationContext | null;
  defaultPrice?: number | null;
  /** Незаполненные поля группы/организации, о которых стоит предупредить менеджера. */
  missingFields?: string[];
  /** Критичные незаполненные поля — генерация полностью блокируется. */
  blockingFields?: string[];
  /** Курс, привязанный к группе — подставляется в мастер договора. */
  courseId?: string | null;
  onOpenGroupSettings?: () => void;
  /** Вызывается после генерации/удаления документов — чтобы обновить счётчики папок. */
  onDataChanged?: () => void;
}

/** В отдельном меню — только документы папки «docs». Договоры живут в папке «Договоры». */
const DOC_TYPES = GROUP_DOCUMENT_TYPES.filter(t => t.folder === "docs" && t.key !== "contract");

export function GroupDocumentsFolder({
  organizationId,
  groupId,
  groupName,
  students,
  ctx,
  defaultPrice,
  missingFields = [],
  blockingFields = [],
  courseId = null,
  onOpenGroupSettings,
  onDataChanged,
}: Props) {
  const { documents, loading, saveGenerated, remove } = useGroupDocuments(organizationId, groupId);
  const [price, setPrice] = useState<number>(Number(defaultPrice) || 0);
  const [busy, setBusy] = useState(false);
  const [packageOpen, setPackageOpen] = useState(false);
  const [mode, setMode] = useState<DocumentFillMode>("blank");
  const { factual } = useGroupFactualData(
    organizationId,
    courseId,
    useMemo(() => students.map(s => s.user_id), [students]),
  );

  /** Документы группируются по партии: версия, дата, автор, Текущая/Предыдущая. */
  const batches = useMemo(() => groupDocumentBatches(documents), [documents]);

  const typeTitle = useMemo(() => {
    const map = new Map<string, string>();
    GROUP_DOCUMENT_TYPES.forEach(t => map.set(t.key, t.title));
    return map;
  }, []);

  /** Пакет требует ВСЕХ полей группы: любое незаполненное поле блокирует. */
  const packageBlockers = useMemo(
    () => Array.from(new Set([...blockingFields, ...missingFields])),
    [blockingFields, missingFields],
  );
  const blocked = packageBlockers.length > 0;

  /** Источник для проверки требований конкретного документа. */
  const reqSource = useMemo(() => ({
    org_name: ctx?.organization.name,
    org_director_name: ctx?.organization.director_name,
    group_number: ctx?.group.number,
    program_title: ctx?.group.program_title,
    program_hours: ctx?.group.program_hours,
    start_date: ctx?.group.start_date,
    end_date: ctx?.group.end_date,
    students_count: ctx?.students.length || 0,
  }), [ctx]);

  /** Готовность данных по документам пакета — чтобы честно предупредить менеджера. */
  const readiness = useMemo(
    () =>
      PACKAGE_DOC_TYPES.map(t => ({
        type: t,
        info: documentDataReadiness(t, factual, students.length),
      })).filter((r): r is { type: DocType; info: NonNullable<typeof r.info> } => !!r.info),
    [factual, students.length],
  );

  const run = async (types: DocType[], docBlockers?: string[]) => {
    if (!ctx) { toast.error("Недостаточно данных группы для генерации"); return false; }
    const gate = docBlockers ?? packageBlockers;
    if (gate.length > 0) {
      toast.error("Заполните обязательные данные группы", { description: gate.join(", ") });
      return false;
    }
    if (ctx.students.length === 0) { toast.error("В группе нет учеников"); return false; }

    setBusy(true);
    try {
      // Номера резервируются на сервере ДО генерации. Ошибка нумерации —
      // ничего не сохраняем и не выдаём как final.
      let numbers: Record<string, string> = {};
      try {
        numbers = await reserveGroupDocumentNumbers(types, new Date().getFullYear(), async (seqKey, year) => {
          const { data, error } = await (supabase as any).rpc("get_next_document_number", {
            p_org: organizationId,
            p_doc_type: seqKey,
            p_year: year,
          });
          if (error) throw error;
          return Number(data);
        });
      } catch (e: any) {
        toast.error("Не удалось получить номер документа", {
          description: e?.message || "Автонумерация недоступна — документы не сохранены",
        });
        return false;
      }

      const genOpts = {
        totalPrice: price,
        mode,
        numbers,
        factual: mode === "data" ? factual : null,
        requestedStatus: mode === "data" ? ("final" as const) : ("draft" as const),
      };
      const docs = types.length === 1
        ? [generateDocument(ctx, types[0], genOpts)]
        : generatePackage(ctx, types, genOpts);
      const res = await saveGenerated(docs);
      const ok = !!res;
      if (ok) onDataChanged?.();
      if (ok && types.length === 1) {
        toast.success(`Документ сформирован (версия ${res!.version ?? "—"})`);
      } else if (ok) {
        toast.success(`Пакет сохранён как версия ${res!.version ?? "—"} (текущая)`);
      }
      return ok;
    } catch (e: any) {
      toast.error("Ошибка генерации: " + (e?.message || ""));
      return false;
    } finally {
      setBusy(false);
    }

  };

  /**
   * Пакет: договоры создаёт GenerateContractDialog (сценарии),
   * остальные 9 документов группы генерируются ровно один раз после успеха.
   */
  const handleContractsGenerated = async (result?: { scenario: "individual" | "legal"; count: number }) => {
    const scenario = result?.scenario ?? "individual";
    const count = result?.count ?? 0;
    if (!shouldGeneratePackageDocs({ contractsDone: true, contractCount: count, docsGenerated: false })) {
      toast.error("Договоры не созданы — остальные документы пакета не сформированы");
      return;
    }
    onDataChanged?.();
    const ok = await run(PACKAGE_DOC_TYPES);
    if (ok) toast.success(packageResultMessage(scenario, count, PACKAGE_DOC_TYPES.length));
  };

  const openDoc = (row: GroupDocumentRow, download = false) => {
    if (!row.html) { toast.error("HTML документа не сохранён"); return; }
    const doc = {
      id: row.id,
      doc_type: row.doc_type as DocType,
      name: row.name,
      document_number: row.document_number,
      document_date: row.document_date || "",
      variables: (row.variables || {}) as Record<string, string>,
      html: row.html,
      status: "active" as const,
      created_at: row.created_at,
      doc_status: (row.doc_status === "final" ? "final" : "draft") as "draft" | "final",
      fill_mode: (row.fill_mode === "data" ? "data" : "blank") as "blank" | "data",
      layout_format: row.layout_format || LEGACY_LAYOUT_FORMAT,
      source_note: row.source_note ?? null,
    };
    if (download) downloadHtml(doc); else previewHtml(doc);
  };

  return (
    <div className="space-y-4">
      {missingFields.length > 0 && (
        <Card className="p-4 rounded-2xl border-border bg-muted/40">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-4 h-4 mt-0.5 text-primary shrink-0" />
            <div className="text-sm">
              <div className="font-medium">
                {blocked ? "Генерация недоступна: заполните обязательные данные" : "Заполните данные, чтобы документы были без пропусков"}
              </div>
              <div className="text-muted-foreground mt-0.5">Не заполнено: {missingFields.join(", ")}</div>
              {onOpenGroupSettings && (
                <Button variant="outline" size="sm" className="mt-2 rounded-xl" onClick={onOpenGroupSettings}>
                  Открыть настройки группы
                </Button>
              )}
            </div>
          </div>
        </Card>
      )}

      {/* Режим документа */}
      <Card className="p-4 rounded-2xl border-border">
        <Tabs value={mode} onValueChange={v => setMode(v as DocumentFillMode)}>
          <TabsList className="rounded-xl">
            <TabsTrigger value="blank" className="rounded-lg">Рабочий бланк</TabsTrigger>
            <TabsTrigger value="data" className="rounded-lg">Заполнить по данным Синтагмы</TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="text-xs text-muted-foreground mt-2">
          {mode === "blank"
            ? "Ячейки остаются честно пустыми — документ печатается как бланк и сохраняется со статусом «черновик»."
            : "Значения берутся только из данных Синтагмы: прохождение уроков, результаты тестов, выданные документы. Нет источника — ячейка пустая."}
        </div>
        <div className="text-xs text-muted-foreground mt-1">{LEGACY_LAYOUT_NOTICE}</div>
        {mode === "data" && (
          <div className="mt-3 text-xs space-y-2">
            <div className="font-medium text-foreground">Источники и готовность данных перед генерацией:</div>
            {factual.warnings.map(w => (
              <div key={w} className="text-destructive">· {w}</div>
            ))}
            {readiness.map(r => (
              <div key={r.type} className="rounded-xl border border-border p-2">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-foreground">{typeTitle.get(r.type) || r.type}</span>
                  <Badge variant={r.info.finalBlocked ? "secondary" : "default"} className="rounded-full text-[10px]">
                    {r.info.finalBlocked ? "Черновик" : "Готово к итоговому"}
                  </Badge>
                  <span className="text-muted-foreground">
                    записей: {r.info.recordCount} · охват: {r.info.coverage}
                  </span>
                </div>
                <div className="text-muted-foreground mt-0.5">Источник: {r.info.source}</div>
                {r.info.warning && <div className="text-muted-foreground mt-0.5">{r.info.warning}</div>}
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <Button className="gap-1.5 rounded-xl" disabled={busy || !ctx || blocked} onClick={() => { if (blocked) { toast.error("Заполните обязательные данные группы", { description: packageBlockers.join(", ") }); return; } setPackageOpen(true); }}>
          <Sparkles className="w-4 h-4" /> {busy ? "Генерация…" : "Сгенерировать пакет"}
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" className="gap-1.5 rounded-xl" disabled={busy || !ctx}>
              Отдельный документ <ChevronDown className="w-4 h-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-80">
            {DOC_TYPES.map(t => {
              const docMissing = missingDocRequirements(t.key, reqSource);
              return (
                <DropdownMenuItem
                  key={t.key}
                  className="gap-2"
                  disabled={docMissing.length > 0}
                  onClick={() => run([t.key as DocType], docMissing)}
                >
                  <FileText className="w-4 h-4" />
                  <span className="flex-1">{t.title}</span>
                  {docMissing.length > 0 && (
                    <span className="text-xs text-muted-foreground">нужно: {docMissing[0]}</span>
                  )}
                </DropdownMenuItem>
              );
            })}
          </DropdownMenuContent>
        </DropdownMenu>

        <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <span>Стоимость, ₽</span>
          <Input
            type="number"
            min={0}
            value={price}
            onChange={e => setPrice(Number(e.target.value) || 0)}
            className="w-28 h-9 rounded-xl"
          />
        </div>
        <Badge variant="secondary" className="rounded-full ml-auto">Файлов: {documents.length}</Badge>
      </div>

      <div className="text-xs text-muted-foreground">
        Пакет: сначала выберите сценарий договора — физлицо даёт {describePackagePlan("individual", students.length)},
        компания — {describePackagePlan("legal", students.length)}.
      </div>

      {/* List */}
      <div className="border border-border rounded-2xl bg-card overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-sm text-muted-foreground">Загрузка…</div>
        ) : documents.length === 0 ? (
          <div className="p-10 text-center">
            <FileText className="w-10 h-10 mx-auto text-muted-foreground/60 mb-2" />
            <div className="text-sm text-muted-foreground">
              Документов пока нет. Нажмите «Сгенерировать пакет» — реквизиты подставятся из профиля учебного центра, настроек группы и карточек учеников.
            </div>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {batches.map(batch => (
              <div key={batch.batchId ?? "legacy"}>
                <div className="flex flex-wrap items-center gap-2 px-3 py-2 bg-muted/40 text-xs">
                  <span className="font-medium">{batch.label}</span>
                  <Badge
                    variant={batch.isCurrent ? "default" : "secondary"}
                    className="rounded-full text-[10px]"
                  >
                    {batchStatusLabel(batch)}
                  </Badge>
                  <span className="text-muted-foreground">
                    {format(new Date(batch.createdAt), "d MMM yyyy, HH:mm", { locale: ru })}
                  </span>
                  {batch.createdBy && (
                    <span className="text-muted-foreground">автор: {batch.createdBy.slice(0, 8)}…</span>
                  )}
                  <span className="text-muted-foreground ml-auto">файлов: {batch.rows.length}</span>
                </div>
                <div className="divide-y divide-border">
                  {batch.rows.map(row => (
              <div key={row.id} className="flex items-center gap-3 p-3">
                <div className="w-9 h-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
                  <FileText className="w-4 h-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="font-medium truncate">{row.name}</div>
                  <div className="text-xs text-muted-foreground truncate">
                    {typeTitle.get(row.doc_type) || row.doc_type}
                    {row.document_date ? ` · ${format(new Date(row.document_date), "d MMM yyyy", { locale: ru })}` : ""}
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5 mt-1">
                    <Badge variant={row.doc_status === "final" ? "default" : "secondary"} className="rounded-full text-[10px]">
                      {row.doc_status === "final" ? "Итоговый" : "Черновик"}
                    </Badge>
                    <Badge variant="outline" className="rounded-full text-[10px]">
                      {row.fill_mode === "data" ? "По данным Синтагмы" : "Рабочий бланк"}
                    </Badge>
                    {(row.layout_format || LEGACY_LAYOUT_FORMAT) === LEGACY_LAYOUT_FORMAT && (
                      <Badge variant="outline" className="rounded-full text-[10px] text-muted-foreground">
                        макет legacy_html
                      </Badge>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Button size="sm" variant="ghost" className="gap-1" onClick={() => openDoc(row)}>
                    <Eye className="w-3.5 h-3.5" /> Превью
                  </Button>
                  <Button size="sm" variant="ghost" className="gap-1" onClick={() => openDoc(row, true)}>
                    <Download className="w-3.5 h-3.5" />
                  </Button>
                  <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={async () => { await remove(row.id); onDataChanged?.(); }}>
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {packageOpen && (
        <GenerateContractDialog
          organizationId={organizationId}
          groupId={groupId}
          groupName={groupName}
          students={students}
          groupDefaults={{
            courseId: courseId,
            programTitle: ctx?.group.program_title ?? null,
            programHours: ctx?.group.program_hours ?? null,
            programForm: ctx?.group.program_form ?? null,
            price: defaultPrice ?? null,
            startDate: ctx?.group.start_date ?? null,
            endDate: ctx?.group.end_date ?? null,
          }}
          open={packageOpen}
          quick
          onClose={() => setPackageOpen(false)}
          onGenerated={handleContractsGenerated}
        />
      )}
    </div>
  );
}
