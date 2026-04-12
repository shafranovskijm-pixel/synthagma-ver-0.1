import { useState, useEffect } from "react";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, ChevronDown, ChevronUp, Settings } from "lucide-react";

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
  webinarId: string;
  initialSettings: Partial<PlayerSettings>;
  onSaved: () => void;
}

export function InlinePlayerSettings({ webinarId, initialSettings, onSaved }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [settings, setSettings] = useState<PlayerSettings>({
    ...defaultPlayerSettings,
    ...initialSettings,
  });
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    setSettings({ ...defaultPlayerSettings, ...initialSettings });
    setDirty(false);
  }, [webinarId]);

  const toggle = (key: keyof PlayerSettings) => {
    setSettings((s) => ({ ...s, [key]: !s[key] }));
    setDirty(true);
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
      setDirty(false);
      onSaved();
    }
  };

  const Row = ({ label, checked, onToggle }: { label: string; checked: boolean; onToggle: () => void }) => (
    <div className="flex items-center justify-between py-0.5">
      <Label className="text-xs font-normal cursor-pointer" onClick={onToggle}>{label}</Label>
      <Switch checked={checked} onCheckedChange={onToggle} className="scale-75" />
    </div>
  );

  return (
    <div className="border border-border rounded-lg overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-3 py-2 text-xs font-medium text-muted-foreground hover:bg-muted/50 transition-colors"
      >
        <span className="flex items-center gap-1.5">
          <Settings className="w-3 h-3" />
          Настройки плеера
        </span>
        {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
      </button>

      {expanded && (
        <div className="px-3 pb-3 space-y-3 border-t border-border pt-2">
          <div>
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold mb-1">Поведение</p>
            <Row label="Автозапуск" checked={settings.autoplay} onToggle={() => toggle("autoplay")} />
            <Row label="Автопауза" checked={settings.autopause} onToggle={() => toggle("autopause")} />
            <Row label="Зацикливание" checked={settings.loop} onToggle={() => toggle("loop")} />
            <Row label="Без звука" checked={settings.muted} onToggle={() => toggle("muted")} />
          </div>

          <div>
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold mb-1">Устройства</p>
            <Row label="Chromecast" checked={settings.chromecast} onToggle={() => toggle("chromecast")} />
            <Row label="AirPlay" checked={settings.airplay} onToggle={() => toggle("airplay")} />
          </div>

          <div>
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold mb-1">Управление</p>
            <Row label="Скорость" checked={settings.playbackRate} onToggle={() => toggle("playbackRate")} />
            <Row label="Субтитры" checked={settings.subtitles} onToggle={() => toggle("subtitles")} />
            <Row label="Полный экран" checked={settings.fullscreen} onToggle={() => toggle("fullscreen")} />
            <Row label="Картинка в картинке" checked={settings.pip} onToggle={() => toggle("pip")} />
          </div>

          <div>
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold mb-1">Водяной знак</p>
            <Input
              placeholder="Текст водяного знака"
              value={settings.watermarkText}
              onChange={(e) => { setSettings((s) => ({ ...s, watermarkText: e.target.value })); setDirty(true); }}
              className="h-7 text-xs"
            />
          </div>

          {dirty && (
            <Button size="sm" className="w-full h-7 text-xs" onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="w-3 h-3 mr-1 animate-spin" />}
              Сохранить
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
