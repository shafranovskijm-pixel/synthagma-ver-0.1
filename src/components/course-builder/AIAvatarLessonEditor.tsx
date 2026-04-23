import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sparkles, Upload, Volume2, ImageIcon, Trash2, Mic, Brain, Ear, Languages } from "lucide-react";
import { SigmaSpinner } from "@/components/ui/SigmaSpinner";
import { supabase } from "@/integrations/supabase/client";
import { safeInvoke } from "@/utils/safeInvoke";
import { useExternalStorageWithProgress } from "@/hooks/useExternalStorageWithProgress";
import { toast } from "sonner";
import { getErrorMessage } from "@/utils/handleSupabaseError";

export interface AIAvatarConfig {
  ai_avatar_name: string;
  ai_avatar_image_url: string;
  ai_avatar_voice_id: string; // legacy SaluteSpeech (preview)
  ai_avatar_system_prompt: string;
  ai_avatar_greeting: string;
  ai_avatar_subject: string;
  ai_avatar_style: string;
  ai_avatar_session_minutes: number;
  ai_avatar_model: string; // legacy

  // LiveKit Agents pipeline
  ai_avatar_stt_provider: string;
  ai_avatar_stt_model: string;
  ai_avatar_llm_provider: string;
  ai_avatar_llm_model: string;
  ai_avatar_tts_provider: string;
  ai_avatar_tts_voice: string;
  ai_avatar_language: string;
  ai_avatar_allow_interruptions: boolean;
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

// === LiveKit Agents провайдеры ===

const STT_OPTIONS: Record<string, { label: string; models: { value: string; label: string }[] }> = {
  deepgram: {
    label: "Deepgram (рекомендуется)",
    models: [
      { value: "nova-2", label: "Nova-2 (универсальная)" },
      { value: "nova-2-general", label: "Nova-2 General" },
      { value: "nova-3", label: "Nova-3 (новейшая)" },
    ],
  },
  openai: {
    label: "OpenAI Whisper",
    models: [
      { value: "whisper-1", label: "Whisper v1" },
      { value: "gpt-4o-transcribe", label: "GPT-4o Transcribe" },
      { value: "gpt-4o-mini-transcribe", label: "GPT-4o-mini Transcribe" },
    ],
  },
  google: {
    label: "Google Speech-to-Text",
    models: [
      { value: "latest_long", label: "Latest Long" },
      { value: "latest_short", label: "Latest Short" },
    ],
  },
};

const LLM_OPTIONS: Record<string, { label: string; models: { value: string; label: string }[] }> = {
  openai: {
    label: "OpenAI",
    models: [
      { value: "gpt-4o-mini", label: "GPT-4o mini (быстро, дёшево — рекомендуется)" },
      { value: "gpt-4o", label: "GPT-4o (точно)" },
      { value: "gpt-4.1", label: "GPT-4.1" },
      { value: "gpt-4.1-mini", label: "GPT-4.1 mini" },
    ],
  },
  google: {
    label: "Google Gemini",
    models: [
      { value: "gemini-2.0-flash-exp", label: "Gemini 2.0 Flash" },
      { value: "gemini-2.5-flash", label: "Gemini 2.5 Flash" },
      { value: "gemini-2.5-pro", label: "Gemini 2.5 Pro" },
    ],
  },
  anthropic: {
    label: "Anthropic Claude",
    models: [
      { value: "claude-3-5-sonnet-20241022", label: "Claude 3.5 Sonnet" },
      { value: "claude-3-5-haiku-20241022", label: "Claude 3.5 Haiku (быстро)" },
    ],
  },
  groq: {
    label: "Groq (минимальная задержка)",
    models: [
      { value: "llama-3.3-70b-versatile", label: "Llama 3.3 70B" },
      { value: "llama-3.1-8b-instant", label: "Llama 3.1 8B (мгновенно)" },
    ],
  },
};

const TTS_OPTIONS: Record<string, { label: string; voices: { value: string; label: string }[] }> = {
  openai: {
    label: "OpenAI TTS",
    voices: [
      { value: "alloy", label: "Alloy (нейтральный)" },
      { value: "echo", label: "Echo (мужской)" },
      { value: "fable", label: "Fable (британский)" },
      { value: "nova", label: "Nova (женский, энергичный)" },
      { value: "onyx", label: "Onyx (мужской, глубокий)" },
      { value: "shimmer", label: "Shimmer (женский, мягкий)" },
    ],
  },
  cartesia: {
    label: "Cartesia (минимальная задержка)",
    voices: [
      { value: "a0e99841-438c-4a64-b679-ae501e7d6091", label: "Barbershop Man" },
      { value: "79a125e8-cd45-4c13-8a67-188112f4dd22", label: "British Lady" },
    ],
  },
  salutespeech: {
    label: "SaluteSpeech (Сбер, русский)",
    voices: [
      { value: "Nec_24000", label: "Наталья" },
      { value: "Bys_24000", label: "Борис" },
      { value: "May_24000", label: "Марфа" },
      { value: "Tur_24000", label: "Тарас" },
      { value: "Ost_24000", label: "Останкино" },
      { value: "Pon_24000", label: "Сергей" },
    ],
  },
};

const LANGUAGES = [
  { value: "ru", label: "Русский" },
  { value: "en", label: "English" },
  { value: "es", label: "Español" },
  { value: "de", label: "Deutsch" },
  { value: "fr", label: "Français" },
  { value: "it", label: "Italiano" },
  { value: "pt", label: "Português" },
  { value: "kk", label: "Қазақша" },
  { value: "uz", label: "O'zbekcha" },
  { value: "zh", label: "中文" },
  { value: "ja", label: "日本語" },
];

export function AIAvatarLessonEditor({ value, onChange, courseId, courseTitle, lessonTitle }: Props) {
  const [generatingPrompt, setGeneratingPrompt] = useState(false);
  const [generatingImage, setGeneratingImage] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { uploadWithProgress } = useExternalStorageWithProgress();
  const [uploadingImg, setUploadingImg] = useState(false);

  const upd = (patch: Partial<AIAvatarConfig>) => onChange({ ...value, ...patch });

  // При смене провайдера автоматически выбираем первую доступную модель/голос
  const setSttProvider = (provider: string) => {
    const first = STT_OPTIONS[provider]?.models[0]?.value || "";
    upd({ ai_avatar_stt_provider: provider, ai_avatar_stt_model: first });
  };
  const setLlmProvider = (provider: string) => {
    const first = LLM_OPTIONS[provider]?.models[0]?.value || "";
    upd({ ai_avatar_llm_provider: provider, ai_avatar_llm_model: first });
  };
  const setTtsProvider = (provider: string) => {
    const first = TTS_OPTIONS[provider]?.voices[0]?.value || "";
    upd({ ai_avatar_tts_provider: provider, ai_avatar_tts_voice: first });
  };

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
    } catch (e) {
      toast.error("Не удалось сгенерировать", { description: getErrorMessage(e) });
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
    } catch (e) {
      toast.error("Не удалось сгенерировать", { description: getErrorMessage(e) });
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
    } catch (e) {
      toast.error("Ошибка загрузки", { description: getErrorMessage(e) });
    } finally {
      setUploadingImg(false);
    }
  };

  const handlePreviewVoice = async () => {
    // Превью через SaluteSpeech (для других провайдеров — после деплоя агента)
    if (value.ai_avatar_tts_provider !== "salutespeech") {
      toast.info("Превью голоса", {
        description: "Прослушать можно только голоса SaluteSpeech. Остальные провайдеры заработают после деплоя LiveKit-агента.",
      });
      return;
    }
    setPreviewing(true);
    try {
      const text = value.ai_avatar_greeting || `Здравствуйте, я ваш преподаватель ${value.ai_avatar_name || ""}`;
      const { data, error } = await supabase.functions.invoke("salutespeech-tts", {
        body: { text, voice: value.ai_avatar_tts_voice || "Nec_24000" },
      });
      if (error) throw error;
      if (data?.audio) {
        const audio = new Audio(`data:audio/wav;base64,${data.audio}`);
        await audio.play();
      }
    } catch (e) {
      toast.error("Не удалось воспроизвести", { description: getErrorMessage(e) });
    } finally {
      setPreviewing(false);
    }
  };

  const sttModels = STT_OPTIONS[value.ai_avatar_stt_provider]?.models || [];
  const llmModels = LLM_OPTIONS[value.ai_avatar_llm_provider]?.models || [];
  const ttsVoices = TTS_OPTIONS[value.ai_avatar_tts_provider]?.voices || [];

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
                <Label className="text-xs flex items-center gap-1"><Languages className="w-3 h-3" /> Язык диалога</Label>
                <Select value={value.ai_avatar_language} onValueChange={(v) => upd({ ai_avatar_language: v })}>
                  <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {LANGUAGES.map((l) => <SelectItem key={l.value} value={l.value}>{l.label}</SelectItem>)}
                  </SelectContent>
                </Select>
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
            <Label className="text-xs">Поведение при перебивании</Label>
            <div className="flex items-center justify-between h-10 px-3 rounded-md border border-input bg-background">
              <span className="text-sm">Можно перебивать аватара</span>
              <Switch checked={value.ai_avatar_allow_interruptions}
                onCheckedChange={(c) => upd({ ai_avatar_allow_interruptions: c })} />
            </div>
          </div>
        </div>
      </section>

      {/* Section 3 — Голосовая связка LiveKit Agents */}
      <section className="space-y-4 p-5 rounded-xl bg-gradient-to-br from-cyan-500/5 to-teal-500/5 border border-cyan-500/20">
        <div className="flex items-center gap-2">
          <Mic className="w-5 h-5 text-cyan-500" />
          <h3 className="font-semibold">Голосовая связка LiveKit Agents</h3>
        </div>
        <p className="text-xs text-muted-foreground -mt-2">
          Цепочка <strong>STT → LLM → TTS</strong>: распознавание речи ученика, мозг преподавателя и синтез голоса.
        </p>

        {/* STT */}
        <div className="space-y-2 p-3 rounded-lg bg-background/60 border border-border">
          <div className="flex items-center gap-2">
            <Ear className="w-4 h-4 text-cyan-600" />
            <Label className="text-xs font-semibold uppercase tracking-wide">STT — распознавание речи</Label>
          </div>
          <div className="grid sm:grid-cols-2 gap-2">
            <Select value={value.ai_avatar_stt_provider} onValueChange={setSttProvider}>
              <SelectTrigger className="h-10"><SelectValue placeholder="Провайдер" /></SelectTrigger>
              <SelectContent>
                {Object.entries(STT_OPTIONS).map(([k, v]) => (
                  <SelectItem key={k} value={k}>{v.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={value.ai_avatar_stt_model} onValueChange={(v) => upd({ ai_avatar_stt_model: v })}>
              <SelectTrigger className="h-10"><SelectValue placeholder="Модель" /></SelectTrigger>
              <SelectContent>
                {sttModels.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* LLM */}
        <div className="space-y-2 p-3 rounded-lg bg-background/60 border border-border">
          <div className="flex items-center gap-2">
            <Brain className="w-4 h-4 text-fuchsia-600" />
            <Label className="text-xs font-semibold uppercase tracking-wide">LLM — мозг преподавателя</Label>
          </div>
          <div className="grid sm:grid-cols-2 gap-2">
            <Select value={value.ai_avatar_llm_provider} onValueChange={setLlmProvider}>
              <SelectTrigger className="h-10"><SelectValue placeholder="Провайдер" /></SelectTrigger>
              <SelectContent>
                {Object.entries(LLM_OPTIONS).map(([k, v]) => (
                  <SelectItem key={k} value={k}>{v.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={value.ai_avatar_llm_model} onValueChange={(v) => upd({ ai_avatar_llm_model: v })}>
              <SelectTrigger className="h-10"><SelectValue placeholder="Модель" /></SelectTrigger>
              <SelectContent>
                {llmModels.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* TTS */}
        <div className="space-y-2 p-3 rounded-lg bg-background/60 border border-border">
          <div className="flex items-center gap-2">
            <Volume2 className="w-4 h-4 text-teal-600" />
            <Label className="text-xs font-semibold uppercase tracking-wide">TTS — голос аватара</Label>
          </div>
          <div className="grid sm:grid-cols-[1fr_1fr_auto] gap-2">
            <Select value={value.ai_avatar_tts_provider} onValueChange={setTtsProvider}>
              <SelectTrigger className="h-10"><SelectValue placeholder="Провайдер" /></SelectTrigger>
              <SelectContent>
                {Object.entries(TTS_OPTIONS).map(([k, v]) => (
                  <SelectItem key={k} value={k}>{v.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={value.ai_avatar_tts_voice} onValueChange={(v) => upd({ ai_avatar_tts_voice: v })}>
              <SelectTrigger className="h-10"><SelectValue placeholder="Голос" /></SelectTrigger>
              <SelectContent>
                {ttsVoices.map((v) => <SelectItem key={v.value} value={v.value}>{v.label}</SelectItem>)}
              </SelectContent>
            </Select>
            <Button type="button" size="icon" variant="outline" className="h-10 w-10 shrink-0"
              onClick={handlePreviewVoice} disabled={previewing} title="Прослушать">
              {previewing ? <SigmaSpinner size="sm" /> : <Volume2 className="w-4 h-4" />}
            </Button>
          </div>
          {value.ai_avatar_tts_provider === "elevenlabs" && (
            <p className="text-[10px] text-muted-foreground">
              ElevenLabs больше не поддерживается — выберите другого провайдера (рекомендуется SaluteSpeech).
            </p>
          )}
        </div>
      </section>

      <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 text-xs text-amber-700 dark:text-amber-400 flex gap-2">
        <Sparkles className="w-4 h-4 shrink-0 mt-0.5" />
        <div>
          <strong>Бета.</strong> Голосовой ИИ-преподаватель работает через внешний LiveKit-агент.
          После сохранения настроек запустите воркер из <code className="bg-amber-500/20 px-1 rounded">agents/tutor_agent.py</code> на Railway/Fly.io —
          инструкция в <code className="bg-amber-500/20 px-1 rounded">agents/README.md</code>. Без воркера комната создаётся, но аватар молчит.
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

  // LiveKit defaults
  ai_avatar_stt_provider: "deepgram",
  ai_avatar_stt_model: "nova-2",
  ai_avatar_llm_provider: "openai",
  ai_avatar_llm_model: "gpt-4o-mini",
  ai_avatar_tts_provider: "elevenlabs",
  ai_avatar_tts_voice: "EXAVITQu4vr4xnSDxMaL",
  ai_avatar_language: "ru",
  ai_avatar_allow_interruptions: true,
};
