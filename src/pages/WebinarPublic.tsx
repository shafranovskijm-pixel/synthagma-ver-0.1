import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { LiveKitRoom, VideoConference, RoomAudioRenderer } from "@livekit/components-react";
import "@livekit/components-styles";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertCircle, Radio, Calendar, Lock, Video } from "lucide-react";
import { SigmaSpinner } from "@/components/ui/SigmaSpinner";
import { toast } from "sonner";

type WebinarInfo = {
  id: string;
  title: string;
  description: string | null;
  scheduled_at: string | null;
  status: string;
  source_type: string;
  allow_guests: boolean;
  requires_password: boolean;
  cover_image_url: string | null;
  embed_url: string | null;
};

const WebinarPublic = () => {
  const { token } = useParams<{ token: string }>();
  const [info, setInfo] = useState<WebinarInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [joining, setJoining] = useState(false);
  const [lkToken, setLkToken] = useState<string | null>(null);
  const [wsUrl, setWsUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    (async () => {
      try {
        const { data, error } = await supabase.functions.invoke("webinar-public-info", {
          body: { token },
        });
        if (error) throw new Error(error.message);
        if (!data?.ok) throw new Error(data?.error || "Не найдено");
        setInfo(data.webinar);
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setLoading(false);
      }
    })();
  }, [token]);

  const join = async () => {
    if (!info || !token) return;
    if (!name.trim()) {
      toast.error("Введите ваше имя");
      return;
    }
    setJoining(true);
    try {
      const { data, error } = await supabase.functions.invoke("livekit-issue-token", {
        body: { publicToken: token, guestName: name.trim(), guestPassword: password || undefined },
      });
      if (error) throw new Error(error.message);
      if (!data?.ok || !data?.token) throw new Error(data?.error || "Не удалось войти");
      setLkToken(data.token);
      setWsUrl(data.wsUrl);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setJoining(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <SigmaSpinner size="lg" />
      </div>
    );
  }

  if (error || !info) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background gap-4 p-8">
        <AlertCircle className="w-12 h-12 text-destructive" />
        <h1 className="text-xl font-semibold">Эфир не найден</h1>
        <p className="text-muted-foreground text-center max-w-md">{error}</p>
      </div>
    );
  }

  // Already in live room
  if (lkToken && wsUrl) {
    return (
      <div className="min-h-screen flex flex-col bg-background">
        <div className="flex items-center justify-between px-4 py-2 border-b">
          <div className="flex items-center gap-2">
            <Radio className="w-4 h-4 text-destructive animate-pulse" />
            <span className="text-sm font-medium truncate">{info.title}</span>
          </div>
          <Button size="sm" variant="ghost" onClick={() => { setLkToken(null); setWsUrl(null); }}>
            Покинуть
          </Button>
        </div>
        <div className="flex-1" data-lk-theme="default">
          <LiveKitRoom
            token={lkToken}
            serverUrl={wsUrl}
            connect={true}
            video={false}
            audio={false}
            onDisconnected={() => { setLkToken(null); setWsUrl(null); }}
            style={{ height: "100%" }}
          >
            <VideoConference />
            <RoomAudioRenderer />
          </LiveKitRoom>
        </div>
      </div>
    );
  }

  // External (Kinescope/iframe) webinar — embed directly
  if (info.source_type === "external" && info.embed_url && info.status === "live") {
    return (
      <div className="min-h-screen flex flex-col bg-background">
        <div className="px-4 py-2 border-b">
          <span className="text-sm font-medium">{info.title}</span>
        </div>
        <iframe
          src={info.embed_url}
          className="flex-1 w-full border-0"
          allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
        />
      </div>
    );
  }

  const scheduled = info.scheduled_at ? new Date(info.scheduled_at) : null;
  const isLive = info.status === "live";
  const isEnded = info.status === "ended";
  const isPlanned = info.status === "planned" || (!isLive && !isEnded);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-muted/30 to-background p-4">
      <Card className="w-full max-w-lg">
        {info.cover_image_url && (
          <div
            className="h-48 w-full rounded-t-lg bg-cover bg-center"
            style={{ backgroundImage: `url(${info.cover_image_url})` }}
          />
        )}
        <CardHeader>
          <div className="flex items-center gap-2">
            {isLive && (
              <span className="inline-flex items-center gap-1 text-xs font-medium text-destructive">
                <span className="w-2 h-2 rounded-full bg-destructive animate-pulse" /> В ЭФИРЕ
              </span>
            )}
            {isPlanned && (
              <span className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground">
                <Calendar className="w-3 h-3" /> Запланирован
              </span>
            )}
            {isEnded && (
              <span className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground">
                Эфир завершён
              </span>
            )}
          </div>
          <CardTitle className="text-2xl">{info.title}</CardTitle>
          {info.description && (
            <p className="text-sm text-muted-foreground whitespace-pre-wrap">{info.description}</p>
          )}
          {scheduled && isPlanned && (
            <p className="text-sm">
              📅 {scheduled.toLocaleString("ru-RU", { dateStyle: "long", timeStyle: "short" })}
            </p>
          )}
        </CardHeader>
        <CardContent className="space-y-4">
          {isLive && info.allow_guests && info.source_type === "livekit" && (
            <>
              <div className="space-y-2">
                <Label htmlFor="guest-name">Ваше имя</Label>
                <Input
                  id="guest-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Иван Петров"
                  maxLength={60}
                />
              </div>
              {info.requires_password && (
                <div className="space-y-2">
                  <Label htmlFor="guest-pw" className="flex items-center gap-1">
                    <Lock className="w-3 h-3" /> Пароль
                  </Label>
                  <Input
                    id="guest-pw"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </div>
              )}
              <Button onClick={join} disabled={joining} size="lg" className="w-full">
                <Video className="w-4 h-4 mr-2" />
                {joining ? "Подключение…" : "Войти в эфир"}
              </Button>
            </>
          )}

          {isLive && !info.allow_guests && (
            <div className="text-center py-6 text-muted-foreground">
              Гостевой вход для этого эфира выключен. Обратитесь к организатору.
            </div>
          )}

          {isPlanned && (
            <div className="text-center py-4 text-muted-foreground text-sm">
              Эфир ещё не начался. Откройте эту страницу ко времени начала.
            </div>
          )}

          {isEnded && (
            <div className="text-center py-4 text-muted-foreground">
              Эфир завершён. Спасибо за интерес!
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default WebinarPublic;
