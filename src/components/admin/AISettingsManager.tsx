import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Bot, Cpu, Mic, MessageSquare, Store, Layers, Building2, Key, Save, ImagePlus, GitCompareArrows, DollarSign, Play, Square, Pencil, Check, X, Eye, EyeOff } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AITestSandbox } from "./ai-settings/AITestSandbox";
import { AIComparisonPanel } from "./ai-settings/AIComparisonPanel";
import { SigmaSpinner } from "@/components/ui/SigmaSpinner";

type AISetting = {
  id: string;
  context: string;
  provider: string;
  gigachat_model: string;
  lovable_model: string;
  concurrency: number;
  extra_config: Record<string, any>;
};

type CostLevel = "low" | "medium" | "high" | "premium";

const COST_META: Record<CostLevel, { label: string; emoji: string; color: string }> = {
  low: { label: "Низкая", emoji: "💰", color: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300" },
  medium: { label: "Средняя", emoji: "💰💰", color: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300" },
  high: { label: "Высокая", emoji: "💰💰💰", color: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-300" },
  premium: { label: "Премиум", emoji: "💎", color: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300" } };

const MODEL_PRICING: { provider: string; model: string; label: string; level: string; speed: string; cost: CostLevel }[] = [
  { provider: "Lovable AI", model: "google/gemini-2.5-flash-lite", label: "Gemini 2.5 Flash Lite", level: "Базовый", speed: "⚡⚡⚡ Очень быстрая", cost: "low" },
  { provider: "Lovable AI", model: "google/gemini-2.5-flash", label: "Gemini 2.5 Flash", level: "Стандарт", speed: "⚡⚡ Быстрая", cost: "medium" },
  { provider: "Lovable AI", model: "google/gemini-3-flash-preview", label: "Gemini 3 Flash", level: "Стандарт", speed: "⚡⚡ Быстрая", cost: "medium" },
  { provider: "Lovable AI", model: "google/gemini-2.5-pro", label: "Gemini 2.5 Pro", level: "Продвинутый", speed: "⚡ Средняя", cost: "high" },
  { provider: "Lovable AI", model: "google/gemini-3-pro-preview", label: "Gemini 3 Pro", level: "Продвинутый", speed: "⚡ Средняя", cost: "high" },
  { provider: "Lovable AI", model: "openai/gpt-5-nano", label: "GPT-5 Nano", level: "Базовый", speed: "⚡⚡⚡ Очень быстрая", cost: "low" },
  { provider: "Lovable AI", model: "openai/gpt-5-mini", label: "GPT-5 Mini", level: "Стандарт", speed: "⚡⚡ Быстрая", cost: "medium" },
  { provider: "Lovable AI", model: "openai/gpt-5", label: "GPT-5", level: "Премиум", speed: "🐢 Медленная", cost: "premium" },
  { provider: "Lovable AI", model: "openai/gpt-5.2", label: "GPT-5.2", level: "Премиум", speed: "🐢 Медленная", cost: "premium" },
  { provider: "Lovable AI", model: "google/gemini-2.5-flash-image", label: "Gemini Flash Image", level: "Изображения", speed: "⚡⚡ Быстрая", cost: "medium" },
  { provider: "Lovable AI", model: "google/gemini-3-pro-image-preview", label: "Gemini 3 Pro Image", level: "Изображения", speed: "⚡ Средняя", cost: "high" },
  { provider: "GigaChat", model: "GigaChat", label: "GigaChat Lite", level: "Базовый", speed: "⚡⚡ Быстрая", cost: "low" },
  { provider: "GigaChat", model: "GigaChat-Pro", label: "GigaChat Pro", level: "Стандарт", speed: "⚡ Средняя", cost: "medium" },
  { provider: "GigaChat", model: "GigaChat-Max", label: "GigaChat Max", level: "Продвинутый", speed: "🐢 Медленная", cost: "high" },
  { provider: "ElevenLabs", model: "elevenlabs", label: "ElevenLabs TTS", level: "TTS", speed: "⚡⚡ Быстрая", cost: "high" },
];

const MODEL_COST_MAP: Record<string, CostLevel> = {};
MODEL_PRICING.forEach(m => { MODEL_COST_MAP[m.model] = m.cost; });

const GIGACHAT_MODELS = [
  { value: "GigaChat-Max", label: "GigaChat Max" },
  { value: "GigaChat-Pro", label: "GigaChat Pro" },
  { value: "GigaChat", label: "GigaChat Lite" },
];

const LOVABLE_MODELS = [
  { value: "google/gemini-2.5-flash", label: "Gemini 2.5 Flash" },
  { value: "google/gemini-2.5-pro", label: "Gemini 2.5 Pro" },
  { value: "google/gemini-2.5-flash-lite", label: "Gemini 2.5 Flash Lite" },
  { value: "google/gemini-3-flash-preview", label: "Gemini 3 Flash" },
  { value: "google/gemini-3-pro-preview", label: "Gemini 3 Pro" },
  { value: "openai/gpt-5", label: "GPT-5" },
  { value: "openai/gpt-5-mini", label: "GPT-5 Mini" },
  { value: "openai/gpt-5-nano", label: "GPT-5 Nano" },
];

const IMAGE_MODELS = [
  { value: "google/gemini-2.5-flash-image", label: "Gemini Flash Image (быстрая)" },
  { value: "google/gemini-3-pro-image-preview", label: "Gemini 3 Pro Image (качественная)" },
];

const IMAGE_PROVIDERS = [
  { value: "lovable_ai", label: "Lovable AI" },
  { value: "gigachat", label: "GigaChat" },
];

const PROVIDERS = [
  { value: "lovable_ai", label: "Lovable AI" },
  { value: "gigachat", label: "GigaChat" },
];

const PIPELINE_PROVIDERS = [
  ...PROVIDERS,
  { value: "round_robin", label: "Round-Robin (все)" },
];

const TTS_PROVIDERS = [
  { value: "elevenlabs", label: "ElevenLabs" },
  { value: "salutespeech", label: "SaluteSpeech (Sber)" },
  { value: "lovable_ai", label: "Lovable AI" },
];

const SALUTE_VOICES = [
  { value: "natalya", label: "Наталья (жен.)" },
  { value: "boris", label: "Борис (муж.)" },
  { value: "marfa", label: "Марфа (жен., молодой)" },
  { value: "taras", label: "Тарас (муж., молодой)" },
  { value: "alexandr", label: "Александр (муж., старший)" },
  { value: "sergey", label: "Сергей (муж.)" },
  { value: "kira", label: "Кира (жен.)" },
];

const CONTEXT_META: Record<string, { icon: React.ReactNode; title: string; description: string; color: string }> = {
  course_generation: {
    icon: <Cpu className="w-5 h-5" />,
    title: "Генерация курсов",
    description: "ИИ для создания структуры и контента курсов организаций",
    color: "bg-blue-100 text-blue-600 dark:bg-blue-900/40 dark:text-blue-400" },
  tts: {
    icon: <Mic className="w-5 h-5" />,
    title: "Озвучка (TTS)",
    description: "Провайдер для синтеза речи в лекциях",
    color: "bg-purple-100 text-purple-600 dark:bg-purple-900/40 dark:text-purple-400" },
  consultant: {
    icon: <MessageSquare className="w-5 h-5" />,
    title: "ИИ-консультант",
    description: "Чат-бот для помощи студентам",
    color: "bg-emerald-100 text-emerald-600 dark:bg-emerald-900/40 dark:text-emerald-400" },
  marketplace: {
    icon: <Store className="w-5 h-5" />,
    title: "Маркетплейс",
    description: "Генерация описаний, SEO-текстов для витрины",
    color: "bg-orange-100 text-orange-600 dark:bg-orange-900/40 dark:text-orange-400" },
  pipeline: {
    icon: <Layers className="w-5 h-5" />,
    title: "Конвейер (Bulk Pipeline)",
    description: "Массовая генерация вопросов и ответов",
    color: "bg-indigo-100 text-indigo-600 dark:bg-indigo-900/40 dark:text-indigo-400" },
  org_default: {
    icon: <Building2 className="w-5 h-5" />,
    title: "Дефолт для организаций",
    description: "Провайдер по умолчанию для новых организаций",
    color: "bg-slate-100 text-slate-600 dark:bg-slate-900/40 dark:text-slate-400" },
  image_generation: {
    icon: <ImagePlus className="w-5 h-5" />,
    title: "Генерация картинок",
    description: "ИИ для создания и редактирования изображений в курсах",
    color: "bg-pink-100 text-pink-600 dark:bg-pink-900/40 dark:text-pink-400" } };

const TOOLS_META: Record<string, { icon: React.ReactNode; title: string; description: string; color: string }> = {
  comparison: {
    icon: <GitCompareArrows className="w-5 h-5" />,
    title: "Сравнение провайдеров",
    description: "A/B тест моделей — один промпт, несколько ИИ",
    color: "bg-cyan-100 text-cyan-600 dark:bg-cyan-900/40 dark:text-cyan-400" },
  pricing: {
    icon: <DollarSign className="w-5 h-5" />,
    title: "Тарифы моделей",
    description: "Справочник стоимости и скорости всех моделей",
    color: "bg-amber-100 text-amber-600 dark:bg-amber-900/40 dark:text-amber-400" },
  api_keys: {
    icon: <Key className="w-5 h-5" />,
    title: "API-ключи",
    description: "Статус подключенных ключей",
    color: "bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-400" } };

function CostBadge({ model }: { model: string }) {
  const cost = MODEL_COST_MAP[model];
  if (!cost) return null;
  const meta = COST_META[cost];
  return (
    <span className={`ml-2 inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium ${meta.color}`}>
      {meta.emoji}
    </span>
  );
}

function SaluteSpeechTestPanel({ voice, onVoiceChange }: { voice: string; onVoiceChange: (v: string) => void }) {
  const [testText, setTestText] = useState("Привет! Это тестовый синтез речи через SaluteSpeech.");
  const [testing, setTesting] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const handleTest = async () => {
    setTesting(true);
    setAudioUrl(null);
    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/salutespeech-tts`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}` },
          body: JSON.stringify({ text: testText, voice, format: "opus" }) }
      );

      if (!response.ok) {
        const err = await response.json().catch(() => ({ error: "Неизвестная ошибка" }));
        throw new Error(err.error || `HTTP ${response.status}`);
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      setAudioUrl(url);
      const audio = new Audio(url);
      audioRef.current = audio;
      await audio.play();
      toast.success("SaluteSpeech: синтез выполнен");
    } catch (e: any) {
      toast.error("Ошибка SaluteSpeech: " + e.message);
      console.error(e);
    } finally {
      setTesting(false);
    }
  };

  const handleStop = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
  };

  return (
    <div className="space-y-3 mt-4 p-4 rounded-lg bg-muted/50">
      <div className="space-y-2">
        <Label className="text-sm">Голос SaluteSpeech</Label>
        <Select value={voice} onValueChange={onVoiceChange}>
          <SelectTrigger className="max-w-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SALUTE_VOICES.map((v) => (
              <SelectItem key={v.value} value={v.value}>{v.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label className="text-sm">Текст для теста</Label>
        <Input
          value={testText}
          onChange={(e) => setTestText(e.target.value)}
          placeholder="Введите текст..."
          className="max-w-md text-sm"
        />
      </div>
      <div className="flex items-center gap-2">
        <Button size="sm" variant="outline" onClick={handleTest} disabled={testing || !testText.trim()} className="gap-2">
          {testing ? <SigmaSpinner size="xs" /> : <Play className="w-3 h-3" />}
          Тестировать
        </Button>
        {audioUrl && (
          <Button size="sm" variant="ghost" onClick={handleStop} className="gap-2">
            <Square className="w-3 h-3" /> Стоп
          </Button>
        )}
      </div>
      {audioUrl && (
        <audio controls src={audioUrl} className="w-full max-w-md mt-2" />
      )}
    </div>
  );
}
export function AISettingsManager() {

  const [settings, setSettings] = useState<Record<string, AISetting>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [secretsStatus, setSecretsStatus] = useState<Record<string, boolean>>({});
  const [secretsLoading, setSecretsLoading] = useState(false);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [showValue, setShowValue] = useState<Record<string, boolean>>({});

  const API_KEYS_LIST = [
    { name: "GIGACHAT_AUTH_KEY", label: "GigaChat Key 1" },
    { name: "GIGACHAT_AUTH_KEY_2", label: "GigaChat Key 2" },
    { name: "GIGACHAT_AUTH_KEY_3", label: "GigaChat Key 3" },
    { name: "SALUTESPEECH_AUTH_KEY", label: "SaluteSpeech Key 1" },
    { name: "SALUTESPEECH_AUTH_KEY_2", label: "SaluteSpeech Key 2" },
    { name: "SALUTESPEECH_AUTH_KEY_3", label: "SaluteSpeech Key 3" },
    { name: "ELEVENLABS_API_KEY", label: "ElevenLabs" },
    { name: "LOVABLE_API_KEY", label: "Lovable AI" },
  ];

  useEffect(() => {
    loadSettings();
  }, []);

  useEffect(() => {
    const checkSecrets = async () => {
      setSecretsLoading(true);
      try {
        const { data, error } = await supabase.functions.invoke("check-secrets-status", {
          body: { names: API_KEYS_LIST.map((k) => k.name) } });
        if (!error && data) {
          setSecretsStatus(data);
        }
      } catch (e) {
        console.error("Failed to check secrets status:", e);
      } finally {
        setSecretsLoading(false);
      }
    };
    checkSecrets();
  }, []);

  const loadSettings = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("ai_settings")
      .select("*");
    if (error) {
      toast.error("Ошибка загрузки настроек ИИ");
      console.error(error);
    } else if (data) {
      const map: Record<string, AISetting> = {};
      data.forEach((row: any) => {
        map[row.context] = {
          id: row.id,
          context: row.context,
          provider: row.provider,
          gigachat_model: row.gigachat_model || "GigaChat-Max",
          lovable_model: row.lovable_model || "google/gemini-2.5-pro",
          concurrency: row.concurrency || 3,
          extra_config: (row.extra_config as Record<string, any>) || {} };
      });
      setSettings(map);
    }
    setLoading(false);
  };

  const updateField = (context: string, field: keyof AISetting, value: any) => {
    setSettings((prev) => ({
      ...prev,
      [context]: { ...prev[context], [field]: value } }));
  };

  const updateExtra = (context: string, key: string, value: any) => {
    setSettings((prev) => ({
      ...prev,
      [context]: {
        ...prev[context],
        extra_config: { ...prev[context].extra_config, [key]: value } } }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const rows = Object.values(settings).map((s) => ({
        id: s.id,
        context: s.context,
        provider: s.provider,
        gigachat_model: s.gigachat_model,
        lovable_model: s.lovable_model,
        concurrency: s.concurrency,
        extra_config: s.extra_config,
        updated_at: new Date().toISOString() }));

      for (const row of rows) {
        const { error } = await supabase
          .from("ai_settings")
          .update({
            provider: row.provider,
            gigachat_model: row.gigachat_model,
            lovable_model: row.lovable_model,
            concurrency: row.concurrency,
            extra_config: row.extra_config,
            updated_at: row.updated_at })
          .eq("id", row.id);
        if (error) throw error;
      }
      toast.success("Настройки ИИ сохранены");
    } catch (e: any) {
      toast.error("Ошибка сохранения: " + e.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <SigmaSpinner />
      </div>
    );
  }

  const renderModelSelect = (
    models: { value: string; label: string }[],
    value: string,
    onChange: (v: string) => void,
    label: string
  ) => (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger><SelectValue /></SelectTrigger>
        <SelectContent>
          {models.map((m) => (
            <SelectItem key={m.value} value={m.value}>
              <span className="flex items-center">
                {m.label}
                <CostBadge model={m.value} />
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );

  const renderProviderSelect = (
    ctx: string,
    options: { value: string; label: string }[] = PROVIDERS,
    modelOptions?: { value: string; label: string }[]
  ) => {
    const s = settings[ctx];
    if (!s) return null;
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Провайдер</Label>
            <Select value={s.provider} onValueChange={(v) => updateField(ctx, "provider", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {options.map((o) => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {(s.provider === "gigachat" || s.provider === "round_robin") && !modelOptions && (
            renderModelSelect(
              GIGACHAT_MODELS,
              s.gigachat_model,
              (v) => updateField(ctx, "gigachat_model", v),
              "Модель GigaChat"
            )
          )}

          {s.provider === "gigachat" && modelOptions && (
            renderModelSelect(
              GIGACHAT_MODELS,
              s.gigachat_model,
              (v) => updateField(ctx, "gigachat_model", v),
              "Модель GigaChat"
            )
          )}

          {(s.provider === "lovable_ai" || s.provider === "round_robin") && (
            renderModelSelect(
              modelOptions || LOVABLE_MODELS,
              s.lovable_model,
              (v) => updateField(ctx, "lovable_model", v),
              modelOptions ? "Модель" : "Модель Lovable AI"
            )
          )}
        </div>
      </div>
    );
  };

  const renderPipelineSection = () => {
    const s = settings["pipeline"];
    if (!s) return null;
    const extra = s.extra_config || {};
    return (
      <div className="space-y-4">
        {renderProviderSelect("pipeline", PIPELINE_PROVIDERS)}

        {s.provider === "round_robin" && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-4 p-4 rounded-lg bg-muted/50">
            <div className="space-y-2">
              <Label className="text-xs">Slot-0 (GigaChat Key 1)</Label>
              <Select value={extra.slot0_model || "GigaChat-Max"} onValueChange={(v) => updateExtra("pipeline", "slot0_model", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {GIGACHAT_MODELS.map((m) => (
                    <SelectItem key={m.value} value={m.value}>
                      <span className="flex items-center">{m.label}<CostBadge model={m.value} /></span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-xs">Slot-1 (GigaChat Key 2)</Label>
              <Select value={extra.slot1_model || "GigaChat-Pro"} onValueChange={(v) => updateExtra("pipeline", "slot1_model", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {GIGACHAT_MODELS.map((m) => (
                    <SelectItem key={m.value} value={m.value}>
                      <span className="flex items-center">{m.label}<CostBadge model={m.value} /></span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-xs">Slot-2 (GigaChat Key 3)</Label>
              <Select value={extra.slot2_model || "GigaChat-Pro"} onValueChange={(v) => updateExtra("pipeline", "slot2_model", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {GIGACHAT_MODELS.map((m) => (
                    <SelectItem key={m.value} value={m.value}>
                      <span className="flex items-center">{m.label}<CostBadge model={m.value} /></span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-xs">Slot-3 (Gemini)</Label>
              <Select value={extra.gemini_model || "google/gemini-2.5-flash"} onValueChange={(v) => updateExtra("pipeline", "gemini_model", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {LOVABLE_MODELS.map((m) => (
                    <SelectItem key={m.value} value={m.value}>
                      <span className="flex items-center">{m.label}<CostBadge model={m.value} /></span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        )}

        <div className="space-y-2 max-w-[200px]">
          <Label>Параллельность (потоки)</Label>
          <Select value={String(s.concurrency)} onValueChange={(v) => updateField("pipeline", "concurrency", Number(v))}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {[1, 2, 3, 4, 5].map((n) => (
                <SelectItem key={n} value={String(n)}>{n}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
    );
  };

  const renderOrgDefault = () => {
    const s = settings["org_default"];
    if (!s) return null;
    return (
      <div className="space-y-4">
        {renderProviderSelect("org_default")}
      </div>
    );
  };



  const handleSaveKey = async (name: string) => {
    if (!editValue.trim()) {
      toast.error("Введите значение ключа");
      return;
    }
    setSavingKey(name);
    try {
      const { data, error } = await supabase.functions.invoke("manage-secret", {
        body: { action: "set", name, value: editValue.trim() } });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast.success(`Ключ ${name} сохранён`);
      setSecretsStatus((prev) => ({ ...prev, [name]: true }));
      setEditingKey(null);
      setEditValue("");
    } catch (e: any) {
      toast.error(e.message || "Ошибка сохранения ключа");
    } finally {
      setSavingKey(null);
    }
  };

  const renderApiKeys = () => (
    <div className="space-y-3">
      {API_KEYS_LIST.map((k) => {
        const isConfigured = secretsStatus[k.name];
        const isLoading = secretsLoading && Object.keys(secretsStatus).length === 0;
        const isEditing = editingKey === k.name;
        const isSaving = savingKey === k.name;
        const isSystemKey = k.name === "LOVABLE_API_KEY";
        return (
          <div key={k.name} className="flex items-center gap-3">
            <Label className="w-40 text-sm shrink-0">{k.label}</Label>
            {isEditing ? (
              <>
                <Input
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  placeholder="Вставьте API-ключ..."
                  className="max-w-[280px] font-mono text-xs"
                  type={showValue[k.name] ? "text" : "password"}
                  autoFocus
                />
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7"
                  onClick={() => setShowValue((p) => ({ ...p, [k.name]: !p[k.name] }))}
                >
                  {showValue[k.name] ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7 text-green-600"
                  onClick={() => handleSaveKey(k.name)}
                  disabled={isSaving}
                >
                  {isSaving ? <SigmaSpinner size="xs" className=".5 .5" /> : <Check className="w-3.5 h-3.5" />}
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7 text-destructive"
                  onClick={() => { setEditingKey(null); setEditValue(""); }}
                >
                  <X className="w-3.5 h-3.5" />
                </Button>
              </>
            ) : (
              <>
                <Input disabled value="••••••••••••" className="max-w-[200px] font-mono text-xs" />
                {isLoading ? (
                  <SigmaSpinner size="xs" />
                ) : isConfigured ? (
                  <span className="text-xs text-green-600 dark:text-green-400 font-medium">Настроен ✓</span>
                ) : (
                  <span className="text-xs text-destructive font-medium">Не настроен ✗</span>
                )}
                {!isSystemKey && (
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7"
                    onClick={() => { setEditingKey(k.name); setEditValue(""); }}
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </Button>
                )}
              </>
            )}
          </div>
        );
      })}
      <p className="text-xs text-muted-foreground mt-2">
        Нажмите на иконку карандаша, чтобы добавить или обновить API-ключ.
      </p>
    </div>
  );

  const renderPricingTable = () => (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Провайдер</TableHead>
            <TableHead>Модель</TableHead>
            <TableHead>Уровень</TableHead>
            <TableHead>Скорость</TableHead>
            <TableHead>Стоимость</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {MODEL_PRICING.map((m) => {
            const costMeta = COST_META[m.cost];
            return (
              <TableRow key={m.model}>
                <TableCell className="font-medium text-xs">{m.provider}</TableCell>
                <TableCell className="text-xs">{m.label}</TableCell>
                <TableCell>
                  <Badge variant="outline" className="text-[10px]">{m.level}</Badge>
                </TableCell>
                <TableCell className="text-xs">{m.speed}</TableCell>
                <TableCell>
                  <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${costMeta.color}`}>
                    {costMeta.emoji} {costMeta.label}
                  </span>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );

  const getStatusBadge = (ctx: string) => {
    const s = settings[ctx];
    if (!s) return null;
    const providerLabel = s.provider === "gigachat" ? "GigaChat" : s.provider === "lovable_ai" ? "Lovable AI" : s.provider === "round_robin" ? "Round-Robin" : s.provider === "elevenlabs" ? "ElevenLabs" : s.provider === "salutespeech" ? "SaluteSpeech" : s.provider;
    const modelLabel = s.provider === "gigachat" || s.provider === "round_robin"
      ? GIGACHAT_MODELS.find(m => m.value === s.gigachat_model)?.label || s.gigachat_model
      : LOVABLE_MODELS.find(m => m.value === s.lovable_model)?.label || IMAGE_MODELS.find(m => m.value === s.lovable_model)?.label || s.lovable_model;
    return (
      <Badge variant="secondary" className="text-[10px] font-normal ml-auto mr-2 hidden sm:inline-flex">
        {providerLabel} · {modelLabel}
      </Badge>
    );
  };

  const contextCount = Object.keys(CONTEXT_META).length;
  const keyCount = 5; // GigaChat x3 + ElevenLabs + Lovable AI

  const renderAccordionItem = (ctx: string, meta: typeof CONTEXT_META[string], content: React.ReactNode) => (
    <AccordionItem key={ctx} value={ctx} className="border rounded-xl shadow-sm hover:shadow-md transition-shadow duration-200 bg-card">
      <AccordionTrigger className="px-4 py-3 hover:no-underline">
        <div className="flex items-center gap-3 w-full">
          <div className={`p-2 rounded-lg ${meta.color}`}>{meta.icon}</div>
          <div className="text-left">
            <div className="font-semibold">{meta.title}</div>
            <div className="text-xs text-muted-foreground font-normal">{meta.description}</div>
          </div>
          {settings[ctx] && getStatusBadge(ctx)}
        </div>
      </AccordionTrigger>
      <AccordionContent className="px-4 pb-4">
        {content}
      </AccordionContent>
    </AccordionItem>
  );

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2">
            <Bot className="w-6 h-6" />
            <span>Настройки <span className="gradient-text">ИИ-провайдеров</span></span>
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            {contextCount} контекстов · {keyCount} ключей подключено
          </p>
        </div>
        <Button onClick={handleSave} disabled={saving} className="gap-2">
          {saving ? <SigmaSpinner size="sm" /> : <Save className="w-4 h-4" />}
          Сохранить
        </Button>
      </div>

      {/* Models section */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <div className="h-px flex-1 bg-border" />
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground px-2">Настройки моделей</span>
          <div className="h-px flex-1 bg-border" />
        </div>

        <Accordion type="multiple" defaultValue={Object.keys(CONTEXT_META)} className="space-y-3">
          {Object.entries(CONTEXT_META).map(([ctx, meta]) => {
            let content: React.ReactNode;
            if (ctx === "pipeline") {
              content = renderPipelineSection();
            } else if (ctx === "org_default") {
              content = renderOrgDefault();
            } else if (ctx === "tts") {
              content = (
                <div className="space-y-4">
                  {renderProviderSelect(ctx, TTS_PROVIDERS)}
                  {settings[ctx]?.provider === "elevenlabs" && (
                    <div className="space-y-2 mt-4 p-4 rounded-lg bg-muted/50">
                      <Label className="text-sm">Свой API-ключ ElevenLabs (опционально)</Label>
                      <Input
                        type="password"
                        placeholder="sk-... (оставьте пустым для ключа по умолчанию)"
                        value={settings[ctx]?.extra_config?.custom_api_key || ""}
                        onChange={(e) => updateExtra(ctx, "custom_api_key", e.target.value)}
                        className="max-w-md font-mono text-xs"
                      />
                      <p className="text-xs text-muted-foreground">
                        Если указан, будет использоваться вместо системного ключа ElevenLabs
                      </p>
                    </div>
                  )}
                  {settings[ctx]?.provider === "salutespeech" && (
                    <SaluteSpeechTestPanel
                      voice={settings[ctx]?.extra_config?.salute_voice || "natalya"}
                      onVoiceChange={(v) => updateExtra(ctx, "salute_voice", v)}
                    />
                  )}
                </div>
              );
            } else if (ctx === "image_generation") {
              content = renderProviderSelect(ctx, IMAGE_PROVIDERS, IMAGE_MODELS);
            } else {
              content = renderProviderSelect(ctx);
            }

            return renderAccordionItem(ctx, meta, (
              <>
                {content}
                {settings[ctx] && (
                  <AITestSandbox
                    context={ctx}
                    provider={settings[ctx].provider}
                    gigachatModel={settings[ctx].gigachat_model}
                    lovableModel={settings[ctx].lovable_model}
                  />
                )}
              </>
            ));
          })}
        </Accordion>
      </div>

      {/* Tools section */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <div className="h-px flex-1 bg-border" />
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground px-2">Инструменты</span>
          <div className="h-px flex-1 bg-border" />
        </div>

        <Accordion type="multiple" className="space-y-3">
          {/* Comparison */}
          <AccordionItem value="comparison" className="border rounded-xl shadow-sm hover:shadow-md transition-shadow duration-200 bg-card">
            <AccordionTrigger className="px-4 py-3 hover:no-underline">
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-lg ${TOOLS_META.comparison.color}`}>{TOOLS_META.comparison.icon}</div>
                <div className="text-left">
                  <div className="font-semibold">{TOOLS_META.comparison.title}</div>
                  <div className="text-xs text-muted-foreground font-normal">{TOOLS_META.comparison.description}</div>
                </div>
              </div>
            </AccordionTrigger>
            <AccordionContent className="px-4 pb-4">
              <AIComparisonPanel />
            </AccordionContent>
          </AccordionItem>

          {/* Pricing */}
          <AccordionItem value="pricing" className="border rounded-xl shadow-sm hover:shadow-md transition-shadow duration-200 bg-card">
            <AccordionTrigger className="px-4 py-3 hover:no-underline">
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-lg ${TOOLS_META.pricing.color}`}>{TOOLS_META.pricing.icon}</div>
                <div className="text-left">
                  <div className="font-semibold">{TOOLS_META.pricing.title}</div>
                  <div className="text-xs text-muted-foreground font-normal">{TOOLS_META.pricing.description}</div>
                </div>
              </div>
            </AccordionTrigger>
            <AccordionContent className="px-4 pb-4">
              {renderPricingTable()}
            </AccordionContent>
          </AccordionItem>

          {/* API Keys */}
          <AccordionItem value="api_keys" className="border rounded-xl shadow-sm hover:shadow-md transition-shadow duration-200 bg-card">
            <AccordionTrigger className="px-4 py-3 hover:no-underline">
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-lg ${TOOLS_META.api_keys.color}`}>{TOOLS_META.api_keys.icon}</div>
                <div className="text-left">
                  <div className="font-semibold">{TOOLS_META.api_keys.title}</div>
                  <div className="text-xs text-muted-foreground font-normal">{TOOLS_META.api_keys.description}</div>
                </div>
              </div>
            </AccordionTrigger>
            <AccordionContent className="px-4 pb-4">
              {renderApiKeys()}
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </div>
    </div>
  );
}
