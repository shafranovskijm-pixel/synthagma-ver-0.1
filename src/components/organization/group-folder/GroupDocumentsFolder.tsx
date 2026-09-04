import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { FileText, Eye, Download, Trash2, FileType2, User, ChevronDown, AlertTriangle, RotateCcw, ShieldCheck, UserCheck } from "lucide-react";
import { format } from "date-fns";
import { ru } from "date-fns/locale";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { generateDocument, generatePackage, downloadHtml } from "@/lib/group-docs/generate";
import { reserveGroupDocumentNumbers, typesRequiringReservation } from "@/lib/group-docs/documentNumbers";
import { GROUP_DOCUMENT_TYPES } from "@/lib/groupDocuments";
import {
  PACKAGE_DOC_TYPES,
  describePackagePlan,
  packageResultMessage,
  shouldGeneratePackageDocs,
  missingDocRequirements,
  missingPackageRequirements,
} from "@/lib/group-docs/packageTypes";
import type { DocType, GenerationContext } from "@/lib/group-docs/schema";
import { useGroupDocuments, type GroupDocumentRow } from "@/hooks/useGroupDocuments";
import { useGroupFactualData } from "@/hooks/useGroupFactualData";
import {
  LEGACY_LAYOUT_FORMAT,
  documentDataReadiness,
  type DocumentFillMode,
} from "@/lib/group-docs/factualData";
import { batchStatusLabel, groupDocumentBatches } from "@/lib/group-docs/factualResolvers";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { GenerateContractDialog } from "./GenerateContractDialog";
import { GenerateDocxContractDialog } from "./GenerateDocxContractDialog";
import { generateClassJournalDocx } from "@/lib/group-docs/docxJournal";
import { resolveGroupDocumentClientProfile } from "@/lib/group-docs/clientProfile";
import { downloadPrivateFile } from "@/utils/storageHelpers";
import {
  defaultGoreltechGroupDocumentSignatories,
  defaultGroupDocumentSignatories,
  hasBlankGroupDocumentSignatory,
  signatoriesToGenerationExtras,
  type GroupDocumentSignatories,
} from "@/lib/group-docs/signatories";
import { GoreltechDocumentSignatoriesDialog } from "./GoreltechDocumentSignatoriesDialog";
import { localDateIso } from "@/lib/date/localDate";

interface FolderStudent { user_id: string; full_name: string; email?: string | null }
interface GeneratedContractBatch {
  scenario: "individual" | "legal";
  count: number;
  contractNumbers: string[];
  contractId?: string;
}

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
  /** Поля карточки организации, которые нельзя заполнить в настройках группы. */
  organizationMissingFields?: string[];
  /** Курс, привязанный к группе — подставляется в мастер договора. */
  courseId?: string | null;
  onOpenGroupSettings?: () => void;
  onOpenOrganizationRequisites?: () => void;
  /** Вызывается после генерации/удаления документов — чтобы обновить счётчики папок. */
  onDataChanged?: () => void;
}

/** В отдельном меню — только документы папки «docs». Договоры живут в папке «Договоры». */
const DOC_TYPES = GROUP_DOCUMENT_TYPES.filter(t => t.folder === "docs" && t.key !== "contract");

function savedIssueMessages(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((issue) => {
    if (!issue || typeof issue !== "object" || !("message" in issue)) return [];
    return typeof issue.message === "string" && issue.message.trim() ? [issue.message.trim()] : [];
  });
}

function DocumentFactIssues({ row }: { row: GroupDocumentRow }) {
  const sourceIssues = savedIssueMessages(row.variables_snapshot?.source_issues);
  const messages = [...new Set([
    ...sourceIssues,
    ...savedIssueMessages(row.variables_snapshot?.fact_issues),
  ])];
  if (!messages.length) return null;
  return (
    <div className="mt-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-2 text-xs">
      <Badge variant="outline" className="border-amber-500/40 text-amber-800 dark:text-amber-200">
        Требует проверки
      </Badge>
      {sourceIssues.length > 0 && (
        <p className="mt-1">Источник данных не подтверждён. Пустые поля могут быть следствием ошибки загрузки.</p>
      )}
      <details className="mt-1">
        <summary className="cursor-pointer font-medium">Причины ({messages.length})</summary>
        <ul className="mt-2 list-disc space-y-1 pl-4">
          {messages.map((message) => <li key={message} className="break-words">{message}</li>)}
        </ul>
      </details>
    </div>
  );
}

export function GroupDocumentsFolder({
  organizationId,
  groupId,
  groupName,
  students,
  ctx,
  defaultPrice,
  missingFields = [],
  blockingFields = [],
  organizationMissingFields = [],
  courseId = null,
  onOpenGroupSettings,
  onOpenOrganizationRequisites,
  onDataChanged,
}: Props) {
  const { documents, loading, refresh: refreshDocuments, saveGenerated, remove } = useGroupDocuments(organizationId, groupId);
  const [price, setPrice] = useState<number>(Number(defaultPrice) || 0);
  const [busy, setBusy] = useState(false);
  const [companyPackageOpen, setCompanyPackageOpen] = useState(false);
  const [individualPackageOpen, setIndividualPackageOpen] = useState(false);
  const [previewRow, setPreviewRow] = useState<GroupDocumentRow | null>(null);
  const [deleteRow, setDeleteRow] = useState<GroupDocumentRow | null>(null);
  const [retryPackage, setRetryPackage] = useState<GeneratedContractBatch | null>(null);
  const [mode, setMode] = useState<DocumentFillMode>("blank");
  const [signatoriesOpen, setSignatoriesOpen] = useState(false);
  const [blankSignatoriesConfirmed, setBlankSignatoriesConfirmed] = useState(false);
  const [pendingPackageScenario, setPendingPackageScenario] =
    useState<"legal" | "individual" | "documents" | "validation" | null>(null);
  const documentClientProfile = useMemo(
    () => ctx ? resolveGroupDocumentClientProfile(ctx.organization) : null,
    [ctx],
  );
  const exactGoreltechDocuments = documentClientProfile?.key === "goreltech";
  const defaultSignatory = useMemo(() => ({
    position: exactGoreltechDocuments
      ? documentClientProfile?.groupDocumentManagerPosition || ""
      : ctx?.organization.director_position || "",
    name: ctx?.organization.director_name || "",
  }), [
    ctx?.organization.director_name,
    ctx?.organization.director_position,
    documentClientProfile?.groupDocumentManagerPosition,
    exactGoreltechDocuments,
  ]);
  const defaultSignatories = useMemo(
    () => exactGoreltechDocuments
      ? defaultGoreltechGroupDocumentSignatories(defaultSignatory)
      : defaultGroupDocumentSignatories(defaultSignatory),
    [defaultSignatory, exactGoreltechDocuments],
  );
  const [documentSignatories, setDocumentSignatories] =
    useState<GroupDocumentSignatories>(defaultSignatories);
  useEffect(() => {
    setDocumentSignatories(defaultSignatories);
    setBlankSignatoriesConfirmed(false);
  }, [organizationId, defaultSignatories]);
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
  const typeStatus = useMemo(() => {
    const map = new Map<string, string>();
    GROUP_DOCUMENT_TYPES.forEach(t => map.set(t.key, t.status));
    return map;
  }, []);

  /**
   * В режиме рабочего бланка даты очных занятий разрешено заполнить от руки.
   * Остальные реквизиты остаются обязательными.
   */
  const packageBlockers = useMemo(
    () => {
      // `missingFields` — подсказки из карточки группы. Блокируют только явно
      // критичные поля и требования реально выбранных документов ниже.
      const blockers = new Set(blockingFields);
      if (mode === "blank") blockers.delete("4 даты занятий для журнала");
      return Array.from(blockers);
    },
    [blockingFields, mode],
  );
  const requirementProfile = exactGoreltechDocuments ? "goreltech" : "generic";
  const blankSignatoryBlocker = useMemo(
    () => exactGoreltechDocuments
      && hasBlankGroupDocumentSignatory(documentSignatories)
      && !blankSignatoriesConfirmed
        ? ["подтвердите пустые поля подписантов"]
        : [],
    [blankSignatoriesConfirmed, documentSignatories, exactGoreltechDocuments],
  );
  /** Источник для проверки требований конкретного документа. */
  const reqSource = useMemo(() => ({
    org_name: ctx?.organization.name,
    org_director_name: ctx?.organization.director_name,
    group_number: ctx?.group.number,
    program_title: ctx?.group.program_title,
    program_hours: ctx?.group.program_hours,
    start_date: ctx?.group.start_date,
    end_date: ctx?.group.end_date,
    instructor_name: ctx?.group.instructor_name,
    training_dates_count: ctx?.group.training_dates?.length || 0,
    students_count: ctx?.students.length || 0,
  }), [ctx]);

  const packageRequirements = useMemo(
    () => missingPackageRequirements(PACKAGE_DOC_TYPES, reqSource, mode, requirementProfile),
    [reqSource, mode, requirementProfile],
  );
  const packageDataBlockers = useMemo(
    () => Array.from(new Set([...packageBlockers, ...packageRequirements])),
    [packageBlockers, packageRequirements],
  );
  const dataBlocked = packageDataBlockers.length > 0;
  const hasGroupMissingFields = useMemo(() => {
    const organizationFields = new Set(organizationMissingFields);
    return missingFields.some((field) => !organizationFields.has(field));
  }, [missingFields, organizationMissingFields]);

  const requestPackage = (scenario: "legal" | "individual") => {
    if (packageDataBlockers.length > 0) {
      toast.error("Заполните обязательные данные группы", { description: packageDataBlockers.join(", ") });
      return;
    }
    if (blankSignatoryBlocker.length > 0) {
      setPendingPackageScenario(scenario);
      setSignatoriesOpen(true);
      return;
    }
    if (scenario === "legal") setCompanyPackageOpen(true);
    else setIndividualPackageOpen(true);
  };

  const requestDocumentsRebuild = () => {
    if (packageDataBlockers.length > 0) {
      toast.error("Заполните обязательные данные группы", { description: packageDataBlockers.join(", ") });
      return;
    }
    if (blankSignatoryBlocker.length > 0) {
      setPendingPackageScenario("documents");
      setSignatoriesOpen(true);
      return;
    }
    void run(PACKAGE_DOC_TYPES, packageDataBlockers);
  };

  const requestDocumentsValidation = () => {
    if (packageDataBlockers.length > 0) {
      toast.error("Заполните обязательные данные группы", { description: packageDataBlockers.join(", ") });
      return;
    }
    if (blankSignatoryBlocker.length > 0) {
      setPendingPackageScenario("validation");
      setSignatoriesOpen(true);
      return;
    }
    void run(PACKAGE_DOC_TYPES, packageDataBlockers, undefined, true);
  };

  /** Готовность данных по документам пакета — чтобы честно предупредить менеджера. */
  const readiness = useMemo(
    () =>
      PACKAGE_DOC_TYPES.map(t => ({
        type: t,
        info: documentDataReadiness(t, factual, students.length),
      })).filter((r): r is { type: DocType; info: NonNullable<typeof r.info> } => !!r.info),
    [factual, students.length],
  );

  const run = async (
    types: DocType[],
    docBlockers?: string[],
    contractBasis?: string,
    dryRun = false,
  ) => {
    if (!ctx) { toast.error("Недостаточно данных группы для генерации"); return false; }
    const gate = docBlockers ?? Array.from(new Set([
      ...packageBlockers,
      ...missingPackageRequirements(types, reqSource, mode, requirementProfile),
      ...blankSignatoryBlocker,
    ]));
    if (gate.length > 0) {
      toast.error("Заполните обязательные данные группы", { description: gate.join(", ") });
      return false;
    }
    if (ctx.students.length === 0) { toast.error("В группе нет учеников"); return false; }

    setBusy(true);
    try {
      // Сохранённые факты проверяет сервер. Не резервируем официальные номера
      // до завершения проверок реквизитов и политик итоговой аттестации.
      const requestedStatus = exactGoreltechDocuments
        ? ("draft" as const)
        : mode === "data"
          ? ("final" as const)
          : ("draft" as const);
      const eligibility = {
        mode,
        requestedStatus,
        finalBlocked: (t: DocType) =>
          documentDataReadiness(t, mode === "data" ? factual : null, students.length)?.finalBlocked ?? false,
      };
      // Официальные номера резервируются ТОЛЬКО для документов, которые реально
      // станут final. Бланки/черновики остаются без номера — последовательности
      // не расходуются. Ошибка нумерации — ничего не сохраняем.
      const toReserve = typesRequiringReservation(types, eligibility);
      let numbers: Record<string, string> = {};
      try {
        numbers = await reserveGroupDocumentNumbers(toReserve, new Date().getFullYear(), async (seqKey, year) => {
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

      const generationCtx = {
        ...ctx,
        extras: {
          ...(ctx.extras || {}),
          ...(exactGoreltechDocuments
            ? signatoriesToGenerationExtras(documentSignatories)
            : {}),
          ...(contractBasis ? { contract_basis: contractBasis } : {}),
        },
      };
      // Отдельного подтверждённого поля даты оформления журнала в БД пока нет.
      // Для текущего принудительного draft фиксируем дату сборки отдельно и не
      // подменяем ею даты приказов о зачислении/завершении.
      const journalDraftDate = localDateIso();
      const genOpts = {
        totalPrice: price,
        mode,
        numbers,
        factual: mode === "data" ? factual : null,
        requestedStatus,
        documentDates: { class_journal: journalDraftDate },
      };

      const includeJournal = types.includes("class_journal");
      const generatedTypes = exactGoreltechDocuments
        ? types.filter(type => type !== "class_journal")
        : types;
      const docs = generatedTypes.length === 1
        ? [generateDocument(generationCtx, generatedTypes[0], genOpts)]
        : generatedTypes.length > 1
          ? generatePackage(generationCtx, generatedTypes, genOpts)
          : [];
      const res = exactGoreltechDocuments
        ? await generateClassJournalDocx({
            organizationId,
            groupId,
            studentUserIds: ctx.students.map((student) => student.user_id),
             journalDocumentDate: journalDraftDate,
             fillMode: mode,
             dryRun,
             includeJournal,
            journalSignatory: documentSignatories.class_journal,
            otherDocuments: docs,
          }).then(async result => {
            if (result.dryRun) {
              const warnings = result.warnings || [];
              if (warnings.length) {
                toast.warning("Проверка завершена с замечаниями", {
                  description: `Файлы не сохранены. ${warnings.join(" ")}`,
                });
              } else {
                toast.success("Проверка пройдена: 9 Word-документов собраны без сохранения", {
                  description: "Storage и база данных не изменялись. Контрольные SHA-256 рассчитаны на сервере.",
                });
              }
              return result;
            }
             await refreshDocuments();
            const warnings = result.warnings || [];
            toast.warning("Документы ГОРЭЛТЕХ сохранены как черновики", {
              description: warnings.length
                ? warnings.join(" ")
                : "Итоговый статус станет доступен после серверной сверки всех критических полей.",
            });
            return result;
          })
       : await saveGenerated(docs);
      const ok = !!res;
      if (ok && exactGoreltechDocuments && "dryRun" in res && res.dryRun) return true;
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
   * Пакет: ГОРЭЛТЕХ получает свой клиентский Word-договор, остальные организации —
   * нейтральный договор из собственного/встроенного универсального шаблона.
   * Остальные 9 документов создаются только после подтверждённого сохранения договора.
   */
  const handleContractsGenerated = async (result?: GeneratedContractBatch) => {
    const scenario = result?.scenario ?? "individual";
    const count = result?.count ?? 0;
    const validContractBatch = scenario === "legal" ? count === 1 : count > 0;
    if (!validContractBatch || !shouldGeneratePackageDocs({ contractsDone: true, contractCount: count, docsGenerated: false })) {
      toast.error("Договоры не созданы — остальные документы пакета не сформированы");
      return false;
    }
    try {
      onDataChanged?.();
    } catch (refreshError) {
      // A counter refresh is secondary: the persisted contract must still move
      // into package generation so a retry token can be created if that fails.
      console.error("[GroupDocumentsFolder] counter refresh failed after contract save", refreshError);
    }
    const numbers = result?.contractNumbers || [];
    const contractBasis = numbers.length === 1
      ? `Договор № ${numbers[0]}`
      : numbers.length > 1
        ? `Договоры № ${numbers.join(", ")}`
        : undefined;
    const ok = await run(PACKAGE_DOC_TYPES, undefined, contractBasis);
    if (ok) {
      setRetryPackage(null);
      toast.success(packageResultMessage(scenario, count, PACKAGE_DOC_TYPES.length));
    } else if (result) {
      setRetryPackage(result);
    }
    return ok;
  };

  const retryPackageDocuments = async () => {
    if (!retryPackage) return;
    const numbers = retryPackage.contractNumbers;
    const contractBasis = numbers.length === 1
      ? `Договор № ${numbers[0]}`
      : numbers.length > 1
        ? `Договоры № ${numbers.join(", ")}`
        : undefined;
    const ok = await run(PACKAGE_DOC_TYPES, undefined, contractBasis);
    if (ok) {
      toast.success(packageResultMessage(retryPackage.scenario, retryPackage.count, PACKAGE_DOC_TYPES.length));
      setRetryPackage(null);
    }
  };

  const openDoc = async (row: GroupDocumentRow, download = false) => {
    if (row.layout_format === "docx_ooxml") {
      if (!row.file_path) {
        toast.error("Файл Word недоступен");
        return;
      }
      const downloadName = row.name.toLowerCase().endsWith(".docx") ? row.name : `${row.name}.docx`;
      const ok = await downloadPrivateFile("billing-documents", row.file_path, downloadName);
      if (!ok) {
        toast.error("Не удалось скачать файл Word", {
          description: "Не удалось получить временную ссылку на скачивание. Попробуйте ещё раз.",
        });
        return;
      }
      return;
    }
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
    if (download) downloadHtml(doc); else setPreviewRow(row);
  };

  return (
    <div className="space-y-4">
      {missingFields.length > 0 && (
        <Card className="p-4 rounded-2xl border-border bg-muted/40">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-4 h-4 mt-0.5 text-primary shrink-0" />
            <div className="text-sm">
              <div className="font-medium">
                {dataBlocked ? "Генерация недоступна: заполните обязательные данные" : "Заполните данные, чтобы документы были без пропусков"}
              </div>
              <div className="text-muted-foreground mt-0.5">Не заполнено: {missingFields.join(", ")}</div>
              <div className="text-muted-foreground mt-1">
                Эти данные нужны для формирования документов. Создание курса, зачисление и обучение остаются доступны.
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                {organizationMissingFields.length > 0 && onOpenOrganizationRequisites && (
                  <Button variant="outline" size="sm" className="rounded-xl" onClick={onOpenOrganizationRequisites}>
                    Заполнить реквизиты организации
                  </Button>
                )}
                {hasGroupMissingFields && onOpenGroupSettings && (
                  <Button variant="outline" size="sm" className="rounded-xl" onClick={onOpenGroupSettings}>
                    Открыть настройки группы
                  </Button>
                )}
              </div>
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
            ? "Для очных занятий: ячейки остаются пустыми, чтобы отметки можно было проставить вручную. Документ сохраняется как черновик."
            : "Значения берутся только из данных Синтагмы: прохождение уроков, результаты тестов, выданные документы. Нет источника — ячейка пустая."}
        </div>
        <div className="text-xs text-muted-foreground mt-1">
          {exactGoreltechDocuments
            ? "Все 9 документов формируются из оригинальных Word-файлов ГОРЭЛТЕХ."
            : "Используется нейтральный общий макет Синтагмы с реквизитами вашей организации."}
        </div>
        {exactGoreltechDocuments && (
          <div className="text-xs text-amber-700 dark:text-amber-300 mt-1 space-y-1">
            <div>По умолчанию указана должность «Генеральный директор». Перед формированием проверьте подписанта каждого документа.</div>
            <div className="font-medium">Комплект будет сохранён как черновик без официальных номеров до полной серверной сверки реквизитов.</div>
          </div>
        )}
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
                  <Badge variant={exactGoreltechDocuments || r.info.finalBlocked ? "secondary" : "default"} className="rounded-full text-[10px]">
                    {exactGoreltechDocuments
                      ? "Черновик без официального номера"
                      : r.info.finalBlocked
                        ? "Черновик"
                        : "Готово к итоговому"}
                  </Badge>
                  {!(exactGoreltechDocuments && r.type === "schedule") && <span className="text-muted-foreground">
                    записей: {r.info.recordCount} · охват: {r.info.coverage}
                  </span>}
                </div>
                {exactGoreltechDocuments && r.type === "schedule" ? (
                  <div className="mt-1 space-y-1">
                    <p>Источник: сохранённое расписание в настройках этой группы — до четырёх блоков «дата, время, тема» в оригинальном Word-бланке.</p>
                    <p className="text-muted-foreground">Кнопка «Проверить 9 Word-документов без сохранения» перечитает расписание на сервере. Даты журнала и уроки курса не подставляются вместо него. В рабочем бланке занятия остаются пустыми.</p>
                    {onOpenGroupSettings && <Button type="button" variant="outline" size="sm" onClick={onOpenGroupSettings}>Настроить расписание</Button>}
                  </div>
                ) : <>
                  <div className="text-muted-foreground mt-0.5">Источник: {r.info.source}</div>
                  {r.info.warning && <div className="text-muted-foreground mt-0.5">{r.info.warning}</div>}
                </>}
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <Button className="gap-1.5 rounded-xl" disabled={busy || !ctx || !!retryPackage} onClick={() => requestPackage("legal")}>
          <FileType2 className="w-4 h-4" /> {busy ? "Генерация…" : exactGoreltechDocuments ? "Пакет компании (Word клиента)" : "Пакет компании (универсальный)"}
        </Button>
        <Button variant="outline" className="gap-1.5 rounded-xl" disabled={busy || !ctx || !!retryPackage} onClick={() => requestPackage("individual")}>
          <User className="w-4 h-4" /> Пакет физлица
        </Button>
        {exactGoreltechDocuments && (
          <Button
            variant="outline"
            className="gap-1.5 rounded-xl"
            disabled={busy || !ctx}
            onClick={() => {
              setPendingPackageScenario(null);
              setSignatoriesOpen(true);
            }}
          >
            <UserCheck className="w-4 h-4" /> Подписанты документов
          </Button>
        )}
        <Badge variant="outline" className="rounded-full border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300">
          Beta
        </Badge>
        {exactGoreltechDocuments ? (
          <>
            <Button
              variant="outline"
              className="gap-1.5 rounded-xl"
              disabled={busy || !ctx || !!retryPackage}
              onClick={requestDocumentsValidation}
              title="Сервер соберёт и проверит все девять Word-документов в памяти, не меняя Storage и базу данных"
            >
              <ShieldCheck className="w-4 h-4" />
              Проверить 9 Word-документов без сохранения
            </Button>
            <Button
              variant="outline"
              className="gap-1.5 rounded-xl"
              disabled={busy || !ctx || !!retryPackage}
              onClick={requestDocumentsRebuild}
              title={blankSignatoryBlocker.length > 0
                ? "Сначала откроется проверка подписантов, затем будут пересобраны все девять Word-документов"
                : "Клиентский комплект пересобирается целиком, чтобы все девять файлов имели один снимок данных"}
            >
              <RotateCcw className="w-4 h-4" />
              {blankSignatoryBlocker.length > 0
                ? "Проверить подписантов и пересобрать 9 Word-документов"
                : "Пересобрать 9 Word-документов"}
            </Button>
          </>
        ) : (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" className="gap-1.5 rounded-xl" disabled={busy || !ctx}>
              Отдельный документ <ChevronDown className="w-4 h-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-80">
            {DOC_TYPES.map(t => {
              const docMissing = Array.from(new Set([
                ...missingDocRequirements(t.key, reqSource, mode, requirementProfile),
                ...blankSignatoryBlocker,
              ]));
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
        )}

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
        Компания: {describePackagePlan("legal", students.length)} {exactGoreltechDocuments
          ? "из оригинального Word-шаблона ГОРЭЛТЕХ"
          : "из универсального шаблона организации"}. Физлицо: {describePackagePlan("individual", students.length)}
        через универсальный мастер. Пакетная сборка помечена Beta до повторной проверки полного цикла.
      </div>

      {retryPackage && (
        <Card className="p-4 rounded-2xl border-amber-500/40 bg-amber-500/10">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-sm">
              <div className="font-medium">Договор сохранён, 9 документов группы не обновлены</div>
              <div className="text-muted-foreground mt-0.5">Повтор безопасен: новый договор создаваться не будет.</div>
            </div>
            <Button variant="outline" size="sm" className="rounded-xl gap-1.5" disabled={busy} onClick={retryPackageDocuments}>
              <RotateCcw className="w-3.5 h-3.5" /> Повторить 9 документов
            </Button>
          </div>
        </Card>
      )}

      {/* List */}
      <div className="border border-border rounded-2xl bg-card overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-sm text-muted-foreground">Загрузка…</div>
        ) : documents.length === 0 ? (
          <div className="p-10 text-center">
            <FileText className="w-10 h-10 mx-auto text-muted-foreground/60 mb-2" />
            <div className="text-sm text-muted-foreground">
              Документов пока нет. Выберите {exactGoreltechDocuments
                ? "пакет компании из Word-шаблона ГОРЭЛТЕХ"
                : "универсальный пакет компании"} или пакет физлица — реквизиты подставятся из данных Синтагмы.
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
                    {row.package_batch_id && (
                      <Badge
                        variant={row.is_current !== false ? "default" : "secondary"}
                        className="rounded-full text-[10px]"
                      >
                        {row.is_current !== false ? "Текущая версия" : "Предыдущая версия"}
                      </Badge>
                    )}
                    <Badge variant={row.doc_status === "final" ? "default" : "secondary"} className="rounded-full text-[10px]">
                      {row.doc_status === "final" ? "Итоговый" : "Черновик"}
                    </Badge>
                    <Badge variant="outline" className="rounded-full text-[10px]">
                      {row.fill_mode === "data" ? "По данным Синтагмы" : "Рабочий бланк"}
                    </Badge>
                    {(row.layout_format || LEGACY_LAYOUT_FORMAT) === LEGACY_LAYOUT_FORMAT ? (
                      <Badge variant="outline" className="rounded-full text-[10px] text-muted-foreground">
                        Beta · HTML-макет
                      </Badge>
                    ) : typeStatus.get(row.doc_type) === "beta" ? (
                      <Badge variant="outline" className="rounded-full text-[10px] border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300">
                        Beta · Word · {row.template_version_label || "DOCX"}
                      </Badge>
                    ) : (
                      <Badge variant="default" className="rounded-full text-[10px]">
                        Word клиента · {row.template_version_label || "DOCX"}
                      </Badge>
                    )}
                    {row.layout_format === "docx_ooxml" && row.pdf_status !== "ready" && (
                      <Badge variant="outline" className="rounded-full text-[10px] text-muted-foreground">
                        PDF пока недоступен
                      </Badge>
                    )}
                  </div>
                  <DocumentFactIssues row={row} />
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {row.layout_format === "docx_ooxml" ? (
                    <Button size="sm" variant="ghost" className="gap-1" aria-label={`Скачать Word ${row.name}`} title={`Скачать Word ${row.name}`} onClick={() => openDoc(row, true)}>
                      <Download className="w-3.5 h-3.5" /> Скачать Word
                    </Button>
                  ) : (
                    <>
                      <Button size="sm" variant="ghost" className="gap-1" aria-label={`Открыть ${row.name}`} title={`Открыть ${row.name}`} onClick={() => openDoc(row)}>
                        <Eye className="w-3.5 h-3.5" /> Превью
                      </Button>
                      <Button size="sm" variant="ghost" className="gap-1" aria-label={`Скачать ${row.name}`} title={`Скачать ${row.name}`} onClick={() => openDoc(row, true)}>
                        <Download className="w-3.5 h-3.5" />
                      </Button>
                    </>
                  )}
                  <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" aria-label={`Удалить ${row.name}`} title={`Удалить ${row.name}`} onClick={() => setDeleteRow(row)}>
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

      {companyPackageOpen && exactGoreltechDocuments && (
        <GenerateDocxContractDialog
          organizationId={organizationId}
          groupId={groupId}
          groupName={groupName}
          students={students}
          open={companyPackageOpen}
          onClose={() => setCompanyPackageOpen(false)}
          onGenerated={handleContractsGenerated}
        />
      )}

      {companyPackageOpen && !exactGoreltechDocuments && (
        <GenerateContractDialog
          organizationId={organizationId}
          groupId={groupId}
          groupName={groupName}
          students={students}
          open={companyPackageOpen}
          quick
          fixedScenario="legal"
          groupDefaults={{
            courseId: courseId,
            programTitle: ctx?.group.program_title ?? null,
            programHours: ctx?.group.program_hours ?? null,
            programForm: ctx?.group.program_form ?? null,
            price: defaultPrice ?? null,
            startDate: ctx?.group.start_date ?? null,
            endDate: ctx?.group.end_date ?? null,
          }}
          onClose={() => setCompanyPackageOpen(false)}
          onGenerated={handleContractsGenerated}
        />
      )}

      {individualPackageOpen && (
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
          open={individualPackageOpen}
          quick
          fixedScenario="individual"
          onClose={() => setIndividualPackageOpen(false)}
          onGenerated={handleContractsGenerated}
        />
      )}

      {exactGoreltechDocuments && (
        <GoreltechDocumentSignatoriesDialog
          open={signatoriesOpen}
          onOpenChange={(open) => {
            setSignatoriesOpen(open);
            if (!open) setPendingPackageScenario(null);
          }}
          value={documentSignatories}
          defaultSignatory={defaultSignatory}
          onChange={(value) => {
            setDocumentSignatories(value);
            setBlankSignatoriesConfirmed(false);
          }}
          onConfirm={() => {
            setBlankSignatoriesConfirmed(true);
            setSignatoriesOpen(false);
            if (pendingPackageScenario === "legal") setCompanyPackageOpen(true);
            if (pendingPackageScenario === "individual") setIndividualPackageOpen(true);
            if (pendingPackageScenario === "documents") void run(PACKAGE_DOC_TYPES, packageDataBlockers);
            if (pendingPackageScenario === "validation") {
              void run(PACKAGE_DOC_TYPES, packageDataBlockers, undefined, true);
            }
            setPendingPackageScenario(null);
          }}
        />
      )}

      <Dialog open={!!previewRow} onOpenChange={open => { if (!open) setPreviewRow(null); }}>
        <DialogContent className="max-w-6xl h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>{previewRow?.name || "Предпросмотр документа"}</DialogTitle>
            <DialogDescription>Безопасный предпросмотр HTML-макета внутри Синтагмы.</DialogDescription>
          </DialogHeader>
          <iframe
            title={previewRow?.name || "Предпросмотр документа"}
            srcDoc={previewRow?.html || ""}
            sandbox=""
            className="w-full flex-1 rounded-xl border border-border bg-white"
          />
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteRow} onOpenChange={open => { if (!open) setDeleteRow(null); }}>
        <AlertDialogContent className="rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Удалить документ?</AlertDialogTitle>
            <AlertDialogDescription>
              Документ «{deleteRow?.name}» будет удалён безвозвратно.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-xl">Отмена</AlertDialogCancel>
            <AlertDialogAction
              className="rounded-xl bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={async () => {
                const row = deleteRow;
                if (!row) return;
                const deleted = await remove(row.id);
                if (deleted) onDataChanged?.();
              }}
            >
              Удалить
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
