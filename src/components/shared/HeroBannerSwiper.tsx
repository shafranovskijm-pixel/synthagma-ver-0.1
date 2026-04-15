import { useState, useRef, useCallback, useEffect } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { ADMIN_THEMES, getStoredThemeId, getThemeById, storeThemeId } from "@/constants/admin-themes";

interface HeroBannerSwiperProps {
  /** Overlay content rendered on top of the banner (org info, greeting, etc.) */
  children?: React.ReactNode;
  className?: string;
}

/**
 * Swipeable hero banner that cycles through visual themes.
 * Desktop: left/right arrow buttons appear on hover.
 * Mobile: swipe gesture.
 * Used by admin, org, and student dashboards.
 */
export function HeroBannerSwiper({ children, className = "" }: HeroBannerSwiperProps) {
  const [currentIndex, setCurrentIndex] = useState(() => {
    const id = getStoredThemeId();
    const idx = ADMIN_THEMES.findIndex(t => t.id === id);
    return idx >= 0 ? idx : 0;
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

  // Sync with external theme changes (e.g. from ThemeSelector)
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

  return (
    <div
      className={`relative w-full h-36 lg:h-48 overflow-hidden select-none group ${className}`}
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

      {/* Arrow buttons — visible on hover (desktop) */}
      <button
        onClick={goPrev}
        className="absolute left-2 top-1/2 -translate-y-1/2 z-10 p-1.5 rounded-full bg-black/30 hover:bg-black/50 text-white/80 hover:text-white transition-all opacity-0 group-hover:opacity-100 hidden sm:flex items-center justify-center"
        aria-label="Предыдущая тема"
      >
        <ChevronLeft className="w-4 h-4" />
      </button>
      <button
        onClick={goNext}
        className="absolute right-2 top-1/2 -translate-y-1/2 z-10 p-1.5 rounded-full bg-black/30 hover:bg-black/50 text-white/80 hover:text-white transition-all opacity-0 group-hover:opacity-100 hidden sm:flex items-center justify-center"
        aria-label="Следующая тема"
      >
        <ChevronRight className="w-4 h-4" />
      </button>

      {/* Content overlay */}
      {children}

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
