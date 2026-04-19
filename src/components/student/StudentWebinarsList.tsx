import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Video, Calendar, Radio, Clock } from "lucide-react";
import { buildKinescopeEmbedUrl } from "@/components/organization/WebinarPlayerSettings";
import { format } from "date-fns";
import { ru } from "date-fns/locale";
import { SigmaSpinner } from "@/components/ui/SigmaSpinner";

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
  cover_url: string | null;
  player_settings: Record<string, any> | null;
}

export function StudentWebinarsList() {
  const { user } = useAuth();
  const [webinars, setWebinars] = useState<Webinar[]>([]);
  const [loading, setLoading] = useState(true);
  const [embedWebinar, setEmbedWebinar] = useState<Webinar | null>(null);

  useEffect(() => {
    if (!user?.id) return;
    (async () => {
      // Get webinar IDs via direct participant assignment
      const { data: participants } = await supabase
        .from("webinar_participants")
        .select("webinar_id")
        .eq("user_id", user.id);

      const directIds = (participants || []).map((p: any) => p.webinar_id);

      // Get webinar IDs via course enrollments (course_id linked webinars)
      const { data: enrollments } = await supabase
        .from("enrollments")
        .select("course_id")
        .eq("user_id", user.id)
        .in("status", ["active", "completed"]);

      let courseWebinarIds: string[] = [];
      if (enrollments?.length) {
        const courseIds = enrollments.map((e: any) => e.course_id);
        const { data: courseWebinars } = await supabase
          .from("webinars")
          .select("id")
          .in("course_id", courseIds);
        courseWebinarIds = (courseWebinars || []).map((w: any) => w.id);
      }

      const allIds = [...new Set([...directIds, ...courseWebinarIds])];

      if (!allIds.length) {
        setLoading(false);
        return;
      }

      const { data } = await supabase
        .from("webinars")
        .select("*")
        .in("id", allIds)
        .order("scheduled_at", { ascending: true, nullsFirst: false });

      setWebinars((data as any[]) || []);
      setLoading(false);
    })();
  }, [user?.id]);

  const isSoon = (w: Webinar) => {
    if (!w.scheduled_at || w.status !== "planned") return false;
    const diff = new Date(w.scheduled_at).getTime() - Date.now();
    return diff > 0 && diff < 24 * 60 * 60 * 1000;
  };

  const getEmbedUrl = (w: Webinar) => {
    if (w.kinescope_video_id) return buildKinescopeEmbedUrl(w.kinescope_video_id, w.player_settings || {});
    if (w.embed_url) return w.embed_url;
    return null;
  };

  if (loading) {
    return <div className="flex justify-center py-12"><SigmaSpinner size="lg" /></div>;
  }

  if (webinars.length === 0) {
    return (
      <div className="relative overflow-hidden rounded-2xl border bg-gradient-to-br from-card via-card to-primary/5 p-8 md:p-12">
        {/* Decorative elements */}
        <div className="absolute top-6 right-6 w-32 h-32 rounded-full bg-primary/5 blur-2xl" />
        <div className="absolute bottom-4 left-8 w-24 h-24 rounded-full bg-primary/10 blur-xl" />

        <div className="relative flex flex-col md:flex-row items-center gap-8">
          {/* Visual illustration */}
          <div className="flex-shrink-0">
            <div className="relative w-40 h-40">
              {/* Screen frame */}
              <div className="absolute inset-0 rounded-2xl border-2 border-primary/20 bg-gradient-to-br from-primary/10 to-transparent" />
              {/* Play triangle */}
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-14 h-14 rounded-full bg-primary/15 flex items-center justify-center backdrop-blur-sm">
                  <Video className="w-7 h-7 text-primary" />
                </div>
              </div>
              {/* Live dot */}
              <div className="absolute top-3 right-3 flex items-center gap-1.5">
                <span className="relative flex h-2.5 w-2.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-destructive opacity-75" />
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-destructive" />
                </span>
                <span className="text-[10px] font-semibold text-destructive uppercase tracking-wider">Live</span>
              </div>
              {/* Timeline bars */}
              <div className="absolute -bottom-4 left-1/2 -translate-x-1/2 flex gap-1">
                {[40, 60, 30, 80, 50, 70, 45].map((h, i) => (
                  <div
                    key={i}
                    className="w-1.5 rounded-full bg-primary/20"
                    style={{ height: `${h * 0.35}px`, animationDelay: `${i * 0.15}s` }}
                  />
                ))}
              </div>
            </div>
          </div>

          {/* Text */}
          <div className="text-center md:text-left space-y-3 max-w-md">
            <h3 className="text-xl font-semibold text-foreground">Вебинары скоро появятся</h3>
            <p className="text-muted-foreground text-sm leading-relaxed">
              Здесь будут доступны прямые трансляции, записи вебинаров и интерактивные сессии
              с преподавателями. Следите за обновлениями!
            </p>
            <div className="flex flex-wrap gap-2 justify-center md:justify-start pt-1">
              {["Прямые эфиры", "Записи", "Q&A сессии"].map((tag) => (
                <span key={tag} className="px-3 py-1 rounded-full text-xs font-medium bg-primary/10 text-primary">
                  {tag}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  const statusBadge = (w: Webinar) => {
    if (isSoon(w)) {
      return <Badge className="bg-amber-500 text-white"><Clock className="w-3 h-3 mr-1" />Скоро начало</Badge>;
    }
    switch (w.status) {
      case "live": return <Badge className="bg-destructive text-destructive-foreground animate-pulse"><Radio className="w-3 h-3 mr-1" />В эфире</Badge>;
      case "ended": return <Badge variant="secondary">Завершён</Badge>;
      default: return <Badge variant="outline"><Calendar className="w-3 h-3 mr-1" />Запланирован</Badge>;
    }
  };

  return (
    <>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {webinars.map((w) => (
          <Card key={w.id} className={`p-4 space-y-3 ${isSoon(w) ? "ring-2 ring-amber-400/50" : ""}`}>
            {w.cover_url && (
              <img src={w.cover_url} alt={w.title} className="w-full h-32 object-cover rounded-md" />
            )}
            <div className="flex items-start justify-between gap-2">
              <h4 className="font-medium">{w.title}</h4>
              {statusBadge(w)}
            </div>
            {w.description && <p className="text-sm text-muted-foreground line-clamp-2">{w.description}</p>}
            {w.scheduled_at && (
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <Calendar className="w-3 h-3" />
                {format(new Date(w.scheduled_at), "d MMM yyyy, HH:mm", { locale: ru })}
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              {w.source_type === "livekit" && (
                <Button size="sm" asChild>
                  <a href={`/webinar/${w.id}/live`}>
                    <Video className="w-3 h-3 mr-1" />
                    {w.status === "live" ? "Войти в эфир" : "Открыть комнату"}
                  </a>
                </Button>
              )}
              {getEmbedUrl(w) && w.source_type !== "livekit" && (
                <Button size="sm" variant="default" onClick={() => setEmbedWebinar(w)}>
                  <Video className="w-3 h-3 mr-1" />
                  {w.status === "live" ? "Смотреть" : "Запись"}
                </Button>
              )}
              {w.external_url && !getEmbedUrl(w) && w.source_type !== "livekit" && (
                <Button size="sm" variant="outline" asChild>
                  <a href={w.external_url} target="_blank" rel="noreferrer">
                    Открыть
                  </a>
                </Button>
              )}
            </div>
          </Card>
        ))}
      </div>

      <Dialog open={!!embedWebinar} onOpenChange={(o) => !o && setEmbedWebinar(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>{embedWebinar?.title}</DialogTitle>
          </DialogHeader>
          {embedWebinar && getEmbedUrl(embedWebinar) && (
            <div className="aspect-video w-full">
              <iframe
                src={getEmbedUrl(embedWebinar)!}
                className="w-full h-full rounded-md"
                allow="autoplay; fullscreen; picture-in-picture; encrypted-media"
                allowFullScreen
              />
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
