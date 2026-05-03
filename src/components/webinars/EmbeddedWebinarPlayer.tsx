import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import QRCode from "qrcode";
import { supabase } from "@/integrations/supabase/client";
import {
  LiveKitRoom,
  VideoConference,
  RoomAudioRenderer,
  useParticipants,
  useTracks,
  useRoomContext,
} from "@livekit/components-react";
import { Track, RoomEvent } from "livekit-client";
import "@livekit/components-styles";
import { SigmaSpinner } from "@/components/ui/SigmaSpinner";
import { SigmaLogo } from "@/components/ui/SigmaLogo";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  AlertCircle,
  ExternalLink,
  Copy,
  Check,
  QrCode,
  Users,
  Settings2,
  Square,
  Radio,
  MoreHorizontal,
} from "lucide-react";
import { toast } from "sonner";
import { getBaseUrl } from "@/utils/getBaseUrl";
import { ShareWebinarDialog } from "@/components/organization/ShareWebinarDialog";
import { WebinarSidebar } from "@/components/webinars/WebinarSidebar";
import { RecordingControls } from "@/components/webinars/RecordingControls";
import { cn } from "@/lib/utils";

/** Платформа для управления видимостью кнопки «поделиться экраном» */
function detectPlatform(): "ios" | "android" | "desktop" {
  if (typeof navigator === "undefined") return "desktop";
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod/i.test(ua)) return "ios";
  if (/Android/i.test(ua)) return "android";
  return "desktop";
}

interface Props {
  webinarId: string;
  sourceType: string;
  kinescopeLiveId?: string | null;
  kinescopeVideoId?: string | null;
  embedUrl?: string | null;
  externalUrl?: string | null;
  /** Заголовок вебинара — рисуется в шапке встроенного плеера */
  webinarTitle?: string | null;
  /** Публичный токен для гостевой ссылки `/w/<token>` */
  publicToken?: string | null;
  /** Флаг «гости разрешены» — управляется в ShareWebinarDialog */
  allowGuests?: boolean;
  /** Текущий гостевой пароль */
  guestPassword?: string | null;
  /** Коллбэк «завершить эфир» — если передан, рисуется кнопка «Завершить» */
  onEnd?: () => void;
  /** Коллбэк после сохранения настроек доступа в ShareWebinarDialog */
  onShareUpdated?: () => void;
  /** Если эфир завершён и есть запись — показать нативный плеер вместо LiveKit-комнаты */
  status?: string | null;
  recordingUrl?: string | null;
  /** Если переданы — пропустить вызов livekit-issue-token и использовать готовый JWT (гостевой режим) */
  prefetchedToken?: string | null;
  prefetchedWsUrl?: string | null;
  /** read-only режим (для гостей): без кнопок «Завершить», «Доступ», QR, «Ссылка для участников» */
  viewOnly?: boolean;
  /** Показывать боковую панель Q&A + Опросы рядом с плеером (для гостей и зрителей) */
  showSidePanel?: boolean;
  /** Имя/идентификатор зрителя для Q&A и опросов (используется в гостевом режиме) */
  guestIdentity?: string | null;
  guestDisplayName?: string | null;
}

/**
 * Универсальный встроенный плеер вебинара.
 * - kinescope: iframe https://kinescope.io/embed/{id}
 * - livekit:   полноценная комната LiveKit с камерой/микрофоном + шапка с публичной ссылкой
 * - external:  iframe или fallback-кнопка
 */
export function EmbeddedWebinarPlayer({
  webinarId,
  sourceType,
  kinescopeLiveId,
  kinescopeVideoId,
  embedUrl,
  externalUrl,
  webinarTitle,
  publicToken,
  allowGuests,
  guestPassword,
  onEnd,
  onShareUpdated,
  status,
  recordingUrl,
  prefetchedToken,
  prefetchedWsUrl,
  viewOnly,
  showSidePanel,
  guestIdentity,
  guestDisplayName,
}: Props) {
  // ============ Realtime подписка на webinar (recording_url + status) ============
  // Без неё inline-плеер не узнает, что запись скопировалась после стопа,
  // и продолжит показывать чёрный экран вместо MP4.
  const [liveRecordingUrl, setLiveRecordingUrl] = useState<string | null>(recordingUrl ?? null);
  const [liveStatus, setLiveStatus] = useState<string | null>(status ?? null);
  useEffect(() => { setLiveRecordingUrl(recordingUrl ?? null); }, [recordingUrl]);
  useEffect(() => { setLiveStatus(status ?? null); }, [status]);
  useEffect(() => {
    if (!webinarId) return;
    const ch = supabase
      .channel(`webinar-embed-${webinarId}-${Date.now()}-${Math.random().toString(36).slice(2,8)}`)
      .on("postgres_changes", {
        event: "UPDATE",
        schema: "public",
        table: "webinars",
        filter: `id=eq.${webinarId}`,
      }, (payload) => {
        const row = payload.new as { recording_url?: string | null; status?: string | null };
        if ("recording_url" in row) setLiveRecordingUrl(row.recording_url ?? null);
        if (row.status) setLiveStatus(row.status);
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [webinarId]);

  // ============ Recording playback (LiveKit ended + recording attached) ============
  if (sourceType === "livekit" && liveStatus === "ended" && liveRecordingUrl) {
    return (
      <div className="aspect-video w-full rounded-lg overflow-hidden bg-black">
        <video
          controls
          src={liveRecordingUrl}
          className="w-full h-full"
          preload="metadata"
        />
      </div>
    );
  }

  // ============ Kinescope ============
  if (sourceType === "kinescope") {
    const id = kinescopeLiveId || kinescopeVideoId;
    if (!id) {
      return (
        <EmptyState
          message="Не указан Kinescope Embed ID. Создайте Live в дашборде Kinescope и сохраните Embed ID в карточке вебинара."
        />
      );
    }
    return (
      <div className="aspect-video w-full rounded-lg overflow-hidden bg-black">
        <iframe
          src={`https://kinescope.io/embed/${id}`}
          className="w-full h-full"
          allow="autoplay; fullscreen; picture-in-picture; encrypted-media"
          allowFullScreen
          title="Kinescope Live"
        />
      </div>
    );
  }

  // ============ External ============
  if (sourceType === "external") {
    const url = embedUrl || externalUrl;
    if (!url) return <EmptyState message="Ссылка на трансляцию не задана." />;
    const canEmbed = isEmbeddable(url);
    if (canEmbed) {
      return (
        <div className="aspect-video w-full rounded-lg overflow-hidden bg-black">
          <iframe
            src={url}
            className="w-full h-full"
            allow="autoplay; fullscreen; picture-in-picture; encrypted-media"
            allowFullScreen
            title="External webinar"
          />
        </div>
      );
    }
    return (
      <div className="aspect-video w-full rounded-lg bg-muted flex flex-col items-center justify-center gap-3 p-6 text-center">
        <p className="text-sm text-muted-foreground">
          Эта трансляция не поддерживает встраивание. Откройте её в новой вкладке.
        </p>
        <Button asChild>
          <a href={url} target="_blank" rel="noopener noreferrer">
            <ExternalLink className="w-4 h-4 mr-2" />
            Открыть трансляцию
          </a>
        </Button>
      </div>
    );
  }

  // ============ LiveKit ============
  return (
    <LiveKitEmbed
      webinarId={webinarId}
      webinarTitle={webinarTitle ?? null}
      publicToken={publicToken ?? null}
      allowGuests={allowGuests ?? true}
      guestPassword={guestPassword ?? null}
      onEnd={onEnd}
      onShareUpdated={onShareUpdated}
      prefetchedToken={prefetchedToken ?? null}
      prefetchedWsUrl={prefetchedWsUrl ?? null}
      viewOnly={viewOnly ?? false}
      showSidePanel={showSidePanel ?? false}
      guestIdentity={guestIdentity ?? null}
      guestDisplayName={guestDisplayName ?? null}
    />
  );
}

function LiveKitEmbed({
  webinarId,
  webinarTitle,
  publicToken,
  allowGuests,
  guestPassword,
  onEnd,
  onShareUpdated,
  prefetchedToken,
  prefetchedWsUrl,
  viewOnly,
  showSidePanel,
  guestIdentity,
  guestDisplayName,
}: {
  webinarId: string;
  webinarTitle: string | null;
  publicToken: string | null;
  allowGuests: boolean;
  guestPassword: string | null;
  onEnd?: () => void;
  onShareUpdated?: () => void;
  prefetchedToken: string | null;
  prefetchedWsUrl: string | null;
  viewOnly: boolean;
  showSidePanel: boolean;
  guestIdentity: string | null;
  guestDisplayName: string | null;
}) {
  const [token, setToken] = useState<string | null>(prefetchedToken);
  const [wsUrl, setWsUrl] = useState<string | null>(prefetchedWsUrl);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(!prefetchedToken);
  const [shareOpen, setShareOpen] = useState(false);

  const fetchToken = useCallback(async () => {
    // В гостевом режиме токен уже передан — не дёргаем функцию
    if (prefetchedToken && prefetchedWsUrl) {
      setToken(prefetchedToken);
      setWsUrl(prefetchedWsUrl);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const { data, error: invokeError } = await supabase.functions.invoke(
        "livekit-issue-token",
        { body: { webinarId } },
      );
      if (invokeError) throw new Error(invokeError.message);
      if (!data?.ok || !data?.token) throw new Error(data?.error || "Не удалось получить токен");
      setToken(data.token);
      setWsUrl(data.wsUrl);
    } catch (e) {
      setError((e as Error).message || "Ошибка");
    } finally {
      setLoading(false);
    }
  }, [webinarId, prefetchedToken, prefetchedWsUrl]);

  useEffect(() => {
    fetchToken();
  }, [fetchToken]);

  const publicLink = publicToken ? `${getBaseUrl()}/w/${publicToken}` : null;

  if (loading) {
    return (
      <div className="aspect-video w-full rounded-lg bg-muted flex items-center justify-center">
        <SigmaSpinner size="lg" />
      </div>
    );
  }

  if (error || !token || !wsUrl) {
    return (
      <div className="aspect-video w-full rounded-lg bg-muted flex flex-col items-center justify-center gap-3 p-6 text-center">
        <AlertCircle className="w-10 h-10 text-destructive" />
        <p className="text-sm text-muted-foreground">{error || "Не удалось подключиться"}</p>
        <Button onClick={fetchToken} size="sm">Повторить</Button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div
        className={cn(
          "grid gap-3",
          showSidePanel ? "lg:grid-cols-[1fr_340px]" : "grid-cols-1",
        )}
      >
        <div
          className="relative aspect-video w-full rounded-lg overflow-hidden bg-black webinar-livekit-root"
          data-lk-theme="default"
          data-mobile={detectPlatform()}
        >
          <LiveKitRoom
            token={token}
            serverUrl={wsUrl}
            connect={true}
            // Подключаемся к комнате мгновенно (только сигналинг). Камера/микрофон — по кнопкам LiveKit.
            video={false}
            audio={false}
            style={{ height: "100%" }}
          >
            <LiveKitTopBar
              webinarId={webinarId}
              title={webinarTitle}
              publicLink={viewOnly ? null : publicLink}
              onShare={() => setShareOpen(true)}
              onEnd={onEnd}
              hasShareSettings={!viewOnly && Boolean(publicToken)}
              viewOnly={viewOnly}
              isHost={!viewOnly}
            />
            <VideoConference />
            <WelcomeOverlay webinarTitle={webinarTitle} />
            <RoomAudioRenderer />
            {!viewOnly && <AutoRecordTrigger webinarId={webinarId} />}
          </LiveKitRoom>
        </div>

        {showSidePanel && (
          <WebinarSidebar
            webinarId={webinarId}
            isHost={!viewOnly}
            participantIdentity={guestIdentity ?? `guest-${webinarId}`}
            participantName={guestDisplayName ?? "Гость"}
            isGuest={viewOnly || !!guestIdentity}
            className="flex flex-col h-[480px] lg:h-[calc(100vh-200px)] lg:min-h-[400px] lg:max-h-[720px] rounded-lg border bg-background overflow-hidden"
          />
        )}
      </div>

      {!viewOnly && publicToken && (
        <ShareWebinarDialog
          open={shareOpen}
          onOpenChange={setShareOpen}
          webinar={{
            id: webinarId,
            title: webinarTitle ?? "Вебинар",
            public_token: publicToken,
            allow_guests: allowGuests,
            guest_password: guestPassword,
          }}
          onUpdated={onShareUpdated}
        />
      )}
    </div>
  );
}

/**
 * Шапка плеера LiveKit. Должна быть смонтирована ВНУТРИ <LiveKitRoom>,
 * чтобы useParticipants() мог получить контекст комнаты.
 */
function LiveKitTopBar({
  webinarId,
  title,
  publicLink,
  onShare,
  onEnd,
  hasShareSettings,
  viewOnly = false,
  isHost = false,
}: {
  webinarId: string;
  title: string | null;
  publicLink: string | null;
  onShare: () => void;
  onEnd?: () => void;
  hasShareSettings: boolean;
  viewOnly?: boolean;
  isHost?: boolean;
}) {
  const participants = useParticipants();
  const [copied, setCopied] = useState(false);
  const qrCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const [qrOpen, setQrOpen] = useState(false);

  useEffect(() => {
    if (qrOpen && publicLink && qrCanvasRef.current) {
      QRCode.toCanvas(qrCanvasRef.current, publicLink, { width: 200, margin: 1 }).catch(() => {});
    }
  }, [qrOpen, publicLink]);

  const copyLink = async () => {
    if (!publicLink) return;
    try {
      await navigator.clipboard.writeText(publicLink);
      setCopied(true);
      toast.success("Ссылка для участников скопирована");
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Не удалось скопировать");
    }
  };

  return (
    <div className="absolute top-1.5 left-1.5 right-1.5 z-10 flex items-center gap-1.5 rounded-md bg-card/95 border border-border px-2 py-1.5 shadow-md min-h-[36px]">
      <div className="flex items-center gap-1.5 min-w-0 mr-auto">
        <span className="relative flex h-2.5 w-2.5 shrink-0">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-destructive opacity-75" />
          <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-destructive" />
        </span>
        <span className="text-[11px] font-semibold text-destructive uppercase tracking-wide hidden md:inline">
          В эфире
        </span>
        {title && (
          <span className="text-xs sm:text-sm font-medium text-foreground truncate max-w-[120px] sm:max-w-[220px] md:max-w-[320px]">
            <span className="hidden md:inline">· </span>{title}
          </span>
        )}
      </div>

      <div className="flex items-center gap-1 text-xs text-foreground px-1.5 py-0.5 rounded bg-muted shrink-0">
        <Users className="w-3.5 h-3.5" />
        <span className="font-medium tabular-nums">{participants.length}</span>
      </div>

      {/* Desktop: full buttons */}
      {publicLink && (
        <div className="hidden sm:flex items-center gap-1.5">
          <Button size="sm" variant="default" onClick={copyLink} className="h-8">
            {copied ? <Check className="w-3.5 h-3.5 mr-1.5" /> : <Copy className="w-3.5 h-3.5 mr-1.5" />}
            <span className="hidden md:inline">Ссылка для участников</span>
            <span className="md:hidden">Ссылка</span>
          </Button>

          <Popover open={qrOpen} onOpenChange={setQrOpen}>
            <PopoverTrigger asChild>
              <Button size="sm" variant="secondary" className="h-8" title="QR-код">
                <QrCode className="w-4 h-4 md:mr-1.5" />
                <span className="hidden md:inline">QR</span>
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-3 bg-card">
              <canvas ref={qrCanvasRef} />
              <p className="text-xs text-center mt-2 text-muted-foreground max-w-[200px] break-all">
                {publicLink}
              </p>
            </PopoverContent>
          </Popover>
        </div>
      )}

      {hasShareSettings && (
        <Button size="sm" variant="secondary" onClick={onShare} className="h-8 hidden sm:inline-flex" title="Настройки доступа">
          <Settings2 className="w-4 h-4 md:mr-1.5" />
          <span className="hidden md:inline">Доступ</span>
        </Button>
      )}

      {/* Управление записью — только для хоста LiveKit-вебинара */}
      {isHost && (
        <div className="hidden sm:inline-flex">
          <RecordingControls webinarId={webinarId} />
        </div>
      )}

      {/* Mobile: collapse host actions into "..." menu */}
      {!viewOnly && (publicLink || hasShareSettings) && (
        <Popover>
          <PopoverTrigger asChild>
            <Button size="sm" variant="secondary" className="h-8 w-8 p-0 sm:hidden" title="Действия">
              <MoreHorizontal className="w-4 h-4" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-56 p-2 bg-card" align="end">
            <div className="flex flex-col gap-1">
              {publicLink && (
                <>
                  <Button size="sm" variant="ghost" className="justify-start h-9" onClick={copyLink}>
                    {copied ? <Check className="w-4 h-4 mr-2" /> : <Copy className="w-4 h-4 mr-2" />}
                    Скопировать ссылку
                  </Button>
                  <Button size="sm" variant="ghost" className="justify-start h-9" onClick={() => setQrOpen(true)}>
                    <QrCode className="w-4 h-4 mr-2" />
                    QR-код
                  </Button>
                </>
              )}
              {hasShareSettings && (
                <Button size="sm" variant="ghost" className="justify-start h-9" onClick={onShare}>
                  <Settings2 className="w-4 h-4 mr-2" />
                  Настройки доступа
                </Button>
              )}
              {isHost && (
                <div className="px-2 pt-1">
                  <RecordingControls webinarId={webinarId} />
                </div>
              )}
            </div>
          </PopoverContent>
        </Popover>
      )}

      {/* Hidden trigger to render QR popover from mobile menu */}
      {publicLink && (
        <Popover open={qrOpen && typeof window !== "undefined" && window.innerWidth < 640} onOpenChange={setQrOpen}>
          <PopoverTrigger asChild>
            <span className="sr-only" aria-hidden />
          </PopoverTrigger>
          <PopoverContent className="w-auto p-3 bg-card" align="center">
            <canvas ref={qrCanvasRef} />
            <p className="text-xs text-center mt-2 text-muted-foreground max-w-[200px] break-all">
              {publicLink}
            </p>
          </PopoverContent>
        </Popover>
      )}

      {onEnd && (
        <Button
          size="sm"
          variant={viewOnly ? "secondary" : "destructive"}
          onClick={onEnd}
          className="h-8 px-2 sm:px-3 shrink-0"
          title={viewOnly ? "Покинуть эфир" : "Завершить эфир"}
        >
          <Square className="w-3.5 h-3.5 sm:mr-1.5" />
          <span className="hidden sm:inline">{viewOnly ? "Покинуть" : "Завершить"}</span>
        </Button>
      )}
    </div>
  );
}

/**
 * Брендированный экран «Добро пожаловать на вебинар Синтагма».
 * Показывается, пока ни один участник не публикует камеру/демонстрацию экрана.
 * Должен быть смонтирован ВНУТРИ <LiveKitRoom>, чтобы useTracks() имел контекст.
 */
function WelcomeOverlay({ webinarTitle }: { webinarTitle: string | null }) {
  const tracks = useTracks(
    [
      { source: Track.Source.Camera, withPlaceholder: false },
      { source: Track.Source.ScreenShare, withPlaceholder: false },
    ],
    { onlySubscribed: false },
  );

  // Если есть хотя бы один реальный трек — скрываем заглушку
  if (tracks.length > 0) return null;

  // ВАЖНО: pointer-events-none + bottom-20, чтобы заглушка не перекрывала
  // нижнюю control-bar LiveKit (камера / микрофон / поделиться экраном / leave).
  return (
    <div className="pointer-events-none absolute left-0 right-0 top-12 bottom-24 z-[2] flex flex-col items-center justify-center gap-4 bg-gradient-to-br from-primary/10 via-background/40 to-primary/5 p-6 text-center">
      <div className="animate-pulse opacity-90">
        <SigmaLogo size="lg" showText={false} />
      </div>
      <div className="space-y-1.5 max-w-lg bg-background/60 rounded-lg px-4 py-2">
        <h2 className="text-lg sm:text-2xl font-display font-medium text-foreground">
          Добро пожаловать на вебинар Синтагма
        </h2>
        {webinarTitle && (
          <p className="text-sm sm:text-base font-medium text-primary">
            {webinarTitle}
          </p>
        )}
        <p className="text-xs sm:text-sm text-muted-foreground">
          Эфир скоро начнётся. Включите камеру и микрофон кнопками внизу.
        </p>
      </div>
    </div>
  );
}

/**
 * Авто-старт записи при первом подключении хоста, если у вебинара выставлен флаг auto_record.
 * Должен быть смонтирован ВНУТРИ <LiveKitRoom> для доступа к room context.
 * Срабатывает один раз за сессию.
 */
function AutoRecordTrigger({ webinarId }: { webinarId: string }) {
  const room = useRoomContext();
  const triggeredRef = useRef(false);

  useEffect(() => {
    if (!room) return;
    const tryStart = async () => {
      if (triggeredRef.current) return;
      try {
        const { data: w } = await supabase
          .from("webinars")
          .select("auto_record, recording_status, status")
          .eq("id", webinarId)
          .maybeSingle();
        if (!w?.auto_record) return;
        if (w.recording_status === "active" || w.recording_status === "starting") return;
        if (w.status && w.status !== "live") return;
        triggeredRef.current = true;
        const { error } = await supabase.functions.invoke("livekit-start-recording", {
          body: { webinarId, autoStart: true },
        });
        if (error) {
          console.warn("[auto-record] failed", error);
          triggeredRef.current = false;
        } else {
          console.log("[auto-record] started for", webinarId);
        }
      } catch (e) {
        console.warn("[auto-record] error", e);
      }
    };
    const handler = () => { void tryStart(); };
    room.on(RoomEvent.Connected, handler);
    if (room.state === "connected") void tryStart();
    return () => { room.off(RoomEvent.Connected, handler); };
  }, [room, webinarId]);

  return null;
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="aspect-video w-full rounded-lg bg-muted flex items-center justify-center p-6 text-center">
      <p className="text-sm text-muted-foreground max-w-md">{message}</p>
    </div>
  );
}

function isEmbeddable(url: string): boolean {
  // Известные сервисы, которые блокируют iframe (X-Frame-Options/CSP)
  const blockList = ["zoom.us", "us02web.zoom.us", "us04web.zoom.us", "us05web.zoom.us"];
  try {
    const u = new URL(url);
    if (blockList.some((b) => u.hostname.includes(b))) return false;
    return true;
  } catch {
    return false;
  }
}
