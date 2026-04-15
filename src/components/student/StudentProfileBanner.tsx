import { HeroBannerSwiper } from "@/components/shared/HeroBannerSwiper";

interface Props {
  userName?: string | null;
  orgName?: string | null;
  logoUrl?: string | null;
}

export function StudentProfileBanner({ userName, orgName, logoUrl }: Props) {
  const greeting = userName ? `Добро пожаловать, ${userName.split(" ")[0]}!` : "Добро пожаловать!";

  return (
    <HeroBannerSwiper className="!h-36 sm:!h-40">
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
    </HeroBannerSwiper>
  );
}
