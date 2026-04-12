import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organizationId: string;
  userId?: string;
  onCreated: () => void;
}

export function CreateWebinarDialog({ open, onOpenChange, organizationId, userId, onCreated }: Props) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [scheduledAt, setScheduledAt] = useState("");
  const [durationMinutes, setDurationMinutes] = useState("60");
  const [sourceType, setSourceType] = useState<"kinescope" | "external">("kinescope");
  const [externalUrl, setExternalUrl] = useState("");
  const [saving, setSaving] = useState(false);

  const reset = () => {
    setTitle("");
    setDescription("");
    setScheduledAt("");
    setDurationMinutes("60");
    setSourceType("kinescope");
    setExternalUrl("");
  };

  const handleSubmit = async () => {
    if (!title.trim()) { toast.error("Введите название"); return; }
    setSaving(true);

    try {
      const webinarData: Record<string, unknown> = {
        organization_id: organizationId,
        title: title.trim(),
        description: description.trim() || null,
        scheduled_at: scheduledAt || null,
        duration_minutes: parseInt(durationMinutes) || null,
        source_type: sourceType,
        status: "planned",
        created_by: userId,
      };

      if (sourceType === "kinescope") {
        // Create live stream via Kinescope API
        const { data, error } = await supabase.functions.invoke("kinescope-proxy", {
          body: { action: "create_live", title: title.trim() },
        });

        if (error) throw new Error(error.message);

        const stream = data?.data;
        if (stream) {
          webinarData.kinescope_live_id = stream.id;
          webinarData.embed_url = stream.embed_link || `https://kinescope.io/embed/${stream.id}`;
          // RTMP info
          if (stream.broadcast_location) {
            webinarData.rtmp_url = stream.broadcast_location.rtmp_url || stream.broadcast_location.url;
            webinarData.rtmp_key = stream.broadcast_location.stream_key || stream.broadcast_location.key;
          }
        }
      } else {
        webinarData.external_url = externalUrl.trim() || null;
        webinarData.embed_url = externalUrl.trim() || null;
      }

      const { error: insertError } = await supabase.from("webinars").insert(webinarData as any);
      if (insertError) throw insertError;

      toast.success("Вебинар создан!");
      reset();
      onOpenChange(false);
      onCreated();
    } catch (e: any) {
      toast.error(e.message || "Ошибка создания вебинара");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Создать вебинар</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>Название *</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Вебинар по теме..." />
          </div>
          <div>
            <Label>Описание</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="О чём будет вебинар" rows={3} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Дата и время</Label>
              <Input type="datetime-local" value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} />
            </div>
            <div>
              <Label>Длительность (мин)</Label>
              <Input type="number" value={durationMinutes} onChange={(e) => setDurationMinutes(e.target.value)} />
            </div>
          </div>
          <div>
            <Label>Источник трансляции</Label>
            <Select value={sourceType} onValueChange={(v) => setSourceType(v as any)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="kinescope">Kinescope Live (RTMP)</SelectItem>
                <SelectItem value="external">Внешняя ссылка (Zoom, VK, Rutube, YouTube)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {sourceType === "kinescope" && (
            <p className="text-xs text-muted-foreground">
              Kinescope автоматически создаст трансляцию. Вы получите RTMP URL и ключ для OBS/другого ПО.
              После завершения запись сохранится автоматически.
            </p>
          )}
          {sourceType === "external" && (
            <div>
              <Label>Ссылка на трансляцию</Label>
              <Input
                value={externalUrl}
                onChange={(e) => setExternalUrl(e.target.value)}
                placeholder="https://zoom.us/j/... или https://vk.com/video..."
              />
            </div>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Отмена</Button>
            <Button onClick={handleSubmit} disabled={saving}>
              {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Создать
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
