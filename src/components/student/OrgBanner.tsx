import { cn } from "@/lib/utils";
import { useState, useEffect, useRef, useCallback } from "react";
import { ChevronLeft, ChevronRight, Clock, CheckCircle2 } from "lucide-react";
import { ADMIN_THEMES, getStoredThemeId, getThemeById, storeThemeId } from "@/constants/admin-themes";

interface OrgBannerProps {
  orgName: string | null;
  orgDescription?: string | null;
  coverUrl?: string;
  logoUrl?: string;
  primaryColor?: string;
  secondaryColor?: string;
  /** Progress stats to overlay */
  totalProgress?: number;
  totalTimeSpent?: number;
  totalCompletedLessons?: number;
  enrolledCount?: number;
  formatTime?: (m: number) => string;
}

export function OrgBanner({
  orgName, orgDescription, coverUrl, logoUrl, primaryColor, secondaryColor,
  totalProgress = 0, totalTimeSpent = 0, totalCompletedLessons = 0,
  enrolledCount = 0, formatTime = (m) => `${Math.floor(m / 60)}ч ${m % 60}м`,
}: OrgBannerProps) {
  const hasCustomColors = primaryColor && secondaryColor;

  // Theme swiper state
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
  const displayCover = current?.bannerUrl || coverUrl;
  const hasProgress = enrolledCount > 0;

  return (
    <div
      className={cn(
        "relative w-full rounded-2xl overflow-hidden select-none",
        hasProgress ? "h-48 md:h-52" : "h-36 md:h-44"
      )}
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
        style={
          displayCover
            ? {
                opacity: 1,
                backgroundImage: `url(${displayCover})`,
                backgroundSize: "cover",
                backgroundPosition: current?.bannerPosition || "center",
              }
            : hasCustomColors
              ? { opacity: 1, background: `linear-gradient(135deg, ${primaryColor}, ${secondaryColor})` }
              : undefined
        }
      />
      {!displayCover && !hasCustomColors && (
        <div className="absolute inset-0 bg-gradient-to-r from-primary via-accent to-primary/70" />
      )}

      {/* Gradient overlay */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/25 to-transparent" />

      {/* Arrow buttons */}
      <button
        onClick={goPrev}
        className="absolute left-2 top-1/2 -translate-y-1/2 z-10 p-1.5 rounded-full bg-black/30 hover:bg-black/50 text-white/80 hover:text-white transition-all flex items-center justify-center"
        aria-label="Предыдущая тема"
      >
        <ChevronLeft className="w-4 h-4" />
      </button>
      <button
        onClick={goNext}
        className="absolute right-2 top-1/2 -translate-y-1/2 z-10 p-1.5 rounded-full bg-black/30 hover:bg-black/50 text-white/80 hover:text-white transition-all flex items-center justify-center"
        aria-label="Следующая тема"
      >
        <ChevronRight className="w-4 h-4" />
      </button>

      {/* Content overlay */}
      <div className="absolute bottom-0 left-0 right-0 p-4 md:p-6 flex items-end justify-between gap-4 z-[1]">
        <div className="flex items-end gap-3 min-w-0 flex-1">
          {logoUrl && (
            <img src={logoUrl} alt="Org" className="w-12 h-12 md:w-14 md:h-14 object-contain rounded-xl bg-white/90 p-1.5 shadow-lg shrink-0" />
          )}
          <div className="min-w-0">
            <h1 className="text-white font-bold text-lg md:text-2xl truncate">{orgName || "Учебный центр"}</h1>
            {orgDescription && <p className="text-white/80 text-xs md:text-sm mt-0.5 line-clamp-1">{orgDescription}</p>}
            {hasProgress && (
              <div className="flex gap-3 md:gap-4 text-xs text-white/80 mt-1.5">
                <span>{enrolledCount} {enrolledCount === 1 ? "курс" : enrolledCount < 5 ? "курса" : "курсов"}</span>
                <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{formatTime(totalTimeSpent)}</span>
                <span className="flex items-center gap-1"><CheckCircle2 className="w-3 h-3" />{totalCompletedLessons} уроков</span>
              </div>
            )}
          </div>
        </div>

        {/* Progress circle */}
        {hasProgress && (
          <div className="relative w-14 h-14 md:w-18 md:h-18 shrink-0">
            <svg className="w-14 h-14 md:w-18 md:h-18 -rotate-90" viewBox="0 0 60 60">
              <circle cx="30" cy="30" r="24" fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="5" />
              <circle cx="30" cy="30" r="24" fill="none" stroke="white" strokeWidth="5"
                strokeDasharray={`${totalProgress * 1.508} 150.8`} strokeLinecap="round" />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center text-white text-sm md:text-base font-bold">{totalProgress}%</div>
          </div>
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
