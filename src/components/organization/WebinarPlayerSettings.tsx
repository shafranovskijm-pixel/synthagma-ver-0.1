import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

export interface PlayerSettings {
  autoplay: boolean;
  autopause: boolean;
  loop: boolean;
  muted: boolean;
  playbackRate: boolean;
  subtitles: boolean;
  fullscreen: boolean;
  pip: boolean;
  chromecast: boolean;
  airplay: boolean;
  watermarkText: string;
}

export const defaultPlayerSettings: PlayerSettings = {
  autoplay: false,
  autopause: true,
  loop: false,
  muted: false,
  playbackRate: true,
  subtitles: true,
  fullscreen: true,
  pip: true,
  chromecast: true,
  airplay: true,
  watermarkText: "",
};

export function buildKinescopeEmbedUrl(videoId: string, settings?: Partial<PlayerSettings>): string {
  const base = `https://kinescope.io/embed/${videoId}`;
  if (!settings || Object.keys(settings).length === 0) return base;

  const params = new URLSearchParams();
  if (settings.autoplay) params.set("autoplay", "1");
  if (settings.muted) params.set("muted", "1");
  if (settings.loop) params.set("loop", "1");
  if (settings.autopause === false) params.set("autopause", "0");
  if (settings.playbackRate === false) params.set("playback-rate", "0");
  if (settings.fullscreen === false) params.set("fullscreen", "0");
  if (settings.pip === false) params.set("pip", "0");
  if (settings.subtitles === false) params.set("cc", "0");
  if (settings.chromecast === false) params.set("chromecast", "0");
  if (settings.airplay === false) params.set("airplay", "0");
  if (settings.watermarkText) params.set("watermark-text", settings.watermarkText);

  const qs = params.toString();
  return qs ? `${base}?${qs}` : base;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  webinarId: string;
  initialSettings: Partial<PlayerSettings>;
  onSaved: () => void;
}

export function WebinarPlayerSettings({ open, onOpenChange, webinarId, initialSettings, onSaved }: Props) {
  const [settings, setSettings] = useState<PlayerSettings>({
    ...defaultPlayerSettings,
    ...initialSettings,
  });
  const [saving, setSaving] = useState(false);

  const toggle = (key: keyof PlayerSettings) => {
    setSettings((s) => ({ ...s, [key]: !s[key] }));
  };

  const handleSave = async () => {
    setSaving(true);
    const { error } = await supabase
      .from("webinars")
      .update({ player_settings: settings as any } as any)
      .eq("id", webinarId);
    setSaving(false);
    if (error) {
      toast.error("Ошибка сохранения настроек");
    } else {
      toast.success("Настройки плеера сохранены");
      onSaved();
      onOpenChange(false);
    }
  };

  const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
    <div className="space-y-3">
      <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">{title}</h4>
      <div className="space-y-2">{children}</div>
    </div>
  );

  const Row = ({ label, checked, onToggle }: { label: string; checked: boolean; onToggle: () => void }) => (
    <div className="flex items-center justify-between py-1.5">
      <Label className="text-sm font-normal cursor-pointer" onClick={onToggle}>{label}</Label>
      <Switch checked={checked} onCheckedChange={onToggle} />
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Настройки плеера</DialogTitle>
        </DialogHeader>

        <div className="space-y-6 max-h-[60vh] overflow-y-auto pr-1">
          <Section title="Поведение">
            <Row label="Автозапуск" checked={settings.autoplay} onToggle={() => toggle("autoplay")} />
            <Row label="Автопауза (при переключении вкладки)" checked={settings.autopause} onToggle={() => toggle("autopause")} />
            <Row label="Зацикливание" checked={settings.loop} onToggle={() => toggle("loop")} />
            <Row label="Запуск без звука" checked={settings.muted} onToggle={() => toggle("muted")} />
          </Section>

          <Section title="Трансляция на устройства">
            <Row label="Chromecast" checked={settings.chromecast} onToggle={() => toggle("chromecast")} />
            <Row label="AirPlay" checked={settings.airplay} onToggle={() => toggle("airplay")} />
          </Section>

          <Section title="Элементы управления">
            <Row label="Скорость воспроизведения" checked={settings.playbackRate} onToggle={() => toggle("playbackRate")} />
            <Row label="Субтитры" checked={settings.subtitles} onToggle={() => toggle("subtitles")} />
            <Row label="Полный экран" checked={settings.fullscreen} onToggle={() => toggle("fullscreen")} />
            <Row label="Картинка в картинке" checked={settings.pip} onToggle={() => toggle("pip")} />
          </Section>

          <Section title="Водяной знак">
            <Input
              placeholder="Текст водяного знака"
              value={settings.watermarkText}
              onChange={(e) => setSettings((s) => ({ ...s, watermarkText: e.target.value }))}
            />
          </Section>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Отмена</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Сохранить
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
