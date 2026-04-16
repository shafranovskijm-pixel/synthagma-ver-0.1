import { Upload, FileText, CheckCircle2, BookOpen, Sparkles, File, Presentation } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { SigmaSpinner } from "@/components/ui/SigmaSpinner";

interface ParsedLesson {
  id: string;
  type: string;
  title: string;
  content: string;
  order_index: number;
  metadata?: {
    wordCount: number;
    contentType: string;
    hasHeadings: boolean;
    hasTables: boolean;
    hasImages: boolean;
    fileName: string;
    folderPath?: string;
  };
}

interface ImportResult {
  success: boolean;
  courseTitle: string;
  lessons: ParsedLesson[];
  filesCount: number;
  sectionsCount: number;
  folderStructure?: { name: string; files: string[] }[];
  analysis: { fileName: string; title: string; wordCount: number; contentType: string }[];
  error?: string;
}

interface UploadStepProps {
  isDragging: boolean;
  selectedFile: File | null;
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent) => void;
  onFileSelect: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onClearFile: () => void;
  onProcess: () => void;
}

export function UploadStep({ isDragging, selectedFile, onDragOver, onDragLeave, onDrop, onFileSelect, onClearFile, onProcess }: UploadStepProps) {
  return (
    <div className="space-y-6">
      <div className="text-center">
        <h1 className="font-display text-2xl font-bold mb-2">Загрузите учебные материалы</h1>
        <p className="text-muted-foreground">Загрузите презентацию или документ для создания курса</p>
      </div>

      <div
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        className={`border-2 border-dashed rounded-2xl p-12 text-center transition-all cursor-pointer ${
          isDragging ? 'border-primary bg-primary/5 scale-[1.02]' 
          : selectedFile ? 'border-green-500 bg-green-500/5' 
          : 'border-border hover:border-primary/50 hover:bg-secondary/50'
        }`}
        onClick={() => document.getElementById('file-input')?.click()}
      >
        <input id="file-input" type="file" accept=".pptx,.doc,.docx,.txt,.html,.htm" onChange={onFileSelect} className="hidden" />
        {selectedFile ? (
          <div className="space-y-4">
            <div className="w-16 h-16 mx-auto rounded-2xl bg-green-500/10 flex items-center justify-center">
              {selectedFile.name.endsWith('.pptx') ? <Presentation className="w-8 h-8 text-green-500" /> : <FileText className="w-8 h-8 text-green-500" />}
            </div>
            <div>
              <p className="font-medium text-lg">{selectedFile.name}</p>
              <p className="text-sm text-muted-foreground">{(selectedFile.size / 1024 / 1024).toFixed(2)} МБ</p>
            </div>
            <Button variant="outline" size="sm" onClick={(e) => { e.stopPropagation(); onClearFile(); }}>Выбрать другой файл</Button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="w-16 h-16 mx-auto rounded-2xl bg-primary/10 flex items-center justify-center">
              <Upload className="w-8 h-8 text-primary" />
            </div>
            <div>
              <p className="font-medium text-lg">Перетащите файл сюда или нажмите для выбора</p>
              <p className="text-sm text-muted-foreground mt-1">Поддерживаются: PPTX, DOC, DOCX, TXT, HTML (до 50 МБ)</p>
            </div>
          </div>
        )}
      </div>

      <div className="bg-card rounded-2xl border border-border p-6">
        <h3 className="font-semibold mb-4 flex items-center gap-2">
          <BookOpen className="w-5 h-5 text-primary" />Как работает импорт
        </h3>
        <div className="grid gap-4 text-sm">
          <div className="flex items-start gap-3">
            <Presentation className="w-5 h-5 text-muted-foreground mt-0.5" />
            <div><p className="font-medium">PPTX (презентации)</p><p className="text-muted-foreground">Каждый слайд станет отдельным уроком</p></div>
          </div>
          <div className="flex items-start gap-3">
            <FileText className="w-5 h-5 text-muted-foreground mt-0.5" />
            <div><p className="font-medium">DOC / DOCX / TXT / HTML</p><p className="text-muted-foreground">Документ будет разбит на уроки по заголовкам</p></div>
          </div>
          <div className="flex items-start gap-3">
            <Sparkles className="w-5 h-5 text-muted-foreground mt-0.5" />
            <div><p className="font-medium">Автоматическая обработка</p><p className="text-muted-foreground">Форматирование, таблицы и изображения сохраняются</p></div>
          </div>
        </div>
      </div>

      {selectedFile && (
        <Button className="w-full btn-gradient rounded-xl h-12 text-base" onClick={onProcess}>
          <Sparkles className="w-5 h-5 mr-2" />Обработать файл
        </Button>
      )}
    </div>
  );
}

interface PreviewStepProps {
  importResult: ImportResult;
  courseTitle: string;
  onTitleChange: (v: string) => void;
  onReset: () => void;
  onCreate: () => void;
}

export function PreviewStep({ importResult, courseTitle, onTitleChange, onReset, onCreate }: PreviewStepProps) {
  return (
    <div className="space-y-6">
      <div className="text-center">
        <div className="w-16 h-16 mx-auto rounded-2xl bg-green-500/10 flex items-center justify-center mb-4">
          <CheckCircle2 className="w-8 h-8 text-green-500" />
        </div>
        <h2 className="font-display text-xl font-bold mb-2">Файл обработан!</h2>
        <p className="text-muted-foreground">Найдено {importResult.lessons.length} уроков из {importResult.filesCount} файлов</p>
      </div>

      <div className="bg-card rounded-2xl border border-border p-6">
        <label className="block text-sm font-medium mb-2">Название курса</label>
        <Input value={courseTitle} onChange={(e) => onTitleChange(e.target.value)} placeholder="Введите название курса" className="rounded-xl" />
      </div>

      <div className="bg-card rounded-2xl border border-border p-6">
        <h3 className="font-semibold mb-4 flex items-center gap-2">
          <BookOpen className="w-5 h-5 text-primary" />Структура курса ({importResult.lessons.length} уроков)
        </h3>
        <div className="space-y-2 max-h-64 overflow-y-auto">
          {importResult.lessons.map((lesson, index) => (
            <div key={lesson.id} className="flex items-center gap-3 p-3 rounded-xl bg-secondary/50 hover:bg-secondary transition-colors">
              <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center text-sm font-medium text-primary">{index + 1}</div>
              <div className="flex-1 min-w-0">
                <p className="font-medium truncate">{lesson.title}</p>
                <p className="text-xs text-muted-foreground">
                  {lesson.metadata?.wordCount || 0} слов
                  {lesson.metadata?.hasImages && ' • изображения'}
                  {lesson.metadata?.hasTables && ' • таблицы'}
                </p>
              </div>
              <File className="w-4 h-4 text-muted-foreground" />
            </div>
          ))}
        </div>
      </div>

      <div className="flex gap-3">
        <Button variant="outline" className="flex-1 rounded-xl" onClick={onReset}>Отмена</Button>
        <Button className="flex-1 btn-gradient rounded-xl" onClick={onCreate} disabled={!courseTitle.trim()}>
          <BookOpen className="w-4 h-4 mr-2" />Создать курс
        </Button>
      </div>
    </div>
  );
}

export function CreatingStep() {
  return (
    <div className="text-center space-y-6 py-12">
      <div className="w-20 h-20 mx-auto rounded-2xl bg-primary/10 flex items-center justify-center">
        <SigmaSpinner size="xl" />
      </div>
      <div>
        <h2 className="font-display text-xl font-bold mb-2">Создаём курс...</h2>
        <p className="text-muted-foreground">Сохраняем уроки в базу данных</p>
      </div>
    </div>
  );
}

interface DoneStepProps {
  lessonsCount: number;
  courseId: string;
  onReset: () => void;
  onNavigate: (path: string) => void;
  backPath: string;
}

export function DoneStep({ lessonsCount, courseId, onReset, onNavigate, backPath }: DoneStepProps) {
  return (
    <div className="text-center space-y-6 py-12">
      <div className="w-20 h-20 mx-auto rounded-2xl bg-green-500/10 flex items-center justify-center">
        <CheckCircle2 className="w-10 h-10 text-green-500" />
      </div>
      <div>
        <h2 className="font-display text-xl font-bold mb-2">Курс создан!</h2>
        <p className="text-muted-foreground">{lessonsCount} уроков успешно импортированы</p>
      </div>
      <div className="flex gap-3 justify-center">
        <Button variant="outline" className="rounded-xl" onClick={onReset}>Импортировать ещё</Button>
        <Button className="btn-gradient rounded-xl" onClick={() => onNavigate(`/course-builder/${courseId}`)}>
          <BookOpen className="w-4 h-4 mr-2" />Открыть в конструкторе
        </Button>
      </div>
      <Button variant="ghost" className="rounded-xl" onClick={() => onNavigate(backPath)}>
        Вернуться к курсам
      </Button>
    </div>
  );
}

interface StepIndicatorProps {
  currentStep: string;
}

export function StepIndicator({ currentStep }: StepIndicatorProps) {
  const steps = ['upload', 'processing', 'preview', 'done'];
  const allSteps = ['upload', 'processing', 'preview', 'creating', 'done'];
  return (
    <div className="flex items-center justify-center gap-2 mb-8">
      {steps.map((s, i) => (
        <div key={s} className="flex items-center">
          <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-colors ${
            currentStep === s || (currentStep === 'creating' && s === 'preview')
              ? 'bg-primary text-primary-foreground' 
              : allSteps.indexOf(currentStep) > i ? 'bg-primary/20 text-primary' : 'bg-muted text-muted-foreground'
          }`}>{i + 1}</div>
          {i < 3 && <div className={`w-12 h-0.5 mx-1 ${allSteps.indexOf(currentStep) > i ? 'bg-primary/50' : 'bg-muted'}`} />}
        </div>
      ))}
    </div>
  );
}
