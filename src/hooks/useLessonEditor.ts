import { useState, useEffect, useCallback, useRef } from "react";
import { ContentBlock } from "@/components/course-builder/BlockEditor";
import { safeInvoke } from "@/utils/safeInvoke";
import { useExternalStorageWithProgress } from "@/hooks/useExternalStorageWithProgress";
import { toast } from "sonner";

interface Lesson {
  id: string;
  title: string;
  type: string;
  content: string | null;
  order_index: number;
  course_id?: string;
  test_questions_count?: number;
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

  const videoInputRef = useRef<HTMLInputElement>(null);
  const [showMediaLibrary, setShowMediaLibrary] = useState(false);
  const [videoUploadProgress, setVideoUploadProgress] = useState<number | null>(null);
  const { uploadWithProgress, abortUpload } = useExternalStorageWithProgress();
  const isUploading = videoUploadProgress !== null;

  const parseContent = useCallback((content: string | null, lessonType: string) => {
    if (!content) { setBlocks([]); setVideoUrl(""); return; }
    if (lessonType === "video") { setVideoUrl(content); setBlocks([]); return; }
    try {
      const parsed = JSON.parse(content);
      if (Array.isArray(parsed)) { setBlocks(parsed); return; }
    } catch {
      const lines = content.split('\n').filter(line => line.trim());
      const convertedBlocks: ContentBlock[] = lines.map((line) => {
        const id = crypto.randomUUID();
        if (line.startsWith('# ')) return { id, type: 'heading1' as const, content: line.slice(2) };
        if (line.startsWith('## ') || line.startsWith('### ')) return { id, type: 'heading2' as const, content: line.replace(/^#{2,3}\s/, '') };
        if (line.startsWith('> ')) return { id, type: 'quote' as const, content: line.slice(2) };
        if (line.startsWith('- ') || line.startsWith('* ')) return { id, type: 'bulletList' as const, content: line.slice(2) };
        if (/^\d+\.\s/.test(line)) return { id, type: 'numberedList' as const, content: line.replace(/^\d+\.\s/, '') };
        if (line.startsWith('![')) { const match = line.match(/!\[.*?\]\((.*?)\)/); return { id, type: 'image' as const, content: '', imageSrc: match?.[1] || '' }; }
        return { id, type: 'paragraph' as const, content: line };
      });
      setBlocks(convertedBlocks.length > 0 ? convertedBlocks : []);
    }
  }, []);

  useEffect(() => {
    if (lesson) {
      setTitle(lesson.title);
      setType(lesson.type);
      parseContent(lesson.content, lesson.type);
      setQuestions(existingQuestions);
      setTestQuestionsCount(lesson.test_questions_count || 5);
    } else {
      setTitle(""); setType("text"); setBlocks([]); setVideoUrl(""); setQuestions([]); setTestQuestionsCount(5);
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
    onSave({ title, type, content, questions: type === "test" ? questions : undefined, test_questions_count: type === "test" ? testQuestionsCount : undefined });
  };

  const handleVideoUpload = async (file: File) => {
    const fileName = `${courseId}/${Date.now()}-${file.name}`;
    setVideoUploadProgress(0);
    try {
      const result = await uploadWithProgress(file, 'course-files', fileName, (percent) => setVideoUploadProgress(percent));
      if (result) { setVideoUrl(result.url); toast.success("Видео загружено"); }
    } catch (err: any) {
      if (err.message !== 'Загрузка отменена') toast.error("Ошибка загрузки", { description: err.message });
    } finally {
      setVideoUploadProgress(null);
    }
  };

  return {
    title, setTitle, type, setType,
    blocks, setBlocks, videoUrl, setVideoUrl,
    questions, setQuestions,
    isGenerating, testQuestionsCount, setTestQuestionsCount,
    videoInputRef, showMediaLibrary, setShowMediaLibrary,
    videoUploadProgress, setVideoUploadProgress,
    isUploading, abortUpload,
    handleAddQuestion, handleUpdateQuestion, handleRemoveQuestion,
    handleGenerateContent, handleSave, handleVideoUpload,
  };
}
