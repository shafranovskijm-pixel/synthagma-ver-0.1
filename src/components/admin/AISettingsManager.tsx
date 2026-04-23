import { useState, useRef } from "react";
import { Bot, Cpu, Mic, MessageSquare, Store, Layers, Building2, Key, Save, ImagePlus, GitCompareArrows, DollarSign, Play, Square, Pencil, Check, X, Eye, EyeOff } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AITestSandbox } from "./ai-settings/AITestSandbox";
import { AIComparisonPanel } from "./ai-settings/AIComparisonPanel";
import { SigmaSpinner } from "@/components/ui/SigmaSpinner";
import { toast } from "sonner";
import { useAISettings } from "@/hooks/useAISettings";
import {
  COST_META, MODEL_PRICING, MODEL_COST_MAP, GIGACHAT_MODELS, LOVABLE_MODELS,
  IMAGE_MODELS, IMAGE_PROVIDERS, PROVIDERS, PIPELINE_PROVIDERS, TTS_PROVIDERS,
  SALUTE_VOICES, API_KEYS_LIST, type CostLevel,
} from "./ai-settings/constants";

// ── Icons for context meta ──
const CONTEXT_META: Record<string, { icon: React.ReactNode; title: string; description: string; color: string }> = {
  course_generation: { icon: <Cpu className="w-5 h-5" />, title: "Генерация курсов", description: "ИИ для создания структуры и контента курсов организаций", color: "bg-blue-100 text-blue-600 dark:bg-blue-900/40 dark:text-blue-400" },
  tts: { icon: <Mic className="w-5 h-5" />, title: "Озвучка (TTS)", description: "Провайдер для синтеза речи в лекциях", color: "bg-purple-100 text-purple-600 dark:bg-purple-900/40 dark:text-purple-400" },
  consultant: { icon: <MessageSquare className="w-5 h-5" />, title: "ИИ-консультант", description: "Чат-бот для помощи студентам", color: "bg-emerald-100 text-emerald-600 dark:bg-emerald-900/40 dark:text-emerald-400" },
  marketplace: { icon: <Store className="w-5 h-5" />, title: "Маркетплейс", description: "Генерация описаний, SEO-текстов для витрины", color: "bg-orange-100 text-orange-600 dark:bg-orange-900/40 dark:text-orange-400" },
  pipeline: { icon: <Layers className="w-5 h-5" />, title: "Конвейер (Bulk Pipeline)", description: "Массовая генерация вопросов и ответов", color: "bg-indigo-100 text-indigo-600 dark:bg-indigo-900/40 dark:text-indigo-400" },
  org_default: { icon: <Building2 className="w-5 h-5" />, title: "Дефолт для организаций", description: "Провайдер по умолчанию для новых организаций", color: "bg-slate-100 text-slate-600 dark:bg-slate-900/40 dark:text-slate-400" },
  image_generation: { icon: <ImagePlus className="w-5 h-5" />, title: "Генерация картинок", description: "ИИ для создания и редактирования изображений в курсах", color: "bg-pink-100 text-pink-600 dark:bg-pink-900/40 dark:text-pink-400" },
};

const TOOLS_META: Record<string, { icon: React.ReactNode; title: string; description: string; color: string }> = {
  comparison: { icon: <GitCompareArrows className="w-5 h-5" />, title: "Сравнение провайдеров", description: "A/B тест моделей — один промпт, несколько ИИ", color: "bg-cyan-100 text-cyan-600 dark:bg-cyan-900/40 dark:text-cyan-400" },
  pricing: { icon: <DollarSign className="w-5 h-5" />, title: "Тарифы моделей", description: "Справочник стоимости и скорости всех моделей", color: "bg-amber-100 text-amber-600 dark:bg-amber-900/40 dark:text-amber-400" },
  api_keys: { icon: <Key className="w-5 h-5" />, title: "API-ключи", description: "Статус подключенных ключей", color: "bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-400" },
};

function CostBadge({ model }: { model: string }) {
  const cost = MODEL_COST_MAP[model];
  if (!cost) return null;
  const meta = COST_META[cost];
  return <span className={`ml-2 inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium ${meta.color}`}>{meta.emoji}</span>;
}

function SaluteSpeechTestPanel({ voice, onVoiceChange }: { voice: string; onVoiceChange: (v: string) => void }) {
  const [testText, setTestText] = useState("Привет! Это тестовый синтез речи через SaluteSpeech.");
  const [testing, setTesting] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const handleTest = async () => {
    setTesting(true); setAudioUrl(null);
    try {
      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/salutespeech-tts`, {
        method: "POST", headers: { "Content-Type": "application/json", apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY, Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}` },
        body: JSON.stringify({ text: testText, voice, format: "opus" }),
      });
      if (!response.ok) { const err = await response.json().catch(() => ({ error: "Неизвестная ошибка" })); throw new Error(err.error || `HTTP ${response.status}`); }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      setAudioUrl(url);
      const audio = new Audio(url); audioRef.current = audio; await audio.play();
      toast.success("SaluteSpeech: синтез выполнен");
    } catch (e: any) { toast.error("Ошибка SaluteSpeech: " + e.message); } finally { setTesting(false); }
  };

  return (
    <div className="space-y-3 mt-4 p-4 rounded-lg bg-muted/50">
      <div className="space-y-2">
        <Label className="text-sm">Голос SaluteSpeech</Label>
        <Select value={voice} onValueChange={onVoiceChange}><SelectTrigger className="max-w-xs"><SelectValue /></SelectTrigger><SelectContent>{SALUTE_VOICES.map((v) => <SelectItem key={v.value} value={v.value}>{v.label}</SelectItem>)}</SelectContent></Select>
      </div>
      <div className="space-y-2">
        <Label className="text-sm">Текст для теста</Label>
        <Input value={testText} onChange={(e) => setTestText(e.target.value)} placeholder="Введите текст..." className="max-w-md text-sm" />
      </div>
      <div className="flex items-center gap-2">
        <Button size="sm" variant="outline" onClick={handleTest} disabled={testing || !testText.trim()} className="gap-2">{testing ? <SigmaSpinner size="xs" /> : <Play className="w-3 h-3" />}Тестировать</Button>
        {audioUrl && <Button size="sm" variant="ghost" onClick={() => { audioRef.current?.pause(); if (audioRef.current) audioRef.current.currentTime = 0; }} className="gap-2"><Square className="w-3 h-3" /> Стоп</Button>}
      </div>
      {audioUrl && <audio controls src={audioUrl} className="w-full max-w-md mt-2" />}
    </div>
  );
}

export function AISettingsManager() {
  const h = useAISettings();

  if (h.loading) return <div className="flex items-center justify-center py-12"><SigmaSpinner /></div>;

  const renderModelSelect = (models: { value: string; label: string }[], value: string, onChange: (v: string) => void, label: string) => (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Select value={value} onValueChange={onChange}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{models.map((m) => <SelectItem key={m.value} value={m.value}><span className="flex items-center">{m.label}<CostBadge model={m.value} /></span></SelectItem>)}</SelectContent></Select>
    </div>
  );

  const renderProviderSelect = (ctx: string, options = PROVIDERS, modelOptions?: { value: string; label: string }[]) => {
    const s = h.settings[ctx]; if (!s) return null;
    return (
      <div className="space-y-4"><div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-2"><Label>Провайдер</Label><Select value={s.provider} onValueChange={(v) => h.updateField(ctx, "provider", v)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{options.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent></Select></div>
        {(s.provider === "gigachat" || s.provider === "round_robin") && !modelOptions && renderModelSelect(GIGACHAT_MODELS, s.gigachat_model, (v) => h.updateField(ctx, "gigachat_model", v), "Модель GigaChat")}
        {s.provider === "gigachat" && modelOptions && renderModelSelect(GIGACHAT_MODELS, s.gigachat_model, (v) => h.updateField(ctx, "gigachat_model", v), "Модель GigaChat")}
        {(s.provider === "lovable_ai" || s.provider === "round_robin") && renderModelSelect(modelOptions || LOVABLE_MODELS, s.lovable_model, (v) => h.updateField(ctx, "lovable_model", v), modelOptions ? "Модель" : "Модель Lovable AI")}
      </div></div>
    );
  };

  const renderPipelineSection = () => {
    const s = h.settings["pipeline"]; if (!s) return null;
    const extra = s.extra_config || {};
    return (
      <div className="space-y-4">
        {renderProviderSelect("pipeline", PIPELINE_PROVIDERS)}
        {s.provider === "round_robin" && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-4 p-4 rounded-lg bg-muted/50">
            {[
              { label: "Slot-0 (GigaChat Key 1)", key: "slot0_model", def: "GigaChat-Max", models: GIGACHAT_MODELS },
              { label: "Slot-1 (GigaChat Key 2)", key: "slot1_model", def: "GigaChat-Pro", models: GIGACHAT_MODELS },
              { label: "Slot-2 (GigaChat Key 3)", key: "slot2_model", def: "GigaChat-Pro", models: GIGACHAT_MODELS },
              { label: "Slot-3 (Gemini)", key: "gemini_model", def: "google/gemini-2.5-flash", models: LOVABLE_MODELS },
            ].map((slot) => (
              <div key={slot.key} className="space-y-2">
                <Label className="text-xs">{slot.label}</Label>
                <Select value={extra[slot.key] || slot.def} onValueChange={(v) => h.updateExtra("pipeline", slot.key, v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{slot.models.map((m) => <SelectItem key={m.value} value={m.value}><span className="flex items-center">{m.label}<CostBadge model={m.value} /></span></SelectItem>)}</SelectContent>
                </Select>
              </div>
            ))}
          </div>
        )}
        <div className="space-y-2 max-w-[200px]">
          <Label>Параллельность (потоки)</Label>
          <Select value={String(s.concurrency)} onValueChange={(v) => h.updateField("pipeline", "concurrency", Number(v))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{[1,2,3,4,5].map((n) => <SelectItem key={n} value={String(n)}>{n}</SelectItem>)}</SelectContent></Select>
        </div>
      </div>
    );
  };

  const getStatusBadge = (ctx: string) => {
    const s = h.settings[ctx]; if (!s) return null;
    const providerLabel = s.provider === "gigachat" ? "GigaChat" : s.provider === "lovable_ai" ? "Lovable AI" : s.provider === "round_robin" ? "Round-Robin" : s.provider === "salutespeech" ? "SaluteSpeech" : s.provider;
    const modelLabel = s.provider === "gigachat" || s.provider === "round_robin"
      ? GIGACHAT_MODELS.find(m => m.value === s.gigachat_model)?.label || s.gigachat_model
      : LOVABLE_MODELS.find(m => m.value === s.lovable_model)?.label || IMAGE_MODELS.find(m => m.value === s.lovable_model)?.label || s.lovable_model;
    return <Badge variant="secondary" className="text-[10px] font-normal ml-auto mr-2 hidden sm:inline-flex">{providerLabel} · {modelLabel}</Badge>;
  };

  const getContextContent = (ctx: string) => {
    if (ctx === "pipeline") return renderPipelineSection();
    if (ctx === "org_default") return renderProviderSelect("org_default");
    if (ctx === "tts") return (
      <div className="space-y-4">
        {renderProviderSelect(ctx, TTS_PROVIDERS)}
        {h.settings[ctx]?.provider === "salutespeech" && <SaluteSpeechTestPanel voice={h.settings[ctx]?.extra_config?.salute_voice || "natalya"} onVoiceChange={(v) => h.updateExtra(ctx, "salute_voice", v)} />}
      </div>
    );
    if (ctx === "image_generation") return renderProviderSelect(ctx, IMAGE_PROVIDERS, IMAGE_MODELS);
    return renderProviderSelect(ctx);
  };

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2"><Bot className="w-6 h-6" /><span>Настройки <span className="gradient-text">ИИ-провайдеров</span></span></h2>
          <p className="text-sm text-muted-foreground mt-1">{Object.keys(CONTEXT_META).length} контекстов · 5 ключей подключено</p>
        </div>
        <Button onClick={h.handleSave} disabled={h.saving} className="gap-2">{h.saving ? <SigmaSpinner size="sm" /> : <Save className="w-4 h-4" />}Сохранить</Button>
      </div>

      <div className="space-y-4">
        <div className="flex items-center gap-2"><div className="h-px flex-1 bg-border" /><span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground px-2">Настройки моделей</span><div className="h-px flex-1 bg-border" /></div>
        <Accordion type="multiple" defaultValue={Object.keys(CONTEXT_META)} className="space-y-3">
          {Object.entries(CONTEXT_META).map(([ctx, meta]) => (
            <AccordionItem key={ctx} value={ctx} className="border rounded-xl shadow-sm hover:shadow-md transition-shadow duration-200 bg-card">
              <AccordionTrigger className="px-4 py-3 hover:no-underline">
                <div className="flex items-center gap-3 w-full"><div className={`p-2 rounded-lg ${meta.color}`}>{meta.icon}</div><div className="text-left"><div className="font-semibold">{meta.title}</div><div className="text-xs text-muted-foreground font-normal">{meta.description}</div></div>{h.settings[ctx] && getStatusBadge(ctx)}</div>
              </AccordionTrigger>
              <AccordionContent className="px-4 pb-4">
                {getContextContent(ctx)}
                {h.settings[ctx] && <AITestSandbox context={ctx} provider={h.settings[ctx].provider} gigachatModel={h.settings[ctx].gigachat_model} lovableModel={h.settings[ctx].lovable_model} />}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>

      <div className="space-y-4">
        <div className="flex items-center gap-2"><div className="h-px flex-1 bg-border" /><span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground px-2">Инструменты</span><div className="h-px flex-1 bg-border" /></div>
        <Accordion type="multiple" className="space-y-3">
          <AccordionItem value="comparison" className="border rounded-xl shadow-sm hover:shadow-md transition-shadow duration-200 bg-card">
            <AccordionTrigger className="px-4 py-3 hover:no-underline"><div className="flex items-center gap-3"><div className={`p-2 rounded-lg ${TOOLS_META.comparison.color}`}>{TOOLS_META.comparison.icon}</div><div className="text-left"><div className="font-semibold">{TOOLS_META.comparison.title}</div><div className="text-xs text-muted-foreground font-normal">{TOOLS_META.comparison.description}</div></div></div></AccordionTrigger>
            <AccordionContent className="px-4 pb-4"><AIComparisonPanel /></AccordionContent>
          </AccordionItem>
          <AccordionItem value="pricing" className="border rounded-xl shadow-sm hover:shadow-md transition-shadow duration-200 bg-card">
            <AccordionTrigger className="px-4 py-3 hover:no-underline"><div className="flex items-center gap-3"><div className={`p-2 rounded-lg ${TOOLS_META.pricing.color}`}>{TOOLS_META.pricing.icon}</div><div className="text-left"><div className="font-semibold">{TOOLS_META.pricing.title}</div><div className="text-xs text-muted-foreground font-normal">{TOOLS_META.pricing.description}</div></div></div></AccordionTrigger>
            <AccordionContent className="px-4 pb-4">
              <div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Провайдер</TableHead><TableHead>Модель</TableHead><TableHead>Уровень</TableHead><TableHead>Скорость</TableHead><TableHead>Стоимость</TableHead></TableRow></TableHeader><TableBody>{MODEL_PRICING.map((m) => { const costMeta = COST_META[m.cost]; return (<TableRow key={m.model}><TableCell className="font-medium text-xs">{m.provider}</TableCell><TableCell className="text-xs">{m.label}</TableCell><TableCell><Badge variant="outline" className="text-[10px]">{m.level}</Badge></TableCell><TableCell className="text-xs">{m.speed}</TableCell><TableCell><span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${costMeta.color}`}>{costMeta.emoji} {costMeta.label}</span></TableCell></TableRow>); })}</TableBody></Table></div>
            </AccordionContent>
          </AccordionItem>
          <AccordionItem value="api_keys" className="border rounded-xl shadow-sm hover:shadow-md transition-shadow duration-200 bg-card">
            <AccordionTrigger className="px-4 py-3 hover:no-underline"><div className="flex items-center gap-3"><div className={`p-2 rounded-lg ${TOOLS_META.api_keys.color}`}>{TOOLS_META.api_keys.icon}</div><div className="text-left"><div className="font-semibold">{TOOLS_META.api_keys.title}</div><div className="text-xs text-muted-foreground font-normal">{TOOLS_META.api_keys.description}</div></div></div></AccordionTrigger>
            <AccordionContent className="px-4 pb-4">
              <ApiKeysPanel h={h} />
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </div>
    </div>
  );
}

function ApiKeysPanel({ h }: { h: ReturnType<typeof useAISettings> }) {
  return (
    <div className="space-y-3">
      {API_KEYS_LIST.map((k) => {
        const isConfigured = h.secretsStatus[k.name];
        const isLoading = h.secretsLoading && Object.keys(h.secretsStatus).length === 0;
        const isEditing = h.editingKey === k.name;
        const isSaving = h.savingKey === k.name;
        const isSystemKey = k.name === "LOVABLE_API_KEY";
        return (
          <div key={k.name} className="flex items-center gap-3">
            <Label className="w-40 text-sm shrink-0">{k.label}</Label>
            {isEditing ? (
              <>
                <Input value={h.editValue} onChange={(e) => h.setEditValue(e.target.value)} placeholder="Вставьте API-ключ..." className="max-w-[280px] font-mono text-xs" type={h.showValue[k.name] ? "text" : "password"} autoFocus />
                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => h.setShowValue((p) => ({ ...p, [k.name]: !p[k.name] }))}>{h.showValue[k.name] ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}</Button>
                <Button size="icon" variant="ghost" className="h-7 w-7 text-green-600" onClick={() => h.handleSaveKey(k.name)} disabled={isSaving}>{isSaving ? <SigmaSpinner size="xs" /> : <Check className="w-3.5 h-3.5" />}</Button>
                <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => { h.setEditingKey(null); h.setEditValue(""); }}><X className="w-3.5 h-3.5" /></Button>
              </>
            ) : (
              <>
                <Input disabled value="••••••••••••" className="max-w-[200px] font-mono text-xs" />
                {isLoading ? <SigmaSpinner size="xs" /> : isConfigured ? <span className="text-xs text-green-600 dark:text-green-400 font-medium">Настроен ✓</span> : <span className="text-xs text-destructive font-medium">Не настроен ✗</span>}
                {!isSystemKey && <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => { h.setEditingKey(k.name); h.setEditValue(""); }}><Pencil className="w-3.5 h-3.5" /></Button>}
              </>
            )}
          </div>
        );
      })}
      <p className="text-xs text-muted-foreground mt-2">Нажмите на иконку карандаша, чтобы добавить или обновить API-ключ.</p>
    </div>
  );
}
