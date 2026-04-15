import { useState, useEffect } from "react";
import { getStoredThemeId, getThemeById } from "@/constants/admin-themes";

interface Props {
  userName?: string | null;
  orgName?: string | null;
  logoUrl?: string | null;
}

const DEFAULT_BANNER = "https://images.unsplash.com/photo-1497366216548-37526070297c?w=1200&q=80";

export function StudentProfileBanner({ userName, orgName, logoUrl }: Props) {
  const [bannerUrl, setBannerUrl] = useState<string>(() => {
    const id = getStoredThemeId();
    return (id && getThemeById(id)?.bannerUrl) || DEFAULT_BANNER;
  });
  const [bannerPos, setBannerPos] = useState<string>(() => {
    const id = getStoredThemeId();
    return (id && getThemeById(id)?.bannerPosition) || "center";
  });

  useEffect(() => {
    const handler = (e: Event) => {
      const id = (e as CustomEvent).detail;
      const theme = id ? getThemeById(id) : null;
      setBannerUrl(theme?.bannerUrl || DEFAULT_BANNER);
      setBannerPos(theme?.bannerPosition || "center");
    };
    window.addEventListener("visual-theme-change", handler);
    return () => window.removeEventListener("visual-theme-change", handler);
  }, []);

  const greeting = userName ? `Добро пожаловать, ${userName.split(" ")[0]}!` : "Добро пожаловать!";

  return (
    <div
      className="relative h-36 sm:h-40 overflow-hidden"
      style={{
        backgroundImage: `url(${bannerUrl})`,
        backgroundSize: "cover",
        backgroundPosition: bannerPos,
      }}
    >
      <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/25 to-transparent" />
      <div className="absolute bottom-0 left-0 right-0 p-5 flex items-end justify-between">
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
    </div>
  );
}
