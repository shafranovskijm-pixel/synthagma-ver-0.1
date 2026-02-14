import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { SigmaLogo } from "@/components/ui/SigmaLogo";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import {
  ArrowLeft, Plus, Save, Sparkles, Loader2, FileUp, Wand2,
  Eye, FileText, Video, Headphones, Image as ImageIcon, FileQuestion, Presentation,
} from "lucide-react";
import { AIGenerateDialog, AIGenerateType } from "@/components/course-builder/AIGenerateDialog";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { ContentBlock, htmlToBlocks, blocksToJson, jsonToBlocks } from "@/components/course-builder/BlockEditor";
import {
  DndContext, closestCenter, KeyboardSensor, PointerSensor,
  useSensor, useSensors, DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove, SortableContext, sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import {
  getExternalStorageConfig, uploadToStorage,
} from "@/utils/courseBuilderHelpers";
import {
  type LessonType, type TestQuestionLocal, type Lesson, type GeneratedQuestion,
  lessonIcons, lessonColors,
} from "@/components/course-builder/LessonTypeConfig";
import { SortableLessonItem } from "@/components/course-builder/SortableLessonItem";

export default function CourseBuilder() {
  const navigate = useNavigate();
  const { courseId } = useParams();
  const { user } = useAuth();
  const [courseTitle, setCourseTitle] = useState("");
  const [courseDescription, setCourseDescription] = useState("");
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(!!courseId);
  const [isImporting, setIsImporting] = useState(false);
  const [organizationId, setOrganizationId] = useState<string | null>(null);
  const [isDataLoaded, setIsDataLoaded] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [showExitDialog, setShowExitDialog] = useState(false);
  const [showAIGenerateDialog, setShowAIGenerateDialog] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Track unsaved changes
  const markAsChanged = useCallback(() => {
    setHasUnsavedChanges(true);
  }, []);

  // Wrapper for setLessons that marks changes
  const updateLessons = useCallback((updater: Lesson[] | ((prev: Lesson[]) => Lesson[])) => {
    setLessons(updater);
    markAsChanged();
  }, [markAsChanged]);

  // Handle back button click
  const handleBackClick = () => {
    if (hasUnsavedChanges) {
      setShowExitDialog(true);
    } else {
      navigate("/organization");
    }
  };

  const handleSaveAndExit = async () => {
    await saveCourse();
    setShowExitDialog(false);
    navigate("/organization");
  };

  const handleExitWithoutSave = () => {
    setShowExitDialog(false);
    navigate("/organization");
  };

  // Import multiple files - chunked to avoid backend worker limits
  const handleFileImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files;
    if (!fileList || fileList.length === 0) return;

    const CHUNK_SIZE = 3;

    // Sort files (by number in name, then alphabetically) to keep a sensible course order
    const allFiles = Array.from(fileList).sort((a, b) => {
      const na = a.name.match(/(\d+(?:[\.,]\d+)*)/)?.[1];
      const nb = b.name.match(/(\d+(?:[\.,]\d+)*)/)?.[1];
      if (na && nb) return na.localeCompare(nb, 'ru', { numeric: true });
      return a.name.localeCompare(b.name, 'ru', { numeric: true });
    });

    setIsImporting(true);

    try {
      let totalImported = 0;

      for (let offset = 0; offset < allFiles.length; offset += CHUNK_SIZE) {
        const chunk = allFiles.slice(offset, offset + CHUNK_SIZE);

        const formData = new FormData();
        chunk.forEach((file, i) => formData.append(`file_${offset + i}`, file));

        const { data, error } = await supabase.functions.invoke("import-course", {
          body: formData,
        });

        if (error) {
          throw new Error(error.message || "Ошибка импорта");
        }

        if (!data.success) {
          throw new Error(data.error || 'Ошибка импорта');
        }

        if (!courseTitle && data.courseTitle) {
          setCourseTitle(data.courseTitle);
        }

        const importedLessons: Lesson[] = (data.lessons || []).map((l: any) => {
          const blocks = htmlToBlocks(l.content || "");
          return {
            id: l.id,
            type: "text" as LessonType,
            title: l.title,
            content: blocksToJson(blocks),
            blocks: blocks,
            expanded: false,
          };
        });

        totalImported += importedLessons.length;
        setLessons((prev) => [...prev, ...importedLessons]);
      }

      toast.success(
        `Импортировано ${totalImported} ${totalImported === 1 ? 'лекция' : totalImported < 5 ? 'лекции' : 'лекций'}`
      );
    } catch (error: any) {
      console.error('Import error:', error);
      toast.error(error.message || 'Ошибка импорта файлов');
    } finally {
      setIsImporting(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  useEffect(() => {
    const fetchData = async () => {
      if (!user) return;
      if (isDataLoaded) return;

      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("organization_id")
        .eq("user_id", user.id)
        .maybeSingle();

      if (profileError) {
        console.error("Profile fetch error:", profileError);
      }

      if (profile?.organization_id) {
        setOrganizationId(profile.organization_id);
      }

      if (courseId) {
        const { data: course } = await supabase
          .from("courses")
          .select("*")
          .eq("id", courseId)
          .single();

        if (course) {
          setCourseTitle(course.title);
          setCourseDescription(course.description || "");
          if (!profile?.organization_id && course.organization_id) {
            setOrganizationId(course.organization_id);
          }
        }

        const { data: lessonsData } = await supabase
          .from("lessons")
          .select("*")
          .eq("course_id", courseId)
          .order("order_index");

        if (lessonsData) {
          // Load questions for test lessons
          const testLessonIds = lessonsData.filter(l => l.type === 'test').map(l => l.id);
          let questionsMap: Record<string, TestQuestionLocal[]> = {};
          
          if (testLessonIds.length > 0) {
            const { data: questionsData } = await supabase
              .from("test_questions")
              .select("*")
              .in("lesson_id", testLessonIds)
              .order("order_index");
            
            if (questionsData) {
              for (const q of questionsData) {
                if (!questionsMap[q.lesson_id]) {
                  questionsMap[q.lesson_id] = [];
                }
                questionsMap[q.lesson_id].push({
                  id: q.id,
                  question: q.question,
                  options: (q.options as unknown as { text: string }[]) || [],
                  correct_answer: q.correct_answer,
                  order_index: q.order_index,
                  explanation: (q as any).explanation || '',
                  image_url: q.image_url || null,
                  isNew: false,
                  isDeleted: false,
                });
              }
            }
          }

          setLessons(lessonsData.map(l => {
            const blocks = l.content ? jsonToBlocks(l.content) : [];
            return {
              id: l.id,
              type: l.type as LessonType,
              title: l.title,
              content: l.content || "",
              blocks: blocks.length > 0 ? blocks : undefined,
              expanded: false,
              // Test settings from DB
              testPassingScore: (l as any).test_passing_score ?? 60,
              testQuestionsToShow: (l as any).test_questions_to_show ?? null,
              // Load questions for test lessons
              questions: l.type === 'test' ? (questionsMap[l.id] || []) : undefined,
            };
          }));
        }
        setIsLoading(false);
      } else {
        setIsLoading(false);
      }

      setIsDataLoaded(true);
    };

    fetchData();
  }, [user, courseId, isDataLoaded]);

  const addLesson = (type: LessonType) => {
    const typeNames: Record<LessonType, string> = {
      text: "урок",
      video: "видеоурок",
      image: "материал",
      test: "тест",
      audio: "аудиолекция",
      lesson: "урок",
      slider: "презентация"
    };
    const newLesson: Lesson = {
      id: crypto.randomUUID(),
      type,
      title: `Новый ${typeNames[type]}`,
      content: "",
      expanded: true,
      blocks: type === "text" ? [] : undefined,
    };
    updateLessons([...lessons, newLesson]);
  };

  const handleGenerateStructure = async () => {
    if (!courseTitle.trim()) {
      toast.error("Введите название курса");
      return;
    }

    setIsGenerating(true);

    try {
      const { data, error } = await supabase.functions.invoke("generate-course-structure", {
        body: { title: courseTitle, description: courseDescription }
      });

      if (error) {
        throw new Error(error.message || "Ошибка генерации");
      }

      if (!data.success) {
        throw new Error(data.error || "Ошибка генерации структуры");
      }

      const generatedLessons: Lesson[] = (data.lessons || []).map((l: any) => ({
        id: crypto.randomUUID(),
        type: l.type as LessonType,
        title: l.title,
        // Для video/audio/image уроков контент должен быть пустым (ждём ссылку от пользователя)
        content: l.type === "text" || l.type === "test" ? (l.description || "") : "",
        expanded: false,
        blocks: l.type === "text" ? [] : undefined,
      }));

      if (generatedLessons.length > 0) {
        // Дополняем существующие уроки, а не заменяем
        setLessons(prev => [...prev, ...generatedLessons]);
        toast.success(`Добавлено ${generatedLessons.length} уроков`);
      } else {
        toast.error("AI не вернул уроки");
      }
    } catch (error: any) {
      console.error("Generate structure error:", error);
      toast.error(error.message || "Ошибка генерации структуры");
    } finally {
      setIsGenerating(false);
    }
  };

  // Handle AI generation from dialog
  const handleAIGenerate = async (type: AIGenerateType, prompt: string) => {
    const typeNames: Record<AIGenerateType, string> = {
      audio: "аудиолекция",
      slides: "презентация",
      video: "видео",
      image: "изображение",
      test: "тест",
    };

    const lessonTypeMap: Record<AIGenerateType, LessonType> = {
      audio: "audio",
      slides: "slider",
      video: "video",
      image: "image",
      test: "test",
    };

    const newLesson: Lesson = {
      id: crypto.randomUUID(),
      type: lessonTypeMap[type],
      title: `AI ${typeNames[type]}: ${prompt.slice(0, 50)}${prompt.length > 50 ? "..." : ""}`,
      content: "",
      expanded: true,
      blocks: type === "slides" ? [] : undefined,
    };

    // For audio - generate with ElevenLabs TTS
    if (type === "audio") {
      try {
        toast.info("Генерация аудио с ElevenLabs...");
        
        const response = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/elevenlabs-tts`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
              Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
            },
            body: JSON.stringify({ text: prompt, voiceId: "JBFqnCBsd6RMkjVDRZzb" }),
          }
        );

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.error || `Ошибка: ${response.status}`);
        }

        const audioBlob = await response.blob();
        
        // Upload to storage (external or internal)
        const fileName = `audio-${Date.now()}.mp3`;
        
        try {
          const result = await uploadToStorage(audioBlob, 'course-files', fileName, 'audio/mpeg');
          if (result) {
            newLesson.content = result.url;
            toast.success(result.storage === 'external' ? "Аудиолекция загружена во внешнее хранилище!" : "Аудиолекция сгенерирована!");
          } else {
            throw new Error('Upload failed');
          }
        } catch (uploadErr) {
          console.error("Upload error:", uploadErr);
          // Still create lesson with blob URL for preview
          const blobUrl = URL.createObjectURL(audioBlob);
          newLesson.content = blobUrl;
          toast.warning("Аудио создано, но не сохранено в хранилище");
        }
      } catch (error: any) {
        console.error("TTS error:", error);
        toast.error(error.message || "Ошибка генерации аудио");
        return;
      }
    }

    // For test - generate with AI
    if (type === "test") {
      try {
        toast.info("Генерация тестовых вопросов...");
        
        const { data, error } = await supabase.functions.invoke("generate-course-content", {
          body: {
            lessonTitle: prompt,
            courseTitle: courseTitle || "Курс",
            courseDescription: courseDescription || "",
            contentType: "test",
          },
        });

        if (error) throw error;
        
        if (data?.content) {
          newLesson.content = data.content;
        }
        toast.success("Тест сгенерирован!");
      } catch (error: any) {
        console.error("Test generation error:", error);
        toast.error("Ошибка генерации теста");
        return;
      }
    }

    // For slides - generate with AI (with images)
    if (type === "slides") {
      try {
        toast.info("Генерация слайдов с иллюстрациями... Это может занять минуту.");
        
        const { data, error } = await supabase.functions.invoke("generate-course-content", {
          body: {
            lessonTitle: prompt,
            courseTitle: courseTitle || "Курс",
            courseDescription: courseDescription || "",
            contentType: "slides",
          },
        });

        if (error) throw error;
        
        if (data?.content) {
          try {
            const parsedSlides = JSON.parse(data.content);
            if (Array.isArray(parsedSlides)) {
              // Create a slider block with the generated slides
              const sliderBlock = {
                id: crypto.randomUUID(),
                type: "slider" as const,
                content: prompt,
                sliderSlides: parsedSlides.map((s: any) => ({
                  id: s.id || crypto.randomUUID(),
                  title: s.title || "Слайд",
                  content: s.content || "",
                  imageUrl: s.imageUrl || undefined
                })),
                sliderCurrentIndex: 0
              };
              newLesson.blocks = [sliderBlock];
              newLesson.content = JSON.stringify(parsedSlides);
              const imagesCount = parsedSlides.filter((s: any) => s.imageUrl).length;
              toast.success(`Слайды сгенерированы! (${imagesCount} иллюстраций)`);
            } else {
              const slides = [
                { id: crypto.randomUUID(), title: "Введение", content: data.content },
              ];
              const sliderBlock = {
                id: crypto.randomUUID(),
                type: "slider" as const,
                content: prompt,
                sliderSlides: slides,
                sliderCurrentIndex: 0
              };
              newLesson.blocks = [sliderBlock];
              newLesson.content = JSON.stringify(slides);
              toast.success("Слайды сгенерированы!");
            }
          } catch {
            const slides = [
              { id: crypto.randomUUID(), title: prompt.slice(0, 50), content: data.content },
            ];
            const sliderBlock = {
              id: crypto.randomUUID(),
              type: "slider" as const,
              content: prompt,
              sliderSlides: slides,
              sliderCurrentIndex: 0
            };
            newLesson.blocks = [sliderBlock];
            newLesson.content = JSON.stringify(slides);
            toast.success("Слайды сгенерированы!");
          }
        } else {
          const slides = [
            { id: crypto.randomUUID(), title: "Введение", content: prompt },
            { id: crypto.randomUUID(), title: "Основные понятия", content: "" },
            { id: crypto.randomUUID(), title: "Заключение", content: "" },
          ];
          const sliderBlock = {
            id: crypto.randomUUID(),
            type: "slider" as const,
            content: prompt,
            sliderSlides: slides,
            sliderCurrentIndex: 0
          };
          newLesson.blocks = [sliderBlock];
          newLesson.content = JSON.stringify(slides);
          toast.warning("Слайды созданы с базовой структурой");
        }
      } catch (error: any) {
        console.error("Slides generation error:", error);
        const slides = [
          { id: crypto.randomUUID(), title: "Введение", content: prompt },
          { id: crypto.randomUUID(), title: "Основные понятия", content: "" },
          { id: crypto.randomUUID(), title: "Заключение", content: "" },
        ];
        const sliderBlock = {
          id: crypto.randomUUID(),
          type: "slider" as const,
          content: prompt,
          sliderSlides: slides,
          sliderCurrentIndex: 0
        };
        newLesson.blocks = [sliderBlock];
        newLesson.content = JSON.stringify(slides);
        toast.warning("Слайды созданы с базовой структурой");
      }
    }

    // For image - generate with AI
    if (type === "image") {
      try {
        toast.info("Генерация изображения с AI...");
        
        const { data, error } = await supabase.functions.invoke("generate-course-content", {
          body: {
            lessonTitle: prompt,
            courseTitle: courseTitle || "Курс",
            courseDescription: courseDescription || "",
            contentType: "image",
          },
        });

        if (error) throw error;
        
        if (data?.imageUrl) {
          // Create an image block
          const imageBlock = {
            id: crypto.randomUUID(),
            type: "image" as const,
            content: "",
            imageSrc: data.imageUrl,
            imageAlt: prompt
          };
          newLesson.blocks = [imageBlock];
          newLesson.content = data.imageUrl;
          toast.success("Изображение сгенерировано!");
        } else {
          toast.info("Добавьте изображение вручную");
        }
      } catch (error: any) {
        console.error("Image generation error:", error);
        toast.info("Добавьте изображение вручную");
      }
    }

    // For video - generate thumbnail image and script with AI
    if (type === "video") {
      try {
        toast.info("Генерация превью и сценария для видео...");
        
        // Generate a thumbnail image
        const { data: imageData } = await supabase.functions.invoke("generate-course-content", {
          body: {
            lessonTitle: `Video thumbnail: ${prompt}`,
            courseTitle: courseTitle || "Курс",
            courseDescription: courseDescription || "",
            contentType: "image",
          },
        });

        // Generate video script/description
        const { data: scriptData } = await supabase.functions.invoke("generate-course-content", {
          body: {
            lessonTitle: prompt,
            courseTitle: courseTitle || "Курс",
            courseDescription: courseDescription || "",
            contentType: "video_script",
          },
        });

        const thumbnailUrl = imageData?.imageUrl || "";
        const script = scriptData?.content || "";

        // Store thumbnail separately, keep content empty for actual video URL
        newLesson.thumbnailUrl = thumbnailUrl;
        newLesson.videoScript = script;
        newLesson.content = ""; // Keep empty for user to add video URL
        
        if (thumbnailUrl || script) {
          toast.success("Превью и сценарий созданы! Добавьте ссылку на видео.");
        } else {
          toast.info("Добавьте ссылку на видео");
        }
      } catch (error: any) {
        console.error("Video generation error:", error);
        newLesson.content = "";
        toast.info("Добавьте ссылку на видео вручную");
      }
    }

    updateLessons([...lessons, newLesson]);
  };

  const updateLesson = (id: string, updates: Partial<Lesson>) => {
    setLessons(lessons.map(l => l.id === id ? { ...l, ...updates } : l));
    markAsChanged();
  };

  const deleteLesson = (id: string) => {
    setLessons(lessons.filter(l => l.id !== id));
  };

  const toggleLesson = (id: string) => {
    setLessons(lessons.map(l => l.id === id ? { ...l, expanded: !l.expanded } : l));
  };

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const oldIndex = lessons.findIndex((l) => l.id === active.id);
      const newIndex = lessons.findIndex((l) => l.id === over.id);
      setLessons(arrayMove(lessons, oldIndex, newIndex));
    }
  };

  const ensureOrganizationId = async (): Promise<string | null> => {
    if (organizationId) return organizationId;
    if (!user) return null;

    const { data, error } = await supabase
      .from("profiles")
      .select("organization_id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (error) {
      console.error("Error fetching organization_id:", error);
      return null;
    }

    const orgId = data?.organization_id ?? null;
    if (orgId) setOrganizationId(orgId);
    return orgId;
  };

  const saveCourse = async () => {
    // Защита от двойного вызова
    if (isSaving) return;
    
    if (!courseTitle.trim()) {
      toast.error("Введите название курса");
      return;
    }

    const orgId = await ensureOrganizationId();
    if (!orgId) {
      toast.error("Не найдена организация");
      return;
    }

    setIsSaving(true);

    try {
      let savedCourseId = courseId;

      if (courseId) {
        const { error } = await supabase
          .from("courses")
          .update({
            title: courseTitle.trim(),
            description: courseDescription.trim() || null,
            is_published: true,
          })
          .eq("id", courseId);

        if (error) throw error;
      } else {
        const { data: newCourse, error } = await supabase
          .from("courses")
          .insert({
            title: courseTitle.trim(),
            description: courseDescription.trim() || null,
            organization_id: orgId,
            is_published: true,
          })
          .select()
          .single();

        if (error) throw error;
        savedCourseId = newCourse.id;
        // Update URL with new course ID
        window.history.replaceState(null, '', `/course-builder/${savedCourseId}`);
      }

      if (lessons.length > 0 && savedCourseId) {
        const currentLessonIds = lessons.map(l => l.id);

        if (courseId) {
          const { error: deleteError } = await supabase
            .from("lessons")
            .delete()
            .eq("course_id", courseId)
            .not("id", "in", `(${currentLessonIds.join(",")})`);

          if (deleteError) {
            console.error("Error deleting removed lessons:", deleteError);
          }
        }

        // Save all lessons first - batch to avoid AbortError
        const lessonsToSave = lessons.map((lesson, index) => ({
          id: lesson.id,
          course_id: savedCourseId!,
          title: lesson.title,
          type: lesson.type,
          content: lesson.content || null,
          order_index: index,
          test_passing_score: lesson.testPassingScore ?? 60,
          test_questions_to_show: lesson.testQuestionsToShow ?? null,
        }));

        const { error: batchUpsertError } = await supabase
          .from("lessons")
          .upsert(lessonsToSave, { onConflict: "id" });

        if (batchUpsertError) {
          // Ignore AbortError - often happens due to race conditions
          if (batchUpsertError.message?.includes('AbortError') || 
              batchUpsertError.message?.includes('signal is aborted')) {
            console.warn("Save was interrupted, retrying may help:", batchUpsertError);
          } else {
            console.error("Error saving lessons:", batchUpsertError);
            toast.error(`Ошибка сохранения уроков: ${batchUpsertError.message}`);
          }
        }

        // Save test questions for each test lesson from local state
        for (const lesson of lessons) {
          if (lesson.type === "test" && lesson.questions && lesson.questions.length > 0) {
            const activeQuestions = lesson.questions.filter(q => !q.isDeleted);
            
            // Delete removed questions
            const toDelete = lesson.questions.filter(q => q.isDeleted && !q.isNew);
            for (const q of toDelete) {
              await supabase
                .from("test_questions")
                .delete()
                .eq("id", q.id);
            }
            
            // Upsert active questions
            for (let i = 0; i < activeQuestions.length; i++) {
              const q = activeQuestions[i];
              const questionData = {
                id: q.id,
                lesson_id: lesson.id,
                question: q.question.trim(),
                options: q.options.filter(o => o.text.trim()),
                correct_answer: q.correct_answer,
                order_index: i,
                explanation: q.explanation || null,
                image_url: q.image_url || null
              };

              const { error: qError } = await supabase
                .from("test_questions")
                .upsert([questionData], { onConflict: "id" });

              if (qError) {
                console.error(`Error saving question:`, qError);
              }
            }
          }
        }
      }

      toast.success(courseId ? "Курс обновлён" : "Курс создан");
      setHasUnsavedChanges(false);
    } catch (error: any) {
      // Ignore AbortError - harmless race condition
      if (error?.name === 'AbortError' || 
          error?.message?.includes('AbortError') || 
          error?.message?.includes('signal is aborted')) {
        console.warn("Save interrupted by AbortError, changes may have been saved:", error);
        toast.success(courseId ? "Курс обновлён" : "Курс создан");
        setHasUnsavedChanges(false);
      } else {
        console.error("Error saving course:", error);
        toast.error("Ошибка сохранения: " + error.message);
      }
    } finally {
      setIsSaving(false);
    }
  };

  const saveSingleLesson = async (lesson: Lesson, orderIndex: number) => {
    const orgId = await ensureOrganizationId();
    if (!orgId) {
      toast.error("Не найдена организация");
      return;
    }

    setIsSaving(true);

    try {
      let savedCourseId = courseId;

      if (!savedCourseId) {
        if (!courseTitle.trim()) {
          setCourseTitle(lesson.title || "Новый курс");
        }

        const { data: newCourse, error } = await supabase
          .from("courses")
          .insert({
            title: courseTitle.trim() || lesson.title || "Новый курс",
            description: courseDescription.trim() || null,
            organization_id: orgId,
          })
          .select()
          .single();

        if (error) throw error;
        savedCourseId = newCourse.id;

        window.history.replaceState(null, '', `/course-builder/${savedCourseId}`);
      }

      const { data: existingLesson } = await supabase
        .from("lessons")
        .select("id")
        .eq("id", lesson.id)
        .maybeSingle();

      if (existingLesson) {
        const { error } = await supabase
          .from("lessons")
          .update({
            title: lesson.title,
            type: lesson.type,
            content: lesson.content || null,
            order_index: orderIndex,
            // Test-specific settings
            test_passing_score: lesson.testPassingScore ?? 60,
            test_questions_to_show: lesson.testQuestionsToShow ?? null,
          })
          .eq("id", lesson.id);

        if (error) throw error;
        toast.success("Лекция обновлена");
      } else {
        const { error } = await supabase
          .from("lessons")
          .insert({
            id: lesson.id,
            course_id: savedCourseId,
            title: lesson.title,
            type: lesson.type,
            content: lesson.content || null,
            order_index: orderIndex,
            // Test-specific settings
            test_passing_score: lesson.testPassingScore ?? 60,
            test_questions_to_show: lesson.testQuestionsToShow ?? null,
          });

        if (error) throw error;
        toast.success("Лекция сохранена");
      }
    } catch (error: any) {
      console.error("Error saving lesson:", error);
      toast.error("Ошибка сохранения: " + error.message);
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="bg-card border-b border-border sticky top-0 z-10">
        <div className="container mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button
                variant="ghost"
                size="sm"
                className="rounded-xl"
                onClick={handleBackClick}
              >
                <ArrowLeft className="w-4 h-4 mr-2" />
                Назад
              </Button>
              <SigmaLogo size="sm" />
            </div>
            <div className="flex items-center gap-3">
              <Button
                variant="outline"
                className="rounded-xl gap-2"
                disabled={!courseId}
                onClick={() => {
                  if (courseId) {
                    navigate(`/course-preview/${courseId}`);
                  } else {
                    toast.error("Сначала сохраните курс");
                  }
                }}
                title={!courseId ? "Сначала сохраните курс" : "Открыть предпросмотр курса"}
              >
                <Eye className="w-4 h-4" />
                <span className="hidden sm:inline">Предпросмотр</span>
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Fixed Save Button at bottom */}
      <div className="fixed bottom-0 left-0 right-0 z-50 bg-gradient-to-t from-background via-background to-transparent pb-4 pt-8 pointer-events-none">
        <div className="container mx-auto px-6 pointer-events-auto">
          <div className="flex justify-center">
            <Button
              onClick={saveCourse}
              disabled={isSaving}
              size="lg"
              className="btn-gradient rounded-2xl gap-3 px-8 py-6 text-lg font-semibold shadow-2xl hover:scale-105 transition-transform"
            >
              {isSaving ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <Save className="w-5 h-5" />
              )}
              {isSaving ? "Сохранение..." : "Сохранить курс"}
              {hasUnsavedChanges && !isSaving && (
                <span className="ml-1 w-2 h-2 rounded-full bg-white/80 animate-pulse" />
              )}
            </Button>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-6 py-8 pb-32">
        <div className="grid lg:grid-cols-3 gap-8">
          {/* Main content */}
          <div className="lg:col-span-2 space-y-6">
            {/* Course info */}
            <div className="bg-card rounded-2xl border border-border p-6">
              <h2 className="font-display text-xl font-semibold mb-4">Информация о курсе</h2>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Название курса</Label>
                  <Input
                    value={courseTitle}
                    onChange={(e) => { setCourseTitle(e.target.value); markAsChanged(); }}
                    placeholder="Например: Основы безопасности на производстве"
                    className="rounded-xl h-12"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Описание</Label>
                  <Textarea
                    value={courseDescription}
                    onChange={(e) => { setCourseDescription(e.target.value); markAsChanged(); }}
                    placeholder="Краткое описание курса..."
                    className="rounded-xl min-h-[100px]"
                  />
                </div>
                <Button
                  onClick={handleGenerateStructure}
                  disabled={isGenerating || !courseTitle.trim()}
                  className="btn-gradient rounded-xl gap-2 w-full sm:w-auto"
                >
                  {isGenerating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                  {isGenerating ? "Генерация..." : "Сгенерировать структуру с AI"}
                </Button>
              </div>
            </div>

            {/* Import from file */}
            <div className="bg-gradient-to-r from-sigma-cyan/10 via-primary/10 to-sigma-purple/10 rounded-2xl border border-sigma-cyan/20 p-6">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-sigma-cyan to-primary flex items-center justify-center flex-shrink-0">
                  <FileUp className="w-6 h-6 text-white" />
                </div>
                <div className="flex-1">
                    <h3 className="font-display font-semibold text-lg mb-1">Импорт лекций из файлов</h3>
                    <p className="text-muted-foreground text-sm mb-2">
                      Загрузите PPTX, DOC, DOCX, HTML или TXT — каждый файл станет лекцией
                    </p>
                  {lessons.length > 0 && (
                    <p className="text-xs text-primary mb-3">
                      ✓ Загружено {lessons.length} {lessons.length === 1 ? 'лекция' : lessons.length < 5 ? 'лекции' : 'лекций'}
                    </p>
                  )}
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".pptx,.doc,.docx,.html,.htm,.txt"
                      onChange={handleFileImport}
                      multiple
                      className="hidden"
                    />
                  <Button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isImporting}
                    className="rounded-xl gap-2"
                    variant="outline"
                  >
                    {isImporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileUp className="w-4 h-4" />}
                    {isImporting ? "Импорт..." : "Загрузить файл"}
                  </Button>
                </div>
              </div>
            </div>

            {/* Lessons */}
            <div className="bg-card rounded-2xl border border-border p-6">
              <h2 className="font-display text-xl font-semibold mb-4">Структура курса</h2>

              {lessons.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <FileText className="w-12 h-12 mx-auto mb-3 opacity-50" />
                  <p>Добавьте первый урок</p>
                </div>
              ) : (
                <DndContext
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  onDragEnd={handleDragEnd}
                >
                  <SortableContext
                    items={lessons.map(l => l.id)}
                    strategy={verticalListSortingStrategy}
                  >
                    <div className="space-y-3">
                      {lessons.map((lesson, index) => (
                        <SortableLessonItem
                          key={lesson.id}
                          lesson={lesson}
                          index={index}
                          onToggle={() => toggleLesson(lesson.id)}
                          onUpdate={(updates) => updateLesson(lesson.id, updates)}
                          onDelete={() => deleteLesson(lesson.id)}
                          courseId={courseId}
                          courseTitle={courseTitle}
                          courseDescription={courseDescription}
                        />
                      ))}
                    </div>
                  </SortableContext>
                </DndContext>
              )}
            </div>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            <div className="bg-card rounded-2xl border border-border p-6 sticky top-24">
              <h3 className="font-display font-semibold mb-4">Добавить элемент</h3>
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => addLesson("text")}
                  className="flex flex-col items-center gap-2 p-4 rounded-xl border border-border hover:border-primary hover:bg-primary/5 transition-all"
                >
                  <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                    <FileText className="w-5 h-5 text-primary" />
                  </div>
                  <span className="text-sm font-medium">Текст</span>
                </button>
                <button
                  onClick={() => addLesson("video")}
                  className="flex flex-col items-center gap-2 p-4 rounded-xl border border-border hover:border-sigma-purple hover:bg-sigma-purple/5 transition-all"
                >
                  <div className="w-10 h-10 rounded-lg bg-sigma-purple/10 flex items-center justify-center">
                    <Video className="w-5 h-5 text-sigma-purple" />
                  </div>
                  <span className="text-sm font-medium">Видео</span>
                </button>
                <button
                  onClick={() => addLesson("audio")}
                  className="flex flex-col items-center gap-2 p-4 rounded-xl border border-border hover:border-green-500 hover:bg-green-500/5 transition-all"
                >
                  <div className="w-10 h-10 rounded-lg bg-green-500/10 flex items-center justify-center">
                    <Headphones className="w-5 h-5 text-green-500" />
                  </div>
                  <span className="text-sm font-medium">Аудио</span>
                </button>
                <button
                  onClick={() => addLesson("image")}
                  className="flex flex-col items-center gap-2 p-4 rounded-xl border border-border hover:border-sigma-cyan hover:bg-sigma-cyan/5 transition-all"
                >
                  <div className="w-10 h-10 rounded-lg bg-sigma-cyan/10 flex items-center justify-center">
                    <ImageIcon className="w-5 h-5 text-sigma-cyan" />
                  </div>
                  <span className="text-sm font-medium">Изображение</span>
                </button>
                <button
                  onClick={() => addLesson("test")}
                  className="flex flex-col items-center gap-2 p-4 rounded-xl border border-border hover:border-sigma-orange hover:bg-sigma-orange/5 transition-all"
                >
                  <div className="w-10 h-10 rounded-lg bg-sigma-orange/10 flex items-center justify-center">
                    <FileQuestion className="w-5 h-5 text-sigma-orange" />
                  </div>
                  <span className="text-sm font-medium">Тест</span>
                </button>
                <button
                  onClick={() => addLesson("slider")}
                  className="flex flex-col items-center gap-2 p-4 rounded-xl border border-border hover:border-amber-500 hover:bg-amber-500/5 transition-all"
                >
                  <div className="w-10 h-10 rounded-lg bg-amber-500/10 flex items-center justify-center">
                    <Presentation className="w-5 h-5 text-amber-500" />
                  </div>
                  <span className="text-sm font-medium">Слайдер</span>
                </button>
                
                {/* AI Generate Button - spans full width */}
                <button
                  onClick={() => setShowAIGenerateDialog(true)}
                  className="col-span-2 flex items-center justify-center gap-3 p-4 rounded-xl border-2 border-dashed border-primary/50 hover:border-primary hover:bg-primary/5 transition-all bg-gradient-to-r from-primary/5 to-sigma-purple/5"
                >
                  <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-primary to-sigma-purple flex items-center justify-center">
                    <Wand2 className="w-5 h-5 text-white" />
                  </div>
                  <div className="text-left">
                    <span className="text-sm font-semibold block">Сгенерировать с ИИ</span>
                    <span className="text-xs text-muted-foreground">Аудио, слайды, тесты и др.</span>
                  </div>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
      
      {/* AI Generate Dialog */}
      <AIGenerateDialog
        open={showAIGenerateDialog}
        onOpenChange={setShowAIGenerateDialog}
        onGenerate={handleAIGenerate}
        courseTitle={courseTitle}
        courseDescription={courseDescription}
      />
      
      {/* Exit Confirmation Dialog */}
      <AlertDialog open={showExitDialog} onOpenChange={setShowExitDialog}>
        <AlertDialogContent className="rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Несохранённые изменения</AlertDialogTitle>
            <AlertDialogDescription>
              У вас есть несохранённые изменения. Хотите сохранить курс перед выходом?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={handleExitWithoutSave}>
              Выйти без сохранения
            </AlertDialogCancel>
            <AlertDialogAction onClick={handleSaveAndExit} disabled={isSaving}>
              {isSaving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Сохранить и выйти
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
