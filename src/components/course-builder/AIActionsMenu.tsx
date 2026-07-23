import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Sparkles, Wand2, SearchCheck, FileText, ChevronDown } from "lucide-react";
import { toast } from "sonner";

interface Props {
  isGenerating: boolean;
  isReviewing: boolean;
  reviewDisabled: boolean;
  onGenerateStructure: (customPrompt?: string) => void | Promise<void>;
  onStartReview: () => void | Promise<void>;
  onGenerateLessonWithPrompt: (customPrompt: string, lessonTitle: string) => void | Promise<void>;
}

type PromptMode = null | "structure" | "content";

export function AIActionsMenu({
  isGenerating, isReviewing, reviewDisabled,
  onGenerateStructure, onStartReview, onGenerateLessonWithPrompt,
}: Props) {
  const [mode, setMode] = useState<PromptMode>(null);
  const [prompt, setPrompt] = useState("");
  const [lessonTitle, setLessonTitle] = useState("");

  const close = () => { setMode(null); setPrompt(""); setLessonTitle(""); };

  const handleSubmit = async () => {
    if (!prompt.trim()) { toast.error("Введите текст промпта"); return; }
    if (mode === "structure") {
      await onGenerateStructure(prompt);
    } else if (mode === "content") {
      if (!lessonTitle.trim()) { toast.error("Введите название урока"); return; }
      await onGenerateLessonWithPrompt(prompt, lessonTitle);
    }
    close();
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            disabled={isGenerating || isReviewing}
            className="h-auto py-2 px-3 flex flex-col items-center gap-0.5"
          >
            <span className="flex items-center gap-1.5">
              <Sparkles className="w-4 h-4" />
              {isGenerating ? "Генерация..." : isReviewing ? "Проверка..." : "AI"}
              <ChevronDown className="w-3.5 h-3.5 opacity-70" />
            </span>
            <span className="text-[10px] text-muted-foreground font-normal">Структура, проверка, свой промпт</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-72">
          <DropdownMenuLabel>Автоматически</DropdownMenuLabel>
          <DropdownMenuItem onClick={() => onGenerateStructure()} disabled={isGenerating}>
            <Wand2 className="w-4 h-4 mr-2 text-primary" />
            <div className="flex flex-col">
              <span>AI Структура</span>
              <span className="text-[11px] text-muted-foreground">По названию и описанию курса</span>
            </div>
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => onStartReview()} disabled={isReviewing || reviewDisabled}>
            <SearchCheck className="w-4 h-4 mr-2 text-primary" />
            <div className="flex flex-col">
              <span>AI Проверка</span>
              <span className="text-[11px] text-muted-foreground">Только анализ, курс не меняется</span>
            </div>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuLabel>Свой промпт</DropdownMenuLabel>
          <DropdownMenuItem onClick={() => setMode("structure")}>
            <Wand2 className="w-4 h-4 mr-2 text-fuchsia-500" />
            <div className="flex flex-col">
              <span>Промпт для структуры</span>
              <span className="text-[11px] text-muted-foreground">Свой системный промпт для плана уроков</span>
            </div>
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setMode("content")}>
            <FileText className="w-4 h-4 mr-2 text-fuchsia-500" />
            <div className="flex flex-col">
              <span>Промпт для содержания</span>
              <span className="text-[11px] text-muted-foreground">Свой системный промпт для текста урока</span>
            </div>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={mode !== null} onOpenChange={(o) => !o && close()}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {mode === "structure" ? "Свой промпт для структуры" : "Свой промпт для содержания"}
            </DialogTitle>
            <DialogDescription>
              {mode === "structure"
                ? "Вставьте свой системный промпт. AI сгенерирует список уроков по вашим правилам."
                : "Вставьте свой системный промпт и укажите название урока. AI сгенерирует контент по вашим правилам."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            {mode === "content" && (
              <div className="space-y-1.5">
                <Label>Название урока</Label>
                <Textarea
                  value={lessonTitle}
                  onChange={(e) => setLessonTitle(e.target.value)}
                  placeholder="Например: Основы промышленной безопасности"
                  className="min-h-[44px]"
                />
              </div>
            )}
            <div className="space-y-1.5">
              <Label>Системный промпт</Label>
              <Textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="Ты — эксперт по... Создай..."
                className="min-h-[240px] font-mono text-xs"
              />
              <p className="text-[11px] text-muted-foreground">
                Промпт полностью заменит стандартный. Учитывайте формат ответа (для структуры — список уроков, для содержания — блоки контента).
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={close}>Отмена</Button>
            <Button className="btn-gradient" onClick={handleSubmit} disabled={isGenerating}>
              {isGenerating ? "Генерация..." : "Запустить"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
