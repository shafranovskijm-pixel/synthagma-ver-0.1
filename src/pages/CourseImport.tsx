import { useState, useCallback, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { AlertTriangle, ArrowLeft, RefreshCw } from "lucide-react";
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
import {
  CourseImportScopeError,
  resolveCourseImportScope,
  type CourseImportScope,
} from "@/lib/courseImportScope";
import { createImportedCourseHeader } from "@/api/courseImport";
import { createStructuredCourseDraft } from "@/api/structuredCourseImport";
import { CourseCreationError, courseCreationErrorMessage } from "@/api/courses";
import { sanitizeCourseHtml } from "@/lib/security/courseHtml";
import {
  isCszStructuredCourseHtml,
  parseCszStructuredCourseHtml,
  type StructuredCourseDraftPayload,
} from "@/utils/structuredCourseImport";

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

type ScopeState =
  | { status: "loading" }
  | { status: "ready"; scope: CourseImportScope }
  | { status: "error"; message: string };

export default function CourseImport() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user, userRole } = useAuth();
  const requestedOrganizationId = searchParams.get("organizationId");
  
  const [step, setStep] = useState<ImportStep>('upload');
  const [isDragging, setIsDragging] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [progress, setProgress] = useState(0);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [courseTitle, setCourseTitle] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [createdCourseId, setCreatedCourseId] = useState<string | null>(null);
  const [structuredPayload, setStructuredPayload] = useState<StructuredCourseDraftPayload | null>(null);
  const [scopeState, setScopeState] = useState<ScopeState>({ status: "loading" });
  const [scopeRefreshKey, setScopeRefreshKey] = useState(0);

  useEffect(() => {
    let cancelled = false;

    const resolveScope = async () => {
      if (!user) return;
      setScopeState({ status: "loading" });

      try {
        const scope = await resolveCourseImportScope({
          userId: user.id,
          userRole,
          requestedOrganizationId,
        });
        if (!cancelled) setScopeState({ status: "ready", scope });
      } catch (error) {
        const message = error instanceof CourseImportScopeError
          ? error.message
          : "Не удалось подтвердить организацию. Повторите попытку";
        if (!cancelled) setScopeState({ status: "error", message });
      }
    };

    void resolveScope();
    return () => { cancelled = true; };
  }, [user, userRole, requestedOrganizationId, scopeRefreshKey]);

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
      toast.error('Поддерживаются PPTX, DOCX, TXT, HTML; старый DOC доступен в Beta-режиме');
      return;
    }
    
    if (file.size > 50 * 1024 * 1024) {
      toast.error('Максимальный размер файла — 50 МБ');
      return;
    }
    
    if (isDoc) {
      toast.warning('DOC — Beta: рекомендуем сохранить файл как DOCX и проверить импорт перед публикацией');
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
    if (!selectedFile || scopeState.status !== "ready") return;
    
    setStep('processing');
    setProgress(10);
    setStructuredPayload(null);
    
    try {
      const isHtml = /\.html?$/i.test(selectedFile.name) || selectedFile.type === "text/html";
      if (isHtml) {
        const html = await selectedFile.text();
        if (isCszStructuredCourseHtml(html)) {
          const parsed = parseCszStructuredCourseHtml(html);
          setProgress(100);
          setStructuredPayload(parsed);
          setImportResult({
            success: true,
            courseTitle: parsed.title,
            lessons: parsed.lessons.map((lesson) => ({
              id: lesson.key,
              type: lesson.type,
              title: lesson.title,
              content: lesson.content,
              order_index: lesson.order_index,
            })),
            filesCount: 1,
            sectionsCount: parsed.lessons.length,
            analysis: [{
              fileName: selectedFile.name,
              title: parsed.title,
              wordCount: html.trim().split(/\s+/).length,
              contentType: "structured-csz-course",
            }],
          });
          setCourseTitle(parsed.title);
          setStep("preview");
          return;
        }
      }

      setStructuredPayload(null);
      const formData = new FormData();
      formData.append('file_0', selectedFile);
      formData.append('organization_id', scopeState.scope.organizationId);
      
      setProgress(30);
      
      const { data, error } = await safeInvoke<ImportResult>('import-course', {
        body: formData });
      
      setProgress(80);
      
      if (error) {
        throw new Error(error.message || 'Ошибка обработки файла');
      }
      
      if (!data?.success) {
        throw new Error(data?.error || 'Не удалось обработать файл');
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
    if (!importResult || !user || scopeState.status !== "ready") return;
    
    setIsCreating(true);
    setStep('creating');
    
    try {
      // Resolve again at action time. This catches a changed admin-view,
      // revoked membership or a link that no longer matches the active org.
      const verifiedScope = await resolveCourseImportScope({
        userId: user.id,
        userRole,
        requestedOrganizationId,
      });
      if (verifiedScope.organizationId !== scopeState.scope.organizationId) {
        throw new CourseImportScopeError(
          "organization_mismatch",
          "Активная организация изменилась. Запустите импорт из кабинета снова",
        );
      }

      let courseId: string;
      if (structuredPayload) {
        // The database validates and inserts the complete graph in a single
        // transaction. It always returns an unpublished course.
        const result = await createStructuredCourseDraft({
          organizationId: verifiedScope.organizationId,
          title: courseTitle,
          payload: structuredPayload,
        });
        courseId = result.course_id;
      } else {
        // Legacy flat import remains available for ordinary office files.
        const importedCourseId = await createImportedCourseHeader({
          organizationId: verifiedScope.organizationId,
          title: courseTitle,
          description: `Импортирован из ${selectedFile?.name || "учебных материалов"}`,
        });

        const lessonsToInsert = importResult.lessons.map((lesson, index) => ({
          course_id: importedCourseId,
          title: lesson.title,
          content: sanitizeCourseHtml(lesson.content),
          type: 'text',
          order_index: index }));

        const { error: lessonsError } = await supabase
          .from('lessons')
          .insert(lessonsToInsert);

        if (lessonsError) {
          const { error: cleanupError } = await supabase
            .from("courses")
            .delete()
            .eq("id", importedCourseId)
            .eq("organization_id", verifiedScope.organizationId);
          if (cleanupError) console.error("Course import cleanup failed");
          throw new CourseCreationError(
            "unknown",
            "Не удалось сохранить уроки. Повторите импорт",
          );
        }
        courseId = importedCourseId;
      }
      
      setCreatedCourseId(courseId);
      setStep('done');
      toast.success('Черновик курса успешно создан');
      
    } catch (error) {
      console.error('Create course error:', error);
      const message = error instanceof CourseImportScopeError
        ? error.message
        : courseCreationErrorMessage(error);
      toast.error(message);
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
    setStructuredPayload(null);
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
            onClick={() => navigate(getAdminAwareBackPath("/organization?tab=courses"))}
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
        {scopeState.status === "loading" && (
          <div className="py-20 text-center space-y-4">
            <SigmaSpinner size="xl" />
            <p className="font-medium">Подтверждаем организацию и права…</p>
          </div>
        )}

        {scopeState.status === "error" && (
          <div className="mx-auto max-w-xl rounded-2xl border border-destructive/30 bg-card p-8 text-center space-y-5">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-destructive/10">
              <AlertTriangle className="h-7 w-7 text-destructive" />
            </div>
            <div className="space-y-2">
              <h1 className="font-display text-xl font-bold">Импорт недоступен</h1>
              <p className="text-sm text-muted-foreground">{scopeState.message}</p>
            </div>
            <div className="flex flex-wrap justify-center gap-3">
              <Button variant="outline" onClick={() => navigate(getAdminAwareBackPath("/organization?tab=courses"))}>
                Вернуться в кабинет
              </Button>
              <Button onClick={() => setScopeRefreshKey((value) => value + 1)}>
                <RefreshCw className="mr-2 h-4 w-4" />Повторить
              </Button>
            </div>
          </div>
        )}

        {scopeState.status === "ready" && <StepIndicator currentStep={step} />}

        {scopeState.status === "ready" && step === 'upload' && (
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

        {scopeState.status === "ready" && step === 'processing' && (
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

        {scopeState.status === "ready" && step === 'preview' && importResult && (
          <PreviewStep
            importResult={importResult}
            courseTitle={courseTitle}
            onTitleChange={setCourseTitle}
            onReset={resetImport}
            onCreate={createCourse}
          />
        )}

        {scopeState.status === "ready" && step === 'creating' && <CreatingStep />}

        {scopeState.status === "ready" && step === 'done' && createdCourseId && (
          <DoneStep
            lessonsCount={importResult?.lessons.length || 0}
            courseId={createdCourseId}
            onReset={resetImport}
            onNavigate={navigate}
            backPath={getAdminAwareBackPath("/organization?tab=courses")}
          />
        )}
      </main>
    </div>
  );
}
