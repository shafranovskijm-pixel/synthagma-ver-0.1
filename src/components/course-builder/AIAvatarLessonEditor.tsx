import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sparkles, Upload, Volume2, RefreshCw, ImageIcon, Trash2, Mic } from "lucide-react";
import { SigmaSpinner } from "@/components/ui/SigmaSpinner";
import { SALUTE_VOICES } from "@/components/student/TTSSettingsDialog";
import { supabase } from "@/integrations/supabase/client";
import { safeInvoke } from "@/utils/safeInvoke";
import { useExternalStorageWithProgress } from "@/hooks/useExternalStorageWithProgress";
import { toast } from "sonner";

export interface AIAvatarConfig {
  ai_avatar_name: string;
  ai_avatar_image_url: string;
  ai_avatar_voice_id: string;
  ai_avatar_system_prompt: string;
  ai_avatar_greeting: string;
  ai_avatar_subject: string;
  ai_avatar_style: string;
  ai_avatar_session_minutes: number;
  ai_avatar_model: string;
}

interface Props {
  value: AIAvatarConfig;
  onChange: (next: AIAvatarConfig) => void;
  courseId: string;
  courseTitle: string;
  lessonTitle: string;
}

const STYLES = [
  { value: "friendly", label: "Дружелюбный" },
  { value: "strict", label: "Строгий преподаватель" },
  { value: "mentor", label: "Наставник" },
  { value: "peer", label: "На равных" },
];

const MODELS = [
  { value: "google/gemini-3-flash-preview", label: "Gemini 3 Flash (быстро, рекомендуется)" },
  { value: "google/gemini-2.5-pro", label: "Gemini 2.5 Pro (точно, медленнее)" },
  { value: "openai/gpt-5-mini", label: "GPT-5 mini" },
];

export function AIAvatarLessonEditor({ value, onChange, courseId, courseTitle, lessonTitle }: Props) {
  const [generatingPrompt, setGeneratingPrompt] = useState(false);
  const [generatingImage, setGeneratingImage] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { uploadWithProgress } = useExternalStorageWithProgress();
  const [uploadingImg, setUploadingImg] = useState(false);

  const upd = (patch: Partial<AIAvatarConfig>) => onChange({ ...value, ...patch });

  const handleGeneratePrompt = async () => {
    if (!value.ai_avatar_subject?.trim() && !lessonTitle?.trim()) {
      toast.error("Укажите тему урока или название");
      return;
    }
    setGeneratingPrompt(true);
    try {
      const { data, error } = await safeInvoke<any>("ai-avatar-generate-prompt", {
        body: {
          subject: value.ai_avatar_subject || lessonTitle,
          style: value.ai_avatar_style,
          name: value.ai_avatar_name,
          courseTitle,
        },
      });
      if (error) throw error;
      if (data?.systemPrompt) {
        upd({
          ai_avatar_system_prompt: data.systemPrompt,
          ai_avatar_greeting: data.greeting || value.ai_avatar_greeting,
        });
        toast.success("✨ Промпт сгенерирован");
      }
    } catch (e: any) {
      toast.error("Не удалось сгенерировать", { description: e.message });
    } finally {
      setGeneratingPrompt(false);
    }
  };

  const handleGenerateImage = async () => {
    setGeneratingImage(true);
    try {
      const { data, error } = await safeInvoke<any>("ai-avatar-generate-image", {
        body: {
          name: value.ai_avatar_name || "Преподаватель",
          subject: value.ai_avatar_subject || courseTitle,
          style: value.ai_avatar_style,
        },
      });
      if (error) throw error;
      if (data?.imageUrl) {
        upd({ ai_avatar_image_url: data.imageUrl });
        toast.success("Аватар создан");
      } else if (data?.error) {
        toast.error("Ошибка", { description: data.error });
      }
    } catch (e: any) {
      toast.error("Не удалось сгенерировать", { description: e.message });
    } finally {
      setGeneratingImage(false);
    }
  };

  const handleUploadImage = async (file: File) => {
    setUploadingImg(true);
    try {
      const fileName = `ai-avatars/${courseId}/${Date.now()}-${file.name}`;
      const result = await uploadWithProgress(file, "course-files", fileName, () => {});
      if (result?.url) {
        upd({ ai_avatar_image_url: result.url });
        toast.success("Фото загружено");
      }
    } catch (e: any) {
      toast.error("Ошибка загрузки", { description: e.message });
    } finally {
      setUploadingImg(false);
    }
  };

  const handlePreviewVoice = async () => {
    setPreviewing(true);
    try {
      const text = value.ai_avatar_greeting || `Здравствуйте, я ваш преподаватель ${value.ai_avatar_name || ""}`;
      const { data, error } = await supabase.functions.invoke("salutespeech-tts", {
        body: { text, voice: value.ai_avatar_voice_id || "Nec_24000" },
      });
      if (error) throw error;
      if (data?.audio) {
        const audio = new Audio(`data:audio/wav;base64,${data.audio}`);
        await audio.play();
      }
    } catch (e: any) {
      toast.error("Не удалось воспроизвести", { description: e.message });
    } finally {
      setPreviewing(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Section 1 — Аватар */}
      <section className="space-y-4 p-5 rounded-xl bg-gradient-to-br from-fuchsia-500/5 to-pink-500/5 border border-fuchsia-500/20">
        <div className="flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-fuchsia-500" />
          <h3 className="font-semibold">Личность аватара</h3>
        </div>

        <div className="grid sm:grid-cols-[160px_1fr] gap-4">
          <div className="space-y-2">
            <Label className="text-xs">Фото</Label>
            <div className="aspect-square rounded-2xl bg-muted/40 border-2 border-dashed border-border overflow-hidden flex items-center justify-center relative group">
              {value.ai_avatar_image_url ? (
                <>
                  <img src={value.ai_avatar_image_url} alt="Аватар" className="w-full h-full object-cover" />
                  <Button
                    type="button" variant="ghost" size="icon"
                    className="absolute top-1 right-1 h-7 w-7 bg-background/80 backdrop-blur opacity-0 group-hover:opacity-100 transition"
                    onClick={() => upd({ ai_avatar_image_url: "" })}
                  ><Trash2 className="w-3.5 h-3.5 text-destructive" /></Button>
                </>
              ) : (
                <ImageIcon className="w-10 h-10 text-muted-foreground/40" />
              )}
            </div>
            <div className="flex flex-col gap-1.5">
              <Button type="button" size="sm" variant="outline" className="gap-1.5 text-xs"
                onClick={handleGenerateImage} disabled={generatingImage}>
                {generatingImage ? <SigmaSpinner size="sm" /> : <Sparkles className="w-3.5 h-3.5" />}
                {generatingImage ? "Создаём…" : "Сгенерировать"}
              </Button>
              <input ref={fileInputRef} type="file" accept="image/*" className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handleUploadImage(f); }} />
              <Button type="button" size="sm" variant="ghost" className="gap-1.5 text-xs"
                onClick={() => fileInputRef.current?.click()} disabled={uploadingImg}>
                {uploadingImg ? <SigmaSpinner size="sm" /> : <Upload className="w-3.5 h-3.5" />}
                Загрузить
              </Button>
            </div>
          </div>

          <div className="space-y-3">
            <div className="space-y-2">
              <Label className="text-xs">Имя преподавателя</Label>
              <Input value={value.ai_avatar_name} onChange={(e) => upd({ ai_avatar_name: e.target.value })}
                placeholder="например, Анна Петровна" className="h-10" />
            </div>
            <div className="grid sm:grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label className="text-xs">Стиль общения</Label>
                <Select value={value.ai_avatar_style} onValueChange={(v) => upd({ ai_avatar_style: v })}>
                  <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {STYLES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-xs flex items-center gap-1"><Mic className="w-3 h-3" /> Голос</Label>
                <div className="flex gap-1.5">
                  <Select value={value.ai_avatar_voice_id} onValueChange={(v) => upd({ ai_avatar_voice_id: v })}>
                    <SelectTrigger className="h-10 flex-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {SALUTE_VOICES.map((v) => <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Button type="button" size="icon" variant="outline" className="h-10 w-10 shrink-0"
                    onClick={handlePreviewVoice} disabled={previewing} title="Прослушать">
                    {previewing ? <SigmaSpinner size="sm" /> : <Volume2 className="w-4 h-4" />}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Section 2 — Тема и поведение */}
      <section className="space-y-4 p-5 rounded-xl bg-card border border-border">
        <h3 className="font-semibold">Тема урока и поведение</h3>

        <div className="space-y-2">
          <Label className="text-xs">Тема / предмет (контекст для ИИ)</Label>
          <Input value={value.ai_avatar_subject} onChange={(e) => upd({ ai_avatar_subject: e.target.value })}
            placeholder="например, Охрана труда — вводный инструктаж" className="h-10" />
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-xs">System prompt — поведение ИИ</Label>
            <Button type="button" size="sm" variant="outline" className="gap-1.5 h-8 text-xs"
              onClick={handleGeneratePrompt} disabled={generatingPrompt}>
              {generatingPrompt ? <SigmaSpinner size="sm" /> : <Sparkles className="w-3.5 h-3.5" />}
              Сгенерировать ИИ
            </Button>
          </div>
          <Textarea value={value.ai_avatar_system_prompt} onChange={(e) => upd({ ai_avatar_system_prompt: e.target.value })}
            rows={6} placeholder="Ты — опытный преподаватель по теме «...». Объясняй простым языком, задавай контрольные вопросы…" />
        </div>

        <div className="space-y-2">
          <Label className="text-xs">Приветствие (первая фраза)</Label>
          <Textarea value={value.ai_avatar_greeting} onChange={(e) => upd({ ai_avatar_greeting: e.target.value })}
            rows={2} placeholder="Здравствуйте! Меня зовут… Сегодня мы поговорим о…" />
        </div>

        <div className="grid sm:grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label className="text-xs">Лимит минут на сессию (1–25)</Label>
            <Input type="number" min={1} max={25} value={value.ai_avatar_session_minutes}
              onChange={(e) => upd({ ai_avatar_session_minutes: Math.max(1, Math.min(25, parseInt(e.target.value) || 5)) })}
              className="h-10" />
            <p className="text-[10px] text-muted-foreground">В бета-режиме рекомендуется 5 минут</p>
          </div>
          <div className="space-y-2">
            <Label className="text-xs">Модель ИИ</Label>
            <Select value={value.ai_avatar_model} onValueChange={(v) => upd({ ai_avatar_model: v })}>
              <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
              <SelectContent>
                {MODELS.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
      </section>

      <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 text-xs text-amber-700 dark:text-amber-400 flex gap-2">
        <Sparkles className="w-4 h-4 shrink-0 mt-0.5" />
        <div>
          <strong>Бета.</strong> Голосовой ИИ-преподаватель находится в разработке. Настройки сохраняются;
          уроки запустятся, как только мы активируем голосовой движок (LiveKit Agent). Обычно это занимает несколько дней.
        </div>
      </div>
    </div>
  );
}

export const defaultAIAvatarConfig: AIAvatarConfig = {
  ai_avatar_name: "",
  ai_avatar_image_url: "",
  ai_avatar_voice_id: "Nec_24000",
  ai_avatar_system_prompt: "",
  ai_avatar_greeting: "",
  ai_avatar_subject: "",
  ai_avatar_style: "friendly",
  ai_avatar_session_minutes: 5,
  ai_avatar_model: "google/gemini-3-flash-preview",
};
