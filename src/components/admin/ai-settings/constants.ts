import type { ReactNode } from "react";

export type CostLevel = "low" | "medium" | "high" | "premium";

export type AISetting = {
  id: string;
  context: string;
  provider: string;
  gigachat_model: string;
  lovable_model: string;
  concurrency: number;
  extra_config: Record<string, any>;
};

export const COST_META: Record<CostLevel, { label: string; emoji: string; color: string }> = {
  low: { label: "Низкая", emoji: "💰", color: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300" },
  medium: { label: "Средняя", emoji: "💰💰", color: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300" },
  high: { label: "Высокая", emoji: "💰💰💰", color: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-300" },
  premium: { label: "Премиум", emoji: "💎", color: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300" },
};

export const MODEL_PRICING = [
  { provider: "Lovable AI", model: "google/gemini-2.5-flash-lite", label: "Gemini 2.5 Flash Lite", level: "Базовый", speed: "⚡⚡⚡ Очень быстрая", cost: "low" as CostLevel },
  { provider: "Lovable AI", model: "google/gemini-2.5-flash", label: "Gemini 2.5 Flash", level: "Стандарт", speed: "⚡⚡ Быстрая", cost: "medium" as CostLevel },
  { provider: "Lovable AI", model: "google/gemini-3-flash-preview", label: "Gemini 3 Flash", level: "Стандарт", speed: "⚡⚡ Быстрая", cost: "medium" as CostLevel },
  { provider: "Lovable AI", model: "google/gemini-2.5-pro", label: "Gemini 2.5 Pro", level: "Продвинутый", speed: "⚡ Средняя", cost: "high" as CostLevel },
  { provider: "Lovable AI", model: "google/gemini-3-pro-preview", label: "Gemini 3 Pro", level: "Продвинутый", speed: "⚡ Средняя", cost: "high" as CostLevel },
  { provider: "Lovable AI", model: "openai/gpt-5-nano", label: "GPT-5 Nano", level: "Базовый", speed: "⚡⚡⚡ Очень быстрая", cost: "low" as CostLevel },
  { provider: "Lovable AI", model: "openai/gpt-5-mini", label: "GPT-5 Mini", level: "Стандарт", speed: "⚡⚡ Быстрая", cost: "medium" as CostLevel },
  { provider: "Lovable AI", model: "openai/gpt-5", label: "GPT-5", level: "Премиум", speed: "🐢 Медленная", cost: "premium" as CostLevel },
  { provider: "Lovable AI", model: "openai/gpt-5.2", label: "GPT-5.2", level: "Премиум", speed: "🐢 Медленная", cost: "premium" as CostLevel },
  { provider: "Lovable AI", model: "google/gemini-2.5-flash-image", label: "Gemini Flash Image", level: "Изображения", speed: "⚡⚡ Быстрая", cost: "medium" as CostLevel },
  { provider: "Lovable AI", model: "google/gemini-3-pro-image-preview", label: "Gemini 3 Pro Image", level: "Изображения", speed: "⚡ Средняя", cost: "high" as CostLevel },
  { provider: "GigaChat", model: "GigaChat", label: "GigaChat Lite", level: "Базовый", speed: "⚡⚡ Быстрая", cost: "low" as CostLevel },
  { provider: "GigaChat", model: "GigaChat-Pro", label: "GigaChat Pro", level: "Стандарт", speed: "⚡ Средняя", cost: "medium" as CostLevel },
  { provider: "GigaChat", model: "GigaChat-Max", label: "GigaChat Max", level: "Продвинутый", speed: "🐢 Медленная", cost: "high" as CostLevel },
  { provider: "ElevenLabs", model: "elevenlabs", label: "ElevenLabs TTS", level: "TTS", speed: "⚡⚡ Быстрая", cost: "high" as CostLevel },
];

export const MODEL_COST_MAP: Record<string, CostLevel> = {};
MODEL_PRICING.forEach((m) => { MODEL_COST_MAP[m.model] = m.cost; });

export const GIGACHAT_MODELS = [
  { value: "GigaChat-Max", label: "GigaChat Max" },
  { value: "GigaChat-Pro", label: "GigaChat Pro" },
  { value: "GigaChat", label: "GigaChat Lite" },
];

export const LOVABLE_MODELS = [
  { value: "google/gemini-2.5-flash", label: "Gemini 2.5 Flash" },
  { value: "google/gemini-2.5-pro", label: "Gemini 2.5 Pro" },
  { value: "google/gemini-2.5-flash-lite", label: "Gemini 2.5 Flash Lite" },
  { value: "google/gemini-3-flash-preview", label: "Gemini 3 Flash" },
  { value: "google/gemini-3-pro-preview", label: "Gemini 3 Pro" },
  { value: "openai/gpt-5", label: "GPT-5" },
  { value: "openai/gpt-5-mini", label: "GPT-5 Mini" },
  { value: "openai/gpt-5-nano", label: "GPT-5 Nano" },
];

export const IMAGE_MODELS = [
  { value: "google/gemini-2.5-flash-image", label: "Gemini Flash Image (быстрая)" },
  { value: "google/gemini-3-pro-image-preview", label: "Gemini 3 Pro Image (качественная)" },
];

export const IMAGE_PROVIDERS = [
  { value: "lovable_ai", label: "Lovable AI" },
  { value: "gigachat", label: "GigaChat" },
];

export const PROVIDERS = [
  { value: "lovable_ai", label: "Lovable AI" },
  { value: "gigachat", label: "GigaChat" },
];

export const PIPELINE_PROVIDERS = [
  ...PROVIDERS,
  { value: "round_robin", label: "Round-Robin (все)" },
];

export const TTS_PROVIDERS = [
  { value: "elevenlabs", label: "ElevenLabs" },
  { value: "salutespeech", label: "SaluteSpeech (Sber)" },
  { value: "lovable_ai", label: "Lovable AI" },
];

export const SALUTE_VOICES = [
  { value: "natalya", label: "Наталья (жен.)" },
  { value: "boris", label: "Борис (муж.)" },
  { value: "marfa", label: "Марфа (жен., молодой)" },
  { value: "taras", label: "Тарас (муж., молодой)" },
  { value: "alexandr", label: "Александр (муж., старший)" },
  { value: "sergey", label: "Сергей (муж.)" },
  { value: "kira", label: "Кира (жен.)" },
];

export const API_KEYS_LIST = [
  { name: "GIGACHAT_AUTH_KEY", label: "GigaChat Key 1" },
  { name: "GIGACHAT_AUTH_KEY_2", label: "GigaChat Key 2" },
  { name: "GIGACHAT_AUTH_KEY_3", label: "GigaChat Key 3" },
  { name: "SALUTESPEECH_AUTH_KEY", label: "SaluteSpeech Key 1" },
  { name: "SALUTESPEECH_AUTH_KEY_2", label: "SaluteSpeech Key 2" },
  { name: "SALUTESPEECH_AUTH_KEY_3", label: "SaluteSpeech Key 3" },
  { name: "ELEVENLABS_API_KEY", label: "ElevenLabs" },
  { name: "LOVABLE_API_KEY", label: "Lovable AI" },
  { name: "YANDEX_TELEMOST_OAUTH_TOKEN", label: "Яндекс Телемост (OAuth)" },
];
