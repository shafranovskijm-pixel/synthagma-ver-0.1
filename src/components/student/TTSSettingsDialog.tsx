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
import { Switch } from '@/components/ui/switch';
import { ELEVENLABS_VOICES, DEFAULT_VOICE_ID } from '@/hooks/useElevenLabsTTS';
import { Volume2, Settings2 } from 'lucide-react';

interface TTSSettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  settings: TTSSettings;
  onSettingsChange: (settings: TTSSettings) => void;
}

export interface TTSSettings {
  voiceId: string;
  useElevenLabs: boolean;
}

const TTS_SETTINGS_KEY = 'tts-settings';

export function getStoredTTSSettings(): TTSSettings {
  try {
    const stored = localStorage.getItem(TTS_SETTINGS_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch {
    // Ignore parse errors
  }
  return {
    voiceId: DEFAULT_VOICE_ID,
    useElevenLabs: true,
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
            Выберите голос и настройки для озвучивания текста
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* ElevenLabs toggle */}
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="use-elevenlabs" className="text-sm font-medium">
                Использовать ElevenLabs
              </Label>
              <p className="text-xs text-muted-foreground">
                Качественный ИИ-голос (рекомендуется)
              </p>
            </div>
            <Switch
              id="use-elevenlabs"
              checked={localSettings.useElevenLabs}
              onCheckedChange={(checked) =>
                setLocalSettings((prev) => ({ ...prev, useElevenLabs: checked }))
              }
            />
          </div>

          {/* Voice selection (only for ElevenLabs) */}
          {localSettings.useElevenLabs && (
            <div className="space-y-2">
              <Label htmlFor="voice-select">Голос</Label>
              <Select
                value={localSettings.voiceId}
                onValueChange={(value) =>
                  setLocalSettings((prev) => ({ ...prev, voiceId: value }))
                }
              >
                <SelectTrigger id="voice-select">
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

          {!localSettings.useElevenLabs && (
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
