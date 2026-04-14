import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Upload, FileSpreadsheet, Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { safeInvoke } from "@/utils/safeInvoke";
import { showLimitToast } from "@/utils/limitToast";
import * as XLSX from "xlsx";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companyId: string;
  organizationId: string;
  onImportComplete: () => void;
}

interface ImportRow {
  full_name: string;
  email?: string;
  status?: "pending" | "success" | "error";
  error?: string;
}

export function EmployeeImportDialog({ open, onOpenChange, companyId, organizationId, onImportComplete }: Props) {
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [done, setDone] = useState(false);

  const handleFileUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const wb = XLSX.read(evt.target?.result, { type: "binary" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const data = XLSX.utils.sheet_to_json<Record<string, any>>(ws);

        const parsed: ImportRow[] = data
          .map((row) => {
            const name = row["ФИО"] || row["full_name"] || row["Имя"] || row["Name"] || Object.values(row)[0];
            const email = row["Email"] || row["email"] || row["Почта"] || row["E-mail"] || undefined;
            return name ? { full_name: String(name).trim(), email: email ? String(email).trim() : undefined, status: "pending" as const } : null;
          })
          .filter(Boolean) as ImportRow[];

        setRows(parsed);
        setDone(false);
        setProgress(0);
      } catch {
        toast.error("Ошибка", { description: Не удалось прочитать файл });
      }
    };
    reader.readAsBinaryString(file);
  }, [toast]);

  const handleImport = async () => {
    setImporting(true);

    // Pre-check student limit
    const { data: currentCount } = await supabase.rpc('count_org_students', { org_id: organizationId });
    const { data: orgData } = await supabase
      .from('organizations')
      .select('subscription_plan')
      .eq('id', organizationId)
      .single();

    const planLimits: Record<string, number> = { free: 10, start: 100, standard: 200, professional: 1000, maximum: -1 };
    const maxStudents = planLimits[orgData?.subscription_plan || 'free'] ?? 10;
    const count = Number(currentCount) || 0;

    if (maxStudents !== -1 && count + rows.length > maxStudents) {
      showLimitToast(`Превышен лимит учеников. Текущий тариф позволяет ${maxStudents} учеников. Сейчас: ${count}, импорт: ${rows.length}.`);
      setImporting(false);
      return;
    }

    const updated = [...rows];

    for (let i = 0; i < updated.length; i++) {
      try {
        const { error } = await safeInvoke<any>("register-student", {
          body: {
            full_name: updated[i].full_name,
            email: updated[i].email || undefined,
            organization_id: organizationId,
            company_id: companyId,
          },
        });
        if (error) throw error;
        updated[i].status = "success";
      } catch (err: any) {
        updated[i].status = "error";
        updated[i].error = err.message || "Ошибка";
      }
      setRows([...updated]);
      setProgress(Math.round(((i + 1) / updated.length) * 100));
    }

    setImporting(false);
    setDone(true);
    onImportComplete();
    toast.success("Импорт завершён", { description: Успешно: ${updated.filter((r) => r.status === });
  };

  const handleClose = (v: boolean) => {
    if (!importing) {
      setRows([]);
      setProgress(0);
      setDone(false);
      onOpenChange(v);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="w-5 h-5" />
            Импорт сотрудников из Excel
          </DialogTitle>
        </DialogHeader>

        {rows.length === 0 ? (
          <div className="flex flex-col items-center gap-4 py-12">
            <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center">
              <Upload className="w-8 h-8 text-primary" />
            </div>
            <p className="text-muted-foreground text-sm text-center">
              Загрузите файл Excel (.xlsx) или CSV с колонками:<br />
              <strong>ФИО</strong> (обязательно), <strong>Email</strong> (необязательно)
            </p>
            <label className="cursor-pointer">
              <input type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleFileUpload} />
              <Button asChild variant="outline" className="gap-2">
                <span>
                  <Upload className="w-4 h-4" />
                  Выбрать файл
                </span>
              </Button>
            </label>
          </div>
        ) : (
          <>
            {importing && (
              <div className="space-y-2">
                <Progress value={progress} className="h-2" />
                <p className="text-xs text-muted-foreground text-center">{progress}% — импорт...</p>
              </div>
            )}
            <div className="flex-1 overflow-y-auto border rounded-xl">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>#</TableHead>
                    <TableHead>ФИО</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Статус</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row, i) => (
                    <TableRow key={i}>
                      <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                      <TableCell className="font-medium">{row.full_name}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{row.email || "—"}</TableCell>
                      <TableCell>
                        {row.status === "success" && <CheckCircle2 className="w-4 h-4 text-green-500" />}
                        {row.status === "error" && (
                          <span className="flex items-center gap-1 text-destructive text-xs">
                            <AlertCircle className="w-4 h-4" /> {row.error}
                          </span>
                        )}
                        {row.status === "pending" && <span className="text-xs text-muted-foreground">Ожидание</span>}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <div className="flex justify-between items-center pt-2">
              <p className="text-sm text-muted-foreground">Найдено: {rows.length} записей</p>
              {!done ? (
                <Button onClick={handleImport} disabled={importing} className="gap-2">
                  {importing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                  {importing ? "Импорт..." : "Начать импорт"}
                </Button>
              ) : (
                <Button variant="outline" onClick={() => handleClose(false)}>Закрыть</Button>
              )}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
