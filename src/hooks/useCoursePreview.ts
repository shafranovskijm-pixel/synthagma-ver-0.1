import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { getAdminAwareBackPath, getCourseDetailsPath } from "@/lib/utils";

export interface Lesson {
  id: string;
  title: string;
  type: string;
  content: string | null;
  order_index: number;
  test_questions_count?: number | null;
  is_locked?: boolean;
}

export interface Course {
  id: string;
  title: string;
  description: string | null;
  is_published: boolean;
  allow_materials_download?: boolean;
}

export interface TestQuestion {
  id: string;
  question: string;
  options: unknown;
  correct_answer: number;
  order_index: number;
  image_url?: string | null;
}

export interface UseCoursePreviewOptions {
  courseIdOverride?: string;
  embedded?: boolean;
  onNavigateBack?: () => void;
  onNavigateToEditor?: () => void;
}

interface CoursePreviewData {
  course: Course | null;
  lessons: Lesson[];
  lessonAttachments: Record<string, any[]>;
  courseDocuments: any[];
}

const coursePreviewKey = (courseId?: string) => ['coursePreview', courseId] as const;
const testQuestionsKey = (lessonId?: string) => ['testQuestions', lessonId] as const;

async function fetchCoursePreviewData(courseId: string): Promise<CoursePreviewData> {
  const [{ data: courseData, error: courseError }, { data: lessonsData, error: lessonsError }, { data: docsData }] = await Promise.all([
    supabase.from('courses').select('*').eq('id', courseId).single(),
    // PERF: skip heavy `content` column for the list; fetched per-lesson on open.
    supabase
      .from('lessons')
      .select('id, course_id, title, type, order_index, module_id, is_locked, test_passing_score, test_questions_to_show, test_questions_count')
      .eq('course_id', courseId)
      .order('order_index'),
    supabase.from('course_documents').select('*').eq('course_id', courseId).order('created_at'),
  ]);

  if (courseError) throw courseError;
  if (lessonsError) throw lessonsError;

  const lessons = (lessonsData || []) as Lesson[];
  let lessonAttachments: Record<string, any[]> = {};

  if (lessons.length > 0) {
    const lessonIds = lessons.map(l => l.id);
    const { data: attData } = await supabase
      .from('lesson_attachments')
      .select('*')
      .in('lesson_id', lessonIds)
      .order('order_index');
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
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [searchParams] = useSearchParams();
  const fromStore = searchParams.get('from') === 'store';
  const contentRef = useRef<HTMLDivElement>(null);

  const [currentLessonIndex, setCurrentLessonIndex] = useState(0);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [selectedAnswers, setSelectedAnswers] = useState<Record<string, number>>({});
  const [showDocumentsView, setShowDocumentsView] = useState(false);
  const [previewFile, setPreviewFile] = useState<{ url: string; name: string; type: string | null } | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: coursePreviewKey(courseId),
    queryFn: () => fetchCoursePreviewData(courseId!),
    enabled: !!courseId && !!user,
    staleTime: 60_000,
    gcTime: 5 * 60_000,
    meta: {
      onError: () => toast.error('Ошибка загрузки курса'),
    },
  });

  const course = data?.course ?? null;
  const lessons = data?.lessons ?? [];
  const lessonAttachments = data?.lessonAttachments ?? {};
  const courseDocuments = data?.courseDocuments ?? [];

  const currentLesson = showDocumentsView ? null : lessons[currentLessonIndex];

  const { data: testQuestionsData } = useQuery({
    queryKey: testQuestionsKey(currentLesson?.id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('test_questions_for_students')
        .select('*')
        .eq('lesson_id', currentLesson!.id)
        .order('order_index');
      if (error) throw error;
      return (data || []) as TestQuestion[];
    },
    enabled: !!currentLesson?.id && currentLesson.type === 'test',
    staleTime: 5 * 60_000,
  });

  const testQuestions = testQuestionsData ?? [];

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
    qc.invalidateQueries({ queryKey: testQuestionsKey(lessonId) });
  };

  return {
    courseId, course, lessons, currentLesson, currentLessonIndex,
    loading: isLoading, isTransitioning,
    testQuestions, selectedAnswers, setSelectedAnswers, lessonAttachments, courseDocuments,
    showDocumentsView, previewFile, setPreviewFile, contentRef, fromStore,
    goToNextLesson, goToPrevLesson, goToLesson, goToDocumentsView,
    navigateBack, navigateToEditor, fetchTestQuestions,
  };
}
