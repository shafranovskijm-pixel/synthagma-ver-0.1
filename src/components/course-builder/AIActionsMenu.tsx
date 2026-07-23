import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger, DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sparkles, Wand2, SearchCheck, FileText, ChevronDown, BookmarkPlus, Trash2, Bookmark } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

interface Props {
  isGenerating: boolean;
  isReviewing: boolean;
  reviewDisabled: boolean;
  courseId?: string | null;
  onGenerateStructure: (customPrompt?: string) => void | Promise<void>;
  onStartReview: () => void | Promise<void>;
  onGenerateLessonWithPrompt: (customPrompt: string, lessonTitle: string) => void | Promise<void>;
}

type PromptKind = "structure" | "content";
type PromptMode = null | PromptKind;

interface Template {
  id: string;
  name: string;
  prompt: string;
  kind: PromptKind;
  scope: "user" | "course";
  course_id: string | null;
}

export function AIActionsMenu({
  isGenerating, isReviewing, reviewDisabled, courseId,
  onGenerateStructure, onStartReview, onGenerateLessonWithPrompt,
}: Props) {
  const [mode, setMode] = useState<PromptMode>(null);
  const [prompt, setPrompt] = useState("");
  const [lessonTitle, setLessonTitle] = useState("");
  const [templates, setTemplates] = useState<Template[]>([]);
  const [saveName, setSaveName] = useState("");
  const [saveScope, setSaveScope] = useState<"user" | "course">("user");
  const [currentTemplateId, setCurrentTemplateId] = useState<string | null>(null);

  const loadTemplates = async () => {
    const { data, error } = await (supabase as any)
      .from("ai_prompt_templates")
      .select("id, name, prompt, kind, scope, course_id")
      .order("updated_at", { ascending: false });
    if (!error && data) setTemplates(data as Template[]);
  };

  useEffect(() => { loadTemplates(); }, []);

  const close = () => { setMode(null); setPrompt(""); setLessonTitle(""); setSaveName(""); setCurrentTemplateId(null); };

  const openWith = (kind: PromptKind, tpl?: Template) => {
    setMode(kind);
    setPrompt(tpl?.prompt ?? "");
    setSaveName(tpl?.name ?? "");
    setSaveScope(tpl?.scope ?? (courseId ? "course" : "user"));
    setCurrentTemplateId(tpl?.id ?? null);
  };

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

  const handleSaveTemplate = async () => {
    if (!mode) return;
    if (!prompt.trim()) { toast.error("Введите текст промпта"); return; }
    if (!saveName.trim()) { toast.error("Укажите название шаблона"); return; }
    if (saveScope === "course" && !courseId) { toast.error("Курс ещё не сохранён — выберите область «Пользователь»"); return; }
    const { data: userRes } = await supabase.auth.getUser();
    const user_id = userRes?.user?.id;
    if (!user_id) { toast.error("Не авторизован"); return; }

    const payload: any = {
      user_id, kind: mode, scope: saveScope, name: saveName.trim(), prompt,
      course_id: saveScope === "course" ? courseId : null,
    };
    const q = currentTemplateId
      ? (supabase as any).from("ai_prompt_templates").update(payload).eq("id", currentTemplateId)
      : (supabase as any).from("ai_prompt_templates").insert(payload);
    const { error } = await q;
    if (error) { toast.error("Не удалось сохранить: " + error.message); return; }
    toast.success(currentTemplateId ? "Шаблон обновлён" : "Шаблон сохранён");
    await loadTemplates();
  };

  const handleDeleteTemplate = async () => {
    if (!currentTemplateId) return;
    const { error } = await (supabase as any).from("ai_prompt_templates").delete().eq("id", currentTemplateId);
    if (error) { toast.error("Не удалось удалить: " + error.message); return; }
    toast.success("Шаблон удалён");
    setCurrentTemplateId(null);
    await loadTemplates();
  };

  const templatesByKind = (kind: PromptKind) => templates.filter(t =>
    t.kind === kind && (t.scope === "user" || (t.scope === "course" && (!courseId || t.course_id === courseId)))
  );

  const renderTemplatesSubmenu = (kind: PromptKind) => {
    const list = templatesByKind(kind);
    if (list.length === 0) {
      return <DropdownMenuItem disabled>Нет сохранённых шаблонов</DropdownMenuItem>;
    }
    return list.map(t => (
      <DropdownMenuItem key={t.id} onClick={() => openWith(kind, t)}>
        <Bookmark className="w-3.5 h-3.5 mr-2 opacity-60" />
        <div className="flex flex-col min-w-0">
          <span className="truncate">{t.name}</span>
          <span className="text-[10px] text-muted-foreground">{t.scope === "course" ? "Курс" : "Пользователь"}</span>
        </div>
      </DropdownMenuItem>
    ));
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
          <DropdownMenuItem onClick={() => openWith("structure")}>
            <Wand2 className="w-4 h-4 mr-2 text-fuchsia-500" />
            <div className="flex flex-col"><span>Промпт для структуры</span><span className="text-[11px] text-muted-foreground">Новый или из шаблона</span></div>
          </DropdownMenuItem>
          <DropdownMenuSub>
            <DropdownMenuSubTrigger className="pl-8">
              <span className="text-xs">Шаблоны структуры</span>
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="w-64">{renderTemplatesSubmenu("structure")}</DropdownMenuSubContent>
          </DropdownMenuSub>
          <DropdownMenuItem onClick={() => openWith("content")}>
            <FileText className="w-4 h-4 mr-2 text-fuchsia-500" />
            <div className="flex flex-col"><span>Промпт для содержания</span><span className="text-[11px] text-muted-foreground">Новый или из шаблона</span></div>
          </DropdownMenuItem>
          <DropdownMenuSub>
            <DropdownMenuSubTrigger className="pl-8">
              <span className="text-xs">Шаблоны содержания</span>
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="w-64">{renderTemplatesSubmenu("content")}</DropdownMenuSubContent>
          </DropdownMenuSub>
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
            {mode && templatesByKind(mode).length > 0 && (
              <div className="space-y-1.5">
                <Label>Загрузить шаблон</Label>
                <Select
                  value={currentTemplateId ?? ""}
                  onValueChange={(id) => {
                    const t = templates.find(x => x.id === id);
                    if (t) openWith(t.kind, t);
                  }}
                >
                  <SelectTrigger><SelectValue placeholder="Выберите сохранённый шаблон" /></SelectTrigger>
                  <SelectContent>
                    {templatesByKind(mode).map(t => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.name} <span className="text-muted-foreground text-xs">· {t.scope === "course" ? "курс" : "пользователь"}</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {mode === "content" && (
              <div className="space-y-1.5">
                <Label>Название урока</Label>
                <Textarea value={lessonTitle} onChange={(e) => setLessonTitle(e.target.value)} placeholder="Например: Основы промышленной безопасности" className="min-h-[44px]" />
              </div>
            )}

            <div className="space-y-1.5">
              <Label>Системный промпт</Label>
              <Textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="Ты — эксперт по... Создай..." className="min-h-[220px] font-mono text-xs" />
              <p className="text-[11px] text-muted-foreground">
                Промпт полностью заменит стандартный.
              </p>
            </div>

            <div className="rounded-lg border border-border p-3 space-y-2 bg-muted/30">
              <div className="text-xs font-medium flex items-center gap-1.5"><BookmarkPlus className="w-3.5 h-3.5" />Сохранить как шаблон</div>
              <div className="flex gap-2">
                <Input value={saveName} onChange={(e) => setSaveName(e.target.value)} placeholder="Название шаблона" className="flex-1" />
                <Select value={saveScope} onValueChange={(v) => setSaveScope(v as any)}>
                  <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="user">Мои шаблоны</SelectItem>
                    <SelectItem value="course" disabled={!courseId}>Только для курса</SelectItem>
                  </SelectContent>
                </Select>
                <Button type="button" variant="secondary" onClick={handleSaveTemplate}>
                  {currentTemplateId ? "Обновить" : "Сохранить"}
                </Button>
                {currentTemplateId && (
                  <Button type="button" variant="ghost" size="icon" onClick={handleDeleteTemplate} title="Удалить шаблон">
                    <Trash2 className="w-4 h-4 text-destructive" />
                  </Button>
                )}
              </div>
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
