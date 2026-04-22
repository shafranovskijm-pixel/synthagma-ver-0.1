import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Radio, Maximize2, Building2 } from "lucide-react";
import { EmbeddedWebinarPlayer } from "@/components/webinars/EmbeddedWebinarPlayer";

interface WebinarLiveInlineProps {
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
  };
  onBack: () => void;
  onEnd?: () => void | Promise<void>;
  onShareUpdated?: () => void;
  /** Если задан — кнопка «На отдельной странице» переходит по этому пути */
  expandHref?: string;
}

/**
 * Inline-режим эфира — встаёт ВНУТРИ контента рабочего стола, как редактор курсов.
 * Сайдбар и шапка кабинета остаются видимыми. Закрытие («Назад») НЕ завершает эфир.
 */
export function WebinarLiveInline({
  webinar,
  onBack,
  onEnd,
  onShareUpdated,
  expandHref,
}: WebinarLiveInlineProps) {
  return (
    <div className="space-y-4">
      {/* Локальная шапка эфира */}
      <div className="flex items-center justify-between gap-4 rounded-lg border bg-card px-4 py-3 shadow-sm">
        <div className="flex items-center gap-3 min-w-0">
          <Button
            variant="ghost"
            size="sm"
            onClick={onBack}
            className="gap-1.5"
            title="Вернуться к списку (эфир продолжится)"
          >
            <ArrowLeft className="w-4 h-4" />
            <span className="hidden sm:inline">К вебинарам</span>
          </Button>
          <div className="flex items-center gap-2 min-w-0">
            <Badge variant="destructive" className="gap-1 shrink-0">
              <Radio className="w-3 h-3 animate-pulse" />
              LIVE
            </Badge>
            <h2 className="font-semibold truncate text-base">{webinar.title}</h2>
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
              variant="outline"
              size="sm"
              onClick={() => {
                window.location.href = expandHref;
              }}
              className="gap-1.5"
              title="Открыть на отдельной странице"
            >
              <Maximize2 className="w-4 h-4" />
              <span className="hidden sm:inline">На отдельной странице</span>
            </Button>
          )}
        </div>
      </div>

      {/* Плеер */}
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
          onBack();
        }}
        onShareUpdated={onShareUpdated}
      />

      <p className="text-xs text-muted-foreground text-center">
        Возврат к списку не завершает эфир — участники продолжат смотреть.
        Чтобы остановить трансляцию, нажмите «Завершить» в шапке плеера.
      </p>
    </div>
  );
}
