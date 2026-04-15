import { useState, useEffect, useRef, useCallback } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { ADMIN_THEMES, getStoredThemeId, getThemeById, storeThemeId } from "@/constants/admin-themes";

interface Props {
  userName?: string | null;
  orgName?: string | null;
  logoUrl?: string | null;
}

export function StudentProfileBanner({ userName, orgName, logoUrl }: Props) {
  const [currentIndex, setCurrentIndex] = useState(() => {
    const id = getStoredThemeId();
    const idx = ADMIN_THEMES.findIndex(t => t.id === id);
    return idx >= 0 ? idx : ADMIN_THEMES.findIndex(t => t.id === "office-green");
  });
  const [prevIndex, setPrevIndex] = useState(currentIndex);
  const [transitioning, setTransitioning] = useState(false);

  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);

  const applyTheme = useCallback((idx: number) => {
    const theme = ADMIN_THEMES[idx];
    if (!theme) return;
    setPrevIndex(currentIndex);
    setCurrentIndex(idx);
    setTransitioning(true);
    storeThemeId(theme.id);
    window.dispatchEvent(new CustomEvent("visual-theme-change", { detail: theme.id }));
    setTimeout(() => setTransitioning(false), 700);
  }, [currentIndex]);

  const goNext = useCallback(() => {
    applyTheme((currentIndex + 1) % ADMIN_THEMES.length);
  }, [currentIndex, applyTheme]);

  const goPrev = useCallback(() => {
    applyTheme((currentIndex - 1 + ADMIN_THEMES.length) % ADMIN_THEMES.length);
  }, [currentIndex, applyTheme]);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
  }, []);

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    if (touchStartX.current === null || touchStartY.current === null) return;
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    const dy = Math.abs(e.changedTouches[0].clientY - touchStartY.current);
    if (Math.abs(dx) > 50 && Math.abs(dx) > dy) {
      if (dx < 0) goNext();
      else goPrev();
    }
    touchStartX.current = null;
    touchStartY.current = null;
  }, [goNext, goPrev]);

  // Sync with external theme changes
  useEffect(() => {
    const handler = (e: Event) => {
      const id = (e as CustomEvent).detail;
      const idx = ADMIN_THEMES.findIndex(t => t.id === id);
      if (idx >= 0 && idx !== currentIndex) {
        setPrevIndex(currentIndex);
        setCurrentIndex(idx);
      }
    };
    window.addEventListener("visual-theme-change", handler);
    return () => window.removeEventListener("visual-theme-change", handler);
  }, [currentIndex]);

  const current = ADMIN_THEMES[currentIndex];
  const prev = ADMIN_THEMES[prevIndex];
  const greeting = userName ? `Добро пожаловать, ${userName.split(" ")[0]}!` : "Добро пожаловать!";

  return (
    <div
      className="relative h-36 sm:h-40 overflow-hidden select-none"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {/* Previous layer (fades out) */}
      {transitioning && prev && (
        <div
          className="absolute inset-0 transition-opacity duration-700 opacity-0"
          style={{
            backgroundImage: `url(${prev.bannerUrl})`,
            backgroundSize: "cover",
            backgroundPosition: prev.bannerPosition || "center",
          }}
        />
      )}
      {/* Current layer */}
      <div
        className="absolute inset-0 transition-opacity duration-700"
        style={{
          opacity: 1,
          backgroundImage: `url(${current.bannerUrl})`,
          backgroundSize: "cover",
          backgroundPosition: current.bannerPosition || "center",
        }}
      />

      {/* Gradient overlay */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/25 to-transparent" />

      {/* Arrow buttons (desktop) */}
      <button
        onClick={goPrev}
        className="absolute left-2 top-1/2 -translate-y-1/2 z-10 p-1 rounded-full bg-black/30 hover:bg-black/50 text-white/80 hover:text-white transition-colors hidden sm:flex items-center justify-center"
        aria-label="Предыдущая тема"
      >
        <ChevronLeft className="w-4 h-4" />
      </button>
      <button
        onClick={goNext}
        className="absolute right-2 top-1/2 -translate-y-1/2 z-10 p-1 rounded-full bg-black/30 hover:bg-black/50 text-white/80 hover:text-white transition-colors hidden sm:flex items-center justify-center"
        aria-label="Следующая тема"
      >
        <ChevronRight className="w-4 h-4" />
      </button>

      {/* Content */}
      <div className="absolute bottom-0 left-0 right-0 p-5 flex items-end justify-between z-10">
        <div className="min-w-0">
          <p className="text-white/70 text-xs font-medium tracking-wide uppercase mb-0.5">
            {orgName || "Учебный центр"}
          </p>
          <h2 className="text-white font-bold text-lg sm:text-xl truncate">{greeting}</h2>
        </div>
        {logoUrl && (
          <img
            src={logoUrl}
            alt=""
            className="h-10 w-10 object-contain rounded-lg bg-white/90 p-1 shadow-md shrink-0"
          />
        )}
      </div>

      {/* Dot indicators */}
      <div className="absolute bottom-1.5 left-1/2 -translate-x-1/2 z-10 flex gap-1">
        {ADMIN_THEMES.map((t, i) => (
          <button
            key={t.id}
            onClick={() => applyTheme(i)}
            className={`w-1.5 h-1.5 rounded-full transition-all duration-300 ${
              i === currentIndex ? "bg-white scale-125" : "bg-white/40 hover:bg-white/60"
            }`}
            aria-label={t.label}
          />
        ))}
      </div>
    </div>
  );
}
