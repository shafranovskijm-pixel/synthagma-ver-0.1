import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onClose: () => void;
  onCreated: (webinar: { id: string; title: string; url: string; scheduled_at: string }) => void;
}

function generateToken() {
  const arr = new Uint8Array(16);
  crypto.getRandomValues(arr);
  return Array.from(arr, b => b.toString(16).padStart(2, "0")).join("");
}

export function CreateWebinarQuick({ open, onClose, onCreated }: Props) {
  const [title, setTitle] = useState("Презентация Sintagma");
  const [date, setDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d.toISOString().slice(0, 10);
  });
  const [time, setTime] = useState("14:00");
  const [duration, setDuration] = useState("60");
  const [saving, setSaving] = useState(false);

  const handleCreate = async () => {
    if (!title.trim() || !date || !time) {
      toast.error("Заполните название, дату и время");
      return;
    }
    setSaving(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData?.user) throw new Error("Не авторизован");

      // Найдём организацию пользователя через profiles
      const { data: profile } = await supabase
        .from("profiles")
        .select("organization_id")
        .eq("id", userData.user.id)
        .maybeSingle();
      const organizationId = profile?.organization_id;
      if (!organizationId) throw new Error("Не найдена организация для размещения вебинара");

      const scheduledAt = new Date(`${date}T${time}:00`).toISOString();
      const publicToken = generateToken();

      const { data, error } = await supabase
        .from("webinars")
        .insert({
          organization_id: organizationId,
          title: title.trim(),
          scheduled_at: scheduledAt,
          duration_minutes: parseInt(duration, 10) || 60,
          host_user_id: userData.user.id,
          created_by: userData.user.id,
          status: "scheduled",
          source_type: "livekit",
          access_type: "org_all",
          public_token: publicToken,
          allow_guests: true,
        })
        .select("id, title, scheduled_at, public_token")
        .single();

      if (error) throw error;

      const url = `${window.location.origin}/w/${data.public_token}`;
      toast.success("Вебинар создан");
      onCreated({ id: data.id, title: data.title, url, scheduled_at: data.scheduled_at });
      onClose();
    } catch (e: any) {
      toast.error("Ошибка: " + e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Быстрое создание вебинара</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Название</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Дата</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div>
              <Label>Время</Label>
              <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
            </div>
          </div>
          <div>
            <Label>Длительность (мин)</Label>
            <Input type="number" min="15" max="480" value={duration} onChange={(e) => setDuration(e.target.value)} />
          </div>
          <p className="text-xs text-muted-foreground">
            Будет создан вебинар со статусом «Запланирован» и публичной ссылкой для гостей.
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Отмена</Button>
          <Button onClick={handleCreate} disabled={saving}>
            {saving ? "Создание..." : "Создать и прикрепить"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
