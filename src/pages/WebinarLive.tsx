import { useEffect, useState, useCallback } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { LiveKitRoom, VideoConference, RoomAudioRenderer } from "@livekit/components-react";
import "@livekit/components-styles";
import { Button } from "@/components/ui/button";
import { ArrowLeft, AlertCircle } from "lucide-react";
import { SigmaSpinner } from "@/components/ui/SigmaSpinner";
import { toast } from "sonner";

const WebinarLive = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const sessionId = params.get("sessionId"); // для AI-преподавателя

  const [token, setToken] = useState<string | null>(null);
  const [wsUrl, setWsUrl] = useState<string | null>(null);
  const [title, setTitle] = useState("Эфир");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const obtainToken = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const isTutor = !!sessionId;
      const { data, error: invokeError } = await supabase.functions.invoke(
        "livekit-issue-token",
        {
          body: isTutor
            ? { aiTutorSessionId: sessionId }
            : { webinarId: id },
        },
      );
      if (invokeError) throw new Error(invokeError.message);
      if (!data?.ok || !data?.token) throw new Error(data?.error || "Не удалось получить токен");

      setToken(data.token);
      setWsUrl(data.wsUrl);

      if (!isTutor && id) {
        const { data: w } = await supabase
          .from("webinars")
          .select("title")
          .eq("id", id)
          .maybeSingle();
        if (w?.title) setTitle(w.title);
      } else if (isTutor) {
        setTitle("ИИ-преподаватель — сессия");
      }
    } catch (e) {
      const msg = (e as Error).message || "Ошибка";
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }, [id, sessionId]);

  useEffect(() => {
    obtainToken();
  }, [obtainToken]);

  const handleDisconnected = useCallback(async () => {
    if (sessionId) {
      try {
        const { data: s } = await supabase
          .from("ai_tutor_sessions")
          .select("started_at, status")
          .eq("id", sessionId)
          .maybeSingle();
        if (s && s.status === "active") {
          const dur = Math.floor((Date.now() - new Date(s.started_at).getTime()) / 1000);
          await supabase
            .from("ai_tutor_sessions")
            .update({
              status: "ended",
              ended_at: new Date().toISOString(),
              duration_seconds: dur,
            })
            .eq("id", sessionId);
        }
      } catch {
        /* ignore */
      }
      navigate(-1);
    } else {
      navigate(-1);
    }
  }, [sessionId, navigate]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <SigmaSpinner size="lg" />
      </div>
    );
  }

  if (error || !token || !wsUrl) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background gap-4 p-8">
        <AlertCircle className="w-12 h-12 text-destructive" />
        <h2 className="text-xl font-semibold">Не удалось подключиться</h2>
        <p className="text-muted-foreground text-center max-w-md">{error}</p>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => navigate(-1)}>
            <ArrowLeft className="w-4 h-4 mr-2" /> Назад
          </Button>
          <Button onClick={obtainToken}>Повторить</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <div className="flex items-center justify-between px-4 py-2 border-b">
        <Button variant="ghost" size="sm" onClick={handleDisconnected}>
          <ArrowLeft className="w-4 h-4 mr-2" /> Завершить
        </Button>
        <div className="text-sm font-medium truncate">{title}</div>
        <div className="w-20" />
      </div>
      <div className="flex-1" data-lk-theme="default">
        <LiveKitRoom
          token={token}
          serverUrl={wsUrl}
          connect={true}
          video={true}
          audio={true}
          onDisconnected={handleDisconnected}
          style={{ height: "100%" }}
        >
          <VideoConference />
          <RoomAudioRenderer />
        </LiveKitRoom>
      </div>
    </div>
  );
};

export default WebinarLive;
