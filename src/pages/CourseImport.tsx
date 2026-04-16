import { useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { safeInvoke } from "@/utils/safeInvoke";
import { useAuth } from "@/hooks/useAuth";
import { SigmaLogo } from "@/components/ui/SigmaLogo";
import { getAdminAwareBackPath } from "@/lib/utils";
import { SigmaSpinner } from "@/components/ui/SigmaSpinner";
import { UploadStep, PreviewStep, CreatingStep, DoneStep, StepIndicator } from "@/components/course-import/CourseImportSteps";

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
        <StepIndicator currentStep={step} />

        {step === 'upload' && (
          <UploadStep
            isDragging={isDragging}
            selectedFile={selectedFile}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onFileSelect={handleFileSelect}
            onClearFile={() => setSelectedFile(null)}
            onProcess={processFile}
          />
        )}

        {step === 'processing' && (
          <div className="text-center space-y-6 py-12">
            <div className="w-20 h-20 mx-auto rounded-2xl bg-primary/10 flex items-center justify-center">
              <SigmaSpinner size="xl" />
            </div>
            <div>
              <h2 className="font-display text-xl font-bold mb-2">Обработка файла...</h2>
              <Progress value={progress} className="w-64 mx-auto" />
            </div>
          </div>
        )}

        {step === 'preview' && importResult && (
          <PreviewStep
            importResult={importResult}
            courseTitle={courseTitle}
            onTitleChange={setCourseTitle}
            onReset={resetImport}
            onCreate={createCourse}
          />
        )}

        {step === 'creating' && <CreatingStep />}

        {step === 'done' && createdCourseId && (
          <DoneStep
            lessonsCount={importResult?.lessons.length || 0}
            courseId={createdCourseId}
            onReset={resetImport}
            onNavigate={navigate}
            backPath={getAdminAwareBackPath()}
          />
        )}
      </main>
    </div>
  );
}
