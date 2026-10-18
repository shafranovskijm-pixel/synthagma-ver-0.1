import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Volume2, Settings2 } from 'lucide-react';
import { getNativeSpeechStatus, isNativeSpeechPlatform, nativeSpeechMessage, resolveTTSProvider, type NativeSpeechStatus } from '@/mobile/nativeSpeech';
import { browserSpeechSupported, getRussianBrowserVoices, BROWSER_VOICES_WAIT_MS, MISSING_RUSSIAN_VOICE } from '@/lib/browserSpeech';

interface TTSSettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  settings: TTSSettings;
  onSettingsChange: (settings: TTSSettings) => void;
}

export type TTSProvider = 'salutespeech' | 'browser' | 'native';

export interface TTSSettings {
  provider: TTSProvider;
  /** @deprecated kept for backward compat — no longer used */
  voiceId?: string;
  saluteVoice: string;
  browserVoiceURI?: string;
  /** @deprecated kept for backward compat migration */
  useElevenLabs?: boolean;
}

export const SALUTE_VOICES = [
  { id: 'Natalya_24000', name: 'Наталья (женский, РУ)' },
  { id: 'Boris_24000', name: 'Борис (мужской, РУ)' },
  { id: 'Marfa_24000', name: 'Марфа (женский, РУ)' },
  { id: 'Taras_24000', name: 'Тарас (мужской, РУ)' },
  { id: 'Alexandra_24000', name: 'Александра (женский, РУ)' },
  { id: 'Sergey_24000', name: 'Сергей (мужской, РУ)' },
  { id: 'Kira_24000', name: 'Кира (женский, РУ)' },
] as const;

const DEFAULT_SALUTE_VOICE = 'Natalya_24000';

const TTS_SETTINGS_KEY = 'tts-settings';

/** Maps lowercase admin-style voice keys to client-side IDs */
export const ADMIN_TO_CLIENT_VOICE: Record<string, string> = {
  natalya: 'Natalya_24000',
  boris: 'Boris_24000',
  marfa: 'Marfa_24000',
  taras: 'Taras_24000',
  alexandr: 'Alexandra_24000',
  sergey: 'Sergey_24000',
  kira: 'Kira_24000',
};

export interface AdminTTSDefaults {
  provider?: string;
  saluteVoice?: string;
}

export function getStoredTTSSettings(adminDefaults?: AdminTTSDefaults): TTSSettings {
  try {
    const stored = localStorage.getItem(TTS_SETTINGS_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      // Keep an explicit Sber choice; obsolete providers use device speech.
      const rawProvider = parsed.provider as string | undefined;
      const provider = resolveTTSProvider(rawProvider, isNativeSpeechPlatform(), true);
      return {
        provider,
        saluteVoice: parsed.saluteVoice || DEFAULT_SALUTE_VOICE,
        browserVoiceURI: typeof parsed.browserVoiceURI === 'string' ? parsed.browserVoiceURI : undefined,
      };
    }
  } catch {
    // Ignore parse errors
  }

  // Device speech is the default; admin settings can supply the Sber voice.
  const rawAdmin = (adminDefaults?.provider as string | undefined) || 'salutespeech';
  const defaultProvider = resolveTTSProvider(rawAdmin, isNativeSpeechPlatform(), false);
  const adminVoiceRaw = adminDefaults?.saluteVoice || '';
  const defaultSaluteVoice = ADMIN_TO_CLIENT_VOICE[adminVoiceRaw] || adminVoiceRaw || DEFAULT_SALUTE_VOICE;

  return {
    provider: defaultProvider,
    saluteVoice: defaultSaluteVoice,
  };
}

export function saveTTSSettings(settings: TTSSettings) {
  localStorage.setItem(TTS_SETTINGS_KEY, JSON.stringify(settings));
}

export function TTSSettingsDialog({
  open,
  onOpenChange,
  settings,
  onSettingsChange,
}: TTSSettingsDialogProps) {
  const [localSettings, setLocalSettings] = useState<TTSSettings>(settings);
  const native = isNativeSpeechPlatform();
  const [nativeStatus, setNativeStatus] = useState<NativeSpeechStatus | null>(null);
  const [browserVoices, setBrowserVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [loadingVoices, setLoadingVoices] = useState(false);

  useEffect(() => {
    if (!open || localSettings.provider !== 'browser') return;
    const refresh = () => {
      const voices = getRussianBrowserVoices();
      setBrowserVoices(voices);
      if (voices.length) setLoadingVoices(false);
    };
    setLoadingVoices(browserSpeechSupported() && !getRussianBrowserVoices().length);
    refresh();
    const synth = window.speechSynthesis;
    synth?.addEventListener('voiceschanged', refresh);
    const timer = setTimeout(() => setLoadingVoices(false), BROWSER_VOICES_WAIT_MS);
    return () => { clearTimeout(timer); synth?.removeEventListener('voiceschanged', refresh); };
  }, [open, localSettings.provider]);

  useEffect(() => {
    if (!open || !native || localSettings.provider !== 'native') return;
    let current = true;
    setNativeStatus(null);
    void getNativeSpeechStatus().then(status => { if (current) setNativeStatus(status); });
    return () => { current = false; };
  }, [open, native, localSettings.provider]);

  useEffect(() => {
    if (open) setLocalSettings(settings);
  }, [settings, open]);

  const handleSave = () => {
    onSettingsChange(localSettings);
    saveTTSSettings(localSettings);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings2 className="w-5 h-5" />
            Настройки озвучивания
          </DialogTitle>
          <DialogDescription>
            Выберите провайдер и голос для озвучивания текста
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Provider selection */}
          <div className="space-y-2">
            <Label htmlFor="tts-provider">Провайдер озвучивания</Label>
            <Select
              value={localSettings.provider}
              onValueChange={(value: TTSProvider) =>
                setLocalSettings((prev) => ({ ...prev, provider: value }))
              }
            >
              <SelectTrigger id="tts-provider">
                <SelectValue placeholder="Выберите провайдер" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="salutespeech">SaluteSpeech (Сбер)</SelectItem>
                {native ? <SelectItem value="native">Android (голос устройства)</SelectItem> : <SelectItem value="browser">Браузер (встроенный)</SelectItem>}
              </SelectContent>
            </Select>
          </div>

          {/* SaluteSpeech voice selection */}
          {localSettings.provider === 'salutespeech' && (
            <div className="space-y-2">
              <Label>Голос</Label>
              <Select
                value={localSettings.saluteVoice}
                onValueChange={(value) =>
                  setLocalSettings((prev) => ({ ...prev, saluteVoice: value }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Выберите голос" />
                </SelectTrigger>
                <SelectContent>
                  {SALUTE_VOICES.map((voice) => (
                    <SelectItem key={voice.id} value={voice.id}>
                      <div className="flex items-center gap-2">
                        <Volume2 className="w-3.5 h-3.5 text-muted-foreground" />
                        {voice.name}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Русские голоса от SaluteSpeech (Сбер)
              </p>
            </div>
          )}

          {localSettings.provider === 'native' && (
            <div className="rounded-lg bg-muted p-3" role="status">
              <p className="text-sm text-muted-foreground">{nativeSpeechMessage(nativeStatus)}</p>
              <p className="text-xs text-muted-foreground mt-2">Приложение не скачивает голоса автоматически и не включает платную озвучку вместо выбранной.</p>
            </div>
          )}
          {localSettings.provider === 'browser' && (
            <div className="space-y-2">
              <Label htmlFor="tts-browser-voice">Русский голос</Label>
              <Select value={localSettings.browserVoiceURI || 'automatic'} onValueChange={value =>
                setLocalSettings(previous => ({ ...previous, browserVoiceURI: value === 'automatic' ? undefined : value }))}>
                <SelectTrigger id="tts-browser-voice"><SelectValue placeholder="Выберите голос" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="automatic">Автоматически (русский)</SelectItem>
                  {browserVoices.map(voice => <SelectItem key={voice.voiceURI} value={voice.voiceURI}>{voice.name}</SelectItem>)}
                  {localSettings.browserVoiceURI && !browserVoices.some(voice => voice.voiceURI === localSettings.browserVoiceURI) && (
                    <SelectItem value={localSettings.browserVoiceURI} disabled>Сохранённый голос недоступен</SelectItem>
                  )}
                </SelectContent>
              </Select>
              <div className="rounded-lg bg-muted p-3" role="status">
                <p className="text-sm text-muted-foreground">
                  {!browserSpeechSupported() ? 'Этот браузер не поддерживает озвучивание. Откройте урок в браузере с синтезатором речи.'
                    : loadingVoices ? 'Загружаем русские голоса…'
                    : !browserVoices.length ? MISSING_RUSSIAN_VOICE
                    : localSettings.browserVoiceURI && !browserVoices.some(voice => voice.voiceURI === localSettings.browserVoiceURI)
                      ? 'Сохранённый голос недоступен на этом устройстве. Будет использован доступный русский голос.'
                      : 'Используется встроенный русский голос. Качество зависит от браузера и устройства.'}
                </p>
              </div>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Отмена
          </Button>
          <Button onClick={handleSave}>Сохранить</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
