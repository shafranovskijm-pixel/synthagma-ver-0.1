import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { SigmaSpinner } from "@/components/ui/SigmaSpinner";
import { Radio, Video, ExternalLink as ExternalLinkIcon, Search } from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (webinarId: string) => void;
  userId?: string;
}

interface Org {
  id: string;
  name: string;
}

/**
 * Упрощённая форма для админа: создаёт «тестовый» вебинар одного из 3 типов.
 * - livekit:   мгновенный браузерный эфир (камера/микрофон).
 * - kinescope: ввод RTMP URL + Stream Key + Embed ID (Live должен быть создан в Kinescope-дашборде).
 * - external:  Zoom/VK/Rutube/YouTube через iframe.
 */
export function AdminCreateWebinarDialog({ open, onOpenChange, onCreated, userId }: Props) {
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [orgId, setOrgId] = useState<string>("");
  const [orgSearch, setOrgSearch] = useState("");
  const [title, setTitle] = useState("Тестовый вебинар");
  const [type, setType] = useState<"livekit" | "kinescope" | "external">("livekit");
  const [autoRecord, setAutoRecord] = useState(false);
  const [rtmpUrl, setRtmpUrl] = useState("");
  const [rtmpKey, setRtmpKey] = useState("");
  const [embedId, setEmbedId] = useState("");
  const [externalUrl, setExternalUrl] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    (async () => {
      // Сначала получаем admin-organization из профиля, чтобы предвыбрать её
      let myOrgId: string | null = null;
      if (userId) {
        const { data: prof } = await supabase
          .from("profiles")
          .select("organization_id")
          .eq("user_id", userId)
          .maybeSingle();
        myOrgId = prof?.organization_id ?? null;
      }
      const { data } = await supabase
        .from("organizations")
        .select("id, name")
        .order("name")
        .limit(500);
      const list = (data || []) as Org[];
      setOrgs(list);
      // Предвыбираем организацию админа, иначе — первую в списке
      if (!orgId) {
        if (myOrgId && list.some((o) => o.id === myOrgId)) {
          setOrgId(myOrgId);
        } else if (list.length > 0) {
          setOrgId(list[0].id);
        }
      }
    })();
  }, [open, userId]);

  const filteredOrgs = orgSearch.trim()
    ? orgs.filter((o) => o.name.toLowerCase().includes(orgSearch.toLowerCase()))
    : orgs;

  const reset = () => {
    setTitle("Тестовый вебинар");
    setType("livekit");
    setAutoRecord(false);
    setRtmpUrl("");
    setRtmpKey("");
    setEmbedId("");
    setExternalUrl("");
    setOrgSearch("");
  };

  const handleSubmit = async () => {
    if (!orgId) { toast.error("Выберите организацию"); return; }
    if (!title.trim()) { toast.error("Введите название"); return; }
    if (type === "kinescope" && !embedId.trim()) {
      toast.error("Введите Kinescope Embed ID (создайте Live в Kinescope)"); return;
    }
    if (type === "external" && !externalUrl.trim()) {
      toast.error("Введите ссылку на трансляцию"); return;
    }

    setSaving(true);
    try {
      const now = new Date();
      const data: Record<string, unknown> = {
        organization_id: orgId,
        title: title.trim(),
        scheduled_at: now.toISOString(),
        duration_minutes: 60,
        source_type: type,
        status: type === "livekit" ? "live" : "planned",
        created_by: userId,
        host_user_id: userId,
        auto_record: type === "livekit" ? autoRecord : false,
      };

      if (type === "livekit") {
        const { data: lk, error: lkErr } = await supabase.functions.invoke("livekit-create-room", {
          body: { title: title.trim() },
        });
        if (lkErr) throw new Error(lkErr.message);
        if (!lk?.ok || !lk?.roomName) throw new Error(lk?.error || "Не удалось создать комнату LiveKit");
        data.player_settings = { livekit: { roomName: lk.roomName, wsUrl: lk.wsUrl } };
      } else if (type === "kinescope") {
        data.kinescope_live_id = embedId.trim();
        data.embed_url = `https://kinescope.io/embed/${embedId.trim()}`;
        data.rtmp_url = rtmpUrl.trim() || null;
        data.rtmp_key = rtmpKey.trim() || null;
      } else if (type === "external") {
        data.external_url = externalUrl.trim();
        data.embed_url = externalUrl.trim();
      }

      const { data: inserted, error } = await supabase
        .from("webinars")
        .insert(data as any)
        .select("id")
        .single();
      if (error) throw error;

      toast.success("Вебинар создан");
      reset();
      onOpenChange(false);
      if (inserted?.id) onCreated(inserted.id as string);
    } catch (e: any) {
      toast.error(e.message || "Ошибка создания вебинара");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Создать тестовый вебинар</DialogTitle>
          <DialogDescription>
            Быстрое создание вебинара от лица любой организации для теста плеера.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label>Организация</Label>
            <div className="space-y-2">
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-muted-foreground" />
                <Input
                  value={orgSearch}
                  onChange={(e) => setOrgSearch(e.target.value)}
                  placeholder="Поиск организации..."
                  className="pl-9"
                />
              </div>
              <Select value={orgId} onValueChange={setOrgId}>
                <SelectTrigger><SelectValue placeholder="Выберите организацию" /></SelectTrigger>
                <SelectContent className="max-h-60">
                  {filteredOrgs.length === 0 ? (
                    <div className="py-2 px-3 text-xs text-muted-foreground">
                      Ничего не найдено
                    </div>
                  ) : (
                    filteredOrgs.map((o) => (
                      <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label>Название</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>

          <div>
            <Label>Тип трансляции</Label>
            <Select value={type} onValueChange={(v) => setType(v as any)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="livekit">
                  <div className="flex items-center gap-2"><Video className="w-4 h-4" />LiveKit (браузер, мгновенно)</div>
                </SelectItem>
                <SelectItem value="kinescope">
                  <div className="flex items-center gap-2"><Radio className="w-4 h-4" />Kinescope Live (RTMP + OBS)</div>
                </SelectItem>
                <SelectItem value="external">
                  <div className="flex items-center gap-2"><ExternalLinkIcon className="w-4 h-4" />Внешняя ссылка (Zoom/VK/Rutube/YouTube)</div>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          {type === "livekit" && (
            <div className="rounded-md bg-muted/50 p-3 space-y-3">
              <p className="text-xs text-muted-foreground">
                Комната создаётся прямо сейчас. После сохранения откроется встроенный плеер с камерой и микрофоном — без OBS и без перехода на сторонние сервисы.
              </p>
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-0.5">
                  <Label htmlFor="admin-auto-record" className="cursor-pointer text-sm">
                    Автоматически записывать эфир
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Запись стартует при подключении ведущего.
                  </p>
                </div>
                <Switch
                  id="admin-auto-record"
                  checked={autoRecord}
                  onCheckedChange={setAutoRecord}
                />
              </div>
            </div>
          )}

          {type === "kinescope" && (
            <div className="space-y-3">
              <div className="rounded-md bg-muted border border-border p-3 text-xs space-y-1">
                <p className="font-medium">Kinescope не позволяет создавать Live через API.</p>
                <p className="text-muted-foreground">
                  1. Зайдите в дашборд Kinescope → раздел «Прямые эфиры» → создайте новый Live.<br/>
                  2. Скопируйте RTMP URL, Stream Key и Embed ID.<br/>
                  3. Вставьте их ниже. Эфир ведите через OBS / vMix.
                </p>
                <a
                  href="https://app.kinescope.io/lives"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-primary hover:underline pt-1"
                >
                  <ExternalLinkIcon className="w-3 h-3" /> Открыть Kinescope Live
                </a>
              </div>
              <div>
                <Label>Embed ID *</Label>
                <Input
                  value={embedId}
                  onChange={(e) => setEmbedId(e.target.value)}
                  placeholder="например: 3xxxxxxxxxxxxxxxxxxxxxxxx"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Плеер: <code>https://kinescope.io/embed/{"{ID}"}</code>
                </p>
              </div>
              <div className="grid grid-cols-1 gap-3">
                <div>
                  <Label>RTMP URL</Label>
                  <Input value={rtmpUrl} onChange={(e) => setRtmpUrl(e.target.value)} placeholder="rtmps://live.kinescope.io/live" />
                </div>
                <div>
                  <Label>Stream Key</Label>
                  <Input value={rtmpKey} onChange={(e) => setRtmpKey(e.target.value)} placeholder="секретный ключ потока" />
                </div>
              </div>
            </div>
          )}

          {type === "external" && (
            <div>
              <Label>Ссылка на трансляцию *</Label>
              <Input
                value={externalUrl}
                onChange={(e) => setExternalUrl(e.target.value)}
                placeholder="https://vk.com/video... или https://www.youtube.com/embed/..."
              />
              <p className="text-xs text-muted-foreground mt-1">
                Zoom не поддерживает встраивание — для него плеер откроет ссылку в новой вкладке.
              </p>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Отмена</Button>
            <Button onClick={handleSubmit} disabled={saving}>
              {saving && <SigmaSpinner size="sm" className="mr-2" />}
              Создать и открыть плеер
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
