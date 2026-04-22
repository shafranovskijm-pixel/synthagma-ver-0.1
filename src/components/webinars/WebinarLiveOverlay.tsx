import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { X, Radio, Maximize2, Building2 } from "lucide-react";
import { EmbeddedWebinarPlayer } from "@/components/webinars/EmbeddedWebinarPlayer";

interface WebinarLiveOverlayProps {
  open: boolean;
  onClose: () => void;
  webinar: {
    id: string;
    title: string;
    source_type: string;
    kinescope_live_id?: string | null;
    kinescope_video_id?: string | null;
    embed_url?: string | null;
    external_url?: string | null;
    public_token?: string | null;
    allow_guests?: boolean | null;
    guest_password?: string | null;
    status?: string | null;
    recording_url?: string | null;
    organization_name?: string | null;
  } | null;
  onEnd?: () => void | Promise<void>;
  onShareUpdated?: () => void;
  /** Если задан — кнопка «На весь экран» переходит по этому пути */
  expandHref?: string;
}

/**
 * Полноэкранный оверлей для ведения эфира — встаёт поверх всего рабочего стола
 * (как редактор курсов), но остаётся внутри SPA. Закрытие НЕ завершает эфир.
 */
export function WebinarLiveOverlay({
  open,
  onClose,
  webinar,
  onEnd,
  onShareUpdated,
  expandHref,
}: WebinarLiveOverlayProps) {
  // Блокируем скролл фона, пока открыт оверлей
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  // Закрытие по Esc
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open || !webinar) return null;

  return (
    <div className="fixed inset-0 z-50 bg-background flex flex-col animate-in fade-in-0 duration-150">
      {/* Шапка оверлея */}
      <header className="flex items-center justify-between gap-4 px-4 lg:px-6 h-14 border-b bg-background/95 backdrop-blur-sm shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            className="gap-1.5"
            title="Свернуть (эфир продолжится)"
          >
            <X className="w-4 h-4" />
            <span className="hidden sm:inline">Свернуть</span>
          </Button>
          <div className="flex items-center gap-2 min-w-0">
            <Badge variant="destructive" className="gap-1 shrink-0">
              <Radio className="w-3 h-3 animate-pulse" />
              LIVE
            </Badge>
            <h1 className="font-semibold truncate">{webinar.title}</h1>
            {webinar.organization_name && (
              <span className="hidden md:flex items-center gap-1 text-xs text-muted-foreground shrink-0">
                <Building2 className="w-3 h-3" />
                {webinar.organization_name}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {expandHref && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                onClose();
                window.location.href = expandHref;
              }}
              className="gap-1.5"
              title="Открыть на отдельной странице"
            >
              <Maximize2 className="w-4 h-4" />
              <span className="hidden sm:inline">На весь экран</span>
            </Button>
          )}
        </div>
      </header>

      {/* Тело — плеер растягивается на весь рабочий стол */}
      <div className="flex-1 overflow-y-auto p-4 lg:p-6">
        <div className="mx-auto max-w-[1600px]">
          <EmbeddedWebinarPlayer
            webinarId={webinar.id}
            sourceType={webinar.source_type}
            kinescopeLiveId={webinar.kinescope_live_id ?? null}
            kinescopeVideoId={webinar.kinescope_video_id ?? null}
            embedUrl={webinar.embed_url ?? null}
            externalUrl={webinar.external_url ?? null}
            webinarTitle={webinar.title}
            publicToken={webinar.public_token ?? null}
            allowGuests={webinar.allow_guests ?? true}
            guestPassword={webinar.guest_password ?? null}
            status={webinar.status ?? undefined}
            recordingUrl={webinar.recording_url ?? null}
            showSidePanel={webinar.source_type === "livekit"}
            onEnd={async () => {
              if (onEnd) await onEnd();
              onClose();
            }}
            onShareUpdated={onShareUpdated}
          />
          <p className="text-xs text-muted-foreground mt-3 text-center">
            Закрытие окна не завершает эфир — остальные участники продолжат смотреть.
            Чтобы остановить трансляцию, нажмите «Завершить» в шапке плеера.
          </p>
        </div>
      </div>
    </div>
  );
}
