import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger } from "@/components/ui/dialog";
import { Upload, FileSpreadsheet, Download, CheckCircle2, FileText } from "lucide-react";
import { toast } from "sonner";
import { getXLSX } from "@/utils/xlsxHelper";
import { parseTxtTestFile } from "@/utils/txtTestParser";
import { SigmaSpinner } from "@/components/ui/SigmaSpinner";

interface ImportedQuestion {
  question: string;
  options: string[];
  correctAnswer: number;
  explanation?: string;
}

interface TestImportDialogProps {
  onImport: (questions: ImportedQuestion[]) => void;
  children?: React.ReactNode;
}

export function TestImportDialog({ onImport, children }: TestImportDialogProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [previewData, setPreviewData] = useState<ImportedQuestion[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const parseExcelFile = async (file: File): Promise<ImportedQuestion[]> => {
    const XLSX = await getXLSX();
    const arrayBuffer = await file.arrayBuffer();
    const workbook = XLSX.read(arrayBuffer, { type: "array" });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    
    const data: string[][] = XLSX.utils.sheet_to_json(worksheet, { 
      header: 1,
      defval: ""
    });

    const questions: ImportedQuestion[] = [];

    const startRow = data[0]?.some(cell => 
      typeof cell === 'string' && 
      (cell.toLowerCase().includes('вопрос') || cell.toLowerCase().includes('ответ'))
    ) ? 1 : 0;

    for (let i = startRow; i < data.length; i++) {
      const row = data[i];
      if (!row || !row[0] || typeof row[0] !== 'string' || !row[0].trim()) continue;

      const questionText = String(row[0]).trim();
      if (!questionText) continue;

      const options: string[] = [];
      let correctAnswer = 0;

      for (let j = 1; j < row.length && j <= 6; j++) {
        let answerText = String(row[j] || "").trim();
        if (!answerText) continue;

        // Check for asterisk at the beginning OR end of the answer
        const startsWithAsterisk = answerText.startsWith("*");
        const endsWithAsterisk = answerText.endsWith("*");
        
        if (startsWithAsterisk || endsWithAsterisk) {
          correctAnswer = options.length;
          // Remove asterisk from beginning or end
          if (startsWithAsterisk) {
            answerText = answerText.substring(1).trim();
          }
          if (endsWithAsterisk) {
            answerText = answerText.slice(0, -1).trim();
          }
        }

        if (answerText) {
          options.push(answerText);
        }
      }

      if (options.length >= 2) {
        questions.push({
          question: questionText,
          options,
          correctAnswer
        });
      }
    }

    return questions;
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const ext = file.name.toLowerCase().split('.').pop();
    if (!['xlsx', 'xls', 'txt'].includes(ext || '')) {
      toast.error("Поддерживаются файлы Excel (.xlsx, .xls) и текстовые (.txt)");
      return;
    }

    setIsLoading(true);
    try {
      let questions: ImportedQuestion[];
      
      if (ext === 'txt') {
        const text = await file.text();
        questions = parseTxtTestFile(text);
      } else {
        questions = await parseExcelFile(file);
      }
      
      if (questions.length === 0) {
        toast.error("Не найдено вопросов в файле. Проверьте формат.");
        return;
      }

      setPreviewData(questions);
      toast.success(`Найдено ${questions.length} вопросов`);
    } catch (error) {
      console.error("Error parsing file:", error);
      toast.error("Ошибка чтения файла");
    } finally {
      setIsLoading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const handleImport = () => {
    if (previewData.length === 0) return;
    
    onImport(previewData);
    setPreviewData([]);
    setIsOpen(false);
    toast.success(`Импортировано ${previewData.length} вопросов`);
  };

  const handleDownloadTemplate = async () => {
    const XLSX = await getXLSX();
    const templateData = [
      ["Текст вопроса", "Ответ 1", "Ответ 2", "Ответ 3", "Ответ 4"],
      ["Какой цвет у неба?", "*Голубой", "Красный", "Зелёный", "Жёлтый"],
      ["Сколько дней в неделе?", "5", "*7", "10", "6"],
      ["Столица России?", "Санкт-Петербург", "Казань", "*Москва", "Новосибирск"],
    ];

    const ws = XLSX.utils.aoa_to_sheet(templateData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Тест");

    ws['!cols'] = [
      { wch: 40 },
      { wch: 25 },
      { wch: 25 },
      { wch: 25 },
      { wch: 25 },
    ];

    XLSX.writeFile(wb, "Шаблон_теста.xlsx");
    toast.success("Шаблон скачан");
  };

  const handleClose = () => {
    setIsOpen(false);
    setPreviewData([]);
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => {
      if (!open) handleClose();
      else setIsOpen(true);
    }}>
      <DialogTrigger asChild>
        {children || (
          <Button variant="outline" size="sm" className="gap-2">
            <Upload className="w-4 h-4" />
            Импорт из Excel / TXT
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="w-5 h-5 text-green-500" />
            Импорт теста из Excel / TXT
          </DialogTitle>
          <DialogDescription>
            Загрузите файл Excel или TXT с вопросами. Правильные ответы отмечайте символом * (Excel) или +- (TXT).
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-auto space-y-4">
          <div className="bg-muted/50 rounded-lg p-4 text-sm space-y-2">
            <p className="font-medium">Формат Excel:</p>
            <ul className="list-disc list-inside text-muted-foreground space-y-1">
              <li>Первый столбец — текст вопроса</li>
              <li>Столбцы 2-5 — варианты ответов</li>
              <li>Правильный ответ начинается с <code className="bg-primary/10 px-1 rounded">*</code></li>
            </ul>
            <p className="font-medium mt-3">Формат TXT:</p>
            <ul className="list-disc list-inside text-muted-foreground space-y-1">
              <li><code className="bg-primary/10 px-1 rounded">?</code> — вопрос</li>
              <li><code className="bg-primary/10 px-1 rounded">+-</code> — правильный ответ</li>
              <li><code className="bg-primary/10 px-1 rounded">-</code> — неправильный ответ</li>
              <li><code className="bg-primary/10 px-1 rounded">\</code> — пояснение (необязательно)</li>
            </ul>
            <Button
              variant="link"
              size="sm"
              className="p-0 h-auto text-primary gap-1"
              onClick={handleDownloadTemplate}
            >
              <Download className="w-3 h-3" />
              Скачать шаблон Excel
            </Button>
          </div>

          {previewData.length === 0 ? (
            <div className="border-2 border-dashed border-border rounded-xl p-8 text-center">
              <FileSpreadsheet className="w-10 h-10 mx-auto mb-3 text-green-500/60" />
              <p className="text-sm text-muted-foreground mb-4">
                Перетащите файл или нажмите для выбора
              </p>
              <label className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg cursor-pointer hover:bg-primary/90 transition-colors">
                {isLoading ? (
                  <>
                    <SigmaSpinner size="sm" />
                    Обработка...
                  </>
                ) : (
                  <>
                    <Upload className="w-4 h-4" />
                    Выбрать файл
                  </>
                )}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx,.xls,.txt"
                  onChange={handleFileSelect}
                  className="hidden"
                  disabled={isLoading}
                />
              </label>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium">
                  Найдено вопросов: {previewData.length}
                </p>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setPreviewData([])}
                >
                  Выбрать другой файл
                </Button>
              </div>
              
              <div className="max-h-[300px] overflow-auto border border-border rounded-lg">
                {previewData.slice(0, 10).map((q, idx) => (
                  <div
                    key={idx}
                    className="p-3 border-b border-border last:border-b-0 text-sm"
                  >
                    <p className="font-medium mb-2">
                      {idx + 1}. {q.question}
                    </p>
                    <div className="grid grid-cols-2 gap-1 text-xs">
                      {q.options.map((opt, optIdx) => (
                        <div
                          key={optIdx}
                          className={`flex items-center gap-1 ${
                            optIdx === q.correctAnswer
                              ? "text-green-600 font-medium"
                              : "text-muted-foreground"
                          }`}
                        >
                          {optIdx === q.correctAnswer && (
                            <CheckCircle2 className="w-3 h-3" />
                          )}
                          {opt}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
                {previewData.length > 10 && (
                  <div className="p-3 text-center text-sm text-muted-foreground bg-muted/30">
                    ...и ещё {previewData.length - 10} вопросов
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {previewData.length > 0 && (
          <div className="flex justify-end gap-2 pt-4 border-t">
            <Button variant="outline" onClick={handleClose}>
              Отмена
            </Button>
            <Button onClick={handleImport} className="gap-2">
              <Upload className="w-4 h-4" />
              Импортировать {previewData.length} вопросов
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}