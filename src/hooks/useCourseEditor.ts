import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast as sonnerToast, toast } from "sonner";
import { getAdminAwareBackPath } from "@/lib/utils";
import {
  useSensor, useSensors, PointerSensor, KeyboardSensor, DragEndEvent
} from "@dnd-kit/core";
import { arrayMove, sortableKeyboardCoordinates } from "@dnd-kit/sortable";

interface Course {
  id: string; title: string; description: string | null; duration: string | null;
  is_published: boolean; sequential_lessons: boolean; allow_video_seek: boolean; price?: number;
  organization_id?: string;
}

interface Lesson {
  id: string; title: string; type: string; content: string | null;
  order_index: number; course_id: string; test_questions_count?: number | null; is_locked?: boolean;
}

interface TestQuestion {
  id?: string; question: string; options: string[];
  correct_answer: number; order_index: number; lesson_id?: string;
}

export function useCourseEditor() {
  const { courseId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [course, setCourse] = useState<Course | null>(null);
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [expandedLessonId, setExpandedLessonId] = useState<string | null>(null);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [duration, setDuration] = useState("");
  const [durationHours, setDurationHours] = useState<number | null>(null);
  const [sequentialLessons, setSequentialLessons] = useState(false);
  const [allowVideoSeek, setAllowVideoSeek] = useState(true);
  const [price, setPrice] = useState<number>(0);

  const [isLessonEditorOpen, setIsLessonEditorOpen] = useState(false);
  const [editingLesson, setEditingLesson] = useState<Lesson | null>(null);
  const [editingQuestions, setEditingQuestions] = useState<TestQuestion[]>([]);
  const [deletingLessonId, setDeletingLessonId] = useState<string | null>(null);
  const [isPageSettingsOpen, setIsPageSettingsOpen] = useState(false);
  const [isGitHubImportOpen, setIsGitHubImportOpen] = useState(false);
  const [activeLessonId, setActiveLessonId] = useState<string | null>(null);
  const lessonRefs = useRef<Map<string, HTMLElement>>(new Map());

  const registerLessonRef = useCallback((id: string, el: HTMLElement | null) => {
    if (el) lessonRefs.current.set(id, el);
    else lessonRefs.current.delete(id);
  }, []);

  const scrollToLesson = useCallback((id: string) => {
    const el = lessonRefs.current.get(id);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
      setExpandedLessonId(id);
      setActiveLessonId(id);
    }
  }, []);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  useEffect(() => { if (courseId) fetchCourseData(); }, [courseId]);

  const fetchCourseData = async () => {
    setIsLoading(true);
    const [courseResult, lessonsResult] = await Promise.all([
      supabase.from("courses").select("*").eq("id", courseId).single(),
      supabase.from("lessons").select("*").eq("course_id", courseId).order("order_index"),
    ]);
    if (courseResult.data) {
      setCourse(courseResult.data); setTitle(courseResult.data.title);
      setDescription(courseResult.data.description || ""); setDuration(courseResult.data.duration || "");
      setDurationHours(courseResult.data.frdo_duration_hours ?? null);
      setSequentialLessons(courseResult.data.sequential_lessons ?? false);
      setAllowVideoSeek(courseResult.data.allow_video_seek ?? true);
      setPrice(courseResult.data.price ?? 0);
    }
    if (lessonsResult.data) setLessons(lessonsResult.data);
    setIsLoading(false);
  };

  const handleSaveCourse = async () => {
    if (!courseId || !title.trim()) return;
    setIsSaving(true);
    const { error } = await supabase.from("courses").update({
      title, description: description || null, duration: duration || null,
      frdo_duration_hours: durationHours, sequential_lessons: sequentialLessons,
      allow_video_seek: allowVideoSeek, price: price || 0,
    }).eq("id", courseId);
    setIsSaving(false);
    if (error) toast.error("Ошибка", { description: "Не удалось сохранить курс" });
    else toast.success("Сохранено", { description: "Изменения курса сохранены" });
  };

  const handleTogglePublish = async () => {
    if (!course) return;
    const { error } = await supabase.from("courses").update({ is_published: !course.is_published }).eq("id", course.id);
    if (!error) {
      setCourse({ ...course, is_published: !course.is_published });
      toast.success(course.is_published ? "Снято с публикации" : "Опубликовано");
    }
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const oldIndex = lessons.findIndex(l => l.id === active.id);
      const newIndex = lessons.findIndex(l => l.id === over.id);
      const newLessons = arrayMove(lessons, oldIndex, newIndex);
      setLessons(newLessons);
      for (const [i, lesson] of newLessons.entries()) {
        await supabase.from("lessons").update({ order_index: i }).eq("id", lesson.id);
      }
    }
  };

  const handleAddLesson = () => { setEditingLesson(null); setEditingQuestions([]); setIsLessonEditorOpen(true); };

  const handleEditLesson = async (lesson: Lesson) => {
    setEditingLesson(lesson);
    if (lesson.type === "test") {
      const { data: questions } = await supabase.from("test_questions").select("*").eq("lesson_id", lesson.id).order("order_index");
      if (questions) setEditingQuestions(questions.map(q => ({ id: q.id, question: q.question, options: q.options as string[], correct_answer: q.correct_answer, order_index: q.order_index, lesson_id: q.lesson_id })));
    } else setEditingQuestions([]);
    setIsLessonEditorOpen(true);
  };

  const handleSaveLesson = async (data: { title: string; type: string; content: string; questions?: TestQuestion[]; test_questions_count?: number; aiAvatar?: any; }) => {
    if (!courseId) return;
    const aiAvatarFields = data.type === "ai_avatar" && data.aiAvatar ? {
      ai_avatar_name: data.aiAvatar.ai_avatar_name || null,
      ai_avatar_image_url: data.aiAvatar.ai_avatar_image_url || null,
      ai_avatar_voice_id: data.aiAvatar.ai_avatar_voice_id || null,
      ai_avatar_system_prompt: data.aiAvatar.ai_avatar_system_prompt || null,
      ai_avatar_greeting: data.aiAvatar.ai_avatar_greeting || null,
      ai_avatar_subject: data.aiAvatar.ai_avatar_subject || null,
      ai_avatar_style: data.aiAvatar.ai_avatar_style || null,
      ai_avatar_session_minutes: data.aiAvatar.ai_avatar_session_minutes || 5,
      ai_avatar_model: data.aiAvatar.ai_avatar_model || null,
    } : {};

    if (editingLesson) {
      const { error } = await supabase.from("lessons").update({ title: data.title, type: data.type, content: data.content || null, test_questions_count: data.test_questions_count || null, ...aiAvatarFields }).eq("id", editingLesson.id);
      if (!error) {
        if (data.type === "test" && data.questions) {
          await supabase.from("test_questions").delete().eq("lesson_id", editingLesson.id);
          if (data.questions.length > 0) await supabase.from("test_questions").insert(data.questions.map((q, i) => ({ lesson_id: editingLesson.id, question: q.question, options: q.options, correct_answer: q.correct_answer, order_index: i })));
        }
        setLessons(lessons.map(l => l.id === editingLesson.id ? { ...l, title: data.title, type: data.type, content: data.content, ...aiAvatarFields } : l));
        toast.success("Урок обновлён");
      }
    } else {
      const { data: newLesson, error } = await supabase.from("lessons").insert({ course_id: courseId, title: data.title, type: data.type, content: data.content || null, order_index: lessons.length, test_questions_count: data.test_questions_count || null, ...aiAvatarFields }).select().single();
      if (!error && newLesson) {
        if (data.type === "test" && data.questions?.length) await supabase.from("test_questions").insert(data.questions.map((q, i) => ({ lesson_id: newLesson.id, question: q.question, options: q.options, correct_answer: q.correct_answer, order_index: i })));
        setLessons([...lessons, newLesson]); toast.success("Урок создан");
      }
    }
    setIsLessonEditorOpen(false); setEditingLesson(null); setEditingQuestions([]);
  };

  const handleDeleteLesson = async () => {
    if (!deletingLessonId) return;
    const { error } = await supabase.from("lessons").delete().eq("id", deletingLessonId);
    if (!error) { setLessons(lessons.filter(l => l.id !== deletingLessonId)); toast.success("Урок удалён"); }
    setDeletingLessonId(null);
  };

  const handleToggleLock = async (lesson: Lesson) => {
    const newVal = !lesson.is_locked;
    const { error } = await supabase.from("lessons").update({ is_locked: newVal }).eq("id", lesson.id);
    if (error) { sonnerToast.error("Ошибка сохранения"); return; }
    setLessons(prev => prev.map(l => l.id === lesson.id ? { ...l, is_locked: newVal } : l));
    sonnerToast.success(newVal ? "Урок заблокирован" : "Урок разблокирован");
  };

  const handleGitHubImport = async (data: { title: string; description: string; lessons: { title: string; content: string; type: string }[]; }) => {
    if (!courseId) return;
    if (data.title || data.description) { setTitle(data.title || title); setDescription(data.description || description); }
    for (let i = 0; i < data.lessons.length; i++) {
      const ld = data.lessons[i];
      const { data: newLesson, error } = await supabase.from("lessons").insert({ course_id: courseId, title: ld.title, type: ld.type, content: ld.content, order_index: lessons.length + i }).select().single();
      if (!error && newLesson) setLessons(prev => [...prev, newLesson]);
    }
    toast.success("Импорт завершён", { description: `Импортировано ${data.lessons.length} уроков` });
    setIsGitHubImportOpen(false);
  };

  return {
    courseId, course, lessons, isLoading, isSaving, expandedLessonId, setExpandedLessonId,
    title, setTitle, description, setDescription, duration, setDuration,
    durationHours, setDurationHours, sequentialLessons, setSequentialLessons,
    allowVideoSeek, setAllowVideoSeek, price, setPrice,
    isLessonEditorOpen, setIsLessonEditorOpen, editingLesson, setEditingLesson,
    editingQuestions, setEditingQuestions, deletingLessonId, setDeletingLessonId,
    isPageSettingsOpen, setIsPageSettingsOpen, isGitHubImportOpen, setIsGitHubImportOpen,
    sensors, navigate, handleSaveCourse, handleTogglePublish, handleDragEnd,
    handleAddLesson, handleEditLesson, handleSaveLesson, handleDeleteLesson,
    handleToggleLock, handleGitHubImport,
    activeLessonId, setActiveLessonId, registerLessonRef, scrollToLesson,
  };
}
