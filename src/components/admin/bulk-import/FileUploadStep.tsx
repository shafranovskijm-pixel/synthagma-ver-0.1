import { useRef, useState } from "react";
import { Upload, FileSpreadsheet, CheckCircle2 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { parseExcelBulkTests, ParsedSection } from "@/utils/excelTestBulkParser";
import { toast } from "sonner";
import { SigmaSpinner } from "@/components/ui/SigmaSpinner";

interface Props {
  onParsed: (sections: ParsedSection[]) => void;
}

export function FileUploadStep({ onParsed }: Props) {
  const [phase, setPhase] = useState<"idle" | "reading" | "parsing" | "done">("idle");
  const [progress, setProgress] = useState(0);
  const [stats, setStats] = useState<{ sections: number; questions: number } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile = async (file: File) => {
    setPhase("reading");
    setProgress(20);

    // Small delay for visual feedback
    await new Promise(r => setTimeout(r, 300));
    setPhase("parsing");
    setProgress(50);

    try {
      const parsed = await parseExcelBulkTests(file);
      setProgress(90);
      await new Promise(r => setTimeout(r, 200));

      if (parsed.length === 0) {
        toast.error("Не удалось найти разделы с вопросами");
        setPhase("idle");
        setProgress(0);
        return;
      }

      const totalQ = parsed.reduce((s, p) => s + p.questions.length, 0);
      setStats({ sections: parsed.length, questions: totalQ });
      setProgress(100);
      setPhase("done");

      toast.success(`Найдено ${parsed.length} разделов, ${totalQ} вопросов`);

      // Small delay to show completion state
      await new Promise(r => setTimeout(r, 600));
      onParsed(parsed);
    } catch (err) {
      console.error("Parse error:", err);
      toast.error("Ошибка чтения файла");
      setPhase("idle");
      setProgress(0);
    }
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file && (file.name.endsWith(".xlsx") || file.name.endsWith(".xls"))) {
      handleFile(file);
    } else {
      toast.error("Поддерживаются только файлы .xlsx и .xls");
    }
  };

  const phaseLabels = {
    idle: "",
    reading: "Чтение файла...",
    parsing: "Разбор разделов и вопросов...",
    done: "Готово!" };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-display">Массовый импорт курсов</CardTitle>
        <CardDescription>
          Загрузите Excel-файл с тестовыми вопросами. Система определит разделы, напряжение и группы.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div
          className="border-2 border-dashed border-border rounded-xl p-12 text-center transition-colors hover:border-primary/50"
          onDragOver={e => e.preventDefault()}
          onDrop={handleDrop}
        >
          {phase === "idle" ? (
            <>
              <FileSpreadsheet className="w-12 h-12 mx-auto mb-4 text-muted-foreground/50" />
              <p className="text-sm text-muted-foreground mb-2">
                7 колонок: текст + до 1000 В / до и выше 1000 В / II / III / IV / V
              </p>
              <p className="text-xs text-muted-foreground mb-4">
                Отметки «+» определяют принадлежность вопроса к напряжению и группе
              </p>
              <label className="inline-flex items-center gap-2 px-6 py-3 bg-primary text-primary-foreground rounded-xl cursor-pointer hover:bg-primary/90 transition-colors">
                <Upload className="w-4 h-4" />Выбрать Excel-файл
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx,.xls"
                  onChange={handleFileInput}
                  className="hidden"
                />
              </label>
            </>
          ) : (
            <div className="space-y-4 max-w-md mx-auto">
              <div className="flex items-center justify-center gap-3">
                {phase === "done" ? (
                  <CheckCircle2 className="w-8 h-8 text-green-500" />
                ) : (
                  <SigmaSpinner size="lg" />
                )}
                <span className="text-lg font-medium">{phaseLabels[phase]}</span>
              </div>
              <Progress value={progress} className="h-2" />
              {stats && (
                <div className="flex items-center justify-center gap-3">
                  <Badge variant="secondary">{stats.sections} разделов</Badge>
                  <Badge variant="secondary">{stats.questions} вопросов</Badge>
                </div>
              )}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
