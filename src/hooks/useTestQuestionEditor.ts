import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { safeInvoke } from "@/utils/safeInvoke";
import { toast } from "sonner";
import type { Json } from "@/integrations/supabase/types";
import { useExternalStorage } from "@/hooks/useExternalStorage";

export interface QuestionOption {
  text: string;
}

export interface TestQuestion {
  id: string;
  question: string;
  options: QuestionOption[];
  correct_answer: number;
  order_index: number;
  explanation?: string;
  image_url?: string | null;
  isNew?: boolean;
  isDeleted?: boolean;
}

interface UseTestQuestionEditorProps {
  lessonId: string;
  courseId: string | undefined;
  generatedQuestions?: Array<{
    question: string;
    options: string[];
    correctAnswer: number;
    explanation?: string;
  }>;
  onQuestionsProcessed?: () => void;
  onQuestionsChange?: (questions: TestQuestion[]) => void;
  initialQuestions?: TestQuestion[];
}

export function useTestQuestionEditor({
  lessonId,
  courseId,
  generatedQuestions,
  onQuestionsProcessed,
  onQuestionsChange,
  initialQuestions,
}: UseTestQuestionEditorProps) {
  const [questions, setQuestions] = useState<TestQuestion[]>(initialQuestions || []);
  const [isLoading, setIsLoading] = useState(!initialQuestions || initialQuestions.length === 0);
  const [isSaving, setIsSaving] = useState(false);
  const [generatingExplanationId, setGeneratingExplanationId] = useState<string | null>(null);
  const [uploadingImageId, setUploadingImageId] = useState<string | null>(null);
  const [hasFetched, setHasFetched] = useState(false);
  const { uploadFile } = useExternalStorage();

  const onQuestionsChangeRef = useRef(onQuestionsChange);
  onQuestionsChangeRef.current = onQuestionsChange;

  useEffect(() => {
    onQuestionsChangeRef.current?.(questions.filter(q => !q.isDeleted));
  }, [questions]);

  // Handle generated questions from AI
  useEffect(() => {
    if (generatedQuestions && generatedQuestions.length > 0) {
      const newQuestions: TestQuestion[] = generatedQuestions.map((q, index) => ({
        id: crypto.randomUUID(),
        question: q.question,
        options: q.options.map(text => ({ text })),
        correct_answer: q.correctAnswer,
        order_index: questions.length + index,
        explanation: q.explanation || undefined,
        isNew: true,
      }));
      setQuestions(prev => [...prev, ...newQuestions]);
      onQuestionsProcessed?.();
      toast.success(`Добавлено ${newQuestions.length} вопросов`);
    }
  }, [generatedQuestions]);

  // Sync correct_answer from parent
  useEffect(() => {
    if (!initialQuestions || initialQuestions.length === 0) return;
    setQuestions(prev => {
      let changed = false;
      const updated = prev.map(q => {
        const match = initialQuestions.find((iq: TestQuestion) => iq.id === q.id);
        if (match && match.correct_answer !== q.correct_answer) {
          changed = true;
          return { ...q, correct_answer: match.correct_answer };
        }
        return q;
      });
      return changed ? updated : prev;
    });
  }, [initialQuestions]);

  // Fetch questions on mount
  useEffect(() => {
    if (hasFetched) return;
    const fetchQuestions = async () => {
      if ((initialQuestions && initialQuestions.length > 0) || !lessonId) {
        setIsLoading(false);
        setHasFetched(true);
        return;
      }
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!uuidRegex.test(lessonId)) {
        setIsLoading(false);
        setHasFetched(true);
        return;
      }
      try {
        const { data: lessonData, error: lessonError } = await supabase.from("lessons").select("id").eq("id", lessonId).maybeSingle();
        if (lessonError || !lessonData) { setIsLoading(false); setHasFetched(true); return; }
        const { data, error } = await supabase.from("test_questions").select("*").eq("lesson_id", lessonId).order("order_index");
        if (error) console.error("Error fetching questions:", error);
        else if (data && data.length > 0) {
          setQuestions(data.map(q => ({
            id: q.id, question: q.question,
            options: (q.options as unknown as QuestionOption[]) || [],
            correct_answer: q.correct_answer, order_index: q.order_index,
            explanation: (q as any).explanation || '', image_url: q.image_url || null,
          })));
        }
      } catch (err) { console.error("Error in fetchQuestions:", err); }
      setIsLoading(false);
      setHasFetched(true);
    };
    fetchQuestions();
  }, [lessonId, hasFetched]);

  const addQuestion = () => {
    setQuestions([...questions, {
      id: crypto.randomUUID(), question: "",
      options: [{ text: "" }, { text: "" }, { text: "" }, { text: "" }],
      correct_answer: 0, order_index: questions.length,
      explanation: "", image_url: null, isNew: true,
    }]);
  };

  const updateQuestion = (id: string, updates: Partial<TestQuestion>) => {
    setQuestions(questions.map(q => q.id === id ? { ...q, ...updates } : q));
  };

  const updateOption = (questionId: string, optionIndex: number, text: string) => {
    setQuestions(questions.map(q => {
      if (q.id === questionId) {
        const newOptions = [...q.options];
        newOptions[optionIndex] = { text };
        return { ...q, options: newOptions };
      }
      return q;
    }));
  };

  const addOption = (questionId: string) => {
    setQuestions(questions.map(q => {
      if (q.id === questionId && q.options.length < 6) return { ...q, options: [...q.options, { text: "" }] };
      return q;
    }));
  };

  const removeOption = (questionId: string, optionIndex: number) => {
    setQuestions(questions.map(q => {
      if (q.id === questionId && q.options.length > 2) {
        const newOptions = q.options.filter((_, i) => i !== optionIndex);
        let newCorrect = q.correct_answer;
        if (optionIndex === q.correct_answer) newCorrect = 0;
        else if (optionIndex < q.correct_answer) newCorrect = q.correct_answer - 1;
        return { ...q, options: newOptions, correct_answer: newCorrect };
      }
      return q;
    }));
  };

  const deleteQuestion = (id: string) => {
    const question = questions.find(q => q.id === id);
    if (question?.isNew) setQuestions(questions.filter(q => q.id !== id));
    else setQuestions(questions.map(q => q.id === id ? { ...q, isDeleted: true } : q));
  };

  const handleImageUpload = async (questionId: string, file: File) => {
    if (!file.type.startsWith("image/")) { toast.error("Выберите изображение"); return; }
    if (file.size > 5 * 1024 * 1024) { toast.error("Максимальный размер 5 МБ"); return; }
    setUploadingImageId(questionId);
    try {
      const fileExt = file.name.split(".").pop();
      const fileName = `question-images/${questionId}-${Date.now()}.${fileExt}`;
      const result = await uploadFile(file, "course-files", fileName);
      if (!result) throw new Error("Ошибка загрузки файла");
      updateQuestion(questionId, { image_url: result.url });
      toast.success("Изображение загружено");
    } catch (error: any) {
      console.error("Error uploading image:", error);
      toast.error("Ошибка загрузки: " + (error.message || "Попробуйте позже"));
    } finally { setUploadingImageId(null); }
  };

  const removeImage = (questionId: string) => updateQuestion(questionId, { image_url: null });

  const generateExplanation = async (questionId: string) => {
    const question = questions.find(q => q.id === questionId);
    if (!question || !question.question.trim()) { toast.error("Сначала заполните вопрос"); return; }
    if (question.options.filter(o => o.text.trim()).length < 2) { toast.error("Добавьте минимум 2 варианта ответа"); return; }
    if (question.correct_answer === null || question.correct_answer === undefined) { toast.error("Сначала отметьте правильный ответ"); return; }
    setGeneratingExplanationId(questionId);
    try {
      const { data, error } = await safeInvoke<any>("generate-explanation", {
        body: { question: question.question, options: question.options.map(o => o.text), correctAnswer: question.correct_answer },
      });
      if (error) throw error;
      if (data.explanation) { updateQuestion(questionId, { explanation: data.explanation }); toast.success("Пояснение сгенерировано"); }
    } catch (error: any) {
      console.error("Error generating explanation:", error);
      toast.error("Ошибка генерации: " + (error.message || "Попробуйте позже"));
    } finally { setGeneratingExplanationId(null); }
  };

  const saveQuestions = async (): Promise<boolean> => {
    if (!courseId) { toast.error("Сначала сохраните курс"); return false; }
    const { data: lessonExists } = await supabase.from("lessons").select("id").eq("id", lessonId).maybeSingle();
    if (!lessonExists) return true;
    const activeQuestions = questions.filter(q => !q.isDeleted);
    for (const q of activeQuestions) {
      if (!q.question.trim()) { toast.error("Заполните текст вопроса"); return false; }
      if (q.options.filter(o => o.text.trim()).length < 2) { toast.error("Добавьте минимум 2 варианта ответа"); return false; }
    }
    setIsSaving(true);
    try {
      for (const q of questions.filter(q => q.isDeleted && !q.isNew)) {
        const { error } = await supabase.from("test_questions").delete().eq("id", q.id);
        if (error) throw error;
      }
      for (let i = 0; i < activeQuestions.length; i++) {
        const q = activeQuestions[i];
        const { error } = await supabase.from("test_questions").upsert([{
          id: q.id, lesson_id: lessonId, question: q.question.trim(),
          options: q.options.filter(o => o.text.trim()) as unknown as Json,
          correct_answer: q.correct_answer, order_index: i,
          explanation: q.explanation || null, image_url: q.image_url || null,
        }], { onConflict: "id" });
        if (error) throw error;
      }
      setQuestions(activeQuestions.map((q, i) => ({ ...q, order_index: i, isNew: false })));
      return true;
    } catch (error: any) {
      console.error("Error saving questions:", error);
      toast.error("Ошибка сохранения вопросов: " + error.message);
      return false;
    } finally { setIsSaving(false); }
  };

  const visibleQuestions = questions.filter(q => !q.isDeleted);

  return {
    questions, visibleQuestions, isLoading, isSaving,
    generatingExplanationId, uploadingImageId,
    addQuestion, updateQuestion, updateOption, addOption, removeOption,
    deleteQuestion, handleImageUpload, removeImage, generateExplanation, saveQuestions,
  };
}
