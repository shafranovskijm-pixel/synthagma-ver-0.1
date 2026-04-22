import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { LiveKitRoom, RoomAudioRenderer, useParticipants, useLocalParticipant, VideoConference } from "@livekit/components-react";
import "@livekit/components-styles";
import { Button } from "@/components/ui/button";
import { ArrowLeft, AlertCircle, Copy, Users, QrCode, MessageSquare, BarChart3, PanelRightClose, PanelRightOpen } from "lucide-react";
import { SigmaSpinner } from "@/components/ui/SigmaSpinner";
import { toast } from "sonner";
import { getBaseUrl } from "@/utils/getBaseUrl";
import QRCode from "qrcode";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { RecordingControls } from "@/components/webinars/RecordingControls";
import { ParticipantsModerationPanel } from "@/components/webinars/ParticipantsModerationPanel";
import { WebinarQAPanel } from "@/components/webinars/WebinarQAPanel";
import { WebinarPollsPanel } from "@/components/webinars/WebinarPollsPanel";
import { cn } from "@/lib/utils";

const ParticipantsCount = () => {
  const participants = useParticipants();
  return (
    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
      <Users className="w-3 h-3" /> {participants.length}
    </span>
  );
};

interface RoomShellProps {
  webinarId: string | null;
  isHost: boolean;
  sidebarOpen: boolean;
  onToggleSidebar: () => void;
}

const RoomShell = ({ webinarId, isHost, sidebarOpen, onToggleSidebar }: RoomShellProps) => {
  const { localParticipant } = useLocalParticipant();
  const identity = localParticipant?.identity ?? "";
  const name = localParticipant?.name || "Участник";

  return (
    <div className="flex-1 flex min-h-0 relative">
      <div className={cn("flex-1 relative min-h-0", sidebarOpen && "lg:pr-[340px]")}>
        <div className="absolute top-2 right-2 z-10 flex items-center gap-2">
          <div className="bg-background/80 backdrop-blur-sm px-2 py-1 rounded-md border">
            <ParticipantsCount />
          </div>
          {webinarId && (
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8 bg-background/80 backdrop-blur-sm"
              onClick={onToggleSidebar}
              title={sidebarOpen ? "Скрыть панель" : "Показать панель"}
            >
              {sidebarOpen ? <PanelRightClose className="w-4 h-4" /> : <PanelRightOpen className="w-4 h-4" />}
            </Button>
          )}
        </div>
        <VideoConference />
        <RoomAudioRenderer />
      </div>
      {sidebarOpen && webinarId && (
        <aside className="hidden lg:flex absolute right-0 top-0 bottom-0 w-[340px] bg-background border-l flex-col">
          <Tabs defaultValue="participants" className="flex-1 flex flex-col min-h-0">
            <TabsList className="grid grid-cols-3 mx-2 mt-2">
              <TabsTrigger value="participants" className="text-xs gap-1">
                <Users className="w-3.5 h-3.5" /> Люди
              </TabsTrigger>
              <TabsTrigger value="qa" className="text-xs gap-1">
                <MessageSquare className="w-3.5 h-3.5" /> Q&A
              </TabsTrigger>
              <TabsTrigger value="polls" className="text-xs gap-1">
                <BarChart3 className="w-3.5 h-3.5" /> Опросы
              </TabsTrigger>
            </TabsList>
            <TabsContent value="participants" className="flex-1 m-0 min-h-0">
              <ParticipantsModerationPanel webinarId={webinarId} isHost={isHost} />
            </TabsContent>
            <TabsContent value="qa" className="flex-1 m-0 min-h-0">
              <WebinarQAPanel
                webinarId={webinarId}
                isHost={isHost}
                participantIdentity={identity}
                participantName={name}
              />
            </TabsContent>
            <TabsContent value="polls" className="flex-1 m-0 min-h-0">
              <WebinarPollsPanel
                webinarId={webinarId}
                isHost={isHost}
                participantIdentity={identity}
              />
            </TabsContent>
          </Tabs>
        </aside>
      )}
    </div>
  );
};

const WebinarLive = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const sessionId = params.get("sessionId");

  const [token, setToken] = useState<string | null>(null);
  const [wsUrl, setWsUrl] = useState<string | null>(null);
  const [title, setTitle] = useState("Эфир");
  const [publicToken, setPublicToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const qrCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const isWebinar = !sessionId && !!id;

  const publicLink = useMemo(
    () => (publicToken ? `${getBaseUrl()}/w/${publicToken}` : ""),
    [publicToken],
  );

  const obtainToken = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const isTutor = !!sessionId;
      const { data, error: invokeError } = await supabase.functions.invoke(
        "livekit-issue-token",
        {
          body: isTutor ? { aiTutorSessionId: sessionId } : { webinarId: id },
        },
      );
      if (invokeError) throw new Error(invokeError.message);
      if (!data?.ok || !data?.token) throw new Error(data?.error || "Не удалось получить токен");

      setToken(data.token);
      setWsUrl(data.wsUrl);

      if (!isTutor && id) {
        const { data: w } = await supabase
          .from("webinars")
          .select("title, public_token")
          .eq("id", id)
          .maybeSingle();
        if (w?.title) setTitle(w.title);
        if ((w as any)?.public_token) setPublicToken((w as any).public_token);
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
      } catch { /* ignore */ }
    }
    navigate(-1);
  }, [sessionId, navigate]);

  const copyLink = () => {
    if (!publicLink) return;
    navigator.clipboard.writeText(publicLink);
    toast.success("Публичная ссылка скопирована");
  };

  const renderQr = () => {
    if (qrCanvasRef.current && publicLink) {
      QRCode.toCanvas(qrCanvasRef.current, publicLink, { width: 200, margin: 1 }).catch(() => {});
    }
  };

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
    <div className="h-screen flex flex-col bg-background overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2 border-b gap-2 flex-wrap shrink-0">
        <Button variant="ghost" size="sm" onClick={handleDisconnected}>
          <ArrowLeft className="w-4 h-4 mr-2" /> Завершить
        </Button>
        <div className="text-sm font-medium truncate flex-1 text-center">{title}</div>
        <div className="flex items-center gap-2">
          {isWebinar && <RecordingControls webinarId={id!} />}
          {isWebinar && publicLink && (
            <>
              <Button variant="outline" size="sm" onClick={copyLink}>
                <Copy className="w-3.5 h-3.5 mr-1" /> Ссылка для участников
              </Button>
              <Popover onOpenChange={(o) => o && setTimeout(renderQr, 50)}>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="icon" className="h-8 w-8">
                    <QrCode className="w-4 h-4" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-3 bg-white">
                  <canvas ref={qrCanvasRef} />
                  <p className="text-xs text-center text-muted-foreground mt-2 max-w-[200px] break-all">{publicLink}</p>
                </PopoverContent>
              </Popover>
            </>
          )}
        </div>
      </div>
      <div className="flex-1 min-h-0" data-lk-theme="default">
        <LiveKitRoom
          token={token}
          serverUrl={wsUrl}
          connect={true}
          video={true}
          audio={true}
          onDisconnected={handleDisconnected}
          style={{ height: "100%", display: "flex", flexDirection: "column" }}
        >
          <RoomShell
            webinarId={isWebinar ? id! : null}
            isHost={isWebinar}
            sidebarOpen={sidebarOpen}
            onToggleSidebar={() => setSidebarOpen((v) => !v)}
          />
        </LiveKitRoom>
      </div>
    </div>
  );
};

export default WebinarLive;
