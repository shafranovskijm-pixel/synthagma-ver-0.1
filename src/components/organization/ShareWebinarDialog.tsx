import { useEffect, useMemo, useRef, useState } from "react";
import QRCode from "qrcode";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Copy, Check, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { getBaseUrl } from "@/utils/getBaseUrl";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  webinar: {
    id: string;
    title: string;
    public_token: string | null;
    allow_guests: boolean;
    guest_password: string | null;
  } | null;
  onUpdated?: () => void;
}

export const ShareWebinarDialog = ({ open, onOpenChange, webinar, onUpdated }: Props) => {
  const [allowGuests, setAllowGuests] = useState(true);
  const [password, setPassword] = useState("");
  const [hasExistingPassword, setHasExistingPassword] = useState(false);
  const [changePassword, setChangePassword] = useState(false);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const link = useMemo(() => {
    if (!webinar?.public_token) return "";
    return `${getBaseUrl()}/w/${webinar.public_token}`;
  }, [webinar?.public_token]);

  useEffect(() => {
    if (webinar) {
      setAllowGuests(webinar.allow_guests);
      setHasExistingPassword(!!webinar.guest_password && webinar.guest_password !== "");
      setPassword("");
      setChangePassword(false);
    }
  }, [webinar]);

  useEffect(() => {
    if (open && link && canvasRef.current) {
      QRCode.toCanvas(canvasRef.current, link, { width: 200, margin: 1 }).catch(() => {});
    }
  }, [open, link]);

  const copy = async () => {
    if (!link) return;
    await navigator.clipboard.writeText(link);
    setCopied(true);
    toast.success("Ссылка скопирована");
    setTimeout(() => setCopied(false), 1500);
  };

  const save = async () => {
    if (!webinar) return;
    setSaving(true);
    const update: Record<string, unknown> = { allow_guests: allowGuests };
    // Меняем пароль только если хост явно его задал/убрал.
    // Иначе — оставляем существующий зашифрованный пароль как есть.
    if (changePassword || !hasExistingPassword) {
      update.guest_password = password.trim() || null;
    }
    const { error } = await supabase.from("webinars").update(update).eq("id", webinar.id);
    setSaving(false);
    if (error) {
      toast.error("Не удалось сохранить настройки");
      return;
    }
    toast.success("Настройки доступа сохранены");
    setHasExistingPassword(!!(update.guest_password ?? hasExistingPassword));
    setChangePassword(false);
    setPassword("");
    onUpdated?.();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Поделиться эфиром</DialogTitle>
          <DialogDescription>
            Отправьте ссылку участникам в Telegram, WhatsApp или email — они зайдут в один клик, без регистрации.
          </DialogDescription>
        </DialogHeader>

        {webinar?.public_token ? (
          <div className="space-y-4">
            <div className="flex gap-2">
              <Input value={link} readOnly className="font-mono text-xs" />
              <Button onClick={copy} variant={copied ? "secondary" : "default"}>
                {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              </Button>
              <Button variant="outline" size="icon" asChild>
                <a href={link} target="_blank" rel="noreferrer"><ExternalLink className="w-4 h-4" /></a>
              </Button>
            </div>

            <div className="flex justify-center bg-white p-3 rounded-lg border">
              <canvas ref={canvasRef} />
            </div>

            <div className="space-y-3 pt-2 border-t">
              <div className="flex items-center justify-between">
                <div>
                  <Label htmlFor="allow-guests" className="cursor-pointer">Разрешить вход без аккаунта</Label>
                  <p className="text-xs text-muted-foreground">Гости смогут смотреть и писать в чат</p>
                </div>
                <Switch id="allow-guests" checked={allowGuests} onCheckedChange={setAllowGuests} />
              </div>

              <div className="space-y-1">
                <Label htmlFor="guest-pw">Пароль для входа (опционально)</Label>
                {hasExistingPassword && !changePassword ? (
                  <div className="flex items-center gap-2">
                    <Input value="••••••••" readOnly className="font-mono" />
                    <Button type="button" variant="outline" size="sm" onClick={() => setChangePassword(true)}>
                      Изменить
                    </Button>
                  </div>
                ) : (
                  <>
                    <Input
                      id="guest-pw"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Оставьте пустым — без пароля"
                    />
                    {hasExistingPassword && (
                      <p className="text-xs text-muted-foreground">
                        Введите новый пароль или оставьте пустым, чтобы убрать защиту.
                      </p>
                    )}
                  </>
                )}
              </div>

              <Button onClick={save} disabled={saving} className="w-full">
                {saving ? "Сохранение…" : "Сохранить настройки"}
              </Button>
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">У этого вебинара нет публичной ссылки.</p>
        )}
      </DialogContent>
    </Dialog>
  );
};
