import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { SigmaSpinner } from "@/components/ui/SigmaSpinner";
import type { Webinar } from "@/types/webinar";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organizationId: string;
  userId?: string;
  onCreated: () => void;
  editWebinar?: Webinar | null;
}

export function CreateWebinarDialog({
  open,
  onOpenChange,
  organizationId,
  userId,
  onCreated,
  editWebinar,
}: Props) {
  const [isLoading, setIsLoading] = useState(false);
  const [formData, setFormData] = useState({
    title: "",
    description: "",
    source_type: "kinescope",
    scheduled_at: "",
    duration_minutes: 60,
    allow_guests: false,
  });

  useEffect(() => {
    if (editWebinar) {
      setFormData({
        title: editWebinar.title || "",
        description: editWebinar.description || "",
        source_type: editWebinar.source_type || "kinescope",
        scheduled_at: editWebinar.scheduled_at ? editWebinar.scheduled_at.slice(0, 16) : "",
        duration_minutes: editWebinar.duration_minutes || 60,
        allow_guests: editWebinar.allow_guests || false,
      });
    } else {
      setFormData({
        title: "",
        description: "",
        source_type: "kinescope",
        scheduled_at: "",
        duration_minutes: 60,
        allow_guests: false,
      });
    }
  }, [editWebinar, open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      const payload = {
        ...formData,
        organization_id: organizationId,
        status: "scheduled",
      };

      if (editWebinar) {
        const { error } = await supabase
          .from("webinars")
          .update(payload)
          .eq("id", editWebinar.id);
        if (error) throw error;
        toast.success("Вебинар обновлен");
      } else {
        const { error } = await supabase.from("webinars").insert([payload]);
        if (error) throw error;
        toast.success("Вебинар создан");
      }

      onCreated();
      onOpenChange(false);
    } catch (error) {
      console.error("Error saving webinar:", error);
      toast.error("Ошибка при сохранении вебинара");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>{editWebinar ? "Редактировать вебинар" : "Создать вебинар"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="title">Название</Label>
            <Input
              id="title"
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="description">Описание</Label>
            <Textarea
              id="description"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="source_type">Тип трансляции</Label>
            <Select
              value={formData.source_type}
              onValueChange={(value) => setFormData({ ...formData, source_type: value })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="kinescope">Kinescope</SelectItem>
                <SelectItem value="zoom">Zoom</SelectItem>
                <SelectItem value="external">Внешняя ссылка</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="scheduled_at">Дата и время</Label>
            <Input
              id="scheduled_at"
              type="datetime-local"
              value={formData.scheduled_at}
              onChange={(e) => setFormData({ ...formData, scheduled_at: e.target.value })}
              required
            />
          </div>
          <div className="flex items-center justify-between">
            <Label htmlFor="allow_guests">Разрешить гостевой вход</Label>
            <Switch
              id="allow_guests"
              checked={formData.allow_guests}
              onCheckedChange={(checked) => setFormData({ ...formData, allow_guests: checked })}
            />
          </div>
          <Button type="submit" className="w-full" disabled={isLoading}>
            {isLoading ? <SigmaSpinner size="sm" className="mr-2" /> : null}
            {editWebinar ? "Сохранить изменения" : "Создать"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
