import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { openPrivateFile } from "@/utils/storageHelpers";
import { format } from "date-fns";
import { ru } from "date-fns/locale";
import { FileSignature, Upload, Wand2, Download, Trash2, Building2, User, FileText } from "lucide-react";
import { useGroupContracts } from "@/hooks/useGroupContracts";
import { GenerateContractDialog } from "./GenerateContractDialog";
import { UploadContractDialog } from "./UploadContractDialog";
import { UploadTemplateDialog } from "./UploadTemplateDialog";
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
}

export function ContractsFolder({ organizationId, groupId, groupName, students }: Props) {
  const { contracts, loading, refresh, remove } = useGroupContracts(organizationId, groupId);
  const [genOpen, setGenOpen] = useState(false);
  const [upOpen, setUpOpen] = useState(false);
  const [tplOpen, setTplOpen] = useState(false);
  const [toDelete, setToDelete] = useState<string | null>(null);

  const stats = useMemo(() => ({
    total: contracts.length,
    individual: contracts.filter(c => c.counterparty_type === "individual").length,
    legal: contracts.filter(c => c.counterparty_type === "legal").length,
  }), [contracts]);

  const openFile = async (path: string | null) => {
    if (!path) return;
    await openPrivateFile("billing-documents", path);
  };

  return (
    <div className="space-y-4">
      {/* Actions */}
      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={() => setGenOpen(true)} className="gap-1.5 rounded-xl">
          <FileSignature className="w-4 h-4" /> Сгенерировать договор
        </Button>
        <Button variant="outline" onClick={() => setUpOpen(true)} className="gap-1.5 rounded-xl">
          <Upload className="w-4 h-4" /> Загрузить готовый
        </Button>
        <Button variant="ghost" onClick={() => setTplOpen(true)} className="gap-1.5 rounded-xl">
          <Wand2 className="w-4 h-4" /> Загрузить шаблон
        </Button>
        <div className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
          <Badge variant="secondary" className="rounded-full">Всего: {stats.total}</Badge>
          <Badge variant="secondary" className="rounded-full gap-1"><User className="w-3 h-3" />{stats.individual}</Badge>
          <Badge variant="secondary" className="rounded-full gap-1"><Building2 className="w-3 h-3" />{stats.legal}</Badge>
        </div>
      </div>

      {/* List */}
      <div className="border border-border rounded-2xl bg-card overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-sm text-muted-foreground">Загрузка…</div>
        ) : contracts.length === 0 ? (
          <div className="p-10 text-center">
            <FileText className="w-10 h-10 mx-auto text-muted-foreground/60 mb-2" />
            <div className="text-sm text-muted-foreground mb-3">В папке ещё нет договоров</div>
            <div className="flex items-center justify-center gap-2">
              <Button size="sm" onClick={() => setGenOpen(true)} className="gap-1.5"><FileSignature className="w-4 h-4" />Сгенерировать</Button>
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
                  <TableCell className="font-medium">{c.name}</TableCell>
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
                      <Button size="sm" variant="ghost" className="gap-1" disabled={!c.file_path} onClick={() => openFile(c.file_path)}>
                        <Download className="w-3.5 h-3.5" /> Открыть
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

      <GenerateContractDialog
        organizationId={organizationId}
        groupId={groupId}
        groupName={groupName}
        students={students}
        open={genOpen}
        onClose={() => setGenOpen(false)}
        onGenerated={refresh}
      />
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
              onClick={async () => { if (toDelete) { await remove(toDelete); setToDelete(null); } }}
            >Удалить</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
