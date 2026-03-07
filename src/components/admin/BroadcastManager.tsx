import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Megaphone, Send, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { ru } from "date-fns/locale";

interface Announcement {
  id: string;
  title: string | null;
  content: string;
  created_at: string;
  created_by: string | null;
}

export function BroadcastManager() {
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [sending, setSending] = useState(false);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchAnnouncements = async () => {
    const { data } = await supabase
      .from("platform_announcements")
      .select("*")
      .order("created_at", { ascending: false });
    if (data) setAnnouncements(data);
    setLoading(false);
  };

  useEffect(() => { fetchAnnouncements(); }, []);

  const handleSend = async () => {
    if (!content.trim()) {
      toast.error("Введите текст сообщения");
      return;
    }
    setSending(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase.from("platform_announcements").insert({
        title: title.trim() || null,
        content: content.trim(),
        created_by: user?.id || null,
      });
      if (error) throw error;
      toast.success("Рассылка отправлена");
      setTitle("");
      setContent("");
      fetchAnnouncements();
    } catch (err: any) {
      toast.error("Ошибка: " + err.message);
    } finally {
      setSending(false);
    }
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from("platform_announcements").delete().eq("id", id);
    if (error) {
      toast.error("Ошибка удаления");
    } else {
      setAnnouncements(prev => prev.filter(a => a.id !== id));
      toast.success("Удалено");
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Megaphone className="w-5 h-5" />
            Новая рассылка
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Input
            placeholder="Заголовок (необязательно)"
            value={title}
            onChange={e => setTitle(e.target.value)}
          />
          <Textarea
            placeholder="Текст сообщения для всех организаций..."
            value={content}
            onChange={e => setContent(e.target.value)}
            rows={4}
          />
          <Button onClick={handleSend} disabled={sending || !content.trim()} className="gap-2">
            <Send className="w-4 h-4" />
            {sending ? "Отправка..." : "Отправить всем"}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>История рассылок</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-muted-foreground text-sm">Загрузка...</p>
          ) : announcements.length === 0 ? (
            <p className="text-muted-foreground text-sm">Рассылок пока нет</p>
          ) : (
            <div className="space-y-3">
              {announcements.map(a => (
                <div key={a.id} className="flex items-start gap-3 p-3 rounded-lg border border-border bg-muted/30">
                  <Megaphone className="w-4 h-4 text-primary shrink-0 mt-1" />
                  <div className="flex-1 min-w-0">
                    {a.title && <p className="font-medium text-sm">{a.title}</p>}
                    <p className="text-sm text-muted-foreground whitespace-pre-wrap">{a.content}</p>
                    <p className="text-xs text-muted-foreground/60 mt-1">
                      {format(new Date(a.created_at), "d MMM yyyy, HH:mm", { locale: ru })}
                    </p>
                  </div>
                  <Button variant="ghost" size="icon" onClick={() => handleDelete(a.id)} className="shrink-0">
                    <Trash2 className="w-4 h-4 text-destructive" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
