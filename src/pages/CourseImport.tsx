import { useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { 
  Upload, FileText, CheckCircle2, 
  AlertCircle, ArrowLeft, BookOpen, Sparkles,
  File, Presentation
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { safeInvoke } from "@/utils/safeInvoke";
import { useAuth } from "@/hooks/useAuth";
import { SigmaLogo } from "@/components/ui/SigmaLogo";
import { getAdminAwareBackPath } from "@/lib/utils";

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
  folderStructure?: {
    name: string;
    files: string[];
  }[];
  analysis: {
    fileName: string;
    title: string;
    wordCount: number;
    contentType: string;
  }[];
  error?: string;
}

type ImportStep = 'upload' | 'processing' | 'preview' | 'creating' | 'done';

export default function CourseImport() {
  const navigate = useNavigate();
  const { user } = useAuth();
  
  const [step, setStep] = useState<ImportStep>('upload');
  const [isDragging, setIsDragging] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [progress, setProgress] = useState(0);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [courseTitle, setCourseTitle] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [createdCourseId, setCreatedCourseId] = useState<string | null>(null);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    
    const file = e.dataTransfer.files[0];
    if (file) {
      validateAndSetFile(file);
    }
  }, []);

  const validateAndSetFile = (file: File) => {
    const validTypes = [
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'text/plain',
      'text/html',
    ];
    
    const fileName = file.name.toLowerCase();
    const isPptx = fileName.endsWith('.pptx');
    const isDocx = fileName.endsWith('.docx');
    const isDoc = fileName.endsWith('.doc');
    const isTxt = fileName.endsWith('.txt');
    const isHtml = fileName.endsWith('.html') || fileName.endsWith('.htm');
    
    if (!isPptx && !isDocx && !isDoc && !isTxt && !isHtml) {
      toast.error('Поддерживаются только PPTX, DOC, DOCX, TXT, HTML файлы');
      return;
    }
    
    if (file.size > 50 * 1024 * 1024) {
      toast.error('Максимальный размер файла — 50 МБ');
      return;
    }
    
    setSelectedFile(file);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      validateAndSetFile(file);
    }
  };

  const processFile = async () => {
    if (!selectedFile) return;
    
    setStep('processing');
    setProgress(10);
    
    try {
      const formData = new FormData();
      formData.append('file_0', selectedFile);
      
      setProgress(30);
      
      const { data, error } = await safeInvoke<any>('import-course', {
        body: formData });
      
      setProgress(80);
      
      if (error) {
        throw new Error(error.message || 'Ошибка обработки файла');
      }
      
      if (!data.success) {
        throw new Error(data.error || 'Не удалось обработать файл');
      }
      
      setProgress(100);
      setImportResult(data);
      setCourseTitle(data.courseTitle || 'Новый курс');
      setStep('preview');
      
    } catch (error) {
      console.error('Import error:', error);
      toast.error(error instanceof Error ? error.message : 'Ошибка импорта');
      setStep('upload');
      setProgress(0);
    }
  };

  const createCourse = async () => {
    if (!importResult || !user) return;
    
    setIsCreating(true);
    setStep('creating');
    
    try {
      // Get user's organization
      const { data: profile } = await supabase
        .from('profiles')
        .select('organization_id')
        .eq('user_id', user.id)
        .single();
      
      if (!profile?.organization_id) {
        throw new Error('Организация не найдена');
      }
      
      // Create course
      const { data: course, error: courseError } = await supabase
        .from('courses')
        .insert({
          title: courseTitle,
          description: `Импортирован из ${selectedFile?.name}`,
          organization_id: profile.organization_id,
          is_published: false })
        .select('id')
        .single();
      
      if (courseError) throw courseError;
      
      // Create lessons
      const lessonsToInsert = importResult.lessons.map((lesson, index) => ({
        course_id: course.id,
        title: lesson.title,
        content: lesson.content,
        type: 'text',
        order_index: index }));
      
      const { error: lessonsError } = await supabase
        .from('lessons')
        .insert(lessonsToInsert);
      
      if (lessonsError) throw lessonsError;
      
      setCreatedCourseId(course.id);
      setStep('done');
      toast.success('Курс успешно создан!');
      
    } catch (error) {
      console.error('Create course error:', error);
      toast.error(error instanceof Error ? error.message : 'Ошибка создания курса');
      setStep('preview');
    } finally {
      setIsCreating(false);
    }
  };

  const resetImport = () => {
    setStep('upload');
    setSelectedFile(null);
    setProgress(0);
    setImportResult(null);
    setCourseTitle('');
    setCreatedCourseId(null);
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button 
              variant="ghost" 
              size="icon" 
            onClick={() => navigate(getAdminAwareBackPath())}
              className="rounded-xl"
            >
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <div className="flex items-center gap-3">
              <SigmaLogo size="sm" />
              <span className="font-display font-semibold text-lg">Импорт курса</span>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 max-w-3xl">
        {/* Steps indicator */}
        <div className="flex items-center justify-center gap-2 mb-8">
          {['upload', 'processing', 'preview', 'done'].map((s, i) => (
            <div key={s} className="flex items-center">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-colors ${
                step === s || (step === 'creating' && s === 'preview')
                  ? 'bg-primary text-primary-foreground' 
                  : ['upload', 'processing', 'preview', 'creating', 'done'].indexOf(step) > i
                    ? 'bg-primary/20 text-primary'
                    : 'bg-muted text-muted-foreground'
              }`}>
                {i + 1}
              </div>
              {i < 3 && (
                <div className={`w-12 h-0.5 mx-1 ${
                  ['upload', 'processing', 'preview', 'creating', 'done'].indexOf(step) > i
                    ? 'bg-primary/50'
                    : 'bg-muted'
                }`} />
              )}
            </div>
          ))}
        </div>

        {/* Upload step */}
        {step === 'upload' && (
          <div className="space-y-6">
            <div className="text-center">
              <h1 className="font-display text-2xl font-bold mb-2">Загрузите учебные материалы</h1>
              <p className="text-muted-foreground">
                Загрузите презентацию или документ для создания курса
              </p>
            </div>

            {/* Drop zone */}
            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              className={`
                border-2 border-dashed rounded-2xl p-12 text-center transition-all cursor-pointer
                ${isDragging 
                  ? 'border-primary bg-primary/5 scale-[1.02]' 
                  : selectedFile 
                    ? 'border-green-500 bg-green-500/5' 
                    : 'border-border hover:border-primary/50 hover:bg-secondary/50'
                }
              `}
              onClick={() => document.getElementById('file-input')?.click()}
            >
              <input
                id="file-input"
                type="file"
                accept=".pptx,.doc,.docx,.txt,.html,.htm"
                onChange={handleFileSelect}
                className="hidden"
              />
              
              {selectedFile ? (
                <div className="space-y-4">
                  <div className="w-16 h-16 mx-auto rounded-2xl bg-green-500/10 flex items-center justify-center">
                    {selectedFile.name.endsWith('.pptx') ? (
                      <Presentation className="w-8 h-8 text-green-500" />
                    ) : (
                      <FileText className="w-8 h-8 text-green-500" />
                    )}
                  </div>
                  <div>
                    <p className="font-medium text-lg">{selectedFile.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {(selectedFile.size / 1024 / 1024).toFixed(2)} МБ
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedFile(null);
                    }}
                  >
                    Выбрать другой файл
                  </Button>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="w-16 h-16 mx-auto rounded-2xl bg-primary/10 flex items-center justify-center">
                    <Upload className="w-8 h-8 text-primary" />
                  </div>
                  <div>
                    <p className="font-medium text-lg">
                      Перетащите файл сюда или нажмите для выбора
                    </p>
                    <p className="text-sm text-muted-foreground mt-1">
                      Поддерживаются: PPTX, DOC, DOCX, TXT, HTML (до 50 МБ)
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Supported formats */}
            <div className="bg-card rounded-2xl border border-border p-6">
              <h3 className="font-semibold mb-4 flex items-center gap-2">
                <BookOpen className="w-5 h-5 text-primary" />
                Как работает импорт
              </h3>
              <div className="grid gap-4 text-sm">
                <div className="flex items-start gap-3">
                  <Presentation className="w-5 h-5 text-muted-foreground mt-0.5" />
                  <div>
                    <p className="font-medium">PPTX (презентации)</p>
                    <p className="text-muted-foreground">
                      Каждый слайд станет отдельным уроком
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <FileText className="w-5 h-5 text-muted-foreground mt-0.5" />
                  <div>
                    <p className="font-medium">DOC / DOCX / TXT / HTML</p>
                    <p className="text-muted-foreground">
                      Документ будет разбит на уроки по заголовкам
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <Sparkles className="w-5 h-5 text-muted-foreground mt-0.5" />
                  <div>
                    <p className="font-medium">Автоматическая обработка</p>
                    <p className="text-muted-foreground">
                      Форматирование, таблицы и изображения сохраняются
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {selectedFile && (
              <Button 
                className="w-full btn-gradient rounded-xl h-12 text-base"
                onClick={processFile}
              >
                <Sparkles className="w-5 h-5 mr-2" />
                Обработать файл
              </Button>
            )}
          </div>
        )}

        {/* Preview step */}
        {step === 'preview' && importResult && (
          <div className="space-y-6">
            <div className="text-center">
              <div className="w-16 h-16 mx-auto rounded-2xl bg-green-500/10 flex items-center justify-center mb-4">
                <CheckCircle2 className="w-8 h-8 text-green-500" />
              </div>
              <h2 className="font-display text-xl font-bold mb-2">Файл обработан!</h2>
              <p className="text-muted-foreground">
                Найдено {importResult.lessons.length} уроков из {importResult.filesCount} файлов
              </p>
            </div>

            {/* Course title */}
            <div className="bg-card rounded-2xl border border-border p-6">
              <label className="block text-sm font-medium mb-2">Название курса</label>
              <Input
                value={courseTitle}
                onChange={(e) => setCourseTitle(e.target.value)}
                placeholder="Введите название курса"
                className="rounded-xl"
              />
            </div>

            {/* Lessons preview */}
            <div className="bg-card rounded-2xl border border-border p-6">
              <h3 className="font-semibold mb-4 flex items-center gap-2">
                <BookOpen className="w-5 h-5 text-primary" />
                Структура курса ({importResult.lessons.length} уроков)
              </h3>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {importResult.lessons.map((lesson, index) => (
                  <div 
                    key={lesson.id}
                    className="flex items-center gap-3 p-3 rounded-xl bg-secondary/50 hover:bg-secondary transition-colors"
                  >
                    <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center text-sm font-medium text-primary">
                      {index + 1}
                    </div>
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
              <Button 
                variant="outline" 
                className="flex-1 rounded-xl"
                onClick={resetImport}
              >
                Отмена
              </Button>
              <Button 
                className="flex-1 btn-gradient rounded-xl"
                onClick={createCourse}
                disabled={!courseTitle.trim()}
              >
                <BookOpen className="w-4 h-4 mr-2" />
                Создать курс
              </Button>
            </div>
          </div>
        )}

        {/* Creating step */}
        {step === 'creating' && (
          <div className="text-center space-y-6 py-12">
            <div className="w-20 h-20 mx-auto rounded-2xl bg-primary/10 flex items-center justify-center">
              <SigmaSpinner size="xl" />
            </div>
            <div>
              <h2 className="font-display text-xl font-bold mb-2">Создаём курс...</h2>
              <p className="text-muted-foreground">
                Сохраняем уроки в базу данных
              </p>
            </div>
          </div>
        )}

        {/* Done step */}
        {step === 'done' && createdCourseId && (
          <div className="text-center space-y-6 py-12">
            <div className="w-20 h-20 mx-auto rounded-2xl bg-green-500/10 flex items-center justify-center">
              <CheckCircle2 className="w-10 h-10 text-green-500" />
            </div>
            <div>
              <h2 className="font-display text-xl font-bold mb-2">Курс создан!</h2>
              <p className="text-muted-foreground">
                {importResult?.lessons.length} уроков успешно импортированы
              </p>
            </div>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Button 
                variant="outline" 
                className="rounded-xl"
                onClick={() => navigate(getAdminAwareBackPath())}
              >
                <ArrowLeft className="w-4 h-4 mr-2" />
                К списку курсов
              </Button>
              <Button 
                className="btn-gradient rounded-xl"
                onClick={() => navigate(`/course-builder/${createdCourseId}`)}
              >
                Редактировать курс
              </Button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
