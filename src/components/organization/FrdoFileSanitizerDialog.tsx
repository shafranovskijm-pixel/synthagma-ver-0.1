import { useCallback, useState } from "react";
import { motion } from "framer-motion";
import { Wand2, UploadCloud, Download, FileSpreadsheet, AlertTriangle, CheckCircle2, FileDown } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { SigmaSpinner } from "@/components/ui/SigmaSpinner";
import { toast } from "sonner";
import { format } from "date-fns";
import {
  parseFrdoXlsx,
  buildCleanRows,
  calcStats,
  getHeadersForType,
  type ParseResult,
  type FrdoSheetType,
} from "@/utils/frdoFileSanitizer";
import { exportFRDOExcel } from "@/utils/frdoExcelExport";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

const fadeUp = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.25 },
};

export function FrdoFileSanitizerDialog({ open, onOpenChange }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [forcedType, setForcedType] = useState<FrdoSheetType | "auto">("auto");
  const [isProcessing, setIsProcessing] = useState(false);
  const [result, setResult] = useState<ParseResult | null>(null);
  const [dragActive, setDragActive] = useState(false);

  const reset = useCallback(() => {
    setFile(null);
    setResult(null);
    setForcedType("auto");
  }, []);

  const handleSelect = (f: File | null) => {
    if (!f) return;
    if (!/\.xlsx$/i.test(f.name)) {
      toast.error("Поддерживается только .xlsx");
      return;
    }
    setFile(f);
    setResult(null);
  };

  const handleProcess = async () => {
    if (!file) return;
    setIsProcessing(true);
    try {
      const r = await parseFrdoXlsx(file, forcedType === "auto" ? undefined : forcedType);
      if (r.matchedColumns < 5) {
        toast.warning(`Распознано только ${r.matchedColumns} колонок. Проверьте, что это файл ФИС ФРДО.`);
      }
      if (r.rows.length === 0) {
        toast.error("Не найдено ни одной строки с данными");
        return;
      }
      setResult(r);
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message || "Не удалось обработать файл");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDownload = async () => {
    if (!result) return;
    try {
      const rows = buildCleanRows(result);
      const suffix = `очищено-${format(new Date(), "dd-MM-yyyy")}`;
      await exportFRDOExcel(rows, result.type, suffix);
      toast.success("Чистый файл скачан");
    } catch (e: any) {
      toast.error(e?.message || "Ошибка экспорта");
    }
  };

  const handleDownloadReport = () => {
    if (!result) return;
    const lines: string[] = ["Строка;Колонка;Было;Стало;Причина"];
    const headers = getHeadersForType(result.type);
    for (const row of result.rows) {
      row.cells.forEach((c, i) => {
        if (c.fixed || c.reason) {
          lines.push(
            [
              row.sourceRowNumber,
              `"${headers[i].replace(/"/g, '""')}"`,
              "",
              `"${String(c.value).replace(/"/g, '""')}"`,
              `"${(c.reason ?? "очищено").replace(/"/g, '""')}"`,
            ].join(";"),
          );
        }
      });
    }
    const blob = new Blob(["\uFEFF" + lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `отчёт-исправлений-${format(new Date(), "dd-MM-yyyy")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const stats = result ? calcStats(result) : null;
  const headers = result ? getHeadersForType(result.type) : [];
  const previewRows = result ? result.rows.slice(0, 20) : [];
  const previewCols = headers.length;
  const [showPreview, setShowPreview] = useState(false);

  // Сводка автозаполнений по причинам
  const autoFillSummary = (() => {
    if (!result) return [] as { reason: string; count: number }[];
    const m = new Map<string, number>();
    for (const row of result.rows) {
      for (const c of row.cells) {
        if (c.fixed && c.reason) {
          m.set(c.reason, (m.get(c.reason) ?? 0) + 1);
        }
      }
    }
    return Array.from(m.entries())
      .map(([reason, count]) => ({ reason, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
  })();

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) reset(); }}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto rounded-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-display">
            <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
              <Wand2 className="w-5 h-5 text-primary" />
            </div>
            Очистка чужого файла ФИС ФРДО
          </DialogTitle>
          <DialogDescription>
            Загрузите Excel, который не принимает система — мы вычистим невидимые символы, нормализуем СНИЛС и даты, и переложим данные в эталонный шаблон.
          </DialogDescription>
        </DialogHeader>

        {/* Шаг 1: Загрузка */}
        {!result && (
          <motion.div {...fadeUp} className="space-y-4">
            <div
              onDragEnter={(e) => { e.preventDefault(); setDragActive(true); }}
              onDragLeave={(e) => { e.preventDefault(); setDragActive(false); }}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                setDragActive(false);
                handleSelect(e.dataTransfer.files?.[0] ?? null);
              }}
              className={`border-2 border-dashed rounded-2xl p-10 text-center transition-colors ${
                dragActive ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"
              }`}
            >
              <UploadCloud className="w-12 h-12 mx-auto mb-3 text-primary" />
              <p className="font-medium mb-1">Перетащите .xlsx сюда</p>
              <p className="text-sm text-muted-foreground mb-4">или выберите файл вручную</p>
              <input
                id="frdo-sanitizer-file"
                type="file"
                accept=".xlsx"
                className="hidden"
                onChange={(e) => handleSelect(e.target.files?.[0] ?? null)}
              />
              <Label htmlFor="frdo-sanitizer-file">
                <Button asChild variant="outline" className="rounded-xl cursor-pointer">
                  <span><FileSpreadsheet className="w-4 h-4" /> Выбрать файл</span>
                </Button>
              </Label>
              {file && (
                <div className="mt-4 inline-flex items-center gap-2 text-sm bg-muted/50 rounded-xl px-3 py-2">
                  <FileSpreadsheet className="w-4 h-4 text-primary" />
                  {file.name}
                </div>
              )}
            </div>

            <div className="bg-muted/30 rounded-xl p-4">
              <Label className="text-sm font-medium mb-2 block">Тип шаблона</Label>
              <RadioGroup value={forcedType} onValueChange={(v: any) => setForcedType(v)} className="flex gap-4">
                <div className="flex items-center gap-2"><RadioGroupItem value="auto" id="t-auto" /><Label htmlFor="t-auto" className="cursor-pointer">Авто-определение</Label></div>
                <div className="flex items-center gap-2"><RadioGroupItem value="dpo" id="t-dpo" /><Label htmlFor="t-dpo" className="cursor-pointer">ДПО (41 колонка)</Label></div>
                <div className="flex items-center gap-2"><RadioGroupItem value="po" id="t-po" /><Label htmlFor="t-po" className="cursor-pointer">ПО (35 колонок)</Label></div>
              </RadioGroup>
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => onOpenChange(false)} className="rounded-xl">Отмена</Button>
              <Button onClick={handleProcess} disabled={!file || isProcessing} className="rounded-xl gap-2">
                {isProcessing ? <SigmaSpinner size="sm" /> : <Wand2 className="w-4 h-4" />}
                Обработать
              </Button>
            </div>
          </motion.div>
        )}

        {/* Шаг 2: Превью + статистика */}
        {result && stats && (
          <motion.div {...fadeUp} className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <StatCard icon={FileSpreadsheet} label="Тип" value={result.type === "dpo" ? "ДПО" : "ПО"} tone="primary" />
              <StatCard icon={CheckCircle2} label="Строк" value={stats.totalRows} tone="primary" />
              <StatCard icon={Wand2} label="Исправлено ячеек" value={`${stats.fixedCells} (${stats.fixedRows} стр.)`} tone="teal" />
              <StatCard icon={AlertTriangle} label="Пустые обязательные" value={`${stats.missingRequiredRows} стр.`} tone={stats.missingRequiredRows > 0 ? "warn" : "primary"} />
            </div>

            <div className="text-xs text-muted-foreground">
              Распознано колонок источника: <strong>{result.matchedColumns}</strong> / {headers.length}.
              Превью: первые 20 строк × {previewCols} колонок.
            </div>

            <div className="border border-border rounded-xl overflow-hidden">
              <div className="overflow-x-auto max-h-[400px]">
                <table className="w-full text-xs">
                  <thead className="bg-muted/50 sticky top-0">
                    <tr>
                      <th className="px-2 py-2 text-left font-medium text-muted-foreground border-r border-border">№</th>
                      {headers.slice(0, previewCols).map((h, i) => (
                        <th key={i} className="px-2 py-2 text-left font-medium text-muted-foreground border-r border-border last:border-0 max-w-[180px] truncate" title={h}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {previewRows.map((row, ri) => (
                      <tr key={ri} className="border-t border-border">
                        <td className="px-2 py-1.5 text-muted-foreground border-r border-border">{row.sourceRowNumber}</td>
                        {row.cells.slice(0, previewCols).map((c, ci) => {
                          const isMissing = !String(c.value).trim() && headers[ci] && row.missingRequired.includes(headers[ci]);
                          return (
                            <td
                              key={ci}
                              className={`px-2 py-1.5 border-r border-border last:border-0 max-w-[180px] truncate ${
                                isMissing ? "bg-destructive/10 text-destructive" : c.fixed ? "bg-primary/5" : ""
                              }`}
                              title={c.reason || (c.fixed ? "Очищено" : "")}
                            >
                              {String(c.value) || (isMissing ? "— пусто —" : "")}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {stats.missingRequiredRows > 0 && (
              <div className="flex items-start gap-2 bg-amber-500/10 border border-amber-500/30 rounded-xl p-3 text-sm">
                <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
                <div>
                  В <strong>{stats.missingRequiredRows}</strong> строках не хватает обязательных полей (ФИО, СНИЛС, даты, номер документа). Файл будет экспортирован, но эти поля придётся дозаполнить вручную.
                </div>
              </div>
            )}

            <div className="flex justify-between gap-2 flex-wrap">
              <Button variant="ghost" onClick={reset} className="rounded-xl">← Загрузить другой файл</Button>
              <div className="flex gap-2">
                <Button variant="outline" onClick={handleDownloadReport} className="rounded-xl gap-2">
                  <FileDown className="w-4 h-4" /> Отчёт CSV
                </Button>
                <Button onClick={handleDownload} className="rounded-xl gap-2">
                  <Download className="w-4 h-4" /> Скачать чистый файл
                </Button>
              </div>
            </div>
          </motion.div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function StatCard({
  icon: Icon, label, value, tone,
}: {
  icon: React.ElementType;
  label: string;
  value: string | number;
  tone: "primary" | "teal" | "warn";
}) {
  const toneCls =
    tone === "warn" ? "bg-amber-500/10 text-amber-600"
    : tone === "teal" ? "bg-primary/10 text-primary"
    : "bg-primary/10 text-primary";
  return (
    <div className="bg-card rounded-xl border border-border p-3">
      <div className="flex items-center gap-2">
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${toneCls}`}>
          <Icon className="w-4 h-4" />
        </div>
        <div className="min-w-0">
          <div className="text-sm font-semibold truncate">{value}</div>
          <div className="text-xs text-muted-foreground truncate">{label}</div>
        </div>
      </div>
    </div>
  );
}
