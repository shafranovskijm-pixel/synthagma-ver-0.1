import { cn } from "@/lib/utils";
import { useState, useEffect } from "react";
import { getStoredThemeId, getThemeById } from "@/constants/admin-themes";

interface OrgBannerProps {
  orgName: string | null;
  orgDescription?: string | null;
  coverUrl?: string;
  logoUrl?: string;
  primaryColor?: string;
  secondaryColor?: string;
}

export function OrgBanner({ orgName, orgDescription, coverUrl, logoUrl, primaryColor, secondaryColor }: OrgBannerProps) {
  const hasCustomColors = primaryColor && secondaryColor;

  // Theme-aware banner
  const [themeBannerUrl, setThemeBannerUrl] = useState<string | null>(() => {
    const id = getStoredThemeId();
    return id ? getThemeById(id)?.bannerUrl || null : null;
  });
  const [themeBannerPosition, setThemeBannerPosition] = useState<string | undefined>(() => {
    const id = getStoredThemeId();
    return id ? getThemeById(id)?.bannerPosition : undefined;
  });

  useEffect(() => {
    const handler = (e: Event) => {
      const id = (e as CustomEvent).detail;
      const theme = id ? getThemeById(id) : null;
      setThemeBannerUrl(theme?.bannerUrl || null);
      setThemeBannerPosition(theme?.bannerPosition);
    };
    window.addEventListener("visual-theme-change", handler);
    return () => window.removeEventListener("visual-theme-change", handler);
  }, []);

  const displayCover = themeBannerUrl || coverUrl;

  return (
    <div
      className={cn(
        "relative w-full rounded-2xl overflow-hidden",
        displayCover ? "h-44" : "h-36",
        !displayCover && !hasCustomColors && "bg-gradient-to-r from-primary via-accent to-primary/70"
      )}
      style={
        displayCover
          ? {
              backgroundImage: `url(${displayCover})`,
              backgroundSize: "cover",
              backgroundPosition: themeBannerUrl ? (themeBannerPosition || "center") : "center",
            }
          : hasCustomColors
            ? { background: `linear-gradient(135deg, ${primaryColor}, ${secondaryColor})` }
            : undefined
      }
    >
      <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/20 to-transparent" />
      <div className="absolute bottom-0 left-0 right-0 p-6 flex items-end gap-4">
        {logoUrl && (
          <img src={logoUrl} alt="Org" className="w-14 h-14 object-contain rounded-xl bg-white/90 p-1.5 shadow-lg shrink-0" />
        )}
        <div className="min-w-0">
          <h1 className="text-white font-bold text-xl md:text-2xl truncate">{orgName || "Учебный центр"}</h1>
          {orgDescription && <p className="text-white/80 text-sm mt-1 line-clamp-2">{orgDescription}</p>}
        </div>
      </div>
    </div>
  );
}
