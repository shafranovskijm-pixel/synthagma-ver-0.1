import { useEffect, useState, useCallback, useRef } from "react";
import QRCode from "qrcode";
import { supabase } from "@/integrations/supabase/client";
import {
  LiveKitRoom,
  VideoConference,
  RoomAudioRenderer,
  useParticipants,
  useTracks,
} from "@livekit/components-react";
import { Track } from "livekit-client";
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
import { cn } from "@/lib/utils";

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
  // ============ Recording playback (LiveKit ended + recording attached) ============
  if (sourceType === "livekit" && status === "ended" && recordingUrl) {
    return (
      <div className="aspect-video w-full rounded-lg overflow-hidden bg-black">
        <video
          controls
          src={recordingUrl}
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
        <div className="relative aspect-video w-full rounded-lg overflow-hidden bg-black" data-lk-theme="default">
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
              title={webinarTitle}
              publicLink={viewOnly ? null : publicLink}
              onShare={() => setShareOpen(true)}
              onEnd={onEnd}
              hasShareSettings={!viewOnly && Boolean(publicToken)}
              viewOnly={viewOnly}
            />
            <VideoConference />
            <WelcomeOverlay webinarTitle={webinarTitle} />
            <RoomAudioRenderer />
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
  title,
  publicLink,
  onShare,
  onEnd,
  hasShareSettings,
  viewOnly = false,
}: {
  title: string | null;
  publicLink: string | null;
  onShare: () => void;
  onEnd?: () => void;
  hasShareSettings: boolean;
  viewOnly?: boolean;
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
    <div className="absolute top-2 left-2 right-2 z-10 flex flex-wrap items-center gap-2 rounded-md bg-card border border-border px-3 py-2 shadow-md">
      <div className="flex items-center gap-2 min-w-0 mr-auto">
        <span className="relative flex h-2.5 w-2.5 shrink-0">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-destructive opacity-75" />
          <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-destructive" />
        </span>
        <span className="text-xs font-semibold text-destructive uppercase tracking-wide hidden sm:inline">
          В эфире
        </span>
        {title && (
          <span className="text-sm font-medium text-foreground truncate max-w-[180px] sm:max-w-[260px]">
            · {title}
          </span>
        )}
      </div>

      <div className="flex items-center gap-1 text-xs text-foreground px-2 py-1 rounded bg-muted">
        <Users className="w-3.5 h-3.5" />
        <span className="font-medium tabular-nums">{participants.length}</span>
      </div>

      {publicLink && (
        <>
          <Button size="sm" variant="default" onClick={copyLink} className="h-8">
            {copied ? <Check className="w-3.5 h-3.5 mr-1.5" /> : <Copy className="w-3.5 h-3.5 mr-1.5" />}
            <span className="hidden sm:inline">Ссылка для участников</span>
            <span className="sm:hidden">Ссылка</span>
          </Button>

          <Popover open={qrOpen} onOpenChange={setQrOpen}>
            <PopoverTrigger asChild>
              <Button size="sm" variant="secondary" className="h-8" title="QR-код">
                <QrCode className="w-4 h-4 sm:mr-1.5" />
                <span className="hidden sm:inline">QR</span>
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-3 bg-card">
              <canvas ref={qrCanvasRef} />
              <p className="text-xs text-center mt-2 text-muted-foreground max-w-[200px] break-all">
                {publicLink}
              </p>
            </PopoverContent>
          </Popover>
        </>
      )}

      {hasShareSettings && (
        <Button size="sm" variant="secondary" onClick={onShare} className="h-8" title="Настройки доступа">
          <Settings2 className="w-4 h-4 sm:mr-1.5" />
          <span className="hidden sm:inline">Доступ</span>
        </Button>
      )}

      {onEnd && (
        <Button
          size="sm"
          variant={viewOnly ? "secondary" : "destructive"}
          onClick={onEnd}
          className="h-8"
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
    <div className="pointer-events-none absolute left-0 right-0 top-0 bottom-20 z-[2] flex flex-col items-center justify-center gap-6 bg-gradient-to-br from-primary/20 via-background to-primary/10 p-6 text-center">
      <div className="animate-pulse">
        <SigmaLogo size="xl" showText={false} />
      </div>
      <div className="space-y-2 max-w-lg">
        <h2 className="text-2xl sm:text-3xl font-display font-medium text-foreground">
          Добро пожаловать на вебинар Синтагма
        </h2>
        {webinarTitle && (
          <p className="text-base sm:text-lg font-medium text-primary">
            {webinarTitle}
          </p>
        )}
        <p className="text-sm text-muted-foreground">
          Эфир скоро начнётся. Включите камеру и микрофон кнопками внизу.
        </p>
      </div>
    </div>
  );
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
