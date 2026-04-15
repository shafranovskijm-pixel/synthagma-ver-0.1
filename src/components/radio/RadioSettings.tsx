import { Radio, Volume2, Play, Pause } from "lucide-react";
import { Slider } from "@/components/ui/slider";
import { useRadioPlayer } from "@/hooks/useRadioPlayer";
import { cn } from "@/lib/utils";

export function RadioSettings() {
  const {
    stations, currentStation, playing, loading,
    volume, setVolume, toggle, selectStation,
    nowPlaying,
  } = useRadioPlayer();

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold mb-1">Радио</h3>
        <p className="text-sm text-muted-foreground">
          Слушайте музыку прямо во время обучения
        </p>
      </div>

      {/* Volume control */}
      <div className="bg-card border border-border rounded-2xl p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className={cn(
              "w-10 h-10 rounded-xl flex items-center justify-center",
              playing ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
            )}>
              <Radio className="w-5 h-5" />
            </div>
            <div>
              <p className="font-medium">
                {playing ? (currentStation?.name || "Играет") : "Выключено"}
              </p>
              {playing && nowPlaying && (
                <p className="text-xs text-muted-foreground truncate max-w-[200px]">
                  {nowPlaying.artist ? `${nowPlaying.artist} — ${nowPlaying.title}` : nowPlaying.title}
                </p>
              )}
            </div>
          </div>
          <button
            onClick={toggle}
            disabled={loading}
            className={cn(
              "w-10 h-10 rounded-full flex items-center justify-center transition-all",
              playing
                ? "bg-primary text-primary-foreground hover:bg-primary/90"
                : "bg-secondary text-foreground hover:bg-secondary/80"
            )}
          >
            {loading ? (
              <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
            ) : playing ? (
              <Pause className="w-4 h-4" />
            ) : (
              <Play className="w-4 h-4 ml-0.5" />
            )}
          </button>
        </div>

        <div className="flex items-center gap-3">
          <Volume2 className="w-4 h-4 text-muted-foreground shrink-0" />
          <Slider
            value={[volume * 100]}
            onValueChange={([v]) => setVolume(v / 100)}
            max={100}
            step={1}
            className="flex-1"
          />
          <span className="text-sm text-muted-foreground w-10 text-right">{Math.round(volume * 100)}%</span>
        </div>
      </div>

      {/* Station list */}
      <div>
        <h4 className="text-sm font-semibold mb-3">Станции</h4>
        <div className="grid gap-2">
          {stations.map((station) => {
            const isActive = currentStation?.id === station.id;
            return (
              <button
                key={station.id}
                onClick={() => selectStation(station)}
                className={cn(
                  "flex items-center gap-3 p-3 rounded-xl border transition-all text-left",
                  isActive
                    ? "border-primary bg-primary/5 shadow-sm"
                    : "border-border hover:border-primary/30 hover:bg-secondary/50"
                )}
              >
                <div className={cn(
                  "w-10 h-10 rounded-xl flex items-center justify-center shrink-0",
                  isActive ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                )}>
                  {station.logo_url ? (
                    <img src={station.logo_url} alt="" className="w-full h-full rounded-xl object-cover" />
                  ) : (
                    <Radio className="w-5 h-5" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">{station.name}</p>
                  {station.genre && (
                    <p className="text-xs text-muted-foreground capitalize">{station.genre}</p>
                  )}
                </div>
                {isActive && playing && (
                  <div className="flex items-end gap-0.5 h-5">
                    <div className="w-1 bg-primary rounded-full animate-bounce" style={{ height: "50%", animationDelay: "0ms" }} />
                    <div className="w-1 bg-primary rounded-full animate-bounce" style={{ height: "100%", animationDelay: "150ms" }} />
                    <div className="w-1 bg-primary rounded-full animate-bounce" style={{ height: "40%", animationDelay: "300ms" }} />
                  </div>
                )}
                {isActive && !playing && (
                  <span className="text-xs text-primary font-medium">Выбрана</span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
