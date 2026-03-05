import { useState, useEffect, useRef, useCallback } from "react";
import { Sparkles, Loader2, Check, X, AlertCircle, RotateCcw, CheckSquare, Square } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";

type LessonStatus = "pending" | "generating_text" | "generating_image" | "done" | "error";

interface LessonItem {
  id: string;
  title: string;
  type: string;
  content: string | null;
  order_index: number;
  selected: boolean;
  status: LessonStatus;
  error?: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  courseId: string;
  courseTitle: string;
}

export function BulkContentGenerator({ open, onOpenChange, courseId, courseTitle }: Props) {
  const [lessons, setLessons] = useState<LessonItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [doneCount, setDoneCount] = useState(0);
  const abortRef = useRef(false);

  useEffect(() => {
    if (open && courseId) {
      loadLessons();
    }
    return () => { abortRef.current = true; };
  }, [open, courseId]);

  const loadLessons = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("lessons")
        .select("id, title, type, content, order_index")
        .eq("course_id", courseId)
        .order("order_index");

      if (error) throw error;

      const items: LessonItem[] = (data || [])
        .filter((l) => l.type === "text" || l.type === "lesson")
        .map((l) => ({
          ...l,
          selected: !l.content || l.content === "[]" || l.content === "null",
          status: "pending" as LessonStatus,
        }));

      setLessons(items);
      setDoneCount(0);
      setCurrentIndex(0);
      setProcessing(false);
      abortRef.current = false;
    } catch (e) {
      console.error(e);
      toast.error("Ошибка загрузки уроков");
    } finally {
      setLoading(false);
    }
  };

  const toggleAll = () => {
    const allSelected = lessons.every((l) => l.selected);
    setLessons((prev) => prev.map((l) => ({ ...l, selected: !allSelected })));
  };

  const toggleLesson = (id: string) => {
    setLessons((prev) => prev.map((l) => (l.id === id ? { ...l, selected: !l.selected } : l)));
  };

  const selectedCount = lessons.filter((l) => l.selected).length;
  const progress = selectedCount > 0 ? (doneCount / selectedCount) * 100 : 0;

  const updateLesson = useCallback((id: string, patch: Partial<LessonItem>) => {
    setLessons((prev) => prev.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  }, []);

  const processLesson = async (lesson: LessonItem): Promise<boolean> => {
    // Generate text
    updateLesson(lesson.id, { status: "generating_text" });
    try {
      const { data: textData, error: textError } = await supabase.functions.invoke("generate-lesson-content", {
        body: { lessonTitle: lesson.title, lessonType: "text", courseTitle },
      });
      if (textError) throw new Error(textError.message || "Ошибка генерации текста");
      if (!textData?.success || !textData?.blocks?.length) {
        throw new Error(textData?.error || "Пустой ответ от ИИ");
      }

      const blocks = textData.blocks;

      // Generate image
      updateLesson(lesson.id, { status: "generating_image" });
      let imageUrl: string | null = null;
      try {
        const { data: imgData, error: imgError } = await supabase.functions.invoke("generate-image", {
          body: { prompt: `Образовательная иллюстрация для урока: ${lesson.title}` },
        });
        if (!imgError && imgData?.url) {
          imageUrl = imgData.url;
        }
      } catch {
        // Image generation is optional, continue without it
        console.warn("Image generation failed for", lesson.title);
      }

      // Build final content
      const finalBlocks = [...blocks];
      if (imageUrl) {
        finalBlocks.push({ type: "image", content: imageUrl });
      }

      // Save to DB
      const { error: saveError } = await supabase
        .from("lessons")
        .update({ content: JSON.stringify(finalBlocks) })
        .eq("id", lesson.id);

      if (saveError) throw new Error("Ошибка сохранения: " + saveError.message);

      updateLesson(lesson.id, { status: "done" });
      return true;
    } catch (e: any) {
      console.error("Error processing lesson", lesson.title, e);
      updateLesson(lesson.id, { status: "error", error: e.message || "Неизвестная ошибка" });
      return false;
    }
  };

  const startGeneration = async () => {
    const selected = lessons.filter((l) => l.selected);
    if (selected.length === 0) return;

    setProcessing(true);
    setDoneCount(0);
    abortRef.current = false;

    // Reset statuses
    setLessons((prev) => prev.map((l) => (l.selected ? { ...l, status: "pending", error: undefined } : l)));

    let completed = 0;
    for (let i = 0; i < selected.length; i++) {
      if (abortRef.current) break;
      setCurrentIndex(i);

      const success = await processLesson(selected[i]);
      if (success) completed++;
      setDoneCount(completed);

      // Delay between requests (skip after last)
      if (i < selected.length - 1 && !abortRef.current) {
        await new Promise((r) => setTimeout(r, 2000));
      }
    }

    setProcessing(false);
    if (!abortRef.current) {
      toast.success(`Генерация завершена: ${completed}/${selected.length} уроков`);
    }
  };

  const retryErrors = async () => {
    const errorLessons = lessons.filter((l) => l.status === "error" && l.selected);
    if (errorLessons.length === 0) return;

    setProcessing(true);
    abortRef.current = false;
    let completed = doneCount;

    for (let i = 0; i < errorLessons.length; i++) {
      if (abortRef.current) break;
      const success = await processLesson(errorLessons[i]);
      if (success) {
        completed++;
        setDoneCount(completed);
      }
      if (i < errorLessons.length - 1 && !abortRef.current) {
        await new Promise((r) => setTimeout(r, 2000));
      }
    }

    setProcessing(false);
  };

  const stopGeneration = () => {
    abortRef.current = true;
  };

  const errorCount = lessons.filter((l) => l.status === "error").length;

  const statusIcon = (status: LessonStatus) => {
    switch (status) {
      case "generating_text":
      case "generating_image":
        return <Loader2 className="w-4 h-4 animate-spin text-primary" />;
      case "done":
        return <Check className="w-4 h-4 text-green-500" />;
      case "error":
        return <AlertCircle className="w-4 h-4 text-destructive" />;
      default:
        return null;
    }
  };

  const statusText = (status: LessonStatus) => {
    switch (status) {
      case "generating_text": return "Текст...";
      case "generating_image": return "Изображение...";
      case "done": return "Готово";
      case "error": return "Ошибка";
      default: return "";
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (processing) { stopGeneration(); } onOpenChange(v); }}>
      <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-primary" />
            Массовая генерация контента
          </DialogTitle>
          <DialogDescription className="truncate">{courseTitle}</DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
          </div>
        ) : lessons.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            Текстовые уроки не найдены
          </div>
        ) : (
          <>
            {/* Controls */}
            <div className="flex items-center justify-between">
              <Button variant="ghost" size="sm" onClick={toggleAll} disabled={processing}>
                {lessons.every((l) => l.selected) ? (
                  <><CheckSquare className="w-4 h-4 mr-1.5" />Снять все</>
                ) : (
                  <><Square className="w-4 h-4 mr-1.5" />Выбрать все</>
                )}
              </Button>
              <Badge variant="secondary">{selectedCount} из {lessons.length}</Badge>
            </div>

            {/* Progress */}
            {processing && (
              <div className="space-y-1">
                <Progress value={progress} className="h-2" />
                <p className="text-xs text-muted-foreground text-center">
                  {doneCount} / {selectedCount} уроков
                </p>
              </div>
            )}

            {/* Lesson list */}
            <ScrollArea className="flex-1 max-h-[350px] -mx-2 px-2">
              <div className="space-y-1">
                {lessons.map((lesson) => (
                  <div
                    key={lesson.id}
                    className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                      lesson.status === "done" ? "bg-green-500/5" :
                      lesson.status === "error" ? "bg-destructive/5" :
                      (lesson.status === "generating_text" || lesson.status === "generating_image") ? "bg-primary/5" :
                      "hover:bg-secondary/50"
                    }`}
                  >
                    <Checkbox
                      checked={lesson.selected}
                      onCheckedChange={() => toggleLesson(lesson.id)}
                      disabled={processing}
                    />
                    <span className="flex-1 truncate">{lesson.title}</span>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {statusIcon(lesson.status)}
                      <span className="text-xs text-muted-foreground w-24 text-right">
                        {lesson.status === "error" && lesson.error
                          ? lesson.error.substring(0, 20)
                          : statusText(lesson.status)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </>
        )}

        <DialogFooter className="gap-2 sm:gap-0">
          {errorCount > 0 && !processing && (
            <Button variant="outline" onClick={retryErrors}>
              <RotateCcw className="w-4 h-4 mr-1.5" />
              Повторить ошибки ({errorCount})
            </Button>
          )}
          {processing ? (
            <Button variant="destructive" onClick={stopGeneration}>
              <X className="w-4 h-4 mr-1.5" />Остановить
            </Button>
          ) : (
            <Button onClick={startGeneration} disabled={selectedCount === 0 || loading}>
              <Sparkles className="w-4 h-4 mr-1.5" />
              Генерировать ({selectedCount})
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
