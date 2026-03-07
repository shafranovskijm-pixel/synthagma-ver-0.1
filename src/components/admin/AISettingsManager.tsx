import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Bot, Cpu, Mic, MessageSquare, Store, Layers, Building2, Key, Save, Loader2, ImagePlus, GitCompareArrows } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { AITestSandbox } from "./ai-settings/AITestSandbox";
import { AIComparisonPanel } from "./ai-settings/AIComparisonPanel";

type AISetting = {
  id: string;
  context: string;
  provider: string;
  gigachat_model: string;
  lovable_model: string;
  concurrency: number;
  extra_config: Record<string, any>;
};

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
];

const PROVIDERS = [
  { value: "gigachat", label: "GigaChat" },
  { value: "lovable_ai", label: "Lovable AI" },
];

const PIPELINE_PROVIDERS = [
  ...PROVIDERS,
  { value: "round_robin", label: "Round-Robin (все)" },
];

const TTS_PROVIDERS = [
  { value: "elevenlabs", label: "ElevenLabs" },
  { value: "lovable_ai", label: "Lovable AI" },
];

const CONTEXT_META: Record<string, { icon: React.ReactNode; title: string; description: string }> = {
  course_generation: {
    icon: <Cpu className="w-5 h-5" />,
    title: "Генерация курсов",
    description: "ИИ для создания структуры и контента курсов организаций",
  },
  tts: {
    icon: <Mic className="w-5 h-5" />,
    title: "Озвучка (TTS)",
    description: "Провайдер для синтеза речи в лекциях",
  },
  consultant: {
    icon: <MessageSquare className="w-5 h-5" />,
    title: "ИИ-консультант",
    description: "Чат-бот для помощи студентам",
  },
  marketplace: {
    icon: <Store className="w-5 h-5" />,
    title: "Маркетплейс",
    description: "Генерация описаний, SEO-текстов для витрины",
  },
  pipeline: {
    icon: <Layers className="w-5 h-5" />,
    title: "Конвейер (Bulk Pipeline)",
    description: "Массовая генерация вопросов и ответов",
  },
  org_default: {
    icon: <Building2 className="w-5 h-5" />,
    title: "Дефолт для организаций",
    description: "Провайдер по умолчанию для новых организаций",
  },
  image_generation: {
    icon: <ImagePlus className="w-5 h-5" />,
    title: "Генерация картинок",
    description: "ИИ для создания и редактирования изображений в курсах",
  },
};

export function AISettingsManager() {
  const [settings, setSettings] = useState<Record<string, AISetting>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadSettings();
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
          gigachat_model: row.gigachat_model || "GigaChat-Pro",
          lovable_model: row.lovable_model || "google/gemini-2.5-flash",
          concurrency: row.concurrency || 3,
          extra_config: (row.extra_config as Record<string, any>) || {},
        };
      });
      setSettings(map);
    }
    setLoading(false);
  };

  const updateField = (context: string, field: keyof AISetting, value: any) => {
    setSettings((prev) => ({
      ...prev,
      [context]: { ...prev[context], [field]: value },
    }));
  };

  const updateExtra = (context: string, key: string, value: any) => {
    setSettings((prev) => ({
      ...prev,
      [context]: {
        ...prev[context],
        extra_config: { ...prev[context].extra_config, [key]: value },
      },
    }));
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
        updated_at: new Date().toISOString(),
      }));

      for (const row of rows) {
        const { error } = await supabase
          .from("ai_settings")
          .update({
            provider: row.provider,
            gigachat_model: row.gigachat_model,
            lovable_model: row.lovable_model,
            concurrency: row.concurrency,
            extra_config: row.extra_config,
            updated_at: row.updated_at,
          })
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
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

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
            <div className="space-y-2">
              <Label>Модель GigaChat</Label>
              <Select value={s.gigachat_model} onValueChange={(v) => updateField(ctx, "gigachat_model", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {GIGACHAT_MODELS.map((m) => (
                    <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {(s.provider === "lovable_ai" || s.provider === "round_robin") && (
            <div className="space-y-2">
              <Label>{modelOptions ? "Модель" : "Модель Lovable AI"}</Label>
              <Select value={s.lovable_model} onValueChange={(v) => updateField(ctx, "lovable_model", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(modelOptions || LOVABLE_MODELS).map((m) => (
                    <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
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
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-4 p-4 rounded-lg bg-muted/50">
            <div className="space-y-2">
              <Label className="text-xs">Slot-0 (GigaChat Key 1)</Label>
              <Select value={extra.slot0_model || "GigaChat-Max"} onValueChange={(v) => updateExtra("pipeline", "slot0_model", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {GIGACHAT_MODELS.map((m) => (
                    <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
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
                    <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-xs">Slot-2 (Gemini)</Label>
              <Select value={extra.gemini_model || "google/gemini-2.5-flash"} onValueChange={(v) => updateExtra("pipeline", "gemini_model", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {LOVABLE_MODELS.map((m) => (
                    <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
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
    const allowOverride = s.extra_config?.allow_org_override ?? true;
    return (
      <div className="space-y-4">
        {renderProviderSelect("org_default")}
        <div className="flex items-center gap-3 mt-2">
          <Switch
            checked={allowOverride}
            onCheckedChange={(v) => updateExtra("org_default", "allow_org_override", v)}
          />
          <Label>Разрешить организациям менять провайдера</Label>
        </div>
      </div>
    );
  };

  const renderApiKeys = () => (
    <div className="space-y-3">
      {[
        { name: "GIGACHAT_AUTH_KEY", label: "GigaChat Key 1" },
        { name: "GIGACHAT_AUTH_KEY_2", label: "GigaChat Key 2" },
        { name: "ELEVENLABS_API_KEY", label: "ElevenLabs" },
        { name: "LOVABLE_API_KEY", label: "Lovable AI" },
      ].map((k) => (
        <div key={k.name} className="flex items-center gap-3">
          <Label className="w-40 text-sm shrink-0">{k.label}</Label>
          <Input disabled value="••••••••••••" className="max-w-[200px] font-mono text-xs" />
          <span className="text-xs text-muted-foreground">Настроен ✓</span>
        </div>
      ))}
      <p className="text-xs text-muted-foreground mt-2">
        API-ключи управляются через секреты Lovable Cloud. Для изменения используйте панель секретов.
      </p>
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2">
            <Bot className="w-6 h-6 text-primary" />
            Настройки ИИ-провайдеров
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Управление моделями и провайдерами для каждого контекста системы
          </p>
        </div>
        <Button onClick={handleSave} disabled={saving} className="gap-2">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Сохранить
        </Button>
      </div>

      <Accordion type="multiple" defaultValue={Object.keys(CONTEXT_META)} className="space-y-2">
        {Object.entries(CONTEXT_META).map(([ctx, meta]) => (
          <AccordionItem key={ctx} value={ctx} className="border rounded-xl px-1">
            <AccordionTrigger className="px-4 py-3 hover:no-underline">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-primary/10 text-primary">{meta.icon}</div>
                <div className="text-left">
                  <div className="font-semibold">{meta.title}</div>
                  <div className="text-xs text-muted-foreground font-normal">{meta.description}</div>
                </div>
              </div>
            </AccordionTrigger>
            <AccordionContent className="px-4 pb-4">
              {ctx === "pipeline"
                ? renderPipelineSection()
                : ctx === "org_default"
                ? renderOrgDefault()
                : ctx === "tts"
                ? renderProviderSelect(ctx, TTS_PROVIDERS)
                : ctx === "image_generation"
                ? renderProviderSelect(ctx, IMAGE_PROVIDERS, IMAGE_MODELS)
                : renderProviderSelect(ctx)}
              {settings[ctx] && (
                <AITestSandbox
                  context={ctx}
                  provider={settings[ctx].provider}
                  gigachatModel={settings[ctx].gigachat_model}
                  lovableModel={settings[ctx].lovable_model}
                />
              )}
            </AccordionContent>
          </AccordionItem>
        ))}

        {/* Comparison Panel */}
        <AccordionItem value="comparison" className="border rounded-xl px-1">
          <AccordionTrigger className="px-4 py-3 hover:no-underline">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10 text-primary"><GitCompareArrows className="w-5 h-5" /></div>
              <div className="text-left">
                <div className="font-semibold">Сравнение провайдеров</div>
                <div className="text-xs text-muted-foreground font-normal">A/B тест моделей — один промпт, несколько ИИ</div>
              </div>
            </div>
          </AccordionTrigger>
          <AccordionContent className="px-4 pb-4">
            <AIComparisonPanel />
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="api_keys" className="border rounded-xl px-1">
          <AccordionTrigger className="px-4 py-3 hover:no-underline">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10 text-primary"><Key className="w-5 h-5" /></div>
              <div className="text-left">
                <div className="font-semibold">API-ключи</div>
                <div className="text-xs text-muted-foreground font-normal">Статус подключенных ключей</div>
              </div>
            </div>
          </AccordionTrigger>
          <AccordionContent className="px-4 pb-4">
            {renderApiKeys()}
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </div>
  );
}
