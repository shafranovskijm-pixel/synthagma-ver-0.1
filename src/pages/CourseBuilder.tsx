import { useState, useEffect, useRef } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { SigmaLogo } from "@/components/ui/SigmaLogo";
import {
  ArrowLeft,
  Plus,
  GripVertical,
  FileText,
  Video,
  Image,
  FileQuestion,
  Trash2,
  Save,
  Eye,
  Sparkles,
  Upload,
  ChevronDown,
  ChevronUp,
  Loader2,
  FileUp,
  Headphones,
  Volume2,
  Pause,
  Play,
  Square
} from "lucide-react";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { BlockEditor, ContentBlock, htmlToBlocks, blocksToJson, jsonToBlocks } from "@/components/course-builder/BlockEditor";
import { TestQuestionEditor } from "@/components/course-builder/TestQuestionEditor";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

type LessonType = "text" | "video" | "image" | "test" | "audio";

interface Lesson {
  id: string;
  type: LessonType;
  title: string;
  content: string;
  expanded: boolean;
  blocks?: ContentBlock[];
}

const lessonIcons = {
  text: FileText,
  video: Video,
  image: Image,
  test: FileQuestion,
  audio: Headphones,
};

const lessonColors = {
  text: "text-primary bg-primary/10",
  video: "text-sigma-purple bg-sigma-purple/10",
  image: "text-sigma-cyan bg-sigma-cyan/10",
  test: "text-sigma-orange bg-sigma-orange/10",
  audio: "text-green-500 bg-green-500/10",
};

interface SortableLessonProps {
  lesson: Lesson;
  index: number;
  onToggle: () => void;
  onUpdate: (updates: Partial<Lesson>) => void;
  onSave: () => void;
  onDelete: () => void;
  courseId: string | undefined;
}

function SortableLessonItem({
  lesson,
  index,
  onToggle,
  onUpdate,
  onSave,
  onDelete,
  courseId
}: SortableLessonProps) {
  const [isPreviewMode, setIsPreviewMode] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isSpeechPaused, setIsSpeechPaused] = useState(false);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: lesson.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 1000 : 'auto',
  };

  const Icon = lessonIcons[lesson.type];

  const extractTextFromBlocks = (blocks: ContentBlock[]): string => {
    return blocks
      .filter(b =>
        b.type === "heading1" ||
        b.type === "heading2" ||
        b.type === "quote" ||
        b.type === "bulletList" ||
        b.type === "numberedList" ||
        b.type === "paragraph"
      )
      .map(b => {
        const raw = b.content || "";
        return raw.replace(/<[^>]+>/g, "");
      })
      .filter(t => t.trim())
      .join(". ");
  };

  const handlePlayAudio = () => {
    const blocks = lesson.blocks || [];
    const textToSpeak = extractTextFromBlocks(blocks);
    if (!textToSpeak.trim()) {
      toast.error("Нет текста для озвучивания");
      return;
    }

    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      toast.error("Озвучка не поддерживается в этом браузере");
      return;
    }

    if (isSpeaking) {
      if (isSpeechPaused) {
        window.speechSynthesis.resume();
        setIsSpeechPaused(false);
      } else {
        window.speechSynthesis.pause();
        setIsSpeechPaused(true);
      }
      return;
    }

    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(textToSpeak);
    utterance.lang = "ru-RU";
    utterance.rate = 1;
    utterance.pitch = 1;

    utterance.onend = () => {
      setIsSpeaking(false);
      setIsSpeechPaused(false);
      utteranceRef.current = null;
    };

    utterance.onerror = () => {
      setIsSpeaking(false);
      setIsSpeechPaused(false);
      utteranceRef.current = null;
      toast.error("Ошибка озвучивания");
    };

    utteranceRef.current = utterance;
    setIsSpeaking(true);
    setIsSpeechPaused(false);
    window.speechSynthesis.speak(utterance);
  };

  const handleStopSpeech = () => {
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
    setIsSpeaking(false);
    setIsSpeechPaused(false);
    utteranceRef.current = null;
  };

  useEffect(() => {
    if (!isPreviewMode) {
      handleStopSpeech();
    }
  }, [isPreviewMode]);

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="border border-border rounded-xl overflow-hidden bg-card"
    >
      <div
        className="flex items-center gap-3 p-4 cursor-pointer hover:bg-secondary/50 transition-colors"
        onClick={onToggle}
      >
        <div
          {...attributes}
          {...listeners}
          className="cursor-grab active:cursor-grabbing touch-none"
          onClick={(e) => e.stopPropagation()}
        >
          <GripVertical className="w-4 h-4 text-muted-foreground" />
        </div>
        <span className="text-sm font-medium text-muted-foreground w-8">{index + 1}.</span>
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${lessonColors[lesson.type]}`}>
          <Icon className="w-4 h-4" />
        </div>
        <Input
          value={lesson.title}
          onChange={(e) => {
            e.stopPropagation();
            onUpdate({ title: e.target.value });
          }}
          onClick={(e) => e.stopPropagation()}
          className="flex-1 border-0 bg-transparent focus-visible:ring-0 px-0"
        />
        <Button
          variant="outline"
          size="sm"
          onClick={(e) => {
            e.stopPropagation();
            onSave();
          }}
          className="text-primary hover:text-primary gap-1"
        >
          <Save className="w-3 h-3" />
          <span className="hidden sm:inline">Сохранить</span>
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          className="text-destructive hover:text-destructive"
        >
          <Trash2 className="w-4 h-4" />
        </Button>
        {lesson.expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
      </div>

      {lesson.expanded && (
        <div className="p-4 pt-0 border-t border-border">
          {lesson.type === "text" && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 mb-2">
                <Button
                  variant={isPreviewMode ? "outline" : "default"}
                  size="sm"
                  className="rounded-lg text-xs"
                  onClick={() => setIsPreviewMode(false)}
                >
                  Редактор
                </Button>
                <Button
                  variant={isPreviewMode ? "default" : "outline"}
                  size="sm"
                  className="rounded-lg text-xs gap-1"
                  onClick={() => setIsPreviewMode(true)}
                >
                  <Eye className="w-3 h-3" />
                  Предпросмотр
                </Button>
              </div>
              {isPreviewMode ? (
                <div className="relative">
                  <div className="bg-secondary/30 rounded-xl p-6 prose prose-sm dark:prose-invert max-w-none min-h-[200px]">
                    <BlockEditor
                      blocks={lesson.blocks || []}
                      onChange={() => {}}
                      readOnly
                    />
                  </div>

                  <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-2">
                    <Button
                      onClick={handlePlayAudio}
                      variant="default"
                      size="icon"
                      className="w-12 h-12 rounded-full shadow-lg"
                      title={isSpeaking ? (isSpeechPaused ? "Продолжить" : "Пауза") : "Озвучить"}
                    >
                      {isSpeaking ? (
                        isSpeechPaused ? (
                          <Play className="w-5 h-5" />
                        ) : (
                          <Pause className="w-5 h-5" />
                        )
                      ) : (
                        <Volume2 className="w-5 h-5" />
                      )}
                    </Button>

                    {isSpeaking && (
                      <Button
                        onClick={handleStopSpeech}
                        variant="destructive"
                        size="icon"
                        className="w-12 h-12 rounded-full shadow-lg"
                        title="Остановить"
                      >
                        <Square className="w-5 h-5" />
                      </Button>
                    )}
                  </div>
                </div>
              ) : (
                <BlockEditor
                  blocks={lesson.blocks || []}
                  onChange={(blocks) => onUpdate({
                    blocks,
                    content: blocksToJson(blocks)
                  })}
                />
              )}
            </div>
          )}
          {lesson.type === "video" && (
            <div className="space-y-3">
              <Input
                value={lesson.content}
                onChange={(e) => onUpdate({ content: e.target.value })}
                placeholder="Вставьте ссылку на видео (YouTube, Vimeo и др.)"
                className="rounded-xl"
              />
              <div className="border-2 border-dashed border-border rounded-xl p-8 text-center">
                <Upload className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">Или загрузите видеофайл</p>
              </div>
            </div>
          )}
          {lesson.type === "audio" && (
            <div className="space-y-3">
              <Input
                value={lesson.content}
                onChange={(e) => onUpdate({ content: e.target.value })}
                placeholder="Вставьте ссылку на аудио"
                className="rounded-xl"
              />
              <div className="border-2 border-dashed border-border rounded-xl p-8 text-center">
                <Headphones className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">Загрузите аудиофайл (MP3, WAV, OGG)</p>
                <input
                  type="file"
                  accept="audio/*"
                  className="mt-3"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      onUpdate({ content: `[Audio: ${file.name}]` });
                    }
                  }}
                />
              </div>
              {lesson.content && lesson.content.startsWith('http') && (
                <audio controls className="w-full mt-2">
                  <source src={lesson.content} />
                </audio>
              )}
            </div>
          )}
          {lesson.type === "image" && (
            <div className="border-2 border-dashed border-border rounded-xl p-8 text-center">
              <Image className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">Загрузите изображения</p>
            </div>
          )}
          {lesson.type === "test" && (
            <TestQuestionEditor
              lessonId={lesson.id}
              courseId={courseId}
            />
          )}
        </div>
      )}
    </div>
  );
}

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
  const fileInputRef = useRef<HTMLInputElement>(null);

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
          setLessons(lessonsData.map(l => {
            const blocks = l.content ? jsonToBlocks(l.content) : [];
            return {
              id: l.id,
              type: l.type as LessonType,
              title: l.title,
              content: l.content || "",
              blocks: blocks.length > 0 ? blocks : undefined,
              expanded: false
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
      audio: "аудиолекция"
    };
    const newLesson: Lesson = {
      id: crypto.randomUUID(),
      type,
      title: `Новый ${typeNames[type]}`,
      content: "",
      expanded: true,
      blocks: type === "text" ? [] : undefined,
    };
    setLessons([...lessons, newLesson]);
  };

  const updateLesson = (id: string, updates: Partial<Lesson>) => {
    setLessons(lessons.map(l => l.id === id ? { ...l, ...updates } : l));
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

        for (let index = 0; index < lessons.length; index++) {
          const lesson = lessons[index];
          const { error: upsertError } = await supabase
            .from("lessons")
            .upsert({
              id: lesson.id,
              course_id: savedCourseId,
              title: lesson.title,
              type: lesson.type,
              content: lesson.content || null,
              order_index: index,
            }, { onConflict: "id" });

          if (upsertError) {
            console.error(`Error saving lesson "${lesson.title}":`, upsertError);
            toast.error(`Ошибка сохранения урока "${lesson.title}": ${upsertError.message}`);
          }
        }
      }

      toast.success(courseId ? "Курс обновлён" : "Курс создан");
      navigate("/organization");
    } catch (error: any) {
      console.error("Error saving course:", error);
      toast.error("Ошибка сохранения: " + error.message);
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
                onClick={() => navigate("/organization")}
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
                onClick={() => {
                  if (courseId) {
                    navigate(`/course/${courseId}/learn`);
                  } else {
                    toast.error("Сначала сохраните курс");
                  }
                }}
              >
                <Eye className="w-4 h-4" />
                Предпросмотр
              </Button>
              <Button
                onClick={saveCourse}
                disabled={isSaving}
                className="btn-gradient rounded-xl gap-2"
              >
                {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                {isSaving ? "Сохранение..." : "Сохранить курс"}
              </Button>
            </div>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-6 py-8">
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
                    onChange={(e) => setCourseTitle(e.target.value)}
                    placeholder="Например: Основы безопасности на производстве"
                    className="rounded-xl h-12"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Описание</Label>
                  <Textarea
                    value={courseDescription}
                    onChange={(e) => setCourseDescription(e.target.value)}
                    placeholder="Краткое описание курса..."
                    className="rounded-xl min-h-[100px]"
                  />
                </div>
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
                      Загрузите DOC, DOCX, HTML или TXT — каждый файл станет лекцией
                    </p>
                  {lessons.length > 0 && (
                    <p className="text-xs text-primary mb-3">
                      ✓ Загружено {lessons.length} {lessons.length === 1 ? 'лекция' : lessons.length < 5 ? 'лекции' : 'лекций'}
                    </p>
                  )}
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".doc,.docx,.html,.htm,.txt"
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
                          onSave={() => saveSingleLesson(lesson, index)}
                          onDelete={() => deleteLesson(lesson.id)}
                          courseId={courseId}
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
                    <Image className="w-5 h-5 text-sigma-cyan" />
                  </div>
                  <span className="text-sm font-medium">Изображение</span>
                </button>
                <button
                  onClick={() => addLesson("test")}
                  className="flex flex-col items-center gap-2 p-4 rounded-xl border border-border hover:border-sigma-orange hover:bg-sigma-orange/5 transition-all col-span-2"
                >
                  <div className="w-10 h-10 rounded-lg bg-sigma-orange/10 flex items-center justify-center">
                    <FileQuestion className="w-5 h-5 text-sigma-orange" />
                  </div>
                  <span className="text-sm font-medium">Тест</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
