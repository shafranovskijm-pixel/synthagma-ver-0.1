import { useState, useEffect, useCallback, useRef } from "react";
import { ContentBlock, parseLessonContent } from "@/components/course-builder/BlockEditor";
import { safeInvoke } from "@/utils/safeInvoke";
import { useExternalStorageWithProgress } from "@/hooks/useExternalStorageWithProgress";
import { toast } from "sonner";
import { getErrorMessage } from "@/utils/handleSupabaseError";
import { defaultAIAvatarConfig, type AIAvatarConfig } from "@/components/course-builder/AIAvatarLessonEditor";

interface Lesson {
  id: string;
  title: string;
  type: string;
  content: string | null;
  order_index: number;
  course_id?: string;
  test_questions_count?: number;
  [key: string]: any;
}

export interface TestQuestion {
  id?: string;
  question: string;
  options: string[];
  correct_answer: number;
  order_index: number;
}

interface UseLessonEditorProps {
  lesson: Lesson | null;
  isOpen: boolean;
  existingQuestions: TestQuestion[];
  courseId: string;
  courseTitle: string;
  courseDescription: string;
  onSave: (data: {
    title: string;
    type: string;
    content: string;
    questions?: TestQuestion[];
    test_questions_count?: number;
    aiAvatar?: AIAvatarConfig;
  }) => void;
}

export function useLessonEditor({
  lesson, isOpen, existingQuestions, courseId, courseTitle, courseDescription, onSave
}: UseLessonEditorProps) {
  const [title, setTitle] = useState("");
  const [type, setType] = useState("text");
  const [blocks, setBlocks] = useState<ContentBlock[]>([]);
  const [videoUrl, setVideoUrl] = useState("");
  const [questions, setQuestions] = useState<TestQuestion[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [testQuestionsCount, setTestQuestionsCount] = useState(5);
  const [aiAvatar, setAiAvatar] = useState<AIAvatarConfig>(defaultAIAvatarConfig);

  const videoInputRef = useRef<HTMLInputElement>(null);
  const [showMediaLibrary, setShowMediaLibrary] = useState(false);
  const [videoUploadProgress, setVideoUploadProgress] = useState<number | null>(null);
  const { uploadWithProgress, abortUpload } = useExternalStorageWithProgress();
  const isUploading = videoUploadProgress !== null;

  const parseContent = useCallback((content: string | null, lessonType: string) => {
    if (lessonType === "video") { setVideoUrl(content || ""); setBlocks([]); return; }
    setVideoUrl("");
    setBlocks(parseLessonContent(content));
  }, []);

  useEffect(() => {
    if (lesson) {
      setTitle(lesson.title);
      setType(lesson.type);
      parseContent(lesson.content, lesson.type);
      setQuestions(existingQuestions);
      setTestQuestionsCount(lesson.test_questions_count || 5);
      setAiAvatar({
        ai_avatar_name: lesson.ai_avatar_name || "",
        ai_avatar_image_url: lesson.ai_avatar_image_url || "",
        ai_avatar_voice_id: lesson.ai_avatar_voice_id || "Nec_24000",
        ai_avatar_system_prompt: lesson.ai_avatar_system_prompt || "",
        ai_avatar_greeting: lesson.ai_avatar_greeting || "",
        ai_avatar_subject: lesson.ai_avatar_subject || "",
        ai_avatar_style: lesson.ai_avatar_style || "friendly",
        ai_avatar_session_minutes: lesson.ai_avatar_session_minutes || 5,
        ai_avatar_model: lesson.ai_avatar_model || "google/gemini-3-flash-preview",
        ai_avatar_stt_provider: lesson.ai_avatar_stt_provider || "deepgram",
        ai_avatar_stt_model: lesson.ai_avatar_stt_model || "nova-2",
        ai_avatar_llm_provider: lesson.ai_avatar_llm_provider || "openai",
        ai_avatar_llm_model: lesson.ai_avatar_llm_model || "gpt-4o-mini",
        ai_avatar_tts_provider: lesson.ai_avatar_tts_provider || "elevenlabs",
        ai_avatar_tts_voice: lesson.ai_avatar_tts_voice || "EXAVITQu4vr4xnSDxMaL",
        ai_avatar_language: lesson.ai_avatar_language || "ru",
        ai_avatar_allow_interruptions: lesson.ai_avatar_allow_interruptions ?? true,
      });
    } else {
      setTitle(""); setType("text"); setBlocks([]); setVideoUrl(""); setQuestions([]); setTestQuestionsCount(5);
      setAiAvatar(defaultAIAvatarConfig);
    }
  }, [lesson, existingQuestions, isOpen, parseContent]);

  const handleAddQuestion = () => {
    setQuestions([...questions, { question: "", options: ["", "", "", ""], correct_answer: 0, order_index: questions.length }]);
  };

  const handleUpdateQuestion = (index: number, field: string, value: any) => {
    const updated = [...questions];
    if (field === "option") {
      updated[index].options[value.optionIndex] = value.text;
    } else {
      (updated[index] as any)[field] = value;
    }
    setQuestions(updated);
  };

  const handleRemoveQuestion = (index: number) => {
    setQuestions(questions.filter((_, i) => i !== index));
  };

  const handleGenerateContent = async () => {
    if (!title.trim()) {
      toast.error("Введите название урока", { description: "Для генерации контента нужно указать название урока" });
      return;
    }
    setIsGenerating(true);
    try {
      const { data, error } = await safeInvoke<any>("generate-lesson-content", {
        body: { lessonTitle: title, lessonType: type, courseTitle, courseDescription }
      });
      if (error) throw error;
      if (data.error) { toast.error("Ошибка генерации", { description: data.error }); return; }
      if (type === "test" && data.questions) {
        setQuestions(data.questions.map((q: any, index: number) => ({
          question: q.question, options: q.options, correct_answer: q.correctAnswer, order_index: index
        })));
        toast.success("✨ Тест сгенерирован", { description: `Создано ${data.questions.length} вопросов.` });
      } else if (data.blocks) {
        setBlocks(data.blocks.map((block: any) => ({ id: crypto.randomUUID(), type: block.type, content: block.content })));
        toast.success("✨ Контент сгенерирован", { description: "Отредактируйте содержание при необходимости." });
      }
    } catch (error) {
      console.error("Generate content error:", error);
      toast.error("Ошибка", { description: "Не удалось сгенерировать контент" });
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSave = () => {
    if (!title.trim()) return;
    let content = "";
    if (type === "text") content = JSON.stringify(blocks);
    else if (type === "video") content = videoUrl;
    onSave({
      title, type, content,
      questions: type === "test" ? questions : undefined,
      test_questions_count: type === "test" ? testQuestionsCount : undefined,
      aiAvatar: type === "ai_avatar" ? aiAvatar : undefined,
    });
  };

  const handleVideoUpload = async (file: File) => {
    const fileName = `${courseId}/${Date.now()}-${file.name}`;
    setVideoUploadProgress(0);
    try {
      const result = await uploadWithProgress(file, 'course-files', fileName, (percent) => setVideoUploadProgress(percent));
      if (result) { setVideoUrl(result.url); toast.success("Видео загружено"); }
    } catch (err) {
      const msg = getErrorMessage(err);
      if (msg !== 'Загрузка отменена') toast.error("Ошибка загрузки", { description: msg });
    } finally {
      setVideoUploadProgress(null);
    }
  };

  return {
    title, setTitle, type, setType,
    blocks, setBlocks, videoUrl, setVideoUrl,
    questions, setQuestions,
    isGenerating, testQuestionsCount, setTestQuestionsCount,
    aiAvatar, setAiAvatar,
    videoInputRef, showMediaLibrary, setShowMediaLibrary,
    videoUploadProgress, setVideoUploadProgress,
    isUploading, abortUpload,
    handleAddQuestion, handleUpdateQuestion, handleRemoveQuestion,
    handleGenerateContent, handleSave, handleVideoUpload,
  };
}
