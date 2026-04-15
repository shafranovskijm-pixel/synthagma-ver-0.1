import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Sparkles, Image, Type} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { SigmaSpinner } from "@/components/ui/SigmaSpinner";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sectionId: string | null;
  courseTitle: string;
  courseDescription: string | null;
  courseId: string;
  onTextGenerated: (sectionId: string, data: any) => void;
  onImageGenerated: (url: string) => void;
}

const SECTION_PROMPTS: Record<string, string> = {
  hero: "подзаголовок лендинга курса (1 строка, мотивирующий, описывает выгоду)",
  audience: "3 карточки целевой аудитории: для каждой объект {icon, title, description}. icon из набора: users, graduation-cap, lightbulb, briefcase, user-check. Верни JSON массив.",
  learn: "3 карточки «Что вы узнаете»: для каждой объект {icon, title, description}. icon из: book-open, target, star, check-circle, zap. Верни JSON массив.",
  benefits: "4 преимущества курса: для каждого объект {icon, title, description}. icon из: shield, clock, award, users, star, check. Верни JSON массив.",
  faq: "5 вопросов и ответов по курсу: для каждого объект {question, answer}. Верни JSON массив.",
  cta: "заголовок и подзаголовок для призыва к действию (записаться на курс). Верни JSON: {title, subtitle}",
  process: "текст описания процесса обучения: 4-5 пунктов через перенос строки. Верни одну строку с \\n между пунктами." };

export function LandingAIGenerateDialog({
  open,
  onOpenChange,
  sectionId,
  courseTitle,
  courseDescription,
  courseId,
  onTextGenerated,
  onImageGenerated }: Props) {
  const [generating, setGenerating] = useState<string | null>(null);

  const canGenerateImage = sectionId === "hero";
  const canGenerateText = sectionId && sectionId !== "program" && SECTION_PROMPTS[sectionId];

  const handleGenerateText = async () => {
    if (!sectionId || !SECTION_PROMPTS[sectionId]) return;
    setGenerating("text");

    try {
      const prompt = `Ты — копирайтер образовательной платформы. Курс называется: "${courseTitle}". ${courseDescription ? `Описание: ${courseDescription}` : ""}
Сгенерируй ${SECTION_PROMPTS[sectionId]}.
Отвечай ТОЛЬКО валидным JSON без пояснений и markdown-обёрток.`;

      const { data, error } = await supabase.functions.invoke("gigachat", {
        body: {
          action: "generate_content",
          courseTitle,
          lessonTitle: `landing_${sectionId}`,
          customSystemPrompt: prompt } });

      if (error) throw error;

      const content = data?.content || data?.text || "";
      // Try to parse JSON from the response
      let parsed: any;
      try {
        // Extract JSON from possible markdown wrapper
        const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/) || [null, content];
        parsed = JSON.parse(jsonMatch[1].trim());
      } catch {
        // For simple text sections like process/hero subtitle
        parsed = content.trim();
      }

      onTextGenerated(sectionId, parsed);
      toast.success("Тексты секции сгенерированы");
      onOpenChange(false);
    } catch (err: any) {
      console.error("AI text generation error:", err);
      toast.error("Ошибка генерации текста: " + (err.message || "Попробуйте ещё раз"));
    } finally {
      setGenerating(null);
    }
  };

  const handleGenerateImage = async () => {
    if (!courseId) return;
    setGenerating("image");

    try {
      const { data, error } = await supabase.functions.invoke("gigachat", {
        body: {
          action: "generate_image",
          courseTitle,
          prompt: `Профессиональная фотореалистичная обложка для образовательного курса "${courseTitle}". Качественное оборудование, рабочая обстановка, без текста и надписей.` } });

      if (error) throw error;

      if (data?.imageUrl) {
        // Upload to storage
        const response = await fetch(data.imageUrl);
        const blob = await response.blob();
        const ext = blob.type.includes("png") ? "png" : "jpg";
        const path = `${courseId}/landing-hero-ai.${ext}`;

        const { error: uploadError } = await supabase.storage
          .from("course-files")
          .upload(path, blob, { upsert: true, contentType: blob.type });

        if (uploadError) throw uploadError;

        const { data: urlData } = supabase.storage.from("course-files").getPublicUrl(path);
        onImageGenerated(urlData.publicUrl);
        toast.success("Обложка сгенерирована");
        onOpenChange(false);
      } else {
        throw new Error("Изображение не получено");
      }
    } catch (err: any) {
      console.error("AI image generation error:", err);
      toast.error("Ошибка генерации обложки: " + (err.message || "Попробуйте ещё раз"));
    } finally {
      setGenerating(null);
    }
  };

  const handleGenerateAll = async () => {
    setGenerating("all");
    try {
      const prompt = `Ты — копирайтер образовательной платформы. Курс: "${courseTitle}". ${courseDescription ? `Описание: ${courseDescription}` : ""}

Сгенерируй контент для лендинга курса. Верни JSON объект:
{
  "hero_subtitle": "мотивирующий подзаголовок",
  "audience": [{"icon":"users","title":"...","description":"..."}, ...3 шт],
  "learn": [{"icon":"book-open","title":"...","description":"..."}, ...3 шт],
  "benefits": [{"icon":"shield","title":"...","description":"..."}, ...4 шт],
  "faq": [{"question":"...","answer":"..."}, ...5 шт],
  "cta": {"title":"...","subtitle":"..."},
  "process": "пункт1\\nпункт2\\nпункт3\\nпункт4"
}
icon для audience: users, graduation-cap, lightbulb, briefcase, user-check.
icon для learn: book-open, target, star, check-circle, zap.
icon для benefits: shield, clock, award, users, star, check.
Отвечай ТОЛЬКО валидным JSON.`;

      const { data, error } = await supabase.functions.invoke("gigachat", {
        body: {
          action: "generate_content",
          courseTitle,
          lessonTitle: "landing_all",
          customSystemPrompt: prompt } });

      if (error) throw error;

      const content = data?.content || data?.text || "";
      let parsed: any;
      try {
        const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/) || [null, content];
        parsed = JSON.parse(jsonMatch[1].trim());
      } catch {
        throw new Error("Не удалось разобрать ответ ИИ");
      }

      // Apply all sections
      if (parsed.hero_subtitle) onTextGenerated("hero", parsed.hero_subtitle);
      if (parsed.audience) onTextGenerated("audience", parsed.audience);
      if (parsed.learn) onTextGenerated("learn", parsed.learn);
      if (parsed.benefits) onTextGenerated("benefits", parsed.benefits);
      if (parsed.faq) onTextGenerated("faq", parsed.faq);
      if (parsed.cta) onTextGenerated("cta", parsed.cta);
      if (parsed.process) onTextGenerated("process", parsed.process);

      toast.success("Все секции заполнены с помощью ИИ");
      onOpenChange(false);
    } catch (err: any) {
      console.error("AI bulk generation error:", err);
      toast.error("Ошибка генерации: " + (err.message || "Попробуйте ещё раз"));
    } finally {
      setGenerating(null);
    }
  };

  const sectionLabel = sectionId
    ? { hero: "Шапка", audience: "Кому подойдёт", learn: "Что вы узнаете", benefits: "Преимущества", faq: "FAQ", cta: "Призыв к действию", process: "Как проходит", program: "Программа", teachers: "Преподаватели", reviews: "Отзывы", pricing: "Тарифы" }[sectionId] || sectionId
    : "Все секции";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-primary" />
            ИИ-генерация: {sectionLabel}
          </DialogTitle>
          <DialogDescription>
            {sectionId
              ? "Выберите что сгенерировать для этой секции"
              : "Сгенерировать контент для всех секций лендинга"
            }
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 mt-2">
          {!sectionId && (
            <Button
              className="w-full justify-start gap-3 h-auto py-3"
              variant="outline"
              onClick={handleGenerateAll}
              disabled={!!generating}
            >
              {generating === "all" ? (
                <SigmaSpinner />
              ) : (
                <Sparkles className="w-5 h-5 text-primary" />
              )}
              <div className="text-left">
                <div className="font-medium">Заполнить все секции</div>
                <div className="text-xs text-muted-foreground">ИИ сгенерирует тексты для всех секций лендинга</div>
              </div>
            </Button>
          )}

          {canGenerateText && (
            <Button
              className="w-full justify-start gap-3 h-auto py-3"
              variant="outline"
              onClick={handleGenerateText}
              disabled={!!generating}
            >
              {generating === "text" ? (
                <SigmaSpinner />
              ) : (
                <Type className="w-5 h-5 text-primary" />
              )}
              <div className="text-left">
                <div className="font-medium">Сгенерировать тексты</div>
                <div className="text-xs text-muted-foreground">Заголовки, описания и пункты для секции</div>
              </div>
            </Button>
          )}

          {canGenerateImage && (
            <Button
              className="w-full justify-start gap-3 h-auto py-3"
              variant="outline"
              onClick={handleGenerateImage}
              disabled={!!generating}
            >
              {generating === "image" ? (
                <SigmaSpinner />
              ) : (
                <Image className="w-5 h-5 text-primary" />
              )}
              <div className="text-left">
                <div className="font-medium">Сгенерировать обложку</div>
                <div className="text-xs text-muted-foreground">Фоновое изображение для шапки курса</div>
              </div>
            </Button>
          )}

          {sectionId === "program" && (
            <p className="text-sm text-muted-foreground text-center py-4">
              Программа формируется автоматически из уроков курса
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
