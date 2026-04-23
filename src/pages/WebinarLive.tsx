import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { LiveKitRoom, RoomAudioRenderer, useParticipants, useLocalParticipant, VideoConference } from "@livekit/components-react";
import "@livekit/components-styles";
import { Button } from "@/components/ui/button";
import { ArrowLeft, AlertCircle, Copy, Users, QrCode, MessageSquare, BarChart3, MessagesSquare, PanelRightClose, PanelRightOpen } from "lucide-react";
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
import { WebinarChatPanel } from "@/components/webinars/WebinarChatPanel";
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
    <div className="flex-1 flex flex-col lg:flex-row min-h-0 relative">
      {/* Видео */}
      <div className={cn(
        "relative min-h-0",
        // На десктопе — flex-1 + правый паддинг под сайдбар. На мобильном — фиксированная высота 50vh, чтобы сайдбар-табы поместились.
        sidebarOpen ? "h-[45vh] lg:h-auto lg:flex-1 lg:pr-[340px]" : "flex-1",
      )}>
        <div className="absolute top-2 right-2 z-20 flex items-center gap-2">
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

      {/* Боковая панель: на десктопе — справа абсолютно, на мобильном — снизу под видео в потоке */}
      {sidebarOpen && webinarId && (
        <aside className="flex-1 lg:flex-none lg:absolute lg:right-0 lg:top-0 lg:bottom-0 lg:w-[340px] bg-background border-t lg:border-t-0 lg:border-l flex flex-col min-h-0">
          <Tabs defaultValue="chat" className="flex-1 flex flex-col min-h-0">
            <TabsList className="grid grid-cols-4 mx-2 mt-2 shrink-0">
              <TabsTrigger value="chat" className="text-xs gap-1">
                <MessagesSquare className="w-3.5 h-3.5" /> Чат
              </TabsTrigger>
              <TabsTrigger value="participants" className="text-xs gap-1">
                <Users className="w-3.5 h-3.5" /> Люди
              </TabsTrigger>
              <TabsTrigger value="qa" className="text-xs gap-1">
                <MessageSquare className="w-3.5 h-3.5" /> Q&A
              </TabsTrigger>
              <TabsTrigger value="polls" className="text-xs gap-1">
                <BarChart3 className="w-3.5 h-3.5" /> Опрос
              </TabsTrigger>
            </TabsList>
            <TabsContent value="chat" className="flex-1 m-0 min-h-0">
              <WebinarChatPanel
                webinarId={webinarId}
                isHost={isHost}
                participantIdentity={identity}
                participantName={name}
              />
            </TabsContent>
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
  const [isHost, setIsHost] = useState(false);
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
      // Берём isHost из ответа edge-функции — так зрители НЕ увидят кнопки записи/модерации.
      setIsHost(!!data.isHost);

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
        setIsHost(true);
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
      <div className="flex items-center px-2 sm:px-4 py-1.5 border-b gap-1.5 shrink-0 min-h-[44px]">
        <Button variant="ghost" size="sm" onClick={handleDisconnected} className="shrink-0 px-2 sm:px-3">
          <ArrowLeft className="w-4 h-4 sm:mr-1.5" />
          <span className="hidden sm:inline">Завершить</span>
        </Button>
        <div className="text-sm font-medium truncate flex-1 text-center min-w-0 px-1">{title}</div>
        <div className="flex items-center gap-1 shrink-0">
          {isWebinar && isHost && <RecordingControls webinarId={id!} />}
          {isWebinar && publicLink && (
            <>
              <Button variant="outline" size="sm" onClick={copyLink} className="px-2 sm:px-3">
                <Copy className="w-3.5 h-3.5 sm:mr-1" />
                <span className="hidden md:inline">Ссылка для участников</span>
                <span className="hidden sm:inline md:hidden">Ссылка</span>
              </Button>
              <Popover onOpenChange={(o) => o && setTimeout(renderQr, 50)}>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="icon" className="h-8 w-8 shrink-0">
                    <QrCode className="w-4 h-4" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-3 bg-white" align="end">
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
          // Подключение к комнате — мгновенно (только сигналинг). Захват камеры/микрофона
          // запускается пользователем кнопками LiveKit, чтобы UI не «фризился» на старте.
          video={false}
          audio={false}
          onDisconnected={handleDisconnected}
          style={{ height: "100%", display: "flex", flexDirection: "column" }}
        >
          <RoomShell
            webinarId={isWebinar ? id! : null}
            isHost={isHost}
            sidebarOpen={sidebarOpen}
            onToggleSidebar={() => setSidebarOpen((v) => !v)}
          />
        </LiveKitRoom>
      </div>
    </div>
  );
};

export default WebinarLive;
