import { useState, useRef, useEffect } from "react";
import { Camera, Loader2, Volume2, Play, Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { ChatAvatar } from "./ChatAvatar";
import { previewSound } from "@/hooks/useChatSound";

interface ChatSettingsPanelProps {
  userName?: string;
  email?: string;
  avatarUrl?: string | null;
  onAvatarUpdated?: (url: string) => void;
}

interface ChatPrivacy {
  hide_phone?: boolean;
  hide_name?: boolean;
  hide_city?: boolean;
  hide_bio?: boolean;
}

const SOUND_OPTIONS = [
  { id: "message-1", label: "Стандарт" },
  { id: "message-2", label: "Мягкий" },
  { id: "message-3", label: "Высокий" },
  { id: "message-4", label: "Низкий" },
  { id: "message-5", label: "Нейтральный" },
];

const PRIVACY_FIELDS = [
  { key: "hide_name" as const, label: "ФИО" },
  { key: "hide_phone" as const, label: "Телефон" },
  { key: "hide_city" as const, label: "Город" },
  { key: "hide_bio" as const, label: "О себе" },
];

export function ChatSettingsPanel({ userName, email, avatarUrl, onAvatarUpdated }: ChatSettingsPanelProps) {
  const { user } = useAuth();
  const [uploading, setUploading] = useState(false);
  const [currentAvatar, setCurrentAvatar] = useState(avatarUrl);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [selectedSound, setSelectedSound] = useState("message-1");
  const [privacy, setPrivacy] = useState<ChatPrivacy>({});
  const [profileData, setProfileData] = useState<{ phone?: string; city?: string; bio?: string; full_name?: string }>({});
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load profile data, sound settings and privacy
  useEffect(() => {
    if (!user) return;
    (async () => {
      const [soundRes, profileRes] = await Promise.all([
        (supabase as any)
          .from("chat_notification_settings")
          .select("muted, notification_sound")
          .eq("user_id", user.id)
          .eq("chat_type", "global")
          .is("chat_partner_id", null)
          .maybeSingle(),
        supabase.from("profiles").select("full_name, phone, city, bio, chat_privacy, avatar_url").eq("user_id", user.id).maybeSingle(),
      ]);
      if (soundRes.data) {
        setSoundEnabled(!soundRes.data.muted);
        setSelectedSound(soundRes.data.notification_sound || "message-1");
      }
      if (profileRes.data) {
        setProfileData({
          full_name: profileRes.data.full_name || undefined,
          phone: profileRes.data.phone || undefined,
          city: profileRes.data.city || undefined,
          bio: profileRes.data.bio || undefined,
        });
        const p = (profileRes.data as any).chat_privacy;
        if (p && typeof p === "object") setPrivacy(p as ChatPrivacy);
        if (profileRes.data.avatar_url) setCurrentAvatar(profileRes.data.avatar_url);
      }
    })();
  }, [user]);

  const saveSoundSettings = async (muted: boolean, sound: string) => {
    if (!user) return;
    await (supabase as any)
      .from("chat_notification_settings")
      .upsert({
        user_id: user.id,
        chat_type: "global",
        muted,
        notification_sound: sound,
      }, { onConflict: "user_id,chat_type,chat_partner_id" });
  };

  const handleToggleSound = async (checked: boolean) => {
    setSoundEnabled(checked);
    await saveSoundSettings(!checked, selectedSound);
  };

  const handleSelectSound = async (sound: string) => {
    setSelectedSound(sound);
    previewSound(sound);
    await saveSoundSettings(!soundEnabled, sound);
  };

  const handleTogglePrivacy = async (key: keyof ChatPrivacy) => {
    if (!user) return;
    const updated = { ...privacy, [key]: !privacy[key] };
    setPrivacy(updated);
    await (supabase as any).from("profiles").update({ chat_privacy: updated }).eq("user_id", user.id);
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    if (!file.type.startsWith("image/")) {
      toast.error("Выберите изображение");
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      toast.error("Максимальный размер — 5 МБ");
      return;
    }

    setUploading(true);
    try {
      const ext = file.name.split(".").pop() || "jpg";
      const path = `${user.id}/avatar.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from("avatars")
        .upload(path, file, { upsert: true });

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage.from("avatars").getPublicUrl(path);
      const url = `${urlData.publicUrl}?t=${Date.now()}`;

      await supabase.from("profiles").update({ avatar_url: url }).eq("user_id", user.id);

      setCurrentAvatar(url);
      onAvatarUpdated?.(url);
      toast.success("Аватар обновлён");
    } catch (err) {
      console.error(err);
      toast.error("Ошибка загрузки");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="p-6 max-w-md mx-auto space-y-6">
      <h2 className="text-lg font-semibold">Настройки профиля</h2>

      {/* Avatar section */}
      <div className="flex flex-col items-center gap-4">
        <div className="relative group">
          <ChatAvatar name={userName || ""} avatarUrl={currentAvatar} size="lg" />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="absolute inset-0 rounded-full bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
          >
            {uploading ? (
              <Loader2 className="w-5 h-5 text-white animate-spin" />
            ) : (
              <Camera className="w-5 h-5 text-white" />
            )}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleUpload}
            className="hidden"
          />
        </div>
        <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
          {uploading ? "Загрузка..." : "Загрузить фото"}
        </Button>
      </div>

      {/* Profile info (read-only) */}
      <div className="space-y-3">
        <div>
          <Label className="text-muted-foreground text-xs">Имя</Label>
          <p className="text-sm font-medium mt-1">{profileData.full_name || userName || "—"}</p>
        </div>
        <div>
          <Label className="text-muted-foreground text-xs">Email</Label>
          <p className="text-sm font-medium mt-1">{email || "—"}</p>
        </div>
        {profileData.phone && (
          <div>
            <Label className="text-muted-foreground text-xs">Телефон</Label>
            <p className="text-sm font-medium mt-1">{profileData.phone}</p>
          </div>
        )}
        {profileData.city && (
          <div>
            <Label className="text-muted-foreground text-xs">Город</Label>
            <p className="text-sm font-medium mt-1">{profileData.city}</p>
          </div>
        )}
        {profileData.bio && (
          <div>
            <Label className="text-muted-foreground text-xs">О себе</Label>
            <p className="text-sm font-medium mt-1">{profileData.bio}</p>
          </div>
        )}
      </div>

      {/* Privacy settings */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <EyeOff className="w-4 h-4" />
          Видимость в чате
        </h3>
        <p className="text-xs text-muted-foreground">Выберите, что скрыть от других участников</p>
        <div className="space-y-2">
          {PRIVACY_FIELDS.map((f) => (
            <div key={f.key} className="flex items-center justify-between py-1">
              <Label className="text-sm">{f.label}</Label>
              <div className="flex items-center gap-2">
                {privacy[f.key] ? (
                  <EyeOff className="w-3.5 h-3.5 text-muted-foreground" />
                ) : (
                  <Eye className="w-3.5 h-3.5 text-primary" />
                )}
                <Switch checked={!privacy[f.key]} onCheckedChange={() => handleTogglePrivacy(f.key)} />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Sound settings */}
      <div className="space-y-4">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <Volume2 className="w-4 h-4" />
          Звук уведомлений
        </h3>

        <div className="flex items-center justify-between">
          <Label className="text-sm">Включить звук</Label>
          <Switch checked={soundEnabled} onCheckedChange={handleToggleSound} />
        </div>

        {soundEnabled && (
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">Выберите мелодию</Label>
            <div className="grid gap-2">
              {SOUND_OPTIONS.map((opt) => (
                <button
                  key={opt.id}
                  onClick={() => handleSelectSound(opt.id)}
                  className={`flex items-center gap-3 px-3 py-2 rounded-lg border transition-colors text-sm ${
                    selectedSound === opt.id
                      ? "border-primary bg-primary/5 text-foreground"
                      : "border-border hover:bg-secondary/50 text-muted-foreground"
                  }`}
                >
                  <Play className="w-3.5 h-3.5 shrink-0" />
                  <span>{opt.label}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
