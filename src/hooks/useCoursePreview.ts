import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { getAdminAwareBackPath, getCourseDetailsPath } from "@/lib/utils";
import { orderCourseLessons } from "@/lib/courseLessonOrder";
import { usePlatformHomeworkTaskProof } from "@/hooks/usePlatformHomeworkTaskProof";
import { useCourseFileDeliveryMode } from "@/hooks/useCourseFileDeliveryMode";
import type { CourseFilePreviewReference } from "@/lib/courseFileConsumer";

export interface Lesson {
  id: string;
  course_id?: string | null;
  title: string;
  type: string;
  content?: string | null;
  order_index: number;
  module_id?: string | null;
  test_questions_count?: number | null;
  is_locked?: boolean;
}

export interface Course {
  id: string;
  organization_id?: string | null;
  title: string;
  description: string | null;
  is_published: boolean;
  allow_materials_download?: boolean;
}

export interface TestQuestion {
  id: string;
  question: string;
  options: unknown;
  order_index: number;
  explanation?: string | null;
  image_url?: string | null;
}

export interface UseCoursePreviewOptions {
  courseIdOverride?: string;
  embedded?: boolean;
  onNavigateBack?: () => void;
  onNavigateToEditor?: () => void;
}

export interface CoursePreviewDocument {
  id: string;
  course_id: string;
  name: string;
  type: string;
  file_url: string | null;
  allow_download?: boolean;
}
export interface CoursePreviewAttachment {
  id: string;
  lesson_id: string;
  name: string;
  file_url: string | null;
  file_type: string | null;
  file_size: number | null;
  category: string;
}
interface CoursePreviewData {
  course: Course | null;
  lessons: Lesson[];
  lessonAttachments: Record<string, CoursePreviewAttachment[]>;
  courseDocuments: CoursePreviewDocument[];
}

const coursePreviewKey = (courseId?: string, actorId?: string) => ['coursePreview', courseId, actorId] as const;
const testQuestionsKey = (lessonId?: string, userId?: string) => ['testQuestions', lessonId, userId] as const;

async function fetchLessonContent(lessonId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('lessons').select('content').eq('id', lessonId).maybeSingle();
  if (error) throw error;
  if (!data) throw new Error('Lesson content is unavailable');
  return data.content;
}

async function fetchCoursePreviewData(courseId: string): Promise<CoursePreviewData> {
  const [{ data: courseData, error: courseError }, { data: lessonsData, error: lessonsError }, { data: docsData, error: docsError }, modulesResult] = await Promise.all([
    supabase.from('courses').select('*').eq('id', courseId).single(),
    // PERF: skip heavy `content` column for the list; fetched per-lesson on open.
    supabase
      .from('lessons')
      .select('id, course_id, title, type, order_index, module_id, is_locked, test_passing_score, test_questions_to_show, test_questions_count')
      .eq('course_id', courseId)
      .order('order_index'),
    supabase.from('course_documents').select('*').eq('course_id', courseId).order('created_at'),
    supabase.from('course_modules').select('id, order_index').eq('course_id', courseId).order('order_index'),
  ]);

  if (courseError) throw courseError;
  if (lessonsError) throw lessonsError;
  if (docsError) throw docsError;
  if (modulesResult.error) throw modulesResult.error;

  const lessons = orderCourseLessons((lessonsData || []) as Lesson[], modulesResult.data || []);
  const lessonAttachments: Record<string, CoursePreviewAttachment[]> = {};

  if (lessons.length > 0) {
    const lessonIds = lessons.map(l => l.id);
    const { data: attData, error: attachmentsError } = await supabase
      .from('lesson_attachments')
      .select('*')
      .in('lesson_id', lessonIds)
      .order('order_index');
    if (attachmentsError) throw attachmentsError;
    if (attData) {
      for (const a of attData) {
        if (!lessonAttachments[a.lesson_id]) lessonAttachments[a.lesson_id] = [];
        lessonAttachments[a.lesson_id].push(a);
      }
    }
  }

  return {
    course: courseData as Course,
    lessons,
    lessonAttachments,
    courseDocuments: docsData || [],
  };
}

export function useCoursePreview(options: UseCoursePreviewOptions = {}) {
  const params = useParams();
  const courseId = options.courseIdOverride ?? params.courseId;
  const { user } = useAuth();
  const actorId = user?.id;
  const fileScopeRef = useRef({ actorId, courseId });
  if (fileScopeRef.current.actorId !== actorId || fileScopeRef.current.courseId !== courseId) {
    fileScopeRef.current = { actorId, courseId };
  }
  const fileScope = fileScopeRef.current;
  const mounted = useRef(false);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [searchParams] = useSearchParams();
  const fromStore = searchParams.get('from') === 'store';
  const contentRef = useRef<HTMLDivElement>(null);

  const [currentLessonIndex, setCurrentLessonIndex] = useState(0);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [selectedAnswers, setSelectedAnswers] = useState<Record<string, number>>({});
  const [showDocumentsView, setShowDocumentsView] = useState(false);
  const [selectedFile, setSelectedFile] = useState<{
    scope: typeof fileScope; pane: object; reference: CourseFilePreviewReference;
    source: CoursePreviewDocument | CoursePreviewAttachment;
    purpose: "preview" | "download"; allowDownload: boolean;
  } | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: coursePreviewKey(courseId, actorId),
    queryFn: () => fetchCoursePreviewData(courseId!),
    enabled: !!courseId && !!user,
    staleTime: 60_000,
    gcTime: 5 * 60_000,
    meta: {
      onError: () => toast.error('Ошибка загрузки курса'),
    },
  });

  const course = data?.course?.id === courseId ? data.course : null;
  const lessons = data?.lessons ?? [];
  const lessonAttachments = data?.lessonAttachments ?? {};
  const courseDocuments = course ? data?.courseDocuments ?? [] : [];
  const deliveryMode = useCourseFileDeliveryMode({ courseId, organizationId: course?.organization_id, accessMode: "staff_preview" });
  const legacyEmbeddedMediaAllowed = deliveryMode.view.state === "legacy";

  const baseLesson = showDocumentsView ? null : lessons[currentLessonIndex];

  // Lazy load content for currently opened lesson + prefetch next.
  const currentContentQuery = useQuery({
    queryKey: ['lesson-content', baseLesson?.id],
    enabled: !!baseLesson?.id,
    staleTime: 5 * 60_000,
    queryFn: () => fetchLessonContent(baseLesson!.id),
  });
  const nextLesson = baseLesson ? lessons[currentLessonIndex + 1] : null;
  useQuery({
    queryKey: ['lesson-content', nextLesson?.id],
    enabled: !!nextLesson?.id,
    staleTime: 5 * 60_000,
    queryFn: () => fetchLessonContent(nextLesson!.id),
  });

  const currentLesson = baseLesson ? { ...baseLesson, content: baseLesson.content ?? currentContentQuery.data ?? null } as Lesson : null;
  const { scope: homeworkTaskScope, proof: homeworkTaskProof } = usePlatformHomeworkTaskProof({
    scope: { routeCourseId: courseId, course, lesson: currentLesson, actorId: user?.id },
    content: currentLesson?.content, lessonType: currentLesson?.type,
    enabled: !isLoading && !showDocumentsView && !currentContentQuery.isPending && !currentContentQuery.isError,
    contextKey: JSON.stringify(['preview', !!options.embedded]),
  });

  const { data: testQuestionsData } = useQuery({
    queryKey: testQuestionsKey(currentLesson?.id, user?.id),
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_student_test_questions', {
        p_lesson_id: currentLesson!.id,
      });
      if (error) throw error;
      return (data || []) as TestQuestion[];
    },
    enabled: !!user && !!currentLesson?.id && currentLesson.type === 'test',
    staleTime: 5 * 60_000,
  });

  const testQuestions = testQuestionsData ?? [];
  const paneKey = JSON.stringify([course?.organization_id, showDocumentsView, currentLesson?.id]);
  const paneRef = useRef({ key: paneKey, ticket: {} });
  if (paneRef.current.key !== paneKey) paneRef.current = { key: paneKey, ticket: {} };
  const pane = paneRef.current.ticket;
  const fileView = useRef({ fileScope, pane, course, courseDocuments, lessonAttachments, currentLesson });
  fileView.current = { fileScope, pane, course, courseDocuments, lessonAttachments, currentLesson };
  const openFile = (reference: CourseFilePreviewReference, purpose: "preview" | "download", allowDownload: boolean, source: CoursePreviewDocument | CoursePreviewAttachment) => {
    const current = fileView.current;
    if (!mounted.current || fileScopeRef.current !== fileScope || current.fileScope !== fileScope || current.pane !== pane
      || !actorId || !course || course.id !== courseId || !course.organization_id
      || reference.courseId !== course.id || reference.organizationId !== course.organization_id) return;
    setSelectedFile({ scope: fileScope, pane, reference, purpose, allowDownload, source });
  };
  const openCourseDocument = (doc: CoursePreviewDocument, purpose: "preview" | "download" = "preview") => {
    if (doc.course_id !== courseId || !fileView.current.courseDocuments.includes(doc) || !course?.organization_id) return;
    openFile({ courseId: course.id, organizationId: course.organization_id, referenceKind: "course_document", referenceId: doc.id,
      name: doc.name, fileType: doc.name.split(".").pop() ?? doc.type, legacyUrl: doc.file_url }, purpose,
      course.allow_materials_download !== false && doc.allow_download !== false, doc);
  };
  const openLessonAttachment = (att: CoursePreviewAttachment) => {
    const current = fileView.current;
    if (!current.currentLesson || current.currentLesson.id !== att.lesson_id || !course?.organization_id
      || !current.lessonAttachments[att.lesson_id]?.includes(att)) return;
    openFile({ courseId: course.id, organizationId: course.organization_id, referenceKind: "lesson_attachment", referenceId: att.id,
      name: att.name, fileType: att.file_type, legacyUrl: att.file_url }, "preview", course.allow_materials_download !== false, att);
  };
  const previewFile = selectedFile?.scope === fileScope && selectedFile.pane === pane && course?.id === selectedFile.reference.courseId
    && course.organization_id === selectedFile.reference.organizationId
    && (selectedFile.reference.referenceKind === "course_document"
      ? courseDocuments.some(doc => doc === selectedFile.source)
      : !!currentLesson && lessonAttachments[currentLesson.id]?.some(att => att === selectedFile.source)) ? selectedFile : null;
  const closePreviewFile = () => {
    if (mounted.current && fileScopeRef.current === fileScope && paneRef.current.ticket === pane) setSelectedFile(null);
  };


  // Reset answers when test lesson changes
  useEffect(() => {
    if (currentLesson?.type === 'test') setSelectedAnswers({});
  }, [currentLesson?.id, currentLesson?.type]);

  useEffect(() => {
    if (contentRef.current) contentRef.current.scrollTo({ top: 0, behavior: 'smooth' });
  }, [currentLessonIndex]);

  const transition = (cb: () => void) => {
    setIsTransitioning(true);
    setTimeout(() => { cb(); setIsTransitioning(false); }, 300);
  };

  const goToNextLesson = () => {
    if (currentLessonIndex < lessons.length - 1) transition(() => setCurrentLessonIndex(prev => prev + 1));
  };
  const goToPrevLesson = () => {
    if (currentLessonIndex > 0) transition(() => setCurrentLessonIndex(prev => prev - 1));
  };
  const goToLesson = (index: number) => {
    if (index !== currentLessonIndex || showDocumentsView) {
      setShowDocumentsView(false);
      transition(() => setCurrentLessonIndex(index));
    }
  };
  const goToDocumentsView = () => {
    if (!showDocumentsView) transition(() => setShowDocumentsView(true));
  };

  const navigateBack = () => {
    if (options.onNavigateBack) return options.onNavigateBack();
    if (fromStore) return navigate(getAdminAwareBackPath());
    return courseId ? navigate(getCourseDetailsPath(courseId)) : navigate(getAdminAwareBackPath());
  };
  const navigateToEditor = () => {
    if (options.onNavigateToEditor) return options.onNavigateToEditor();
    return navigate(`/course-builder/${courseId}`);
  };

  // Backwards-compatible refetcher for test questions used by callers (e.g. after submit)
  const fetchTestQuestions = (lessonId: string) => {
    qc.invalidateQueries({ queryKey: testQuestionsKey(lessonId, user?.id) });
  };

  return {
    courseId, course, lessons, currentLesson, currentLessonIndex, homeworkTaskScope, homeworkTaskProof,
    loading: isLoading, isTransitioning,
    lessonContentLoading: !!baseLesson && currentContentQuery.isPending,
    lessonContentError: currentContentQuery.isError,
    reloadLessonContent: () => currentContentQuery.refetch(),
    testQuestions, selectedAnswers, setSelectedAnswers, lessonAttachments, courseDocuments,
    showDocumentsView, previewFile, closePreviewFile, openCourseDocument, openLessonAttachment,
    legacyEmbeddedMediaAllowed, fileDeliveryModeState: deliveryMode.view.state, contentRef, fromStore,
    goToNextLesson, goToPrevLesson, goToLesson, goToDocumentsView,
    navigateBack, navigateToEditor, fetchTestQuestions,
  };
}
