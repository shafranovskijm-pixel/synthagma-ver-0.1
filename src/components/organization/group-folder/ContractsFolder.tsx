import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { downloadPrivateFile } from "@/utils/storageHelpers";
import { format } from "date-fns";
import { ru } from "date-fns/locale";
import { FileSignature, Upload, Wand2, Download, Trash2, Building2, User, FileText, ChevronDown, Zap, FileDown, Package, Eye, FileType2, AlertTriangle } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";

import { useGroupContracts, type GroupContractRow } from "@/hooks/useGroupContracts";
import { htmlToDocxBlob, htmlDocsToZipBlob, downloadBlob, sanitizeFileName } from "@/lib/docx/htmlToDocx";
import { toast } from "sonner";
import { GenerateContractDialog } from "./GenerateContractDialog";
import { GenerateDocxContractDialog } from "./GenerateDocxContractDialog";
import {
  ContractPreviewDialog,
  canDownloadContractDocx,
  getContractPdfPath,
  isDocxFirstContract,
} from "./ContractPreviewDialog";
import { UploadContractDialog } from "./UploadContractDialog";
import { UploadTemplateDialog } from "./UploadTemplateDialog";
import {
  isGoreltechExactTemplateOrganization,
  type GroupDocumentOrganizationIdentity,
} from "@/lib/group-docs/clientProfile";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface Student { user_id: string; full_name: string; email?: string | null; }

interface Props {
  organizationId: string;
  groupId: string;
  groupName: string;
  students: Student[];
  /** Сервер остаётся источником допуска; это значение управляет только безопасным UI-маршрутом. */
  organization?: GroupDocumentOrganizationIdentity | null;
  /** Вызывается после любого изменения списка договоров — чтобы обновить счётчики папок. */
  onDataChanged?: () => void;
}

export function ContractsFolder({ organizationId, groupId, groupName, students, organization, onDataChanged }: Props) {
  const { contracts, loading, refresh, remove } = useGroupContracts(organizationId, groupId);
  const exactGoreltechDocuments = !!organization && isGoreltechExactTemplateOrganization(organization);
  const refreshAll = async () => { await refresh(); onDataChanged?.(); };
  const [genOpen, setGenOpen] = useState(false);
  const [quickOpen, setQuickOpen] = useState(false);
  const [legalOpen, setLegalOpen] = useState(false);
  const [upOpen, setUpOpen] = useState(false);
  const [docxOpen, setDocxOpen] = useState(false);
  const [tplOpen, setTplOpen] = useState(false);
  const [toDelete, setToDelete] = useState<string | null>(null);
  const [docxBusy, setDocxBusy] = useState(false);
  const [preview, setPreview] = useState<GroupContractRow | null>(null);


  const stats = useMemo(() => ({
    total: contracts.length,
    individual: contracts.filter(c => c.counterparty_type === "individual").length,
    legal: contracts.filter(c => c.counterparty_type === "legal").length,
    legacyLegal: contracts.filter(c => c.counterparty_type === "legal" && c.template_format !== "docx_ooxml").length,
  }), [contracts]);

  const downloadStoredFile = async (
    path: string | null,
    fileName: string,
    unavailableMessage: string,
  ) => {
    if (!path) {
      toast.error(unavailableMessage);
      return;
    }
    const downloaded = await downloadPrivateFile("billing-documents", path, fileName);
    if (!downloaded) {
      toast.error("Не удалось скачать файл", {
        description: "Проверьте разрешение браузера на скачивание и повторите попытку",
      });
    }
  };

  const withHtml = useMemo(() => contracts.filter(c => !!c.body_html && c.template_format !== "docx_ooxml"), [contracts]);

  const isDocxTemplate = isDocxFirstContract;
  const openCompanyContract = () => {
    if (exactGoreltechDocuments) setDocxOpen(true);
    else setLegalOpen(true);
  };

  const downloadDocx = async (row: GroupContractRow) => {
    // Договор из клиентского Word-шаблона уже лежит в приватном bucket'е как DOCX.
    if (isDocxTemplate(row)) {
      if (!row.docx_path) {
        toast.error("Файл договора недоступен");
        return;
      }
      await downloadStoredFile(
        row.docx_path,
        sanitizeFileName(row.name || "Договор", "docx"),
        "Файл договора недоступен",
      );
      return;
    }
    if (!row.body_html) {
      toast.error("Для этого договора нет исходной вёрстки", { description: "DOCX доступен для договоров, сгенерированных из шаблона" });
      return;
    }
    setDocxBusy(true);
    try {
      const blob = await htmlToDocxBlob(row.body_html);
      downloadBlob(blob, sanitizeFileName(row.name || "Договор", "docx"));
    } catch (e: any) {
      toast.error("Не удалось собрать DOCX", { description: e?.message });
    } finally {
      setDocxBusy(false);
    }
  };

  const downloadAllDocx = async () => {
    if (withHtml.length === 0) return;
    setDocxBusy(true);
    try {
      const blob = await htmlDocsToZipBlob(withHtml.map(c => ({ name: c.name || "Договор", html: c.body_html as string })));
      downloadBlob(blob, sanitizeFileName(`Договоры ${groupName}`, "zip"));
    } catch (e: any) {
      toast.error("Не удалось собрать архив", { description: e?.message });
    } finally {
      setDocxBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Actions */}
      <div className="flex flex-wrap items-center gap-2">
        <Button className="gap-1.5 rounded-xl" onClick={openCompanyContract} disabled={students.length === 0}>
          {exactGoreltechDocuments ? <FileType2 className="w-4 h-4" /> : <Building2 className="w-4 h-4" />}
          {exactGoreltechDocuments ? "Договор компании (Word клиента)" : "Договор компании (универсальный)"}
        </Button>
        <Button variant="outline" className="gap-1.5 rounded-xl" onClick={() => setQuickOpen(true)} disabled={students.length === 0}>
          <User className="w-4 h-4" /> Физлицо / универсальный
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" className="gap-1.5 rounded-xl">
              Добавить <ChevronDown className="w-4 h-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-64">
            <DropdownMenuItem onClick={openCompanyContract} className="gap-2" disabled={students.length === 0}>
              {exactGoreltechDocuments ? <FileType2 className="w-4 h-4" /> : <Building2 className="w-4 h-4" />}
              {exactGoreltechDocuments ? "Компания — Word клиента" : "Компания — универсальный договор"}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setQuickOpen(true)} className="gap-2" disabled={students.length === 0}>
              <Zap className="w-4 h-4" /> Физлицо / универсальный договор
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setGenOpen(true)} className="gap-2">
              <FileSignature className="w-4 h-4" /> Универсальный HTML-мастер
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setUpOpen(true)} className="gap-2">
              <Upload className="w-4 h-4" /> Загрузить готовый договор
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => setTplOpen(true)} className="gap-2">
              <Wand2 className="w-4 h-4" /> Загрузить шаблон договора
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        {withHtml.length > 1 && (
          <Button variant="outline" className="gap-1.5 rounded-xl" disabled={docxBusy} onClick={downloadAllDocx}>
            <Package className="w-4 h-4" /> {docxBusy ? "Сбор архива…" : `DOCX архивом (${withHtml.length})`}
          </Button>
        )}
        <div className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">


          <Badge variant="secondary" className="rounded-full">Всего: {stats.total}</Badge>
          <Badge variant="secondary" className="rounded-full gap-1"><User className="w-3 h-3" />{stats.individual}</Badge>
          <Badge variant="secondary" className="rounded-full gap-1"><Building2 className="w-3 h-3" />{stats.legal}</Badge>
        </div>
      </div>

      {exactGoreltechDocuments && stats.legacyLegal > 0 && (
        <div className="flex items-start gap-3 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
          <div>
            <div className="font-medium text-amber-900 dark:text-amber-200">
              {stats.legacyLegal} договор(а) компании создано в старом универсальном HTML-макете
            </div>
            <div className="mt-0.5 text-muted-foreground">
              Это не Word-шаблон клиента. Для нового договора используйте «Договор компании (Word клиента)».
            </div>
          </div>
        </div>
      )}

      {/* List */}
      <div className="border border-border rounded-2xl bg-card overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-sm text-muted-foreground">Загрузка…</div>
        ) : contracts.length === 0 ? (
          <div className="p-10 text-center">
            <FileText className="w-10 h-10 mx-auto text-muted-foreground/60 mb-2" />
            <div className="text-sm text-muted-foreground mb-3">В папке ещё нет договоров</div>
            <div className="flex items-center justify-center gap-2 flex-wrap">
              <Button size="sm" onClick={openCompanyContract} disabled={students.length === 0} className="gap-1.5">
                {exactGoreltechDocuments ? <FileType2 className="w-4 h-4" /> : <Building2 className="w-4 h-4" />}
                {exactGoreltechDocuments ? "Компания — Word клиента" : "Компания — универсальный договор"}
              </Button>
              <Button size="sm" variant="outline" onClick={() => setQuickOpen(true)} disabled={students.length === 0} className="gap-1.5"><User className="w-4 h-4" />Физлицо</Button>
              <Button size="sm" variant="outline" onClick={() => setGenOpen(true)} className="gap-1.5"><FileSignature className="w-4 h-4" />HTML-мастер</Button>
              <Button size="sm" variant="outline" onClick={() => setUpOpen(true)} className="gap-1.5"><Upload className="w-4 h-4" />Загрузить</Button>
            </div>

          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>№</TableHead>
                <TableHead>Название</TableHead>
                <TableHead>Контрагент</TableHead>
                <TableHead>Дата</TableHead>
                <TableHead className="text-right">Действия</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {contracts.map(c => (
                <TableRow key={c.id}>
                  <TableCell className="font-mono text-xs">{c.contract_number || "—"}</TableCell>
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-2">
                      <span>{c.name}</span>
                      {isDocxTemplate(c) && (
                        <Badge
                          variant="outline"
                          className="rounded-full border-amber-500/50 text-[10px] text-amber-700 dark:text-amber-300"
                          title="Word-файл технически сформирован; юридический текст шаблона ГОРЭЛТЕХ ещё не утверждён клиентом"
                        >
                          Beta · Word · {c.template_version_label || "—"}
                        </Badge>
                      )}
                      {!isDocxTemplate(c) && (
                        <Badge
                          variant="outline"
                          className="rounded-full border-amber-500/50 text-[10px] text-amber-700 dark:text-amber-300"
                          title={c.counterparty_type === "legal" ? "Старый универсальный макет — не Word-шаблон клиента" : "Универсальный HTML-шаблон"}
                        >
                          {c.counterparty_type === "legal" ? "Старый HTML · не Word клиента" : "HTML · универсальный"}
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1.5 text-sm">
                      {c.counterparty_type === "legal"
                        ? <Building2 className="w-3.5 h-3.5 text-muted-foreground" />
                        : <User className="w-3.5 h-3.5 text-muted-foreground" />}
                      <span>{c.company_name || c.student_name || "—"}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {c.contract_date ? format(new Date(c.contract_date), "d MMM yyyy", { locale: ru }) : "—"}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="inline-flex gap-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="gap-1"
                        aria-label={`Просмотр договора ${c.name}`}
                        title={getContractPdfPath(c) ? "Просмотр PDF" : "PDF пока недоступен — скачайте DOCX"}
                        disabled={!getContractPdfPath(c)}
                        onClick={() => setPreview(c)}
                      >
                        <Eye className="w-3.5 h-3.5" /> Просмотр
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="gap-1"
                        disabled={!getContractPdfPath(c)}
                        title={isDocxTemplate(c) && c.pdf_status !== "ready" ? "PDF пока недоступен — скачайте DOCX" : "PDF"}
                        onClick={() => downloadStoredFile(
                          getContractPdfPath(c),
                          sanitizeFileName(c.name || "Договор", "pdf"),
                          "PDF пока недоступен",
                        )}
                      >
                        <Download className="w-3.5 h-3.5" /> PDF
                      </Button>
                      <Button size="sm" variant="ghost" className="gap-1" disabled={!canDownloadContractDocx(c) || docxBusy} onClick={() => downloadDocx(c)}>
                        <FileDown className="w-3.5 h-3.5" /> DOCX
                      </Button>
                      <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => setToDelete(c.id)}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      <ContractPreviewDialog
        open={!!preview}
        onOpenChange={(o) => { if (!o) setPreview(null); }}
        contract={preview}
        onDownloadPdf={(c) => downloadStoredFile(
          getContractPdfPath(c),
          sanitizeFileName(c.name || "Договор", "pdf"),
          "PDF пока недоступен",
        )}
        onDownloadDocx={(c) => downloadDocx(c)}
      />

      <GenerateContractDialog
        organizationId={organizationId}
        groupId={groupId}
        groupName={groupName}
        students={students}
        open={genOpen}
        onClose={() => setGenOpen(false)}
        onGenerated={refreshAll}
      />
      {quickOpen && (
        <GenerateContractDialog
          organizationId={organizationId}
          groupId={groupId}
          groupName={groupName}
          students={students}
          open={quickOpen}
          quick
          fixedScenario="individual"
          onClose={() => setQuickOpen(false)}
          onGenerated={refreshAll}
        />
      )}

      {legalOpen && (
        <GenerateContractDialog
          organizationId={organizationId}
          groupId={groupId}
          groupName={groupName}
          students={students}
          open={legalOpen}
          quick
          fixedScenario="legal"
          onClose={() => setLegalOpen(false)}
          onGenerated={refreshAll}
        />
      )}

      {docxOpen && exactGoreltechDocuments && (
        <GenerateDocxContractDialog
          open={docxOpen}
          onClose={() => setDocxOpen(false)}
          organizationId={organizationId}
          groupId={groupId}
          groupName={groupName}
          students={students}
          onGenerated={refreshAll}
        />
      )}

      <UploadContractDialog
        organizationId={organizationId}
        groupId={groupId}
        students={students}
        open={upOpen}
        onClose={() => setUpOpen(false)}
        onUploaded={refresh}
      />
      <UploadTemplateDialog
        organizationId={organizationId}
        open={tplOpen}
        onClose={() => setTplOpen(false)}
      />

      <AlertDialog open={!!toDelete} onOpenChange={o => !o && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Удалить договор?</AlertDialogTitle>
            <AlertDialogDescription>Файл и запись будут удалены безвозвратно.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Отмена</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={async () => { if (toDelete) { await remove(toDelete); setToDelete(null); onDataChanged?.(); } }}
            >Удалить</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
