import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Video, Calendar, Clock, Radio, ExternalLink, Play, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { ru } from "date-fns/locale";
import type { Webinar } from "@/hooks/useWebinarsManager";

interface StudentWebinarsProps {
  userId: string;
  organizationId: string;
}

export function StudentWebinars({ userId, organizationId }: StudentWebinarsProps) {
  const [webinars, setWebinars] = useState<Webinar[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchWebinars = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from("webinars")
        .select("*")
        .order("scheduled_at", { ascending: false });
      if (error) throw error;
      setWebinars((data as unknown as Webinar[]) || []);
    } catch (e) {
      console.error("Error fetching webinars:", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchWebinars(); }, [fetchWebinars]);

  // Realtime
  useEffect(() => {
    const channel = supabase
      .channel("student-webinars")
      .on("postgres_changes", { event: "*", schema: "public", table: "webinars" }, () => fetchWebinars())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [fetchWebinars]);

  const handleJoin = (webinar: Webinar) => {
    const url = webinar.stream_url;
    if (url) {
      window.open(url, "_blank", "noopener,noreferrer");
    }
  };

  const live = webinars.filter(w => w.status === "live");
  const upcoming = webinars.filter(w => w.status === "scheduled");
  const ended = webinars.filter(w => w.status === "ended" && w.recording_url);

  if (loading) {
    return <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;
  }

  return (
    <div className="p-4 lg:p-8 space-y-6">
      <h1 className="text-xl font-semibold flex items-center gap-2">
        <Video className="w-5 h-5 text-primary" />
        Вебинары
      </h1>

      {webinars.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Video className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-semibold mb-2">Нет доступных вебинаров</h3>
            <p className="text-muted-foreground">Когда организация создаст вебинар, он появится здесь</p>
          </CardContent>
        </Card>
      ) : (
        <>
          {live.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                <Radio className="w-4 h-4 text-destructive animate-pulse" />
                Сейчас в эфире
              </h3>
              {live.map(w => (
                <Card key={w.id} className="border-destructive/50 bg-destructive/5">
                  <CardContent className="p-4 flex items-center justify-between gap-4">
                    <div>
                      <h4 className="font-semibold">{w.title}</h4>
                      {w.description && <p className="text-sm text-muted-foreground mt-1">{w.description}</p>}
                    </div>
                    <Button onClick={() => handleJoin(w)} className="gap-2 shrink-0">
                      <ExternalLink className="w-4 h-4" />
                      Подключиться
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {upcoming.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Предстоящие</h3>
              {upcoming.map(w => (
                <Card key={w.id}>
                  <CardContent className="p-4">
                    <h4 className="font-semibold mb-1">{w.title}</h4>
                    {w.description && <p className="text-sm text-muted-foreground mb-2">{w.description}</p>}
                    <div className="flex items-center gap-4 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1"><Calendar className="w-3.5 h-3.5" />{format(new Date(w.scheduled_at), "d MMM yyyy, HH:mm", { locale: ru })}</span>
                      <span className="flex items-center gap-1"><Clock className="w-3.5 h-3.5" />{w.duration_minutes} мин</span>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {ended.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Записи вебинаров</h3>
              {ended.map(w => (
                <Card key={w.id}>
                  <CardContent className="p-4 flex items-center justify-between gap-4">
                    <div>
                      <h4 className="font-semibold">{w.title}</h4>
                      <span className="text-xs text-muted-foreground">{format(new Date(w.scheduled_at), "d MMM yyyy", { locale: ru })}</span>
                    </div>
                    {w.recording_url && (
                      <Button size="sm" variant="outline" asChild>
                        <a href={w.recording_url} target="_blank" rel="noopener noreferrer" className="gap-1.5">
                          <Play className="w-4 h-4" />
                          Смотреть
                        </a>
                      </Button>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
