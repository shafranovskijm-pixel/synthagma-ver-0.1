import { Heart, Crosshair, Volume2, VolumeX, Skull } from "lucide-react";

const WEAPONS = ["👊 Кулак", "🔫 Пистолет", "🚀 Ракетница"];

interface MazeHUDProps {
  health: number;
  maxHealth: number;
  kills: number;
  weapon: number;
  onWeaponChange: (w: number) => void;
  muted: boolean;
  onToggleMute: () => void;
  shooting: boolean;
}

export function MazeHUD({
  health,
  maxHealth,
  kills,
  weapon,
  onWeaponChange,
  muted,
  onToggleMute,
  shooting,
}: MazeHUDProps) {
  return (
    <div className="absolute inset-0 pointer-events-none z-10 select-none">
      {/* Top bar */}
      <div className="flex items-start justify-between p-3">
        {/* Health */}
        <div className="flex items-center gap-1 pointer-events-auto bg-black/50 rounded-lg px-2 py-1">
          {Array.from({ length: maxHealth }).map((_, i) => (
            <Heart
              key={i}
              className={`w-5 h-5 ${i < health ? "text-red-500 fill-red-500" : "text-red-900"}`}
            />
          ))}
        </div>

        {/* Kills & Mute */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 bg-black/50 rounded-lg px-2 py-1 text-yellow-400 text-sm font-bold">
            <Skull className="w-4 h-4" />
            {kills}
          </div>
          <button
            className="pointer-events-auto bg-black/50 rounded-lg p-1.5 text-white/70 hover:text-white"
            onClick={onToggleMute}
          >
            {muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Crosshair */}
      <div className="absolute inset-0 flex items-center justify-center">
        <Crosshair className={`w-8 h-8 ${shooting ? "text-red-400 scale-125" : "text-white/60"} transition-all duration-100`} />
      </div>

      {/* Bottom — weapon selector */}
      <div className="absolute bottom-3 left-0 right-0 flex items-center justify-center gap-2">
        {WEAPONS.map((w, i) => (
          <button
            key={i}
            className={`pointer-events-auto px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
              weapon === i
                ? "bg-primary/80 text-primary-foreground scale-110 shadow-lg"
                : "bg-black/50 text-white/70 hover:bg-black/70"
            }`}
            onClick={() => onWeaponChange(i)}
          >
            {w}
          </button>
        ))}
        <span className="text-[10px] text-white/40 ml-2">[1-2-3]</span>
      </div>
    </div>
  );
}
