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

import { generateDocument, generatePackage, downloadHtml, previewHtml } from "@/lib/group-docs/generate";
import { GROUP_DOCUMENT_TYPES } from "@/lib/group-docs/groupDocuments";
import {
  PACKAGE_DOC_TYPES,
  describePackagePlan,
  packageResultMessage,
  shouldGeneratePackageDocs,
} from "@/lib/group-docs/packageTypes";
import type { DocType, GenerationContext } from "@/lib/group-docs/schema";
import { useGroupDocuments, type GroupDocumentRow } from "@/hooks/useGroupDocuments";
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
  onOpenGroupSettings?: () => void;
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
  onOpenGroupSettings,
}: Props) {
  const { documents, loading, saveGenerated, remove } = useGroupDocuments(organizationId, groupId);
  const [price, setPrice] = useState<number>(Number(defaultPrice) || 0);
  const [busy, setBusy] = useState(false);
  const [packageOpen, setPackageOpen] = useState(false);

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
      const docs = types.length === 1
        ? [generateDocument(ctx, types[0], { totalPrice: price })]
        : generatePackage(ctx, types, { totalPrice: price });
      const ok = await saveGenerated(docs);
      if (ok && types.length === 1) toast.success("Документ сформирован");
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

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <Button className="gap-1.5 rounded-xl" disabled={busy || !ctx || blocked} onClick={() => { if (blocked) { toast.error("Заполните обязательные данные группы", { description: blockingFields.join(", ") }); return; } setPackageOpen(true); }}>
          <Sparkles className="w-4 h-4" /> {busy ? "Генерация…" : "Сгенерировать пакет"}
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" className="gap-1.5 rounded-xl" disabled={busy || !ctx || blocked}>
              Отдельный документ <ChevronDown className="w-4 h-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-72">
            {DOC_TYPES.map(t => (
              <DropdownMenuItem key={t.key} className="gap-2" onClick={() => run([t.key as DocType])}>
                <FileText className="w-4 h-4" /> {t.title}
              </DropdownMenuItem>
            ))}
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
            {documents.map(row => (
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
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Button size="sm" variant="ghost" className="gap-1" onClick={() => openDoc(row)}>
                    <Eye className="w-3.5 h-3.5" /> Превью
                  </Button>
                  <Button size="sm" variant="ghost" className="gap-1" onClick={() => openDoc(row, true)}>
                    <Download className="w-3.5 h-3.5" />
                  </Button>
                  <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => remove(row.id)}>
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
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
          open={packageOpen}
          quick
          onClose={() => setPackageOpen(false)}
          onGenerated={handleContractsGenerated}
        />
      )}
    </div>
  );
}
