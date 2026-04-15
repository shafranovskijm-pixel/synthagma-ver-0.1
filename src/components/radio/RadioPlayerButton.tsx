import { Radio, Pause, Play, Volume2, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Slider } from "@/components/ui/slider";
import { useRadioPlayer } from "@/hooks/useRadioPlayer";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

export function RadioPlayerButton() {
  const {
    stations, currentStation, playing, loading,
    volume, setVolume, nowPlaying, toggle, selectStation,
  } = useRadioPlayer();

  if (stations.length === 0) return null;

  return (
    <Popover>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className={cn(
                "rounded-xl w-10 h-10 relative hover:scale-105 transition-all",
                playing && "text-primary"
              )}
            >
              <Radio className={cn("w-5 h-5", playing && "animate-pulse")} />
              {playing && (
                <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-primary animate-pulse" />
              )}
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent>Радио</TooltipContent>
      </Tooltip>

      <PopoverContent align="end" className="w-80 p-0 rounded-2xl overflow-hidden">
        {/* Now playing header */}
        <div className="bg-primary/10 p-4">
          <div className="flex items-center gap-3">
            {nowPlaying?.cover ? (
              <img src={nowPlaying.cover} alt="" className="w-12 h-12 rounded-xl object-cover shadow-md" />
            ) : (
              <div className="w-12 h-12 rounded-xl bg-primary/20 flex items-center justify-center">
                <Radio className="w-6 h-6 text-primary" />
              </div>
            )}
            <div className="flex-1 min-w-0">
              <p className="text-xs text-muted-foreground font-medium">
                {playing ? "Сейчас играет" : "Радио выключено"}
              </p>
              {playing && nowPlaying ? (
                <>
                  <p className="text-sm font-semibold truncate">{nowPlaying.title}</p>
                  {nowPlaying.artist && (
                    <p className="text-xs text-muted-foreground truncate">{nowPlaying.artist}</p>
                  )}
                </>
              ) : (
                <p className="text-sm font-semibold truncate">
                  {currentStation?.name || "Выберите станцию"}
                </p>
              )}
            </div>
            <Button
              variant={playing ? "default" : "outline"}
              size="icon"
              className="rounded-full w-10 h-10 shrink-0"
              onClick={toggle}
              disabled={loading}
            >
              {loading ? (
                <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
              ) : playing ? (
                <Pause className="w-4 h-4" />
              ) : (
                <Play className="w-4 h-4 ml-0.5" />
              )}
            </Button>
          </div>

          {/* Volume */}
          <div className="flex items-center gap-2 mt-3">
            <Volume2 className="w-4 h-4 text-muted-foreground shrink-0" />
            <Slider
              value={[volume * 100]}
              onValueChange={([v]) => setVolume(v / 100)}
              max={100}
              step={1}
              className="flex-1"
            />
            <span className="text-xs text-muted-foreground w-8 text-right">{Math.round(volume * 100)}%</span>
          </div>
        </div>

        {/* Station list */}
        <div className="max-h-60 overflow-y-auto p-2">
          {stations.map((station) => {
            const isActive = currentStation?.id === station.id;
            return (
              <button
                key={station.id}
                onClick={() => selectStation(station)}
                className={cn(
                  "w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-colors",
                  isActive
                    ? "bg-primary/10 text-primary"
                    : "hover:bg-secondary"
                )}
              >
                <div className={cn(
                  "w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold shrink-0",
                  isActive ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                )}>
                  {station.logo_url ? (
                    <img src={station.logo_url} alt="" className="w-full h-full rounded-lg object-cover" />
                  ) : (
                    <Radio className="w-4 h-4" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{station.name}</p>
                  {station.genre && (
                    <p className="text-xs text-muted-foreground capitalize">{station.genre}</p>
                  )}
                </div>
                {isActive && playing && (
                  <div className="flex items-end gap-0.5 h-4">
                    <div className="w-1 bg-primary rounded-full animate-bounce" style={{ height: "60%", animationDelay: "0ms" }} />
                    <div className="w-1 bg-primary rounded-full animate-bounce" style={{ height: "100%", animationDelay: "150ms" }} />
                    <div className="w-1 bg-primary rounded-full animate-bounce" style={{ height: "40%", animationDelay: "300ms" }} />
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
