import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Upload, FileSpreadsheet, Loader2, CheckCircle2, AlertCircle, Clock } from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { supabase } from "@/integrations/supabase/client";
import { safeInvoke } from "@/utils/safeInvoke";
import { toast } from "sonner";
import * as XLSX from "xlsx";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organizationId: string;
  onImportComplete: () => void;
}

interface ImportStudent {
  full_name: string;
  email?: string;
  courses: string[];
  status: "pending" | "importing" | "success" | "error";
  error?: string;
}

export function StudentBulkImportDialog({ open, onOpenChange, organizationId, onImportComplete }: Props) {
  const [rows, setRows] = useState<ImportStudent[]>([]);
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

        const parsed: ImportStudent[] = data
          .map((row) => {
            const name = row["Имя"] || row["ФИО"] || row["Имя и Фамилия"] || row["full_name"] || row["Name"];
            const email = row["Почта"] || row["Email"] || row["email"] || row["E-mail"];
            const coursesRaw = row["Курсы"] || row["courses"] || "";
            
            if (!name && !email) return null;
            
            const courses = String(coursesRaw)
              .split(";")
              .map(c => c.trim())
              .filter(Boolean);

            return {
              full_name: String(name || "").trim() || String(email || "").trim(),
              email: email ? String(email).trim() : undefined,
              courses,
              status: "pending" as const,
            };
          })
          .filter(Boolean) as ImportStudent[];

        setRows(parsed);
        setDone(false);
        setProgress(0);
        toast.success(`Найдено ${parsed.length} учеников`);
      } catch {
        toast.error("Не удалось прочитать файл");
      }
    };
    reader.readAsBinaryString(file);
    e.target.value = "";
  }, []);

  const handleImport = async () => {
    setImporting(true);
    const updated = [...rows];

    // Fetch existing courses for this org to match immediately
    const { data: existingCourses } = await supabase
      .from("courses")
      .select("id, title")
      .eq("organization_id", organizationId);

    const courseMap = new Map<string, string>();
    (existingCourses || []).forEach(c => courseMap.set(c.title.toLowerCase().trim(), c.id));

    for (let i = 0; i < updated.length; i++) {
      updated[i].status = "importing";
      setRows([...updated]);

      try {
        // Register student
        const { data, error } = await safeInvoke<{ userId?: string; user_id?: string }>("register-student", {
          body: {
            full_name: updated[i].full_name,
            email: updated[i].email || undefined,
            organization_id: organizationId,
          },
        });
        if (error) throw error;

        const userId = data?.userId || data?.user_id;
        if (!userId) throw new Error("Не получен user_id");

        // Process courses
        for (const courseTitle of updated[i].courses) {
          const courseId = courseMap.get(courseTitle.toLowerCase().trim());
          
          if (courseId) {
            // Course exists — enroll directly
            await supabase.from("enrollments").upsert({
              user_id: userId,
              course_id: courseId,
              status: "active",
              progress: 0,
              time_spent: 0,
            }, { onConflict: "user_id,course_id" });
          } else {
            // Course doesn't exist yet — create pending enrollment
            await supabase.from("pending_enrollments").insert({
              organization_id: organizationId,
              user_id: userId,
              course_title: courseTitle.trim(),
              status: "pending",
            });
          }
        }

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

    const successCount = updated.filter(r => r.status === "success").length;
    toast.success(`Импорт завершён: ${successCount} из ${updated.length}`);
  };

  const handleClose = (v: boolean) => {
    if (!importing) {
      setRows([]);
      setProgress(0);
      setDone(false);
      onOpenChange(v);
    }
  };

  const totalCourses = rows.reduce((acc, r) => acc + r.courses.length, 0);

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="w-5 h-5" />
            Импорт учеников из Excel
          </DialogTitle>
        </DialogHeader>

        {rows.length === 0 ? (
          <div className="flex flex-col items-center gap-4 py-12">
            <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center">
              <Upload className="w-8 h-8 text-primary" />
            </div>
            <p className="text-muted-foreground text-sm text-center max-w-md">
              Загрузите файл Excel (.xlsx) или CSV с учениками.<br />
              Поддерживаемые колонки: <strong>Имя/ФИО</strong>, <strong>Почта/Email</strong>, <strong>Курсы</strong> (через точку с запятой).<br />
              Если курсы ещё не созданы — ученики будут автоматически зачислены при их появлении.
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

            <div className="flex gap-3 text-sm">
              <Badge variant="outline">Учеников: {rows.length}</Badge>
              <Badge variant="outline">Курсов (всего): {totalCourses}</Badge>
            </div>

            <ScrollArea className="flex-1 border rounded-xl max-h-[50vh]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">#</TableHead>
                    <TableHead>Имя</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Курсы</TableHead>
                    <TableHead className="w-24">Статус</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row, i) => (
                    <TableRow key={i}>
                      <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                      <TableCell className="font-medium">{row.full_name}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{row.email || "—"}</TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {row.courses.slice(0, 2).map((c, j) => (
                            <Badge key={j} variant="secondary" className="text-xs">{c}</Badge>
                          ))}
                          {row.courses.length > 2 && (
                            <Badge variant="outline" className="text-xs">+{row.courses.length - 2}</Badge>
                          )}
                          {row.courses.length === 0 && (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        {row.status === "success" && <CheckCircle2 className="w-4 h-4 text-green-500" />}
                        {row.status === "error" && (
                          <span className="flex items-center gap-1 text-destructive text-xs">
                            <AlertCircle className="w-4 h-4" /> {row.error}
                          </span>
                        )}
                        {row.status === "pending" && <Clock className="w-4 h-4 text-muted-foreground" />}
                        {row.status === "importing" && <Loader2 className="w-4 h-4 animate-spin text-primary" />}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </ScrollArea>

            <div className="flex justify-between items-center pt-2">
              <p className="text-sm text-muted-foreground">
                {!done && `Готово к импорту: ${rows.length} учеников`}
                {done && `Успешно: ${rows.filter(r => r.status === "success").length} из ${rows.length}`}
              </p>
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
