import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { getAdminAwareBackPath } from "@/lib/utils";

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

export function useCoursePreview() {
  const { courseId } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const fromStore = searchParams.get('from') === 'store';
  const contentRef = useRef<HTMLDivElement>(null);

  const [course, setCourse] = useState<Course | null>(null);
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [currentLessonIndex, setCurrentLessonIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [testQuestions, setTestQuestions] = useState<TestQuestion[]>([]);
  const [selectedAnswers, setSelectedAnswers] = useState<Record<string, number>>({});
  const [lessonAttachments, setLessonAttachments] = useState<Record<string, any[]>>({});
  const [courseDocuments, setCourseDocuments] = useState<any[]>([]);
  const [showDocumentsView, setShowDocumentsView] = useState(false);
  const [previewFile, setPreviewFile] = useState<{ url: string; name: string; type: string | null } | null>(null);

  const currentLesson = showDocumentsView ? null : lessons[currentLessonIndex];

  useEffect(() => {
    if (courseId && user) fetchCourseData();
  }, [courseId, user]);

  useEffect(() => {
    if (currentLesson?.type === 'test') fetchTestQuestions(currentLesson.id);
  }, [currentLesson?.id, currentLesson?.type]);

  useEffect(() => {
    if (contentRef.current) contentRef.current.scrollTo({ top: 0, behavior: 'smooth' });
  }, [currentLessonIndex]);

  const fetchCourseData = async () => {
    try {
      const { data: courseData, error: courseError } = await supabase
        .from('courses').select('*').eq('id', courseId).single();
      if (courseError) throw courseError;
      setCourse(courseData);

      const { data: lessonsData, error: lessonsError } = await supabase
        .from('lessons').select('*').eq('course_id', courseId).order('order_index');
      if (lessonsError) throw lessonsError;
      setLessons(lessonsData || []);

      if (lessonsData && lessonsData.length > 0) {
        const lessonIds = lessonsData.map(l => l.id);
        const { data: attData } = await supabase
          .from('lesson_attachments').select('*').in('lesson_id', lessonIds).order('order_index');
        if (attData) {
          const map: Record<string, any[]> = {};
          for (const a of attData) {
            if (!map[a.lesson_id]) map[a.lesson_id] = [];
            map[a.lesson_id].push(a);
          }
          setLessonAttachments(map);
        }
      }

      const { data: docsData } = await supabase
        .from('course_documents').select('*').eq('course_id', courseId!).order('created_at');
      setCourseDocuments(docsData || []);
    } catch (error) {
      console.error('Error fetching course:', error);
      toast.error('Ошибка загрузки курса');
    } finally {
      setLoading(false);
    }
  };

  const fetchTestQuestions = async (lessonId: string) => {
    const { data, error } = await supabase
      .from('test_questions_for_students').select('*').eq('lesson_id', lessonId).order('order_index');
    if (error) { console.error('Error fetching questions:', error); return; }
    setTestQuestions(data || []);
    setSelectedAnswers({});
  };

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

  const navigateBack = () => fromStore ? navigate(getAdminAwareBackPath()) : navigate(`/course-builder/${courseId}`);
  const navigateToEditor = () => navigate(`/course-builder/${courseId}`);

  return {
    courseId, course, lessons, currentLesson, currentLessonIndex, loading, isTransitioning,
    testQuestions, selectedAnswers, setSelectedAnswers, lessonAttachments, courseDocuments,
    showDocumentsView, previewFile, setPreviewFile, contentRef, fromStore,
    goToNextLesson, goToPrevLesson, goToLesson, goToDocumentsView,
    navigateBack, navigateToEditor, fetchTestQuestions,
  };
}
