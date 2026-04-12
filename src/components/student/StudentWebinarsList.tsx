import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Video, Calendar, Radio, ExternalLink, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { ru } from "date-fns/locale";

interface Webinar {
  id: string;
  title: string;
  description: string | null;
  scheduled_at: string | null;
  status: string;
  source_type: string;
  embed_url: string | null;
  external_url: string | null;
  kinescope_video_id: string | null;
}

export function StudentWebinarsList() {
  const { user } = useAuth();
  const [webinars, setWebinars] = useState<Webinar[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user?.id) return;
    (async () => {
      // Get webinar IDs the student is enrolled in
      const { data: participants } = await supabase
        .from("webinar_participants")
        .select("webinar_id")
        .eq("user_id", user.id);

      if (!participants?.length) {
        setLoading(false);
        return;
      }

      const ids = participants.map((p: any) => p.webinar_id);
      const { data } = await supabase
        .from("webinars")
        .select("*")
        .in("id", ids)
        .order("scheduled_at", { ascending: true, nullsFirst: false });

      setWebinars((data as any[]) || []);
      setLoading(false);
    })();
  }, [user?.id]);

  if (loading) {
    return <div className="flex justify-center py-12"><Loader2 className="animate-spin w-8 h-8 text-muted-foreground" /></div>;
  }

  if (webinars.length === 0) {
    return (
      <div className="text-center py-16 text-muted-foreground">
        <Video className="w-12 h-12 mx-auto mb-4 opacity-40" />
        <p className="text-lg font-medium">Вебинары пока не запланированы</p>
        <p className="text-sm">Здесь будут отображаться предстоящие вебинары</p>
      </div>
    );
  }

  const statusBadge = (status: string) => {
    switch (status) {
      case "live": return <Badge className="bg-destructive text-destructive-foreground animate-pulse"><Radio className="w-3 h-3 mr-1" />В эфире</Badge>;
      case "ended": return <Badge variant="secondary">Завершён</Badge>;
      default: return <Badge variant="outline"><Calendar className="w-3 h-3 mr-1" />Запланирован</Badge>;
    }
  };

  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {webinars.map((w) => (
        <Card key={w.id} className="p-4 space-y-3">
          <div className="flex items-start justify-between gap-2">
            <h4 className="font-medium">{w.title}</h4>
            {statusBadge(w.status)}
          </div>
          {w.description && <p className="text-sm text-muted-foreground line-clamp-2">{w.description}</p>}
          {w.scheduled_at && (
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <Calendar className="w-3 h-3" />
              {format(new Date(w.scheduled_at), "d MMM yyyy, HH:mm", { locale: ru })}
            </p>
          )}
          <div className="flex gap-2">
            {(w.status === "live" || w.kinescope_video_id) && w.embed_url && (
              <Button size="sm" asChild>
                <a href={w.embed_url} target="_blank" rel="noreferrer">
                  <ExternalLink className="w-3 h-3 mr-1" />{w.status === "live" ? "Смотреть" : "Запись"}
                </a>
              </Button>
            )}
            {w.external_url && (
              <Button size="sm" variant="outline" asChild>
                <a href={w.external_url} target="_blank" rel="noreferrer">
                  <ExternalLink className="w-3 h-3 mr-1" />Открыть
                </a>
              </Button>
            )}
          </div>
        </Card>
      ))}
    </div>
  );
}
