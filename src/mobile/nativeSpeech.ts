import { Capacitor, registerPlugin } from '@capacitor/core';

export interface NativeSpeechStatus {
  available: boolean;
  reason: 'ready' | 'no_engine' | 'missing_voice' | 'init_failed' | 'unavailable';
  voiceName?: string;
}

export const NativeSpeech = registerPlugin<{
  getStatus(): Promise<NativeSpeechStatus>;
  speak(options: { text: string }): Promise<{ completed: boolean }>;
  stop(): Promise<void>;
}>('NativeSpeech');

export const isNativeSpeechPlatform = () => Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';

export function nativeSpeechMessage(status: NativeSpeechStatus | null): string {
  if (!status) return 'Проверяем русский голос Android…';
  if (status.available) return 'Установленный русский голос Android доступен. Озвучка работает на устройстве без платного API.';
  if (status.reason === 'no_engine') return 'В Android не установлен синтезатор речи. Установите движок озвучивания и русский голос в настройках телефона.';
  if (status.reason === 'missing_voice') return 'Нет установленного русского голоса для работы без интернета. Добавьте русский голос в настройках озвучивания Android.';
  return 'Не удалось запустить озвучивание Android. Проверьте синтезатор речи и русский голос в настройках телефона.';
}

export function resolveTTSProvider(raw: unknown, native: boolean, explicitChoice: boolean): 'native' | 'browser' | 'salutespeech' {
  if (native) return explicitChoice && raw === 'salutespeech' ? 'salutespeech' : 'native';
  return raw === 'browser' || raw === 'native' ? 'browser' : 'salutespeech';
}

export async function getNativeSpeechStatus(): Promise<NativeSpeechStatus> {
  if (!isNativeSpeechPlatform()) return { available: false, reason: 'unavailable' };
  try { return await NativeSpeech.getStatus(); }
  catch { return { available: false, reason: 'unavailable' }; }
}
