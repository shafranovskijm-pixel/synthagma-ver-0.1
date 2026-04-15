import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Volume2,
  Presentation,
  Video,
  Image,
  FileQuestion,
  Sparkles } from "lucide-react";
import { toast } from "sonner";
import { SigmaSpinner } from "@/components/ui/SigmaSpinner";

export type AIGenerateType = "audio" | "slides" | "video" | "image" | "test";

interface AIGenerateOption {
  type: AIGenerateType;
  icon: React.ElementType;
  title: string;
  description: string;
  color: string;
  bgColor: string;
}

const generateOptions: AIGenerateOption[] = [
  {
    type: "audio",
    icon: Volume2,
    title: "Аудио лекция",
    description: "AI-озвучка (ElevenLabs) — реалистичные голоса читают текст",
    color: "text-green-500",
    bgColor: "bg-green-500/10 hover:bg-green-500/20" },
  {
    type: "slides",
    icon: Presentation,
    title: "Слайды",
    description: "Переключение между разделами с визуальным оформлением",
    color: "text-amber-500",
    bgColor: "bg-amber-500/10 hover:bg-amber-500/20" },
  {
    type: "video",
    icon: Video,
    title: "Короткие видео-вставки",
    description: "Для визуализации концепций и объяснений",
    color: "text-sigma-purple",
    bgColor: "bg-sigma-purple/10 hover:bg-sigma-purple/20" },
  {
    type: "image",
    icon: Image,
    title: "Изображение",
    description: "AI-генерация иллюстраций и схем",
    color: "text-sigma-cyan",
    bgColor: "bg-sigma-cyan/10 hover:bg-sigma-cyan/20" },
  {
    type: "test",
    icon: FileQuestion,
    title: "Тестирование",
    description: "Автоматическая генерация вопросов по теме",
    color: "text-sigma-orange",
    bgColor: "bg-sigma-orange/10 hover:bg-sigma-orange/20" },
];

interface AIGenerateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onGenerate: (type: AIGenerateType, prompt: string) => Promise<void>;
  courseTitle?: string;
  courseDescription?: string;
}

export function AIGenerateDialog({
  open,
  onOpenChange,
  onGenerate,
  courseTitle,
  courseDescription }: AIGenerateDialogProps) {
  const [selectedType, setSelectedType] = useState<AIGenerateType | null>(null);
  const [prompt, setPrompt] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);

  const handleBack = () => {
    setSelectedType(null);
    setPrompt("");
  };

  const handleGenerate = async () => {
    if (!selectedType) return;

    setIsGenerating(true);
    try {
      await onGenerate(selectedType, prompt);
      onOpenChange(false);
      setSelectedType(null);
      setPrompt("");
    } catch (error) {
      console.error("Generation error:", error);
      toast.error("Ошибка генерации");
    } finally {
      setIsGenerating(false);
    }
  };

  const selectedOption = generateOptions.find(o => o.type === selectedType);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-primary" />
            {selectedType ? selectedOption?.title : "Сгенерировать с ИИ"}
          </DialogTitle>
        </DialogHeader>

        {!selectedType ? (
          <div className="space-y-3">
            {generateOptions.map((option) => {
              const Icon = option.icon;
              return (
                <button
                  key={option.type}
                  onClick={() => setSelectedType(option.type)}
                  className={`w-full flex items-start gap-4 p-4 rounded-xl border border-border ${option.bgColor} transition-all text-left`}
                >
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${option.bgColor}`}>
                    <Icon className={`w-5 h-5 ${option.color}`} />
                  </div>
                  <div className="flex-1">
                    <div className="font-medium">{option.title}</div>
                    <div className="text-sm text-muted-foreground">{option.description}</div>
                  </div>
                </button>
              );
            })}
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
              {selectedOption && (
                <>
                  <selectedOption.icon className={`w-5 h-5 ${selectedOption.color}`} />
                  <span className="font-medium">{selectedOption.title}</span>
                </>
              )}
            </div>

            <div className="space-y-2">
              <Label>Опишите, что нужно сгенерировать</Label>
              <Textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder={getPlaceholder(selectedType, courseTitle)}
                className="min-h-[120px]"
              />
              {courseTitle && (
                <p className="text-xs text-muted-foreground">
                  Курс: {courseTitle}
                </p>
              )}
            </div>

            <div className="flex gap-3">
              <Button variant="outline" onClick={handleBack} disabled={isGenerating}>
                Назад
              </Button>
              <Button 
                onClick={handleGenerate} 
                disabled={isGenerating || !prompt.trim()}
                className="flex-1"
              >
                {isGenerating ? (
                  <>
                    <SigmaSpinner size="sm" className="mr-2" />
                    Генерация...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4 mr-2" />
                    Сгенерировать
                  </>
                )}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function getPlaceholder(type: AIGenerateType, courseTitle?: string): string {
  const prefix = courseTitle ? `Для курса "${courseTitle}": ` : "";
  
  switch (type) {
    case "audio":
      return `${prefix}Введите текст для озвучки или тему лекции...`;
    case "slides":
      return `${prefix}Опишите тему для создания слайдов...`;
    case "video":
      return `${prefix}Опишите концепцию для видео-вставки...`;
    case "image":
      return `${prefix}Опишите изображение, которое нужно сгенерировать...`;
    case "test":
      return `${prefix}Опишите тему для генерации тестовых вопросов...`;
    default:
      return "Опишите, что нужно сгенерировать...";
  }
}
