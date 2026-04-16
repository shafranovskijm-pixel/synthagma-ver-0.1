import { useState, useRef } from "react";
import { Camera, Loader2, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { ChatAvatar } from "./ChatAvatar";

interface ChatSettingsPanelProps {
  userName?: string;
  email?: string;
  avatarUrl?: string | null;
  onAvatarUpdated?: (url: string) => void;
}

export function ChatSettingsPanel({ userName, email, avatarUrl, onAvatarUpdated }: ChatSettingsPanelProps) {
  const { user } = useAuth();
  const [uploading, setUploading] = useState(false);
  const [currentAvatar, setCurrentAvatar] = useState(avatarUrl);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
    <div className="p-6 max-w-md mx-auto space-y-8">
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
        <Button
          variant="outline"
          size="sm"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
        >
          {uploading ? "Загрузка..." : "Загрузить фото"}
        </Button>
      </div>

      {/* Info */}
      <div className="space-y-4">
        <div>
          <Label className="text-muted-foreground text-xs">Имя</Label>
          <p className="text-sm font-medium mt-1">{userName || "—"}</p>
        </div>
        <div>
          <Label className="text-muted-foreground text-xs">Email</Label>
          <p className="text-sm font-medium mt-1">{email || "—"}</p>
        </div>
      </div>
    </div>
  );
}
