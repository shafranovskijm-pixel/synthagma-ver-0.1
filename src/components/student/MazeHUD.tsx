import { Heart, Volume2, VolumeX, Skull } from "lucide-react";

const WEAPONS = ["👊 Кулак", "🔫 Пистолет", "🚀 Ракетница"];

/* SVG weapon sprites */
function FistSprite({ shooting }: { shooting: boolean }) {
  return (
    <svg viewBox="0 0 120 120" className={`w-28 h-28 drop-shadow-lg transition-transform duration-100 ${shooting ? "scale-110 -translate-y-2" : ""}`}>
      <circle cx="60" cy="60" r="28" fill="#d4a574" stroke="#8b6914" strokeWidth="3" />
      <rect x="42" y="48" width="8" height="24" rx="4" fill="#c49a6c" />
      <rect x="52" y="44" width="8" height="28" rx="4" fill="#c49a6c" />
      <rect x="62" y="44" width="8" height="28" rx="4" fill="#c49a6c" />
      <rect x="72" y="48" width="8" height="24" rx="4" fill="#c49a6c" />
      <rect x="48" y="72" width="24" height="12" rx="4" fill="#b88a5c" />
    </svg>
  );
}

function PistolSprite({ shooting }: { shooting: boolean }) {
  return (
    <div className="relative">
      {shooting && (
        <div className="absolute -top-6 left-1/2 -translate-x-1/2 w-8 h-8 rounded-full bg-yellow-400/80 blur-sm animate-ping" />
      )}
      <svg viewBox="0 0 140 100" className={`w-32 h-24 drop-shadow-lg transition-transform duration-100 ${shooting ? "translate-y-1 scale-105" : ""}`}>
        <rect x="20" y="30" width="90" height="18" rx="4" fill="#555" stroke="#333" strokeWidth="2" />
        <rect x="100" y="26" width="20" height="8" rx="2" fill="#666" />
        <rect x="55" y="48" width="14" height="32" rx="3" fill="#4a3728" stroke="#333" strokeWidth="2" />
        <rect x="45" y="45" width="10" height="6" rx="2" fill="#777" />
        <circle cx="24" cy="39" r="4" fill="#222" />
      </svg>
    </div>
  );
}

function RocketSprite({ shooting }: { shooting: boolean }) {
  return (
    <div className="relative">
      {shooting && (
        <>
          <div className="absolute -top-8 left-1/2 -translate-x-1/2 w-12 h-12 rounded-full bg-orange-500/70 blur-md animate-ping" />
          <div className="absolute -top-4 left-1/2 -translate-x-1/2 w-6 h-6 rounded-full bg-yellow-300/90 blur-sm" />
        </>
      )}
      <svg viewBox="0 0 160 90" className={`w-36 h-24 drop-shadow-lg transition-transform duration-100 ${shooting ? "translate-y-2 scale-110" : ""}`}>
        <rect x="10" y="30" width="110" height="22" rx="6" fill="#556b2f" stroke="#333" strokeWidth="2" />
        <rect x="110" y="26" width="30" height="30" rx="4" fill="#4a5d23" stroke="#333" strokeWidth="2" />
        <circle cx="125" cy="41" r="10" fill="#222" stroke="#444" strokeWidth="1.5" />
        <rect x="55" y="52" width="16" height="28" rx="4" fill="#4a3728" stroke="#333" strokeWidth="2" />
        <rect x="20" y="25" width="6" height="8" rx="2" fill="#666" />
      </svg>
    </div>
  );
}

const WEAPON_SPRITES = [FistSprite, PistolSprite, RocketSprite];

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
  const WeaponComponent = WEAPON_SPRITES[weapon] || PistolSprite;

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
        <div className={`transition-all duration-100 ${shooting ? "scale-125" : ""}`}>
          <svg viewBox="0 0 40 40" className="w-8 h-8">
            <line x1="20" y1="4" x2="20" y2="16" stroke={shooting ? "#f87171" : "rgba(255,255,255,0.6)"} strokeWidth="2" />
            <line x1="20" y1="24" x2="20" y2="36" stroke={shooting ? "#f87171" : "rgba(255,255,255,0.6)"} strokeWidth="2" />
            <line x1="4" y1="20" x2="16" y2="20" stroke={shooting ? "#f87171" : "rgba(255,255,255,0.6)"} strokeWidth="2" />
            <line x1="24" y1="20" x2="36" y2="20" stroke={shooting ? "#f87171" : "rgba(255,255,255,0.6)"} strokeWidth="2" />
            <circle cx="20" cy="20" r="2" fill={shooting ? "#f87171" : "rgba(255,255,255,0.5)"} />
          </svg>
        </div>
      </div>

      {/* Weapon sprite at bottom center */}
      <div className="absolute bottom-16 left-1/2 -translate-x-1/2">
        <WeaponComponent shooting={shooting} />
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
