import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onClose: () => void;
  onCreated: (webinar: { id: string; title: string; url: string; scheduled_at: string }) => void;
}

interface Org { id: string; name: string }

const LS_KEY = "broadcast_webinar_org_id";

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

  // fallback для админа платформы — у него нет profiles.organization_id
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [orgId, setOrgId] = useState<string>(() => localStorage.getItem(LS_KEY) || "");
  const [needOrgPick, setNeedOrgPick] = useState(false);

  useEffect(() => {
    if (!open) return;
    (async () => {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData?.user) return;
      const { data: profile } = await supabase
        .from("profiles")
        .select("organization_id")
        .eq("id", userData.user.id)
        .maybeSingle();
      if (profile?.organization_id) {
        setOrgId(profile.organization_id);
        setNeedOrgPick(false);
      } else {
        setNeedOrgPick(true);
        const { data: list } = await supabase
          .from("organizations")
          .select("id, name")
          .order("name")
          .limit(500);
        const arr = (list || []) as Org[];
        setOrgs(arr);
        const stored = localStorage.getItem(LS_KEY);
        if (stored && arr.some(o => o.id === stored)) {
          setOrgId(stored);
        } else if (arr.length > 0) {
          setOrgId(arr[0].id);
        }
      }
    })();
  }, [open]);

  const handleCreate = async () => {
    if (!title.trim() || !date || !time) {
      toast.error("Заполните название, дату и время");
      return;
    }
    if (!orgId) {
      toast.error("Выберите организацию");
      return;
    }
    setSaving(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData?.user) throw new Error("Не авторизован");

      if (needOrgPick) localStorage.setItem(LS_KEY, orgId);

      const scheduledAt = new Date(`${date}T${time}:00`).toISOString();
      const publicToken = generateToken();

      const { data, error } = await supabase
        .from("webinars")
        .insert({
          organization_id: orgId,
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
          {needOrgPick && (
            <div>
              <Label>Организация</Label>
              <Select value={orgId} onValueChange={setOrgId}>
                <SelectTrigger><SelectValue placeholder="Выберите организацию" /></SelectTrigger>
                <SelectContent>
                  {orgs.map(o => (
                    <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground mt-1">
                У вашего админ-аккаунта нет привязки к организации. Выбор сохранится для следующих рассылок.
              </p>
            </div>
          )}
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
