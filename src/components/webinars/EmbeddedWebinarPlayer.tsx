import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { LiveKitRoom, VideoConference, RoomAudioRenderer } from "@livekit/components-react";
import "@livekit/components-styles";
import { SigmaSpinner } from "@/components/ui/SigmaSpinner";
import { Button } from "@/components/ui/button";
import { AlertCircle, ExternalLink } from "lucide-react";

interface Props {
  webinarId: string;
  sourceType: string;
  kinescopeLiveId?: string | null;
  kinescopeVideoId?: string | null;
  embedUrl?: string | null;
  externalUrl?: string | null;
}

/**
 * Универсальный встроенный плеер вебинара.
 * - kinescope: iframe https://kinescope.io/embed/{id}
 * - livekit:   полноценная комната LiveKit с камерой/микрофоном
 * - external:  iframe или fallback-кнопка
 */
export function EmbeddedWebinarPlayer({
  webinarId,
  sourceType,
  kinescopeLiveId,
  kinescopeVideoId,
  embedUrl,
  externalUrl,
}: Props) {
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
  return <LiveKitEmbed webinarId={webinarId} />;
}

function LiveKitEmbed({ webinarId }: { webinarId: string }) {
  const [token, setToken] = useState<string | null>(null);
  const [wsUrl, setWsUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchToken = useCallback(async () => {
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
  }, [webinarId]);

  useEffect(() => {
    fetchToken();
  }, [fetchToken]);

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
    <div className="aspect-video w-full rounded-lg overflow-hidden bg-black" data-lk-theme="default">
      <LiveKitRoom
        token={token}
        serverUrl={wsUrl}
        connect={true}
        video={true}
        audio={true}
        style={{ height: "100%" }}
      >
        <VideoConference />
        <RoomAudioRenderer />
      </LiveKitRoom>
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
