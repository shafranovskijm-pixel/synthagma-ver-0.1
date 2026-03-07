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
import { ELEVENLABS_VOICES, DEFAULT_VOICE_ID } from '@/hooks/useElevenLabsTTS';
import { Volume2, Settings2 } from 'lucide-react';

interface TTSSettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  settings: TTSSettings;
  onSettingsChange: (settings: TTSSettings) => void;
}

export type TTSProvider = 'elevenlabs' | 'salutespeech' | 'browser';

export interface TTSSettings {
  provider: TTSProvider;
  voiceId: string;
  saluteVoice: string;
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
] as const;

const DEFAULT_SALUTE_VOICE = 'Natalya_24000';

const TTS_SETTINGS_KEY = 'tts-settings';

export function getStoredTTSSettings(): TTSSettings {
  try {
    const stored = localStorage.getItem(TTS_SETTINGS_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      // Backward compatibility: migrate old format
      if (parsed.provider) return parsed;
      return {
        provider: parsed.useElevenLabs ? 'elevenlabs' : 'browser',
        voiceId: parsed.voiceId || DEFAULT_VOICE_ID,
        saluteVoice: parsed.saluteVoice || DEFAULT_SALUTE_VOICE,
      };
    }
  } catch {
    // Ignore parse errors
  }
  return {
    provider: 'elevenlabs',
    voiceId: DEFAULT_VOICE_ID,
    saluteVoice: DEFAULT_SALUTE_VOICE,
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

  useEffect(() => {
    setLocalSettings(settings);
  }, [settings]);

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
            <Label>Провайдер озвучивания</Label>
            <Select
              value={localSettings.provider}
              onValueChange={(value: TTSProvider) =>
                setLocalSettings((prev) => ({ ...prev, provider: value }))
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Выберите провайдер" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="elevenlabs">ElevenLabs (рекомендуется)</SelectItem>
                <SelectItem value="salutespeech">SaluteSpeech (Сбер)</SelectItem>
                <SelectItem value="browser">Браузер (встроенный)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* ElevenLabs voice selection */}
          {localSettings.provider === 'elevenlabs' && (
            <div className="space-y-2">
              <Label>Голос</Label>
              <Select
                value={localSettings.voiceId}
                onValueChange={(value) =>
                  setLocalSettings((prev) => ({ ...prev, voiceId: value }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Выберите голос" />
                </SelectTrigger>
                <SelectContent>
                  {ELEVENLABS_VOICES.map((voice) => (
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
                George (мужской, РУ) — лучший для русского языка
              </p>
            </div>
          )}

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

          {localSettings.provider === 'browser' && (
            <div className="rounded-lg bg-muted p-3">
              <p className="text-sm text-muted-foreground">
                Будет использоваться встроенный синтезатор речи браузера. 
                Качество зависит от вашего браузера и устройства.
              </p>
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
